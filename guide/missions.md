# missions

Use this guide for delegated work that must survive restarts, or for workflows using durable schedules. A mission is a durable record; a run is one linked execution.

## Launch with a mission

A run/workflow with a task creates an active mission unless `missions.enabled` is `false`. Results expose `details.missionId`; async runs persist a binding. Automatic persistence failure appears as `details.missionWarning` and does not block the run.

Pass an existing `missionId` to reuse a record in the current project store. Do not combine `missionId` and `mission`. Pass `mission: false` for an ephemeral workflow: no mission is created for it or its children, and there is no `state` global.

Explicit creation takes exactly one non-empty `title` or `summary`; `objective` and `labels` are optional. `goal: true` requires `budget: { tokens: <positive integer> }`.

```ts
subagent({ action: "mission.create", mission: { title: "Ship auth refresh" } })
subagent({ workflow: true, missionId: "<mission-id>" })
```

Workflow children belong to the enclosing mission. Active mission workflows may use `state.get(key)`/`state.set(key, value)` for durable JSON state (maximum 256 KiB).

## Inspect and update

Use `mission.list` for project records, or `missionScope: "global"` for the user-local pointer index. Project records are authoritative; missing records can be stale. Use `mission.show` before recovery: it refreshes linked async status but does not restart runs. Continue with `status`, `steer`, `resume`, or `stop`.

Use `mission.update` for metadata, goal/budget changes, `artifacts`, `receipts`, and `decisions`. An open decision makes an active mission `needs_decision` and keeps active or completed missions gated. Resolve it with:

```ts
subagent({ action: "mission.resolve-decision", missionId: "<mission-id>", id: "<decision-id>", summary: "Use option B." })
```

Use `mission.attach-run` for an existing run. Supply `missionId` and `runId` (or `id`); optional `dir`, `agent`, `runMode`, and `runStatus` describe it. It marks the mission `active`. Modes: `single`, `parallel`, `chain`, `workflow`, `scheduled`, `external`.

## Close and retain

Use `mission.close` when done. `missionStatus` must be `completed`, `failed`, or `cancelled`; an optional `summary` must be non-empty. Closing does not stop linked runs or schedules. Terminal records are pruned after `retainTerminal` (default 200); retention is best-effort.

## Schedules

Schedules are rejected while `scheduledRuns.enabled` is `false`. Manage them with `schedule.create`, `schedule.list`, `schedule.show`, `schedule.history`, `schedule.pause`, `schedule.resume`, `schedule.run`, `schedule.run-due`, and `schedule.delete`.

A schedule accepts only an existing `missionId`; creation and updates are unsupported. Creation validates the mission in the target project store; each fire re-resolves it and fails before execution if missing or invalid. Mission-bound definitions use schema version 2; older readers must reject them. Fires are async with fresh context.

`mission.close` does not pause future fires: use `schedule.pause` or `schedule.delete`. Schedules do not protect missions from terminal retention; a later fire can reactivate a non-goal terminal mission. Only `overlap: "skip"` and `catchUp: "latest"` or `"none"` are supported. Disable schedules through `scheduledRuns.enabled`, not `disabledFeatures`.
