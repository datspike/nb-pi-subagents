import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { it } from "node:test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function readProjectFile(relativePath: string): string {
	return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

it("keeps the fork context overlay wired into project guidance", () => {
	const agents = readProjectFile("AGENTS.md");
	const vision = readProjectFile("VISION.md");
	const overlay = readProjectFile("docs/fork-context.md");

	assert.match(agents, /docs\/fork-context\.md/);
	assert.match(agents, /not a neutral upstream mirror/);
	assert.match(vision, /local user intent, `AGENTS\.md`, and `docs\/fork-context\.md` decide/);
	assert.match(overlay, /reference material rather than authority/);
	assert.match(overlay, /\*\*Evidence\*\*[\s\S]*\*\*Inference\*\*[\s\S]*\*\*Unknown\*\*/);
	assert.match(overlay, /local contract → focused project brief → checked code\/tests\/docs → current task → evidence/);
});
