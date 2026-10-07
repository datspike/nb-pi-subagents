import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionConfig, ToolDescriptionMode } from "../shared/types.ts";
import { getAgentDir, getProjectConfigDir } from "../shared/utils.ts";
import { resolveDisabledFeatureSurface, type DisabledFeatureSurface, type SubagentSurfaceFeature } from "../shared/disabled-features.ts";

const CUSTOM_TOOL_DESCRIPTION_FILE = "subagent-tool-description.md";
const CUSTOM_TOOL_DESCRIPTION_MAX_BYTES = 50 * 1024;
const AGENT_SELECTION_GUIDANCE = 'Before the first launch call {action:"list",capabilities:true} and use only agents it reports as runnable.';
const SUBAGENT_FAILURE_RECOVERY_GUIDANCE = "A launch, workflow, runtime or child tooling failure is a lane infrastructure blocker. Stop; report the exact error, run id and repo/cwd/branch; check the worktree is clean or save the partial diff, then retry the same way or ask the owner. Never switch to interactive_shell, pi -ne, another CLI or foreground mode on your own; explicit requests for those remain valid.";

type FeatureText = (feature: SubagentSurfaceFeature, text: string, disabledText?: string) => string;

function featureText(disabled: DisabledFeatureSurface): FeatureText {
	return (feature, text, disabledText = "") => disabled.features.has(feature) ? disabledText : text;
}

const safetyGuidance = (on: FeatureText) => `SAFETY-CRITICAL SUBAGENT GUIDANCE:
• Do the work yourself by default. Delegate only when the operator's current request or applicable instructions authorize it; size, complexity, risk or tool-call count alone never do.
• ${AGENT_SELECTION_GUIDANCE}
• ${SUBAGENT_FAILURE_RECOVERY_GUIDANCE}
• Omit action to launch. One child is {agent,task}; multi-step or parallel work is exactly one top-level ${on("workflow-scripts", "workflow call with async:true (children launch inside it)", "chain or tasks call with async:true")}.
• Launch is async by default. After it, end the turn: completion arrives as a message in this session. Do not poll with status, sleep or bg_wait to check on it; bg_wait is only for provider/detached work with no completion message that you need this turn. async:false only to block the parent, not for final reviews.
• One writer per cwd/worktree; isolate concurrent writers. For independent review use a fresh-context read-only reviewer, then synthesize and fix yourself. Ordinary children are not orchestrators.
• Bind durable output ${on("workflow-scripts", "on runs.run/runs.all", "with output")}, not in task prose; report the returned outputReference/artifactPaths, evidence and residual risks.
• Control a known run by exact id: status, steer, interrupt, stop, resume (resume checks eligibility and may reject). Resume rules, children.list, command.status and run artifacts: guide tool-reference.`;

const scriptExecutionGuidance = (on: FeatureText) => `Delegate one child with {agent,task}, or run a multi-child workflow script: write one \`\`\`js block in this reply, then call subagent({workflow:true}). workflow:'path.js' (any value with '/') loads a script from cwd; any other string names a resource, e.g. {workflow:'review',args:{task:'...'}}. agent/task exclude workflow; task excludes action.
Script body: statements with an explicit return and top-level await, no nested async helpers. Await runs.run('key',{agent,task}) before reading .output; runs.all([{key,agent,task}]) returns an ordered array. Await every stored run promise. Steer a prior run with runs.steer(key,message), never a raw run id. No filesystem, shell or Pi tools; args are persisted, so never put secrets in them.
To override a model call {action:"models"} and copy the exact provider/id; thinking is a model suffix like :high${on("watchdog", ", not watchdog-only thinking")}.
worktree:true needs a clean tree; baseRef is HEAD or a named ref, never a commit id.
Before using lanes, rolling fanout, missions, acceptance, ${on("tool-budgets", "tool budgets, ")}structured output, fast, fork context or skills/tools, read {action:"guide",topic:"workflows"} or "tool-reference".`;

const structuredExecutionGuidance = (on: FeatureText) => `Delegate one child with {agent,task}. tasks:[{agent,task},...] runs children in parallel. chain:[{agent,task?,as?} or {parallel:[{agent,task},...]}] runs steps in order; a parallel step waits for all its children and a failed step stops the chain.
Chain placeholders: {task} is the original request; {previous} is the prior step's output (a parallel step's outputs in order) and the default when task is omitted; {outputs.name} is the output of an earlier step with as:'name'.
agent, chain and tasks exclude each other and action.
To override a model call {action:"models"} and copy the exact provider/id; thinking is a model suffix like :high${on("watchdog", ", not watchdog-only thinking")}.
worktree:true needs a clean tree; baseRef is HEAD or a named ref, never a commit id.
Before using structured output, acceptance, ${on("tool-budgets", "tool budgets, ")}fast, fork context or skills/tools, read {action:"guide",topic:"tool-reference"}.`;

