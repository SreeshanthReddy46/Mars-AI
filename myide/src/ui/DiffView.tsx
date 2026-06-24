import React from 'react';
import { Box, Text, useInput } from 'ink';
import chalk from 'chalk';

interface DiffViewProps {
  diffText: string;
  filePath: string;
  onResolve: (action: 'yes' | 'no' | 'edit') => void;
}

/**
 * Ink component that visually displays a unified diff and prompts user confirmation.
 */
export const DiffView: React.FC<DiffViewProps> = ({ diffText, filePath, onResolve }) => {
  // Capture key input
  useInput((input: string) => {
    const key = input.toLowerCase();
    if (key === 'y') {
      onResolve('yes');
    } else if (key === 'n') {
      onResolve('no');
    } else if (key === 'e') {
      onResolve('edit');
    }
  });

  const lines = diffText.split(/\r?\n/);

  return (
    <Box flexDirection="column" marginY={1} width="100%">
      <Box borderStyle="single" borderColor="cyan" paddingX={1} marginBottom={1} width="100%">
        <Text bold color="cyan">
          Proposed changes in: {filePath}
        </Text>
      </Box>

      <Box flexDirection="column" paddingX={1} marginBottom={1}>
        {lines.map((line, idx) => {
          if (line.startsWith('+') && !line.startsWith('+++')) {
            return (
              <Text key={idx} color="green">
                {line}
              </Text>
            );
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            // Apply Chalk strikethrough formatting inside Ink Text
            return (
              <Text key={idx} color="red">
                {chalk.strikethrough(line)}
              </Text>
            );
          } else if (line.startsWith('@@')) {
            return (
              <Text key={idx} color="cyan" dimColor>
                {line}
              </Text>
            );
          } else if (line.startsWith('---') || line.startsWith('+++')) {
            return (
              <Text key={idx} bold color="white">
                {line}
              </Text>
            );
          } else {
            return (
              <Text key={idx} color="gray">
                {line}
              </Text>
            );
          }
        })}
      </Box>

      <Box borderStyle="round" borderColor="yellow" paddingX={1} flexDirection="row" width="100%">
        <Text bold>Apply this patch? </Text>
        <Box marginLeft={2} flexDirection="row">
          <Text color="green" bold>[y]</Text>
          <Text color="green"> yes</Text>
          <Text color="gray">  |  </Text>
          <Text color="red" bold>[n]</Text>
          <Text color="red"> no</Text>
          <Text color="gray">  |  </Text>
          <Text color="yellow" bold>[e]</Text>
          <Text color="yellow"> edit</Text>
        </Box>
      </Box>
    </Box>
  );
};
