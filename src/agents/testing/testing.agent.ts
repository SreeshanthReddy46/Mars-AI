import fs from 'fs';
import path from 'path';
import { generateText } from '../../llm/gateway.js';
import { ProjectContext } from '../../scanner/projectScanner.js';

export async function runTestingAgent(
  projectRoot: string,
  context: ProjectContext,
  targetFile: string
): Promise<string> {
  const systemInstruction = `You are an expert Testing Agent.
Your job is to read a source file and generate a comprehensive suite of unit tests for it.
Use the testing library detected in the project (e.g. Vitest, Jest, PyTest, etc.), or default to a modern framework suitable for the language.
Make sure to mock external imports and network requests cleanly.`;

  const fullPath = path.resolve(projectRoot, targetFile);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${targetFile}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');

  const prompt = `Project Frameworks: ${context.frameworks.join(', ')}
Languages: ${context.languages.join(', ')}
File Path: ${targetFile}

Source Code:
${content}

Please generate the test suite code for this file. Return ONLY the code inside the code blocks, or standard code text. Do not include excessive conversational explanations.`;

  return generateText(projectRoot, prompt, {
    systemInstruction,
    temperature: 0.1,
    model: 'gemini-2.5-pro',
  });
}
