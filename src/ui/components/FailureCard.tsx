import React from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';

const c = {
  error:    chalk.hex('#EF4444'),
  dim:      chalk.hex('#6B7280'),
  text:     chalk.hex('#FAFAFA'),
  failDark: chalk.hex('#3F1515'),
  border:   chalk.hex('#2a2a2a'),
  surface:  chalk.hex('#0F0F0F'),
};

export interface FailureData {
  issueId: string;
  prNumber: number | null;
  failedChecks?: string;
  reason: string;
}

interface FailureCardProps {
  data: FailureData;
  termCols: number;
  termRows: number;
}

const ASCII_TAIL = [
  '~*~*~*~>',
  ' \\  \\  \\',
  '  \\/\\/\\/',
];

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  const { Box, Text } = ink();
  const labelWidth = 16;
  const paddedLabel = label.padEnd(labelWidth);
  return (
    <Box>
      <Text>{c.dim(paddedLabel)}</Text>
      <Text>{chalk.hex(valueColor)(value)}</Text>
    </Box>
  );
}

export const FailureCard: React.FC<FailureCardProps> = ({ data, termCols, termRows }) => {
  const { Box, Text } = ink();

  const cardWidth = Math.round(termCols * 0.49);
  const cardPad = 4; // ~48px ≈ 4 chars of padding on each side

  const divider = c.failDark('─'.repeat(cardWidth - cardPad * 2 - 2));

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        width={cardWidth}
        borderStyle="single"
        borderColor="#EF4444"
        paddingX={cardPad}
        paddingY={1}
      >
        {/* Line 1: top divider */}
        <Text>{divider}</Text>

        {/* Line 2: empty spacer */}
        <Text> </Text>

        {/* Line 3: heading */}
        <Text bold>{c.error('the loop has stopped.')}</Text>

        {/* Line 4: spacer */}
        <Text> </Text>

        {/* Line 5: issue */}
        <StatRow label="issue" value={data.issueId} valueColor="#EF4444" />

        {/* Line 6: pr */}
        <StatRow
          label="pr"
          value={data.prNumber != null ? `#${data.prNumber}` : '—'}
          valueColor="#EF4444"
        />

        {/* Line 7: failedChecks (only when present) */}
        {data.failedChecks != null && (
          <StatRow label="failed checks" value={data.failedChecks} valueColor="#EF4444" />
        )}

        {/* Line 8: reason */}
        <StatRow label="reason" value={data.reason} valueColor="#FAFAFA" />

        {/* Line 9: spacer */}
        <Text> </Text>

        {/* ASCII tail art */}
        {ASCII_TAIL.map((line, i) => (
          <Text key={i}>{c.failDark(line)}</Text>
        ))}

        {/* Bottom divider */}
        <Text>{divider}</Text>
      </Box>
    </Box>
  );
};
