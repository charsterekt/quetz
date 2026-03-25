import React from 'react';
import { ink } from '../ink-imports.js';
import chalk from 'chalk';

const c = {
  brand:  chalk.hex('#10B981'),
  accent: chalk.hex('#F59E0B'),
  dim:    chalk.hex('#6B7280'),
  text:   chalk.hex('#FAFAFA'),
  border: chalk.hex('#2a2a2a'),
};

export interface VictoryData {
  totalSessions: number;
  totalTime: string;
  prsMerged: number;
  sessionDate: string;
}

interface VictoryCardProps {
  data: VictoryData;
  termCols: number;
  termRows: number;
}

function StatRow({ label, value, valueColor }: { label: string; value: string; valueColor: string }) {
  const { Box, Text } = ink();
  const labelWidth = 20;
  const paddedLabel = label.padEnd(labelWidth);
  return (
    <Box>
      <Text>{c.dim(paddedLabel)}</Text>
      <Text>{chalk.hex(valueColor)(value)}</Text>
    </Box>
  );
}

export const VictoryCard: React.FC<VictoryCardProps> = ({ data, termCols }) => {
  const { Box, Text } = ink();

  const cardWidth = Math.round(termCols * 0.49);
  const cardPad = 4; // ~48px ≈ 4 chars of padding on each side
  const innerWidth = Math.max(1, cardWidth - cardPad * 2 - 2);
  const divider = c.border('─'.repeat(innerWidth));

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1}>
      <Box
        flexDirection="column"
        width={cardWidth}
        borderStyle="single"
        borderColor="#F59E0B"
        paddingX={cardPad}
        paddingY={1}
      >
        {/* Line 1: top spacer */}
        <Text> </Text>

        {/* Line 2: heading */}
        <Text bold>{c.brand('the serpent rests.')}</Text>

        {/* Line 3: spacer */}
        <Text> </Text>

        {/* Line 4: sessions completed */}
        <StatRow label="sessions completed" value={String(data.totalSessions)} valueColor="#FAFAFA" />

        {/* Line 5: total time */}
        <StatRow label="total time" value={data.totalTime} valueColor="#F59E0B" />

        {/* Line 6: prs merged */}
        <StatRow label="prs merged" value={String(data.prsMerged)} valueColor="#10B981" />

        {/* Line 7: session date */}
        <StatRow label="session date" value={data.sessionDate} valueColor="#6B7280" />

        {/* Line 8: spacer */}
        <Text> </Text>

        {/* Divider */}
        <Text>{divider}</Text>
      </Box>
    </Box>
  );
};
