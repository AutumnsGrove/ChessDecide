<svelte:head><title>Method · ChessDecide</title></svelte:head>

<article class="prose">
  <h1>Method</h1>
  <p class="lede">How the ratings are produced, what each number means, and what they do not show.</p>

  <h2>What is being rated</h2>
  <p>Each model is a decision model: it is given the position and a list of legal moves and returns a probability for each, with no free text. The legal moves come from a rules library, so a model can never play an illegal move. The move it picks is the one it rates most likely.</p>

  <h2>Two arms</h2>
  <p><b>Clean</b> gives the bare move options. <b>Hinted</b> adds a short description to each option (captures, checks, mates) and whether the side to move is in check. The same model is rated separately in each arm, and the arms are never merged.</p>

  <h2>The ladder</h2>
  <p>Opponents are Stockfish levels with known Elo. Levels below Stockfish's lowest strength are built by mixing in random moves, and every level is calibrated by playing the levels against each other. The scale is therefore relative to this ladder, with a random mover near 160. It is not a FIDE or lichess rating.</p>

  <h2>How a rating is computed</h2>
  <p>Each series plays games in blocks of five. The first block faces the level nearest 1200, and each later block faces the level nearest the current estimate. Colours alternate and openings are paired when both games fall in the same block. After every game the Elo posterior is recomputed with a weak normal prior. The number shown is the posterior mean, and the interval is the 95 % credible interval (the 2.5 % and 97.5 % posterior quantiles), not a classical confidence interval.</p>

  <h2>Tiers</h2>
  <p>A tier starts at the best arm not yet placed and holds every arm whose interval overlaps that arm's interval. Inside a tier the order is not evidence of a difference. Overlapping intervals mean the data cannot yet tell the arms apart; it does not prove they are equal.</p>

  <h2>Move quality</h2>
  <p>Every move a model makes is judged by Stockfish. <b>Win loss</b> is the drop in the mover's win probability, in percentage points, against the best move. A move is <b>acceptable</b> at 2.0 points or less, a <b>mistake</b> at 10 or more and a <b>blunder</b> at 20 or more. <b>ACPL</b> is the average centipawn loss of the model's moves, so lower is better. Forced moves are excluded.</p>

  <h2>Cost</h2>
  <p>Cost per game is the sum of the provider-reported cost of the model's calls in that game. Calls served from cache are not counted as spend.</p>

  <h2>Limits</h2>
  <ul>
    <li>Each arm is one series of about 50 games, so intervals are wide, around ±105 Elo. Differences smaller than that are not resolved.</li>
    <li>Ratings depend on the ladder version shown on the leaderboard. A different ladder would shift the scale.</li>
    <li>Games marked <b>adj</b> were adjudicated to save cost: after ply 30, if Stockfish's evaluation stayed at 900 centipawns or more for the same side for six plies in a row, the game ends and that side is scored the win. Games that reach 200 plies are scored as draws.</li>
    <li>Results describe play under these prompts and options, not general chess ability.</li>
  </ul>

  <h2>Data</h2>
  <p>Everything is read-only and downloadable: the <a href="/api/leaderboard/export.csv" download>leaderboard as CSV</a>, the <a href="/api/leaderboard">leaderboard as JSON</a>, and for each series a CSV and JSON export from its model page. Every game can be replayed move by move, with the model's probabilities and Stockfish's judgement for each move.</p>
</article>

<style>
  .prose { max-width: 68ch; display: grid; gap: var(--s3); }
  h1 { font-size: var(--t-xl); }
  h2 { font-size: var(--t-lg); margin-top: var(--s4); }
  .lede { color: var(--mute); }
  p, li { font-size: var(--t-md); line-height: 1.6; }
  ul { margin: 0; padding-left: var(--s5); display: grid; gap: var(--s2); }
  b { font-weight: 650; }
  @media (min-width: 720px) { h1 { font-size: var(--t-2xl); } }
</style>
