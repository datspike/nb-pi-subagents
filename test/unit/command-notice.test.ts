import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { afterEach, describe, it } from "node:test";
import { createBashToolDefinition, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { DIRS, type ControlEvent, type SubagentState } from "../../src/shared/types.ts";
import { buildControlEvent, formatControlNoticeMessage, formatControlIntercomMessage } from "../../src/runs/shared/subagent-control.ts";
import { commandNoticeOperations, resolveCommandNoticeOperations } from "../../src/runs/shared/command-notice.ts";
import { createChildCommandRuntime, controlChildCommand, readChildCommandState, type ChildCommandState } from "../../src/runs/shared/child-commands.ts";
import { supervisorChannelDir } from "../../src/runs/shared/child-tool-plan.ts";
import { currentPidNamespaceScope } from "../../src/runs/background/pid-namespace.ts";

const owned = new Set<string>();
afterEach(() => { for (const dir of owned) fs.rmSync(dir, { recursive: true, force: true }); owned.clear(); });
function fixture() {
	const id = `notice-${randomUUID()}`;
	const event = buildControlEvent({ to: "needs_attention", runId: id, agent: "worker", index: 0, reason: "tool_open_threshold", currentTool: "bash", toolCallId: "selected" });
	const channel = supervisorChannelDir(id, "worker", 0);
	owned.add(channel);
	const snapshot: ChildCommandState = { ownerId: "native-owner", closed: false, commands: [{ toolCallId: "selected", state: "running", startedAt: 200, output: "" }] };
	// SAFETY: This fixture supplies every state field read by the notice resolver and direct command route.
	const state = { currentSessionId: "session", foregroundControls: new Map(), foregroundRuns: new Map(), asyncJobs: new Map() } as SubagentState;
	state.foregroundControls.set(id, { runId: id, sessionId: "session", mode: "single", startedAt: 100, updatedAt: 100,
		activeChildren: new Map([[0, { index: 0, agent: "worker", startedAt: 100, updatedAt: 100, interrupt: () => true }]]) });
	const save = () => { fs.mkdirSync(channel, { recursive: true }); fs.writeFileSync(path.join(channel, "commands.json"), JSON.stringify(snapshot)); };
	return { id, event, channel, snapshot, state, save };
}

describe("command notice availability", () => {
	for (const [phase, operations] of [
		["running", ["status", "yield", "cancel"]], ["yielded", ["status", "cancel"]],
		["cancel_requested", ["status"]], ["completed", ["status"]], ["failed", ["status"]], ["cancelled", ["status"]],
	] as const) {
		it(`selects useful operations for ${phase}, closed and orphaned controllers`, () => {
			const { snapshot } = fixture();
			snapshot.commands[0].state = phase;
			assert.deepEqual(commandNoticeOperations(snapshot, "selected", true), operations);
			assert.deepEqual(commandNoticeOperations(snapshot, "selected", false), []);
			snapshot.closed = true;
			assert.deepEqual(commandNoticeOperations(snapshot, "selected", false), ["status"]);
			assert.deepEqual(commandNoticeOperations(snapshot, "unknown", true), []);
		});
	}
	it("does not infer tools or a controller from a bash event alone", () => {
		const f = fixture();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
		f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), ["status", "yield", "cancel"]);
		assert.deepEqual(commandNoticeOperations(undefined, "selected", true), []);
		// SAFETY: The malformed domain value intentionally exercises the snapshot boundary validator.
		assert.deepEqual(commandNoticeOperations({} as ChildCommandState, "selected", true), []);
	});
	it("requires an exact owned address, command id and unambiguous index", () => {
		const f = fixture(); f.save();
		for (const override of [{ agent: "reviewer" }, { index: 1 }, { index: undefined }, { toolCallId: "other" }, { toolCallId: undefined }, { runId: f.id.slice(0, -5) }, { nestedRunId: "nested" }, { nestingPath: [f.id] }]) {
			// SAFETY: Deliberately invalid routing fields exercise fail-closed handling rather than typed event production.
			assert.deepEqual(resolveCommandNoticeOperations({ ...f.event, ...override } as ControlEvent, { state: f.state }), []);
		}
		f.state.currentSessionId = "foreign";
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
		f.state.currentSessionId = "session";
		f.state.foregroundControls.get(f.id)!.activeChildren!.set(1, { index: 1, agent: "worker", startedAt: 100, updatedAt: 100 });
		assert.deepEqual(resolveCommandNoticeOperations({ ...f.event, index: undefined }, { state: f.state }), []);
	});
	it("does not reuse an earlier owner's open snapshot for a resumed foreground child", () => {
		const f = fixture(); f.save();
		f.state.foregroundControls.get(f.id)!.activeChildren!.get(0)!.startedAt = 300;
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
		f.snapshot.closed = true; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), ["status"]);
	});
	it("does not advertise a later owner's reused call id for an earlier notice", () => {
		const f = fixture(); f.event.ts = 250; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), ["status", "yield", "cancel"]);
		f.state.foregroundControls.get(f.id)!.activeChildren!.get(0)!.startedAt = 300;
		f.snapshot.ownerId = "replacement-owner"; f.snapshot.commands[0].startedAt = 400; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
		f.snapshot.closed = true; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
	});
	it("withholds ambiguous equal-timestamp hints without suppressing a later current-owner notice", () => {
		const f = fixture(); f.event.ts = 300;
		f.state.foregroundControls.get(f.id)!.activeChildren!.get(0)!.startedAt = 300;
		f.snapshot.ownerId = "replacement-owner"; f.snapshot.commands[0].startedAt = 300; f.save();
		const actor = { runId: f.id, index: 0, agent: "worker", startedAt: 300, live: true };
		for (const context of [{ state: f.state }, { actor }]) {
			assert.deepEqual(resolveCommandNoticeOperations(f.event, context), []);
			const notice = formatControlNoticeMessage(f.event, undefined, resolveCommandNoticeOperations(f.event, context));
			assert.match(notice, /Status:/); assert.match(notice, /Transcript:/);
			assert.doesNotMatch(notice, /"action":"command\./);
			assert.deepEqual(resolveCommandNoticeOperations({ ...f.event, ts: 301 }, context), ["status", "yield", "cancel"]);
		}
		f.snapshot.closed = true; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
		assert.deepEqual(resolveCommandNoticeOperations({ ...f.event, ts: 301 }, { state: f.state }), ["status"]);
	});
	it("keeps closed status for a retained child without a live callback", () => {
		const f = fixture(); f.snapshot.closed = true; f.save();
		const active = f.state.foregroundControls.get(f.id)!;
		delete active.activeChildren!.get(0)!.interrupt;
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), ["status"]);
		f.snapshot.closed = false; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
	});
	it("binds an emitting runner to its own exact run and child, not its workflow envelope", () => {
		const f = fixture(); f.save();
		const actor = { runId: f.id, index: 0, agent: "worker", startedAt: 100, live: true };
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { actor }), ["status", "yield", "cancel"]);
		for (const override of [{ runId: "outer-workflow" }, { agent: "reviewer" }, { index: 1 }, { startedAt: 300 }, { live: false }]) {
			assert.deepEqual(resolveCommandNoticeOperations(f.event, { actor: { ...actor, ...override } }), []);
		}
	});
	it("requires a living PID in the owning async runner's namespace", () => {
		const f = fixture(); f.save(); f.state.foregroundControls.clear();
		const dir = path.join(DIRS.async, f.id); owned.add(dir); fs.mkdirSync(dir, { recursive: true });
		const status = { runId: f.id, sessionId: "session", state: "running", startedAt: 100, pid: process.pid, pidNamespaceScope: currentPidNamespaceScope(), steps: [{ agent: "worker", status: "running", startedAt: 100 }] };
		const saveStatus = () => fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify(status));
		saveStatus();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), ["status", "yield", "cancel"]);
		for (const code of ["ESRCH", "EPERM"]) {
			assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state, kill: () => { throw Object.assign(new Error(code), { code }); } }), []);
		}
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state, pidNamespaceScope: () => "different-namespace" }), []);
		status.state = "completed"; saveStatus();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
		f.snapshot.closed = true; f.save();
		assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), ["status"]);
	});
	it("fails closed on corrupt/missing command data without writing IPC files", () => {
		const f = fixture(); f.save();
		for (const contents of ["{", "null", JSON.stringify({ ...f.snapshot, commands: {} }), JSON.stringify({ ...f.snapshot, ownerId: "" })]) {
			fs.writeFileSync(path.join(f.channel, "commands.json"), contents);
			assert.deepEqual(resolveCommandNoticeOperations(f.event, { state: f.state }), []);
			const message = formatControlNoticeMessage(f.event, undefined, resolveCommandNoticeOperations(f.event, { state: f.state }));
			assert.match(message, /Transcript:/);
			assert.doesNotMatch(message, /"action":"command\./);
			assert.deepEqual(fs.readdirSync(f.channel), ["commands.json"]);
		}
	});
	it("formats both channels from the same verified operations, with safe defaults", () => {
		const f = fixture();
		for (const operations of [[], ["status"], ["status", "cancel"], ["status", "yield", "cancel"]] as const) {
			const notice = formatControlNoticeMessage(f.event, undefined, operations);
			assert.ok(formatControlIntercomMessage(f.event, undefined, operations).endsWith(notice));
			for (const operation of ["status", "yield", "cancel"] as const) {
				assert.equal(notice.includes(`"action":"command.${operation}"`), operations.some((candidate) => candidate === operation));
			}
		}
		assert.doesNotMatch(formatControlNoticeMessage(f.event), /"action":"command\./);
	});
	it("observes real Pi bash state while targeted yield/cancel preserves a sibling command", async () => {
		const f = fixture();
		const runtime = createChildCommandRuntime(f.channel);
		const tool = runtime.wrap(createBashToolDefinition(process.cwd()));
		// SAFETY: Only these session-manager methods are consumed by the native bash runtime in this non-provider test.
		const ctx = { sessionManager: { getSessionId: () => "session", getSessionFile: () => undefined } } as ExtensionContext;
		const actor = { runId: f.id, index: 0, agent: "worker", startedAt: Date.now(), live: true };
		const pending = tool.execute("selected", { command: "sleep 10" }, undefined, undefined, ctx).catch(() => undefined);
		try {
			await tool.execute("sibling", { command: "sleep 10", yieldTimeMs: 0 }, undefined, undefined, ctx);
			f.event.ts = Date.now();
			assert.deepEqual(resolveCommandNoticeOperations(f.event, { actor }), ["status", "yield", "cancel"]);
			await controlChildCommand(f.channel, "yield", "selected"); await pending;
			assert.deepEqual(resolveCommandNoticeOperations(f.event, { actor }), ["status", "cancel"]);
			await controlChildCommand(f.channel, "cancel", "selected");
			assert.equal(readChildCommandState(f.channel)?.commands.find((command) => command.toolCallId === "sibling")?.state, "yielded");
			await runtime.shutdown();
			assert.deepEqual(resolveCommandNoticeOperations(f.event, { actor: { ...actor, live: false } }), ["status"]);
		} finally { await runtime.shutdown(); await pending; }
	});
});
