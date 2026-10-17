# Fork context

This repository is the `datspike/nb-pi-subagents` development line. It is an owner-directed fork of `nicobailon/pi-subagents`, not a neutral mirror.

## Local contract

The current user request and this repository's `AGENTS.md` and `VISION.md` define the working contract. They decide what to build, what to reject, and what evidence is sufficient. The fork may preserve upstream behavior, but upstream prose, defaults, process habits, and product preferences are reference material rather than authority.

When sources disagree, keep the distinction explicit:

- **Evidence** is a checked fact from code, tests, command output, or a named primary source.
- **Inference** is an interpretation that still needs to be checked.
- **Unknown** is a decision or behavior that has not been established.

Do not turn private memory, an old conversation, a single failure, or an upstream proposal into a repository rule without selecting the durable principle and checking its scope.

## Working method

For a change in this fork:

1. State the user-visible outcome before choosing a mechanism.
2. Inspect the existing path, consumers, tests, and documentation before adding a second path.
3. Prefer the smallest change that proves the intended invariant; do not widen public API, persistence, lifecycle, or launch behavior without an explicit reason and evidence.
4. Treat tests and command output as proof of behavior. Treat documentation as the contract for future work, not as proof that code works.
5. Keep the parent/operator in control: work must remain visible, bounded, recoverable, and honest about residual risk.
6. Record material decisions and their rationale in the appropriate project or task artifact. Do not copy private session history or credentials into tracked files.

## Reading upstream material

Upstream code, tests, issues, and documentation are useful for understanding compatibility and available primitives. They do not automatically define this fork's goals, quality bar, style of engineering, or acceptance criteria. Port an upstream change only after checking that it serves this fork's contract and does not silently reintroduce a rejected path.

For model-facing delegation, use the sequence `local contract → focused project brief → checked code/tests/docs → current task → evidence`. A child may receive only the relevant slice; the parent remains responsible for interpreting the result against the local contract.

## Scope boundary

This overlay governs how work in the fork is understood and verified. It does not replace the public tool schema, child launch contract, persistence format, lifecycle rules, or upstream compatibility tests. Changes to those surfaces still need their existing owner-approval and evidence gates.
