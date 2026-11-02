# Product

## Register

product

## Users

Primary: the curious generalist who lands from a Hacker News link, often on a phone, often in the
evening. They have seconds to learn "which AI model plays the best chess, and is the difference
real?" and will stay only if the first screen answers it. Secondary: researchers who want to audit
the claim (intervals, game counts, method, raw CSV and PGN), and model builders looking for their
own model's row and its cost per game.

## Product Purpose

ChessDecide rates decision models at chess. Each model plays a series of games against a calibrated
Stockfish ladder and gets an Elo with a 95 % interval, in two arms: clean and hinted. The public site
is read-only research data: a leaderboard, per-model pages, series and game replays, and downloadable
data. Success is a stranger understanding the headline result in one screen, trusting it because the
uncertainty is shown, and being able to dig down to any single game.

## Brand Personality

Calm, exact, a little playful. Three words: rigorous, legible, chess-native.
The voice is fixed templates over numbers. No generated commentary, no hype, no superlatives. The
board and the eval graph are the most characterful things on the page; everything else steps back.

## Anti-references

- Crypto or neon dashboards: glows, gradients, giant hero numbers, sparkline confetti.
- SaaS landing pages: hero, three feature cards, a call to action. This is data, not a pitch.
- Fake-precision rank lists: a strict 1..40 order that implies differences inside the noise.
- Generic AI-benchmark tables: a wall of identical rows with no hierarchy or story.

Reference lanes to borrow from: LMArena for the familiar leaderboard grammar (rank, rating, interval,
games), Lichess and chess.com for board-first, chess-native visuals, Epoch AI and Artificial Analysis
for dense, filterable comparison and cost-versus-score views.

## Design Principles

1. **Uncertainty is part of the number.** A rating never appears without its interval. Arms whose
   intervals overlap are grouped into tiers, never ranked against each other.
2. **Answer first, evidence second.** The top of the page states who is best right now and what the
   biggest finding is (hints help almost everywhere). The full table is one scroll away, never the
   first thing.
3. **Compare, don't cross-reference.** Clean versus hinted, and model versus model, are shown side by
   side so nobody has to read two rows and subtract.
4. **Phone first, desktop richer.** The 400 px view is the design, not a fallback: no horizontal
   scroll, the tier summary in one screen, reachable navigation.
5. **Every claim is auditable.** Games, cost, method and raw data are one tap from any number.
   Templates over numbers; nothing generated.

## Accessibility & Inclusion

WCAG AA contrast on the dark theme, visible focus rings, full keyboard operation for the table and
compare actions. Colour is never the only signal (labels, glyphs, position). Respect
`prefers-reduced-motion`. Tabular numerals for all figures. Sorted and tiered views must make sense to
a screen reader (real tables, real headings).
