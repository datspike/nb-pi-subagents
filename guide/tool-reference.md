# tool-reference

Use this guide when choosing an execution mode or controlling a run: workflows, evidence and acceptance, models/context, budgets, output, resume, steering, stopping, command control, or durable run artifacts. The tool schema supplies types and defaults; this page supplies the decisions and failure boundaries.

## Start one child or a workflow

For one direct child, provide `agent` and `task`. For orchestration, put a ` ```js workflow ` block in the reply and call `subagent({ workflow: true })`. Use `runs.run(key, params)` for sequential or conditional work and `runs.all([{key, agent, task}, ...])` for ordinary parallel fanout. `runs.all` returns an ordered array, not a key map; consume indexes, destructuring, or `.map`, and await every launched promise. Do not use legacy top-level `chain`, `tasks`, or `parallel` unless `workflow-scripts` is disabled; that configuration exposes the structured replacement.

A workflow string containing `/` is a script path, resolved relative to the request `cwd`; another string is a named resource. Named resources are the permission-aware path, for example `{ workflow: "run-ci", args: { command: "npm test" } }`. Named workflows cannot be combined with `agent` or `task` at the top level. Raw scripts (`workflow: true` or a script path) have unknown resource provenance and cannot call `runs.host`. In governed workflows, named resources own authority; issued commands and relative output paths use the workflow `cwd`. There is no per-step `cwd`; set it on the outer request or change directory in the command.

Use `action: "validate"` with a workflow before launching when static syntax, literal child refs, or structure should be checked. Validation does not resolve dynamic keys or values. Use `runs.lanes(lanes)` only for independent lanes with ordered stages; later stages may use `resume: "previous"`. Use raw `runs.run`/`runs.all` for conditional or rolling fanout. The lane board reports bounded state, run ids, output references, errors, and verdicts; prose is not parsed.

## Choose context, model, tools, and skills

Set `context: "fresh"` or `context: "fork"` when the choice matters. Explicit `fresh` always wins. Explicit `fork` fails if the parent session, current leaf, or branched session cannot be persisted; it never silently falls back. An omitted context follows `defaultSubagentContext`, then the agent's `defaultContext`; an implicit fork preference falls back to fresh when no persisted parent/leaf exists. Forked sessions strip provider-private Anthropic thinking blocks but keep the requested thinking level.

For `model`, first call `subagent({ action: "models" })` and use an exact `provider/id`; a bare id is safe only when unique. A suffix such as `provider/id:high` selects thinking level. `fast` is a native OpenAI-Codex priority tier, not a general latency guarantee. Agent names are not model ids. `skill` and the agent's configured skills/extensions determine available knowledge and tools; they do not grant authority to raw workflow scripts.

External CLI profiles are a separate runner. They are async-only and receive one combined prompt over stdin; native Pi options such as `model`, `outputSchema`, `acceptance`, `toolBudget`, `fast`, `context: "fork"`, skills, and native tools are not available unless that runner implements them. Require `runner.available === true` from `action: "list", capabilities: true`, but treat it only as passive command discoverability: PATH/PATHEXT/X_OK does not prove authentication, version compatibility, or a successful launch. The authoritative check is runner preflight. Supported lifecycle is status artifacts, logs, timeout, and stop; do not plan on native steer/resume/pause or nested children. An external-job provider may support `action: "resume"` only when it exposes `followUp(input)`.

## Bound execution and output

Use `timeoutMs` or `maxRuntimeMs` as the outer deadline. A deadline is not a mutation-safe boundary. For async single-agent work, `checkpointBeforeDeadlineMs` asks the child to finish its current tool call, report files and validation, and start no new work; it is best effort. Set a hard `toolBudget` mainly on read-only scouts, reviewers, or validators. Do not use hard tool or usage caps as a safety boundary for mutation-capable writers: `toolBudget` blocks configured tools after the hard count, while `usageBudget` hard limits stop later launches but do not stop already-running children.

Bind durable child output with `output` and, when appropriate, `outputMode: "file-only"`; a filename mentioned only in task prose does not route output. The file-only result is a pointer such as `Output saved to: ...`; failed runs still return inline diagnostics. In workflows, give a child an explicit output path when later steps need a durable file and return its `outputReference`, `outputPathMapping`, or `artifactPaths`. For structured results use `outputSchema`; there is one structured-output source per child.

Use `gate` when one host command is the whole verification contract. It is equivalent to verified acceptance with one command, cannot be combined with `acceptance` except `false`, and cannot be used on retained resume. A typed gate `{ command, output: "json" }` parses passing stdout into `structuredOutput` (and optionally validates `schema`); it runs after the output file is saved. Empty, non-JSON, truncated, or invalid output fails the gate. Do not combine typed gates with `outputSchema`. Typed gates are not memoized.

## Require evidence and acceptance

Every run has an effective acceptance policy. Omit `acceptance` for the inferred policy; use an object when evidence is part of the contract. Levels are `auto`, `none`, `attested`, `checked`, and `verified`. Declared `acceptanceRole: "writer"` infers checked evidence (and review for async/dynamic writers), `"read-only"` infers none, and an omitted role infers lightweight attestation. Task wording and agent names do not change inference. Use `{ level: "none", reason: "..." }` to disable inferred gates; bare `"none"` is invalid. `acceptance: false` is only the deprecated disable shorthand.

For verified work, request concrete evidence such as `changed-files`, `tests-added`, `commands-run`, `validation-output`, `residual-risks`, `no-staged-files`, `diff-summary`, `review-findings`, and `manual-notes`. `evidenceStatus` distinguishes `claimed`, `attested`, `checked`, `verified`, `review-required`, `reviewed`, and `rejected`; child prose is not verification. Explicit verification commands must pass on the host. Checked writers reject staged changes by default; a deliberate single writer may use `preserveStagedIndex: true`, which compares the repository index tree and does not stage or restore files. Do not use that option for concurrent writers sharing a worktree.

## Resume a retained child

First use `action: "children.list"` only inside a workflow-oriented retained-child decision. It shows at most the last ten retained workflow children and is not a complete list of direct native children. If the exact intended run id is known, inspect it with `action: "status", id: "<run-id>"`; then attempt `action: "resume"` with that exact id. `resume` performs the authoritative eligibility check and may reject the candidate. Resume only a row reported `resumable` or a candidate confirmed by exact-id status.

If no known candidate exists, or authoritative resume rejects eligibility, launch a same-role new challenge and label it as a fallback in the task/result. Do not silently switch execution mode or model. A stopped run is not resumable; restart it as a new run. `resume` and `agent` are mutually exclusive, and a retained resume keeps the stored agent, model, and tool contract. `gate` and `extensionBindings` are rejected on retained resume.

Inside a workflow, resume with `await runs.run(newKey, { resume: runId, task })`. Use a new stable key for every resume pass; same-key calls are reusable only with identical launch parameters. Each pass returns a new `runId`, so continue from the latest id. A loop must therefore update its id:

```js workflow
let result = await runs.run("implement", { agent: "worker", task: "Implement the accepted contract" });
for (const pass of [1, 2]) {
  result = await runs.run("followup-" + pass, {
    resume: result.runId,
    task: "Revisit pass " + pass + ": " + result.output
  });
}
return result;
```

Top-level `action: "resume"` is detached and returns a background receipt. A live run is not revived; use `action: "steer"` for acknowledged live guidance. A completed external job can resume only through its provider's `followUp` capability.

## Inspect status, steer, yield, cancel, or stop

Use `action: "status", id: "<exact-run-id>"` for one run; status also resolves exact foreground, async, and nested ids before prefix fallback. `view: "transcript"` tails the selected transcript (up to 500 lines); `view: "fleet"` is a read-only active-run surface. A child-safe fanout must use an id rather than enumerating unrelated top-level runs. Always report the exact failure, run id, repository/cwd/worktree/ref state, and partial diff before a same-protocol retry.

Use `action: "steer", id: "<run-id>"` for a live child. It targets a run id, not a workflow key; in a workflow use `runs.steer(key, message, options)`. Await or return the steering promise. `mode: "follow_up"` queues text for the next turn and does not revive a completed child; `mode: "auto"` avoids automatic pause-and-revive recovery. A delivered/queued receipt means transport acceptance or correlated consumption, not model compliance. Do not use steer as the sole challenge for a completed retained child.

Command controls are narrower than run controls. They work only for a direct local native Pi child that explicitly has both `bash` and `subagent_command` in its tools, and require the owning parent, run `id`, child `index` when applicable, and the exact `toolCallId` for mutations:

```ts
subagent({ action: "command.status", id: "<run-id>", index: 0, toolCallId: "<tool-call-id>" })
subagent({ action: "command.yield", id: "<run-id>", index: 0, toolCallId: "<tool-call-id>" })
subagent({ action: "command.cancel", id: "<run-id>", index: 0, toolCallId: "<tool-call-id>" })
```

`command.yield` releases the selected blocking call without restarting the process. `command.cancel` aborts only that command; the child receives a tool error and may continue. `cancel_requested` acknowledges a request; `cancelled` means the backend settled. A stale `toolCallId` never targets a later command. `yieldTimeMs` and `waitMs` are 0–30,000 ms. Yielded handles are not successful exits. Unfinished owned commands make normal run completion fail; interrupt, stop, timeout, and disposal clean them up.

Use `action: "interrupt"` for a run-scoped interruption. Use `action: "stop"` only for a current-session top-level async run: it is terminal and not resumable. To stop one child of a workflow while siblings continue, pass its child id (`childId`); only pending/running children qualify. Foreground and nested targets are rejected by `stop`.

## Read async artifacts

For an async run, retain its `asyncId`/`asyncDir` and inspect the durable snapshot before guessing from prose. `status.json` is the status snapshot; `events.jsonl` is the append-only event stream. The directory also contains run logs (including `subagent-log-<id>.md` where applicable), child/session output, and debug artifacts such as `debug.run`. Treat these as observability evidence, not a second control API. Status can expose session and artifact paths, nested paths, child identities, acceptance/evidence state, and output references.

A workflow receipt and its status artifacts are authoritative for what was scheduled and settled. A missing or malformed artifact is unknown and must fail closed; do not report success from a final message alone. For large output, follow the saved pointer or artifact path instead of requesting an unbounded transcript.

## Governed workflow and lane evidence

Use lane evidence only when a workflow's existing handoff manifest gives the exact `laneId` (the owning `runId`) and `handoffPath`. `lane.status` reports `active`, `terminal-eligible`, `terminal-blocked`, `superseded-eligible`, or `unknown` and prints a cleanup plan invocation; it does not run cleanup. `lane.recordMerge` and `lane.recordSupersession` attest facts at an explicit update boundary; stale lane ids, conflicting heads, malformed evidence, or later manifest changes fail closed. `worktree.cleanup` separately plans with `mode: "plan"` and applies only a reviewed `planId`; do not infer ownership or delete a worktree from prose.

## Escalate unknowns

When an oracle or advisor result is `unknown`, do not guess or silently pick a runner, model, or execution mode. Resolve it through supervisor dialogue (`contact_supervisor`) and record the decision or blocker. When infrastructure fails, preserve the governed protocol and ask the owner before any external, foreground, CLI, or other fallback.
