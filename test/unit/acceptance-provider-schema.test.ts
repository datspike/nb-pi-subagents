import assert from "node:assert/strict";
import { test } from "node:test";
import { convertResponsesTools } from "@earendil-works/pi-ai/api/openai-responses-shared";
import { convertTools } from "@earendil-works/pi-ai/api/google-shared";
import { SubagentParams } from "../../src/extension/schemas.ts";

// Inspect the actual provider payload, not only the source TypeBox schema.
test("provider tool schemas do not advertise reviewed acceptance", () => {
	const tools = [{ name: "subagent", description: "Delegate work", parameters: SubagentParams }];
	const responses = convertResponsesTools(tools);
	const googleJson = convertTools(tools);
	const googleOpenApi = convertTools(tools, true);
	const schemas = [
		responses[0].type === "function" ? responses[0].parameters : undefined,
		googleJson?.[0].functionDeclarations?.[0].parametersJsonSchema,
		googleOpenApi?.[0].functionDeclarations?.[0].parameters,
	];
	for (const schema of schemas) {
		assert.ok(schema);
		const acceptance = (schema as { properties: { acceptance: unknown } }).properties.acceptance;
		const payload = JSON.stringify(acceptance);
		assert.ok(payload);
		assert.equal(payload.includes('"reviewed"'), false);
		for (const level of ["auto", "attested", "checked"]) {
			assert.ok(payload.includes(JSON.stringify(level)), `${level} should remain advertised`);
		}
	}
});
