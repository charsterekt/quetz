import React from 'react';
import { ink } from './ink-imports.js';

export const Logo: React.FC = () => {
  const { Box, Text } = ink();
  return (
    <Box flexDirection="column" paddingBottom={1}>
      <Text bold color="green">quetz</Text>
      <Text color="gray">autonomous dev loop</Text>
    </Box>
  );
};
