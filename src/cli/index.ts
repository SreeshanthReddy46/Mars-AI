import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import path from 'path';
import { handleScanCommand } from './commands/scan.js';
import { handleFixCommand } from './commands/fix.js';
import { handleReviewCommand } from './commands/review.js';
import { handleTestCommand } from './commands/test.js';
import { loadConfig, saveConfig } from '../config/configManager.js';

const program = new Command();

program
  .name('mars-review')
  .description('Autonomous Production-Grade Code Review Agent Platform')
  .version('1.0.0');

// 1. Scan command
program
  .command('scan')
  .description('Scan the codebase layout, packages, and frameworks')
  .option('-p, --path <path>', 'Path to project root', '.')
  .action(handleScanCommand);

// 2. Config command
program
  .command('config')
  .description('Configure MARS Review API keys, endpoints, and providers')
  .option('-p, --path <path>', 'Path to project root', '.')
  .action(async (options) => {
    const projectPath = path.resolve(options.path);
    const config = loadConfig(projectPath);
    
    console.log(chalk.cyan('\n=== MARS Review Configuration ==='));
    console.log(`Current Provider: ${chalk.bold.yellow(config.provider?.toUpperCase())}`);
    console.log(`Gemini API Key:   ${config.geminiApiKey ? chalk.green('Configured') : chalk.red('Not Configured')}`);
    console.log(`OpenAI API Key:   ${config.openaiApiKey ? chalk.green('Configured') : chalk.red('Not Configured')}`);
    console.log(`Ollama Endpoint:  ${config.ollamaEndpoint || 'http://localhost:11434'}`);
    console.log(`Default Model:    ${config.defaultModel}\n`);

    const answers = await inquirer.prompt([
      {
        type: 'select',
        name: 'provider',
        message: 'Select default AI provider:',
        choices: ['gemini', 'openai', 'ollama'],
        default: config.provider,
      },
      {
        type: 'input',
        name: 'geminiApiKey',
        message: 'Enter GEMINI_API_KEY (leave empty to keep current):',
        default: '',
        when: (a) => a.provider === 'gemini',
      },
      {
        type: 'input',
        name: 'openaiApiKey',
        message: 'Enter OPENAI_API_KEY (leave empty to keep current):',
        default: '',
        when: (a) => a.provider === 'openai',
      },
      {
        type: 'input',
        name: 'ollamaEndpoint',
        message: 'Enter Ollama host endpoint:',
        default: config.ollamaEndpoint || 'http://localhost:11434',
        when: (a) => a.provider === 'ollama',
      },
      {
        type: 'input',
        name: 'defaultModel',
        message: 'Enter default model name (e.g. gemini-2.5-flash, gpt-4o, qwen2.5-coder:latest):',
        default: (a: any) => {
          if (a.provider === 'gemini') return 'gemini-2.5-flash';
          if (a.provider === 'openai') return 'gpt-4o';
          return 'qwen2.5-coder:latest';
        },
      }
    ]);

    const updates: any = {
      provider: answers.provider,
      defaultModel: answers.defaultModel,
    };
    if (answers.geminiApiKey) updates.geminiApiKey = answers.geminiApiKey;
    if (answers.openaiApiKey) updates.openaiApiKey = answers.openaiApiKey;
    if (answers.ollamaEndpoint) updates.ollamaEndpoint = answers.ollamaEndpoint;

    saveConfig(projectPath, updates);
    console.log(chalk.green('\nConfiguration saved successfully to .nexus-review/config.json!'));
  });

// 3. Fix command
program
  .command('fix <issue>')
  .description('Run autonomous multi-agent graph loop to diagnose and repair an issue')
  .option('-p, --path <path>', 'Path to project root', '.')
  .option('--apply', 'Auto-apply patches without interactive approval', false)
  .action((issue, options) => handleFixCommand(issue, options));

// 4. Review command
program
  .command('review [file]')
  .description('Invoke specialized review agents (Security, Performance, etc.)')
  .option('-p, --path <path>', 'Path to project root', '.')
  .action((file, options) => handleReviewCommand(file, options));

// 5. Test command
program
  .command('test <file>')
  .description('Invoke the test generator agent to build a test suite for a file')
  .option('-p, --path <path>', 'Path to project root', '.')
  .option('-o, --output <output_file>', 'Write test code directly to output file')
  .action((file, options) => handleTestCommand(file, options));

program.parse(process.argv);
