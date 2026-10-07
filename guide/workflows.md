# workflows

Use this guide when writing a `workflowScript`: choose the right orchestration primitive, pass data between children, use retained lineage, or diagnose sandbox and validation failures. For general launch, acceptance, and retained-child resume policy, see [tool-reference](tool-reference.md#resume-a-retained-child).

## Start a workflow script

Put one JavaScript body in a ` ```js workflow ` block in the same reply as `subagent({ workflow: true })`, or pass a script path containing `/` (read relative to the request `cwd`). Any other string is a named workflow resource. Raw scripts (`workflow: true` or a path) cannot use `runs.host`; named resources may grant it. `agent` and `task` are for one direct child and cannot be combined with `workflow`.

The script is ordinary statements with an explicit `return`. Use top-level `await`; do not define nested `async` functions, async arrows, or async methods. A plain helper returning `runs.run(...)` is valid. The sandbox has no filesystem, shell, arbitrary Pi tools, or host globals. `console.log`, `console.info`, `console.warn`, and `console.error` are captured as workflow console output.

```js workflow
const scan = await runs.run("scan", { agent: "scout", task: "Inspect the target and report facts." });
return runs.run("review", { agent: "reviewer", task: "Review these facts:\n" + scan.output });
```

## Launch one child or ordinary fanout

Use `runs.run(key, params)` for one child or a sequential/conditional step. `key` must be 1–128 characters, start with a letter or number, and contain only letters, numbers, `.`, `_`, or `-`. `params` is one-child execution data: normally `agent` plus a non-empty `task`, or a retained `resume` plus a non-empty follow-up `task`. `resume` and `agent` are mutually exclusive. Await the result before reading `.output`.

Use `await runs.all([{ key, agent, task }, ...])` for independent fanout. It returns an ordered array, not a key map: use indexes, destructuring, or `.map`; `results.someKey` is rejected. Passing already-launched `runs.run(...)` promises is permissive but loses batch validation, batch grouping, and failure collection; pass configuration objects for normal fanout. A failed child in normal `runs.all` is returned with `ok: false` rather than being silently treated as success.

```js workflow
const results = await runs.all([
  { key: "api", agent: "reviewer", task: "Review the API." },
  { key: "ui", agent: "reviewer", task: "Review the UI." }
]);
return results.map((result) => ({ key: result.key, ok: result.ok, output: result.output }));
```

Child controls inherited from the outer workflow can be overridden per child. `runs.run` and `runs.all` reject orchestration fields such as `tasks`, `chain`, `parallel`, `workflowScript`, and `action`; use JavaScript and the workflow helpers instead.

## Keep keys stable and preserve lineage

Treat every child key as a stable address within one workflow invocation. Reusing a key with different launch parameters fails with `Duplicate workflow key`; this includes params after ordinary JSON key ordering is canonicalized. A key cannot be shared by `runs.run` and `runs.host`. Use distinct keys for genuinely distinct attempts and for each resume pass.

Workflow results carry the child `runId`, `key`, `ok`, `output`, and (when requested) `structuredOutput` or `outputReference`. Return plain JSON projections rather than class instances, promises, or raw sandbox objects. `runs.ref(result)` formats one bounded reference; `runs.refs(results)` formats an array of references.

A retained child can be resumed inside the script with a new stable key and `resume: previousRunId`; the resume request must include a non-empty follow-up `task`, and must not include `agent`. A workflow receipt can identify the latest resumable child with `{ workflowRunId, key, latest: true }`. Eligibility is checked at launch; use the resume procedure in [tool-reference](tool-reference.md#resume-a-retained-child), not a guessed or stale id. A `runs.lanes` stage cannot start from an arbitrary resume id; use a normal `runs.run` for that case.

## Run sequential lanes

Use `await runs.lanes(lanes)` for a bounded set of independent chains with the same stage shape. Each lane is `{ key, stages }`; each stage has its own `key` plus child params. The first stage of every lane launches together. Later stages run only after their predecessor succeeds. Set a later stage's `resume` to the literal `"previous"` to pass the predecessor's retained `runId`; the first stage cannot use it.

Generated child keys are `<lane>.<stage>`, so lane and stage keys must be valid and globally collision-free. The complete lane inventory is validated before launch: at most 32 lanes, 16 stages per lane, 64 total stages, and 64 KiB canonical JSON. A lane failure, stopped/detached result, or `structuredOutput.verdict === "blocked"` blocks only that lane and marks later stages `skipped`; sibling lanes continue. Reviewer prose is never interpreted as a verdict. The returned board is bounded: lane/stage keys, states, `runId`, `outputReference`, errors, and an optional `verdict`; it is not a transcript.

Use raw `runs.run`/`runs.all` when the next launch depends on arbitrary branching, a rolling queue, or data that does not fit fixed lanes.

## Run rolling fanout

For a rolling council, launch keyed promises, wait for the next completion with `Promise.race`, steer a still-live key if needed, then collect the rest with `Promise.all`. Every stored launch must be observed by `await`, `Promise.race`, `Promise.all`, or a returned promise before the script ends. Keep the key next to its promise so the completed result can remove the correct pending entry.

```js workflow
const pending = ["a", "b", "critic"].map((key) => ({
  key,
  promise: runs.run(key, { agent: "reviewer", task: "Analyze the proposal." }).then((result) => ({ key, result }))
}));
const first = await Promise.race(pending.map((item) => item.promise));
const rest = await Promise.all(pending.filter((item) => item.key !== first.key).map((item) => item.promise));
return { first: first.result.output, rest: rest.map((item) => item.result.output) };
```

Use `await runs.steer(key, message, options)` for a live workflow child, where `key` is the workflow key, never a raw run id. `options.mode` is `"steer"`, `"follow_up"`, or `"auto"`; `index` is a non-negative child index and `ackTimeoutMs` is positive. The receipt states `queued`, `delivered`, `missed`, or `failed`; delivery is transport acknowledgement, not proof that the model followed the message. Await or return the steering promise.

## Run host command steps

Call `runs.host(key, params)` only from a named resource that explicitly grants host authority. Raw scripts receive `runs.host is unavailable`. The params shape is `{ kind: "command", command, timeoutMs, output?, role?, provider? }`; `kind` must be `"command"`, `timeoutMs` is 1–86400000, and `output` is a bounded relative path without traversal. `role` is `"ci"` or `"gate"`.

There is no per-step `cwd`: commands and relative output paths use the outer workflow `cwd`. Set `cwd` on the outer `subagent` request, or deliberately change directory in the trusted command. Await or return the host promise; an unobserved host call fails workflow settlement. Non-zero exit, timeout, abort, or output-write failure fails the workflow. The host step has no stdin and bounded stdout/stderr/log output.

The package-owned `run-ci` resource admits only `npm test` and `npm run typecheck` with a bounded timeout. Its `args` accept only `command` and `timeoutMs`.

## Persist workflow state and emit progress

When the workflow has a mission, `state.get(key)` and `state.set(key, value)` provide mission state. Keys use the same stable-key pattern as child keys; values must be plain finite JSON, with no cycles, symbols, sparse arrays, or class objects. `state` is absent when mission state is disabled or the workflow is ephemeral (`mission: false`). Await both calls when their result is needed.

`emit(value)` publishes a bounded JSON value during execution and can be called more than once. It unwraps `runs.all` result arrays before validation. Emit is progress/evidence, not a child-completion signal; the workflow result and child receipts remain authoritative. `console` is diagnostic output, not structured state.

## Use args safely

`args` is workflow input data, not an authority grant. Omitted args become `{}`. Arguments are plain JSON only, limited to 16 fields per object, 64 items per array, depth 8, and 16 KiB total; strings are bounded as well. The script receives a deeply frozen copy, so do not mutate it. Args are persisted for replay and diagnosis: never put secrets in them. They do not enable `runs.host`, filesystem access, or shell access.

## Isolate writers and hand off worktrees

Set `worktree: true` on the workflow or on each writing child to give children managed Git worktrees; a child can override the workflow default with `worktree: false`. Use isolation for concurrent writers and keep one writer per shared cwd otherwise. Before a materialized group of fresh isolated children is dispatched, the source must be a Git repository with a clean working tree (apart from `.pi/subagents/` runtime state). A rejected group launches no children. Retained resumes keep their original contract.

`baseRef` must be `HEAD` or a supported named ref such as `refs/heads/release`, `refs/tags/v1`, or `origin/main`; full commit ids and revision expressions such as `HEAD~1` are rejected. The ref is resolved at worktree allocation, and the source must still be clean.

A writing child captures its patch and handoff manifest as part of the existing worktree lifecycle. Return or emit its `artifactPaths`/handoff reference to the parent; status paths and branches are display data, not deletion authority. Do not infer that a worktree is safe to delete from prose or from a displayed path. Lane merge evidence and cleanup procedures are in [tool-reference](tool-reference.md#governed-workflow-and-lane-evidence).

## Diagnose validation failures

- If the script fails before children launch, fix JavaScript syntax, empty input, nested async functions, or a statically non-JSON boundary value. Markdown fences/backticks inside task text can terminate a reply-block script; build long text from quoted lines joined with `"\n"`.
- If a launch fails, check the literal agent name against `{action: "list", capabilities: true}` and check that every key is valid and not reused with different params. Dynamic keys and dynamic agents are checked at launch, not reliably by static validation.
- If `runs.all` complains about the result shape, use indexes/destructuring/`.map`, never property access by child key. If it reports unawaited launches, observe every promise before returning.
- If a lane is blocked, inspect its board: a predecessor may have failed, stopped, lacked a retained `runId`, or returned `structuredOutput.verdict === "blocked"`; later stages are intentionally `skipped`.
- If a host step is rejected, use a named resource with explicit authority, remove per-step `cwd`, use a supported command/relative output, and await or return the call.
- If an isolated group is rejected, clean the source Git tree or choose an operator-approved `cwd`/commit; isolation is never silently dropped.
- A workflow failure is not permission to switch to another CLI, foreground mode, or shell path. Report the exact error, run id, repository/cwd/branch/ref state, and partial diff; retry through the same protocol or ask the owner.
