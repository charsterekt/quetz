import { Column, Row, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';
import type { CompletedSession } from '../session-history.js';
import { formatDuration } from './SessionDetail.js';

const c = {
  brand: chalk.hex('#10B981'),
  cyan:  chalk.hex('#06B6D4'),
  dim:   chalk.hex('#6B7280'),
  error: chalk.hex('#EF4444'),
};

export interface SessionsPanelProps {
  sessions: CompletedSession[];
  selectedIdx: number;
  width: number;
  height: number;
}

export function SessionsPanel(props: SessionsPanelProps): VNode {
  const { sessions, selectedIdx, width, height } = props;

  const listHeight = Math.max(0, height - 1);

  return (
    <Column width={width} height={height}>
      <Row justify="between" px={2}>
        <Text>{c.cyan('completed sessions')}</Text>
        <Text>{c.dim('↑↓ enter esc')}</Text>
      </Row>

      {sessions.length === 0 ? (
        <Column flex={1} items="center" justify="center">
          <Text>{c.dim('no completed sessions yet')}</Text>
        </Column>
      ) : (
        <Column px={2} flex={1}>
          {sessions.slice(0, listHeight).map((session, i) => {
            const selected = i === selectedIdx;
            const cursor = selected ? '▶' : ' ';
            const outcomeIcon = session.outcome === 'failed' ? '✗' : '✓';
            const outcomeColored = session.outcome === 'failed' ? c.error(outcomeIcon) : c.brand(outcomeIcon);
            const duration = formatDuration(session.finishedAt - session.startedAt);
            const labelText = ` ${session.issueId}  ${duration}`;

            const line = selected
              ? `${c.brand(cursor)} ${outcomeColored}${c.brand(labelText)}`
              : `${c.dim(cursor)} ${outcomeColored}${c.dim(labelText)}`;

            return (
              <Text key={session.issueId + String(session.startedAt)} textOverflow="ellipsis">
                {line}
              </Text>
            );
          })}
        </Column>
      )}
    </Column>
  );
}
