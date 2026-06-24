import { getEncoding } from 'js-tiktoken';

const encoder = getEncoding('cl100k_base');

/**
 * Utility class for token counting and text truncation using js-tiktoken.
 */
export class TokenCounter {
  /**
   * Counts the number of tokens in the given text using cl100k_base encoding.
   * @param {string} text - The input text to measure.
   * @returns {number} The count of tokens.
   */
  public static countTokens(text: string): number {
    try {
      return encoder.encode(text).length;
    } catch (err) {
      // Fallback approximation: ~4 characters per token if encoder fails
      return Math.ceil(text.length / 4);
    }
  }

  /**
   * Truncates text from the middle if it exceeds the specified maximum token limit.
   * Keeps the beginning and the end of the text, insertion a truncation marker in between.
   * @param {string} text - The text to possibly truncate.
   * @param {number} maxTokens - The maximum allowed token count.
   * @returns {string} The truncated (or original) text.
   */
  public static truncateToFit(text: string, maxTokens: number): string {
    try {
      const tokens = encoder.encode(text);
      if (tokens.length <= maxTokens) {
        return text;
      }

      // Reserve about 10 tokens for the marker message
      const budget = maxTokens - 10;
      if (budget <= 0) {
        return '[... truncated ...]';
      }

      const half = Math.floor(budget / 2);
      const startTokens = tokens.slice(0, half);
      const endTokens = tokens.slice(tokens.length - half);

      const startText = encoder.decode(startTokens);
      const endText = encoder.decode(endTokens);
      const truncatedCount = tokens.length - startTokens.length - endTokens.length;

      return `${startText}\n\n[... truncated ${truncatedCount} tokens ...]\n\n${endText}`;
    } catch (err) {
      // Fallback text-based truncation if tiktoken fails
      if (text.length <= maxTokens * 4) {
        return text;
      }
      const halfChar = Math.floor((maxTokens * 4) / 2);
      const startText = text.slice(0, halfChar);
      const endText = text.slice(text.length - halfChar);
      return `${startText}\n\n[... truncated text ...]\n\n${endText}`;
    }
  }
}
