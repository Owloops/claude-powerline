# AGENTS.md

## Project overview

claude-powerline is a statusline for Claude Code, published on npm as `@owloops/claude-powerline`. Claude Code runs it on every render, passing hook data as JSON on stdin; it prints the line and exits, so render time is paid on every refresh. It has zero runtime dependencies.

## Tech stack

- TypeScript (ESM), built with tsdown, tested with Jest through ts-jest.
- Node.js 18+ (`engines`); the main bundle targets `node18`.
- `scripts/bench.ts` runs unbuilt, through Node's type stripping (Node 22.18+): erasable TypeScript only (no enums, no parameter properties).
- semantic-release publishes from `main`: commit types decide the version and generate `CHANGELOG.md`.

## Project settings

TypeScript, `tsconfig.json`:

- `strict`, `noUncheckedIndexedAccess`, `noImplicitReturns` and `noImplicitOverride` are on: an indexed access is possibly `undefined`.
- `test/` is excluded.

## Repository structure

- `src/index.ts`: CLI entry; `src/powerline.ts` assembles the line.
- `src/segments/`: one data provider per segment (`context`, `session`, `today`, `block`, `git`, `metrics`…) and `renderer.ts`, the classic powerline renderer.
- `src/tui/`: the TUI renderer and its layouts; it renders the same segments in a box.
- `src/utils/claude.ts`: hook data types and transcript (JSONL) reading.
- `src/config/`: config loading and `defaults.ts`.
- `src/browser.ts`: a second entry with no Node built-ins, exporting the renderers, themes and types for browser use.
- `plugin/`: the Claude Code plugin and its `/powerline` setup wizard.
- `scripts/bench.ts`: the comparative benchmark (see Performance).
- `pricing.json`: generated weekly by `.github/workflows/pricing.yml`; do not edit by hand.

## Commands

- `npm run typecheck`: type-checks `src/` and `scripts/`.
- `npm run lint`: ESLint with Prettier on `src/`.
- `npm test`: the Jest suite, and the only type check of `test/`.
- `npm run build`: builds `dist/` with tsdown; `bin/claude-powerline` runs `dist/index.mjs`.
- `npm run bench`: the comparative benchmark (see Performance).

Run typecheck, lint and test after changes.

## Guidelines

- A segment option works in both renderers, `src/segments/renderer.ts` and `src/tui/`; a feature that is inert in TUI layouts is incomplete.
- A new glyph is a key in both `SYMBOLS` and `TEXT_SYMBOLS` (`src/utils/constants.ts`), declared in `PowerlineSymbols` (`src/segments/renderer.ts`) and mapped in `initializeSymbols` (`src/powerline.ts`), so `charset: "text"` covers it.
- An option with a static default is listed in `src/config/defaults.ts` and documented in `README.md`.
- A constant both renderers need is defined once and shared.
- One feature or fix per PR; commits use conventional subjects with a single scope (`fix(context): …`).

## Performance

A change to the render path is measured with `npm run bench` before it is proposed, and the PR quotes the table it prints. The bench renders the base and the change in alternating pairs on generated transcripts (a short session and one of hundreds of MiB, cold and warm), in a temporary store: no real transcript or user config reaches it.

- Base: the merge base by default. In a series of commits, measure each against the one before with `--base <ref>`.
- Configurations: one run each with `--config <file>` for the changed segment alone and for the TUI style; the bare run covers the default segments in the powerline style.
- Hook data: `--payload <file>` merges top-level fields over the default and a `null` removes one. Reach the path the change touches: `{"context_window": null}` forces the context fallback; `block` and `weekly` need `rate_limits`.
- Output: the bench stops at the first pair whose outputs differ. A change meant to keep the output passes every pair. Segments that print the time (`cacheTimer`, reset countdowns) cannot be compared.
- Conditions: before numbers a PR quotes, ask the user to pin the CPU clock and stop heavy work: wall time on a loaded machine swamps a change of a few percent.
- Instructions (Linux): the column needs `perf`. When the bench drops it for `kernel.perf_event_paranoid`, ask the user to lower it (1 works).
- Disclosure: a case that gets slower or heavier is reported with its numbers.

## Boundaries

Never:

- Commit secrets, tokens or credentials, or real transcripts used as test data.
- Edit `CHANGELOG.md` or the version in `package.json`: semantic-release owns them.

Ask first before:

- Adding a runtime dependency: the README advertises zero.
- Changing the hook data contract, the config schema, or the exports of `src/browser.ts`.
- Changing a default that alters existing users' output.
