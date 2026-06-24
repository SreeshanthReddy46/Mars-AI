import * as fs from 'fs';
import * as path from 'path';
import { BaseAgent } from './BaseAgent';
import { Finding } from '../types';
import { Renderer } from '../ui/Renderer';

/**
 * Loads the content of a prompt file, using a fallback if not found.
 * @param {string} filename - Name of the prompt file (e.g. 'review.md').
 * @param {string} fallback - Default text if file is missing.
 * @returns {string} The prompt content.
 */
function loadPrompt(filename: string, fallback: string): string {
  const possiblePaths = [
    path.join(__dirname, '..', '..', 'prompts', filename),
    path.join(__dirname, '..', '..', '..', 'prompts', filename),
    path.join(process.cwd(), 'prompts', filename),
    path.join(__dirname, 'prompts', filename),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        return fs.readFileSync(p, 'utf-8');
      } catch (err) {
        // Fall through
      }
    }
  }
  return fallback;
}

const REVIEW_FALLBACK_PROMPT = `You are an expert code reviewer. You find bugs, security vulnerabilities, performance problems, and style issues.
You output findings as JSON first, then a plain-English summary.
Be specific — always include line numbers and exact fix suggestions. Never hallucinate line numbers.

DO NOT:
1. Suggest changes that violate TypeScript strict mode.
2. Hallucinate line numbers that do not exist in the source code.
3. Write general advice; make every suggestion actionable.
4. Output standard HTML or XML tags in the JSON response.
5. Skip the summary section; always output a plain-English wrap-up.

Your output MUST be in this format:
\`\`\`json
{
  "findings": [
    {
      "severity": "error"|"warning"|"info",
      "line": 42,
      "message": "Description of the issue",
      "suggestion": "Exact fix code or instruction"
    }
  ]
}
\`\`\`
Followed by a plain-English summary paragraph.`;

/**
 * Agent responsible for static analysis and review of files.
 */
export class ReviewAgent extends BaseAgent {
  /**
   * Initializes the ReviewAgent with the system prompt.
   */
  constructor() {
    super(loadPrompt('review.md', REVIEW_FALLBACK_PROMPT));
  }

  /**
   * Reviews file context and returns structured findings while streaming the summary.
   * @param {string} context - The workspace review context.
   * @param {(findings: Finding[]) => void} onFindingsParsed - Callback when JSON findings are parsed.
   * @returns {Promise<string>} The full summary paragraph text.
   */
  public async run(
    context: string,
    onFindingsParsed: (findings: Finding[]) => void
  ): Promise<string> {
    let jsonBuffer = '';
    let summaryText = '';
    let inSummaryPhase = false;
    let findingsParsed = false;

    try {
      for await (const chunk of this.stream(context)) {
        if (inSummaryPhase) {
          summaryText += chunk;
          Renderer.renderStreamChunk(chunk);
        } else {
          jsonBuffer += chunk;
          
          // Detect markdown code block completion for JSON
          if (jsonBuffer.includes('```') && jsonBuffer.split('```').length > 2) {
            const parts = jsonBuffer.split('```');
            const jsonStr = parts[1].replace(/^(json|JSON)/, '').trim();
            try {
              const data = JSON.parse(jsonStr);
              if (data && Array.isArray(data.findings)) {
                onFindingsParsed(data.findings);
                findingsParsed = true;
              }
            } catch (e) {
              // Fail-silent, will try fallback at end
            }
            inSummaryPhase = true;
            const leftover = parts.slice(2).join('```');
            summaryText += leftover;
            Renderer.renderStreamChunk(leftover);
          }
          // Detect JSON end brace followed by double newlines if no markdown code block
          else if (!jsonBuffer.includes('```') && jsonBuffer.includes('}') && jsonBuffer.includes('\n\n')) {
            const lastBrace = jsonBuffer.lastIndexOf('}');
            const jsonStr = jsonBuffer.substring(0, lastBrace + 1).trim();
            try {
              const data = JSON.parse(jsonStr);
              if (data && Array.isArray(data.findings)) {
                onFindingsParsed(data.findings);
                findingsParsed = true;
              }
            } catch (e) {}
            inSummaryPhase = true;
            const leftover = jsonBuffer.substring(lastBrace + 1);
            summaryText += leftover;
            Renderer.renderStreamChunk(leftover);
          }
        }
      }

      // If parsing didn't trigger in the stream, extract and parse at the end
      if (!findingsParsed) {
        let jsonStr = jsonBuffer;
        if (jsonBuffer.includes('```')) {
          const parts = jsonBuffer.split('```');
          jsonStr = parts[1] ? parts[1].replace(/^(json|JSON)/, '').trim() : jsonBuffer;
        }
        try {
          const cleanJson = jsonStr.substring(jsonStr.indexOf('{'), jsonStr.lastIndexOf('}') + 1);
          const data = JSON.parse(cleanJson);
          if (data && Array.isArray(data.findings)) {
            onFindingsParsed(data.findings);
          }
        } catch (e) {
          // If totally invalid, pass an empty array of findings
          onFindingsParsed([]);
        }
      }
    } catch (err: any) {
      Renderer.renderAgentStep('ReviewAgent', 'error', err?.message || String(err));
      onFindingsParsed([]);
    }

    return summaryText;
  }
}
export { loadPrompt };
