#!/usr/bin/env node
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import * as readline from 'readline';
import { spawnSync } from 'child_process';
import { glob } from 'glob';
import React, { useState } from 'react';
import { Box, Text, render, useInput } from 'ink';
import chalk from 'chalk';

import { ConfigManager } from '../src/core/ConfigManager';
import { IndexManager } from '../src/core/IndexManager';
import { FileManager } from '../src/core/FileManager';
import { ContextBuilder } from '../src/core/ContextBuilder';
import { PatchApplier } from '../src/core/PatchApplier';
import { Renderer } from '../src/ui/Renderer';
import { InputBox } from '../src/ui/InputBox';
import { DiffView } from '../src/ui/DiffView';
import { AgentOrchestrator } from '../src/agents/AgentOrchestrator';
import { LintTool } from '../src/tools/LintTool';
import { TypeCheckTool } from '../src/tools/TypeCheckTool';
import { GitTool } from '../src/tools/GitTool';
import { FixAgent } from '../src/agents/FixAgent';
import { ReviewAgent } from '../src/agents/ReviewAgent';
import { DebugAgent } from '../src/agents/DebugAgent';
import { Message, Finding } from '../src/types';

const program = new Command();

/**
 * Prompt user for interactive command line input.
 * @param {string} query - The prompt question to display.
 * @returns {Promise<string>} The user's input response.
 */
