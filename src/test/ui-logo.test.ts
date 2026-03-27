import { describe, expect, it } from 'vitest';

import { LOGO_LINES, LOGO_SUBTITLE } from '../ui/logo.js';

describe('ui logo', () => {
  it('matches the compact logo used in quetz.pen', () => {
    expect(LOGO_LINES).toHaveLength(4);
    expect(LOGO_LINES[0]).toBe(' ███    █   █  ████  █████  ████');
    expect(LOGO_LINES[3]).toBe(' ██ █    ███   ████    █    ████');
    expect(LOGO_SUBTITLE).toContain('the feathered serpent dev loop');
  });
});
