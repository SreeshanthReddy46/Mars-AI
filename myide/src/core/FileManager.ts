import * as fs from 'fs';
import * as path from 'path';

/**
 * Utility function to compute Levenshtein edit distance between two strings.
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} The edit distance.
 */
function getEditDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a.charAt(i - 1) === b.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          Math.min(
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          )
        );
      }
    }
  }
  return matrix[a.length][b.length];
}

/**
 * Core manager handling file system reads, writes, backups, and path suggestions.
 */
export class FileManager {
  /**
   * Reads the content of a file.
   * @param {string} filePath - Absolute or relative path to the file.
   * @returns {Promise<string>} Content of the file.
   */
  public static async readFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, 'utf-8', (err, data) => {
        if (err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  /**
   * Writes content to a file atomically.
   * First writes to {filePath}.tmp, then renames it to {filePath}.
   * Creates parent directories if they don't exist.
   * @param {string} filePath - Path to write the file.
   * @param {string} content - Code/text content.
   * @returns {Promise<void>}
   */
  public static async writeFileAtomic(filePath: string, content: string): Promise<void> {
    const parentDir = path.dirname(filePath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }

    const tempPath = `${filePath}.tmp`;

    return new Promise((resolve, reject) => {
      fs.writeFile(tempPath, content, 'utf-8', (writeErr) => {
        if (writeErr) {
          return reject(writeErr);
        }
        fs.rename(tempPath, filePath, (renameErr) => {
          if (renameErr) {
            // Cleanup temp file on error
            fs.unlink(tempPath, () => {});
            return reject(renameErr);
          }
          resolve();
        });
      });
    });
  }

  /**
   * Creates a backup copy of a file at {filePath}.myide.bak.
   * @param {string} filePath - Path of the file to backup.
   * @returns {Promise<void>}
   */
  public static async createBackup(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      return;
    }
    const backupPath = `${filePath}.myide.bak`;
    return new Promise((resolve, reject) => {
      fs.copyFile(filePath, backupPath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Restores a file from its backup copy at {filePath}.myide.bak.
   * @param {string} filePath - Path of the file to restore.
   * @returns {Promise<void>}
   */
  public static async restoreBackup(filePath: string): Promise<void> {
    const backupPath = `${filePath}.myide.bak`;
    if (!fs.existsSync(backupPath)) {
      throw new Error(`Backup file not found for: ${filePath}`);
    }
    return new Promise((resolve, reject) => {
      fs.copyFile(backupPath, filePath, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Finds the closest file path in the workspace index to match a given missing path.
   * Compares filenames using Levenshtein distance.
   * @param {string} targetPath - The typed file path that was not found.
   * @param {string[]} availablePaths - List of all indexed file paths in workspace.
   * @returns {string|null} The closest matching path, or null if distance is too high.
   */
  public static findClosestMatch(targetPath: string, availablePaths: string[]): string | null {
    if (availablePaths.length === 0) {
      return null;
    }

    const targetName = path.basename(targetPath).toLowerCase();
    let minDistance = Infinity;
    let closestPath: string | null = null;

    for (const p of availablePaths) {
      const candidateName = path.basename(p).toLowerCase();
      const dist = getEditDistance(targetName, candidateName);
      if (dist < minDistance) {
        minDistance = dist;
        closestPath = p;
      }
    }

    // Suggest only if edit distance is within 50% of the target filename length
    const threshold = Math.max(3, Math.floor(targetName.length / 2));
    if (minDistance <= threshold) {
      return closestPath;
    }

    return null;
  }
}
