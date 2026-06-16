import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { runScannerAgent } from '../agents/scanner/scanner.agent.js';
import { initSessionState, getSessionState, appendHistory } from './state.js';
import { initDb } from '../memory/sqlite/sqliteDb.js';
import { routeUserInput } from '../orchestrator/router.js';

/**
 * Renders the premium welcome ASCII box
 */
function renderWelcomeBanner(projectName: string, framework: string, language: string) {
  console.log('\n' + chalk.bold.red('  ███╗   ███╗  ██████╗  ██████╗   ███████╗'));
  console.log(chalk.bold.red('  ████╗ ████║  ██╔══██╗ ██╔══██╗  ██╔════╝'));
  console.log(chalk.bold.yellow('  ██╔████╔██║  ███████║ ██████╔╝  ███████╗'));
  console.log(chalk.bold.yellow('  ██║╚██╔╝██║  ██╔══██║ ██╔══██╗  ╚════██║'));
  console.log(chalk.bold.rgb(255, 165, 0)('  ██║ ╚═╝ ██║  ██║  ██║ ██║  ██║  ███████║'));
  console.log(chalk.bold.rgb(255, 165, 0)('  ╚═╝     ╚═╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝  ╚══════╝') + '\n');
  
  console.log(chalk.bold.red('                      MARS AI TERMINAL                        '));
  console.log(chalk.bold.yellow('                 Multi-Agent Reasoning System                 \n'));
  
  console.log(chalk.gray('──────────────────────────────────────────────────────────────'));
  console.log(`${chalk.bold.cyan('  Project:')}   ${chalk.green(projectName)}`);
  console.log(`${chalk.bold.cyan('  Framework:')} ${chalk.green(framework || 'None detected')}`);
  console.log(`${chalk.bold.cyan('  Language:')}  ${chalk.green(language || 'None detected')}`);
  console.log(chalk.gray('──────────────────────────────────────────────────────────────'));
  console.log(`\n${chalk.bold.yellow('  Type a task or question, or a slash command like "/autonomous".')}`);
  console.log(chalk.gray('  Type "/help" to list all available commands or "exit" to quit.\n'));
}

export async function startInteractiveShell(projectRoot: string): Promise<void> {
  const absoluteRoot = path.resolve(projectRoot);
  
  console.log(chalk.bold.cyan('\nInitializing MARS (Multi-Agent Autonomous Reasoning System)...'));
  
  // 1. Loading Memory Database
  const dbSpinner = ora(chalk.gray('Loading Memory Database...')).start();
  await initDb(absoluteRoot);
  dbSpinner.succeed(chalk.green('✓ Loaded Memory Database'));

  // 2. Scanning Project Codebase
  const scanSpinner = ora(chalk.gray('Scanning Project Codebase...')).start();
  let context;
  try {
    context = await runScannerAgent(absoluteRoot);
    scanSpinner.succeed(chalk.green('✓ Scanned Project Codebase'));
  } catch (err: any) {
    scanSpinner.fail(chalk.red(`MARS Boot failed: ${err.message}`));
    process.exit(1);
  }

  // 3. Starting Agents Cluster
  const agentSpinner = ora(chalk.gray('Starting Agents Cluster...')).start();
  await new Promise(resolve => setTimeout(resolve, 300));
  agentSpinner.succeed(chalk.green('✓ Started Agents Cluster'));

  // 4. Initializing Conversation State
  const stateSpinner = ora(chalk.gray('Initializing Conversation State...')).start();
  initSessionState(absoluteRoot, context);
  stateSpinner.succeed(chalk.green('✓ Initialized Conversation State\n'));

  // 5. Render Banner
  renderWelcomeBanner(
    context.projectName,
    context.frameworks.join(', '),
    context.languages.join(', ')
  );

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\n' + chalk.bold.cyan('╭─ mars ───────────────────────────────────────────────────────╮') + '\n' + chalk.bold.cyan('│ > '),
  });

  rl.prompt();

  rl.on('line', async (line) => {
    console.log(chalk.bold.cyan('╰──────────────────────────────────────────────────────────────╯'));
    
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.yellow('\nGoodbye! Closing MARS AI Terminal.\n'));
      rl.close();
      process.exit(0);
    }

    appendHistory('user', input);

    // Run active AI pipeline
    const aiSpinner = ora(chalk.blue('Thinking...')).start();
    try {
      const state = getSessionState();
      // Pass rl instance so subagents can do interactive prompts if needed
      const response = await routeUserInput(state, input, rl, aiSpinner);
      
      aiSpinner.stop();
      if (response) {
        console.log('\n' + response);
        appendHistory('assistant', response);
      }
    } catch (error: any) {
      aiSpinner.fail(chalk.red(`Error: ${error.message}`));
    }

    rl.prompt();
  }).on('close', () => {
    console.log(chalk.yellow('\nGoodbye! Closing MARS AI Terminal.\n'));
    process.exit(0);
  });
}
