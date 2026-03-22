// Faux beads issue list for testing quetz without a real bd installation.
// Use: quetz run --mock  or  quetz watch --mock

import type { BeadsIssue } from './beads.js';

export const MOCK_ISSUES: BeadsIssue[] = [
  {
    id: 'mock-001',
    title: 'Create mock-output-a.txt',
    description:
      'Create a new file at /tmp/quetz-mock/mock-output-a.txt containing the single line: "mock-001 done".',
    status: 'ready',
    priority: 1,
    issue_type: 'chore',
    created_at: '2026-03-20T09:00:00Z',
    updated_at: '2026-03-20T09:00:00Z',
  },
  {
    id: 'mock-002',
    title: 'Create mock-output-b.txt',
    description:
      'Create a new file at /tmp/quetz-mock/mock-output-b.txt containing the single line: "mock-002 done".',
    status: 'ready',
    priority: 1,
    issue_type: 'chore',
    created_at: '2026-03-20T10:00:00Z',
    updated_at: '2026-03-20T10:00:00Z',
  },
  {
    id: 'mock-003',
    title: 'Create mock-output-c.txt',
    description:
      'Create a new file at /tmp/quetz-mock/mock-output-c.txt containing the single line: "mock-003 done".',
    status: 'ready',
    priority: 2,
    issue_type: 'chore',
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
