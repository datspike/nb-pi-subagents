import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readSubagentGuide, SUBAGENT_GUIDE_TOPICS } from "../../src/extension/subagent-guide.ts";
import { SUBAGENT_ACTIONS } from "../../src/shared/types.ts";

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

	it("documents external CLI runner limits in packaged guide topics", () => {
		assert.match(readSubagentGuide("tool-reference"), /External CLI profiles are a separate runner[\s\S]*native Pi options[\s\S]*`model`[\s\S]*native tools are not available/);
		assert.match(readSubagentGuide("agents"), /external-cli[\s\S]*async-only/);
	});

	it("keeps the fallback-needs-owner-approval rule in the packaged guide", () => {
		assert.match(readSubagentGuide("tool-reference"), /preserve the governed protocol and ask the owner before any external, foreground, CLI, or other fallback/);
	});

	it("keeps advanced workflow details in the packaged guide", () => {
		const guide = readSubagentGuide("workflows");

		assert.match(guide, /## Run sequential lanes[\s\S]*runs\.lanes/);
		assert.match(guide, /## Run host command steps[\s\S]*runs\.host/);
		assert.match(guide, /## Run rolling fanout[\s\S]*Promise\.race[\s\S]*Promise\.all/);
	});
});
