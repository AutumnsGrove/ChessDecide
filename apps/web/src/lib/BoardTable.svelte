<script lang="ts">
  import type { LeaderRow } from './api.ts';
  import { compareHref, eloLabel, family, MAX_COMPARE, modelHref, money, num1, pct0, shortName, tiers as tiersOf } from './leaderboard-model.ts';

  let { rows }: { rows: LeaderRow[] } = $props();

  type SortKey = 'elo' | 'acpl' | 'blunder' | 'cost' | 'name';
  let arm = $state<'all' | 'clean' | 'hinted'>('all');
  let fam = $state('all');
  let query = $state('');
  let sort = $state<SortKey>('elo');
  let picked = $state<string[]>([]);
  let all = $state(false);
  const FIRST = 20;

  const tierOf = $derived(new Map(tiersOf(rows).flatMap((t) => t.rows.map((r) => [r.arm_id, t.n] as const))));
  const families = $derived([...new Set(rows.map((r) => family(r.model)))].sort());
  const by: Record<SortKey, (a: LeaderRow, b: LeaderRow) => number> = {
    elo: (a, b) => b.elo.mean - a.elo.mean,
    acpl: (a, b) => (a.acpl ?? Infinity) - (b.acpl ?? Infinity),
    blunder: (a, b) => (a.blunder_rate ?? Infinity) - (b.blunder_rate ?? Infinity),
    cost: (a, b) => (a.cost_per_game ?? Infinity) - (b.cost_per_game ?? Infinity),
    name: (a, b) => a.model.localeCompare(b.model) || a.arm.localeCompare(b.arm),
  };
  const shown = $derived(
    rows
      .filter((r) => (arm === 'all' || r.arm === arm) && (fam === 'all' || family(r.model) === fam)
        && (query.trim() === '' || r.model.toLowerCase().includes(query.trim().toLowerCase())))
      .sort(by[sort]),
  );
  const filtering = $derived(arm !== 'all' || fam !== 'all' || query.trim() !== '');
  const label = (id: string) => { const r = rows.find((x) => x.arm_id === id); return r ? `${shortName(r.model)} ${r.arm}` : id; };

  // Up to MAX_COMPARE arms. At the limit the other boxes are disabled instead of silently dropping an earlier pick.
  function toggle(id: string) {
    if (picked.includes(id)) picked = picked.filter((x) => x !== id);
    else if (picked.length < MAX_COMPARE) picked = [...picked, id];
  }
  const full = $derived(picked.length >= MAX_COMPARE);
  const href = $derived(picked.length >= 2 ? compareHref(picked) : '');
</script>

