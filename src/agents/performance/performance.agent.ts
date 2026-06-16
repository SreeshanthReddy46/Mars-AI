import fs from 'fs';
import path from 'path';
import { generateJSON } from '../../llm/gateway.js';
import { ProjectContext } from '../../scanner/projectScanner.js';
import { ReviewResult, ReviewSchema } from '../reviewAgent.js';

export async function runPerformanceAgent(
  projectRoot: string,
  context: ProjectContext,
  targetFile?: string
): Promise<ReviewResult> {
  const systemInstruction = `You are an expert Performance Agent.
Your job is to spot resource leaks, excessive re-renders, DB query inefficiencies (N+1 queries), blocking loops, and lack of indexing or caching.`;

  let filesData = '';
  const filesToReview = targetFile ? [targetFile] : context.files.slice(0, 15);
  for (const relPath of filesToReview) {
    const fullPath = path.resolve(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      filesData += `\n--- FILE: ${relPath} ---\n${fs.readFileSync(fullPath, 'utf-8')}\n`;
    }
  }

  const prompt = `Project Stack: ${context.frameworks.join(', ')}
Scope: ${targetFile ? `File: ${targetFile}` : 'General scan'}

Source Code to Review:
${filesData}

Provide a detailed performance review with comments matching the required schema.`;

  return generateJSON<ReviewResult>(projectRoot, prompt, ReviewSchema, {
    systemInstruction,
    temperature: 0.2,
    model: 'gemini-2.5-flash',
  });
}
