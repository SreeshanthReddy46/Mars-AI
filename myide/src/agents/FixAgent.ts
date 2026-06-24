import { BaseAgent } from './BaseAgent';
import { loadPrompt } from './ReviewAgent';

const FIX_FALLBACK_PROMPT = `You are a code patching agent. Output ONLY a valid unified diff in a \`\`\`diff block.
After the diff block, explain each change in plain English. 
Never break existing functionality. If you are unsure about a change, 
output a comment in the diff instead of guessing.

DO NOT:
1. Output any comments, text, or introduction before the \`\`\`diff block.
2. Output code modifications in any other format besides standard unified diff (with \`--- a/file\` and \`+++ b/file\`).
3. Alter lines that are totally unrelated to the required fix.
4. Leave the diff block unclosed.
5. Skip the post-diff change explanations.`;

/**
 * Agent responsible for generating atomic code patches (unified diffs).
 */
export class FixAgent extends BaseAgent {
  /**
   * Initializes the FixAgent with the system prompt.
   */
  constructor() {
    super(loadPrompt('fix.md', FIX_FALLBACK_PROMPT));
  }

  /**
   * Generates a unified patch diff and a plain-English explanation.
   * @param {string} fileContent - Current content of the file to fix.
   * @param {string} instructionOrFindings - Review findings or direct user instruction.
   * @returns {Promise<{ diff: string; explanation: string }>} The diff and explanation.
   */
  public async run(
    fileContent: string,
    instructionOrFindings: string
  ): Promise<{ diff: string; explanation: string }> {
    const prompt = `=== TARGET FILE CONTENT ===\n${fileContent}\n\n=== CHANGE REQUEST ===\n${instructionOrFindings}\n\nPlease generate a unified diff in a \`\`\`diff block followed by your explanation.`;
    
    const response = await this.call(prompt);

    let diff = '';
    let explanation = '';

    const diffStart = response.indexOf('```diff');
    if (diffStart !== -1) {
      const rest = response.substring(diffStart + 7);
      const diffEnd = rest.indexOf('```');
      if (diffEnd !== -1) {
        diff = rest.substring(0, diffEnd).trim();
        explanation = rest.substring(diffEnd + 3).trim();
      } else {
        diff = rest.trim();
      }
    } else {
      // Fallback if no block found
      const codeStart = response.indexOf('--- a/');
      if (codeStart !== -1) {
        diff = response.substring(codeStart).trim();
      } else {
        diff = response;
      }
    }

    return { diff, explanation };
  }
}
