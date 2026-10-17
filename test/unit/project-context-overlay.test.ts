import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readProjectFile(relativePath: string): string {
	return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

it("подключает контекст форка к правилам проекта", () => {
	const agents = readProjectFile("AGENTS.md");
	const vision = readProjectFile("VISION.md");
	const overlay = readProjectFile("docs/fork-context.md");

	assert.match(agents, /docs\/fork-context\.md/);
	assert.match(agents, /не нейтральная копия upstream/);
	assert.match(vision, /Код, тесты, issues и документация upstream нужны для проверки совместимости/);
	assert.match(overlay, /только справочный материал/);
	assert.match(overlay, /\*\*`evidence`\*\*[\s\S]*\*\*`inference`\*\*[\s\S]*\*\*`unknown`\*\*/);
	assert.match(overlay, /локальные правила → краткий бриф форка → проверенные code\/tests\/docs → текущая задача → evidence/);
});