const defaultDescription = (on: FeatureText) => `${on("workflow-scripts", scriptExecutionGuidance(on), structuredExecutionGuidance(on))}\n\n${safetyGuidance(on)}`;

const managementDiscovery = (on: FeatureText) => [
	["list/get/models/guide"],
	[on("agent-management", "create/update/delete/eject/disable/enable/reset/refine")],
	[on("missions", "mission.*"), on("schedules", "schedule.*"), on("watchdog", "watchdog.*"), on("panes", "inspector.*, project.*"), on("lane-management", "lane.status/recordMerge/recordSupersession")],
	[on("lane-management", "worktree.discard and reviewed worktree.cleanup")],
	[`doctor${on("spawn-budget-grants", " and grant-spawn-budget")}`],
].map((group) => group.filter(Boolean).join(", ")).filter(Boolean).join("; ");

const fullDescription = (on: FeatureText) => `${defaultDescription(on)}

WORKFLOW DETAILS:
${on("workflow-scripts", "• runs.lanes([{key,stages:[{key,agent,task},{key,resume:'previous',task}]}]) runs first stages together, later stages sequentially per lane. Failures stay lane-local; only explicit structuredOutput.verdict === 'blocked' blocks a successful stage, never reviewer prose.\n")}• ${on("workflow-scripts", "Workflow child controls default onto runs.run/runs.all items; child fields override them.", "Top-level child controls apply to every chain/tasks child.")} worktree:true isolates each child and returns handoff artifacts.${on("usage-budgets", " usageBudget is shared across the workflow; already-running children are not stopped.")}
• Missions auto-attach${on("missions", " unless mission:false")}; ${on("workflow-scripts", "await state.get(key)/state.set(key,JSONValue) requires a mission. ")}See guide topic missions. Omit acceptance for reviewer/read-only calls; acceptance.review.required requests independent writer review.
• Management discovery: ${managementDiscovery(on)}. Use guide topics agents, ${on("missions", "missions, ")}observability, tool-reference, configuration, models${on("watchdog", ", watchdog")} or extension-api for exact action fields.${on("schedules", on("workflow-scripts", " Schedules take script inputs, not direct children; recipes live in the missions guide."))}`;

const allEnabled = featureText(resolveDisabledFeatureSurface({}));

export const SUBAGENT_SAFETY_GUIDANCE = safetyGuidance(allEnabled);

export const DEFAULT_SUBAGENT_TOOL_DESCRIPTION = defaultDescription(allEnabled);

export const SUBAGENT_TOOL_PROMPT_SNIPPET = "For operator-requested delegation, use subagents; compose multi-child work in one workflow call.";
const STRUCTURED_SUBAGENT_TOOL_PROMPT_SNIPPET = "For operator-requested delegation, use subagents; compose multi-child work in one chain or tasks call.";
export const SUBAGENT_TOOL_PROMPT_GUIDELINES = [
	"Do not invoke subagents unless the operator requested delegation directly or through applicable instructions.",
];

export const COMPACT_SUBAGENT_TOOL_DESCRIPTION = DEFAULT_SUBAGENT_TOOL_DESCRIPTION;

export const FULL_SUBAGENT_TOOL_DESCRIPTION = fullDescription(allEnabled);

function isToolDescriptionMode(value: unknown): value is ToolDescriptionMode {
	return value === "full" || value === "compact" || value === "custom";
}

function warn(options: ToolDescriptionOptions | undefined, message: string): void {
	(options?.warn ?? console.warn)(`[pi-subagents] ${message}`);
}

export interface ToolDescriptionOptions {
	cwd?: string;
	agentDir?: string;
	warn?: (message: string) => void;
	/** Removes lines for disabled features from the default and full descriptions; custom descriptions are unchanged apart from the appended safety guidance. */
	disabledFeatures?: DisabledFeatureSurface;
}

export interface SubagentToolPromptMetadata {
	promptSnippet?: string;
	promptGuidelines?: string[];
}

export function buildSubagentToolPromptMetadata(config: Pick<ExtensionConfig, "toolDescriptionMode"> = {}, disabledFeatures?: DisabledFeatureSurface): SubagentToolPromptMetadata {
	if (config.toolDescriptionMode !== undefined) return {};
	return {
		promptSnippet: disabledFeatures?.features.has("workflow-scripts") ? STRUCTURED_SUBAGENT_TOOL_PROMPT_SNIPPET : SUBAGENT_TOOL_PROMPT_SNIPPET,
		promptGuidelines: SUBAGENT_TOOL_PROMPT_GUIDELINES,
	};
}

