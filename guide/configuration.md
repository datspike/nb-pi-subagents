# configuration

Use this guide to change operator behavior or diagnose a rejected call. Config is JSON; validate it with the `doctor` action.

## Find and diagnose configuration

The extension config is `$PI_CODING_AGENT_DIR/extensions/subagent/config.json`; without `PI_CODING_AGENT_DIR` it is `~/.pi/agent/extensions/subagent/config.json`. Save a JSON object and restart Pi when required.

For an unexpected rejection, run `subagent({ action: "doctor" })` or `/subagents-doctor`. Check effective config, disabled surfaces, model scope, and capacity; disabled features are rejected at execution.

## Settings that affect model calls

These are Pi settings, not `ExtensionConfig`: `subagents.defaultModel`, `defaultProvider`, `defaultThinking`, `defaultExtensions`, `defaultSubagentOnlyExtensions`, `agentOverrides`, and `machines`. `subagents.modelScope` restricts models; `modelScope.agents.<name>` adds an agent restriction. `allow: ["inherit"]` permits the parent model; `allow: ["scoped"]` permits scoped parent models. `subagents.disableBuiltins` removes bundled agents. `agentScanDirs`, `agentExcludeDirs`, and watchdog settings are also settings.

Extension-config defaults that directly change launches:

- `asyncByDefault` → background execution when a workflow call omits `async`; `false` restores foreground default for the internal single-run path.
- `defaultSubagentContext` → default omitted launch `context`: `"fresh"` or `"fork"`; an explicit value wins.
- `timeoutMs` → default deadline for foreground and plain single-agent async runs when no call or agent timeout applies; it does not cap async composite top-level runs.
- `globalConcurrencyLimit` → maximum simultaneously running children within one run; queued workflow children wait.
- `maxActiveAsyncRunsPerSession` → maximum active top-level async runs for one parent; `0` or unset is unlimited. `capacity.abandonedSlotReleaseAfterMs` can reclaim old failed slots, risking an orphan.
- `toolDescriptionMode` → parent-facing description: compact, full, or custom; custom text cannot remove safety guidance.
- `disabledFeatures` → removes feature parameters and rejects calls using them; see below.
- `scheduledRuns` → enables durable schedules (default) and selects their store; `enabled: false` rejects schedule actions and parameters.
- `modelResponseAliases` → accepts exact declared response IDs for an exact provider/model launch; it does not rewrite routing or prove equivalence.

`disableBuiltins` and `modelScope` are not valid extension-config keys; configure them in Pi settings.

## Disable unused surfaces

`disabledFeatures` accepts each group once. Unknown names, duplicates, and `"schedules"` are errors; disable schedules with `scheduledRuns.enabled: false`. A disabled group removes its parameters and rejects its actions at every execution boundary.

- `agent-management` → option `config`; actions `create`, `update`, `delete`, `eject`, `disable`, `enable`, `reset`, `refine`, `refine.show`, `refine.rollback`.
- `watchdog` → options `scope`, `target`, `thinking`; actions `watchdog.status`, `watchdog.check`, `watchdog.configure`, `watchdog.recommend-model`.
- `panes` → option `focus`; actions `inspector.open`, `inspector.command`, `inspector.status`, `inspector.close`, `project.open`, `project.status`, `project.close`.
- `missions` → options `mission`, `missionUpdate`, `missionStatus`, `missionScope`, `missionId`, `runMode`, `runStatus`, `summary`; actions `mission.create`, `mission.list`, `mission.show`, `mission.update`, `mission.resolve-decision`, `mission.attach-run`, `mission.close`.
- `lane-management` → options `handoffPath`, `laneId`, `merge`, `supersession`, `repo`, `planId`; actions `lane.status`, `lane.recordMerge`, `lane.recordSupersession`, `worktree.discard`, `worktree.cleanup`.
- `spawn-budget-grants` → option `additional`; action `grant-spawn-budget`.
- `preflight` → option `preflight`.
- `lane-metadata` → option `lane`.
- `gates` → option `gate`.
- `usage-budgets` → option `usageBudget`.
- `tool-budgets` → option `toolBudget`.
- `control-overrides` → option `control`.
- `extension-bindings` → option `extensionBindings`.
- `external-machines` → option `machine`.
- `workflow-scripts` → options `workflow`, `args`, `preflight`, `globalConcurrencyLimit`, `maxSubagentSpawnsPerRun`; action `validate` and all workflow-script carriers are rejected. `/run` still launches one direct child; `chain` and `tasks` remain non-script alternatives.

Disabling a per-call option does not disable configured defaults (`toolBudget`, `usageBudget`, `control`) or screens outside the executor. Restart Pi after changing this setting.

## Other `ExtensionConfig` keys

- `forkContext` → prepares inherited context for fork launches; `mode: "pruned"` requires a summarizing `model`.
- `foregroundDetachShortcut` → key that detaches an active foreground run.
- `fleetView` → shows or hides persistent FleetView without disabling tracking.
- `fleetViewPlacement` → places FleetView above or below the editor.
- `fleetKeybindings` → replaces selected keys in the full Fleet inspector.
- `asyncWidget` → shows or hides the under-editor widget.
- `asyncWidgetCollapsed` → starts new async widgets folded.
- `toolActivation` → startup offering behavior: `auto`, `dynamic`, or `eager`.
- `inlineToolDisplay` → rich or summary inline result rendering.
- `mainWindowRenderer` → main-chat spacing and collapsed result line limits.
- `orcaProgressTabs` → best-effort progress mirror; it never changes the authoritative run.
- `forceTopLevelAsync` → forces depth-0 single, parallel, and chain runs into background mode.
- `waitTool` → enables `bg_wait` and sets its default blocking timeout.
- `defaultSessionDir` → fallback directory for child sessions.
- `singleRunOutputBaseDir` → base directory for relative `/run` outputs.
- `maxSubagentDepth` → limits nested delegation without a stricter inherited limit.
- `maxSubagentSpawnsPerSession` → cumulative child-launch cap; `0` means unlimited.
- `maxSubagentSpawnsPerRun` → cumulative logical-child cap for one run tree.
- `toolTimeoutMs` → hard per-tool-call deadline.
- `checkpointBeforeDeadlineMs` → lead time for an async checkpoint-and-stop request.
- `control` → authority for operational actions (`auto`, `confirm`, or `forbid`).
- `completionBatch` → batches nearby successful completion notifications.
- `toolBudget` → default tool-call budget.
- `permissions` → native child tool permission rules; `bash` is outside this policy.
- `usageBudget` → usage budget for child runs.
- `parallel` → default task count and concurrency for parallel execution.
- `chain` → defaults for chain execution.
- `worktreeSetupHook` → command run once per managed worktree.
- `worktreeSetupHookTimeoutMs` → setup-hook timeout.
- `worktreeBaseDir` → dedicated root for native managed worktrees.
- `worktree` → default managed-worktree isolation.
- `worktreeProvider` → selects `auto`, `native`, or `worktrunk` allocation.
- `worktreeBranchPrefix` → namespace for managed-worktree branches.
- `artifactDir` → stores artifacts in project, session, or OS temp space.
- `artifactConfig` → artifact cleanup retention.
- `intercomBridge` → injected coordination guidance and optional external delivery.
- `resultScanLogging` → slow-scan logging: `all`, `activity`, or `off`.
- `proactiveSkillSubagents` → enables or configures proactive skill subagents.
- `missions` → automatic mission records, retention, and storage.
- `authorityPolicy` → sets supported actions to `auto`, `confirm`, or `forbid`.

If rejection persists after restart, match the error's action/parameter to its disabled group before changing other settings.
