/**
 * The research report, as the site presents it. The abstract is the report's own text, not a paraphrase:
 * test/paper.test.ts checks every string here against docs/BENCHMARK-REPORT.md, and the PDF copy in
 * static/ against docs/BENCHMARK-REPORT.pdf, so this page cannot drift from the paper.
 */
export const REPO = 'https://github.com/AutumnsGrove/ChessDecide';
const MD = `${REPO}/blob/main/docs/BENCHMARK-REPORT.md`;

export const PAPER = {
  title: 'ChessDecide: Benchmarking Decision Models at Chess',
  asOf: '2026-11-01',
  pdf: '/chessdecide-benchmark-report.pdf',
  markdown: MD,
  runData: `${REPO}/tree/main/docs/build/reports`,
  /** Who wrote the report and the code behind it; the same sentence opens the report itself. */
  authorship: 'This report was written by Claude Sonnet 5.5 using extensive data from the benchmark runs themselves. The code behind it was written by two AI coding agents: Claude Sonnet 5.5 (via Claude Code) and DeepSeek V4.1 Flash 1017 (via the Pi coding harness). The benchmark sweep ran in a Claude Code on the web session over about 30 hours.',
  abstract: {
    lead: 'Decision models, which pick one option from a menu and return no reasoning, play chess at 122 to 711 Elo when the menu is bare and 249 to 886 Elo when each option carries a few rule-derived facts. We measured 20 catalog models this way, 50 games per model per arm, against a calibrated ladder of engine opponents.',
    bullets: [
      { k: 'Scale of the run:', v: '2,002 finished games, 142,635 plies and 70,806 successful model calls, for $2.57 of API spend. Every model move was also judged by Stockfish.' },
      { k: 'Hints are the largest effect:', v: 'the hinted arm lifts all 20 models, by +56 to +465 Elo (median about +290). Nothing in a hint is an engine evaluation: captures, castling, promotion, check and mate, all derivable from the rules.' },
      { k: 'The ranking is tiers, not an order:', v: 'with 50 games the 95% interval is about ±105 Elo, so most neighbouring ranks are statistically tied.' },
      { k: 'Interface is a capability:', v: '5 of the 25 catalog models could not play at all, because they cap a question at 20 or 26 options or reject a structured state. That is a result about the models, not a harness bug.' },
    ],
    close: 'Everything below is meant to be reproducible: the protocol is byte-specified, the opponents are calibrated and versioned, and the raw series and publish SQL are in the repository.',
  },
  /** Section headings of the report, linked to their GitHub anchors. */
  sections: [
    'Motivation', 'Environment', 'Protocol', 'Opponents and the ladder', 'Scoring', 'Design and variables',
    'Results', 'Limitations', 'Operations and lessons', 'Future work',
  ].map((title) => ({ title, href: `${MD}#${title.toLowerCase().replace(/ /g, '-')}` })),
} as const;
