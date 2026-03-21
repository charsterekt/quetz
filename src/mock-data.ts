// Faux beads issue list for testing quetz without a real bd installation.
// Use: quetz run --mock  or  quetz watch --mock

import type { BeadsIssue } from './beads.js';

export const MOCK_ISSUES: BeadsIssue[] = [
  {
    id: 'mock-001',
    title: 'Add rate limiting to API endpoints',
    description:
      'Implement token-bucket rate limiting on all public API routes. ' +
      'Limit to 100 req/min per IP. Return 429 with Retry-After header on breach.',
    status: 'ready',
    priority: 1,
    issue_type: 'feature',
    created_at: '2026-03-20T09:00:00Z',
    updated_at: '2026-03-20T09:00:00Z',
  },
  {
    id: 'mock-002',
    title: 'Fix memory leak in WebSocket handler',
    description:
      'WebSocket connections are not being cleaned up on disconnect. ' +
      'Event listeners accumulate over time. Reproduce: run stress test for 10 min, check heap.',
    status: 'ready',
    priority: 1,
    issue_type: 'bug',
    created_at: '2026-03-20T10:00:00Z',
    updated_at: '2026-03-20T10:00:00Z',
  },
  {
    id: 'mock-003',
    title: 'Add dark mode support to dashboard',
    description:
      'Add CSS custom properties and a toggle for dark/light mode. ' +
      'Persist preference in localStorage. Match system preference by default.',
    status: 'ready',
    priority: 2,
    issue_type: 'feature',
    created_at: '2026-03-20T11:00:00Z',
    updated_at: '2026-03-20T11:00:00Z',
  },
  {
    id: 'mock-004',
    title: 'Migrate config from JSON to YAML',
    description:
      'Replace config.json with config.yml across the codebase. ' +
      'Update all loaders and documentation. Keep backward compat shim for one release.',
    status: 'in_progress',
    priority: 2,
    issue_type: 'chore',
    created_at: '2026-03-19T08:00:00Z',
    updated_at: '2026-03-21T08:00:00Z',
  },
  {
    id: 'mock-005',
    title: 'Write integration tests for auth flow',
    description:
      'Cover login, logout, token refresh, and session expiry scenarios end-to-end.',
    status: 'closed',
    priority: 3,
    issue_type: 'test',
    created_at: '2026-03-18T08:00:00Z',
    updated_at: '2026-03-19T08:00:00Z',
  },
];
