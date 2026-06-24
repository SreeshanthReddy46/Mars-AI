import { BaseAgent } from './BaseAgent';
import { loadPrompt } from './ReviewAgent';
import { Message } from '../types';
import { ContextBuilder } from '../core/ContextBuilder';

const CHAT_FALLBACK_PROMPT = `You are an expert coding assistant embedded in a developer's terminal.
You have context from their codebase. Answer questions, explain code, 
suggest improvements, and help debug. When you suggest code changes, 
always explain the reasoning. Be concise — the user is in a terminal, not a doc viewer.

DO NOT:
1. Output large, unannotated blocks of code without explaining why they are needed.
2. Provide answers that ignore the user's project directory or programming language.
3. Suggest downloading external, unverified packages or libraries.
4. Render complex layout structures that look bad in basic terminals.
5. Lose focus on programming, debugging, and workspace tasks.`;

/**
 * Agent responsible for answering developer questions and maintaining conversational history.
 */
export class ChatAgent extends BaseAgent {
  private history: Message[] = [];

  /**
   * Initializes the ChatAgent with the system prompt.
   */
  constructor() {
    super(loadPrompt('chat.md', CHAT_FALLBACK_PROMPT));
  }

  /**
   * Returns the current session message history.
   * @returns {Message[]} List of history messages.
   */
  public getHistory(): Message[] {
    return this.history;
  }

  /**
   * Appends a message to the history.
   * @param {'user'|'assistant'} role - Sender role.
   * @param {string} content - Message text.
   * @returns {void}
   */
  public addMessage(role: 'user' | 'assistant', content: string): void {
    this.history.push({
      role,
      content,
      timestamp: new Date(),
    });
  }

  /**
   * Clears the current chat history.
   * @returns {void}
   */
  public clearHistory(): void {
    this.history = [];
  }

  /**
   * Runs the conversational logic. Assembles context, calls LLM stream, and saves logs.
   * @param {string} userMessage - User input string.
   * @returns {AsyncGenerator<string>} Stream of response tokens.
   */
  public async *run(userMessage: string): AsyncGenerator<string> {
    // Save user query to history
    this.addMessage('user', userMessage);

    // Build history + relevant workspace files context
    const context = await ContextBuilder.buildChatContext(userMessage, this.history);

    let assistantResponse = '';
    for await (const chunk of this.stream(context)) {
      assistantResponse += chunk;
      yield chunk;
    }

    // Automatically suggest /fix if code blocks were outputted but no command was mentioned
    if (
      (assistantResponse.includes('```') ||
        userMessage.toLowerCase().includes('change') ||
        userMessage.toLowerCase().includes('fix')) &&
      !assistantResponse.includes('/fix')
    ) {
      const tip = '\n\n💡 *Tip: You can use `/fix <file>` to generate and apply code patches.*';
      assistantResponse += tip;
      yield tip;
    }

    // Save assistant response to history
    this.addMessage('assistant', assistantResponse);
  }
}
