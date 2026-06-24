/**
 * Represents a code issue or improvement suggestion found by an agent.
 */
export interface Finding {
  severity: 'error' | 'warning' | 'info';
  line: number;
  message: string;
  suggestion: string;
}

/**
 * Represents an individual result from programmatically running ESLint.
 */
export interface LintResult {
  line: number;
  column: number;
  severity: 'error' | 'warning';
  message: string;
  ruleId: string;
}

/**
 * Represents an individual diagnostic issue reported by tsc.
 */
export interface TscResult {
  file: string;
  line: number;
  col: number;
  severity: string;
  code: string;
  message: string;
}

/**
 * Represents an indexed file in the workspace.
 */
export interface FileEntry {
  path: string;
  size: number;
  lastModified: Date;
  preview: string;
}

/**
 * Represents a message in the chat history.
 */
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

/**
 * Represents the configuration schema for the application.
 */
export interface Config {
  apiKey: string;
  model: string;
  maxTokens: number;
  theme: 'dark' | 'light';
  autoFix: boolean;
  contextDepth: number;
}

/**
 * Represents the result returned by an agent invocation.
 */
export interface AgentResult {
  agentName: string;
  output: string;
  findings?: Finding[];
  diff?: string;
}

/**
 * Type representing the codebase index mapping paths to FileEntries.
 */
export type FileIndex = Map<string, FileEntry>;
