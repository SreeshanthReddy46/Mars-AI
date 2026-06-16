import { GoogleGenAI } from '@google/genai';
import { loadConfig } from '../config/configManager.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

let geminiClient: GoogleGenAI | null = null;

function getGeminiClient(projectRoot: string): GoogleGenAI {
  if (geminiClient) return geminiClient;
  const config = loadConfig(projectRoot);
  const apiKey = config.geminiApiKey;

  if (!apiKey) {
    console.error(chalk.red('\n[Error] GEMINI_API_KEY is not configured.'));
    console.error(`Please set the ${chalk.cyan('GEMINI_API_KEY')} env variable or run: ${chalk.cyan('npm run dev -- config')}\n`);
    throw new Error('GEMINI_API_KEY missing');
  }

  geminiClient = new GoogleGenAI({ apiKey });
  return geminiClient;
}

export interface GenerationOptions {
  model?: string;
  temperature?: number;
  systemInstruction?: string;
  responseSchema?: any;
}

/**
 * Route text generation requests based on configured provider (Gemini, OpenAI, Ollama)
 */
export async function generateText(
  projectRoot: string,
  prompt: string,
  options: GenerationOptions = {}
): Promise<string> {
  const config = loadConfig(projectRoot);
  const provider = config.provider || 'gemini';

  if (provider === 'mock') {
    console.log(chalk.bold.blue('\n[Notice] Running in Offline Demo Mode. (No API key found)'));
    const lowerPrompt = prompt.toLowerCase();
    
    if (lowerPrompt.includes('temp_calc.js')) {
      return `Here is a simulated search-replace patch to fix the arithmetic bug in temp_calc.js:

<<<<<<< FILE: temp_calc.js
<<<<<<< ORIGINAL
function addNumbers(a, b) {
  // Bug: subtracts instead of adding
  return a - b;
}
=======
function addNumbers(a, b) {
  // Corrected: adds a and b
  return a + b;
}
>>>>>>>

I have corrected the sign to perform addition as described.`;
    }

    if (lowerPrompt.includes('developer query:')) {
      const queryMatch = prompt.match(/Developer Query:\s*"([^"]+)"/i);
      const userQuery = queryMatch ? queryMatch[1] : 'general inquiry';
      
      const stackMatch = prompt.match(/Project Stack:\s*([^\n]+)/i);
      const stack = stackMatch ? stackMatch[1] : 'TypeScript / Node.js';

      // Parse the filesContext if present
      const filesSectionMatch = prompt.match(/Source Code Context:([\s\S]+?)Developer Query:/i);
      const rawContext = filesSectionMatch ? filesSectionMatch[1].trim() : '';

      // Let's analyze files in context
      const fileBlocks = [];
      const fileRegex = /--- FILE:\s*([^\n\-]+)\s*---([\s\S]+?)(?=--- FILE:|$)/gi;
      let match;
      while ((match = fileRegex.exec(rawContext)) !== null) {
        fileBlocks.push({
          name: match[1].trim(),
          content: match[2].trim()
        });
      }

      let answer = `${chalk.bold.green('[MARS AI Offline Reasoning]')} Here is my analysis of your query: "${chalk.bold(userQuery)}"\n\n`;

      const lowerUserQuery = userQuery.toLowerCase();

      if (lowerUserQuery.includes('stack') || lowerUserQuery.includes('framework') || lowerUserQuery.includes('language') || lowerUserQuery.includes('technolog')) {
        answer += `This project is built using the following stack: ${chalk.bold.yellow(stack)}.\n`;
        answer += `Based on the directory scan, the primary files are written in TypeScript, managed via npm, and structured for Node.js modules.\n`;
        if (fileBlocks.length > 0) {
          answer += `Current scanned context has loaded files: ${fileBlocks.map(f => chalk.cyan(f.name)).join(', ')}.`;
        }
      } else if (lowerUserQuery.includes('theme') || lowerUserQuery.includes('black') || lowerUserQuery.includes('css') || lowerUserQuery.includes('color')) {
        answer += `To update the styling/theme to dark or black:\n`;
        const cssFile = fileBlocks.find(f => f.name.endsWith('.css'));
        if (cssFile) {
          answer += `I found stylesheet file: ${chalk.cyan(cssFile.name)}. Here is the code:\n\`\`\`css\n${cssFile.content}\n\`\`\`\n`;
          answer += `You can run the autonomous command to apply this styling shift: \`Change the theme to black\`. This will update the background color to black and set text color to white.`;
        } else {
          answer += `No stylesheet (e.g. index.css) is currently in context. I recommend checking the styles folder or running an autonomous task.`;
        }
      } else if (lowerUserQuery.includes('temp_calc') || lowerUserQuery.includes('addnumbers') || lowerUserQuery.includes('calculator') || lowerUserQuery.includes('bug') || lowerUserQuery.includes('arithmetic')) {
        const jsFile = fileBlocks.find(f => f.name.includes('temp_calc'));
        if (jsFile) {
          answer += `I analyzed the code in ${chalk.cyan(jsFile.name)}:\n\`\`\`javascript\n${jsFile.content}\n\`\`\`\n`;
          answer += `There is an arithmetic bug in the function \`addNumbers(a, b)\`. It currently returns \`a - b;\` (subtraction) instead of \`a + b;\` (addition).\n`;
          answer += `To fix this automatically, run \`fix the bug in temp_calc.js\` or run the command \`mars-review fix temp_calc.js\`.`;
        } else {
          answer += `I analyzed the query regarding the math/bug functions. If there is a calculation bug in \`temp_calc.js\`, it typically involves return subtraction instead of addition. Please run the fix pipeline to inspect it.`;
        }
      } else if (lowerUserQuery.includes('file') || lowerUserQuery.includes('structure') || lowerUserQuery.includes('directory')) {
        answer += `The workspace files retrieved for this query include:\n`;
        if (fileBlocks.length > 0) {
          fileBlocks.forEach(f => {
            answer += `- ${chalk.cyan(f.name)} (${f.content.split('\n').length} lines of code)\n`;
          });
        } else {
          answer += `- index.css\n- package.json\n- tsconfig.json\n- src/ directory files\n`;
        }
        answer += `\nFor a full scan of the directory layout, run the \`/project\` command.`;
      } else {
        answer += `I detected a general developer query. Here is a thorough, pro-efficient analysis of your query in the context of this project:\n\n`;
        if (fileBlocks.length > 0) {
          answer += `Scanned Files context loaded:\n`;
          fileBlocks.forEach(f => {
            answer += `- ${chalk.cyan(f.name)}: Contains definitions and patterns.\n`;
          });
          answer += `\nDirect inspection of ${fileBlocks[0].name} shows clean styling and standard imports.\n`;
        } else {
          answer += `No files were directly loaded into active context for this question, but the project root contains a package.json, tsconfig.json, and src/ configuration.\n`;
        }
        answer += `\nTo proceed with coding changes or debugging, you can instruct me to:
- "Change the theme into black in my project"
- "Solve the issues in my project"
- "Audit my code for security or performance vulnerabilities" (using /security or /performance)`;
      }

      return answer;
    }

    if (lowerPrompt.includes('theme') || lowerPrompt.includes('black') || lowerPrompt.includes('index.css')) {
      let originalContent = `body {\n  background-color: white;\n  color: black;\n}`;
      let replacementContent = `body {\n  background-color: black;\n  color: white;\n}`;
      
      const indexPath = path.resolve(projectRoot, 'index.css');
      if (fs.existsSync(indexPath)) {
        const currentCss = fs.readFileSync(indexPath, 'utf-8').trim();
        if (currentCss.includes('background-color: black')) {
          originalContent = currentCss;
          replacementContent = `body {\n  background-color: white;\n  color: black;\n}`;
        } else {
          originalContent = currentCss;
          replacementContent = `body {\n  background-color: black;\n  color: white;\n}`;
        }
      }

      return `Here is a simulated search-replace patch to change the theme into black in index.css:

<<<<<<< FILE: index.css
<<<<<<< ORIGINAL
${originalContent}
=======
${replacementContent}
>>>>>>>

I have changed the background to black and font color to white for the dark theme.`;
    }

    if (lowerPrompt.includes('generate the test suite') || lowerPrompt.includes('testing agent')) {
      return `import { describe, it, expect } from 'vitest';

describe('Simulated Tests', () => {
  it('should pass test simulations successfully', () => {
    expect(1 + 1).toBe(2);
  });
});`;
    }

    if (lowerPrompt.includes('documentation agent') || lowerPrompt.includes('readme')) {
      return `# Simulated Project Documentation
      
This is a mock documentation output generated offline. MARS is running in simulated mode.`;
    }

    return `Simulated text response for offline mode.`;
  }

  if (provider === 'gemini') {
    const ai = getGeminiClient(projectRoot);
    const model = options.model || config.defaultModel || 'gemini-2.5-flash';
    const reqConfig: any = {};
    if (options.systemInstruction) reqConfig.systemInstruction = options.systemInstruction;
    if (options.temperature !== undefined) reqConfig.temperature = options.temperature;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: reqConfig,
      });
      return response.text || '';
    } catch (e: any) {
      throw new Error(`Gemini API error: ${e.message}`);
    }
  }

  if (provider === 'openai') {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing. Configure it in .env or settings.');
    }
    const model = options.model || 'gpt-4o';
    const messages = [];
    if (options.systemInstruction) {
      messages.push({ role: 'system', content: options.systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.2,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI HTTP Error ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      return data.choices?.[0]?.message?.content || '';
    } catch (e: any) {
      throw new Error(`OpenAI error: ${e.message}`);
    }
  }

  if (provider === 'ollama') {
    const endpoint = config.ollamaEndpoint || 'http://localhost:11434';
    const model = options.model || 'qwen2.5-coder:latest';
    const messages = [];
    if (options.systemInstruction) {
      messages.push({ role: 'system', content: options.systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          options: {
            temperature: options.temperature ?? 0.2,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error ${response.status}`);
      }

      const data: any = await response.json();
      return data.message?.content || '';
    } catch (e: any) {
      throw new Error(`Ollama offline / unavailable: ${e.message}`);
    }
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}

/**
 * Route structured JSON generation requests based on configured provider
 */
export async function generateJSON<T>(
  projectRoot: string,
  prompt: string,
  schema: any,
  options: GenerationOptions = {}
): Promise<T> {
  const config = loadConfig(projectRoot);
  const provider = config.provider || 'gemini';

  if (provider === 'mock') {
    const lowerPrompt = prompt.toLowerCase();

    // 1. Router Agent Intent Classification
    if (options.systemInstruction?.includes('Router Agent') || prompt.includes('User input:')) {
      const inputMatch = prompt.match(/User input:\s*"([^"]+)"/i);
      const userInput = inputMatch ? inputMatch[1] : '';
      const lowerInput = userInput.toLowerCase();

      let intent = 'chat';
      let explanation = 'Simulated router classification';

      if (lowerInput.includes('theme') || lowerInput.includes('black') || lowerInput.includes('style') || lowerInput.includes('css') || lowerInput.includes('color')) {
        intent = 'modify';
        explanation = 'Detected modification request for themes or stylesheets.';
      } else if (lowerInput.includes('fix') || lowerInput.includes('solve') || lowerInput.includes('bug') || lowerInput.includes('issue') || lowerInput.includes('error') || lowerInput.includes('problem')) {
        intent = 'debug';
        explanation = 'Detected bug report or correction request.';
      } else if (lowerInput.includes('refactor') || lowerInput.includes('simplify') || lowerInput.includes('clean')) {
        intent = 'refactor';
        explanation = 'Detected request to clean up/refactor codebase.';
      } else if (lowerInput.includes('project') || lowerInput.includes('stack') || lowerInput.includes('framework') || lowerInput.includes('structure') || lowerInput.includes('layout')) {
        intent = 'project';
        explanation = 'Detected request for project overview or stack info.';
      } else if (lowerInput.includes('security') || lowerInput.includes('leak') || lowerInput.includes('credential')) {
        intent = 'security';
        explanation = 'Detected request for security review.';
      } else if (lowerInput.includes('performance') || lowerInput.includes('slow') || lowerInput.includes('bottleneck') || lowerInput.includes('leak')) {
        intent = 'performance';
        explanation = 'Detected request for performance optimization analysis.';
      } else if (lowerInput.includes('test') || lowerInput.includes('spec') || lowerInput.includes('unit')) {
        intent = 'testing';
        explanation = 'Detected request to build unit tests.';
      } else if (lowerInput.includes('readme') || lowerInput.includes('doc') || lowerInput.includes('guide')) {
        intent = 'docs';
        explanation = 'Detected request to construct documentation.';
      } else if (lowerInput.includes('apply fix') || lowerInput.includes('apply patch') || lowerInput.includes('write change')) {
        intent = 'apply_fix';
        explanation = 'Detected instruction to commit pending fixes.';
      }

      return {
        intent,
        explanation
      } as any;
    }

    // 2. Planner Agent Plan Generation
    if (lowerPrompt.includes('step-by-step plan') || lowerPrompt.includes('filestomodify')) {
      if (lowerPrompt.includes('theme') || lowerPrompt.includes('black') || lowerPrompt.includes('css')) {
        return {
          planSteps: [
            'Locate index.css',
            'Modify body background-color to black',
            'Modify body font color to white'
          ],
          explanation: 'Set global HTML body background to black and foreground to white to establish dark theme.',
          filesToModify: ['index.css']
        } as any;
      }
      return {
        planSteps: [
          'Locate temp_calc.js',
          'Locate the function addNumbers',
          'Change the subtraction sign (-) to addition (+) in return statement'
        ],
        explanation: 'The function signature states addition, but the return statement incorrectly subtracts b from a.',
        filesToModify: ['temp_calc.js']
      } as any;
    }
    
    // Check if it's Retrieval Agent / Diagnosis Agent (looking for generic files)
    if (lowerPrompt.includes('files list') || lowerPrompt.includes('identify which files')) {
      if (lowerPrompt.includes('theme') || lowerPrompt.includes('black') || lowerPrompt.includes('css')) {
        return {
          seedFiles: ['index.css'],
          explanation: 'Simulated search selection of index.css for theme modification.'
        } as any;
      }
      return {
        seedFiles: ['temp_calc.js'],
        explanation: 'Simulated search selection for demo purposes.'
      } as any;
    }

    // Check if it's Diagnosis Agent looking at temp_calc.js
    if (lowerPrompt.includes('temp_calc.js')) {
      return {
        relevantFiles: [
          {
            filePath: 'temp_calc.js',
            reason: 'The addNumbers function subtracts b from a instead of adding.',
            confidence: 1.0
          }
        ],
        explanation: 'The function addNumbers in temp_calc.js has a logical bug where it uses the subtraction operator (-) instead of the addition operator (+).',
        proposedAction: 'Change a - b to a + b in the return statement.'
      } as any;
    }

    // Check review agents (security, performance, architecture, refactor)
    if (lowerPrompt.includes('security')) {
      return {
        summary: '[Offline Scan] Security scan complete (Simulated).',
        comments: [
          {
            filePath: 'src/llm/gateway.ts',
            lineNumber: 10,
            severity: 'medium',
            rule: 'simulated-security-check',
            message: 'In offline mode, this is a simulated warning comment.',
            suggestion: 'Define a real GEMINI_API_KEY in your environment to perform live scans.'
          }
        ]
      } as any;
    }

    if (lowerPrompt.includes('performance')) {
      return {
        summary: '[Offline Scan] Performance analysis complete (Simulated).',
        comments: [
          {
            filePath: 'src/cli/index.ts',
            lineNumber: 1,
            severity: 'low',
            rule: 'simulated-perf-check',
            message: 'Simulated performance improvement suggestion.',
            suggestion: 'Implement lazy load modules if imports grow excessive.'
          }
        ]
      } as any;
    }

    if (lowerPrompt.includes('architecture')) {
      return {
        summary: '[Offline Scan] Architecture structure check complete (Simulated).',
        comments: [
          {
            filePath: 'src/agents/orchestrator/workflow.ts',
            lineNumber: 1,
            severity: 'low',
            rule: 'simulated-arch-check',
            message: 'Simulated clean architecture note.',
            suggestion: 'Everything looks well modularized in this production layout!'
          }
        ]
      } as any;
    }

    // default refactor/fallback JSON review
    return {
      summary: '[Offline Scan] Code quality analysis complete (Simulated).',
      comments: [
        {
          filePath: 'src/scanner/projectScanner.ts',
          lineNumber: 5,
          severity: 'low',
          rule: 'simulated-quality-check',
          message: 'Simulated styling suggestion.',
          suggestion: 'Code is clean and formatted.'
        }
      ]
    } as any;
  }

  if (provider === 'gemini') {
    const ai = getGeminiClient(projectRoot);
    const model = options.model || config.defaultModel || 'gemini-2.5-flash';
    const reqConfig: any = {
      responseMimeType: 'application/json',
      responseSchema: schema,
    };
    if (options.systemInstruction) reqConfig.systemInstruction = options.systemInstruction;
    if (options.temperature !== undefined) reqConfig.temperature = options.temperature;

    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: reqConfig,
      });
      const text = response.text || '{}';
      return JSON.parse(text) as T;
    } catch (e: any) {
      throw new Error(`Gemini JSON error: ${e.message}`);
    }
  }

  if (provider === 'openai') {
    const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is missing. Configure it in .env or settings.');
    }
    const model = options.model || 'gpt-4o';
    const messages = [];
    if (options.systemInstruction) {
      messages.push({ role: 'system', content: options.systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: options.temperature ?? 0.1,
          response_format: { type: 'json_object' },
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI HTTP Error ${response.status}: ${errText}`);
      }

      const data: any = await response.json();
      const text = data.choices?.[0]?.message?.content || '{}';
      return JSON.parse(text) as T;
    } catch (e: any) {
      throw new Error(`OpenAI JSON error: ${e.message}`);
    }
  }

  if (provider === 'ollama') {
    const endpoint = config.ollamaEndpoint || 'http://localhost:11434';
    const model = options.model || 'qwen2.5-coder:latest';
    const messages = [];
    if (options.systemInstruction) {
      messages.push({ role: 'system', content: options.systemInstruction });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch(`${endpoint}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: 'json',
          options: {
            temperature: options.temperature ?? 0.1,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama HTTP Error ${response.status}`);
      }

      const data: any = await response.json();
      const text = data.message?.content || '{}';
      return JSON.parse(text) as T;
    } catch (e: any) {
      throw new Error(`Ollama JSON error: ${e.message}`);
    }
  }

  throw new Error(`Unknown LLM provider: ${provider}`);
}
