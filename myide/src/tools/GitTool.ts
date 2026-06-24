import simpleGit, { SimpleGit, StatusResult, DefaultLogFields } from 'simple-git';

/**
 * Tool for executing Git operations within the workspace using simple-git.
 */
export class GitTool {
  private git: SimpleGit;

  /**
   * Initializes the GitTool with the current working directory.
   */
  constructor() {
    this.git = simpleGit(process.cwd());
  }

  /**
   * Runs 'git blame' on the specified file.
   * @param {string} filePath - Path to the file.
   * @returns {Promise<string>} The git blame output string.
   */
  public async getBlame(filePath: string): Promise<string> {
    try {
      return await this.git.raw(['blame', filePath]);
    } catch (err: any) {
      return `Git blame failed: ${err?.message || String(err)}`;
    }
  }

  /**
   * Runs 'git diff' for HEAD or a specific file.
   * @param {string} [filePath] - Optional path to limit diff.
   * @returns {Promise<string>} The unified diff output.
   */
  public async getDiff(filePath?: string): Promise<string> {
    try {
      const args = ['diff', 'HEAD'];
      if (filePath) {
        args.push(filePath);
      }
      return await this.git.raw(args);
    } catch (err: any) {
      return `Git diff failed: ${err?.message || String(err)}`;
    }
  }

  /**
   * Runs 'git status' on the workspace.
   * @returns {Promise<StatusResult>} The simple-git StatusResult object.
   */
  public async getStatus(): Promise<StatusResult> {
    return this.git.status();
  }

  /**
   * Retrieves a list of recent commits.
   * @param {number} n - Maximum number of commits to fetch.
   * @returns {Promise<DefaultLogFields[]>} The list of commits.
   */
  public async getRecentCommits(n: number): Promise<DefaultLogFields[]> {
    try {
      const logResult = await this.git.log({ maxCount: n });
      return [...logResult.all];
    } catch (err) {
      return [];
    }
  }
}
