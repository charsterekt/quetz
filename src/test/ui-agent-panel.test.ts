import { describe, expect, it } from 'vitest';

import { sliceViewportText } from '../ui/components/AgentPanel.js';

describe('sliceViewportText', () => {
  it('preserves the full line through a movable horizontal viewport', () => {
    const line = '0123456789abcdefghijklmnopqrstuvwxyz';

    expect(sliceViewportText(line, 0, 12)).toBe('0123456789a…');
    expect(sliceViewportText(line, 8, 12)).toBe('…89abcdefgh…');
    expect(sliceViewportText(line, 25, 12)).toBe('…pqrstuvwxyz');
  });

  it('returns the original text when no horizontal clipping is needed', () => {
    expect(sliceViewportText('short line', 0, 20)).toBe('short line');
  });
});
