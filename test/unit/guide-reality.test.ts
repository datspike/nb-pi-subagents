import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { SUBAGENT_GUIDE_TOPICS } from "../../src/extension/subagent-guide.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const guideDir = path.join(root, "guide");

/** Names the guides legitimately mention that are not defined in this package. */
const EXTERNAL_NAMES = new Set([
	"git", "npm", "node", "pi", "bun", "gh", "bg_wait", "interactive_shell", "bash", "read", "grep", "find", "ls", "edit", "write",
	"JSON", "JavaScript", "Promise", "Promise.all", "Promise.race", "true", "false", "null", "undefined", "main", "HEAD",
]);

/** Per-topic character budgets keep the on-demand guides small; raise one deliberately when content earns it. */
const TOPIC_BUDGET: Record<string, number> = {
	overview: 4_000,
	workflows: 16_000,
	agents: 10_000,
	missions: 5_000,
	observability: 7_000,
	"tool-reference": 14_000,
	configuration: 8_000,
	models: 4_600,
	watchdog: 4_600,
	"extension-api": 7_000,
};
const DEFAULT_BUDGET = 16_000;

function listSourceFiles(dir: string): string[] {
	return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) return listSourceFiles(full);
		return entry.name.endsWith(".ts") ? [full] : [];
	});
}

const corpus = listSourceFiles(path.join(root, "src")).map((file) => fs.readFileSync(file, "utf-8")).join("\n");

function identifierTokens(markdown: string): string[] {
	const withoutFences = markdown.replace(/```[\s\S]*?```/g, "");
	const tokens = new Set<string>();
	for (const match of withoutFences.matchAll(/`([^`\n]+)`/g)) {
		const token = match[1]!.trim();
		if (/^[A-Za-z_][\w.-]*(:[\w-]+)?$/.test(token)) tokens.add(token);
	}
	return [...tokens];
}

function existsInSource(token: string): boolean {
	if (EXTERNAL_NAMES.has(token) || corpus.includes(token)) return true;
	const segments = token.split(/[.:]/).filter(Boolean);
	return segments.length > 1 && segments.every((segment) => EXTERNAL_NAMES.has(segment) || corpus.includes(segment));
}

describe("agent-facing guides", () => {
	const topics = SUBAGENT_GUIDE_TOPICS.filter((topic) => topic !== "council");

	it("ships one guide file per topic", () => {
		for (const topic of topics) assert.ok(fs.existsSync(path.join(guideDir, `${topic}.md`)), `guide/${topic}.md is missing`);
		const files = fs.readdirSync(guideDir).filter((name) => name.endsWith(".md")).map((name) => name.slice(0, -3)).sort();
		assert.deepEqual(files, [...topics].sort());
	});

	for (const topic of topics) {
		describe(topic, () => {
			const file = path.join(guideDir, `${topic}.md`);
			const text = fs.existsSync(file) ? fs.readFileSync(file, "utf-8") : "";

			it("names only identifiers that exist in the source", () => {
				const missing = identifierTokens(text).filter((token) => !existsInSource(token));
				assert.deepEqual(missing, [], `guide/${topic}.md mentions names that are not in src/`);
			});

			it("does not point the model at the human docs", () => {
				assert.doesNotMatch(text, /\bdocs\/[\w-]+\.md/);
			});

			it("stays within its size budget", () => {
				const budget = TOPIC_BUDGET[topic] ?? DEFAULT_BUDGET;
				assert.ok(text.length <= budget, `guide/${topic}.md is ${text.length} chars, budget ${budget}`);
			});
		});
	}
});