function askQuestion(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Message list React component to render history items.
 */
const MessagesList: React.FC<{ messages: Message[] }> = ({ messages }) => {
  const lastN = messages.slice(-15); // limit output to fit standard terminals
  return React.createElement(
    Box,
    { flexDirection: 'column', marginBottom: 1 },
    lastN.map((msg, idx) =>
      React.createElement(
        Box,
        { key: idx, flexDirection: 'column', marginY: 0.5 },
        React.createElement(
          Text,
          { bold: true, color: msg.role === 'user' ? 'green' : 'blue' },
          msg.role === 'user' ? '❯ User' : '🤖 Assistant'
        ),
        React.createElement(Text, null, msg.content)
      )
    )
  );
};

interface InteractiveAppProps {
  initialMessages?: Message[];
  initialFile?: string | null;
  mode: 'chat' | 'review';
}

/**
 * The main interactive terminal interface application.
 */
const InteractiveApp: React.FC<InteractiveAppProps> = ({
  initialMessages = [],
  initialFile = null,
  mode,
}) => {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [currentFile, setCurrentFile] = useState<string | null>(initialFile);
  const [isLoading, setIsLoading] = useState(false);
  const [activeDiff, setActiveDiff] = useState<{ filePath: string; diffText: string } | null>(null);
  const [orchestrator] = useState(() => new AgentOrchestrator());

  const handleInput = async (input: string) => {
    setIsLoading(true);

    if (input.startsWith('/')) {
      const parts = input.split(' ');
      const command = parts[0].toLowerCase();
      const arg = parts.slice(1).join(' ').trim();

      switch (command) {
        case '/clear':
          setMessages([]);
          setIsLoading(false);
          return;
        case '/exit':
          process.exit(0);
          return;
        case '/review': {
          if (!arg) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: '❌ Please specify a file path for /review.',
                timestamp: new Date(),
              },
            ]);
            setIsLoading(false);
            return;
          }
          const absPath = path.resolve(arg);
          if (!fs.existsSync(absPath)) {
            const index = IndexManager.getIndex();
            const closest = FileManager.findClosestMatch(arg, Array.from(index.keys()));
            const msg = closest
              ? `❌ File not found: ${arg}. Did you mean: ${path.relative(
                  process.cwd(),
                  closest
                )}?`
              : `❌ File not found: ${arg}`;
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: msg, timestamp: new Date() },
            ]);
            setIsLoading(false);
            return;
          }

          setCurrentFile(absPath);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `🔍 Starting review for: ${path.basename(absPath)}...`,
              timestamp: new Date(),
            },
          ]);

          try {
            const context = await ContextBuilder.buildReviewContext(absPath);
            const reviewAgent = new ReviewAgent();
            let parsedFindings: Finding[] = [];
            
            const summary = await reviewAgent.run(context, (findings) => {
              parsedFindings = findings;
            });

            let findingsText = '';
            if (parsedFindings.length > 0) {
              findingsText = parsedFindings
                .map((f) => `[${f.severity.toUpperCase()}] Line ${f.line}: ${f.message}`)
                .join('\n');
            } else {
              findingsText = 'No issues found!';
            }

            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `### Static Findings:\n${findingsText}\n\n### Summary:\n${summary}`,
                timestamp: new Date(),
              },
            ]);
          } catch (e: any) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `❌ Review failed: ${e.message || String(e)}`,
                timestamp: new Date(),
              },
            ]);
          }
          setIsLoading(false);
          return;
        }

        case '/fix': {
          if (!arg) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: '❌ Please specify a file path for /fix.',
                timestamp: new Date(),
              },
            ]);
            setIsLoading(false);
            return;
          }
          const absPath = path.resolve(arg);
          if (!fs.existsSync(absPath)) {
            const index = IndexManager.getIndex();
            const closest = FileManager.findClosestMatch(arg, Array.from(index.keys()));
            const msg = closest
              ? `❌ File not found: ${arg}. Did you mean: ${path.relative(
                  process.cwd(),
                  closest
                )}?`
              : `❌ File not found: ${arg}`;
            setMessages((prev) => [
              ...prev,
              { role: 'assistant', content: msg, timestamp: new Date() },
            ]);
            setIsLoading(false);
            return;
          }

          setCurrentFile(absPath);
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `🔧 Generating patch for: ${path.basename(absPath)}...`,
              timestamp: new Date(),
            },
          ]);

          try {
            const content = await FileManager.readFile(absPath);
            const fixAgent = new FixAgent();
            const { diff, explanation } = await fixAgent.run(
              content,
              'Fix any bugs or style issues.'
            );
            if (diff && diff.includes('--- a/')) {
              setActiveDiff({ filePath: absPath, diffText: diff });
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: 'assistant',
                  content: `No changes suggested. Explanation:\n${explanation}`,
                  timestamp: new Date(),
                },
              ]);
            }
          } catch (e: any) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `❌ Fix failed: ${e.message || String(e)}`,
                timestamp: new Date(),
              },
            ]);
          }
          setIsLoading(false);
          return;
        }

        case '/diff': {
          const target = arg || currentFile;
          if (!target) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: '❌ No active file or target specified for /diff.',
                timestamp: new Date(),
              },
            ]);
            setIsLoading(false);
            return;
          }
          const absPath = path.resolve(target);
          try {
            const gitTool = new GitTool();
            const diffText = await gitTool.getDiff(absPath);
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: diffText ? `\`\`\`diff\n${diffText}\n\`\`\`` : 'No changes found in git.',
                timestamp: new Date(),
              },
            ]);
          } catch (e: any) {
            setMessages((prev) => [
              ...prev,
              {
                role: 'assistant',
                content: `❌ Diff failed: ${e.message || String(e)}`,
                timestamp: new Date(),
              },
            ]);
          }
          setIsLoading(false);
          return;
        }

        default:
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `❌ Unknown command: ${command}`,
              timestamp: new Date(),
            },
          ]);
          setIsLoading(false);
          return;
      }
    }

    // Add user message locally
    setMessages((prev) => [...prev, { role: 'user', content: input, timestamp: new Date() }]);

    try {
      const response = await orchestrator.route(input, currentFile || undefined);

      if (response.diff && response.diff.includes('--- a/') && currentFile) {
        setActiveDiff({ filePath: currentFile, diffText: response.diff });
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: response.output, timestamp: new Date() },
        ]);
      }
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `❌ Agent routing error: ${e.message || String(e)}`,
          timestamp: new Date(),
        },
      ]);
    }

    setIsLoading(false);
  };

  const handleDiffResolve = async (action: 'yes' | 'no' | 'edit') => {
    if (!activeDiff) return;
    const { filePath, diffText } = activeDiff;
    setActiveDiff(null);
    setIsLoading(true);

    if (action === 'yes') {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Applying patch to ${path.basename(filePath)}...`,
          timestamp: new Date(),
        },
      ]);
      try {
        const result = await PatchApplier.applyPatch(filePath, diffText);
        if (result.success) {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `✅ Patch applied successfully to: ${path.basename(filePath)}`,
              timestamp: new Date(),
            },
          ]);
        } else {
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `❌ Patch failed: ${result.error}`,
              timestamp: new Date(),
            },
          ]);
        }
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `❌ Unexpected error: ${e.message || String(e)}`,
            timestamp: new Date(),
          },
        ]);
      }
    } else if (action === 'no') {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ Patch discarded.', timestamp: new Date() },
      ]);
    } else if (action === 'edit') {
      const tempPath = `${filePath}.edit.tmp`;
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `Opening proposed changes in editor...`,
          timestamp: new Date(),
        },
      ]);
      try {
        const originalContent = await FileManager.readFile(filePath);
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { applyPatch } = require('diff');
        const patchedContent = applyPatch(originalContent, diffText);
        if (patchedContent === false) {
          throw new Error('Could not parse unified diff to edit.');
        }

        await fs.promises.writeFile(tempPath, patchedContent, 'utf-8');

        const editor = process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
        spawnSync(editor, [tempPath], { stdio: 'inherit' });

        const editedContent = await fs.promises.readFile(tempPath, 'utf-8');
        await fs.promises.unlink(tempPath);

        await FileManager.createBackup(filePath);
        await fs.promises.writeFile(filePath, editedContent, 'utf-8');

        const typeCheckTool = new TypeCheckTool();
        const diagnostics = await typeCheckTool.run(filePath);
        const errors = diagnostics.filter((d) => d.severity.toLowerCase() === 'error');

        if (errors.length > 0) {
          await FileManager.restoreBackup(filePath);
          const errorSummary = errors
            .map((e) => `${e.file}:${e.line}:${e.col} - ${e.message}`)
            .join('\n');
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `❌ Edited changes introduced type errors. Reverting. Errors:\n${errorSummary}`,
              timestamp: new Date(),
            },
          ]);
        } else {
          const backupPath = `${filePath}.myide.bak`;
          if (fs.existsSync(backupPath)) {
            await fs.promises.unlink(backupPath);
          }
          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `✅ Edited changes applied and verified successfully!`,
              timestamp: new Date(),
            },
          ]);
        }
      } catch (e: any) {
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `❌ Editing patch failed: ${e.message || String(e)}`,
            timestamp: new Date(),
          },
        ]);
        if (fs.existsSync(tempPath)) {
          await fs.promises.unlink(tempPath).catch(() => {});
        }
      }
    }

    setIsLoading(false);
  };

  return React.createElement(
    Box,
    { flexDirection: 'column', width: '100%', minHeight: 10, padding: 1 },
    React.createElement(
      Box,
      {
        borderStyle: 'double',
        borderColor: 'blue',
        paddingX: 2,
        marginBottom: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      React.createElement(Text, { bold: true, color: 'blue' }, '💬 myide Interactive Workspace'),
      currentFile &&
        React.createElement(Text, { color: 'gray' }, `Active File: ${path.basename(currentFile)}`)
    ),
    React.createElement(
      Box,
      { flexGrow: 1, flexDirection: 'column' },
      React.createElement(MessagesList, { messages })
    ),
    activeDiff
      ? React.createElement(DiffView, {
          diffText: activeDiff.diffText,
          filePath: activeDiff.filePath,
          onResolve: handleDiffResolve,
        })
      : React.createElement(InputBox, {
          onSubmit: handleInput,
          placeholder: currentFile
            ? `Ask a question about ${path.basename(currentFile)} or type a slash command...`
            : 'Type your query or slash command...',
          isLoading,
        })
  );
};

// -------------------------------------------------------------
// Commands registration
// -------------------------------------------------------------

program.name('myide').description('AI-powered CLI IDE tool').version('1.0.0');

// 1. myide review [file|glob|dir]
program
  .command('review [fileOrGlobOrDir]')
  .description('Statically reviews workspace files, compiles diagnostics and opens terminal chat.')
  .action(async (target) => {
    const config = ConfigManager.getConfig();
    if (!config.apiKey) {
      console.error(chalk.red('\nError: ANTHROPIC_API_KEY is missing.'));
      console.log('Run `myide init` to configure your API key.\n');
      process.exit(1);
    }

    const rootDir = process.cwd();
    await IndexManager.indexWorkspace(rootDir);
    const index = IndexManager.getIndex();

    let filesToScan: string[] = [];

    if (target) {
      const resolvedTarget = path.resolve(target);
      if (fs.existsSync(resolvedTarget)) {
        const stat = fs.statSync(resolvedTarget);
        if (stat.isFile()) {
          filesToScan.push(resolvedTarget);
        } else if (stat.isDirectory()) {
          for (const key of index.keys()) {
            if (key.startsWith(resolvedTarget)) {
              filesToScan.push(key);
            }
          }
        }
      } else {
        const matches = await glob(target, { absolute: true });
        filesToScan = matches.filter((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      }
    } else {
      filesToScan = Array.from(index.keys());
    }

    if (filesToScan.length === 0) {
      console.log(chalk.yellow('\nNo matching files found to review.'));
      if (target) {
        const closest = FileManager.findClosestMatch(target, Array.from(index.keys()));
        if (closest) {
          console.log(`Did you mean: ${path.relative(process.cwd(), closest)}?`);
        }
      }
      process.exit(0);
    }

    const lintTool = new LintTool();
    const typeCheckTool = new TypeCheckTool();
    const debugAgent = new DebugAgent();
    const initialHistory: Message[] = [];
    let focusedFile = filesToScan[0] || null;

    for (const filePath of filesToScan) {
      const relative = path.relative(rootDir, filePath);
      Renderer.renderHeader('STATIC REVIEW', relative);

      // Warning check for large files
      try {
        const content = await FileManager.readFile(filePath);
        const lineCount = content.split('\n').length;
        if (lineCount > 500) {
          console.warn(
            chalk.yellow(
              `[myide WARNING] ${relative} is large (${lineCount} lines). Truncating context.`
            )
          );
        }
      } catch (err) {}

      // LINTER
      Renderer.renderAgentStep('LintTool', 'running', 'linting source...');
      const lintResults = await lintTool.run(filePath);
      Renderer.renderAgentStep('LintTool', 'done');
      for (const f of lintResults) {
        Renderer.renderFinding({
          severity: f.severity,
          line: f.line,
          message: f.message,
          suggestion: `Fix linter rule: ${f.ruleId}`,
        });
      }

      // TYPE CHECKER
      Renderer.renderAgentStep('TypeCheckTool', 'running', 'type checking...');
      const tscResults = await typeCheckTool.run(filePath);
      Renderer.renderAgentStep('TypeCheckTool', 'done');
      for (const t of tscResults) {
        Renderer.renderFinding({
          severity: t.severity.toLowerCase().includes('err') ? 'error' : 'warning',
          line: t.line,
          message: t.message,
          suggestion: `Fix compiler diagnostic: ${t.code}`,
        });
      }

      // REVIEW AGENT (streaming)
      Renderer.renderAgentStep('ReviewAgent', 'running', 'running deep review...');
      const reviewAgent = new ReviewAgent();
      const context = await ContextBuilder.buildReviewContext(filePath);
      let agentFindings: Finding[] = [];
      const summary = await reviewAgent.run(context, (findings) => {
        agentFindings = findings;
      });
      
      console.log('\n');
      for (const f of agentFindings) {
        Renderer.renderFinding(f);
      }

      // DEBUG AGENT (If critical errors are present)
      let debugOutput = '';
      const criticalErrors = [
        ...lintResults.filter((l) => l.severity === 'error').map((l) => `Lint Error: ${l.message}`),
        ...tscResults.map((t) => `TSC Compiler Error: ${t.message}`),
        ...agentFindings.filter((af) => af.severity === 'error').map((af) => af.message),
      ];

      if (criticalErrors.length > 0) {
        Renderer.renderAgentStep(
          'DebugAgent',
          'running',
          `analyzing ${criticalErrors.length} errors...`
        );
        const codeText = await FileManager.readFile(filePath).catch(() => '');
        const debugContext = `=== TARGET FILE ===\n${filePath}\n\n=== SOURCE CODE ===\n${codeText}\n\n=== CRITICAL ERRORS ===\n${criticalErrors.join(
          '\n'
        )}`;
        debugOutput = await debugAgent.run(debugContext);
        Renderer.renderAgentStep('DebugAgent', 'done');
        console.log('\n' + chalk.bold('AI Root-Cause Diagnosis:') + '\n' + debugOutput + '\n');
      }

      // Record this review into chat history
      const lintReport =
        lintResults.length > 0
          ? `Linter findings:\n${lintResults
              .map((l) => `- L${l.line}: ${l.message}`)
              .join('\n')}\n`
          : '';
      const tscReport =
        tscResults.length > 0
          ? `Compiler errors:\n${tscResults.map((t) => `- L${t.line}: ${t.message}`).join('\n')}\n`
          : '';
      const debugReport = debugOutput ? `### Root Cause Analysis:\n${debugOutput}\n` : '';

      initialHistory.push({
        role: 'user',
        content: `I reviewed the file ${relative}`,
        timestamp: new Date(),
      });
      initialHistory.push({
        role: 'assistant',
        content: `### Static Scan Results:\n${lintReport}${tscReport}\n### AI Review Summary:\n${summary}\n\n${debugReport}`,
        timestamp: new Date(),
      });
    }

    console.log(chalk.cyan('Static review completed. Dropping into interactive mode...\n'));
    render(
      React.createElement(InteractiveApp, {
        mode: 'review',
        initialFile: focusedFile,
        initialMessages: initialHistory,
      })
    );
  });

