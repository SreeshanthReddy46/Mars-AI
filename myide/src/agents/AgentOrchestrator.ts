import * as fs from 'fs';
import { BaseAgent } from './BaseAgent';
import { ReviewAgent } from './ReviewAgent';
import { DebugAgent } from './DebugAgent';
import { FixAgent } from './FixAgent';
import { ChatAgent } from './ChatAgent';
import { GitTool } from '../tools/GitTool';
import { FileManager } from '../core/FileManager';
import { ContextBuilder } from '../core/ContextBuilder';
import { AgentResult, Finding } from '../types';

/**
 * Lightweight classifier that uses LLM to label user commands/intent.
 */
class IntentClassifier extends BaseAgent {
  /**
   * Initializes the IntentClassifier with categorization instructions.
   */
  constructor() {
    super(
      "Classify this developer instruction into exactly one of: review, debug, fix, chat, diff. " +
        "Return only the single word (no punctuation, no capitalization). Default to 'chat' if unclear."
    );
  }

  /**
   * Classifies the raw message string.
   * @param {string} message - User query.
   * @returns {Promise<string>} One of the categories.
   */
  public async classify(message: string): Promise<string> {
    try {
      const response = await this.call(message);
      return response.trim().toLowerCase();
    } catch (err) {
      return 'chat';
    }
  }
}

/**
 * Orchestrator acting as a central router for user instructions.
 */
export class AgentOrchestrator {
  private classifier = new IntentClassifier();
  private reviewAgent = new ReviewAgent();
  private debugAgent = new DebugAgent();
  private fixAgent = new FixAgent();
  private chatAgent = new ChatAgent();
  private gitTool = new GitTool();

  /**
   * Routes user input to appropriate agents, running static checks and callbacks.
   * @param {string} input - Raw input from the user.
   * @param {string} [currentFilePath] - Path of the active file in context.
   * @param {object} [callbacks] - Optional event handlers for streaming or finding parsing.
   * @param {Function} [callbacks.onStreamChunk] - Stream token handler.
   * @param {Function} [callbacks.onFindingsParsed] - JSON findings handler.
   * @returns {Promise<AgentResult>} Structured output of the operation.
   */
  public async route(
    input: string,
    currentFilePath?: string,
    callbacks?: {
      onStreamChunk?: (chunk: string) => void;
      onFindingsParsed?: (findings: Finding[]) => void;
    }
  ): Promise<AgentResult> {
    // 1. Identify developer intent
    let intent = await this.classifier.classify(input);
    const validIntents = ['review', 'debug', 'fix', 'chat', 'diff'];
    if (!validIntents.includes(intent)) {
      intent = 'chat';
    }

    // 2. Route input to the appropriate agent
    switch (intent) {
      case 'review': {
        if (!currentFilePath) {
          return {
            agentName: 'ReviewAgent',
            output: 'Please open or specify a file to review.',
          };
        }
        const context = await ContextBuilder.buildReviewContext(currentFilePath);
        const summary = await this.reviewAgent.run(context, (findings) => {
          if (callbacks?.onFindingsParsed) {
            callbacks.onFindingsParsed(findings);
          }
        });
        return {
          agentName: 'ReviewAgent',
          output: summary,
        };
      }

      case 'debug': {
        let debugContext = input;
        if (currentFilePath && fs.existsSync(currentFilePath)) {
          try {
            const content = await FileManager.readFile(currentFilePath);
            debugContext = `=== TARGET FILE: ${currentFilePath} ===\n${content}\n\n=== RUNTIME ERROR / BUG CONTEXT ===\n${input}`;
          } catch (e) {}
        }
        const output = await this.debugAgent.run(debugContext);
        if (callbacks?.onStreamChunk) {
          callbacks.onStreamChunk(output);
        }
        return {
          agentName: 'DebugAgent',
          output,
        };
      }

      case 'fix': {
        if (!currentFilePath) {
          return {
            agentName: 'FixAgent',
            output: 'Please open or specify a file to fix.',
          };
        }
        try {
          const content = await FileManager.readFile(currentFilePath);
          const { diff, explanation } = await this.fixAgent.run(content, input);
          if (callbacks?.onStreamChunk) {
            callbacks.onStreamChunk(explanation);
          }
          return {
            agentName: 'FixAgent',
            output: explanation,
            diff,
          };
        } catch (err: any) {
          return {
            agentName: 'FixAgent',
            output: `Failed to generate patch: ${err?.message || String(err)}`,
          };
        }
      }

      case 'diff': {
        try {
          const diffText = await this.gitTool.getDiff(currentFilePath);
          if (callbacks?.onStreamChunk) {
            callbacks.onStreamChunk(diffText);
          }
          return {
            agentName: 'GitTool',
            output: diffText,
          };
        } catch (err: any) {
          return {
            agentName: 'GitTool',
            output: `Failed to fetch git diff: ${err?.message || String(err)}`,
          };
        }
      }

      case 'chat':
      default: {
        let response = '';
        for await (const chunk of this.chatAgent.run(input)) {
          response += chunk;
          if (callbacks?.onStreamChunk) {
            callbacks.onStreamChunk(chunk);
          }
        }
        return {
          agentName: 'ChatAgent',
          output: response,
        };
      }
    }
  }
}
