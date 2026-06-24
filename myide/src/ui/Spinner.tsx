import React, { useState, useEffect } from 'react';
import { Text } from 'ink';

interface SpinnerProps {
  label: string;
  color?: 'blue' | 'green' | 'yellow' | 'red';
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Ink component displaying a terminal spinner animation with a label.
 */
export const Spinner: React.FC<SpinnerProps> = ({ label, color = 'blue' }) => {
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FRAMES.length);
    }, 80);
    return () => clearInterval(timer);
  }, []);

  return (
    <Text color={color}>
      {FRAMES[frameIndex]} {label}
    </Text>
  );
};
