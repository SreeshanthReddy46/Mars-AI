import { BaseAgent } from './BaseAgent';
import { loadPrompt } from './ReviewAgent';

const DEBUG_FALLBACK_PROMPT = `You are a debugging expert. Given code and an error, identify the exact root cause.
Be concise. Explain WHY the bug exists, not just what the error says.
Do not output code fixes — only describe the fix strategy clearly.

DO NOT:
1. Output any code modifications, code patches, or unified diffs.
2. Include full stack traces in your response.
3. Use overly complex technical jargon without explanation.
4. Guess or assume files or functions not present in the context.
5. Exceed 300 words.

Your output must follow this template:
- **Root Cause**: [1 sentence summarizing the underlying bug]
- **Explanation**: [2-4 sentences explaining the mechanism of the bug]
- **Minimal Reproduction Steps**: [Brief instructions to reproduce]
- **Fix Strategy**: [Bullet points explaining the conceptual fix without showing code]`;

/**
 * Agent responsible for root-cause analysis of specific errors.
 */
export class DebugAgent extends BaseAgent {
  /**
   * Initializes the DebugAgent with the system prompt.
   */
  constructor() {
    super(loadPrompt('debug.md', DEBUG_FALLBACK_PROMPT));
  }

  /**
   * Runs debugging analysis on the provided error context.
   * @param {string} errorContext - The error text and surrounding source code context.
   * @returns {Promise<string>} The structured debug analysis text.
   */
  public async run(errorContext: string): Promise<string> {
    return this.call(errorContext);
  }
}
