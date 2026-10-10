import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { readSubagentGuide, SUBAGENT_GUIDE_SECTION_MAX_CHARS, SUBAGENT_GUIDE_TOPICS } from "../../src/extension/subagent-guide.ts";
import { SUBAGENT_ACTIONS } from "../../src/shared/types.ts";

const SECTIONED_TOPICS = SUBAGENT_GUIDE_TOPICS.filter((topic) => topic !== "overview" && topic !== "council");
const packageRoot = path.resolve(import.meta.dirname, "..", "..");

function sectionAddresses(topic: string): string[] {
	return [...readSubagentGuide(topic).matchAll(new RegExp(`^\\s*(${topic}/\\S+) — `, "gm"))].map((match) => match[1]!);
}

describe("subagent guide", () => {
	it("reads the packaged overview by default", () => {
		const guide = readSubagentGuide();

		assert.match(guide, /^# overview/);
	});

	it("lists valid topics for an unknown topic without changing files", () => {
		const guide = readSubagentGuide("unknown");

		assert.match(guide, /Unknown subagents guide topic 'unknown'/);
		assert.match(guide, /No files were changed\./);
		assert.match(guide, new RegExp(SUBAGENT_GUIDE_TOPICS.join(", ")));
	});

	it("registers the guide action for action recovery", () => {
		assert.ok(SUBAGENT_ACTIONS.includes("guide"));
	});

	it("serves the council protocol and its references without loaded skills", () => {
		const guide = readSubagentGuide("council");

		assert.match(guide, /# Council Mode/);
		assert.match(guide, /skills\/council-mode\/references\/pass-contracts\.md -->/);
		assert.match(guide, /guide\/tool-reference\.md -->/);
		assert.match(guide, /external-job provider may support `action: "resume"` only when it exposes `followUp\(input\)`/);
		assert.doesNotMatch(guide, /External job profiles do not support[^.\n]*steer\/resume/);
	});

	it("serves a bounded topic table instead of the whole guide", () => {
		const toc = readSubagentGuide("tool-reference");

		assert.ok(Buffer.byteLength(toc, "utf-8") <= SUBAGENT_GUIDE_SECTION_MAX_CHARS);
		assert.match(toc, /^tool-reference\/start-one-child-or-a-workflow — Start one child or a workflow$/m);
		assert.doesNotMatch(toc, /\| `agent` \| string \|/);
	});

	it("serves the requested guide sections and keeps sibling sections out", () => {
		const output = readSubagentGuide("tool-reference/choose-context-model-tools-and-skills");
		assert.match(output, /^## Choose context, model, tools, and skills\n/);
		assert.match(output, /External CLI profiles are a separate runner/);
		assert.doesNotMatch(output, /^## Require evidence and acceptance/m);

		const agents = readSubagentGuide("agents/use-external-cli-agents");
		assert.match(agents, /^## Use external CLI agents\n/);
		assert.match(agents, /native Pi structured output or forked transcript context/);
	});

	it("keeps every section of every guide topic bounded", () => {
		for (const topic of SECTIONED_TOPICS) {
			const addresses = sectionAddresses(topic);
			assert.ok(addresses.length > 0, `${topic} lists no sections`);
			for (const address of addresses) {
				const text = readSubagentGuide(address);
				assert.doesNotMatch(text, /^Unknown/, address);
				assert.ok(Buffer.byteLength(text, "utf-8") <= SUBAGENT_GUIDE_SECTION_MAX_CHARS, `${address} is too large`);
			}
		}
	});

	it("lists the topic sections for an unknown section", () => {
		const guide = readSubagentGuide("workflows/no-such-section");

		assert.match(guide, /Unknown section 'workflows\/no-such-section'/);
		assert.match(guide, /^workflows\/start-a-workflow-script — Start a workflow script$/m);
	});

	it("reads sections the same way from a CRLF checkout", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-guide-crlf-"));
		try {
			fs.mkdirSync(path.join(root, "guide"));
			fs.writeFileSync(path.join(root, "guide", "workflows.md"), "# workflows\r\n\r\nIntro.\r\n\r\n## First\r\n\r\nOne.\r\n\r\n## Second\r\n\r\nTwo.\r\n");
			assert.equal(readSubagentGuide("workflows/first", root), "## First\n\nOne.");
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("resolves every guide pointer in shipped prompts, skills and source", () => {
		const topicNames = SUBAGENT_GUIDE_TOPICS.join("|");
		const pointer = new RegExp(`topic:\\s*\\\\?["']([a-z][a-z0-9/-]*)|guide (?:topics? )?((?:${topicNames})(?:/[a-z0-9-]+)?)\\b`, "g");
		const files = ["src", "skills", "prompts", "agents"].flatMap((dir) => fs.readdirSync(path.join(packageRoot, dir), { recursive: true, encoding: "utf-8" })
			.filter((file) => /\.(ts|md)$/.test(file))
			.map((file) => path.join(packageRoot, dir, file)));
		const pointers = files.flatMap((file) => [...fs.readFileSync(file, "utf-8").matchAll(pointer)].map((match) => ({ file, address: match[1] ?? match[2]! })));

		for (const { file, address } of pointers) {
			assert.doesNotMatch(readSubagentGuide(address), /^Unknown/, `${path.relative(packageRoot, file)} points to ${address}`);
		}
	});
});