// 2. myide fix [file] [--dry-run] [--auto]
program
  .command('fix [file]')
  .description('Automatically fixes code compilation and lint issues in a file.')
  .option('--dry-run', 'Generate and show patch diff without writing to disk.')
  .option('--auto', 'Apply patch automatically without user confirmation.')
  .action(async (file, options) => {
    const config = ConfigManager.getConfig();
    if (!config.apiKey) {
      console.error(chalk.red('\nError: ANTHROPIC_API_KEY is missing.'));
      console.log('Run `myide init` to configure your API key.\n');
      process.exit(1);
    }

    if (!file) {
      console.error(chalk.red('Error: Please specify a file path to fix.'));
      process.exit(1);
    }

    const absPath = path.resolve(file);
    if (!fs.existsSync(absPath)) {
      const index = await IndexManager.indexWorkspace(process.cwd());
      const closest = FileManager.findClosestMatch(file, Array.from(index.keys()));
      console.error(chalk.red(`File not found: ${file}`));
      if (closest) {
        console.log(`Did you mean: ${path.relative(process.cwd(), closest)}?`);
      }
      process.exit(1);
    }

    try {
      const content = await FileManager.readFile(absPath);
      const lineCount = content.split('\n').length;
      if (lineCount > 500) {
        console.warn(
          chalk.yellow(
            `[myide WARNING] File is large (${lineCount} lines) — using middle truncation.`
          )
        );
      }

      // Collect lint and compiler issues
      const lintTool = new LintTool();
      const typeCheckTool = new TypeCheckTool();
      Renderer.renderAgentStep('Workspace Analyzer', 'running', 'collecting error diagnostics');
      const lintResults = await lintTool.run(absPath);
      const tscResults = await typeCheckTool.run(absPath);
      Renderer.renderAgentStep('Workspace Analyzer', 'done');

      const issues = [
        ...lintResults.map((l) => `[LINT] Line ${l.line}:${l.column} - ${l.message} (${l.ruleId})`),
        ...tscResults.map((t) => `[TSC] Line ${t.line}:${t.col} - ${t.message} (${t.code})`),
      ];

      const requestContext =
        issues.length > 0
          ? `Please patch the following issues:\n${issues.join('\n')}`
          : 'Please perform general bug fixing, formatting, and performance cleanup.';

      Renderer.renderAgentStep('FixAgent', 'running', 'generating code patch');
      const fixAgent = new FixAgent();
      const { diff, explanation } = await fixAgent.run(content, requestContext);
      Renderer.renderAgentStep('FixAgent', 'done');

      if (!diff || !diff.includes('--- a/')) {
        console.log(chalk.yellow('\nNo changes suggested by the patching agent.'));
        console.log('Reasoning:', explanation);
        process.exit(0);
      }

      if (options.dryRun) {
        console.log(chalk.cyan('\n--- DRY RUN: PROPOSED PATCH ---'));
        Renderer.renderDiff(diff);
        console.log('\nExplanation of Changes:\n', explanation);
        process.exit(0);
      }

      if (options.auto) {
        console.log(chalk.cyan('\nApplying patch automatically (--auto)...'));
        const result = await PatchApplier.applyPatch(absPath, diff);
        if (result.success) {
          console.log(chalk.green('✅ Patch successfully applied and verified.'));
        } else {
          console.error(chalk.red(`❌ Patch application failed:\n${result.error}`));
        }
        process.exit(0);
      }

      // Render DiffView React/Ink component to confirm
      const { cleanup } = render(
        React.createElement(DiffView, {
          diffText: diff,
          filePath: absPath,
          onResolve: async (action) => {
            cleanup();
            if (action === 'yes') {
              const result = await PatchApplier.applyPatch(absPath, diff);
              if (result.success) {
                console.log(chalk.green('✅ Patch successfully applied and verified.'));
              } else {
                console.error(chalk.red(`❌ Patch application failed:\n${result.error}`));
              }
            } else if (action === 'no') {
              console.log(chalk.red('❌ Patch application discarded.'));
            } else if (action === 'edit') {
              const tempPath = `${absPath}.edit.tmp`;
              try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { applyPatch } = require('diff');
                const patched = applyPatch(content, diff);
                if (patched === false) {
                  throw new Error('Failed to parse diff.');
                }
                await fs.promises.writeFile(tempPath, patched, 'utf-8');
                const editor =
                  process.env.EDITOR || (process.platform === 'win32' ? 'notepad' : 'vi');
                spawnSync(editor, [tempPath], { stdio: 'inherit' });
                const edited = await fs.promises.readFile(tempPath, 'utf-8');
                await fs.promises.unlink(tempPath);

                await FileManager.createBackup(absPath);
                await fs.promises.writeFile(absPath, edited, 'utf-8');

                const errors = await typeCheckTool.run(absPath);
                const typeErrors = errors.filter((e) => e.severity.toLowerCase() === 'error');

                if (typeErrors.length > 0) {
                  await FileManager.restoreBackup(absPath);
                  console.error(
                    chalk.red(
                      `❌ Edited patch introduced compiler errors. Reverting. Errors:\n` +
                        typeErrors.map((e) => `${e.file}:${e.line} - ${e.message}`).join('\n')
                    )
                  );
                } else {
                  const backupPath = `${absPath}.myide.bak`;
                  if (fs.existsSync(backupPath)) {
                    await fs.promises.unlink(backupPath);
                  }
                  console.log(chalk.green('✅ Edited changes successfully applied and verified!'));
                }
              } catch (e: any) {
                console.error(chalk.red(`❌ Editing failed: ${e.message || String(e)}`));
                if (fs.existsSync(tempPath)) {
                  await fs.promises.unlink(tempPath).catch(() => {});
                }
              }
            }
            process.exit(0);
          },
        })
      );
    } catch (err: any) {
      console.error(chalk.red(`❌ Fix operation failed: ${err.message || String(err)}`));
      process.exit(1);
    }
  });

