import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";
import { buildEffectiveSystemPrompt } from "../../src/runs/shared/effective-system-prompt.ts";
import type { AgentConfig } from "../../src/agents/agents.ts";
import { handleRefinementAction } from "../../src/agents/agent-refinements.ts";

function fixture() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-effective-prompt-trust-"));
	fs.mkdirSync(path.join(root, ".git"));
	const memory = path.join(root, ".pi", "agent-memory", "probe"); fs.mkdirSync(memory, { recursive: true });
	fs.writeFileSync(path.join(memory, "MEMORY.md"), "PROJECT_MEMORY_UNTRUSTED");
	const overlay = path.join(root, ".pi", "subagents", "refinements", "probe.md"); fs.mkdirSync(path.dirname(overlay), { recursive: true });
	fs.writeFileSync(overlay, `<!-- pi-subagents-refinement:v1\n${JSON.stringify({ agent: "probe", revision: 1, updatedAt: new Date().toISOString(), base: { source: "user", filePath: "probe.md", systemPromptSha256: "abc" }, evidence: {} })}\n-->\n\n\`\`\`pi-subagents-refinement-current\nPROJECT_REFINEMENT_UNTRUSTED\n\`\`\`\n\n\`\`\`pi-subagents-refinement-snapshots-json\n[]\n\`\`\`\n`);
	return { root, overlay };
}

it("denied local prompts exclude project memory/refinement and retain the trusted base", () => {
	const { root } = fixture();
	try {
		const agent = { name: "probe", systemPrompt: "USER_BASE", memory: { scope: "project", path: "probe" } } as AgentConfig;
		const input = { agent, cwd: root, resolvedSkills: [] };
		const trusted = buildEffectiveSystemPrompt(input);
		assert.match(trusted, /PROJECT_MEMORY_UNTRUSTED/); assert.match(trusted, /PROJECT_REFINEMENT_UNTRUSTED/);
		const denied = buildEffectiveSystemPrompt({ ...input, projectTrusted: false });
		assert.equal(denied, "USER_BASE");
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

for (const action of ["refine", "refine.show", "refine.rollback"] as const) it(`denied ${action} does not read or change the project overlay`, async () => {
	const { root, overlay } = fixture();
	try {
		const before = fs.readFileSync(overlay), stat = fs.statSync(overlay);
		let modelCalls = 0;
		const response = await handleRefinementAction(action, { agent: "probe" }, { cwd: root, projectTrusted: false, state: {} as never, pi: {} as never, runModel: async () => { modelCalls++; throw new Error("must not run"); } } as never);
		assert.equal(response.isError, true); const text = response.content.map((item) => item.type === "text" ? item.text : "").join("\n");
		assert.match(text, /Project trust is required/); assert.doesNotMatch(text, /PROJECT_REFINEMENT_UNTRUSTED|Path:/);
		assert.equal(modelCalls, 0); assert.deepEqual(fs.readFileSync(overlay), before); assert.equal(fs.statSync(overlay).mtimeMs, stat.mtimeMs);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("denied local prompts retain user memory without enabling project overlays", () => {
	const { root } = fixture(); const previous = process.env.PI_CODING_AGENT_DIR;
	try {
		process.env.PI_CODING_AGENT_DIR = path.join(root, "user");
		const dir = path.join(root, "user", "agent-memory", "probe"); fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "MEMORY.md"), "USER_MEMORY_ALLOWED");
		const agent = { name: "probe", systemPrompt: "USER_BASE", memory: { scope: "user", path: "probe" } } as AgentConfig;
		const prompt = buildEffectiveSystemPrompt({ agent, cwd: root, resolvedSkills: [], projectTrusted: false });
		assert.match(prompt, /USER_BASE/); assert.match(prompt, /USER_MEMORY_ALLOWED/); assert.doesNotMatch(prompt, /PROJECT_REFINEMENT_UNTRUSTED|PROJECT_MEMORY_UNTRUSTED/);
	} finally {
		if (previous === undefined) delete process.env.PI_CODING_AGENT_DIR; else process.env.PI_CODING_AGENT_DIR = previous;
		fs.rmSync(root, { recursive: true, force: true });
	}
});
