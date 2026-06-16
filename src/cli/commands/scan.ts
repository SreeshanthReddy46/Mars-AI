import path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import { runScannerAgent } from '../../agents/scanner/scanner.agent.js';
import { initDb } from '../../memory/sqlite/sqliteDb.js';

export async function handleScanCommand(options: { path: string }) {
  const projectPath = path.resolve(options.path);
  const spinner = ora(chalk.blue('Scanning project structure...')).start();
  try {
    await initDb(projectPath);
    const context = await runScannerAgent(projectPath);
    spinner.succeed(chalk.green('Project scanning complete!'));
    
    console.log('\n' + chalk.bold.cyan('=== MARS Project Analysis ==='));
    console.log(`${chalk.bold('Project Name:')}    ${context.projectName}`);
    console.log(`${chalk.bold('Package Manager:')} ${context.packageManager}`);
    console.log(`${chalk.bold('Languages:')}       ${context.languages.join(', ') || 'None detected'}`);
    console.log(`${chalk.bold('Frameworks:')}      ${context.frameworks.join(', ') || 'None detected'}`);
    console.log(`${chalk.bold('Entry Points:')}    ${context.entryPoints.join(', ') || 'None detected'}`);
    console.log(`${chalk.bold('Configs:')}         ${context.configs.join(', ') || 'None detected'}`);
    console.log(`${chalk.bold('Files Found:')}     ${context.files.length}`);
    
    console.log('\n' + chalk.bold.cyan('=== Project Structure ==='));
    if (context.structure.trim()) {
      console.log(context.structure);
    } else {
      console.log(chalk.gray('  Empty directory or all files filtered.'));
    }
  } catch (error: any) {
    spinner.fail(chalk.red('Scanning failed: ' + error.message));
  }
}
