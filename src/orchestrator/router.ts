import { generateJSON, generateText } from '../llm/gateway.js';
import { SessionState, updateSessionState } from '../shell/state.js';
import { retrieveContextFiles } from '../agents/retrieval/retrieval.agent.js';
import { runScannerAgent } from '../agents/scanner/scanner.agent.js';
import { runEvidenceCollector } from '../agents/collector/collector.agent.js';
import { runPlannerAgent } from '../agents/planner/planner.agent.js';
import { runCodegenAgent } from '../agents/codegen/codegen.agent.js';
import { runSecurityAgent } from '../agents/security/security.agent.js';
import { runPerformanceAgent } from '../agents/performance/performance.agent.js';
import { runArchitectureAgent } from '../agents/architecture/architecture.agent.js';
import { runRefactorAgent } from '../agents/refactor/refactor.agent.js';
import { runTestingAgent } from '../agents/testing/testing.agent.js';
import { runDocsAgent } from '../agents/docs/docs.agent.js';
import { parseSearchReplaceBlocks } from '../patch/patchEngine.js';
import { validatePatches } from '../patch/validator.js';
import { commitPatches } from '../patch/apply.js';
import { recordFixHistory, getFixHistory } from '../memory/sqlite/sqliteDb.js';
import { MultiProgressBar } from '../shell/progress.js';
import { renderDiffBox, promptASE, explainPatch } from '../shell/diffViewer.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';


// We will map the imports correctly

interface RouteResult {
  intent: 'project' | 'architecture' | 'debug' | 'refactor' | 'security' | 'performance' | 'testing' | 'docs' | 'modify' | 'apply_fix' | 'chat';
  explanation: string;
}

const RouteSchema = {
  type: 'OBJECT',
  properties: {
    intent: {
      type: 'STRING',
      enum: ['project', 'architecture', 'debug', 'refactor', 'security', 'performance', 'testing', 'docs', 'modify', 'apply_fix', 'chat'],
      description: 'The classified user intent',
    },
    explanation: {
      type: 'STRING',
      description: 'Why this intent was selected',
    },
  },
  required: ['intent', 'explanation'],
};

