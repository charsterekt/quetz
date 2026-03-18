import { describe, it, expect } from 'vitest';
import { EXIT_SUCCESS, EXIT_FAILURE, EXIT_CONFIG_ERROR, EXIT_PREFLIGHT_FAILURE } from '../cli.js';

describe('exit codes', () => {
  it('exports correct exit code constants per spec section 7.4', () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_FAILURE).toBe(1);
    expect(EXIT_CONFIG_ERROR).toBe(2);
    expect(EXIT_PREFLIGHT_FAILURE).toBe(3);
  });
});
