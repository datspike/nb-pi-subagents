import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { projectChildLifecycle, type ChildLifecycleState } from "../../src/runs/shared/child-lifecycle.ts";

describe("child lifecycle final drain", () => {
	for (const type of ["turn_start", "agent_start", "auto_retry_start"]) {
		it(`cancels a pending final drain when resumed work emits ${type}`, () => {
			const state: ChildLifecycleState = { compactionRetryActive: false };
			assert.equal(projectChildLifecycle({ type: "message_end" }, state), "none");
			assert.equal(projectChildLifecycle({ type }, state), "cancel-drain");
			assert.equal(projectChildLifecycle({ type: "agent_settled" }, state), "start-drain");
		});
	}

	it("holds the final drain across threshold compaction", () => {
		const state: ChildLifecycleState = { compactionRetryActive: false };
		assert.equal(projectChildLifecycle({ type: "agent_end", willRetry: false }, state), "start-drain");
		assert.equal(projectChildLifecycle({ type: "compaction_start" }, state), "cancel-drain");
		assert.equal(projectChildLifecycle({ type: "compaction_end", willRetry: false }, state), "start-drain");
		assert.equal(projectChildLifecycle({ type: "agent_settled" }, state), "start-drain");
	});

	it("does not drain compaction settlement before its retry starts", () => {
		const state: ChildLifecycleState = { compactionRetryActive: false };
		assert.equal(projectChildLifecycle({ type: "compaction_end", willRetry: true }, state), "cancel-drain");
		assert.equal(projectChildLifecycle({ type: "agent_settled" }, state), "none");
		assert.equal(projectChildLifecycle({ type: "auto_retry_start" }, state), "cancel-drain");
		assert.equal(state.compactionRetryActive, false);
		assert.equal(projectChildLifecycle({ type: "agent_settled" }, state), "start-drain");
	});

	it("starts the final drain only at an agent lifecycle boundary", () => {
		const state: ChildLifecycleState = { compactionRetryActive: false };
		assert.equal(projectChildLifecycle({ type: "message_end" }, state), "none");
		assert.equal(projectChildLifecycle({ type: "agent_end", willRetry: false }, state), "start-drain");
		assert.equal(projectChildLifecycle({ type: "agent_settled" }, state), "start-drain");
		assert.equal(projectChildLifecycle({ type: "message_update" }, state), "none");
	});

	it("cancels the final drain when agent_end reports a retry", () => {
		const state: ChildLifecycleState = { compactionRetryActive: false };
		assert.equal(projectChildLifecycle({ type: "agent_end", willRetry: true }, state), "cancel-drain");
		assert.equal(projectChildLifecycle({ type: "agent_settled" }, state), "start-drain");
	});
});
