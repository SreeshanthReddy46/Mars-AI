import * as fs from 'fs';
import * as path from 'path';
import { applyPatch as applyDiffPatch } from 'diff';
import { FileManager } from './FileManager';
import { TypeCheckTool } from '../tools/TypeCheckTool';

/**
 * Core manager responsible for parsing unified diffs, applying them safely,
 * validating with type-checking, and handling backups and reverts.
 */
export class PatchApplier {
  /**
   * Parses a unified diff and applies it to a target file.
   * Runs verification and reverts from backup if compilation errors are introduced.
   * @param {string} filePath - Path to the file to patch.
   * @param {string} diffText - The unified diff text to apply.
   * @returns {Promise<{ success: boolean; error?: string }>} The result of the patch operation.
   */
  public static async applyPatch(
    filePath: string,
    diffText: string
  ): Promise<{ success: boolean; error?: string }> {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    try {
      // 1. Read original content
      const originalContent = await FileManager.readFile(absPath);

      // 2. Parse and apply the unified diff
      const patchedContent = applyDiffPatch(originalContent, diffText);
      if (patchedContent === false || typeof patchedContent !== 'string') {
        return {
          success: false,
          error: 'Failed to apply unified diff patch. The patch may be malformed or out of sync.',
        };
      }

      // 3. Create a backup file (.myide.bak)
      await FileManager.createBackup(absPath);

      // 4. Write patched content to .tmp file
      const tempPath = `${absPath}.tmp`;
      await fs.promises.writeFile(tempPath, patchedContent, 'utf-8');

      // 5. Swap temp path to main path to run TypeCheckTool correctly
      // (tsc needs the file at its correct path to resolve imports and module structure)
      await fs.promises.rename(tempPath, absPath);

      // 6. Run TypeCheckTool on the modified file
      const typeCheckTool = new TypeCheckTool();
      const diagnostics = await typeCheckTool.run(absPath);

      // Filter for errors only (ignore warnings/info for strict rollback)
      const errors = diagnostics.filter(
        (d) => d.severity.toLowerCase() === 'error' || d.severity.toLowerCase() === 'err'
      );

      if (errors.length > 0) {
        // Compile errors found! Revert to backup and clean up temp
        await FileManager.restoreBackup(absPath);
        const errorSummary = errors
          .map((e) => `${e.file}:${e.line}:${e.col} - ${e.message}`)
          .join('\n');
        return {
          success: false,
          error: `Patch introduced new type errors:\n${errorSummary}`,
        };
      }

      // 7. Success - Keep the change, cleanup backup
      const backupPath = `${absPath}.myide.bak`;
      if (fs.existsSync(backupPath)) {
        await fs.promises.unlink(backupPath);
      }

      return { success: true };
    } catch (err: any) {
      // Revert if backup exists and cleanup temp
      const backupPath = `${absPath}.myide.bak`;
      if (fs.existsSync(backupPath)) {
        try {
          await FileManager.restoreBackup(absPath);
        } catch (revertErr) {}
      }
      const tempPath = `${absPath}.tmp`;
      if (fs.existsSync(tempPath)) {
        try {
          await fs.promises.unlink(tempPath);
        } catch (unlinkErr) {}
      }
      return { success: false, error: err?.message || String(err) };
    }
  }
}
