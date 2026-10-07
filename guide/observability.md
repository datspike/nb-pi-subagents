# observability

Use this guide when you need to inspect a running or completed child, interpret lifecycle signals, or decide whether a run is actually finished. Prefer durable status and artifacts over chat text or a child’s claim of success.

## Inspect the fleet or one transcript

To see current runs, call:

```ts
subagent({ action: "status", view: "fleet" })
```

Use `view: "fleet"` for a read-only overview. It is the right first call when the run id is unknown or several children are active. To target one run, pass its exact `id` (a known id is safer than a prefix):

```ts
subagent({ action: "status", id: "<run-id>", view: "transcript", lines: 80 })
```

Use `view: "transcript"` to read a bounded transcript tail; `lines` is capped at 500 and defaults to 80. Add `index` to select one child in a chain or parallel run. A status result identifies the run and can expose `asyncDir`, session/output paths, child identities, state, activity, usage, and terminal proof. It is evidence about the run, not a control request.

For an exact targeted lookup, resolve the returned `id` rather than repeatedly polling arbitrary prefixes. A missing, malformed, or corrupt status artifact is unknown: do not report success from a final message alone.

## Read async evidence

For async runs, keep the returned `asyncDir` and inspect its machine-readable files. The meanings and retention rules for `status.json`, `events.jsonl`, transcripts, output logs, replay, and archives are covered by [tool-reference](tool-reference.md#read-async-artifacts); use that section instead of scraping terminal output or duplicating its artifact protocol here.

Use status snapshots for recovery and final state. Lifecycle events explain transitions, but an event or notification alone does not prove that execution succeeded.

## Interpret lifecycle events

`subagent:async-started` means an async run has a durable initial status and publishes its run identity and `asyncDir`; prompt fields, when present, are redacted. `subagent:async-complete` means the watcher delivered a terminal payload to the originating session. Successful workflow siblings may be batched; failed or paused completions remain visible immediately. Neither event substitutes for reading terminal status and evidence.

`events.jsonl` may contain wrapper and child-session lifecycle events such as `subagent.run.started`, `subagent.step.started`, `subagent.step.completed`, `subagent.step.failed`, `subagent.step.paused`, `subagent.step.stopped`, `subagent.run.completed`, and `subagent.run.stopped`. Treat unknown event types as forward-compatible and ignore them. Child session events are mirrored directly; `agent_settled` is the terminal watermark, while `agent_end.willRetry` defers completion until the child settles.

`subagent:child-status` carries low-latency hints for workflow or nested children. Its payload has `type: "subagent.child-status"`, `version: 1`, `runId`, `childId`, `status` (`started`, `stopping`, or `stopped`), and `ts`, with optional child metadata. Hints may duplicate across event and replay paths and are not replayed after host restart. Use the status snapshot as authoritative. To stop a child, use normal `stop` with `childId`; there is no separate child-stop API.

`subagent:process-terminal` reports process-terminal proof. `process-terminal.json` can be `pending`, `observed`, `unknown`, or `not-started`. `observed` requires the live parent to observe the exact detached runner’s close and any canonical-session lease to be free. `endedAt`, a result file, PID disappearance, or a missing lease directory is not proof. Process proof is separate from success, stopped state, and resumability; `unknown` means fail closed.

`subagent:control-event`, `subagent:control-intercom`, and visible control notices report attention conditions. They do not themselves stop or repair a run. Cross-process observation uses artifacts or intercom; `pi.events` is in-process only.

## React to child attention

The only activity states are `active_long_running` and `needs_attention`.

- `active_long_running` means the child is active but has exceeded a configured time, turn, token, or tool-open threshold. Inspect its current tool and recent output before intervening; a long-running server or watch command may be intentional.
- `needs_attention` means the tracker needs supervision, for example after an idle window, repeated mutating-tool failures, or a supervisor request. Inspect the status/transcript and resolve the cause before treating the run as complete.

Control configuration can select `notifyOn` values (`active_long_running`, `needs_attention`) and `notifyChannels` values (`event`, `async`, `intercom`). A queued steer does not cancel a shell command. A control notice is an attention signal, not proof of failure.

## Account usage and cost

Use `/subagent-cost` for the parent session’s combined parent-and-child accounting, or the RPC `cost` method for structured data. It includes completed async workflow children only while their persisted receipts and metadata remain available. Missing artifacts or child metadata make the report unavailable or a lower bound; do not infer child cost from Pi’s footer or `/session`.

Status fields such as `totalTokens` and `totalCost` are useful per-run evidence, but absent usage is not zero cost when metadata is unavailable. The RPC advertises cost support through `ping` capability `cost`.

## Inspectors and panes

Use `inspector.open`, `inspector.command`, `inspector.status`, and `inspector.close` only when an Inspect plugin is available; they are optional views over a selected async child, not the source of truth. `project.open`, `project.status`, and `project.close` concern project panes. If the `panes` feature is disabled, these actions and the `focus` option are rejected; use `status` and artifacts instead. Disablement is configured through `disabledFeatures`, not by assuming a pane exists.
