import path from "node:path";
import { inspectSubagentStatus } from "../../src/runs/background/run-status.ts";
import { DIRS } from "../../src/shared/types.ts";
import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import type { MockPi } from "../support/helpers.ts";
import { createMockPi, createTempDir, removeTempDir, events, tryImport } from "../support/helpers.ts";

interface ResultContent {
	text?: string;
}

interface SingleResultLike {
	agent?: string;
	exitCode?: number;
	finalOutput?: string;
	messages?: unknown[];
	toolCalls?: Array<{ text?: string; expandedText?: string }>;
	progress?: unknown;
}

interface ExecutorResult {
	isError?: boolean;
	content: ResultContent[];
	details?: {
		mode?: string;
		results?: SingleResultLike[];
	};
}

interface ExecutorModule {
	createSubagentExecutor?: (...args: unknown[]) => {
		execute: (
			id: string,
			params: Record<string, unknown>,
			signal: AbortSignal,
			onUpdate: ((result: unknown) => void) | undefined,
			ctx: unknown,
		) => Promise<ExecutorResult>;
	};
}

const executorMod = await tryImport<ExecutorModule>("./src/runs/foreground/subagent-executor.ts");
const available = !!executorMod?.createSubagentExecutor;
const createSubagentExecutor = executorMod?.createSubagentExecutor;

function makeState(cwd: string) {
	return {
		baseCwd: cwd,
		currentSessionId: null,
		asyncJobs: new Map(),
		foregroundRuns: new Map(),
		cleanupTimers: new Map(),
		lastUiContext: null,
		poller: null,
		completionSeen: new Map(),
		watcher: null,
		watcherRestartTimer: null,
		resultFileCoalescer: {
			schedule: () => false,
			clear: () => {},
		},
	};
}

function makeExecutor(cwd: string, state = makeState(cwd)) {
	return createSubagentExecutor!({
		pi: {
			events: { emit: () => {} },
			getSessionName: () => undefined,
			setSessionName: () => {},
		},
		state,
		config: {},
		asyncByDefault: false,
		tempArtifactsDir: cwd,
		getSubagentSessionRoot: () => cwd,
		expandTilde: (value: string) => value,
		discoverAgents: () => ({
			agents: [{ name: "tester", description: "Tool-heavy test agent" }],
		}),
	});
}

function makeCtx(cwd: string) {
	return {
		cwd,
		hasUI: false,
		ui: {},
		sessionManager: {
			getSessionId: () => "session-123",
			getSessionFile: () => null,
		},
		modelRegistry: { getAvailable: () => [] },
	};
}

function buildDockerNoiseChunk(step: number): string {
	const lines = [
		`[docker] step ${step}: loading build definition from Dockerfile.test`,
		`[docker] step ${step}: resolving image config for ghcr.io/example/service:${String(step % 7)}`,
		`[docker] step ${step}: copying layer sha256:${String(step).padStart(4, "0")}${"ab".repeat(24)}`,
		`[docker] step ${step}: running npm test -- --runInBand --reporter=dot`,
		`[docker] step ${step}: warning: retrying flaky network fetch for registry metadata`,
		`[docker] step ${step}: error: service container exited unexpectedly with code ${(step % 3) + 1}`,
		`[docker] step ${step}: stack: ${"Trace line with nested module resolution and container stdout noise ".repeat(8)}`,
		`[docker] step ${step}: stderr: ${"Build output and diagnostics ".repeat(16)}`,
	];
	return lines.join("\n");
}

