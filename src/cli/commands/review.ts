import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { runScannerAgent } from '../../agents/scanner/scanner.agent.js';
import { runSecurityAgent } from '../../agents/security/security.agent.js';
import { runPerformanceAgent } from '../../agents/performance/performance.agent.js';
import { runArchitectureAgent } from '../../agents/architecture/architecture.agent.js';
import { runRefactorAgent } from '../../agents/refactor/refactor.agent.js';
import { runDocsAgent } from '../../agents/docs/docs.agent.js';
import { ReviewResult, ReviewComment } from '../../agents/reviewAgent.js';
import { initDb } from '../../memory/sqlite/sqliteDb.js';

export async function handleReviewCommand(file: string | undefined, options: { path: string }) {
  const projectPath = path.resolve(options.path);
  await initDb(projectPath);

  // 1. Choose review type
  const answers = await inquirer.prompt([
    {
      type: 'select',
      name: 'agentType',
      message: 'Select the specialty agent to review your code:',
      choices: [
        { name: '🔒 Security Scan (secrets, SQLi, XSS)', value: 'security' },
        { name: '⚡ Performance Review (rendering, loops, DB queries)', value: 'performance' },
        { name: '🏗️ Architecture Check (coupling, monolithic files, SOLID)', value: 'architecture' },
        { name: '✨ Code Quality & Refactor (duplication, complexity)', value: 'refactor' },
        { name: '📝 Documentation Generator (README/Architecture doc)', value: 'docs' },
      ],
    },
  ]);

  const agentType = answers.agentType;

  // 2. Scan project for context
  const scanSpinner = ora(chalk.blue('Scanning project context...')).start();
  let context;
  try {
    context = await runScannerAgent(projectPath);
    scanSpinner.succeed(chalk.green('Workspace scan complete.'));
  } catch (error: any) {
    scanSpinner.fail(chalk.red(`Scan failed: ${error.message}`));
    return;
  }

  // Validate if file exists in project
  if (file) {
    const relFile = path.relative(projectPath, path.resolve(projectPath, file)).replace(/\\/g, '/');
    if (!context.files.includes(relFile) && !context.configs.includes(relFile)) {
      console.error(chalk.red(`\n[Error] File not found in workspace: ${file}`));
      return;
    }
    file = relFile;
  }

  // 3. Invoke Agent
  const spinner = ora(chalk.blue(`Running ${agentType} agent...`)).start();
  try {
    if (agentType === 'docs') {
      spinner.text = 'Compiling project documentation...';
      const markdown = await runDocsAgent(projectPath, context);
      spinner.succeed(chalk.green('Documentation compiled!'));
      
      console.log('\n' + chalk.bold.cyan('=== Generated Documentation ==='));
      console.log(markdown);
      console.log();
      return;
    }

    let result: ReviewResult;
    if (agentType === 'security') {
      result = await runSecurityAgent(projectPath, context, file);
    } else if (agentType === 'performance') {
      result = await runPerformanceAgent(projectPath, context, file);
    } else if (agentType === 'architecture') {
      result = await runArchitectureAgent(projectPath, context, file);
    } else {
      result = await runRefactorAgent(projectPath, context, file);
    }

    spinner.succeed(chalk.green('Analysis complete.'));

    console.log('\n' + chalk.bold.cyan(`=== Code Review Summary (${agentType}) ===`));
    console.log(result.summary);

    console.log('\n' + chalk.bold.cyan('=== Review Comments ==='));
    if (result.comments.length === 0) {
      console.log(chalk.green('✓ No issues identified! Exceptional code.'));
    } else {
      result.comments.forEach((comment: ReviewComment, index: number) => {
        const num = index + 1;
        const severityColors: Record<'high' | 'medium' | 'low', any> = {
          high: chalk.red.bold,
          medium: chalk.yellow.bold,
          low: chalk.blue.bold,
        };
        const severityLabel = severityColors[comment.severity](`[${comment.severity.toUpperCase()}]`);
        const lineStr = comment.lineNumber ? `:${comment.lineNumber}` : '';
        
        console.log(`\n${chalk.bold(num + '.')} ${severityLabel} ${chalk.cyan(comment.filePath + lineStr)}`);
        console.log(`${chalk.bold('Rule:')}       ${comment.rule}`);
        console.log(`${chalk.bold('Details:')}    ${comment.message}`);
        console.log(`${chalk.bold('Suggestion:')}`);
        console.log(chalk.gray(comment.suggestion.split('\n').map((l: string) => '  ' + l).join('\n')));
      });
    }
    console.log();
  } catch (error: any) {
    spinner.fail(chalk.red(`Analysis failed: ${error.message}`));
  }
}
