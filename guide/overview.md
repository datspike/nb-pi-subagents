# overview

Use this map when deciding which guide to read before a delegation call. It is a compact index, not a product history.

- `overview` — parent/child roles, launch modes, completion delivery, and artifact locations.
- `workflows` — scripted orchestration, parallel or sequential children, lanes, budgets, and workflow recovery.
- `agents` — discover, configure, and select runnable child agents.
- `missions` — durable objectives, run attachment, delivery, and mission lifecycle.
- `observability` — status, FleetView, transcripts, lifecycle evidence, and run inspection.
- `tool-reference` — exact execution and management parameters, controls, output, acceptance, and runners.
- `configuration` — persistent extension settings and environment configuration.
- `models` — child model selection, thinking levels, defaults, and scope rules.
- `watchdog` — opt-in adversarial change review and attention controls.
- `extension-api` — RPC, preflight, capabilities, and provider integration contracts.
- `council` — model-based advisors and pass-based decision workflow.

## Parent, child, and the three launch modes

The parent is the current Pi session and remains the orchestrator and decision maker. A child is a focused Pi session launched with its own `agent` and `task`; ordinary children do the assigned work, not orchestration. Delegate only when the operator's request or applicable instructions authorize it.

1. **One child:** omit `action` and provide `agent` plus `task`. Execution controls such as `cwd`, `model`, `output`, `acceptance`, and `async` apply to that launch. Use one writer per cwd/worktree; isolate concurrent writers.
2. **Workflow script:** put a ` ```js ` workflow block in the same reply and call `subagent({workflow:true})`. Inside it, use `runs.run(key, {agent, task})` for a child or `runs.all([{key, agent, task}, ...])` for ordinary parallel fanout. Await every launch before reading its result or returning. `runs.run` cannot start a nested workflow or management action.
3. **Existing runs:** provide `action` to inspect or control a known run. Use `action` values such as `status`, `steer`, `interrupt`, `stop`, and `resume`; target the exact `id` when controlling a run. Use `view:"transcript"` to inspect a transcript. Inspection and control actions do not launch a child; `schedule.run` and `schedule.run-due` do (async).

## Async completion

Launches are async by default. After starting ordinary async work, end the turn: completion arrives as a message in the parent session. Do not poll with `status`, sleep, or `bg_wait`; use `bg_wait` only for provider, detached, or other background work without native completion notification when a same-turn result is truly needed. Use `async:false` only when the parent must block.

A completion message is the delivery signal, not proof that the task's semantic result is good. Check the returned status, output, evidence, and residual risks; a failed process may still have partial output.

## Run and artifact locations

A launch result can expose `asyncDir`, `artifactsDir`, `artifactPaths`, `outputReference`, and session paths. The lifecycle directory `asyncDir` contains `status.json` and append-only `events.jsonl`; inspect these when status or completion details are insufficient. Debug and durable child files are routed under `artifactsDir` according to the selected artifact policy, with concrete files exposed through `artifactPaths`. Keep returned paths with the run `id`; do not infer success from a final message alone.