export async function runAutonomousWorkflow(
  root: string,
  state: SessionState,
  task: string,
  rl: any,
  spinner: any
): Promise<string> {
  spinner.stop();
  console.log(chalk.cyan(`\nStarting autonomous execution for: "${task}"`));

  const pb = new MultiProgressBar('MARS Autonomous Audit Engine', [
    { name: 'Scanner Agent', percentage: 0, status: 'Running' },
    { name: 'Retrieval Agent', percentage: 0, status: 'Pending' },
    { name: 'Planner Agent', percentage: 0, status: 'Pending' },
    { name: 'Code Gen Agent', percentage: 0, status: 'Pending' },
    { name: 'Patch Validator', percentage: 0, status: 'Pending' },
    { name: 'Patch Applier', percentage: 0, status: 'Pending' },
  ]);

  pb.render();

  // 1. Scanner Agent
  pb.updateTask('Scanner Agent', 50, 'Running');
  const freshContext = await runScannerAgent(root);
  updateSessionState({ context: freshContext });
  pb.updateTask('Scanner Agent', 100, 'Done');

  // 2. Retrieval Agent
  pb.updateTask('Retrieval Agent', 25, 'Running');
  const evidence = await runEvidenceCollector(root, freshContext, task);
  pb.updateTask('Retrieval Agent', 100, 'Done');

  if (evidence.targetFiles.length === 0) {
    pb.updateTask('Planner Agent', 0, 'Cancelled');
    pb.updateTask('Code Gen Agent', 0, 'Cancelled');
    pb.updateTask('Patch Validator', 0, 'Cancelled');
    pb.updateTask('Patch Applier', 0, 'Cancelled');
    return chalk.yellow('\nRetrieval Agent failed to find relevant files for the task.');
  }

  // 3. Planner Agent
  pb.updateTask('Planner Agent', 30, 'Running');
  const plan = await runPlannerAgent(root, evidence, task);
  pb.updateTask('Planner Agent', 100, 'Done');

  // 4. Code Gen Agent
  pb.updateTask('Code Gen Agent', 40, 'Running');
  const codegen = await runCodegenAgent(root, evidence, plan, task);
  pb.updateTask('Code Gen Agent', 100, 'Done');

  if (codegen.patches.length === 0) {
    pb.updateTask('Patch Validator', 0, 'Cancelled');
    pb.updateTask('Patch Applier', 0, 'Cancelled');
    return chalk.yellow('\nCode Gen Agent did not generate any code patches.');
  }

  // 5. Patch Validator
  pb.updateTask('Patch Validator', 50, 'Running');
  const validation = validatePatches(root, codegen.patches);
  pb.updateTask('Patch Validator', 100, 'Done');

  if (!validation.isValid) {
    pb.updateTask('Patch Applier', 0, 'Failed');
    let errReport = chalk.red('\nPatch validation failed with conflicts:\n');
    errReport += validation.errors.join('\n');
    return errReport;
  }

  // 6. Patch Applier & ASE Interactive Prompt
  pb.updateTask('Patch Applier', 20, 'Needs Review');
  
  console.log(chalk.cyan('\nPrepared patches:'));
  for (const res of validation.results) {
    const oldContent = res.originalContent || '';
    const newContent = res.patchedContent || '';
    renderDiffBox(res.filePath, oldContent, newContent);
  }

  let userAction: 'apply' | 'skip' | 'explain' = 'skip';
  let decided = false;

  while (!decided) {
    userAction = await promptASE(rl);
    if (userAction === 'explain') {
      console.log(chalk.blue('\nGenerating explanation from MARS AI...'));
      for (const res of validation.results) {
        const oldContent = res.originalContent || '';
        const newContent = res.patchedContent || '';
        const explanation = await explainPatch(root, res.filePath, oldContent, newContent);
        console.log(chalk.bold.yellow(`\nExplanation for ${res.filePath}:`));
        console.log(explanation);
      }
    } else {
      decided = true;
    }
  }

  if (userAction === 'apply') {
    pb.updateTask('Patch Applier', 70, 'Applying');
    const commitResults = commitPatches(root, codegen.patches);
    const appliedCount = commitResults.filter(r => r.success).length;
    const appliedPaths = commitResults.filter(r => r.success).map(r => r.filePath);

    if (appliedCount > 0) {
      await recordFixHistory(root, plan.explanation, appliedPaths);
      pb.updateTask('Patch Applier', 100, 'Done');
      return chalk.green(`\n✓ Fix applied successfully. ${appliedCount} file(s) modified: ${appliedPaths.join(', ')}`);
    } else {
      pb.updateTask('Patch Applier', 0, 'Failed');
      return chalk.red('\nFailed to apply patches to disk.');
    }
  } else {
    pb.updateTask('Patch Applier', 0, 'Skipped');
    return chalk.yellow('\nPatch application skipped by user.');
  }
}