// 3. myide chat [--context <glob>]
program
  .command('chat')
  .description('Opens interactive terminal chat with workspace indexing.')
  .option('--context <glob>', 'Optional file pattern glob to index into codebase context.')
  .action(async (options) => {
    const config = ConfigManager.getConfig();
    if (!config.apiKey) {
      console.error(chalk.red('\nError: ANTHROPIC_API_KEY is missing.'));
      console.log('Run `myide init` to configure your API key.\n');
      process.exit(1);
    }

    await IndexManager.indexWorkspace(process.cwd());

    let contextGlob = options.context;
    if (!contextGlob) {
      contextGlob = await askQuestion(
        'Enter file glob to load into chat context (or press Enter to skip): '
      );
    }

    let loadedCount = 0;
    if (contextGlob) {
      try {
        const matches = await glob(contextGlob, { absolute: true });
        loadedCount = matches.length;
        console.log(chalk.cyan(`Loaded ${loadedCount} files into context matching: ${contextGlob}`));
      } catch (err) {
        console.error(chalk.red('Invalid glob pattern format.'));
      }
    }

    render(
      React.createElement(InteractiveApp, {
        mode: 'chat',
        initialFile: null,
      })
    );
  });

// 4. myide diff [file]
program
  .command('diff [file]')
  .description('Shows git diff of a file with an AI-generated summary.')
  .action(async (file) => {
    const gitTool = new GitTool();
    const diffText = await gitTool.getDiff(file);

    if (!diffText || diffText.trim() === '') {
      console.log(chalk.yellow('\nNo uncommitted changes found.'));
      process.exit(0);
    }

    Renderer.renderHeader('GIT DIFF', file || 'workspace');
    Renderer.renderDiff(diffText);

    Renderer.renderAgentStep('DiffAnalyzer', 'running', 'summarizing modifications...');

    const analyzerAgent = new (class extends FixAgent {
      constructor() {
        super();
        this.systemPrompt =
          'You are a git diff analyzer. Review the unified diff and output a concise summary ' +
          'explaining what changed and why it might matter. Limit to 200 words.';
      }
    })();

    try {
      const summary = await analyzerAgent.call(diffText);
      Renderer.renderAgentStep('DiffAnalyzer', 'done');
      console.log('\n' + chalk.bold('AI Summary of Changes:') + '\n' + summary + '\n');
    } catch (err: any) {
      Renderer.renderAgentStep('DiffAnalyzer', 'error', err?.message || String(err));
    }
  });

