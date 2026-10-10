import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundStatusResponse, MAX_STATUS_RESPONSE_BYTES } from "../../src/runs/shared/status-output.ts";

function byteLength(value: string): number {
	return Buffer.byteLength(value, "utf-8");
}

describe("boundStatusResponse", () => {
	it("keeps oversized status output within the UTF-8 byte budget", () => {
		const text = boundStatusResponse([
			"Run: remembered-foreground",
			"State: remembered foreground",
			`Error: ${"ошибка ".repeat(10_000)}`,
			"Output: /tmp/full-output.md",
		]);

		assert.ok(byteLength(text) <= MAX_STATUS_RESPONSE_BYTES);
		assert.match(text, /Run: remembered-foreground/);
		assert.match(text, /State: remembered foreground/);
		assert.match(text, /Output: \/tmp\/full-output\.md/);
		assert.match(text, /Status output truncated/);
	});

	it("bounds oversized retrieval metadata as well as the main text", () => {
		const path = `/tmp/${"x".repeat(100_000)}.md`;
		const text = boundStatusResponse(["Run: active", `Output: ${path}`]);

		assert.ok(byteLength(text) <= MAX_STATUS_RESPONSE_BYTES);
		assert.match(text, /Run: active/);
		assert.match(text, /Status output truncated/);
	});

	it("retains aggregated bg_wait retrieval pointers under the shared cap", () => {
		const text = boundStatusResponse([`${"payload ".repeat(20_000)}`, ...Array.from({ length: 300 }, (_, index) => `Result [run-${index}]: /tmp/result-${index}.json`), "Workflow receipt [workflow-1]: /tmp/workflow.json"]);

		assert.ok(byteLength(text) <= MAX_STATUS_RESPONSE_BYTES);
		assert.match(text, /Result \[run-299\]: \/tmp\/result-299\.json/);
		assert.match(text, /Workflow receipt \[workflow-1\]: \/tmp\/workflow\.json/);
	});
});
