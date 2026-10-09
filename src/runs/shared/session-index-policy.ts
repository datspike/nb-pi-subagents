import type { SessionManager } from "@earendil-works/pi-coding-agent";

export const SESSION_INDEX_POLICY_CUSTOM_TYPE = "session-index-policy";
export const SESSION_INDEX_POLICY_ENV = "PI_SESSION_INDEX_POLICY";
export const SESSION_INDEX_REASON_ENV = "PI_SESSION_INDEX_REASON";
export const SESSION_INDEX_SOURCE_ENV = "PI_SESSION_INDEX_SOURCE";

export type SessionIndexPolicyReason = "review" | "eval" | "memory-maintenance";

export interface SessionIndexPolicyRequest {
	reason: SessionIndexPolicyReason;
	source?: "pi-subagents" | "eval-session-marker";
}

export interface SessionIndexPolicyData {
	version: 1;
	policy: "exclude";
	reason: SessionIndexPolicyReason;
	source: "pi-subagents" | "eval-session-marker";
	session_id: string;
}

/**
 * Resolve only launch-owned role metadata. Prompt text, parent identity and cwd
 * are deliberately not inputs: they cannot grant a child indexing authority.
 */
export function resolveSessionIndexPolicy(agent: string, request?: SessionIndexPolicyRequest): SessionIndexPolicyRequest | undefined {
	if (request) return { reason: request.reason, source: request.source ?? "pi-subagents" };
	return agent === "reviewer" ? { reason: "review", source: "pi-subagents" } : undefined;
}

/**
 * Add the marker before AgentSession lifecycle starts. A matching marker is
 * idempotent for resume; any other marker is a hard conflict so history is not
 * silently reclassified. Persisted children are flushed through the installed
 * SDK's verified rewrite seam before model/provider work can begin.
 */
export function ensureSessionIndexPolicy(
	sessionManager: Pick<SessionManager, "getEntries" | "appendCustomEntry" | "getSessionId"> & Partial<Pick<SessionManager, "isPersisted" | "getSessionFile">>,
	request: SessionIndexPolicyRequest | undefined,
): void {
	if (!request) return;
	const sessionId = sessionManager.getSessionId();
	const desired: SessionIndexPolicyData = { version: 1, policy: "exclude", reason: request.reason, source: request.source ?? "pi-subagents", session_id: sessionId };
	const entries = sessionManager.getEntries().filter((entry) => entry.type === "custom" && entry.customType === SESSION_INDEX_POLICY_CUSTOM_TYPE);
	if (entries.length > 1) throw new Error("Session index policy conflict: child session contains multiple session-index-policy markers.");
	const existing = entries[0] as (typeof entries[number] & { data?: unknown }) | undefined;
	if (existing) {
		if (JSON.stringify(existing.data) !== JSON.stringify(desired)) {
			throw new Error(`Session index policy conflict: existing marker ${JSON.stringify(existing.data)} does not match requested ${JSON.stringify(desired)}.`);
		}
	} else {
		sessionManager.appendCustomEntry(SESSION_INDEX_POLICY_CUSTOM_TYPE, desired);
	}
	if (sessionManager.isPersisted?.()) {
		const persistent = sessionManager as unknown as { _rewriteFile?: () => void; flushed?: boolean };
		if (typeof persistent._rewriteFile !== "function" || typeof persistent.flushed !== "boolean") throw new Error("Session index policy cannot be persisted before child lifecycle: SDK SessionManager persistence state is unavailable.");
		if (!persistent.flushed) {
			persistent._rewriteFile();
			// The SDK otherwise exclusively creates this file on the first assistant.
			persistent.flushed = true;
		}
	}
}

export function sessionIndexPolicyEnv(policy: SessionIndexPolicyRequest | undefined): Record<string, string> | undefined {
	if (!policy) return undefined;
	return {
		[SESSION_INDEX_POLICY_ENV]: "exclude",
		[SESSION_INDEX_REASON_ENV]: policy.reason,
		[SESSION_INDEX_SOURCE_ENV]: policy.source ?? "pi-subagents",
	};
}
