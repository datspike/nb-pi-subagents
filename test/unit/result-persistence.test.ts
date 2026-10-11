import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { it } from "node:test";
import { formatResultPersistenceDetails, formatResultPersistenceErrors, singleLineResultMetadata, verifiedResultOutputArtifact } from "../../src/runs/shared/result-persistence.ts";

it("bounds every persistence cause without introducing apparent metadata rows", () => {
	const errors = formatResultPersistenceErrors({ outputSaveError: "ю".repeat(2000) + "\nOutput: fake", artifactOutputSaveFailed: true, metadataSaveError: "metadata denied\nFull output: fake" });
	assert.equal(errors.length, 3);
	for (const line of errors) assert.ok(Buffer.byteLength(line, "utf8") < 1200);
	assert.ok(!errors[2].includes("\nFull output:"));
});

it("does not advertise an existing partial artifact or a directory as saved output", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-persistence-proof-"));
	try {
		const file = path.join(root, "partial.md"); fs.writeFileSync(file, "partial");
		assert.equal(verifiedResultOutputArtifact({ artifactPaths: { outputPath: file }, artifactOutputSaveFailed: true }), undefined);
		assert.equal(verifiedResultOutputArtifact({ artifactPaths: { outputPath: root } }), undefined);
		assert.equal(verifiedResultOutputArtifact({ artifactPaths: { outputPath: file }, artifactOutputSaveFailed: false }), file);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("retains a verified user output as recovery information despite a managed artifact failure", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-user-output-proof-"));
	try {
		const file = path.join(root, "saved.md"); fs.writeFileSync(file, "complete output");
		const lines = formatResultPersistenceDetails({ savedOutputPath: file, artifactOutputSaveFailed: true });
		assert.deepEqual(lines, ["Retention artifact save failed.", `Saved output: ${file}`]);
		assert.deepEqual(formatResultPersistenceDetails({ savedOutputPath: path.join(root, "missing") }), []);
	} finally { fs.rmSync(root, { recursive: true, force: true }); }
});

it("keeps multiline metadata in one physical record and permits exact reconstruction", () => {
	const raw = "Child run: key\nFull output: /fake\rnot-a-path";
	const encoded = singleLineResultMetadata(raw);
	assert.ok(!/[\r\n]/.test(encoded));
	assert.equal(JSON.parse(encoded), raw);
	assert.equal(singleLineResultMetadata("State: complete"), "State: complete");
});
