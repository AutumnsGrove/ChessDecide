import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadEnv } from '../src/config.ts';

describe('loadEnv', () => {
  it('parses KEY=value, strips quotes and never overrides the real environment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cd-env-'));
    const file = join(dir, '.env');
    writeFileSync(file, '# comment\n\nCD_TEST_QUOTED="quoted value"\nCD_TEST_PLAIN=plain\nCD_TEST_EXISTING=new\n');
    process.env.CD_TEST_EXISTING = 'already set';
    try {
      loadEnv(file);
      expect(process.env.CD_TEST_QUOTED).toBe('quoted value');
      expect(process.env.CD_TEST_PLAIN).toBe('plain');
      expect(process.env.CD_TEST_EXISTING).toBe('already set');
    } finally {
      delete process.env.CD_TEST_QUOTED;
      delete process.env.CD_TEST_PLAIN;
      delete process.env.CD_TEST_EXISTING;
    }
  });

  it('does nothing when the file is absent', () => {
    expect(() => loadEnv('/nonexistent/chessdecide/.env')).not.toThrow();
  });
});
