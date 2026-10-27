/* Shared helpers for the ChessDecide mockups (plain JS, no build step). */
(function () {
  const ICON = {
    first: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>',
    prev: '<path d="M16 5v14L6 12z"/>',
    play: '<path d="M8 5v14l11-7z"/>',
    pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>',
    next: '<path d="M8 5v14l10-7z"/>',
    last: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>',
    flip: '<path d="M7 7h10l-3-3 1.4-1.4L21 8l-5.6 5.4L14 12l3-3H7v3H5V7zm10 10H7l3 3-1.4 1.4L3 16l5.6-5.4L10 12l-3 3h10v-3h2v5z"/>',
    arrow: '<path d="M4 17.6 15.6 6H11V4h9v9h-2V8.4L6.4 20z"/>',
    knight: '<path d="M19 22H5v-2h14v2zM13 2c-1.25 0-2.42.62-3.11 1.66L7 8l2 2 2.12-1.41c.38-.25.88-.04 1 .39.12.44-.1.9-.52 1.08L8 12l-1 3v3h12c0-6-1-11-6-16z"/>',
    spark: '<path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/>',
    plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>',
  };
  const ico = (n) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

  const PAGES = [
    ['series-list.html', 'Series'],
    ['games.html', 'Games'],
  ];

  function header(active, opts = {}) {
    const spend = opts.spend ?? 0.0031;
    const cap = opts.cap ?? 1.0;
    const el = document.createElement('header');
    el.className = 'top';
    el.innerHTML = `
      <a class="brand" href="index.html"><svg viewBox="0 0 24 24" fill="currentColor">${ICON.knight}</svg>ChessDecide</a>
      <nav class="nav">${PAGES.map(([h, n]) => `<a href="${h}" class="${n === active ? 'on' : ''}">${n}</a>`).join('')}</nav>
      <div class="grow"></div>
      <span class="chip hide-s" title="OpenRouter reachable, key present"><i class="dot"></i>OpenRouter</span>
      <span class="chip hide-s" title="Stockfish 19 · 4 judge workers"><i class="dot"></i>Stockfish 19</span>
      <span class="chip spend" id="spendChip" title="Session spend vs. per-run cap">
        <span>Session <b class="num hi" id="spendVal">$${spend.toFixed(4)}</b></span>
        <span class="meter"><i id="spendBar" style="width:${Math.max(1, (spend / cap) * 100)}%"></i></span>
        <span class="dim num">cap $${cap.toFixed(2)}</span>
      </span>
      <button class="btn" id="newGameBtn">${ico('plus').replace('<svg', '<svg width="14" height="14" fill="currentColor"')}New game</button>
      <button class="btn primary" id="newSeriesBtn">${ico('plus').replace('<svg', '<svg width="14" height="14" fill="currentColor"')}New series</button>`;
    document.body.prepend(el);
  }

  function setSpend(v, cap = 1.0) {
    const a = document.getElementById('spendVal');
    if (a) a.textContent = '$' + v.toFixed(4);
    const b = document.getElementById('spendBar');
    if (b) b.style.width = Math.max(1, Math.min(100, (v / cap) * 100)) + '%';
  }

  const PIECE = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const winPct = (cp) => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
  const fmtEval = (cp) => (cp >= 1000 ? '#' : cp <= -1000 ? '-#' : (cp >= 0 ? '+' : '−') + Math.abs(cp / 100).toFixed(2));
  const fmtUSD = (v, d = 4) => '$' + v.toFixed(d);
  const ANN = { inaccuracy: '?!', mistake: '?', blunder: '??' };
  const wlClass = (wl) => (wl <= 2 ? 'good' : wl <= 5 ? 'meh' : wl < 20 ? 'bad' : 'awful');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Mock of the PROMPTS.md §10 estimator.
  function estimate({ calls, nOptions = 35, pricePerM = 0.042, state = 'slim' }) {
    const tokens = 400 + (state === 'slim' ? 45 : 75) * nOptions;
    return { tokens, cost: (calls * tokens * pricePerM) / 1e6 };
  }

  // Chessground brushes used for arrows.
  const BRUSHES = {
    best: { key: 'best', color: '#7fb82e', opacity: 0.92, lineWidth: 10 },
    jc: { key: 'jc', color: '#3692e7', opacity: 0.9, lineWidth: 10 },
    jh: { key: 'jh', color: '#8cc4f5', opacity: 0.85, lineWidth: 7 },
    dc: { key: 'dc', color: '#e69d00', opacity: 0.9, lineWidth: 10 },
    dh: { key: 'dh', color: '#f2cf6b', opacity: 0.85, lineWidth: 7 },
  };

  // Placeholder ladder (real values come from `chessdecide ladder calibrate`) + Elo posterior (METRICS.md B3).
  const LADDER = [
    { id: 'random', label: 'Random mover', elo: 250 }, { id: 'eps75', label: 'SF 1320 · 75% random', elo: 560 },
    { id: 'eps50', label: 'SF 1320 · 50% random', elo: 790 }, { id: 'eps30', label: 'SF 1320 · 30% random', elo: 980 },
    { id: 'eps15', label: 'SF 1320 · 15% random', elo: 1150 }, { id: 'uci1320', label: 'Stockfish 1320', elo: 1320 },
    { id: 'uci1500', label: 'Stockfish 1500', elo: 1500 }, { id: 'uci1700', label: 'Stockfish 1700', elo: 1700 },
    { id: 'uci1900', label: 'Stockfish 1900', elo: 1900 }, { id: 'uci2100', label: 'Stockfish 2100', elo: 2100 },
    { id: 'uci2400', label: 'Stockfish 2400', elo: 2400 }, { id: 'uci2800', label: 'Stockfish 2800', elo: 2800 },
  ];
  function posterior(games) { // games: [{elo, s}]
    let lp = [], m = -Infinity;
    for (let R = 0; R <= 3500; R++) {
      let l = -0.5 * ((R - 1200) / 600) ** 2;
      for (const g of games) { const e = Math.min(1 - 1e-12, Math.max(1e-12, 1 / (1 + Math.pow(10, (g.elo - R) / 400)))); l += g.s * Math.log(e) + (1 - g.s) * Math.log(1 - e); }
      lp.push(l); if (l > m) m = l;
    }
    const w = lp.map((x) => Math.exp(x - m)), z = w.reduce((a, b) => a + b, 0);
    let mean = 0, c = 0, lo = null, hi = null;
    w.forEach((x, R) => { const p = x / z; mean += R * p; c += p; if (lo === null && c >= 0.025) lo = R; if (hi === null && c >= 0.975) hi = R; });
    return { mean, lo, hi, half: (hi - lo) / 2 };
  }
  const nearestLevel = (elo) => LADDER.reduce((b, l) => (Math.abs(l.elo - elo) < Math.abs(b.elo - elo) ? l : b));
  function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  window.CD = { LADDER, posterior, nearestLevel, rng, ico, header, setSpend, PIECE, winPct, fmtEval, fmtUSD, ANN, wlClass, esc, estimate, BRUSHES };
})();