<div class="tools" role="group" aria-label="Filter the table">
  <div class="seg" role="radiogroup" aria-label="Arm">
    {#each ['all', 'clean', 'hinted'] as a}
      <label class:on={arm === a}><input type="radio" name="arm" value={a} bind:group={arm} />{a === 'all' ? 'All arms' : a}</label>
    {/each}
  </div>
  <label class="field"><span class="sr-only">Provider</span>
    <select bind:value={fam}>
      <option value="all">All providers</option>
      {#each families as f}<option value={f}>{f}</option>{/each}
    </select>
  </label>
  <label class="field grow"><span class="sr-only">Search models</span>
    <input type="search" placeholder="Search models" bind:value={query} />
  </label>
  <label class="field"><span class="sr-only">Sort by</span>
    <select bind:value={sort}>
      <option value="elo">Sort: Elo</option>
      <option value="acpl">Sort: ACPL (low first)</option>
      <option value="blunder">Sort: blunders (low first)</option>
      <option value="cost">Sort: cost per game</option>
      <option value="name">Sort: name</option>
    </select>
  </label>
</div>

{#if shown.length === 0}
  <p class="empty note">No arms match these filters.</p>
{:else}
  <table>
    <caption class="sr-only">All arms with rating, interval, record and cost. Tick two to {MAX_COMPARE} rows to compare them.</caption>
    <thead>
      <tr>
        <th scope="col" class="pick"><span class="sr-only">Compare</span></th>
        <th scope="col">Model</th>
        <th scope="col" class="num">Tier</th>
        <th scope="col" class="num">Elo ± 95 %</th>
        <th scope="col" class="num">Games</th>
        <th scope="col" class="num">W-D-L</th>
        <th scope="col" class="num">ACPL</th>
        <th scope="col" class="num">Blunders</th>
        <th scope="col" class="num">$ / game</th>
      </tr>
    </thead>
    <tbody>
      {#each (all || filtering ? shown : shown.slice(0, FIRST)) as r (r.arm_id)}
        <tr class="arm" class:sel={picked.includes(r.arm_id)}>
          <td class="pick">
            <label><input type="checkbox" checked={picked.includes(r.arm_id)} disabled={full && !picked.includes(r.arm_id)} onchange={() => toggle(r.arm_id)} aria-label="Compare {shortName(r.model)} {r.arm}" title={full && !picked.includes(r.arm_id) ? `Up to ${MAX_COMPARE} arms at once: untick one first` : undefined} /></label>
          </td>
          <th scope="row" class="who"><a href={modelHref(r.model)}>{shortName(r.model)}</a> <span class="arm-chip {r.arm}">{r.arm}</span></th>
          <td class="num mono t" data-label="Tier">{tierOf.get(r.arm_id)}</td>
          <td class="num mono elo" data-label="Elo">{eloLabel(r)}</td>
          <td class="num mono" data-label="Games">{r.games}</td>
          <td class="num mono" data-label="W-D-L">{r.w}-{r.d}-{r.l}</td>
          <td class="num mono" data-label="ACPL">{num1(r.acpl)}</td>
          <td class="num mono" data-label="Blunders">{pct0(r.blunder_rate)}</td>
          <td class="num mono" data-label="$ / game">{money(r.cost_per_game)}</td>
          <td class="meta mono">Tier {tierOf.get(r.arm_id)} · {r.games} games · {r.w}-{r.d}-{r.l} · ACPL {num1(r.acpl)} · {pct0(r.blunder_rate)} blunders · {money(r.cost_per_game)}</td>
        </tr>
      {/each}
    </tbody>
  </table>
  {#if !all && !filtering && shown.length > FIRST}
    <button type="button" class="more" onclick={() => (all = true)}>Show all {shown.length} arms</button>
  {/if}
{/if}

{#if picked.length > 0}
  <div class="compare" role="region" aria-label="Compare selected arms">
    <span class="what">{picked.length} selected{picked.length === 1 ? ', pick at least one more' : full ? ` (the most, ${MAX_COMPARE})` : ''}: {picked.map(label).join(', ')}</span>
    {#if href}<a class="go" {href}>Compare</a>{/if}
    <button type="button" onclick={() => (picked = [])}>Clear</button>
  </div>
{/if}

<style>
  .tools { display: flex; flex-wrap: wrap; gap: var(--s2); margin-bottom: var(--s3); }
  .seg { display: inline-flex; background: var(--panel); border-radius: var(--radius); padding: 2px; }
  .seg label { position: relative; min-height: 36px; display: inline-flex; align-items: center; padding: 0 var(--s3); font-size: var(--t-sm); color: var(--mute); border-radius: 4px; cursor: pointer; text-transform: capitalize; }
  .seg label.on { background: var(--panel-2); color: var(--fg); }
  .seg input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
  .seg label:focus-within { outline: 2px solid var(--accent); outline-offset: 1px; }
  .field { display: inline-flex; }
  .field.grow { flex: 1 1 140px; }
  select, input[type='search'] {
    min-height: 40px; width: 100%; background: var(--panel); color: var(--fg); border: 1px solid var(--line);
    border-radius: var(--radius); padding: 0 var(--s3); font: inherit; font-size: var(--t-sm);
  }
  input[type='search']::placeholder { color: var(--faint); }
  .more { margin-top: var(--s3); min-height: 40px; background: none; border: 1px solid var(--line); color: var(--accent); border-radius: var(--radius); padding: 0 var(--s4); font-size: var(--t-sm); }
  .empty { padding: var(--s5) 0; }

  table { width: 100%; border-collapse: collapse; font-size: var(--t-sm); }
  th, td { text-align: left; padding: 0 var(--s2); }
  thead th { font-size: var(--t-xs); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mute); font-weight: 600; white-space: nowrap; padding-bottom: var(--s2); border-bottom: 1px solid var(--line); }
  tbody tr { border-bottom: 1px solid var(--line-soft); }
  tbody tr:hover { background: color-mix(in oklch, var(--panel) 70%, transparent); }
  tbody tr.sel { background: color-mix(in oklch, var(--accent) 12%, var(--bg)); }
  td, tbody th { height: 40px; font-weight: 400; }
  .who a { color: var(--fg); font-weight: 600; }
  .who { white-space: nowrap; }
  .who .arm-chip { margin-left: var(--s2); }
  .num { text-align: right; white-space: nowrap; }
  .elo { color: var(--fg); }
  .meta { display: none; }
  .pick { width: 36px; padding-left: 0; }
  .pick label { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; }
  input[type='checkbox'] { width: 18px; height: 18px; accent-color: var(--accent); cursor: pointer; }

  .compare {
    position: sticky; bottom: var(--s3); margin-top: var(--s4); display: flex; flex-wrap: wrap; align-items: center; gap: var(--s2) var(--s3);
    background: var(--panel-2); border: 1px solid var(--line); border-radius: var(--radius); padding: var(--s2) var(--s3);
    box-shadow: 0 6px 20px oklch(0 0 0 / 0.35);
  }
  .compare .what { flex: 1 1 200px; font-size: var(--t-sm); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .go { background: var(--accent); color: var(--accent-ink); font-weight: 700; border-radius: var(--radius); padding: 0 var(--s4); min-height: 40px; display: inline-flex; align-items: center; }
  .go:hover { text-decoration: none; filter: brightness(1.08); }
  .compare button { background: none; border: 0; color: var(--mute); min-height: 40px; padding: 0 var(--s2); }

  /* phone: each arm becomes a two-line card, no horizontal scroll */
  @media (max-width: 719px) {
    thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    table, tbody { display: block; }
    tr.arm {
      display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; grid-template-areas: 'pick who elo' 'pick meta meta';
      column-gap: var(--s2); padding: var(--s2) 0;
    }
    tr.arm td, tr.arm th { height: auto; padding: 0; }
    td.pick { grid-area: pick; align-self: center; }
    th.who { grid-area: who; align-self: end; overflow: hidden; text-overflow: ellipsis; }
    td.elo { grid-area: elo; align-self: end; font-size: var(--t-md); }
    td[data-label]:not(.elo) { display: none; }
    td.meta { display: block; grid-area: meta; font-size: var(--t-xs); color: var(--mute); white-space: normal; }
  }
</style>
