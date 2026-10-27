# T00 — Install and verify the foundation

**Goal:** the repo root contains the reference code, installs cleanly, and `pnpm verify` is green.

## Steps

1. From the repo root, copy the reference into place (keep the existing `docs/`, `README.md`, `spikes/`):
   ```bash
   cp -r docs/build/reference/. .
   ```
   This adds `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `tsconfig.base.json`, `.gitignore`,
   `.env.example`, `scripts/`, `packages/`, `apps/`. If a `.gitignore` already exists, merge (keep both sets of lines).
2. `pnpm install --frozen-lockfile`.
3. Apply the local database migration: `pnpm db:migrate` (creates `data/d1/v3/...`, gitignored).
4. Run `pnpm verify`. **Expected:** lockfile guard ok; `svelte-check` 0 errors; tests green
   (core 53+, providers 11, db 2, engine 6, api 4, runner 3, web 5). Engine/runner tests need Stockfish; if it is
   missing install it (`brew install stockfish` or point `STOCKFISH_PATH` at it) and rerun. They skip, not fail,
   without it.
5. Smoke-run the stack in mock mode (no key, no spend):
   ```bash
   pnpm cli game --white mock --black random --max-plies 20 --depth 10
   CHESSDECIDE_MOCK=1 pnpm dev        # daemon on 127.0.0.1:8787, web on the Vite port
   ```
   Open the printed Vite URL at `/games` and click the game you just played; step with ←/→.
6. Create `docs/CHANGELOG.md` (heading `# Changelog`) and `docs/QUESTIONS.md` (heading `# Questions and decisions`).
7. Read these files fully before T01 (they are the style guide): `packages/core/src/{types,ports,game,series,oracle}.ts`,
   `packages/providers/src/model-player.ts`, `packages/runner/src/{runtime,control}.ts`, `apps/web/src/lib/Viewer.svelte`.
8. Commit: `Install tested foundation from reference`.

## Acceptance

- `pnpm verify` exits 0.
- `pnpm cli game …` prints `… 1/2-1/2 max_plies plies=20 …` and `reloaded from D1: 20 plies`.
- The Viewer shows that game at 400 px width with the real board and the eval graph.
- `git status` clean after the commit; no `node_modules/`, `data/`, `.wrangler/`, `.svelte-kit/` tracked.

## Do not

Do not "improve" the reference yet. Do not change versions. Do not delete `docs/build/reference/`
(it stays as the pristine baseline; later tasks edit the root copy only).
