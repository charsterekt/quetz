import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';
import { Scrollbar } from './Scrollbar.js';
import type { QuetzBus } from '../../events.js';

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
const MAX_LINES = 500;

// Title bar (text row) + border-bottom row = 2 rows overhead
const TITLE_ROWS = 2;

type AgentLineType = 'text' | 'tool' | 'bash' | 'success' | 'error';

export interface AgentLine {
  type: AgentLineType;
  content: string;
  toolName?: string;
}

// Map tool name to 5-char padded label
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
  bus: QuetzBus;
  /** Total column width available to this component */
  width: number;
  /** Total row height available to this component (includes title bar rows) */
  height: number;
}

export const AgentPanel: React.FC<AgentPanelProps> = ({ bus, width, height }) => {
  const { Box, Text } = ink();

  const [lines, setLines] = useState<AgentLine[]>([]);
  const [scrollTop, setScrollTop] = useState(0);
  const [issueId, setIssueId] = useState('');
  const [issueTitle, setIssueTitle] = useState('');
  const [mode, setMode] = useState<'running' | 'polling'>('running');
  const [prNumber, setPrNumber] = useState<number | null>(null);
  const [prBranch, setPrBranch] = useState('');
  const [spinnerFrame, setSpinnerFrame] = useState(0);

  const autoScrollRef = useRef(true);
  const textBufferRef = useRef('');

  // Content rows = total height minus title bar and border row
  const contentRows = Math.max(0, height - TITLE_ROWS);

  // Polling summary occupies 4 rows (3 info lines + 1 blank separator)
  const pollingSummaryRows = mode === 'polling' && prNumber != null ? 4 : 0;
  const logRows = Math.max(0, contentRows - pollingSummaryRows);

  const maxScrollTop = Math.max(0, lines.length - logRows);

  // Spinner animation while polling
  useEffect(() => {
    if (mode !== 'polling') return;
    const timer = setInterval(
      () => setSpinnerFrame(f => (f + 1) % SPINNER_FRAMES.length),
      300,
    );
    return () => clearInterval(timer);
  }, [mode]);

  const addLine = useCallback((line: AgentLine) => {
    setLines(prev => {
      const next = [...prev, line];
      return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
    });
  }, []);

  // Auto-scroll: keep scrollTop at maxScrollTop when new lines arrive
  useEffect(() => {
    if (autoScrollRef.current) {
      setScrollTop(maxScrollTop);
    }
  }, [lines.length, maxScrollTop]);

  // Bus event handling
  useEffect(() => {
    const flushBuffer = () => {
      if (textBufferRef.current.trim()) {
        addLine({ type: 'text', content: textBufferRef.current });
        textBufferRef.current = '';
      }
    };

    const onText = (p: { text: string }) => {
      textBufferRef.current += p.text;
      const parts = textBufferRef.current.split('\n');
      textBufferRef.current = parts.pop() ?? '';
      for (const part of parts) {
        if (!part.trim()) continue;
        addLine({ type: 'text', content: part });
      }
    };

    const onTool = (p: { index: number; name: string; summary: string }) => {
      flushBuffer();
      addLine({ type: 'tool', content: p.summary, toolName: p.name });
    };

    const onStderr = (p: { data: string }) => {
      for (const line of p.data.split('\n')) {
        if (line.trim()) addLine({ type: 'error', content: line });
      }
    };

    const onPickup = (p: { id: string; title: string }) => {
      setLines([]);
      setScrollTop(0);
      setSpinnerFrame(0);
      autoScrollRef.current = true;
      textBufferRef.current = '';
      setIssueId(p.id);
      setIssueTitle(p.title);
      setMode('running');
      setPrNumber(null);
      setPrBranch('');
    };

    const onPrFound = (p: { number: number; title: string; url: string }) => {
      setPrNumber(p.number);
      setMode('polling');
    };

    const onPhase = (p: { phase: string; detail?: string }) => {
      if (p.phase === 'agent_running') setMode('running');
      if (p.phase === 'pr_polling') {
        setMode('polling');
        if (p.detail) setPrBranch(p.detail);
      }
    };

    bus.on('agent:text', onText);
    bus.on('agent:tool_done', onTool);
    bus.on('agent:stderr', onStderr);
    bus.on('loop:issue_pickup', onPickup);
    bus.on('loop:pr_found', onPrFound);
    bus.on('loop:phase', onPhase);
    return () => {
      bus.off('agent:text', onText);
      bus.off('agent:tool_done', onTool);
      bus.off('agent:stderr', onStderr);
      bus.off('loop:issue_pickup', onPickup);
      bus.off('loop:pr_found', onPrFound);
      bus.off('loop:phase', onPhase);
    };
  }, [bus, addLine]);

  // Expose scroll handler via bus side-channel (compatible with App.tsx key handler)
  useEffect(() => {
    const onScroll = (dir: 'up' | 'down') => {
      if (dir === 'up') {
        autoScrollRef.current = false;
        setScrollTop(prev => Math.max(0, prev - 1));
      } else {
        setScrollTop(prev => {
          const next = Math.min(maxScrollTop, prev + 1);
          if (next >= maxScrollTop) autoScrollRef.current = true;
          return next;
        });
      }
    };
    (bus as any)._agentScroll = onScroll;
    return () => { delete (bus as any)._agentScroll; };
  }, [bus, maxScrollTop]);

  // Visible log lines, padded to logRows
  const visibleLines: AgentLine[] = [
    ...lines.slice(scrollTop, scrollTop + logRows),
  ];
  while (visibleLines.length < logRows) {
    visibleLines.push({ type: 'text', content: '' });
  }

  // Title bar strings
  const leftTitle = issueId
    ? `▸ ${issueId}  —  ${issueTitle}`
    : '▸ agent';
  const rightTitle = mode === 'polling' ? '[pr found]' : '[agent running]';

  return (
    <Box flexDirection="column" width={width}>

      {/* Title bar */}
      <Box justifyContent="space-between" paddingX={3}>
        <Text wrap="truncate">{c.agent(leftTitle)}</Text>
        <Text>{c.agent(rightTitle)}</Text>
      </Box>

      {/* Border-bottom separator */}
      <Text>{c.border('─'.repeat(Math.max(0, width - 1)))}</Text>

      {/* Content area: log column + scrollbar */}
      <Box flexDirection="row">
        <Box flexDirection="column" flexGrow={1} paddingX={3} minWidth={0}>

          {/* PR polling summary (3 lines + blank separator) */}
          {mode === 'polling' && prNumber != null && (
            <>
              <Text wrap="truncate">{c.brand(`✓ pr #${prNumber} opened`)}</Text>
              <Text wrap="truncate">{c.dim(`  branch: ${prBranch || '—'}`)}</Text>
              <Text wrap="truncate">{c.dim(`  ${SPINNER_FRAMES[spinnerFrame]} polling for merge...`)}</Text>
              <Text> </Text>
            </>
          )}

          {/* Agent log lines */}
          {visibleLines.map((line, i) => {
            if (!line.content) return <Text key={i}> </Text>;

            if (line.type === 'tool') {
              const name = padToolName(line.toolName ?? '');
              const args = line.content.replace(/\n/g, ' ');
              return (
                <Text key={i} wrap="truncate">
                  {c.cyan(`▸ ${name}   ${args}`)}
                </Text>
              );
            }

            if (line.type === 'bash') {
              return (
                <Text key={i} wrap="truncate">
                  {c.muted(`  ${line.content}`)}
                </Text>
              );
            }

            if (line.type === 'success') {
              return (
                <Text key={i} wrap="truncate">
                  {c.brand(line.content)}
                </Text>
              );
            }

            if (line.type === 'error') {
              return (
                <Text key={i} wrap="truncate">
                  {c.error(line.content)}
                </Text>
              );
            }

            // type === 'text'
            return (
              <Text key={i} wrap="truncate">
                {c.text(line.content)}
              </Text>
            );
          })}
        </Box>

        {/* Scrollbar */}
        <Scrollbar
          height={contentRows}
          totalLines={Math.max(lines.length, 1)}
          scrollTop={scrollTop}
        />
      </Box>
    </Box>
  );
};
