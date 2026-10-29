<script lang="ts">
  import type { LeaderRow } from './api.ts';
  import { armLabel, money, num1, overlapsWith, pct0, separationLabel } from './leaderboard-model.ts';

  let { rows }: { rows: LeaderRow[] } = $props();

  const labels = $derived(new Map(rows.map((r) => [r.arm_id, armLabel(r)])));
  const overlaps = $derived(new Map(rows.map((r) => [r.arm_id, overlapsWith(r, rows)])));
</script>

<table>
  <thead>
    <tr>
      <th scope="col">Model · arm</th>
      <th scope="col" class="num">Elo</th>
      <th scope="col" class="num">W-D-L</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.arm_id)}
      {@const over = overlaps.get(row.arm_id) ?? []}
      <tr class="arm">
        <th scope="row">
          <a href="/series/{row.series_id}">{armLabel(row)}</a>
          {#if over.length}<span class="approx" title="not separable from {over.join(', ')}">≈</span>{/if}
        </th>
        <td class="num mono strong">{Math.round(row.elo.mean)}<span class="hw"> ± {Math.round(row.elo.half_width)}</span></td>
        <td class="num mono">{row.w}-{row.d}-{row.l}</td>
      </tr>
      <tr class="detail">
        <td colspan="3">
          <span class="mono">{row.games} games · score {pct0(row.score_pct)} · {money(row.cost_usd)} · ACPL {num1(row.acpl)} · acc {pct0(row.acceptable_rate)} · blunders {pct0(row.blunder_rate)}</span>
          {#if !over.length && rows.length > 1}
            <span class="apart">separated from {separationLabel(row, labels)}</span>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 0 5px; }
  thead th { font-size: 10px; letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); font-weight: 600; white-space: nowrap; padding-bottom: 4px; }
  tr.arm th, tr.arm td { padding-top: 8px; }
  tr.arm th { font-weight: 600; }
  tr.arm a { color: var(--fg); text-decoration: none; }
  tr.arm a:hover { text-decoration: underline; }
  tr.detail td { padding-bottom: 9px; border-bottom: 1px solid var(--line); font-size: 11px; color: var(--mute); }
  tbody tr:last-child td { border-bottom: 0; }
  .num { text-align: right; white-space: nowrap; }
  .strong { color: var(--fg); font-size: 15px; }
  .hw { color: var(--mute); font-size: 12px; }
  .approx { color: var(--warn); margin-left: 4px; }
  .apart { color: var(--good); margin-left: 6px; }
</style>
