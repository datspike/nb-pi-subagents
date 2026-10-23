import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import type { Model } from "@earendil-works/pi-ai";
import { streamSimple as responses } from "@earendil-works/pi-ai/api/openai-responses";
import * as codingAgent from "@earendil-works/pi-coding-agent";
import { buildInProcessChildLaunch } from "../../src/runs/shared/child-launch.ts";
import { createDefaultChildSessionFactory } from "../../src/runs/shared/child-session.ts";
import { registerPromptTemplateDelegationBridge } from "../../src/slash/prompt-template-bridge.ts";

type Handler = (payload: unknown) => void;

class EventBus {
	private readonly handlers = new Map<string, Handler[]>();
	readonly requests: Record<string, unknown>[] = [];

	on(event: string, handler: Handler): () => void {
		const handlers = this.handlers.get(event) ?? [];
		handlers.push(handler);
		this.handlers.set(event, handlers);
		return () => this.handlers.set(event, (this.handlers.get(event) ?? []).filter((entry) => entry !== handler));
	}

	emit(event: string, payload: Record<string, unknown>): void {
		if (event === "prompt-template:subagent:request") this.requests.push(payload);
		for (const handler of [...(this.handlers.get(event) ?? [])]) handler(payload);
	}
}

function fixtureResponse(): Response {
	const text = "synthetic child result";
	const item = { type: "message", id: "fixture-message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
	const events = [
		{ type: "response.output_item.added", output_index: 0, item: { ...item, status: "in_progress", content: [] } },
		{ type: "response.content_part.added", item_id: item.id, output_index: 0, content_index: 0, part: { type: "output_text", text: "", annotations: [] } },
		{ type: "response.output_text.delta", item_id: item.id, output_index: 0, content_index: 0, delta: text },
		{ type: "response.output_item.done", output_index: 0, item },
		{ type: "response.completed", response: { id: "fixture-response", status: "completed", output: [item], usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 } } },
	];
	return new Response(events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
}

test("real eval-role-dispatch reaches a child provider only after policy JSONL readback", async () => {
	const recallRoot = process.env.PI_RECALL_SOURCE ?? "/home/spike/hobby/pi-recall";
	const { createEvalContract } = await import(pathToFileURL(path.join(recallRoot, "src/eval/contract.ts")).href);
	const roleDispatch = await import(pathToFileURL(path.join(recallRoot, "src/eval/role-dispatch.ts")).href);
	const markerPath = path.join(recallRoot, "src/eval/marker.ts");
	assert.equal(fs.existsSync(markerPath), true);

	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-session-policy-live-"));
	const profile = path.join(root, "profile");
	fs.mkdirSync(profile);
	const promptFile = path.join(root, "prompt.txt");
	const contractFile = path.join(root, "contract.json");
	const dispatchReceiptFile = path.join(root, "dispatch-receipt.json");
	fs.writeFileSync(promptFile, "Review the synthetic child task.");
	const contract = createEvalContract({
		project: "session-policy-live",
		run_id: "live-run",
		trial_id: "live-trial",
		role: "worker",
		run_root: root,
		prompt_file: promptFile,
		receipt_file: path.join(root, "eval-receipt.json"),
		provider: "fixture",
		model: "fixture",
		thinking: "off",
		extension_paths: [markerPath],
		child_extension_paths: [markerPath],
		prompt: "Review the synthetic child task.",
	});
	fs.writeFileSync(contractFile, JSON.stringify(contract));

	const previousEnv = Object.fromEntries(["PI_EVAL_SESSION_CONTRACT", "PI_EVAL_DISPATCH_RECEIPT", "PI_EVAL_LOADED_EXTENSIONS_FILE"].map((key) => [key, process.env[key]]));
	process.env.PI_EVAL_SESSION_CONTRACT = contractFile;
	process.env.PI_EVAL_DISPATCH_RECEIPT = dispatchReceiptFile;
	delete process.env.PI_EVAL_LOADED_EXTENSIONS_FILE;

	let childSessionFile: string | undefined;
	let childSessionId: string | undefined;
	let providerRequests = 0;
	let childFactory: ReturnType<typeof createDefaultChildSessionFactory> | undefined;
	try {
		const runtime = await codingAgent.ModelRuntime.create({ authPath: path.join(profile, "auth.json"), modelsPath: path.join(profile, "models.json") });
		runtime.registerProvider("fixture", {
			api: "openai-responses",
			apiKey: "synthetic",
			baseUrl: "https://fixture.invalid/v1",
			models: [{ id: "fixture", name: "Fixture", reasoning: false, input: ["text"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 272_000, maxTokens: 4096 }],
			streamSimple: (model, context, options) => {
				providerRequests += 1;
				assert.ok(childSessionFile);
				const records = fs.readFileSync(childSessionFile, "utf-8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
				const policyIndex = records.findIndex((entry) => entry.type === "custom" && entry.customType === "session-index-policy");
				const firstMessageIndex = records.findIndex((entry) => entry.type === "message");
				assert.ok(policyIndex >= 0, "policy must be present before the provider request");
				assert.ok(firstMessageIndex < 0 || policyIndex < firstMessageIndex, "policy must precede the first model message");
				assert.equal((records[policyIndex]?.data as { session_id?: string }).session_id, childSessionId);
				return responses(model as Model<"openai-responses">, context, { ...options, apiKey: "synthetic" });
			},
		});
		const wrappedPi = { ...codingAgent, ModelRuntime: { create: async () => runtime } } as typeof codingAgent;
		childFactory = createDefaultChildSessionFactory({ loadPiCodingAgent: async () => wrappedPi });

		const events = new EventBus();
		let command: { handler: (args: string, ctx: { shutdown: () => void }) => Promise<void> } | undefined;
		let shutdown = false;
		const pi = {
			registerCommand(_name: string, definition: typeof command extends { handler: infer HandlerType } ? { handler: HandlerType } : never) { command = definition as typeof command; },
			events,
		};
		roleDispatch.default(pi);
		registerPromptTemplateDelegationBridge({
			events,
			getContext: () => ({ cwd: root }),
			execute: async () => { throw new Error("legacy delegation must not run"); },
			executeStructured: async (_id, params) => {
				const input = params as { agent: string; model: string; task: string; subagentOnlyExtensions?: string[]; sessionIndexPolicy?: { reason: "eval"; source: "eval-session-marker" } };
				const launch = buildInProcessChildLaunch({
					host: "parent",
					cwd: root,
					childAgentName: input.agent,
					childIndex: 0,
					sessionEnabled: true,
					sessionDir: path.join(root, "sessions"),
					inheritProjectContext: false,
					inheritGlobalContext: false,
					inheritSkills: false,
					model: input.model,
					subagentOnlyExtensions: input.subagentOnlyExtensions,
					sessionIndexPolicy: input.sessionIndexPolicy,
					tools: [],
				});
				launch.session.processEnv = { ...launch.session.processEnv, PI_EVAL_SESSION_CONTRACT: contractFile };
				const child = await childFactory!.create(launch.session);
				childSessionFile = child.sessionFile;
				childSessionId = child.sessionId;
				try {
					await child.prompt(input.task);
					return { details: { mode: "single", runId: "live-child-run", results: [{ agent: input.agent, exitCode: 0, model: input.model, thinking: "off", finalOutput: "synthetic child result", usage: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 } }] } };
				} finally {
					await child.dispose();
				}
			},
		});

		await command!.handler("", { shutdown() { shutdown = true; } });
		assert.equal(shutdown, true);
		assert.equal(providerRequests > 0, true);
		assert.deepEqual(events.requests[0]?.subagentOnlyExtensions, [markerPath]);
		assert.deepEqual(events.requests[0]?.sessionIndexPolicy, { reason: "eval", source: "eval-session-marker" });
		const receipt = JSON.parse(fs.readFileSync(dispatchReceiptFile, "utf-8")) as Record<string, unknown>;
		assert.equal(receipt.status, "completed");
		assert.equal((receipt.usage as { totalTokens: number }).totalTokens, 3);
		const records = fs.readFileSync(childSessionFile!, "utf-8").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
		assert.equal(records.filter((entry) => entry.customType === "session-index-policy").length, 1);
		assert.equal(records.filter((entry) => entry.customType === "eval-session").length, 1);
	} finally {
		await childFactory?.dispose();
		for (const [key, value] of Object.entries(previousEnv)) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
		fs.rmSync(root, { recursive: true, force: true });
	}
});
