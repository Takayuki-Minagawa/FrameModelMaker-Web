import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Layout rules jsdom cannot evaluate; guarded statically. */
describe('main.css layout guards', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/styles/main.css'), 'utf8');

  it('never turns #menu-bar into a scroll container, which would clip the dropdown menus', () => {
    const rules = [...css.matchAll(/#menu-bar\s*\{([^}]*)\}/g)].map((match) => match[1]);
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) expect(body).not.toMatch(/overflow(-x|-y)?\s*:\s*(auto|scroll|hidden|clip)/);
  });
});
