import { truncateUtf8Head } from "./single-output.ts";

export const MAX_STATUS_RESPONSE_BYTES = 16 * 1024;

/** Bounds model-visible status text while retaining identity and retrieval metadata. */
export function boundStatusResponse(lines: string[] | string): string {
	const text = Array.isArray(lines) ? lines.join("\n") : lines;
	if (Buffer.byteLength(text, "utf-8") <= MAX_STATUS_RESPONSE_BYTES) return text;
	const evidenceLines = (Array.isArray(lines) ? lines : text.split("\n"))
		.filter((line) => /^\s*(\d+\. |Run:|State:|Status:|Result:|Error:|Output:|Output artifact:|Saved output:|Full output:|Output saved to:|Retention artifact:|Workflow receipt:|Session:|Transcript:|Dir:|Log:|Events:|Child run:|Run intercom target:|Previous intercom target:|Parallel handoff:|output:|session:)/.test(line))
		.slice(-48)
		.map((line) => truncateUtf8Head(line, 512));
	const tail = evidenceLines.length
		? `\n\nStatus output truncated. Retrieval metadata:\n${evidenceLines.join("\n")}`
		: "\n\nStatus output truncated.";
	const boundedTail = truncateUtf8Head(tail, Math.min(4096, MAX_STATUS_RESPONSE_BYTES - 1));
	const headBytes = Math.max(1, MAX_STATUS_RESPONSE_BYTES - Buffer.byteLength(boundedTail, "utf-8"));
	return `${truncateUtf8Head(text, headBytes)}${boundedTail}`;
}