export async function routeUserInput(
  state: SessionState,
  input: string,
  rl: any,
  spinner: any
): Promise<string> {
  const root = state.projectRoot;

  // Intercept slash commands
  if (input.startsWith('/')) {
    const command = input.split(' ')[0].toLowerCase();
    
    if (command === '/help') {
      spinner.stop();
      return `
${chalk.bold.cyan('=== MARS CLI COMMANDS ===')}

${chalk.bold.yellow('/help')}                  - Displays command descriptions.
${chalk.bold.yellow('/project')}               - Scans repository context and prints stack details.
${chalk.bold.yellow('/agents')}                - Lists all specialized MARS agents.
${chalk.bold.yellow('/memory')}                - Prints project context metadata and cached state.
${chalk.bold.yellow('/file [path]')}           - Audits a specific file for quality and refactoring.
${chalk.bold.yellow('/review')}                - Audits code quality of codebase.
${chalk.bold.yellow('/security')}              - Audits codebase for vulnerabilities and key exposures.
${chalk.bold.yellow('/performance')}           - Reviews performance bottlenecking and resource leaks.
${chalk.bold.yellow('/tests [file]')}          - Generates tests for files.
${chalk.bold.yellow('/docs')}                  - Generates/updates markdown documentation.
${chalk.bold.yellow('/history')}               - Displays database history of applied fixes.
${chalk.bold.yellow('/clear')}                 - Clears the console window.
${chalk.bold.yellow('/autonomous [task]')}      - Runs automated agent loops with real-time progress.
${chalk.bold.yellow('/exit')}                  - Exits the MARS terminal shell.
`;
    }
    
    if (command === '/project') {
      spinner.text = 'Project Agent: Analyzing structure...';
      const freshContext = await runScannerAgent(root);
      updateSessionState({ context: freshContext });

      let report = `${chalk.bold.cyan('=== Project Overview ===')}\n\n`;
      report += `${chalk.bold('Project Name:')}    ${freshContext.projectName}\n`;
      report += `${chalk.bold('Package Manager:')} ${freshContext.packageManager}\n`;
      report += `${chalk.bold('Languages:')}       ${freshContext.languages.join(', ') || 'None'}\n`;
      report += `${chalk.bold('Frameworks:')}      ${freshContext.frameworks.join(', ') || 'None'}\n`;
      report += `${chalk.bold('Configs:')}         ${freshContext.configs.join(', ') || 'None'}\n`;
      report += `${chalk.bold('Files count:')}     ${freshContext.files.length}\n\n`;
      report += `${chalk.bold('Modules/Structure:')}\n${freshContext.structure}`;
      return report;
    }
    
    if (command === '/agents') {
      spinner.stop();
      return `
${chalk.bold.cyan('=== MARS SPECIALIZED AGENT CLUSTER ===')}

1.  ${chalk.bold('Scanner Agent')}      - Discovers project files, configs, frameworks, and project structure.
2.  ${chalk.bold('Retrieval Agent')}    - Resolves natural language user query into matched code targets.
3.  ${chalk.bold('Planner Agent')}      - Designs atomic step-by-step resolution path for modifications.
4.  ${chalk.bold('Code Gen Agent')}    - Creates precise git-style search/replace patch diff blocks.
5.  ${chalk.bold('Patch Validator')}   - Dry-runs candidate code blocks to ensure conflict-free merges.
6.  ${chalk.bold('Security Agent')}     - Audits credential leakages, SQL Injections, and input validation gaps.
7.  ${chalk.bold('Performance Agent')}  - Investigates query latency, memory leaks, and hook re-render loops.
8.  ${chalk.bold('Architecture Agent')} - Enforces clean boundaries, design patterns, and naming modularity.
9.  ${chalk.bold('Refactor Agent')}     - Decreases cyclomatic code complexity and removes boilerplate redundancy.
10. ${chalk.bold('Testing Agent')}    - Builds complete unit testing suites using modern frameworks like Vitest.
`;
    }
    
    if (command === '/memory') {
      spinner.stop();
      let memoryReport = `${chalk.bold.cyan('=== MARS ACTIVE STATE MEMORY ===')}\n\n`;
      memoryReport += `${chalk.bold('Project Root:')}      ${state.projectRoot}\n`;
      memoryReport += `${chalk.bold('Scanned Files:')}     ${state.context.files.length}\n`;
      memoryReport += `${chalk.bold('Stack Detected:')}    ${state.context.frameworks.join(', ') || 'None'} / ${state.context.languages.join(', ') || 'None'}\n`;
      if (state.lastDiagnosis) {
        memoryReport += `${chalk.bold('Last Diagnosis:')}    ${state.lastDiagnosis.explanation}\n`;
        memoryReport += `${chalk.bold('Target Files:')}      ${state.lastDiagnosis.relevantFiles.join(', ')}\n`;
      }
      if (state.lastPatches) {
        memoryReport += `${chalk.bold('Cached Patches:')}    ${state.lastPatches.length} file patch(es) pending.\n`;
      }
      return memoryReport;
    }
    
    if (command === '/file') {
      const fileArg = input.substring('/file'.length).trim();
      if (!fileArg) {
        spinner.stop();
        return chalk.yellow('Usage: /file [relative/path/to/file]');
      }
      spinner.text = `Reviewing file: ${fileArg}...`;
      const result = await runRefactorAgent(root, state.context, fileArg);
      return formatReviewReport(result, `File Audit: ${fileArg}`);
    }
    
    if (command === '/review') {
      spinner.text = 'Refactor Agent: Auditing codebase...';
      const result = await runRefactorAgent(root, state.context);
      return formatReviewReport(result, 'Code Quality Review');
    }
    
    if (command === '/security') {
      spinner.text = 'Security Agent: Scanning for vulnerabilities...';
      const result = await runSecurityAgent(root, state.context);
      return formatReviewReport(result, 'Security Scan');
    }
    
    if (command === '/performance') {
      spinner.text = 'Performance Agent: Checking bottlenecks...';
      const result = await runPerformanceAgent(root, state.context);
      return formatReviewReport(result, 'Performance Analysis');
    }
    
    if (command === '/tests') {
      let fileArg = input.substring('/tests'.length).trim();
      if (!fileArg) {
        spinner.stop();
        return chalk.yellow('Usage: /tests [relative/path/to/file]');
      }
      spinner.text = `Testing Agent: Generating test suite for ${fileArg}...`;
      const testCode = await runTestingAgent(root, state.context, fileArg);
      let report = `${chalk.bold.cyan(`=== Generated Test Suite for ${fileArg} ===`)}\n\n`;
      report += testCode;
      return report;
    }
    
    if (command === '/docs') {
      spinner.text = 'Docs Agent: Compiling README/Guides...';
      const md = await runDocsAgent(root, state.context);
      return `${chalk.bold.cyan('=== Generated Documentation ===')}\n\n${md}`;
    }
    
    if (command === '/history') {
      spinner.stop();
      const history = await getFixHistory();
      if (history.length === 0) {
        return chalk.yellow('No applied fixes found in historical memory db.');
      }
      let report = `${chalk.bold.cyan('=== MARS REPAIR HISTORY ===')}\n`;
      history.forEach((h: any, idx: number) => {
        report += `\n${idx + 1}. [${chalk.green(h.timestamp || '')}]\n`;
        report += `   ${chalk.bold('Issue:')}          ${h.issue}\n`;
        report += `   ${chalk.bold('Files Patched:')}   ${h.files_patched || ''}\n`;
      });
      return report;
    }
    
    if (command === '/clear') {
      spinner.stop();
      console.clear();
      return '';
    }
    
    if (command === '/exit') {
      spinner.stop();
      console.log(chalk.yellow('\nGoodbye! Closing MARS AI Terminal.\n'));
      process.exit(0);
    }
    
    if (command === '/autonomous') {
      spinner.stop();
      let task = input.substring('/autonomous'.length).trim();
      if (!task) {
        task = await new Promise<string>((resolve) => {
          rl.question(chalk.bold.yellow('Enter the task you want to solve autonomously > '), (ans: string) => {
            resolve(ans.trim());
          });
        });
      }

      if (!task) {
        return chalk.red('Task is required to run the autonomous workflow.');
      }

      return runAutonomousWorkflow(root, state, task, rl, spinner);
    }
    
    spinner.stop();
    return chalk.red(`Unknown command: ${command}. Type /help for all commands.`);
  }

  // 1. Prompt LLM to classify user intent
  const systemInstruction = `You are a conversational Router Agent for an AI Coding Shell.
Your job is to read user input and classify it into one of the following intents:
- 'project': User asking about project general details, stack, files structure, modules.
- 'architecture': User asking about coding architecture, SOLID principles, folder layout.
- 'debug': User reporting a bug, logical error, or crash.
- 'refactor': User asking to clean up code, improve quality, or reduce complexity.
- 'security': User asking for security audits, injection warnings, keys scans.
- 'performance': User asking for database optimization, slowness audit, memoization.
- 'testing': User asking to generate unit tests or test code.
- 'docs': User asking to build READMEs or architectural documentation.
- 'modify': User asking to modify, update, create, change, or add features/styles/code in the project (e.g., "change the theme to black", "add comments", "add a route", "implement addition", "solve the issues").
- 'apply_fix': User confirming or instructing to apply the proposed patch/fix (e.g. "Apply fix", "write changes", "merge fix").
- 'chat': General conversation or greetings.`;

  const routeResult = await generateJSON<RouteResult>(root, `User input: "${input}"`, RouteSchema, {
    systemInstruction,
    temperature: 0.1,
  });

  const intent = routeResult.intent;


  // 2. Delegate execution based on Intent
  
  // A. INTENT: apply_fix
  if (intent === 'apply_fix') {
    if (!state.lastPatches || state.lastPatches.length === 0) {
      return chalk.yellow('No changes have been prepared yet. Tell me about a bug or issue first so I can diagnose it!');
    }

    spinner.text = 'Applying patch to disk...';
    try {
      const finalResults = commitPatches(root, state.lastPatches);
      const appliedCount = finalResults.filter(r => r.success).length;
      const appliedPaths = finalResults.filter(r => r.success).map(r => r.filePath);

      if (appliedCount === 0) {
        return chalk.red('All prepared patches failed to validate. No changes were applied.');
      }

      // Record history
      if (state.lastDiagnosis) {
        await recordFixHistory(root, state.lastDiagnosis.explanation, appliedPaths);
      }

      // Clear state patches
      updateSessionState({ lastPatches: undefined, lastDiagnosis: undefined });

      return chalk.green(`✓ Fix applied successfully. ${appliedCount} file(s) modified: ${appliedPaths.join(', ')}`);
    } catch (e: any) {
      return chalk.red(`Failed to write changes: ${e.message}`);
    }
  }

  // Action-oriented task detection (modify, debug, refactor actions)
  const lowerInput = input.toLowerCase();
  const isActionTask = intent === 'modify' || intent === 'debug' || 
    (intent === 'refactor' && (
      lowerInput.includes('change') || 
      lowerInput.includes('fix') || 
      lowerInput.includes('solve') || 
      lowerInput.includes('add') || 
      lowerInput.includes('remove') ||
      lowerInput.includes('refactor') ||
      lowerInput.includes('implement') || 
      lowerInput.includes('update') || 
      lowerInput.includes('write') || 
      lowerInput.includes('create')
    ));

  if (isActionTask) {
    return runAutonomousWorkflow(root, state, input, rl, spinner);
  }

  // C. INTENT: project
  if (intent === 'project') {
    spinner.text = 'Project Agent: Analyzing structure...';
    // Re-scan to ensure fresh context
    const freshContext = await runScannerAgent(root);
    updateSessionState({ context: freshContext });

    let report = `${chalk.bold.cyan('=== Project Overview ===')}\n\n`;
    report += `${chalk.bold('Project Name:')}    ${freshContext.projectName}\n`;
    report += `${chalk.bold('Package Manager:')} ${freshContext.packageManager}\n`;
    report += `${chalk.bold('Languages:')}       ${freshContext.languages.join(', ') || 'None'}\n`;
    report += `${chalk.bold('Frameworks:')}      ${freshContext.frameworks.join(', ') || 'None'}\n`;
    report += `${chalk.bold('Configs:')}         ${freshContext.configs.join(', ') || 'None'}\n`;
    report += `${chalk.bold('Files count:')}     ${freshContext.files.length}\n\n`;
    report += `${chalk.bold('Modules/Structure:')}\n${freshContext.structure}`;
    return report;
  }

  // D. INTENT: security
  if (intent === 'security') {
    spinner.text = 'Security Agent: Auditing codebase...';
    const files = await retrieveContextFiles(root, state.context, input);
    const target = files[0]; // analyze most relevant file
    const result = await runSecurityAgent(root, state.context, target);
    return formatReviewReport(result, 'Security Audit');
  }

  // E. INTENT: performance
  if (intent === 'performance') {
    spinner.text = 'Performance Agent: Scanning for bottlenecks...';
    const files = await retrieveContextFiles(root, state.context, input);
    const target = files[0];
    const result = await runPerformanceAgent(root, state.context, target);
    return formatReviewReport(result, 'Performance Check');
  }

  // F. INTENT: architecture
  if (intent === 'architecture') {
    spinner.text = 'Architecture Agent: Evaluating layout patterns...';
    const files = await retrieveContextFiles(root, state.context, input);
    const target = files[0];
    const result = await runArchitectureAgent(root, state.context, target);
    return formatReviewReport(result, 'Architecture Review');
  }

  // G. INTENT: refactor
  if (intent === 'refactor') {
    spinner.text = 'Refactor Agent: Checking code quality...';
    const files = await retrieveContextFiles(root, state.context, input);
    const target = files[0];
    const result = await runRefactorAgent(root, state.context, target);
    return formatReviewReport(result, 'Refactoring Check');
  }

  // H. INTENT: testing
  if (intent === 'testing') {
    spinner.text = 'Testing Agent: Creating tests...';
    const files = await retrieveContextFiles(root, state.context, input);
    if (files.length === 0) {
      return chalk.yellow('Please specify which file you want to generate tests for.');
    }
    const target = files[0];
    const testCode = await runTestingAgent(root, state.context, target);
    
    let report = `${chalk.bold.cyan(`=== Generated Test Suite for ${target} ===`)}\n\n`;
    report += testCode;
    return report;
  }

  // I. INTENT: docs
  if (intent === 'docs') {
    spinner.text = 'Docs Agent: Compiling README/Guides...';
    const md = await runDocsAgent(root, state.context);
    return `${chalk.bold.cyan('=== Generated Documentation ===')}\n\n${md}`;
  }

  // J. INTENT: chat / generic
  spinner.text = 'MARS AI: Retrieving codebase context...';
  let filesContext = '';
  try {
    const relevantFiles = await retrieveContextFiles(root, state.context, input);
    const filesToRead = relevantFiles.slice(0, 5);
    for (const file of filesToRead) {
      const fullPath = path.resolve(root, file);
      if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
        const content = fs.readFileSync(fullPath, 'utf-8');
        filesContext += `\n--- FILE: ${file} ---\n${content.slice(0, 8000)}\n`;
      }
    }
  } catch (e) {
    // ignore context errors
  }

  spinner.text = 'MARS AI: Formulating answer...';
  const chatPrompt = `You are MARS AI, an advanced, highly active and proficient autonomous software engineer.
You have access to the project context and relevant source code below to answer the developer's query.

Project Stack: ${state.context.frameworks.join(', ')} / ${state.context.languages.join(', ')}

Source Code Context:
${filesContext || 'No specific codebase context retrieved.'}

Developer Query: "${input}"

Please formulate a very thorough, precise, and professional response. Explain details, suggest solutions, or provide code samples where helpful.`;

  const chatResponse = await generateText(root, chatPrompt, {
    systemInstruction: 'You are MARS AI, a powerful, active, and highly proficient software engineering assistant.',
    temperature: 0.2,
    model: 'gemini-2.5-flash',
  });

  return chatResponse || 'I am ready to help you write, review, and debug code.';
}

