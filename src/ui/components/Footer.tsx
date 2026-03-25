import { Row, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';
import type { QuetzPhase } from '../../events.js';

const c = {
  brand:  chalk.hex('#10B981'),
  accent: chalk.hex('#F59E0B'),
  error:  chalk.hex('#EF4444'),
  muted:  chalk.hex('#4B5563'),
};

export type FooterVariant = 'normal' | 'victory' | 'failure' | 'detail';

export interface FooterProps {
  variant?: FooterVariant;
  version?: string;
  // normal variant
  issueId?: string;
  iteration?: number;
  total?: number;
  phase?: QuetzPhase;
  prNumber?: number | null;
  elapsed?: string;
  cwd?: string;
  branch?: string;
  // failure variant
  failureIssueId?: string;
  failurePrNumber?: number | null;
  // detail variant
  detailSessionId?: string;
  detailPrStr?: string;
  detailDuration?: string;
}

export function Footer(props: FooterProps): VNode {
  const {
    variant = 'normal',
    version = '0.1.0',
    issueId = '',
    iteration = 0,
    total = 0,
    phase = 'idle',
    prNumber = null,
    elapsed = '0m 00s',
    cwd = '',
    branch = '',
    failureIssueId = '',
    failurePrNumber,
    detailSessionId = '',
    detailPrStr = '—',
    detailDuration = '',
  } = props;

  const versionStr = `◆ v${version}`;

  if (variant === 'detail') {
    const leftText = `  ${detailSessionId}  |  ${detailPrStr}  |  ${detailDuration}`;
    const rightText = `esc back  ↑↓ scroll  ${versionStr}`;
    return (
      <Row justify="between" px={3}>
        <Text>{c.muted(leftText)}</Text>
        <Text>{c.accent(rightText)}</Text>
      </Row>
    );
  }

  if (variant === 'victory') {
    const leftText = '◆ all done  |  exit code 0';
    const rightText = `q quit  ${versionStr}`;
    return (
      <Row justify="between" px={2}>
        <Text>{c.brand(leftText)}</Text>
        <Text>{c.muted(rightText)}</Text>
      </Row>
    );
  }

  if (variant === 'failure') {
    const prStr = failurePrNumber != null ? `#${failurePrNumber}` : '—';
    const leftText = `● ci failed  |  pr: ${prStr}  |  issue: ${failureIssueId}  |  exit code 1`;
    const rightText = `q quit  ${versionStr}`;
    return (
      <Row justify="between" px={2}>
        <Text>{c.error(leftText)}</Text>
        <Text>{c.muted(rightText)}</Text>
      </Row>
    );
  }

  // Normal variant
  const rightText = `q quit  ↑↓ agent  [ ] log  ${versionStr}`;
  const isPolling = phase === 'pr_polling';

  if (isPolling) {
    const prStr = prNumber != null ? `#${prNumber}` : '—';
    const leftText = `◐ polling  |  issue: ${issueId}  |  pr: ${prStr}  |  ${elapsed}`;
    return (
      <Row justify="between" px={2}>
        <Text>{c.accent(leftText)}</Text>
        <Text>{c.muted(rightText)}</Text>
      </Row>
    );
  }

  const cwdDisplay = cwd.replace(/\\/g, '/');
  const branchSuffix = branch ? `:${branch}` : '';
  const leftText = cwdDisplay
    ? `${cwdDisplay}${c.brand(branchSuffix)}`
    : `◆ running  |  issue: ${issueId}  |  ${iteration}/${total}  |  ${elapsed}`;

  return (
    <Row justify="between" px={2}>
      <Text>{c.muted(leftText)}</Text>
      <Text>{c.muted(rightText)}</Text>
    </Row>
  );
}
