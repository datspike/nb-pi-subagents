import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { buildInProcessChildLaunch } from "../../src/runs/shared/child-launch.ts";
import { ensureSessionIndexPolicy, resolveSessionIndexPolicy, sessionIndexPolicyEnv } from "../../src/runs/shared/session-index-policy.ts";

const policy = resolveSessionIndexPolicy("reviewer");

test("resolves only reviewer by default and leaves worker/scout indexable", () => {
	assert.deepEqual(policy, { reason: "review", source: "pi-subagents" });
	assert.equal(resolveSessionIndexPolicy("worker"), undefined);
	assert.equal(resolveSessionIndexPolicy("scout"), undefined);
	assert.deepEqual(resolveSessionIndexPolicy("worker", { reason: "eval", source: "eval-session-marker" }), { reason: "eval", source: "eval-session-marker" });
});

test("launch boundary gives explicit eval precedence over generic reviewer", () => {
	const base = { host: "parent" as const, cwd: process.cwd(), childIndex: 0, sessionEnabled: false, inheritProjectContext: false, inheritGlobalContext: false, inheritSkills: false };
	assert.deepEqual(buildInProcessChildLaunch({ ...base, childAgentName: "reviewer" }).session.sessionIndexPolicy, { reason: "review", source: "pi-subagents" });
	assert.deepEqual(buildInProcessChildLaunch({ ...base, childAgentName: "reviewer", sessionIndexPolicy: { reason: "eval", source: "eval-session-marker" } }).session.sessionIndexPolicy, { reason: "eval", source: "eval-session-marker" });
	const evalLaunch = buildInProcessChildLaunch({ ...base, childAgentName: "reviewer", subagentOnlyExtensions: ["/eval-session-marker/extension/marker.ts"], sessionIndexPolicy: { reason: "eval", source: "eval-session-marker" } });
	assert.deepEqual(evalLaunch.session.extensionPaths, ["/eval-session-marker/extension/marker.ts"]);
	assert.equal(buildInProcessChildLaunch({ ...base, childAgentName: "worker" }).session.sessionIndexPolicy, undefined);
});

test("writes the marker through the real SDK SessionManager before lifecycle", () => {
	const manager = SessionManager.inMemory(process.cwd());
	ensureSessionIndexPolicy(manager, policy);
	ensureSessionIndexPolicy(manager, policy);
	const entries = manager.getEntries().filter((entry) => entry.type === "custom" && entry.customType === "session-index-policy");
	assert.equal(entries.length, 1);
	assert.deepEqual((entries[0] as { data?: unknown }).data, { version: 1, policy: "exclude", reason: "review", source: "pi-subagents", session_id: manager.getSessionId() });
});

test("flushes a persisted marker to JSONL before model lifecycle", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-session-index-policy-"));
	try {
		const manager = SessionManager.create(process.cwd(), root);
		ensureSessionIndexPolicy(manager, policy);
		const file = manager.getSessionFile();
		assert.ok(file && fs.existsSync(file));
		const records = fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
		assert.equal(records[0]?.type, "session");
		assert.equal(records[1]?.customType, "session-index-policy");
		assert.deepEqual(records[1]?.data, { version: 1, policy: "exclude", reason: "review", source: "pi-subagents", session_id: manager.getSessionId() });
		manager.appendModelChange("fixture", "fixture");
		manager.appendMessage({ role: "user", content: "fixture user", timestamp: Date.now() });
		manager.appendMessage({ role: "assistant", content: [{ type: "text", text: "fixture assistant" }], api: "openai-responses", provider: "fixture", model: "fixture", usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }, stopReason: "stop", timestamp: Date.now() });
		const persisted = fs.readFileSync(file, "utf8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
		assert.equal(persisted.filter((entry) => entry.type === "session").length, 1);
		assert.equal(persisted.filter((entry) => entry.customType === "session-index-policy").length, 1);
		assert.equal(persisted.length, 5);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("rejects a conflicting resume marker and exports subprocess env only", () => {
	const manager = SessionManager.inMemory(process.cwd());
	ensureSessionIndexPolicy(manager, policy);
	assert.throws(() => ensureSessionIndexPolicy(manager, { reason: "eval", source: "eval-session-marker" }), /conflict/);
	assert.deepEqual(sessionIndexPolicyEnv(policy), {
		PI_SESSION_INDEX_POLICY: "exclude",
		PI_SESSION_INDEX_REASON: "review",
		PI_SESSION_INDEX_SOURCE: "pi-subagents",
	});
	assert.equal(sessionIndexPolicyEnv(undefined), undefined);
});
