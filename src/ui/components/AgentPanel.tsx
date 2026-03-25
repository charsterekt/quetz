import { Column, Row, Text } from '@rezi-ui/jsx';
import type { VNode } from '@rezi-ui/core';
import chalk from 'chalk';
import { Scrollbar } from './Scrollbar.js';
import type { AgentLine } from '../state.js';

const c = {
  agent:  chalk.hex('#A855F7'),
  cyan:   chalk.hex('#06B6D4'),
  text:   chalk.hex('#FAFAFA'),
  muted:  chalk.hex('#4B5563'),
  brand:  chalk.hex('#10B981'),
  error:  chalk.hex('#EF4444'),
  dim:    chalk.hex('#6B7280'),
  border: chalk.hex('#2a2a2a'),
};

const SPINNER_FRAMES = ['◐', '◓', '◑', '◒'];

// Title bar (text row) + border-bottom row = 2 rows overhead
const TITLE_ROWS = 2;

const TOOL_PAD: Record<string, string> = {
  Bash:  'Bash ',
  Read:  'Read ',
  Write: 'Write',
  Edit:  'Edit ',
  Glob:  'Glob ',
  Grep:  'Grep ',
};

function padToolName(name: string): string {
  return TOOL_PAD[name] ?? name.slice(0, 5).padEnd(5);
}

export interface AgentPanelProps {
  agentLines: AgentLine[];
  agentScrollTop: number;
  agentAutoScroll: boolean;
  agentMode: 'running' | 'polling';
  issueId: string;
  prNumber: number | null;
  prBranch: string;
  spinnerFrame: number;
  width: number;
  height: number;
}

export function AgentPanel(props: AgentPanelProps): VNode {
  const {
    agentLines, agentScrollTop, agentMode,
    issueId, prNumber, prBranch, spinnerFrame,
    width, height,
  } = props;

  const contentRows = Math.max(0, height - TITLE_ROWS);
  const pollingSummaryRows = agentMode === 'polling' && prNumber != null ? 4 : 0;
  const logRows = Math.max(0, contentRows - pollingSummaryRows);

  const visibleLines: AgentLine[] = agentLines.slice(agentScrollTop, agentScrollTop + logRows);
  while (visibleLines.length < logRows) {
    visibleLines.push({ type: 'text', content: '' });
  }

  const leftTitle = issueId ? `▸ ${issueId}` : '▸ agent';
  const rightTitle = agentMode === 'polling' ? '[pr found]' : '[agent running]';

  return (
    <Column width={width}>
      <Row justify="between" px={3}>
        <Text textOverflow="ellipsis">{c.agent(leftTitle)}</Text>
        <Text>{c.agent(rightTitle)}</Text>
      </Row>
      <Text>{c.border('─'.repeat(Math.max(0, width - 1)))}</Text>
      <Row flex={1}>
        <Column flex={1} px={3}>
          {agentMode === 'polling' && prNumber != null && (
            <>
              <Text textOverflow="ellipsis">{c.brand(`✓ pr #${prNumber} opened`)}</Text>
              <Text textOverflow="ellipsis">{c.dim(`  branch: ${prBranch || '—'}`)}</Text>
              <Text textOverflow="ellipsis">{c.dim(`  ${SPINNER_FRAMES[spinnerFrame % SPINNER_FRAMES.length]} polling for merge...`)}</Text>
              <Text>{' '}</Text>
            </>
          )}
          {visibleLines.map((line, i) => {
            if (!line.content) return <Text key={String(i)}>{' '}</Text>;

            if (line.type === 'tool') {
              const name = padToolName(line.toolName ?? '');
              const args = line.content.replace(/\n/g, ' ');
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.cyan(`▸ ${name}   ${args}`)}
                </Text>
              );
            }

            if (line.type === 'bash') {
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.muted(`  ${line.content}`)}
                </Text>
              );
            }

            if (line.type === 'success') {
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.brand(line.content)}
                </Text>
              );
            }

            if (line.type === 'error') {
              return (
                <Text key={String(i)} textOverflow="ellipsis">
                  {c.error(line.content)}
                </Text>
              );
            }

            return (
              <Text key={String(i)} textOverflow="ellipsis">
                {c.text(line.content)}
              </Text>
            );
          })}
        </Column>
        <Scrollbar
          height={contentRows}
          totalLines={Math.max(agentLines.length, 1)}
          scrollTop={agentScrollTop}
        />
      </Row>
    </Column>
  );
}