// 5. myide config [--set key=value] [--get key] [--list]
program
  .command('config')
  .description('Manages myide global settings configuration.')
  .option('--set <keyval>', 'Set configuration key=value')
  .option('--get <key>', 'Retrieve value of configuration key')
  .option('--list', 'List all global configuration keys and values')
  .action((options) => {
    if (options.list) {
      const confData = ConfigManager.getGlobalConfig();
      console.log(chalk.cyan('\n--- GLOBAL CONFIGURATION ---'));
      console.log(JSON.stringify(confData, null, 2) + '\n');
      return;
    }

    if (options.get) {
      const confData = ConfigManager.getConfig();
      const val = confData[options.get as keyof typeof confData];
      console.log(`\n${options.get}: ${val}\n`);
      return;
    }

    if (options.set) {
      const parts = options.set.split('=');
      if (parts.length !== 2) {
        console.error(chalk.red('Error: Format must be key=value'));
        process.exit(1);
      }
      const [key, value] = parts;
      try {
        ConfigManager.setGlobalKey(key as any, value);
        console.log(chalk.green(`Successfully configured global ${key} to: ${value}`));
      } catch (err: any) {
        console.error(chalk.red(`Failed to update config: ${err.message}`));
      }
      return;
    }

    program.help();
  });

// 6. myide init
program
  .command('init')
  .description('Interactive setup config initialization for myide.')
  .action(async () => {
    console.log(chalk.cyan('\n--- myide CLI Interactive Initialization ---'));
    
    const apiKey = await askQuestion('Enter your Anthropic API Key: ');
    const model =
      (await askQuestion('Enter preferred Anthropic model [claude-sonnet-4-6]: ')) ||
      'claude-sonnet-4-6';
    const themeInput = await askQuestion('Enter theme style (dark/light) [dark]: ');
    const theme = themeInput.toLowerCase() === 'light' ? 'light' : 'dark';

    ConfigManager.setGlobalKey('apiKey', apiKey);
    ConfigManager.setGlobalKey('model', model);
    ConfigManager.setGlobalKey('theme', theme);

    // Write project configuration locally
    ConfigManager.writeProjectConfig({
      model,
      theme,
      autoFix: false,
      contextDepth: 3,
    });

    console.log(
      chalk.green(
        '\nSuccessfully saved global config and created project .myide.json configuration file!\n'
      )
    );
  });

// Execution entry point
program.parse(process.argv);