describe("foreground result payload compaction", { skip: !available ? "subagent executor not importable" : undefined }, () => {
	let tempDir: string;
	let mockPi: MockPi;

	before(() => {
		mockPi = createMockPi();
		mockPi.install();
	});

	after(() => {
		mockPi.uninstall();
	});

	beforeEach(() => {
		tempDir = createTempDir("pi-subagent-payload-test-");
		mockPi.reset();
	});

	afterEach(() => {
		removeTempDir(tempDir);
	});

	it("keeps foreground single-run payloads compact after tool-heavy runs", async () => {
		const jsonl: unknown[] = [];
		jsonl.push({
			type: "message_end",
			message: {
				role: "assistant",
				content: [{
					type: "toolCall",
					name: "write",
					arguments: {
						path: "/tmp/huge-report.md",
						content: "x".repeat(50_000),
					},
				}],
				model: "mock/test-model",
				usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0, cost: { total: 0.001 } },
			},
		});
		jsonl.push(events.toolStart("write", { path: "/tmp/huge-report.md", content: "x".repeat(50_000) }));
		jsonl.push(events.toolResult("write", "ok"));
		jsonl.push(events.toolEnd("write"));
		for (let step = 0; step < 60; step++) {
			jsonl.push(events.toolStart("bash", {
				command: `docker compose run --rm api test-shard-${step} --retry --verbose`,
			}));
			jsonl.push(events.toolResult("bash", buildDockerNoiseChunk(step)));
			jsonl.push(events.toolEnd("bash"));
		}
		jsonl.push(events.assistantMessage("Finished the test sweep. Three failures reproduced, two were flaky, and the smallest fix is to retry the image bootstrap before the integration shard starts."));
		mockPi.onCall({ jsonl });

		const executor = makeExecutor(tempDir);
		const result = await executor.execute(
			"id",
			{ agent: "tester", task: "Run the full noisy test sweep", includeProgress: false },
			new AbortController().signal,
			undefined,
			makeCtx(tempDir),
		);

		assert.equal(result.isError, undefined);
		assert.equal(result.details?.mode, "single");
		assert.equal(result.details?.results?.length, 1);

		const displayText = result.content[0]?.text ?? "";
		assert.ok(displayText.length < 2_000, `expected small visible output, got ${displayText.length} bytes`);

		const step = result.details?.results?.[0];
		assert.equal(step?.exitCode, 0);
		assert.ok(step?.messages === undefined, "completed foreground results should not inline raw messages");
		assert.ok(step?.progress === undefined, "completed foreground results should not inline full progress objects");
		assert.ok(step?.toolCalls?.length, "completed foreground results should preserve compact tool-call summaries");
		assert.equal(step?.toolCalls?.[0]?.text, "write /tmp/huge-report.md");
		assert.equal(step?.toolCalls?.[0]?.expandedText, "write /tmp/huge-report.md");

		const payloadSize = JSON.stringify(result).length;
		assert.ok(payloadSize < 80_000, `expected compact foreground payload, got ${payloadSize} bytes`);
	});

	it("inlines the head of a long foreground output and names the file that holds all of it", async () => {
		const output = Array.from({ length: 200 }, (_, index) => `report line ${index} ${"x".repeat(40)}`).join("\n");
		mockPi.onCall({ jsonl: [events.assistantMessage(output)] });

		const result = await makeExecutor(tempDir).execute(
			"id",
			{ agent: "tester", task: "Write a long report" },
			new AbortController().signal,
			undefined,
			makeCtx(tempDir),
		);

		const text = result.content[0]?.text ?? "";
		assert.ok(text.includes(output.slice(0, 1_500)));
		assert.ok(!text.includes("report line 199"));
		const fullOutputPath = text.match(/\nFull output: (.+) \(\d+\.\d KB, 200 lines\)\. Read it if needed\./)?.[1];
		assert.ok(fullOutputPath, text.slice(-300));
		assert.ok(fs.readFileSync(fullOutputPath, "utf-8").includes(output));
	});

	it("caps a long foreground output saved to an explicit output file and keeps the saved-file line", async () => {
		const output = Array.from({ length: 200 }, (_, index) => `saved line ${index} ${"x".repeat(40)}`).join("\n");
		mockPi.onCall({ jsonl: [events.assistantMessage(output)] });

		const result = await makeExecutor(tempDir).execute(
			"id",
			{ agent: "tester", task: "Write a long report", output: "report.md" },
			new AbortController().signal,
			undefined,
			makeCtx(tempDir),
		);

		const text = result.content[0]?.text ?? "";
		assert.ok(text.includes(output.slice(0, 1_500)));
		assert.ok(!text.includes("saved line 199"), `expected a capped result, got ${text.length} chars`);
		const savedPath = text.match(/\nOutput saved to: (.+) \(\d+\.\d KB, 200 lines\)\. Read this file if needed\./)?.[1];
		assert.ok(savedPath, text.slice(-300));
		assert.ok(fs.readFileSync(savedPath, "utf-8").includes(output));
	});
	for (const saveAggregate of [false, true]) for (const failed of [false, true]) it(`bounds a 64-child workflow aggregate (${failed ? "failure" : "success"}, aggregate=${saveAggregate}) and retains all mappings`, async () => {
		for (let index = 0; index < 64; index++) mockPi.onCall({ output: "done" });
		const workflow = `const children = await runs.all(Array.from({ length: 64 }, (_, i) => ({ key: "child-" + i, agent: "tester", task: "Write your findings to: /requested/${"x".repeat(220)}-" + i + ".md", output: "child-" + i + ".md" }))); ${failed ? 'throw new Error("aggregate failure");' : 'return "done";'}`;
		const result = await makeExecutor(tempDir).execute("large-workflow", { workflowScript: workflow, async: false, output: saveAggregate ? `${tempDir}/aggregate.md` : false }, new AbortController().signal, undefined, makeCtx(tempDir));
		const text = result.content[0]?.text ?? "";
		assert.equal(Boolean(result.isError), failed);
		assert.ok(Buffer.byteLength(text, "utf8") <= 16384, `workflow response has ${Buffer.byteLength(text)} bytes; suffix=${text.slice(-250)}`);
		assert.match(text, /Status output truncated/);
		let file = text.match(/Full output: ([^\n]+)/)?.[1];
		if (!file) {
			const ledgerFile = text.match(/Full response metadata: ([^\n]+)/)?.[1];
			assert.ok(ledgerFile, text.slice(-800));
			const metadata = JSON.parse(fs.readFileSync(ledgerFile, "utf8")).verifiedMetadata as string[];
			file = metadata.find((line) => line.startsWith("Full output: "))?.slice("Full output: ".length);
		}
		assert.ok(file, text.slice(-800));
		const retained = fs.readFileSync(file, "utf8");
		assert.match(retained, /Output path mappings:/);
		assert.ok(retained.includes("child-63"));
		assert.ok(retained.includes("x".repeat(220) + "-63.md"));
	});
	for (const value of ["x", "世界😀"]) for (const id of [undefined, "missing-transcript-run"]) it(`bounds malformed transcript target/error (multibyte=${value !== "x"}, id=${Boolean(id)})`, async () => {
		const result = await makeExecutor(tempDir).execute("oversized-transcript-target", { action: "status", view: "transcript", dir: DIRS.async + "/" + value.repeat(50000), ...(id ? { id } : {}) }, new AbortController().signal, undefined, makeCtx(tempDir));
		const text = result.content[0]?.text ?? "";
		assert.equal(result.isError, true);
		assert.ok(Buffer.byteLength(text, "utf8") <= 16384, `${Buffer.byteLength(text)} bytes`);
		assert.match(text, /^Transcript target:/);
		assert.match(text, /Status file not found|does not match|Unable to resolve|No run found/);
		assert.doesNotMatch(text, /\uFFFD/u);
	});
	for (const source of ["memory", "artifact"]) for (const value of ["x", "世界😀"]) for (const many of [false, true]) it(`bounds remembered foreground transcript (${source}, multibyte=${value !== "x"}, many=${many})`, async () => {
		const output = many
			? Array.from({ length: 100 }, (_, i) => `entry-${i}: ${value.repeat(300)}`).concat("huge: " + value.repeat(100000), "latest context").join("\n")
			: "single: " + value.repeat(100000);
		const file = path.join(tempDir, "remembered-output.md");
		if (source === "artifact") fs.writeFileSync(file, output);
		const state = makeState(tempDir);
		state.foregroundRuns.set("remembered-budget", { runId: "remembered-budget", mode: "single", cwd: tempDir, sessionId: "session-123", updatedAt: Date.now(), children: [{ agent: "tester", index: 0, status: "completed", finalOutput: source === "memory" ? output : "stale cached output", ...(source === "artifact" ? { artifactPaths: { outputPath: file } } : {}) }] });
		const result = await makeExecutor(tempDir, state).execute("remembered-transcript-budget", { action: "status", id: "remembered-budget", view: "transcript", lines: 500 }, new AbortController().signal, undefined, makeCtx(tempDir));
		assert.equal(result.isError, undefined);
		const text = result.content[0]?.text ?? "";
		const body = text.split("Result transcript tail:\n")[1];
		assert.ok(body);
		assert.ok(Buffer.byteLength(body) <= 32768, `${Buffer.byteLength(body)} bytes`);
		assert.ok(body.split("\n").every((line) => line.length <= 2002));
		assert.match(body, /content omitted/);
		assert.doesNotMatch(body, /[\uD800-\uDFFF]|\uFFFD/u);
		if (many) { assert.ok(Buffer.byteLength(body) > 16384); assert.ok(body.endsWith("latest context")); assert.match(body, /earlier lines omitted/); }
		if (source === "artifact") { assert.ok(text.includes(file)); assert.equal(fs.readFileSync(file, "utf8"), output); assert.doesNotMatch(body, /stale cached output/); }
	});
	it("preserves the successful 32 KiB transcript body through the executor", async () => {
		fs.mkdirSync(DIRS.async, { recursive: true });
		const dir = fs.mkdtempSync(path.join(DIRS.async, "transcript-body-"));
		try {
			fs.writeFileSync(path.join(dir, "status.json"), JSON.stringify({ runId: path.basename(dir), sessionId: "session-123", mode: "single", state: "complete", steps: [{ agent: "tester", status: "complete" }] }));
			const output = Array.from({ length: 100 }, (_, i) => `entry-${i}: ${"世界😀".repeat(80)}`).concat("latest context").join("\n");
			fs.writeFileSync(path.join(dir, "output-0.log"), output);
			const reference = inspectSubagentStatus({ dir, view: "transcript", lines: 500 }).content[0];
			assert.ok(reference?.type === "text");
			const body = reference.text.split(/Transcript tail from .*:\n/)[1];
			assert.ok(body);
			assert.ok(Buffer.byteLength(body) > 16384 && Buffer.byteLength(body) <= 32768);
			const result = await makeExecutor(tempDir).execute("successful-transcript-budget", { action: "status", view: "transcript", dir, lines: 500 }, new AbortController().signal, undefined, makeCtx(tempDir));
			assert.equal(result.isError, undefined);
			assert.ok(result.content[0]?.text?.includes(reference.text));
			assert.ok(body.endsWith("latest context"));
			assert.equal(fs.readFileSync(path.join(dir, "output-0.log"), "utf8"), output);
		} finally { fs.rmSync(dir, { recursive: true, force: true }); }
	});
});