/**
 * Format specialty agent JSON output reports
 */
function formatReviewReport(result: any, title: string): string {
  let report = `${chalk.bold.cyan(`=== ${title} ===`)}\n`;
  report += `${result.summary}\n\n`;
  report += `${chalk.bold.cyan('=== Issues Identified ===')}\n`;

  if (!result.comments || result.comments.length === 0) {
    report += chalk.green('✓ No issues identified! Exceptional code.');
  } else {
    result.comments.forEach((comment: any, index: number) => {
      const num = index + 1;
      const severityColors: any = {
        high: chalk.red.bold,
        medium: chalk.yellow.bold,
        low: chalk.blue.bold,
      };
      const severityLabel = severityColors[comment.severity](`[${comment.severity.toUpperCase()}]`);
      const lineStr = comment.lineNumber ? `:${comment.lineNumber}` : '';
      
      report += `\n${chalk.bold(num + '.')} ${severityLabel} ${chalk.cyan(comment.filePath + lineStr)}\n`;
      report += `${chalk.bold('Rule:')}       ${comment.rule}\n`;
      report += `${chalk.bold('Details:')}    ${comment.message}\n`;
      report += `${chalk.bold('Suggestion:')}\n`;
      report += comment.suggestion.split('\n').map((l: string) => '  ' + l).join('\n') + '\n';
    });
  }
  return report;
}
