import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const readProjectFile = (file: string): string => readFileSync(join(process.cwd(), file), "utf-8");

describe("writer budget guidance", () => {
	it("keeps hard tool and usage caps off mutation-capable workers", () => {
		const toolReference = readProjectFile("guide/tool-reference.md");
		const reviewLoop = readProjectFile("prompts/review-loop.md");

		assert.match(toolReference, /A deadline is not a mutation-safe boundary/);
		assert.match(toolReference, /Do not use hard tool or usage caps as a safety boundary for mutation-capable writers/);
		assert.match(toolReference, /`toolBudget` blocks configured tools after the hard count/);
		assert.match(reviewLoop, /As a conservative orchestration policy, do not (?:pass|set) a hard `toolBudget`/);
		assert.match(reviewLoop, /checkpoint after the current tool returns/);
	});
});
