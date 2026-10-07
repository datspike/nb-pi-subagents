# agents

Use this guide when choosing a child agent, defining agent frontmatter, or diagnosing discovery and runner selection. The tool schema supplies parameter types; this page supplies routing rules and launch-affecting semantics.

## Choose an agent

Start with a capability-aware catalog, not a remembered name:

```json
{"action":"list","capabilities":true,"agentScope":"both"}
```

Select only an agent the result reports as runnable. Match the task to the advertised description and capabilities; for an `external-cli` agent also require `runner.available === true`. `agentScope` is `both` by default; use `user` or `project` to inspect one scope. If a name is ambiguous, repeat the request with the intended scope.

Builtin roles are:

- `scout`: local codebase reconnaissance.
- `researcher`: web or documentation research with sources; `evidence-auditor`: independent review of research claims.
- `worker`: implementation and validation; `reviewer`: implementation review and small fixes.
- `oracle`: read-only second opinion; `advisor`: the bundled equivalent name for advisory review.
- `delegate`: general-purpose delegation close to the parent.
- `codex-exec` / `claude-code` / `cursor-agent`: read-only external CLI analysis; their `*-writer` counterparts explicitly edit the workspace.

Prefer `scout` before code changes when entry points are unknown, `worker` for an approved implementation, and a fresh-context `reviewer` for independent checking. Do not infer that an advertised agent is executable: `list` with `capabilities:true` is the final check.

## Define an agent

An agent file is YAML frontmatter followed by its prompt. Keep the frontmatter limited to behavior the launch contract actually consumes. A compact shape is:

```yaml
---
name: scout
description: Fast codebase reconnaissance
advertise: true
tools: read, grep, find, ls
model: provider/model
thinking: high
skills: review-checklist
defaultContext: fresh
acceptanceRole: read-only
maxSubagentDepth: 1
---
```

Use these fields when the behavior matters:

- Identity/discovery: `name`, `description`, `advertise`, `aliases`, and optional `package`. `advertise: true` adds the name and description to the parent catalog; it does not authorize or launch the agent.
- Child capabilities: `tools` is an explicit allowlist; an omitted `tools` uses normal builtins, while an empty list gives no tools. `excludeTools` narrows the result. `extensions` controls ambient extension loading, and `subagentOnlyExtensions` loads extensions only in child sessions. `allowNestedSubagents: true` enables child-safe nesting; `allowedAgents` narrows descendant names but does not grant nesting by itself.
- Model and context: `model` selects the default model; `thinking` supplies a thinking level unless `model` already has a `:level` suffix. `defaultContext` is `fresh` or `fork`. An implicit `fork` falls back to `fresh` when no persisted parent/leaf exists; an explicit launch `context:"fork"` remains strict.
- Prompt/context inputs: `systemPromptMode` is `replace` or `append`; `inheritProjectContext`, `inheritGlobalContext`, and `inheritSkills` control inherited context. `skills` selects named skills and `skillPath` adds private discovery locations.
- Execution defaults: `async`, `timeoutMs`, `toolTimeoutMs`, `output`, `outputMode`, `defaultReads`, and `defaultProgress` set launch/output defaults. `acceptance` sets the default acceptance policy; `acceptanceRole` is `read-only` or `writer` and affects automatic acceptance inference, not tool permissions.
- Delegation limits: `maxSubagentDepth` tightens nested delegation. It cannot widen an inherited depth or capability ceiling.

For a writer agent, declare `acceptanceRole: writer` when writer acceptance inference is intended. A custom file that shadows a bundled agent replaces it wholesale: omitted frontmatter is not inherited.

## Discover scopes and resolve collisions

Agents are discovered from lowest to highest precedence: builtins, package agents, user agents, then project agents. User agents are under the user agent directory; project agents are under the configured project `agents` directory, with legacy `.agents` also read. Nested directories are scanned recursively; `.chain.md` is not an agent file.

Use `agentScope: "user"`, `"project"`, or `"both"` to control discovery. With `both`, a project definition wins a same-name user definition; user/project definitions override package and builtin names. A project definition also wins a same-name legacy `.agents` definition. If both scopes contain a mutable target, management actions may require an explicit `agentScope` rather than guessing.

`subagents.agentScanDirs` adds scan roots, while `subagents.agentExcludeDirs` prunes literal subtrees. Fixed user/project directories retain priority over same-name scan-root agents. Package manifests may expose agents through `pi-subagents.agents` or `pi.subagents.agents`.

To remove all bundled roles from discovery, set `subagents.disableBuiltins: true`. To disable one discovered agent without replacing its file, use its scoped override with `disabled: true`; disabled agents are omitted from discovery and capability listings. Project overrides beat user overrides, so enabling or changing only the user scope cannot defeat a project override.

## Use external CLI agents

Define a local command with `runner.type: external-cli`, a non-empty `command`, optional `args` (array of strings), and optional `promptDelivery: stdin`. The other supported runner types are `pi` and `external-job`; external runners reject Pi-only fields such as `tools`, `skills`, `maxSubagentDepth`, `toolBudget`, and nested-agent controls. They are one-shot and async-only, receive the assembled prompt through their runner contract, and do not provide native Pi structured output or forked transcript context.

The code-owned adapters are `codex-exec`, `codex-exec-writer`, `claude-code`, `claude-code-writer`, `cursor-agent`, and `cursor-agent-writer`. Read-only profiles cannot be widened by user arguments; choose the writer profile for explicit workspace edits. `runner.available` is only passive executable discovery, not proof of authentication or launch compatibility; launch preflight is authoritative. Do not silently switch to an external runner after a native failure.

## Manage agents

Management actions are `create`, `update`, `delete`, `eject`, `disable`, `enable`, `reset`, and `refine`; use them only when the `agent-management` feature is enabled. Scope-sensitive actions accept `agentScope: "user"` or `"project"`; target the winning scope explicitly when a collision or higher-precedence override is reported. `eject` copies a bundled definition for editing; `reset` restores a bundled default and refuses when no bundled default exists. `refine` creates a bounded project-local overlay rather than editing the base agent file.
