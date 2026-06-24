import { exec } from 'child_process';
import * as path from 'path';
import { TscResult } from '../types';

/**
 * Tool for executing TypeScript compiler type checking on the workspace.
 */
export class TypeCheckTool {
  /**
   * Spawns tsc to check the project and returns structured compiler errors.
   * If a filePath is provided, filters results to only that file.
   * @param {string} [filePath] - Optional path to filter results.
   * @returns {Promise<TscResult[]>} List of compiler diagnostics.
   */
  public async run(filePath?: string): Promise<TscResult[]> {
    return new Promise((resolve) => {
      // Execute tsc via npx to utilize the workspace's local typescript version
      const cmd = 'npx tsc --noEmit --pretty false';
      
      exec(cmd, { cwd: process.cwd() }, (err, stdout, stderr) => {
        const results: TscResult[] = [];
        const combinedOutput = stdout + '\n' + stderr;
        const lines = combinedOutput.split(/\r?\n/);
        
        // Regex pattern: file(line,col): error|warning TSXXXX: message
        const regex = /(.+)\((\d+),(\d+)\): (error|warning) (TS\d+): (.+)/;

        for (const line of lines) {
          const match = regex.exec(line);
          if (match) {
            const [, file, lineStr, colStr, severity, code, message] = match;
            const absoluteFile = path.resolve(file);
            results.push({
              file: absoluteFile,
              line: parseInt(lineStr, 10),
              col: parseInt(colStr, 10),
              severity,
              code,
              message: message.trim(),
            });
          }
        }

        if (filePath) {
          const targetAbs = path.resolve(filePath);
          resolve(results.filter((r) => r.file === targetAbs));
        } else {
          resolve(results);
        }
      });
    });
  }
}
