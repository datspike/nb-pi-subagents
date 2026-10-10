import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

export const SUBAGENT_GUIDE_TOPICS = [
	"overview",
	"workflows",
	"agents",
	"missions",
	"observability",
	"tool-reference",
	"configuration",
	"models",
	"watchdog",
	"extension-api",
	"council",
] as const;

export type SubagentGuideTopic = (typeof SUBAGENT_GUIDE_TOPICS)[number];

export const SUBAGENT_GUIDE_SECTION_MAX_CHARS = 8_000;
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// /council must work under `pi --no-skills`, which drops the package skills from context,
// so this topic serves the council skill together with the references it tells the model to read.
const COUNCIL_FILES = [
	"skills/council-mode/SKILL.md",
	"skills/council-mode/references/pass-contracts.md",
	"guide/tool-reference.md",
];

interface GuideSection {
	address: string;
	title: string;
	level: number;
	start: number;
	end: number;
	children: GuideSection[];
}

function isGuideTopic(value: string): value is SubagentGuideTopic {
	return (SUBAGENT_GUIDE_TOPICS as readonly string[]).includes(value);
}

function headingSlug(title: string): string {
	return title.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").trim().replace(/\s+/g, "-");
}

function truncateUtf8(value: string, maxBytes: number): string {
	const bytes = Buffer.from(value, "utf-8");
	if (bytes.length <= maxBytes) return value;
	const marker = "\n…[guide section truncated]";
	const markerBytes = Buffer.byteLength(marker, "utf-8");
	let end = Math.max(0, maxBytes - markerBytes);
	while (end > 0 && (bytes[end]! & 0xc0) === 0x80) end -= 1;
	return `${bytes.subarray(0, end).toString("utf-8")}${marker}`;
}

function parseSections(topic: string, lines: string[]): GuideSection[] {
	const sections: GuideSection[] = [];
	let fence: string | undefined;
	for (const [index, line] of lines.entries()) {
		const marker = /^\s*(```+|~~~+)/.exec(line)?.[1];
		if (marker) {
			if (!fence) fence = marker;
			else if (marker.startsWith(fence)) fence = undefined;
			continue;
		}
		const heading = fence ? undefined : /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) sections.push({ address: "", title: heading[2]!, level: heading[1]!.length, start: index, end: lines.length, children: [] });
	}

	const used = new Set<string>();
	const parents: GuideSection[] = [];
	for (const [index, section] of sections.entries()) {
		const next = sections.slice(index + 1).find((other) => other.level <= section.level);
		if (next) section.end = next.start;
		while (parents.length && parents.at(-1)!.level >= section.level) parents.pop();
		const parent = parents.at(-1);
		parent?.children.push(section);
		const base = headingSlug(section.title) || `section-${index + 1}`;
		let slug = base;
		for (let suffix = 2; used.has(slug); suffix++) slug = `${base}-${suffix}`;
		used.add(slug);
		section.address = `${topic}/${slug}`;
		parents.push(section);
	}
	return sections;
}

function tableOfContents(topic: string, sections: GuideSection[]): string {
	const rows = sections.map((section) => `${"  ".repeat(Math.max(0, section.level - 2))}${section.address} — ${section.title}`);
	return truncateUtf8(`Sections of guide topic '${topic}'. Read one with {action:"guide",topic:"<section address>"}:\n${rows.join("\n")}`, SUBAGENT_GUIDE_SECTION_MAX_CHARS);
}

function sectionText(lines: string[], section: GuideSection, sections: GuideSection[]): string {
	const text = lines.slice(section.start, section.end).join("\n").trim();
	if (Buffer.byteLength(text, "utf-8") <= SUBAGENT_GUIDE_SECTION_MAX_CHARS) return text;
	if (!section.children.length) return truncateUtf8(text, SUBAGENT_GUIDE_SECTION_MAX_CHARS);
	const intro = lines.slice(section.start, section.children[0]!.start).join("\n").trim();
	const childRows = sections.filter((candidate) => candidate !== section && section.children.includes(candidate)).map((child) => `${child.address} — ${child.title}`);
	return truncateUtf8(`${intro}\n\nSubsections (read one with {action:"guide",topic:"<address>"}):\n${childRows.join("\n")}`, SUBAGENT_GUIDE_SECTION_MAX_CHARS);
}

function readGuideFiles(topic: string, files: string[], root: string): string[] {
	try {
		// Section boundaries are line-based; normalize CRLF so Windows and Unix serve the same contract.
		return files.map((file) => fs.readFileSync(path.join(root, file), "utf-8").replace(/\r\n/g, "\n"));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Failed to read packaged subagents guide '${topic}': ${message}`, { cause: error instanceof Error ? error : undefined });
	}
}

/** Reads a guide topic as a bounded table of contents or one bounded section. */
export function readSubagentGuide(topic = "overview", root = packageRoot): string {
	const separator = topic.indexOf("/");
	const name = separator === -1 ? topic : topic.slice(0, separator);
	const sectioned = isGuideTopic(name) && name !== "overview" && name !== "council";
	if (!isGuideTopic(name) || (separator !== -1 && !sectioned)) {
		return `Unknown subagents guide topic '${topic}'. Valid topics: ${SUBAGENT_GUIDE_TOPICS.join(", ")}. No files were changed.`;
	}

	if (!sectioned) {
		const files = name === "overview" ? ["guide/overview.md"] : COUNCIL_FILES;
		const contents = readGuideFiles(name, files, root);
		return files.length === 1 ? contents[0]! : contents.map((content, index) => `<!-- ${files[index]} -->\n\n${content}`).join("\n\n");
	}

	const lines = readGuideFiles(name, [path.join("guide", `${name}.md`)], root)[0]!.split("\n");
	const sections = parseSections(name, lines);
	if (separator === -1) {
		const intro = lines.slice(0, sections[0]?.start ?? lines.length).join("\n").trim();
		return truncateUtf8(`${intro}\n\n${tableOfContents(name, sections)}`, SUBAGENT_GUIDE_SECTION_MAX_CHARS);
	}
	const section = sections.find((candidate) => candidate.address === topic);
	if (!section) return `Unknown section '${topic}'. No files were changed.\n\n${tableOfContents(name, sections)}`;
	return sectionText(lines, section, sections);
}
