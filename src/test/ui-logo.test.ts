import { describe, expect, it } from 'vitest';

import { LOGO_LINES, LOGO_SUBTITLE } from '../ui/logo.js';

describe('ui logo', () => {
  it('matches the terminal-safe block logo used in the rezi header', () => {
    expect(LOGO_LINES).toHaveLength(8);
    expect(LOGO_LINES[0]).toBe('████████████░');
    expect(LOGO_LINES[7]).toBe('    ████░');
    expect(LOGO_SUBTITLE).toContain('the feathered serpent dev loop');
  });
});
