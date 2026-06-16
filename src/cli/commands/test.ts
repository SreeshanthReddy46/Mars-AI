import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs';
import { runScannerAgent } from '../../agents/scanner/scanner.agent.js';
import { runTestingAgent } from '../../agents/testing/testing.agent.js';
import { initDb } from '../../memory/sqlite/sqliteDb.js';

export async function handleTestCommand(file: string, options: { path: string; output?: string }) {
  const projectPath = path.resolve(options.path);
  await initDb(projectPath);

  // 1. Scan project for context
  const scanSpinner = ora(chalk.blue('Scanning project context...')).start();
  let context;
  try {
    context = await runScannerAgent(projectPath);
    scanSpinner.succeed(chalk.green('Workspace scan complete.'));
  } catch (error: any) {
    scanSpinner.fail(chalk.red(`Scan failed: ${error.message}`));
    return;
  }

  // 2. Validate file
  const relFile = path.relative(projectPath, path.resolve(projectPath, file)).replace(/\\/g, '/');
  if (!context.files.includes(relFile)) {
    console.error(chalk.red(`\n[Error] File not found in workspace: ${file}`));
    return;
  }

  // 3. Run testing agent
  const testSpinner = ora(chalk.blue('Generating test suite code...')).start();
  try {
    const testCode = await runTestingAgent(projectPath, context, relFile);
    testSpinner.succeed(chalk.green('Test suite generated!'));

    if (options.output) {
      const outputPath = path.resolve(projectPath, options.output);
      fs.writeFileSync(outputPath, testCode, 'utf-8');
      console.log(chalk.green(`\nTests written successfully to: ${options.output}\n`));
    } else {
      console.log('\n' + chalk.bold.cyan('=== Generated Test Suite ==='));
      console.log(testCode);
      console.log();
    }
  } catch (error: any) {
    testSpinner.fail(chalk.red(`Test generation failed: ${error.message}`));
  }
}
