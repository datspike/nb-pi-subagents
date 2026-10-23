# Session index policy for service children

`session-index-policy` is launch metadata, not prompt content. A policy may come only from the structured child launch request: the built-in `reviewer` role receives the default review policy, while `eval-session-marker` passes an explicit eval policy together with `subagentOnlyExtensions`.

The host writes the policy as a `session-index-policy` custom entry through `SessionManager` before `createAgentSession()` starts. For a persisted child, the file is flushed at that point. The marker therefore exists in the new JSONL before the first provider request; a child extension may verify the same `session_id` during `before_provider_request`.

In-process children share the parent process environment. Policy variables are cleared before each child startup and applied only while that child is loading, starting, or making a policy-sensitive turn. Those operations are serialized because `process.env` is process-global; the parent values are restored afterwards. External runner environments remove inherited policy variables before adding the policy selected for the current child.

Forked sessions copy transcript entries, but an inherited `session-index-policy` entry is removed before the fork is used as a child session. Retained entries are re-linked around the removed marker, so the new child can write its own marker with its own `session_id` without leaving a dangling `parentId`. `parentSession` remains the SDK's lineage link.

Ordinary `worker` and `scout` launches do not receive a policy. Ambient policy variables from a parent cannot grant them one, and prompt text, file names, and `parentSession` are never used to infer policy.
