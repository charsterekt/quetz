import { describe, expect, it } from 'vitest';

import { LOGO_LINES, logoSubtitle } from '../ui/logo.js';

describe('ui logo', () => {
  it('matches the terminal-safe block logo used in the rezi header', () => {
    expect(LOGO_LINES).toHaveLength(8);
    expect(LOGO_LINES[0]).toBe('\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2588\u2591');
    expect(LOGO_LINES[7]).toBe('    \u2588\u2588\u2588\u2588\u2591');
    expect(logoSubtitle('0.5.3')).toContain('the feathered serpent dev loop');
    expect(logoSubtitle('0.5.3')).toContain('v0.5.3');
  });
});
