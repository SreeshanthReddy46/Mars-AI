import * as fs from 'fs';
import * as path from 'path';
import { IndexManager } from './IndexManager';
import { TokenCounter } from './TokenCounter';
import { ConfigManager } from './ConfigManager';
import { GitTool } from '../tools/GitTool';
import { TypeCheckTool } from '../tools/TypeCheckTool';
import { LintTool } from '../tools/LintTool';
import { Message } from '../types';

/**
 * Builds full context strings for Review and Chat operations, performing
 * token limit calculations and truncation where required.
 */
export class ContextBuilder {
  /**
   * Reads target file content and queries Git, ESLint, and TSC to build a detailed review context.
   * Truncates context to fit within model token limits.
   * @param {string} filePath - Path to the file.
   * @returns {Promise<string>} Structured review prompt section.
   */
  public static async buildReviewContext(filePath: string): Promise<string> {
    const absPath = path.resolve(filePath);
    let content = '';
    try {
      if (fs.existsSync(absPath)) {
        content = fs.readFileSync(absPath, 'utf-8');
      }
    } catch (err) {
      content = 'Error reading file content.';
    }

    const gitTool = new GitTool();
    const typeCheckTool = new TypeCheckTool();
    const lintTool = new LintTool();

    let blame = '';
    try {
      blame = await gitTool.getBlame(absPath);
    } catch (err) {
      blame = 'No git blame available.';
    }

    let tscOutput = '';
    try {
      const tscErrors = await typeCheckTool.run(absPath);
      tscOutput =
        tscErrors.length > 0
          ? tscErrors.map((e) => `${e.line}:${e.col} - ${e.code}: ${e.message}`).join('\n')
          : 'No TypeScript errors.';
    } catch (err: any) {
      tscOutput = `Failed to run type checker: ${err.message || String(err)}`;
    }

    let lintOutput = '';
    try {
      const lintErrors = await lintTool.run(absPath);
      lintOutput =
        lintErrors.length > 0
          ? lintErrors
              .map((e) => `${e.line}:${e.column} - [${e.ruleId}] (${e.severity}): ${e.message}`)
              .join('\n')
          : 'No lint issues.';
    } catch (err: any) {
      lintOutput = `Failed to run linter: ${err.message || String(err)}`;
    }

    const context = `=== FILE: ${filePath} ===\n${content}\n\n=== TSC ERRORS ===\n${tscOutput}\n\n=== ESLINT ===\n${lintOutput}\n\n=== GIT BLAME ===\n${blame}`;

    const config = ConfigManager.getConfig();
    const tokenLimit = 128000 - config.maxTokens;
    return TokenCounter.truncateToFit(context, tokenLimit);
  }

  /**
   * Assembles chat history and keyword-matched workspace files to provide LLM context.
   * @param {string} userMessage - The current message from the user.
   * @param {Message[]} history - Conversation history for the session.
   * @returns {Promise<string>} Full context string for Chat agent.
   */
  public static async buildChatContext(userMessage: string, history: Message[]): Promise<string> {
    // 1. Take the last 10 messages from history
    const last10 = history.slice(-10);
    const historyText = last10
      .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n');

    // 2. Perform keyword matching on the IndexManager registry
    const index = IndexManager.getIndex();
    const stopWords = new Set([
      'the', 'and', 'for', 'this', 'that', 'with', 'from', 'your',
      'have', 'what', 'how', 'you', 'are', 'but', 'not', 'can',
      'get', 'use', 'run', 'file', 'code', 'here'
    ]);

    const keywords = userMessage
      .toLowerCase()
      .split(/[^a-zA-Z0-9_]/)
      .map((w) => w.trim())
      .filter((w) => w.length >= 3 && !stopWords.has(w));

    interface ScoredFile {
      filePath: string;
      score: number;
    }

    const scoredFiles: ScoredFile[] = [];

    for (const [filePath, entry] of index.entries()) {
      let score = 0;
      const filename = path.basename(filePath).toLowerCase();
      const preview = entry.preview.toLowerCase();

      for (const kw of keywords) {
        if (filename.includes(kw)) {
          score += 15; // High weight for filename match
        }
        // Sub-string search in preview content
        const occurrences = preview.split(kw).length - 1;
        score += occurrences * 2;
      }

      if (score > 0) {
        scoredFiles.push({ filePath, score });
      }
    }

    // Sort by match score descending and keep top 3 files
    scoredFiles.sort((a, b) => b.score - a.score);
    const topFiles = scoredFiles.slice(0, 3);

    let codebaseContext = '';
    for (const item of topFiles) {
      try {
        const fullContent = fs.readFileSync(item.filePath, 'utf-8');
        // Extract first 100 lines for the prompt snippet
        const lines100 = fullContent.split(/\r?\n/).slice(0, 100).join('\n');
        const relativePath = path.relative(process.cwd(), item.filePath);
        codebaseContext += `\n=== FILE SNIPPET: ${relativePath} ===\n${lines100}\n`;
      } catch (err) {
        // Skip files that fail to read
      }
    }

    const config = ConfigManager.getConfig();
    const tokenLimit = 128000 - config.maxTokens;

    let combined = `=== CONVERSATION HISTORY ===\n${historyText}\n`;
    if (codebaseContext) {
      combined += `\n=== CODEBASE CONTEXT ===\n${codebaseContext}\n`;
    }
    combined += `\n=== NEW USER MESSAGE ===\n${userMessage}`;

    return TokenCounter.truncateToFit(combined, tokenLimit);
  }
}
