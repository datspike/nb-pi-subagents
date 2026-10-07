# watchdog

Use this guide when configuring the watchdog, constraining child model launches, or deciding what to do with a watchdog warning or blocked launch.

## Configure or inspect the watchdog

The watchdog is opt-in: set `subagents.watchdog.enabled` to `true`. Use these actions:

- `watchdog.status` — inspect resolved settings and runtime state.
- `watchdog.check` — validate configuration and model availability.
- `watchdog.recommend-model` — get a model recommendation; apply it separately.
- `watchdog.configure` — set a model or thinking level. `scope` is `session` by default; use `user` or `project` only when persistence is intended. `target` is `main`, `children`, or `child`; `target: "child"` requires `agent`. Session scope currently supports only `target: "main"`.

For `watchdog.configure`, `model` may be an exact model, `recommended`, or `inherit`. `thinking` accepts `inherit`, a supported thinking level, or `false`; provide `model`, `thinking`, or both. Saving a model does not enable the watchdog. Rejected while the `watchdog` feature is disabled.

## Enforce models at launch

Put per-role constraints under `subagents.watchdog.rules.roleModels`. Each role may have `allow`, `deny`, and `note` lists. Patterns are anchored, case-sensitive globs: `*` matches any run of characters and `?` one character. They match the full `provider/id[:thinking]` model and its bare `provider/id`; `deny` wins over `allow`.

Choose `action: "warn"` when the launch may proceed but the orchestrator must see the violation. Choose `action: "block"` to return a tool error and start nothing. Rules are checked before launch, need no model review, and apply to direct launches, workflow children, and chain/parallel steps. They use settings visible at the launch cwd.

```json
{
  "subagents": {
    "watchdog": {
      "rules": {
        "action": "block",
        "roleModels": {
          "worker": { "allow": ["openai-codex/gpt-5.5:high"] }
        }
      }
    }
  }
}
```

If a launch is blocked, do not retry unchanged: select a model matching `allow`, remove the matching `deny`, or change the rule deliberately. A warning is a high-importance watchdog finding; inspect its evidence and recommended action before continuing.

## Configure child reviews and cadence

Enable child reviews with `subagents.watchdog.children.enabled`. Child `model` and `thinking` set defaults; `children.overrides.<agent>` can set `enabled`, `model`, `thinking`, or `cadence`. Cadence reviews use `cadence.everyNTools`; values below 5 are rejected. A child override takes precedence over child defaults, which take precedence over top-level `cadence`.

## React to findings

A finding has severity `concern` or `blocker`, and importance `low`, `medium`, or `high`. Low/medium findings are retained for the user; only high-importance findings are delivered to the model. Treat `blocker` as a stop condition: address the evidence, rerun the relevant check, and do not claim completion while the issue remains. A repeated identical boundary warning reaches `stalemate` after `stalemateRepeats` (default 3); continuation then stops. Start a new user prompt after fixing the issue.

When the review is clean, continue normally. Do not act on a warning without reading its evidence and recommended action. `watchdog.check` or `watchdog.status` can confirm configuration/runtime state; they do not replace the corrective work requested by a finding.
