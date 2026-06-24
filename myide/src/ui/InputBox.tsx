import React, { useState } from 'react';
import { Box, Text, useInput, Key } from 'ink';
import TextInput from 'ink-text-input';
import { Spinner } from './Spinner';

interface InputBoxProps {
  onSubmit: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
}

/**
 * Ink component providing a bottom text input bar with command history support.
 */
export const InputBox: React.FC<InputBoxProps> = ({
  onSubmit,
  placeholder = 'Type your command or message...',
  isLoading = false,
}) => {
  const [value, setValue] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [draft, setDraft] = useState('');

  // Intercept special keys like arrows for command history and /exit
  useInput((input: string, key: Key) => {
    if (input === '/exit' || (key.ctrl && input === 'c')) {
      process.exit(0);
    }

    if (isLoading || history.length === 0) {
      return;
    }

    if (key.upArrow) {
      if (historyIndex === -1) {
        // Save what user was typing before browsing history
        setDraft(value);
      }
      const nextIndex = historyIndex + 1;
      if (nextIndex < history.length) {
        setHistoryIndex(nextIndex);
        // Browse from newest to oldest (reverse order)
        setValue(history[history.length - 1 - nextIndex]);
      }
    } else if (key.downArrow) {
      const nextIndex = historyIndex - 1;
      if (nextIndex >= 0) {
        setHistoryIndex(nextIndex);
        setValue(history[history.length - 1 - nextIndex]);
      } else if (nextIndex === -1) {
        setHistoryIndex(-1);
        setValue(draft);
      }
    }
  });

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (trimmed === '/exit') {
      process.exit(0);
    }

    if (trimmed) {
      // Append query to history (limit to last 50 queries)
      setHistory((prev) => [...prev, trimmed].slice(-50));
      setHistoryIndex(-1);
      setDraft('');
      setValue('');
      onSubmit(trimmed);
    }
  };

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} width="100%">
      {isLoading ? (
        <Box height={1}>
          <Spinner label="Agent is thinking…" color="blue" />
        </Box>
      ) : (
        <Box flexDirection="row" justifyContent="space-between">
          <Box flexDirection="row" flexGrow={1}>
            <Text color="green" bold>❯ </Text>
            <TextInput
              value={value}
              onChange={setValue}
              onSubmit={handleSubmit}
              placeholder={placeholder}
            />
          </Box>
          <Box marginLeft={2}>
            <Text color="gray">[Enter ↵]</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
