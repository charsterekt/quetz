import { describe, expect, it } from 'vitest';

import { LOGO_LINES, LOGO_SUBTITLE } from '../ui/logo.js';

describe('ui logo', () => {
  it('matches the terminal-friendly block-pixel logo used in quetz.pen', () => {
    expect(LOGO_LINES).toHaveLength(8);
    expect(LOGO_LINES[0]).toContain('███');
    expect(LOGO_LINES[7]).toContain('████');
    expect(LOGO_SUBTITLE).toContain('the feathered serpent dev loop');
  });
});
