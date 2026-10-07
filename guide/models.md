# models

Use this guide when selecting a child model, diagnosing model resolution, or constraining models with `modelScope`.

## Choose a model

Before passing `model`, call `subagent({ action: "models" })` and copy an exact `provider/id` from the session registry. A bare id is accepted only when unique; a qualified provider query never silently switches providers. Separator, case, and trailing-date differences may fuzzy-match, but exact `provider/id` is safest. Use `subagent({ action: "models", agent: "worker" })` to inspect one agent's effective model, source, thinking, and current session model.

Model selection precedence is:

1. Per-run `model`.
2. The selected agent's model (frontmatter or `agentOverrides.<name>.model`).
3. `subagents.defaultModel`.
4. The current parent session model.

`inherit` explicitly requests the current parent model. If no parent model is available, an enforced `inherit`/`scoped` scope fails closed. `defaultProvider` only helps resolve bare ids; it does not replace this precedence. A provider failure is returned by that launch; it does not select another model.

## Set thinking

Append one supported thinking suffix to the model: `:off`, `:minimal`, `:low`, `:medium`, `:high`, `:xhigh`, or `:max` (for example, `openai-codex/gpt-5.6-luna:high`). The suffix overrides the agent thinking default. Otherwise use the run `thinking`/agent setting; `thinking: false` disables the configured default. A `maxThinking` ceiling rejects a request above the configured ceiling before startup.

## Restrict models

Set `subagents.modelScope` in user or project settings:

```json
{
  "subagents": {
    "modelScope": {
      "enforce": true,
      "strict": true,
      "allow": ["openai-codex/gpt-5.*"],
      "agents": { "worker": { "allow": ["openai-codex/gpt-5.6-luna"] } }
    }
  }
}
```

`allow` is a non-empty list of case-insensitive glob patterns matched against the resolved `provider/id`; only `*` is special, and thinking suffixes are ignored. A matching `agents.<name>` list is an additional restriction, not an override: the model must pass both lists. Agent rules inherit `enforce` and `strict` when omitted. Project `modelScope` replaces the complete user scope.

With `enforce: true`, an explicit tool-call/CLI model outside scope is an error. An inherited model (agent configuration, `subagents.defaultModel`, or parent model) normally warns; add `strict: true` to reject it. Enforcement requires at least one global or agent `allow` list. `inherit` expands to the current parent `provider/id`; `scoped` expands to the parent's scoped-model set, or to `inherit` when that set is empty. Neither token is sent to the child.

## Diagnose a rejected launch

- `Unknown subagent model '...'`: the explicit model did not resolve in the active registry. List models, copy the exact `provider/id`, and retry; do not guess another provider.
- `model_verification_failed`: the native child reported a model different from the launch candidate. The resolved model's thinking suffix is ignored for comparison. Only after independently verifying a response-id alias, declare the exact mapping in `modelResponseAliases`; this changes future independent native runs, not the outgoing request or retained runs.
- `Model '...' is outside the configured subagent model scope`: the resolved model failed one or more enforced allow-lists. Change the requested/configured model or the policy; scope does not choose a replacement.
- `Cannot enforce subagent model scope ... requires a current parent session model`: remove `inherit`/`scoped`, provide a parent model, or stop enforcement.

## Use fast mode

Set `fast: true` on the run, agent frontmatter, or `subagents.agentOverrides.<name>.fast` only for a native `openai-codex/*` child. It requests the OpenAI priority tier and may cost more or use a higher quota. External runners, Anthropic models, and other providers reject it before launch; set `fast: false` to opt out of inherited fast mode.
