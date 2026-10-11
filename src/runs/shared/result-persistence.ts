import { statSync } from "node:fs";
import { safeTerminalText } from "../../shared/display-text.ts";
import { truncateUtf8Head } from "./single-output.ts";

/** Formats producer-owned save failures independently of execution status and model output. */
export function formatResultPersistenceErrors(result: {
	outputSaveError?: string;
	artifactOutputSaveFailed?: boolean;
	metadataSaveError?: string;
}): string[] {
	const safe = (text: string) => truncateUtf8Head(safeTerminalText(text).replace(/\n/g, "\\n"), 1024);
	const errors: string[] = [];
	if (result.outputSaveError) errors.push(`Output save error: ${safe(result.outputSaveError)}`);
	if (result.artifactOutputSaveFailed) errors.push("Retention artifact save failed.");
	if (result.metadataSaveError) errors.push(`Metadata save error: ${safe(result.metadataSaveError)}`);
	return errors;
}

/** Returns only an existing saved output file, never a failed save claim. */
export function verifiedResultOutputArtifact(result: { artifactPaths?: { outputPath?: string }; artifactOutputSaveFailed?: unknown }): string | undefined {
	const file = result.artifactPaths?.outputPath;
	if (!file || result.artifactOutputSaveFailed === true) return undefined;
	try { return statSync(file).isFile() ? file : undefined; } catch { return undefined; }
}

/** Supplies verified recovery paths alongside save failures without classifying user output as a managed artifact. */
export function formatResultPersistenceDetails(result: Parameters<typeof formatResultPersistenceErrors>[0] & { savedOutputPath?: string }): string[] {
	const saved = verifiedResultOutputArtifact({ artifactPaths: { outputPath: result.savedOutputPath } });
	return [...formatResultPersistenceErrors(result), ...(saved ? [`Saved output: ${saved}`] : [])];
}

/** Keeps a multiline scalar from becoming several producer-owned metadata records. */
export function singleLineResultMetadata(value: string): string {
	return /[\r\n]/.test(value) ? JSON.stringify(value) : safeTerminalText(value);
}
