import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { DEFAULT_SUBAGENT_TOOL_DESCRIPTION } from "../../src/extension/tool-description.ts";

const readProjectFile = (file: string): string => readFileSync(join(process.cwd(), file), "utf-8");

describe("pi-subagents delegation policy guidance", () => {
	it("keeps delegation operator-authorized and cost-bounded", () => {
		assert.match(DEFAULT_SUBAGENT_TOOL_DESCRIPTION, /Do the work yourself by default\. Delegate only when the operator's current request or applicable instructions authorize it/);
		assert.match(DEFAULT_SUBAGENT_TOOL_DESCRIPTION, /size, complexity, risk or tool-call count alone never do/);

		const guidance = readdirSync(join(process.cwd(), "guide"))
			.map((file) => readProjectFile(join("guide", file)))
			.join("\n");
		assert.doesNotMatch(guidance, /not the routine primary doer/i);
		assert.doesNotMatch(guidance, /delegate[^\n]*(?:most|all) non-trivial requests/i);
		assert.doesNotMatch(guidance, /use this at the start of non-trivial work/i);
	});
});
