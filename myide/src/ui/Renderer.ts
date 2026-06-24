import chalk from 'chalk';
import { Finding } from '../types';

/**
 * Terminal UI rendering helpers using Chalk.
 */
export class Renderer {
  /**
   * Renders the stylized CLI header top bar.
   * @param {string} title - Command or current action.
   * @param {string} filePath - Path to file in focus.
   * @param {string} [extra] - Extra info (e.g. issues count).
   * @returns {void}
   */
  public static renderHeader(title: string, filePath: string, extra?: string): void {
    const formattedFile = filePath ? ` ›  ${filePath}` : '';
    const formattedExtra = extra ? `  ·  ${extra}` : '';
    const barText = `  myide${formattedFile}${formattedExtra}  `;
    console.log('\n' + chalk.bgHex('#0d1117').white.bold(barText) + '\n');
  }

  /**
   * Renders an individual static analysis finding with colored severity badges.
   * @param {Finding} finding - Finding object to render.
   * @returns {void}
   */
  public static renderFinding(finding: Finding): void {
    let badge = '';
    let messageColor = chalk.white;

    switch (finding.severity) {
      case 'error':
        badge = chalk.bgRed.white.bold(' ERROR ');
        messageColor = chalk.red;
        break;
      case 'warning':
        badge = chalk.bgYellow.black.bold(' WARN  ');
        messageColor = chalk.yellow;
        break;
      case 'info':
        badge = chalk.bgBlue.white.bold(' INFO  ');
        messageColor = chalk.cyan;
        break;
    }

    console.log(`${badge} Line ${finding.line} — ${messageColor(finding.message)}`);
    if (finding.suggestion) {
      console.log(`        ${chalk.dim('Suggestion:')} ${chalk.green(finding.suggestion)}`);
    }
  }

  /**
   * Renders a unified diff string with full chalk line highlighting.
   * @param {string} diffText - The raw unified diff text.
   * @returns {void}
   */
  public static renderDiff(diffText: string): void {
    const lines = diffText.split(/\r?\n/);
    for (const line of lines) {
      if (line.startsWith('+') && !line.startsWith('+++')) {
        console.log(chalk.green(line));
      } else if (line.startsWith('-') && !line.startsWith('---')) {
        console.log(chalk.red.strikethrough(line));
      } else if (line.startsWith('@@')) {
        console.log(chalk.cyan.dim(line));
      } else if (line.startsWith('---') || line.startsWith('+++')) {
        console.log(chalk.bold.white(line));
      } else {
        console.log(chalk.dim(line));
      }
    }
  }

  /**
   * Renders status of an agent execution step.
   * @param {string} agentName - Name of the agent.
   * @param {'running'|'done'|'error'} status - Current execution status.
   * @param {string} [detail] - Additional detail.
   * @returns {void}
   */
  public static renderAgentStep(
    agentName: string,
    status: 'running' | 'done' | 'error',
    detail?: string
  ): void {
    const detailStr = detail ? ` ${detail}` : '';
    if (status === 'running') {
      console.log(chalk.blue('▸ ') + chalk.bold(agentName) + chalk.dim(detailStr));
    } else if (status === 'done') {
      console.log(chalk.green('✔ ') + chalk.bold(agentName) + chalk.dim(detailStr));
    } else if (status === 'error') {
      console.log(chalk.red('✖ ') + chalk.bold(agentName) + chalk.red(detailStr));
    }
  }

  /**
   * Appends text to stdout without trailing newlines (used in streaming).
   * @param {string} chunk - Text token.
   * @returns {void}
   */
  public static renderStreamChunk(chunk: string): void {
    process.stdout.write(chalk.white(chunk));
  }

  /**
   * Renders status count summary bar.
   * @param {number} fixed - Number of fixed issues.
   * @param {number} warnings - Warning count.
   * @param {number} errors - Error count.
   * @returns {void}
   */
  public static renderSummaryBar(fixed: number, warnings: number, errors: number): void {
    const fixedStr = fixed > 0 ? chalk.green(`✔ ${fixed} fixed  ·  `) : '';
    const warningsStr = chalk.yellow(`⚠ ${warnings} warnings  ·  `);
    const errorsStr = chalk.red(`✖ ${errors} errors`);
    console.log(`\n  ${fixedStr}${warningsStr}${errorsStr}\n`);
  }
}
