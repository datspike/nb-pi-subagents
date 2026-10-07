# extension-api

Use this guide when another Pi extension must launch or observe pi-subagents through process-local integration seams. It describes the `pi.events` RPC and lifecycle/status events; it is not a model-call guide.

## Call the RPC

The bridge is in-process: it does not cross Pi processes or reach child processes. Wait for `subagents:rpc:v1:ready`, then emit a `subagents:rpc:v1:request` event. Subscribe to `subagents:rpc:v1:reply:<requestId>` before sending the request.

```typescript
const requestId = crypto.randomUUID();
pi.events.on(`subagents:rpc:v1:reply:${requestId}`, (reply) => {
  if (reply.success) console.log(reply.data);
  else console.error(reply.error.code, reply.error.message);
});
pi.events.emit("subagents:rpc:v1:request", {
  version: 1,
  requestId,
  method: "spawn",
  params: { agent: "reviewer", task: "Review the current diff." },
});
```

The request envelope has `version: 1`, a non-empty `requestId`, a `method`, optional `params`, and optional `source`. The reply has the same `version` and `requestId`, optional `method`, and either `{ success: true, data }` or `{ success: false, error: { code, message } }`. Reject or stop on an error reply; do not infer success from an emitted request.

Methods are `ping`, `status`, `manage`, `spawn`, `steer`, `interrupt`, `stop`, `resume`, and `cost`.

- `ping` returns the protocol, methods, capabilities, event names, and current `session` data. Use its capability flags before depending on optional projections.
- `spawn` is detached and async-only: omit `async` or set it to `true`; do not set `async: false`, `clarify`, or management `action` fields. Use a structured launch (`agent`, `task`), inline script text in `script`, or a `workflow` path/resource. `workflow: true`, `workflowScript`, and `workflowScriptPath` are rejected. A script cannot be combined with `workflow`.
- `status` with no target may use the restored in-memory projection. A targeted or rich request (for example with `id`, `runId`, `dir`, `index`, `view`, or `lines`) uses the executor path. Forward `view`, `lines`, and `index` when reading a targeted status/transcript.
- `steer` requires `id`, `runId`, or `dir` and a non-empty `message`. Its `mode` is `steer` (default), `follow_up`, or `auto`. RPC steering never performs pause-and-revive recovery; use the acknowledged `deliveryStatus` (`delivered` or `queued`) as the transport result, not as proof that the child followed the message.
- `interrupt` uses the normal interrupt action and a run target.
- `stop` requires a live async run owned by the current session; it can target a workflow child with `childId` when that child is pending or running. A successful request reports `state: "stopping"`; wait for lifecycle/status evidence of the terminal state.
- `resume` requires a run target and non-empty `message`. It validates persisted recovery metadata, ownership, leases, and capability ceilings. `outputMode` is only `file-only`, and `output` must be a non-empty path.
- `manage` accepts only `schedule.list`, `schedule.show`, `schedule.history`, `schedule.pause`, `schedule.resume`, `schedule.run`, and `schedule.delete`; every action except `schedule.list` requires `id`. Other management surfaces are rejected.
- `cost` is read-only and returns the parent/child accounting report. Request it at a turn boundary, not on a timer.

## Choose the seam

RPC `spawn` is detached and async-only. For one synchronous foreground leaf agent with a typed (text or structured) result, use the structured delegation API (`pi-subagents/delegation`, `prompt-template:subagent:*` events); it is foreground-only and needs an active extension context.

## Read status safely

A successful `status` reply includes `fleet` and, when available, `asyncSnapshot`.

`fleet` is `{ version: 1, entries, totalActive, topLevelAsyncCapacity, omitted }`. Each entry has an opaque reconciliation `key`, resolved `agent`, `startedAt`, and `tokens` (`input`, `output`, `total`, optionally `window` and `windowPeak`); `role`, `model`, `effort`, and `goal` are optional. `topLevelAsyncCapacity` is `{ used, limit }`. `totalActive` counts all active records before the bounded `entries` window; `omitted` records entries not returned. Never interpret a fleet `key` as a run id or async id.

`asyncSnapshot` is a separate bounded object: `{ kind, version, generatedAt, caps, omitted, runs }`. Its `kind` is `pi-subagents.async-status-snapshot` and its `version` is `1`. `caps` describes `maxRuns`, `maxChildrenPerNode`, `maxDepth`, `maxStringLength`, and `maxSerializedBytes`; `omitted` reports `runs`, `children`, and `byteLimitExceeded`. Each node has `id`, `kind` (`subagent`, `workflow`, `step`, or `host-step`), `label`, `state`, and optional times/activity/children.

Snapshot `state` values are `queued`, `running`, `complete`, `failed`, `partial`, `paused`, `stopped`, and `rejected`. Source `pending`/`completed` values are normalized to `queued`/`complete`. Treat the projection as bounded and observational: inspect `omitted` and do not assume an absent node is complete.

## Correlate lifecycle events

Subscribe to `subagent:async-started` to retain a newly allocated async run. Its payload can include `id`, `asyncDir`, `sessionId`, `completionOwnerId`, `mode`, `agent`/`agents`, and launch metadata. `id` is the async run identity at start.

Subscribe to `subagent:async-complete` for terminal delivery. Correlate the payload by `id` or `runId`, and verify `sessionId` and `completionOwnerId` before accepting it. Completion payloads include `runId`, `sessionId`, `completionOwnerId`, terminal `state`, and `success` when produced by the normal completion path; they may also include `asyncDir`, `mode`, `timestamp`, and result metadata. A completion event is delivery/lifecycle evidence, not semantic approval of child output.

The session identity used for ownership and status matching is `sessionFile ?? sessionId` (the implementation resolves `getSessionFile()` first and falls back to `getSessionId()`). Keep that exact key across RPC requests, lifecycle events, and status records; do not substitute a display name or a child session id.

For cross-process observation, use the durable async status/result artifacts or `pi-intercom`; `pi.events` alone cannot provide it. For custom runners or other extension APIs, use their dedicated public contracts rather than importing RPC internals.
