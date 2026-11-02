<script lang="ts">
  import { PAPER, REPO } from '#lib/paper.ts';
  const { abstract } = PAPER;
</script>

<svelte:head><title>Paper · ChessDecide</title></svelte:head>

<article class="prose">
  <header class="head">
    <p class="eyebrow">Research report, as of {PAPER.asOf}</p>
    <h1>{PAPER.title}</h1>
    <p class="actions">
      <a class="primary" href={PAPER.pdf} download>Download the paper (PDF)</a>
      <a class="ghost" href={PAPER.markdown}>Read it on GitHub</a>
      <a class="ghost" href={PAPER.runData}>Raw run data</a>
      <a class="ghost" href={REPO}>Source code</a>
    </p>
    <p class="authorship"><b>Authorship.</b> {PAPER.authorship}</p>
  </header>

  <section aria-labelledby="abs-h">
    <h2 id="abs-h">Abstract</h2>
    <p>{abstract.lead}</p>
    <ul class="points">
      {#each abstract.bullets as b}<li><b>{b.k}</b> {b.v}</li>{/each}
    </ul>
    <p>{abstract.close}</p>
  </section>

  <section aria-labelledby="in-h">
    <h2 id="in-h">In the report</h2>
    <ol class="toc">
      {#each PAPER.sections as s}<li><a href={s.href}>{s.title}</a></li>{/each}
    </ol>
  </section>

  <section id="method" aria-labelledby="method-h">
    <h2 id="method-h">How the numbers are produced</h2>
    <p class="note">The short version, for reading the leaderboard. The report has the full protocol.</p>
  <h3>What is being rated</h3>
  <p>Each model is a decision model: it is given the position and a list of legal moves and returns a probability for each, with no free text. The legal moves come from a rules library, so a model can never play an illegal move. The move it picks is the one it rates most likely.</p>

  <h3>Two arms</h3>
  <p><b>Clean</b> gives the bare move options. <b>Hinted</b> adds a short description to each option (captures, checks, mates) and whether the side to move is in check. The same model is rated separately in each arm, and the arms are never merged.</p>

  <h3>The ladder</h3>
  <p>Opponents are Stockfish levels with known Elo. Levels below Stockfish's lowest strength are built by mixing in random moves, and every level is calibrated by playing the levels against each other. The scale is therefore relative to this ladder, with a random mover near 160. It is not a FIDE or lichess rating.</p>

  <h3>How a rating is computed</h3>
  <p>Each series plays games in blocks of five. The first block faces the level nearest 1200, and each later block faces the level nearest the current estimate. Colours alternate and openings are paired when both games fall in the same block. After every game the Elo posterior is recomputed with a weak normal prior. The number shown is the posterior mean, and the interval is the 95 % credible interval (the 2.5 % and 97.5 % posterior quantiles), not a classical confidence interval.</p>

  <h3>Tiers</h3>
  <p>A tier starts at the best arm not yet placed and holds every arm whose interval overlaps that arm's interval. Inside a tier the order is not evidence of a difference. Overlapping intervals mean the data cannot yet tell the arms apart; it does not prove they are equal.</p>

  <h3>Move quality</h3>
  <p>Every move a model makes is judged by Stockfish. <b>Win loss</b> is the drop in the mover's win probability, in percentage points, against the best move. A move is <b>acceptable</b> at 2.0 points or less, a <b>mistake</b> at 10 or more and a <b>blunder</b> at 20 or more. <b>ACPL</b> is the average centipawn loss of the model's moves, so lower is better. Forced moves are excluded.</p>

  <h3>Cost</h3>
  <p>Cost per game is the sum of the provider-reported cost of the model's calls in that game. Calls served from cache are not counted as spend.</p>

  <h3>Limits</h3>
  <ul>
    <li>Each arm is one series of about 50 games, so intervals are wide, around ±105 Elo. Differences smaller than that are not resolved.</li>
    <li>Ratings depend on the ladder version shown on the leaderboard. A different ladder would shift the scale.</li>
    <li>Games marked <b>adj</b> were adjudicated to save cost: after ply 30, if Stockfish's evaluation stayed at 900 centipawns or more for the same side for six plies in a row, the game ends and that side is scored the win. Games that reach 200 plies are scored as draws.</li>
    <li>Results describe play under these prompts and options, not general chess ability.</li>
  </ul>

  <h3>Data</h3>
  <p>Everything is read-only and downloadable: the <a href="/api/leaderboard/export.csv" download>leaderboard as CSV</a>, the <a href="/api/leaderboard">leaderboard as JSON</a>, and for each series a CSV and JSON export from its model page. Every game can be replayed move by move, with the model's probabilities and Stockfish's judgement for each move. The report above links the raw series and the SQL behind every number.</p>
  <p>The wording on these pages is fixed. Sentences are written once and filled in with figures from the data, so nothing on the site is written by a model.</p>
  </section>
</article>

<style>
  .prose { max-width: 68ch; display: grid; gap: var(--s5); }
  .head { display: grid; gap: var(--s3); }
  h1 { font-size: var(--t-xl); line-height: 1.25; }
  h2 { font-size: var(--t-lg); margin-bottom: var(--s3); }
  h3 { font-size: var(--t-md); margin-top: var(--s4); margin-bottom: var(--s1); }
  p, li { font-size: var(--t-md); line-height: 1.6; }
  .note { margin-bottom: var(--s2); }
  .actions { display: flex; flex-wrap: wrap; gap: var(--s2) var(--s3); align-items: center; }
  .primary { background: var(--accent); color: var(--accent-ink); font-weight: 700; border-radius: var(--radius); min-height: 44px; padding: 0 var(--s4); display: inline-flex; align-items: center; font-size: var(--t-sm); }
  .primary:hover { text-decoration: none; filter: brightness(1.08); }
  .ghost { min-height: 44px; display: inline-flex; align-items: center; font-size: var(--t-sm); }
  .authorship { font-size: var(--t-sm); color: var(--mute); max-width: 62ch; }
  .authorship b { color: var(--fg); }
  .points { margin: var(--s3) 0; padding-left: var(--s5); display: grid; gap: var(--s2); }
  b { font-weight: 650; }
  .toc { margin: 0; padding-left: var(--s5); columns: 2; column-gap: var(--s5); }
  .toc li { break-inside: avoid; padding: 2px 0; font-size: var(--t-sm); }
  ul { margin: 0; padding-left: var(--s5); display: grid; gap: var(--s2); }
  section[id='method'] { border-top: 1px solid var(--line-soft); padding-top: var(--s5); }
  @media (min-width: 720px) { h1 { font-size: var(--t-2xl); } }
  @media (max-width: 479px) { .toc { columns: 1; } }
</style>
