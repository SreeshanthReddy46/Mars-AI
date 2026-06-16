import fs from 'fs';
import path from 'path';
import { generateJSON } from '../../llm/gateway.js';
import { ProjectContext } from '../../scanner/projectScanner.js';
import { ReviewResult, ReviewSchema } from '../reviewAgent.js';

export async function runSecurityAgent(
  projectRoot: string,
  context: ProjectContext,
  targetFile?: string
): Promise<ReviewResult> {
  const systemInstruction = `You are an expert Security Agent.
Your job is to identify vulnerabilities like hardcoded keys/secrets, SQL Injection, XSS, insecure cookies, and missing authentication.`;

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

Provide a detailed security review with comments matching the required schema.`;

  return generateJSON<ReviewResult>(projectRoot, prompt, ReviewSchema, {
    systemInstruction,
    temperature: 0.1,
    model: 'gemini-2.5-flash',
  });
}
