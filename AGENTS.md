# AGENTS.md

Agents working in this repository must read [VISION.md](VISION.md) and [docs/fork-context.md](docs/fork-context.md) before making product, architecture, scope, or backlog-disposition decisions.
VISION.md is the acceptance policy for this project; `docs/fork-context.md` explains how this owner-directed fork interprets upstream material and chooses evidence. Use both to judge a proposed change, issue, or PR.
This file intentionally does not duplicate user-global or tool-level instructions.

## Fork context overlay

- This is the `datspike/nb-pi-subagents` fork, not a neutral upstream mirror. Local user intent, `VISION.md`, and `docs/fork-context.md` govern decisions; upstream code and prose are reference evidence.
- Before proposing a new mechanism, inspect the existing path, consumers, tests, and docs. Prefer the smallest change that proves one invariant.
- Keep evidence, inference, and unknown separate. Do not promote private memory, a single failure, or an upstream preference into a tracked rule without checking scope and support.

## Boundaries and sources of truth

- `VISION.md` decides whether a change fits; tests and command output prove behavior. `AGENTS.local.md`, `.task_files/`, `.runtime/`, and `.pi/` are workstation-local planning and run state: they never enter Git, the npm package, or public docs.
- Changes to the public tool contract, schemas, persistence, lifecycle, or launch API need explicit owner approval before implementation; process and documentation fixes do not.

## Evidence, inference, unknown

- Planning documents, cards, and status reports separate evidence (checked facts with a reproducible source), inference (reasoned conclusions), and unknown (undecided items).
- A completion claim needs evidence or an explicit blocked state; inference is never reported as a proven result, and an undecided item is never reported as a decision.
