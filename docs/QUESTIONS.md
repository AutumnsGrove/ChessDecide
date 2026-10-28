# Questions and decisions

- T00: moved the daemon from 8787 to 8731 and pinned Vite to 5273 (`strictPort`); Autumn's machine has the defaults busy. Reference copy in `docs/build/reference/` left pristine.
- T01: `@chessdecide/api` depends on `@chessdecide/providers` so `/api/estimate` and `/api/games` can price models from the catalog; no other package boundary moved. Mock mode still validates the model slug against the catalog (so the UI cannot start a typo) but skips the key check.
- T02: the New game "Mock model" checkbox is informational and disabled: mock mode is a daemon-wide flag (`CHESSDECIDE_MOCK=1`), so the browser cannot switch it per game. `GET /api/games` gained a `plies` count for the list rows.