export function resolveToolDescriptionMode(config: Pick<ExtensionConfig, "toolDescriptionMode">, options?: ToolDescriptionOptions): ToolDescriptionMode {
	const mode = config.toolDescriptionMode;
	if (mode === undefined) return "full";
	if (isToolDescriptionMode(mode)) return mode;
	warn(options, `Ignoring invalid toolDescriptionMode ${JSON.stringify(mode)}; expected "full", "compact", or "custom".`);
	return "full";
}

function customDescriptionPaths(options?: ToolDescriptionOptions): string[] {
	const cwd = options?.cwd ?? process.cwd();
	const agentDir = options?.agentDir ?? getAgentDir();
	return [
		path.join(getProjectConfigDir(cwd), CUSTOM_TOOL_DESCRIPTION_FILE),
		path.join(agentDir, CUSTOM_TOOL_DESCRIPTION_FILE),
	];
}

function renderCustomTemplate(template: string, options?: ToolDescriptionOptions): string {
	const cwd = options?.cwd ?? process.cwd();
	const agentDir = options?.agentDir ?? getAgentDir();
	const projectConfigDir = getProjectConfigDir(cwd);
	const variables: Record<string, () => string> = {
		fullDescription: () => FULL_SUBAGENT_TOOL_DESCRIPTION,
		full: () => FULL_SUBAGENT_TOOL_DESCRIPTION,
		compactDescription: () => COMPACT_SUBAGENT_TOOL_DESCRIPTION,
		compact: () => COMPACT_SUBAGENT_TOOL_DESCRIPTION,
		safetyGuidance: () => SUBAGENT_SAFETY_GUIDANCE,
		safety: () => SUBAGENT_SAFETY_GUIDANCE,
		agentDir: () => agentDir,
		projectConfigDir: () => projectConfigDir,
	};
	return template.replace(/\{\{(\w+)\}\}/g, (raw, name: string) => {
		const replacement = variables[name];
		if (replacement) return replacement();
		warn(options, `${CUSTOM_TOOL_DESCRIPTION_FILE}: unknown placeholder ${raw} left unchanged.`);
		return raw;
	});
}

function loadCustomToolDescription(options?: ToolDescriptionOptions): string | undefined {
	for (const filePath of customDescriptionPaths(options)) {
		let stat: fs.Stats;
		try {
			stat = fs.statSync(filePath);
		} catch (error) {
			if (typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
			warn(options, `Failed to inspect custom tool description '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		if (!stat.isFile()) {
			warn(options, `Ignoring custom tool description '${filePath}' because it is not a file.`);
			continue;
		}
		if (stat.size > CUSTOM_TOOL_DESCRIPTION_MAX_BYTES) {
			warn(options, `Ignoring custom tool description '${filePath}' because it is larger than ${CUSTOM_TOOL_DESCRIPTION_MAX_BYTES} bytes.`);
			continue;
		}
		try {
			const template = fs.readFileSync(filePath, "utf-8").trim();
			if (!template) {
				warn(options, `Ignoring empty custom tool description '${filePath}'.`);
				continue;
			}
			const rendered = renderCustomTemplate(template, options).trim();
			if (!rendered) {
				warn(options, `Ignoring custom tool description '${filePath}' because it rendered empty.`);
				continue;
			}
			return rendered;
		} catch (error) {
			warn(options, `Failed to read custom tool description '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return undefined;
}

function withMandatorySafetyGuidance(description: string, safety: string): string {
	const customDescription = description
		.split(SUBAGENT_SAFETY_GUIDANCE)
		.flatMap((part) => part.split(safety))
		.flatMap((part) => part.split(SUBAGENT_FAILURE_RECOVERY_GUIDANCE))
		.map((part) => part.trim())
		.filter(Boolean)
		.join("\n\n");
	return customDescription
		? `${customDescription}\n\n${safety}`
		: safety;
}

export function buildSubagentToolDescription(config: Pick<ExtensionConfig, "toolDescriptionMode"> = {}, options?: ToolDescriptionOptions): string {
	const on = options?.disabledFeatures ? featureText(options.disabledFeatures) : allEnabled;
	if (config.toolDescriptionMode === undefined) return defaultDescription(on);
	const mode = resolveToolDescriptionMode(config, options);
	let description: string;
	if (mode === "compact") description = defaultDescription(on);
	else if (mode === "custom") {
		const custom = loadCustomToolDescription(options);
		if (custom) description = withMandatorySafetyGuidance(custom, safetyGuidance(on));
		else {
			warn(options, `${CUSTOM_TOOL_DESCRIPTION_FILE} was not found or valid for toolDescriptionMode "custom"; using full description.`);
			description = fullDescription(on);
		}
	} else description = fullDescription(on);
	return description;
}
