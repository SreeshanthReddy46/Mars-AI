import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { scanProject } from '../scanner/projectScanner.js';
import { parseSearchReplaceBlocks, applyPatches } from '../patch/patchEngine.js';
import { initSessionState } from '../shell/state.js';
import { generateJSON, generateText } from '../llm/gateway.js';

describe('Project Scanner tests', () => {
  it('should scan current directory structure and stack properties', async () => {
    const context = await scanProject('.');
    
    expect(context.projectName).toBe('mars');
    expect(context.packageManager).toBe('npm');
    expect(context.languages).toContain('TypeScript');
    expect(context.files.length).toBeGreaterThan(0);
    expect(context.structure).toContain('src/');
    expect(context.configs).toContain('package.json');
    expect(context.configs).toContain('tsconfig.json');
  });
});

describe('Patch Engine tests', () => {
  it('should parse custom search-and-replace blocks correctly', () => {
    const rawLLMOutput = `
Here is my analysis of the issue. I've found that we need to adjust the calculation logic.

<<<<<<< FILE: src/index.ts
<<<<<<< ORIGINAL
function calculate(a: number, b: number) {
  return a + b;
}
=======
function calculate(a: number, b: number) {
  // Corrected calculation
  return a * b;
}
>>>>>>>

I have applied the fix. Hopefully this works.
`;
    
    const patches = parseSearchReplaceBlocks(rawLLMOutput);
    expect(patches).toHaveLength(1);
    expect(patches[0].filePath).toBe('src/index.ts');
    expect(patches[0].original.trim()).toBe('function calculate(a: number, b: number) {\n  return a + b;\n}');
    expect(patches[0].replacement.trim()).toBe('function calculate(a: number, b: number) {\n  // Corrected calculation\n  return a * b;\n}');
  });

  it('should apply simple search-replace blocks safely on target content', () => {
    // Create temporary test file
    const testFilePath = path.resolve('./temp_test_file.txt');
    fs.writeFileSync(testFilePath, 'Hello World!\nThis is line 2.\nGoodbye World!', 'utf-8');

    try {
      const patches = [
        {
          filePath: 'temp_test_file.txt',
          original: 'This is line 2.',
          replacement: 'This is the replaced line 2.',
        }
      ];

      // Dry run first
      const dryRun = applyPatches('.', patches, true);
      expect(dryRun[0].success).toBe(true);
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe('Hello World!\nThis is line 2.\nGoodbye World!'); // file unchanged

      // Actual apply
      const actualRun = applyPatches('.', patches, false);
      expect(actualRun[0].success).toBe(true);
      expect(fs.readFileSync(testFilePath, 'utf-8')).toBe('Hello World!\nThis is the replaced line 2.\nGoodbye World!');
    } finally {
      // Clean up
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    }
  });

  it('should fail with error if original block cannot be matched', () => {
    const patches = [
      {
        filePath: 'non_existent_file.js',
        original: 'not matching',
        replacement: 'anything',
      }
    ];

    const run = applyPatches('.', patches, true);
    expect(run[0].success).toBe(false);
    expect(run[0].error).toContain('File does not exist');
  });
});

describe('MARS Router and LLM Gateway Tests', () => {
  it('should dynamically classify mock intent correctly', async () => {
    const context = await scanProject('.');
    initSessionState('.', context);

    const resultTheme = await generateJSON<any>('.', 'User input: "Change theme to black"', {}, {
      systemInstruction: 'Router Agent',
    });
    expect(resultTheme.intent).toBe('modify');

    const resultBug = await generateJSON<any>('.', 'User input: "fix the bug in math"', {}, {
      systemInstruction: 'Router Agent',
    });
    expect(resultBug.intent).toBe('debug');

    const resultStack = await generateJSON<any>('.', 'User input: "what is the stack?"', {}, {
      systemInstruction: 'Router Agent',
    });
    expect(resultStack.intent).toBe('project');

    const resultChat = await generateJSON<any>('.', 'User input: "hello there"', {}, {
      systemInstruction: 'Router Agent',
    });
    expect(resultChat.intent).toBe('chat');
  });

  it('should formulate dynamic offline reasoning for general queries', async () => {
    const mockPrompt = `
Project Stack: Node.js / TypeScript
Source Code Context:
--- FILE: index.css ---
body { color: black; }

Developer Query: "what is the stack?"
`;
    const response = await generateText('.', mockPrompt);
    expect(response).toContain('[MARS AI Offline Reasoning]');
    expect(response).toContain('Node.js / TypeScript');
  });
});

