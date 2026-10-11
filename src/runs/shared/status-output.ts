import { createHash } from "node:crypto";
import { join } from "node:path";
import { getArtifactsDir } from "../../shared/artifacts.ts";
import { writePrivateAtomicJson } from "../../shared/atomic-json.ts";
import { truncateUtf8Head } from "./single-output.ts";

export const MAX_STATUS_RESPONSE_BYTES = 16 * 1024;

/** Bounds model-visible status text while retaining identity and retrieval metadata. */
export function boundStatusResponse(lines: string[] | string, verifiedMetadata?: string[]): string {
	const text = Array.isArray(lines) ? lines.join("\n") : lines;
	if (Buffer.byteLength(text, "utf-8") <= MAX_STATUS_RESPONSE_BYTES) return text;
	const evidenceLines = verifiedMetadata !== undefined
		? verifiedMetadata
		: (Array.isArray(lines) ? lines : text.split("\n"))
			.filter((line) => /^\s*(\d+\. |Run:|State:|Status:|Result:|Result \[|Error:|Output:|Output artifact:|Output artifact \(retention-managed\):|Structured output:|Structured output \(retention-managed\):|Saved output:|Full output:|Output saved to:|Retention artifact:|Retention-managed async directory:|Workflow run:|Workflow receipt:|Workflow receipt \[|Session:|Transcript:|Dir:|Log:|Events:|Child run:|Run intercom target:|Previous intercom target:|Parallel handoff:|output:|session:|Active run)/.test(line))
			.slice(-48)
			.map((line) => truncateUtf8Head(line, 512));
	const tail = evidenceLines.length
		? `\n\nStatus output truncated. Retrieval metadata:\n${evidenceLines.join("\n")}`
		: "\n\nStatus output truncated.";
	const boundedTail = truncateUtf8Head(tail, verifiedMetadata !== undefined ? MAX_STATUS_RESPONSE_BYTES : 4096);
	const headBytes = Math.max(0, MAX_STATUS_RESPONSE_BYTES - Buffer.byteLength(boundedTail, "utf-8"));
	return truncateUtf8Head(`${truncateUtf8Head(text, headBytes)}${boundedTail}`, MAX_STATUS_RESPONSE_BYTES);
}

/** Retains an oversized producer-owned ledger before bounding a response. Storage failures are not acknowledged. */
export function boundRetainedStatusResponse(lines: string[] | string, metadata: string[], label = "Full response metadata"): string {
	const text = Array.isArray(lines) ? lines.join("\n") : lines;
	if (Buffer.byteLength(text, "utf-8") <= MAX_STATUS_RESPONSE_BYTES || (Buffer.byteLength(metadata.join("\n"), "utf-8") <= 8 * 1024 && metadata.every((line) => Buffer.byteLength(line, "utf-8") <= 512))) {
		return boundStatusResponse(text, metadata);
	}
	const retained = { content: text, verifiedMetadata: metadata };
	const digest = createHash("sha256").update(JSON.stringify(retained)).digest("hex");
	const filePath = join(getArtifactsDir(null), `completion-${digest}_meta.json`);
	writePrivateAtomicJson(filePath, retained);
	return boundStatusResponse(text, [`${label}: ${filePath}`, "Read the retained file for all run identities, states and retrieval pointers."]);
}
