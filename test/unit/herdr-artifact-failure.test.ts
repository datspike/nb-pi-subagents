import { syncBuiltinESMExports } from "node:module";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it, mock } from "node:test";
import { runSingleStepInner } from "../../src/runs/background/subagent-runner.ts";
import { HerdrPlacedRunOwner } from "../../src/runs/shared/herdr-placed-run.ts";
import { HerdrExternalSession } from "../../src/runs/shared/herdr-external-adapters.ts";
import { getArtifactPaths } from "../../src/shared/artifacts.ts";
import { verifiedResultOutputArtifact } from "../../src/runs/shared/result-persistence.ts";

it("machine external artifact failure never verifies a stale regular file", async () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "herdr-artifact-failure-"));
	const files = getArtifactPaths(root, "run", "probe");
	fs.writeFileSync(files.outputPath, "STALE_NOT_CURRENT");
	const write = fs.writeFileSync;
	try {
		mock.method(HerdrPlacedRunOwner, "create", async () => ({
			runtimeDir: "/tmp/pi-subagents-herdr-run", identity: { runId: "run" }, connection: { endpoint: { session: null } },
			async provision() { return { workspaceId: "w", tabId: "t", paneId: "p" }; }, async subscribe() {},
			async start(kind: string, _name: string, args: string[]) { return { argv: [kind, ...args], terminalId: "term" }; },
			journal() {}, async cleanup() {},
		}));
		mock.method(HerdrExternalSession.prototype, "promptAndSettle", async () => ({ output: "CURRENT_OUTPUT", settlement: "partial", outcome: "partial" }));
		mock.method(HerdrExternalSession.prototype, "retain", async () => {});
		mock.method(fs, "writeFileSync", (...args: Parameters<typeof fs.writeFileSync>) => {
			if (String(args[0]) === files.outputPath) throw new Error("fixture artifact persistence failed");
			return write(...args);
		});
		syncBuiltinESMExports();
		const result = await runSingleStepInner({ agent: "probe", task: "fixture", runner: { type: "external-cli", adapter: "claude-code", command: "claude", args: [] }, machine: { provider: "herdr", id: "fixture", target: "must-not-connect", cwd: root } } as never,
			{ id: "run", placeholder: "{previous}", previousOutput: "", flatIndex: 0, flatStepCount: 1, cwd: root, outputFile: path.join(root, "live-output"), artifactsDir: root, artifactConfig: { includeInput: false, includeTranscript: false } } as never);
		assert.match(result.output, /CURRENT_OUTPUT/); assert.match(result.outputSaveError ?? "", /fixture artifact persistence failed/);
		assert.equal(result.artifactOutputSaveFailed, true); assert.equal(verifiedResultOutputArtifact(result), undefined);
		assert.equal(fs.readFileSync(files.outputPath, "utf8"), "STALE_NOT_CURRENT");
	} finally { mock.restoreAll(); syncBuiltinESMExports(); fs.rmSync(root, { recursive: true, force: true }); }
});
