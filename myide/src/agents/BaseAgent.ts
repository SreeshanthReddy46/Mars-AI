import Anthropic from '@anthropic-ai/sdk';
import { ConfigManager } from '../core/ConfigManager';
import { TokenCounter } from '../core/TokenCounter';

/**
 * Base abstract class for all AI agents.
 * Handles client initialization, Anthropic API routing, token budgets, and retry logic.
 */
export abstract class BaseAgent {
  /**
   * Initializes the agent with a system prompt.
   * @param {string} systemPrompt - System instructions for the agent.
   */
  constructor(protected systemPrompt: string) {}

  /**
   * Resolves the Anthropic SDK client using config API key.
   * @protected
   * @returns {Anthropic} The Anthropic SDK instance.
   */
  protected getAnthropicClient(): Anthropic {
    const config = ConfigManager.getConfig();
    if (!config.apiKey) {
      throw new Error(
        'Anthropic API key is missing. Please run `myide init` to configure your API key.'
      );
    }
    return new Anthropic({ apiKey: config.apiKey });
  }

  /**
   * Translates the custom configuration model name to official Anthropic model ID.
   * @protected
   * @returns {string} Official model ID.
   */
  protected getModelName(): string {
    const config = ConfigManager.getConfig();
    if (config.model === 'claude-sonnet-4-6') {
      return 'claude-3-5-sonnet-20241022';
    }
    return config.model;
  }

  /**
   * Wraps an async action in retry logic (3 attempts with exponential backoff)
   * specifically targetting status codes 429 and 5xx.
   * @protected
   * @param {() => Promise<T>} fn - The operation to perform.
   * @param {number} [retries=3] - Maximum retry attempts remaining.
   * @param {number} [delay=1000] - Time to wait before next retry.
   * @returns {Promise<T>} The result of the operation.
   */
  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    retries = 3,
    delay = 1000
  ): Promise<T> {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status;
      const isRateLimit = status === 429;
      const isServerError = status >= 500 && status < 600;

      if ((isRateLimit || isServerError) && retries > 0) {
        if (isRateLimit) {
          console.warn(`\nRate limited — retrying in ${delay / 1000}s…`);
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1, delay * 2);
      }
      throw err;
    }
  }

  /**
   * Sends user prompt to Anthropic Claude and returns the full content string.
   * @param {string} prompt - Prompt context to send.
   * @returns {Promise<string>} Full response text.
   */
  public async call(prompt: string): Promise<string> {
    const client = this.getAnthropicClient();
    const config = ConfigManager.getConfig();
    const maxTokens = config.maxTokens || 4096;
    const budget = 128000 - maxTokens;

    let finalPrompt = prompt;
    const tokenCount = TokenCounter.countTokens(prompt);
    if (tokenCount > budget) {
      console.warn(
        `\n[myide WARNING] Context size (${tokenCount} tokens) exceeds budget limit (${budget} tokens). Truncating from the middle...`
      );
      finalPrompt = TokenCounter.truncateToFit(prompt, budget);
    }

    const model = this.getModelName();

    const response = await this.retryWithBackoff(async () => {
      return client.messages.create({
        model: model,
        max_tokens: maxTokens,
        system: this.systemPrompt,
        messages: [{ role: 'user', content: finalPrompt }],
      });
    });

    const firstBlock = response.content[0];
    if (firstBlock && firstBlock.type === 'text') {
      return firstBlock.text;
    }
    return '';
  }

  /**
   * Sends user prompt to Anthropic Claude and streams token response.
   * @param {string} prompt - Prompt context to stream.
   * @returns {AsyncGenerator<string>} Chunks of streaming text.
   */
  public async *stream(prompt: string): AsyncGenerator<string> {
    const client = this.getAnthropicClient();
    const config = ConfigManager.getConfig();
    const maxTokens = config.maxTokens || 4096;
    const budget = 128000 - maxTokens;

    let finalPrompt = prompt;
    const tokenCount = TokenCounter.countTokens(prompt);
    if (tokenCount > budget) {
      console.warn(
        `\n[myide WARNING] Context size (${tokenCount} tokens) exceeds budget limit (${budget} tokens). Truncating from the middle...`
      );
      finalPrompt = TokenCounter.truncateToFit(prompt, budget);
    }

    const model = this.getModelName();

    const streamInstance = await this.retryWithBackoff(async () => {
      return client.messages.create({
        model: model,
        max_tokens: maxTokens,
        system: this.systemPrompt,
        messages: [{ role: 'user', content: finalPrompt }],
        stream: true,
      });
    });

    for await (const event of streamInstance) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
