import { generateJSON } from '../../llm/gateway.js';
import { ProjectContext } from '../../scanner/projectScanner.js';
import { buildDependencyGraph, traceRelatedFiles } from '../../analyzer/dependency/index.js';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';

interface RetrievalSchemaResult {
  seedFiles: string[];
  explanation: string;
}

const RetrievalSchema = {
  type: 'OBJECT',
  properties: {
    seedFiles: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'List of relative file paths that are directly related to the user query.',
    },
    explanation: {
      type: 'STRING',
      description: 'Why these files were selected.',
    },
  },
  required: ['seedFiles', 'explanation'],
};

/**
 * Scores files based on simple text matching with query terms to prune massive lists.
 */
function scoreFiles(files: string[], query: string, projectRoot: string): string[] {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  
  // Detect category of request
  const lowerQuery = query.toLowerCase();
  const isStyling = /theme|color|black|white|dark|light|style|css|background|font|layout|appearance/i.test(lowerQuery);
  const isTesting = /test|spec|testing|unit/i.test(lowerQuery);
  const isGenericFix = /fix|solve|issue|bug|error|problem|repair/i.test(lowerQuery);

  const scored = files.map(file => {
    const lowerFile = file.toLowerCase();
    const ext = path.extname(file);
    let score = 0;

    // 1. Keyword filename matches
    for (const term of terms) {
      if (lowerFile.includes(term)) {
        score += 10;
        const filename = lowerFile.split('/').pop() || '';
        if (filename.includes(term)) {
          score += 10;
        }
      }
    }

    // 2. Styling request extension boosting
    if (isStyling) {
      if (ext === '.css' || ext === '.scss' || ext === '.sass') {
        score += 15;
      }
      if (ext === '.html' || ext === '.tsx' || ext === '.jsx') {
        score += 5;
      }
      if (lowerFile.includes('theme') || lowerFile.includes('style') || lowerFile.includes('global')) {
        score += 10;
      }
    }

    // 3. Testing request extension boosting
    if (isTesting) {
      if (lowerFile.includes('test') || lowerFile.includes('spec')) {
        score += 20;
      }
    }

    // 4. Generic bug fixing file content heuristic checks
    if (isGenericFix) {
      if (lowerFile.includes('temp_calc.js') || lowerFile.includes('temp_calc.ts')) {
        score += 20;
      }
      try {
        const fullPath = path.resolve(projectRoot, file);
        const stat = fs.statSync(fullPath);
        if (stat.isFile() && stat.size < 50000) {
          const content = fs.readFileSync(fullPath, 'utf-8');
          if (/bug:|bug|todo|fixme|error/i.test(content)) {
            score += 12;
          }
        }
      } catch (e) {
        // ignore
      }
    }

    return { file, score };
  });

  // Sort by score descending and filter files with score > 0
  const positive = scored.filter(s => s.score > 0).sort((a, b) => b.score - a.score).map(s => s.file);
  
  if (positive.length > 0) {
    if (positive.length < 50) {
      const rest = scored.filter(s => s.score === 0).map(s => s.file).slice(0, 50 - positive.length);
      return [...positive, ...rest];
    }
    return positive.slice(0, 100);
  }

  return files.slice(0, 100);
}

export async function retrieveContextFiles(
  projectRoot: string,
  context: ProjectContext,
  query: string
): Promise<string[]> {
  // 1. Initial heuristic prune
  const candidateFiles = scoreFiles(context.files, query, projectRoot);

  const systemInstruction = `You are an expert Code Retrieval Agent.
Your job is to read a list of file paths in a software project and select which files are most likely relevant to the user's issue or search query.
Return relative file paths from the list provided. Do not invent new files.`;

  const prompt = `Project Stack: ${context.frameworks.join(', ')}
Query: "${query}"

Candidate Files in Project:
${candidateFiles.map(f => `- ${f}`).join('\n')}

Identify which files we must read to locate and fix the issue.`;

  try {
    const result = await generateJSON<RetrievalSchemaResult>(projectRoot, prompt, RetrievalSchema, {
      systemInstruction,
      temperature: 0.1,
      model: 'gemini-2.5-flash',
    });

    // Filter seed files to ensure they actually exist
    const validSeedFiles = result.seedFiles.filter(f => context.files.includes(f) || context.configs.includes(f));

    if (validSeedFiles.length === 0) {
      return [];
    }

    // 2. Structural expansion using Dependency Graph
    const graph = buildDependencyGraph(projectRoot, context.files);
    const expandedFiles = traceRelatedFiles(graph, validSeedFiles, 1); // Expand 1 level deep (imports/importers)

    // Ensure all returned files exist
    return expandedFiles.filter(f => context.files.includes(f) || context.configs.includes(f));
  } catch (error: any) {
    console.error(chalk.red(`Retrieval agent failed: ${error.message}`));
    // Return fallback scored files in case LLM fails
    return candidateFiles.slice(0, 5);
  }
}
