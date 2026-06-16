import fs from 'fs';
import path from 'path';

/**
 * Extracts all relative imports/requires from a file content.
 */
export function extractImports(filePath: string, content: string): string[] {
  const imports: string[] = [];
  const fileDir = path.dirname(filePath);

  // Match: import ... from './path' or import './path' or require('./path')
  // Regex matches both single/double quotes, handles relative paths starting with . or ..
  const importRegex = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]/g;
  const requireRegex = /require\(['"](\.\.?\/[^'"]+)['"]\)/g;

  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  // Resolve imports relative to this file
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.json', '.prisma', '.py', '.go'];
  const resolved: string[] = [];

  for (const imp of imports) {
    let targetPath = path.resolve(fileDir, imp);
    
    // Check if target is a file or a folder index
    let resolvedPath = '';
    
    // 1. Direct match
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      resolvedPath = targetPath;
    } else {
      // 2. Try extensions
      for (const ext of extensions) {
        if (fs.existsSync(targetPath + ext)) {
          resolvedPath = targetPath + ext;
          break;
        }
      }
      // 3. Try index files inside folder
      if (!resolvedPath && fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) {
        for (const ext of extensions) {
          const indexPath = path.join(targetPath, `index${ext}`);
          if (fs.existsSync(indexPath)) {
            resolvedPath = indexPath;
            break;
          }
        }
      }
    }

    if (resolvedPath) {
      resolved.push(resolvedPath);
    }
  }

  return resolved;
}

export interface DependencyGraph {
  imports: Record<string, string[]>; // file -> what it imports
  importedBy: Record<string, string[]>; // file -> what imports it
}

/**
 * Builds the import dependency graph for the whole project list of files.
 */
export function buildDependencyGraph(projectRoot: string, filesList: string[]): DependencyGraph {
  const absRoot = path.resolve(projectRoot);
  const graph: DependencyGraph = {
    imports: {},
    importedBy: {},
  };

  // Initialize
  for (const file of filesList) {
    const relFile = path.relative(absRoot, path.resolve(absRoot, file)).replace(/\\/g, '/');
    graph.imports[relFile] = [];
    graph.importedBy[relFile] = [];
  }

  for (const file of filesList) {
    const fullPath = path.resolve(absRoot, file);
    const relFile = path.relative(absRoot, fullPath).replace(/\\/g, '/');
    
    try {
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) continue;
      const content = fs.readFileSync(fullPath, 'utf-8');
      const resolvedAbsImports = extractImports(fullPath, content);
      
      for (const absImp of resolvedAbsImports) {
        const relImp = path.relative(absRoot, absImp).replace(/\\/g, '/');
        
        if (graph.imports[relFile]) {
          graph.imports[relFile].push(relImp);
        }
        if (graph.importedBy[relImp]) {
          graph.importedBy[relImp].push(relFile);
        }
      }
    } catch (e) {
      // skip unreadable files
    }
  }

  return graph;
}

/**
 * Traces all recursively imported and importing files for a list of seed files.
 */
export function traceRelatedFiles(
  graph: DependencyGraph,
  seedFiles: string[],
  maxDepth = 2
): string[] {
  const visited = new Set<string>(seedFiles);
  const queue: { file: string; depth: number }[] = seedFiles.map(f => ({ file: f, depth: 0 }));

  while (queue.length > 0) {
    const { file, depth } = queue.shift()!;
    if (depth >= maxDepth) continue;

    // Add files this file imports
    const fileImports = graph.imports[file] || [];
    for (const imp of fileImports) {
      if (!visited.has(imp)) {
        visited.add(imp);
        queue.push({ file: imp, depth: depth + 1 });
      }
    }

    // Add files that import this file
    const fileImportedBy = graph.importedBy[file] || [];
    for (const importer of fileImportedBy) {
      if (!visited.has(importer)) {
        visited.add(importer);
        queue.push({ file: importer, depth: depth + 1 });
      }
    }
  }

  return Array.from(visited);
}
