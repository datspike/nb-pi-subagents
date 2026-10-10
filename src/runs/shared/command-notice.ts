import { Type } from "typebox";
import { Value } from "typebox/value";
import type { ControlEvent, SubagentState } from "../../shared/types.ts";
import { readStatus } from "../../shared/utils.ts";
import { commandChildren } from "../foreground/command-action.ts";
import { resolveSubagentRunId } from "../background/run-id-resolver.ts";
import { checkPidLiveness } from "../background/stale-run-reconciler.ts";
import { currentPidNamespaceScope } from "../background/pid-namespace.ts";
import { supervisorChannelDir } from "./child-tool-plan.ts";
import { readChildCommandState, type ChildCommandState, type CommandOperation } from "./child-commands.ts";

export interface CommandNoticeContext {
	state?: SubagentState;
	/** The emitting runner itself owns this direct run; never the surrounding workflow. */
	actor?: { runId: string; agent: string; index: number; startedAt: number | undefined; live: boolean };
	kill?: Parameters<typeof checkPidLiveness>[1];
	pidNamespaceScope?: () => string | undefined;
}

const nativeCommandNoticeState = Type.Object({
	ownerId: Type.String({ minLength: 1 }),
	closed: Type.Boolean(),
	commands: Type.Array(Type.Object({
		toolCallId: Type.String(),
		state: Type.Union([Type.Literal("running"), Type.Literal("yielded"), Type.Literal("cancel_requested"), Type.Literal("completed"), Type.Literal("failed"), Type.Literal("cancelled")]),
		startedAt: Type.Number(),
		output: Type.String(),
	})),
});

/** Select useful operations for one retained command; open controllers need a live owner. */
export function commandNoticeOperations(snapshot: ChildCommandState | undefined, toolCallId: string | undefined, live: boolean): CommandOperation[] {
	if (!toolCallId || !Value.Check(nativeCommandNoticeState, snapshot)) return [];
	const command = snapshot.commands.find((candidate) => candidate?.toolCallId === toolCallId);
	if (!command) return [];
	if (snapshot.closed) return ["status"];
	if (!live) return [];
	if (command.state === "running") return ["status", "yield", "cancel"];
	if (command.state === "yielded") return ["status", "cancel"];
	return ["status"];
}

/** Observe existing native state without command IPC, persistence, or a background probe. */
export function resolveCommandNoticeOperations(event: ControlEvent, context: CommandNoticeContext): CommandOperation[] {
	if (event.type !== "needs_attention" || event.reason !== "tool_open_threshold" || event.currentTool !== "bash" || !event.toolCallId || event.nestedRunId || event.nestingPath?.length) return [];
	const index = event.index;
	// Keep every concrete hint pinned to one child even if active siblings change later.
	if (index === undefined || !Number.isInteger(index) || index < 0) return [];
	try {
		let live = false;
		let startedAt: number | undefined;
		if (context.actor?.runId === event.runId) {
			if (index !== context.actor.index || event.agent !== context.actor.agent) return [];
			startedAt = context.actor.startedAt;
			live = context.actor.live && Number.isFinite(startedAt ?? Number.NaN);
		} else {
			const state = context.state;
			if (!state?.currentSessionId) return [];
			const target = resolveSubagentRunId(event.runId, { state });
			if (!target || target.id !== event.runId || target.kind === "nested") return [];
			const children = commandChildren(state, target);
			const child = children.find((candidate) => candidate.index === index);
			if (!child || child.agent !== event.agent) return [];
			if (target.kind === "foreground") {
				const active = state.foregroundControls.get(target.id)?.activeChildren?.get(index);
				// These callbacks live in this process and are removed when its child settles.
				live = active?.agent === event.agent && active.interrupt !== undefined;
				startedAt = active?.startedAt;
			} else {
				const status = target.location.asyncDir ? readStatus(target.location.asyncDir) : undefined;
				const scope = context.pidNamespaceScope ? context.pidNamespaceScope() : currentPidNamespaceScope();
				const scopeMatches = status?.pidNamespaceScope === scope;
				const pid = status?.pid ?? Number.NaN;
				live = status?.runId === event.runId && status.state === "running" && status.steps?.[index]?.status === "running"
					&& Number.isInteger(pid) && pid > 0 && scopeMatches
					&& checkPidLiveness(pid, context.kill, scope !== undefined) === "alive";
				startedAt = status?.steps?.[index]?.startedAt ?? status?.startedAt;
			}
		}
		const snapshot = readChildCommandState(supervisorChannelDir(event.runId, event.agent, index));
		if (!Value.Check(nativeCommandNoticeState, snapshot)) return [];
		const command = snapshot.commands.find((candidate) => candidate.toolCallId === event.toolCallId);
		// Equal millisecond timestamps cannot distinguish a delayed notice from a replacement owner.
		// Require the command to predate its notice; ambiguous hints retain ordinary run inspection.
		if (!command || !Number.isFinite(event.ts) || command.startedAt >= event.ts) return [];
		// A resumed child must not inherit an earlier owner's open mailbox merely by address.
		live = live && startedAt !== undefined && Number.isFinite(startedAt) && command !== undefined && command.startedAt >= startedAt;
		return commandNoticeOperations(snapshot, event.toolCallId, live);
	} catch {
		// A broken optional hint must not suppress the status/transcript notification.
		return [];
	}
}
