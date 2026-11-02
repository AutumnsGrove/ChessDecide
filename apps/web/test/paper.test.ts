import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAPER } from '../src/lib/paper.ts';

const doc = (p: string) => fileURLToPath(new URL(`../../../docs/${p}`, import.meta.url));
const md = readFileSync(doc('BENCHMARK-REPORT.md'), 'utf8');
// The Markdown uses **bold** and `code`; the page shows the same words without the markup.
const plain = md.replace(/\*\*/g, '').replace(/`/g, '');

describe('the paper page stays true to the report', () => {
  it('quotes the abstract word for word', () => {
    const { lead, bullets, close } = PAPER.abstract;
    expect(plain).toContain(lead);
    for (const b of bullets) expect(plain).toContain(`${b.k} ${b.v}`);
    expect(plain).toContain(close);
  });

  it('links every section to a heading that exists in the report', () => {
    for (const s of PAPER.sections) expect(md, s.title).toMatch(new RegExp(`^## ${s.title}$`, 'm'));
    expect(PAPER.sections.map((s) => s.title)).toEqual([...md.matchAll(/^## (.+)$/gm)].map((m) => m[1]).filter((t) => t !== 'Abstract'));
  });

  it('serves a PDF identical to the one in docs/', () => {
    const served = readFileSync(fileURLToPath(new URL('../static/chessdecide-benchmark-report.pdf', import.meta.url)));
    expect(served.equals(readFileSync(doc('BENCHMARK-REPORT.pdf')))).toBe(true);
  });

  it('carries the report date', () => {
    expect(md).toContain(`As of ${PAPER.asOf}`);
  });
});
