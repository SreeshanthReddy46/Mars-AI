import fs from 'fs';
import path from 'path';
import { ProjectContext } from '../../scanner/projectScanner.js';
import { retrieveContextFiles } from '../retrieval/retrieval.agent.js';
import { buildDependencyGraph } from '../../analyzer/dependency/index.js';

export interface CodeEvidence {
  projectName: string;
  frameworks: string[];
  languages: string[];
  configs: Record<string, string>; // filename -> content
  filesRead: { filePath: string; content: string }[];
  dependencyGraph: any;
  targetFiles: string[];
}

export async function runEvidenceCollector(
  projectRoot: string,
  context: ProjectContext,
  query: string
): Promise<CodeEvidence> {
  const absRoot = path.resolve(projectRoot);

  // 1. Identify target candidate files
  const targetFiles = await retrieveContextFiles(absRoot, context, query);

  // 2. Read contents of target files
  const filesRead: { filePath: string; content: string }[] = [];
  for (const file of targetFiles) {
    const fullPath = path.resolve(absRoot, file);
    if (fs.existsSync(fullPath) && !fs.statSync(fullPath).isDirectory()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        filesRead.push({ filePath: file, content });
      } catch (e) {
        // ignore
      }
    }
  }

  // 3. Build dependency graph
  const dependencyGraph = buildDependencyGraph(absRoot, context.files);

  // 4. Read config files
  const configs: Record<string, string> = {};
  for (const conf of context.configs.slice(0, 5)) {
    const fullPath = path.resolve(absRoot, conf);
    if (fs.existsSync(fullPath)) {
      try {
        configs[conf] = fs.readFileSync(fullPath, 'utf-8').slice(0, 2000); // limit config size
      } catch (e) {
        // ignore
      }
    }
  }

  return {
    projectName: context.projectName,
    frameworks: context.frameworks,
    languages: context.languages,
    configs,
    filesRead,
    dependencyGraph,
    targetFiles,
  };
}
