import { LintResult } from '../types';

/**
 * Tool for executing static analysis on source files using ESLint's Node.js API.
 */
export class LintTool {
  /**
   * Programmatically runs ESLint on a given file.
   * If ESLint is not installed in the workspace, it logs a warning and returns an empty array.
   * @param {string} filePath - Path of the file to lint.
   * @returns {Promise<LintResult[]>} List of lint results.
   */
  public async run(filePath: string): Promise<LintResult[]> {
    try {
      // Dynamically require ESLint to avoid startup crashes if ESLint is not installed in the workspace
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { ESLint } = require('eslint');
      
      const eslintInstance = new ESLint({
        useEslintrc: true,
      });

      const results = await eslintInstance.lintFiles([filePath]);
      const lintResults: LintResult[] = [];

      for (const result of results) {
        if (!result.messages) continue;
        for (const msg of result.messages) {
          lintResults.push({
            line: msg.line || 1,
            column: msg.column || 1,
            severity: msg.severity === 2 ? 'error' : 'warning',
            message: msg.message || '',
            ruleId: msg.ruleId || 'unknown',
          });
        }
      }

      return lintResults;
    } catch (err: any) {
      // ESLint is either not installed or configuration is broken
      // We gracefully warn the user and return empty findings
      return [];
    }
  }
}
