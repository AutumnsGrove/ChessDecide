/* "New game / New series" dialog shared by all mockup pages. */
(function () {
  const { estimate, fmtUSD, LADDER } = CD;
  const wrap = document.createElement('div');
  wrap.className = 'modal-bg'; wrap.id = 'ngModal';
  wrap.innerHTML = `
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ngTitle">
    <h2 id="ngTitle">New</h2>
    <div class="tabs" id="ngMode" style="margin:0 20px"><button data-v="series" class="on">Series (Elo rating)</button><button data-v="game">Single game</button></div>
    <div class="body">
      <div class="row2">
        <div class="field"><label for="ngModel">Decision model</label>
          <select id="ngModel">
            <optgroup label="Roster"><option value="0.042" selected>typesafe/jev-1.14 · $0.042/M</option><option value="0.042">liquid/d1-ultra · $0.042/M</option></optgroup>
            <optgroup label="More models (catalog)"><option value="0.100">openai/gpt-6-luna-decisions · $0.100/M</option><option value="0.042">microsoft/microsoft-decision-1 · $0.042/M</option><option value="0.020">liquid/d1 · $0.020/M</option><option disabled>jaredpalmer/kev-4b — context 8,192 &lt; est. 3.1k×safety</option></optgroup>
          </select>
        </div>
        <div class="field"><label>Option format (arm)</label>
          <div class="seg" id="ngArm" style="width:fit-content"><button class="on" data-v="clean">clean</button><button data-v="hinted">hinted</button></div>
          <div class="dim" id="ngArmNote" style="font-size:12px">UCI keys, plain descriptions. No check/mate hints — the honest test.</div>
        </div>
      </div>

      <!-- series -->
      <div id="ngSeries" style="display:grid;gap:14px">
        <div class="field"><label>Games</label>
          <div class="row2" id="ngSize" style="grid-template-columns:repeat(3,1fr)">
            <div class="opt on" data-v="25"><div><b>Quick · 25</b><span>≈ ±135 Elo · first look</span></div></div>
            <div class="opt" data-v="50"><div><b>Standard · 50</b><span>≈ ±95 Elo</span></div></div>
            <div class="opt" data-v="completion"><div><b>To completion</b><span>until ±<span id="ngTarget">75</span> Elo (max 200)</span></div></div>
          </div>
          <div id="ngTargetRow" style="display:none;align-items:center;gap:10px"><span class="dim" style="font-size:12.5px">Stop when 95% interval half-width ≤</span><input type="number" id="ngTargetIn" value="75" step="5" min="25" style="width:80px;background:var(--bg);border:1px solid var(--line);color:var(--text-hi);border-radius:3px;padding:5px 8px"><span class="dim" style="font-size:12.5px">Elo — or when the budget cap is hit</span></div>
        </div>
        <div class="field"><label>Opponent ladder</label>
          <div class="seg" id="ngLadder" style="width:fit-content"><button class="on" data-v="adaptive">Adaptive (recommended)</button><button data-v="fixed">Fixed level</button></div>
          <div id="ngFixed" style="display:none"><select id="ngLevel">${LADDER.map((l) => `<option ${l.id === 'uci1500' ? 'selected' : ''}>${l.label} · ${l.elo}</option>`).join('')}</select></div>
          <div class="dim" style="font-size:12px" id="ngLadderNote">Blocks of 5 games; each block's opponent is the ladder level nearest the current Elo estimate. Random 4-ply openings, colours alternate.</div>
        </div>
      </div>

      <!-- single game -->
      <div id="ngGame" style="display:none;gap:14px">
        <div class="row2">
          <div class="field"><label>Model plays</label><div class="seg" id="ngSide"><button class="on" data-v="white">White</button><button data-v="black">Black</button><button data-v="random">Random</button></div></div>
          <div class="field"><label>Opponent level</label><select id="ngOpp">${LADDER.map((l) => `<option ${l.id === 'uci1500' ? 'selected' : ''}>${l.label} · ${l.elo}</option>`).join('')}</select></div>
        </div>
        <div class="row2">
          <div class="field"><label>Opening</label><div class="seg" id="ngOpen"><button class="on" data-v="startpos">Start position</button><button data-v="random4">Random 4 plies</button></div></div>
          <div class="field"><label>Pace (min. time per move)</label><select id="ngPace"><option>0 ms</option><option>300 ms</option><option selected>600 ms</option><option>1000 ms</option></select></div>
        </div>
      </div>

      <div class="field"><label for="ngCap">Budget cap (USD)</label><input type="number" id="ngCap" value="1.00" step="0.05" min="0.01" style="max-width:160px"></div>
      <div class="estimate" id="ngEst">
        <div><div class="lab" id="ngLab1">Typical</div><div class="big" id="ngTyp">—</div></div>
        <div><div class="lab" id="ngLab2">Worst case</div><div class="big" id="ngWorst">—</div></div>
        <div style="flex:1"></div><div class="ok" id="ngOk"></div>
      </div>
      <div class="dim" style="font-size:12px" id="ngFoot"></div>
    </div>
    <div class="foot"><button class="btn ghost" id="ngCancel">Cancel</button><button class="btn primary" id="ngStart">Start</button></div>
  </div>`;
  document.body.appendChild(wrap);
  const $ = (s) => wrap.querySelector(s);
  const st = { mode: 'series', arm: 'clean', size: '25', ladder: 'adaptive' };
  const seg = (id, cb) => $(id).addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); cb && cb(b.dataset.v); });

  function recompute() {
    const price = parseFloat($('#ngModel').value) || 0.042;
    const cap = parseFloat($('#ngCap').value) || 0;
    let typ, worst, t1, t2;
    if (st.mode === 'series') {
      const games = st.size === 'completion' ? 60 : parseInt(st.size, 10);
      const worstGames = st.size === 'completion' ? 200 : games;
      typ = estimate({ calls: games * 30, pricePerM: price }); worst = estimate({ calls: worstGames * 100, pricePerM: price });
      $('#ngLab1').textContent = st.size === 'completion' ? 'Typical (≈ 60 games)' : `Typical (${games} games × ~60 plies)`;
      $('#ngLab2').textContent = `Worst case (${worstGames} games × 200 plies)`;
      t1 = `${games * 30} calls`; t2 = `${worstGames * 100} calls`;
      $('#ngFoot').textContent = `≈ ${st.size === 'completion' ? '30–45' : Math.round(games * 0.35)} min wall-clock with 2 games in parallel · adjudication ends hopeless games early · Stockfish is free.`;
    } else {
      typ = estimate({ calls: 30, pricePerM: price }); worst = estimate({ calls: 100, pricePerM: price });
      $('#ngLab1').textContent = 'Typical game (≈ 60 plies)'; $('#ngLab2').textContent = 'Worst case (200 plies)'; t1 = '30 calls'; t2 = '100 calls';
      $('#ngFoot').textContent = 'Single games are for watching and debugging; they do not produce a rating.';
    }
    $('#ngTyp').innerHTML = `${fmtUSD(typ.cost, 4)} <small class="dim" style="font:12px var(--font)">${t1}</small>`;
    $('#ngWorst').innerHTML = `${fmtUSD(worst.cost, 4)} <small class="dim" style="font:12px var(--font)">${t2}</small>`;
    const overT = typ.cost > cap, overW = worst.cost > cap;
    $('#ngEst').classList.toggle('over', overT);
    $('#ngOk').textContent = overT ? `✕ exceeds cap $${cap.toFixed(2)}` : overW ? `✓ typical under cap · worst case would stop at $${cap.toFixed(2)}` : `✓ worst case under cap $${cap.toFixed(2)}`;
    $('#ngStart').disabled = overT || cap <= 0;
    $('#ngStart').textContent = st.mode === 'series' ? 'Start series' : 'Start game';
  }
  function setMode(m) {
    st.mode = m; $('#ngSeries').style.display = m === 'series' ? 'grid' : 'none'; $('#ngGame').style.display = m === 'game' ? 'grid' : 'none';
    $('#ngMode').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x.dataset.v === m)); $('#ngTitle').textContent = m === 'series' ? 'New series' : 'New game'; recompute();
  }
  $('#ngMode').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setMode(b.dataset.v); });
  seg('#ngArm', (v) => { st.arm = v; $('#ngArmNote').textContent = v === 'clean' ? 'UCI keys, plain descriptions. No check/mate hints — the honest test.' : 'SAN keys (Qxf7#), “check/checkmate” in the text. Readable, but leaks.'; });
  seg('#ngLadder', (v) => { st.ladder = v; $('#ngFixed').style.display = v === 'fixed' ? '' : 'none'; $('#ngLadderNote').textContent = v === 'adaptive' ? "Blocks of 5 games; each block's opponent is the ladder level nearest the current Elo estimate. Random 4-ply openings, colours alternate." : 'Every game against one level. Elo is still fitted, but results near 0% or 100% say little.'; });
  seg('#ngSide'); seg('#ngOpen');
  $('#ngSize').addEventListener('click', (e) => { const o = e.target.closest('.opt'); if (!o) return; st.size = o.dataset.v; $('#ngSize').querySelectorAll('.opt').forEach((x) => x.classList.toggle('on', x === o)); $('#ngTargetRow').style.display = st.size === 'completion' ? 'flex' : 'none'; recompute(); });
  $('#ngTargetIn').addEventListener('input', (e) => { $('#ngTarget').textContent = e.target.value; });
  $('#ngModel').addEventListener('change', recompute); $('#ngCap').addEventListener('input', recompute);
  const open = (m) => { wrap.classList.add('show'); setMode(m || 'series'); };
  const close = () => wrap.classList.remove('show');
  $('#ngCancel').addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('#ngStart').addEventListener('click', () => {
    close();
    if (st.mode === 'game') { if (window.onStartGame) window.onStartGame({ arm: st.arm }); else location.href = 'play.html?demo=live'; }
    else location.href = 'series.html?demo=running&size=' + st.size + '&arm=' + st.arm;
  });
  document.addEventListener('click', (e) => { if (e.target.closest('#newGameBtn')) open('game'); if (e.target.closest('#newSeriesBtn')) open('series'); });
  window.openNewGame = () => open('game'); window.openNewSeries = () => open('series');
})();
