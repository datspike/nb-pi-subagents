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
});
