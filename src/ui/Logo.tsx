import React from 'react';
import { ink } from './ink-imports.js';
import { ansiArtLines } from '../display/quetz.js';

interface LogoProps {
  maxLines?: number;
}

export const Logo: React.FC<LogoProps> = ({ maxLines = 4 }) => {
  const { Box, Text } = ink();
  const lines = ansiArtLines.slice(0, maxLines);
  return (
    <Box flexDirection="column">
      {lines.map((line, i) => (
        <Text key={i} wrap="truncate">{line.trimEnd()}</Text>
      ))}
    </Box>
  );
};
