import fs from 'fs';
import path from 'path';
import { generateJSON } from '../llm/gateway.js';
import { ProjectContext } from '../scanner/projectScanner.js';
import chalk from 'chalk';

export interface ReviewComment {
  filePath: string;
  lineNumber?: number;
  severity: 'low' | 'medium' | 'high';
  rule: string;
  message: string;
  suggestion: string;
}

export interface ReviewResult {
  summary: string;
  comments: ReviewComment[];
}

export type ReviewAgentType = 'architecture' | 'security' | 'performance' | 'refactor';

export const ReviewSchema = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING', description: 'Overall summary of the code review findings.' },
    comments: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          filePath: { type: 'STRING', description: 'Relative path of the reviewed file.' },
          lineNumber: { type: 'INTEGER', description: 'Line number where the issue occurs, if specific.' },
          severity: { type: 'STRING', enum: ['low', 'medium', 'high'], description: 'Impact level of the issue.' },
          rule: { type: 'STRING', description: 'The name or category of the check/rule violated.' },
          message: { type: 'STRING', description: 'Clear explanation of what the issue is.' },
          suggestion: { type: 'STRING', description: 'Detailed instruction or code snippet on how to resolve it.' },
        },
        required: ['filePath', 'severity', 'rule', 'message', 'suggestion'],
      },
      description: 'List of specific issues or improvement opportunities found in the code.',
    },
  },
  required: ['summary', 'comments'],
};

const SYSTEM_PROMPTS: Record<ReviewAgentType, string> = {
  architecture: `You are an expert Architecture Agent.
Your job is to review the code structure, file division, modularity, and dependency graphs.
Identify:
- Circular dependencies or highly tight coupling
- Monolithic files that are too large and should be broken down
- Violations of design patterns (like MVC, clean architecture, SOLID)
- Anti-patterns in folder structure or import naming`,

  security: `You are an expert Security Agent.
Your job is to scan codebase contents to identify security vulnerabilities.
Identify:
- SQL Injections, command injection, XSS, or prototype pollution
- Hardcoded sensitive values (API keys, DB URIs, passwords, credentials)
- Unsafe crypto practices or libraries
- Improper authentication or permission controls
- Lack of sanitization of inputs`,

  performance: `You are an expert Performance Agent.
Your job is to identify sluggish operations and optimization opportunities.
Identify:
- Missing memoization or bad hook dependencies (React re-renders)
- Large block operations that could be async
- Unoptimized query structures, N+1 query patterns, or missing caching
- Large import footprints or memory leaks`,

  refactor: `You are an expert Refactor Agent.
Your job is to clean up code aesthetics, modernizability, and duplication.
Identify:
- Large blocks of duplicate or boilerplate code
- Code blocks with high cyclomatic complexity (too many nested ifs/loops)
- Opportunities to simplify syntax with modern language APIs (ES6/7/8 features)
- Inconsistent naming schemes or syntax stylings`,
};

export async function runReviewAgent(
  projectRoot: string,
  context: ProjectContext,
  agentType: ReviewAgentType,
  targetFilePath?: string
): Promise<ReviewResult> {
  const systemInstruction = SYSTEM_PROMPTS[agentType];
  
  // Collect file content to send
  let filesData = '';
  const filesToReview = targetFilePath 
    ? [targetFilePath] 
    : context.files.slice(0, 30); // limit to 30 files in general scan to stay within safe prompt token limits
    
  for (const relPath of filesToReview) {
    const fullPath = path.resolve(projectRoot, relPath);
    if (fs.existsSync(fullPath)) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        filesData += `\n--- FILE: ${relPath} ---\n${content}\n`;
      } catch (e) {
        // skip
      }
    }
  }

  const prompt = `Project Stack: ${context.frameworks.join(', ')} / ${context.languages.join(', ')}
Scope: ${targetFilePath ? `Single file: ${targetFilePath}` : 'Entire Project (sample files)'}

Source Code to Review:
${filesData}

Please perform a comprehensive ${agentType} review of the source code.`;

  try {
    const result = await generateJSON<ReviewResult>(projectRoot, prompt, ReviewSchema, {
      systemInstruction,
      temperature: 0.2,
      model: 'gemini-2.5-flash', // Flash is fast and excellent for scanning/reviewing
    });
    
    return result;
  } catch (error: any) {
    console.error(chalk.red(`[Error] ${agentType} agent execution failed: ${error.message}`));
    throw error;
  }
}
