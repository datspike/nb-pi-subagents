# AGENTS.md

Agents working in this repository must read [VISION.md](VISION.md) before making product, architecture, scope, or backlog-disposition decisions.
VISION.md is the acceptance policy for this project: use it to judge whether a proposed change, issue, or PR fits.
This file intentionally does not duplicate user-global or tool-level instructions.

## Boundaries and sources of truth

- `VISION.md` decides whether a change fits; tests and command output prove behavior. `AGENTS.local.md`, `.task_files/`, `.runtime/`, and `.pi/` are workstation-local planning and run state: they never enter Git, the npm package, or public docs.
- Changes to the public tool contract, schemas, persistence, lifecycle, or launch API need explicit owner approval before implementation; process and documentation fixes do not.

## Evidence, inference, unknown

- Planning documents, cards, and status reports separate evidence (checked facts with a reproducible source), inference (reasoned conclusions), and unknown (undecided items).
- A completion claim needs evidence or an explicit blocked state; inference is never reported as a proven result, and an undecided item is never reported as a decision.
