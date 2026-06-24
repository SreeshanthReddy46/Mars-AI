import { glob } from 'glob';
import * as chokidar from 'chokidar';
import * as fs from 'fs';
import * as path from 'path';
import { FileIndex, FileEntry } from '../types';

/**
 * Parses the workspace .gitignore file to extract glob exclude patterns.
 * @param {string} rootDir - Workspace root directory.
 * @returns {string[]} An array of ignore patterns.
 */
function parseGitignore(rootDir: string): string[] {
  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/bin/**',
    '**/.git/**',
    '**/*.tmp',
    '**/*.bak'
  ];
  const gitignorePath = path.join(rootDir, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    try {
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          let pattern = trimmed;
          if (pattern.startsWith('/')) {
            pattern = pattern.substring(1);
          }
          if (pattern.endsWith('/')) {
            pattern = `${pattern}**`;
          }
          if (!pattern.includes('*') && !pattern.includes('**')) {
            ignorePatterns.push(`**/${pattern}/**`);
            ignorePatterns.push(`**/${pattern}`);
          } else {
            ignorePatterns.push(`**/${pattern}`);
          }
        }
      }
    } catch (err) {
      // Fail-safe: ignore errors reading gitignore
    }
  }
  return ignorePatterns;
}

/**
 * Constructs a FileEntry object for the specified file path.
 * @param {string} filePath - Absolute path to the file.
 * @returns {Promise<FileEntry>} The created FileEntry.
 */
async function createFileEntry(filePath: string): Promise<FileEntry> {
  const stats = await fs.promises.stat(filePath);
  const content = await fs.promises.readFile(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).slice(0, 50).join('\n');
  return {
    path: filePath,
    size: stats.size,
    lastModified: stats.mtime,
    preview: lines,
  };
}

/**
 * Workspace indexer manager. Scans codebase files and watches for modifications.
 */
export class IndexManager {
  private static index: FileIndex = new Map();
  private static watcher: chokidar.FSWatcher | null = null;
  private static rootDir: string = '';
  private static ignorePatterns: string[] = [];

  /**
   * Scans workspace directory and initializes file indexing and monitoring.
   * @param {string} rootDir - Workspace root directory path.
   * @returns {Promise<FileIndex>} Map containing indexed files.
   */
  public static async indexWorkspace(rootDir: string): Promise<FileIndex> {
    this.rootDir = path.resolve(rootDir);
    this.ignorePatterns = parseGitignore(this.rootDir);
    this.index.clear();

    const files = await glob('**/*.{ts,js,tsx,jsx,py,go,rs}', {
      cwd: this.rootDir,
      ignore: this.ignorePatterns,
      absolute: true,
      nodir: true,
    });

    for (const file of files) {
      try {
        const normalized = path.resolve(file);
        const entry = await createFileEntry(normalized);
        this.index.set(normalized, entry);
      } catch (err) {
        // Skip files that are unreadable or deleted mid-scan
      }
    }

    if (this.watcher) {
      await this.watcher.close();
    }

    this.watcher = chokidar.watch(this.rootDir, {
      ignored: (filePath) => {
        const relative = path.relative(this.rootDir, filePath);
        if (relative.split(path.sep).some(part => ['node_modules', 'dist', 'bin', '.git'].includes(part))) {
          return true;
        }
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath);
          const allowed = ['.ts', '.js', '.tsx', '.jsx', '.py', '.go', '.rs'];
          return !allowed.includes(ext);
        }
        return false;
      },
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher.on('add', async (filePath) => {
      try {
        const normalized = path.resolve(filePath);
        const entry = await createFileEntry(normalized);
        this.index.set(normalized, entry);
      } catch (err) {}
    });

    this.watcher.on('change', async (filePath) => {
      try {
        const normalized = path.resolve(filePath);
        const entry = await createFileEntry(normalized);
        this.index.set(normalized, entry);
      } catch (err) {}
    });

    this.watcher.on('unlink', (filePath) => {
      const normalized = path.resolve(filePath);
      this.index.delete(normalized);
    });

    return this.index;
  }

  /**
   * Retrieves the current in-memory workspace file index.
   * @returns {FileIndex} The file index map.
   */
  public static getIndex(): FileIndex {
    return this.index;
  }

  /**
   * Closes the active file watcher if it exists.
   * @returns {Promise<void>}
   */
  public static async closeWatcher(): Promise<void> {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}
