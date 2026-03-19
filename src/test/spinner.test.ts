import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock ora
const mockStart = vi.fn();
const mockStop = vi.fn();
const mockSucceed = vi.fn();
const mockOraInstance = {
  start: mockStart,
  stop: mockStop,
  succeed: mockSucceed,
  text: '',
};
mockStart.mockReturnValue(mockOraInstance);

vi.mock('ora', () => ({
  default: vi.fn(() => mockOraInstance),
}));

import { startSpinner, stopSpinner, updateSpinner } from '../display/spinner.js';

beforeEach(() => {
  vi.clearAllMocks();
  mockStart.mockReturnValue(mockOraInstance);
});

describe('startSpinner', () => {
  it('creates and starts a spinner', () => {
    const result = startSpinner('Loading...');
    expect(mockStart).toHaveBeenCalled();
    expect(result).toBe(mockOraInstance);
  });
});

describe('stopSpinner', () => {
  it('stops spinner without final text', () => {
    startSpinner('test');
    stopSpinner();
    expect(mockStop).toHaveBeenCalled();
  });

  it('calls succeed with final text', () => {
    startSpinner('test');
    stopSpinner('Done!');
    expect(mockSucceed).toHaveBeenCalledWith('Done!');
  });

  it('does nothing if no spinner is active', () => {
    // After stopSpinner, calling again should be a no-op
    stopSpinner();
    // No error thrown
  });
});

describe('updateSpinner', () => {
  it('updates spinner text', () => {
    startSpinner('initial');
    updateSpinner('updated');
    expect(mockOraInstance.text).toBe('updated');
  });
});
