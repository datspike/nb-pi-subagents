/**
 * Child lifecycle projection: when the observed child session events mean
 * the run is settling and the observer may start (or must cancel) its final
 * drain window.
 *
 * A terminal assistant message is not enough to start the window: Pi may still
 * be running turn_end handlers, including a compaction repair. agent_end is the
 * first event after that turn has completed; later compaction and settled events
 * re-arm or confirm the window; agent_settled remains the fallback watermark.
 */
export type ChildLifecycleAction = "start-drain" | "cancel-drain" | "none";

export interface ChildLifecycleState {
	compactionRetryActive: boolean;
}

export function projectChildLifecycle(event: { type?: string; willRetry?: unknown }, state?: ChildLifecycleState): ChildLifecycleAction {
	if (event.type === "compaction_start") return "cancel-drain";
	if (event.type === "compaction_end") {
		if (state) state.compactionRetryActive = event.willRetry === true;
		return event.willRetry === true ? "cancel-drain" : "start-drain";
	}
	if (event.type === "agent_start" || event.type === "auto_retry_start" || event.type === "turn_start") {
		if (state) state.compactionRetryActive = false;
		return "cancel-drain";
	}
	if (event.type === "agent_end") {
		if (event.willRetry === true) return "cancel-drain";
		if (state) state.compactionRetryActive = false;
		return "start-drain";
	}
	if (event.type === "agent_settled") return state?.compactionRetryActive ? "none" : "start-drain";
	return "none";
}
