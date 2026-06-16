import fs from 'fs';
import path from 'path';
import { diffLines } from 'diff';
import chalk from 'chalk';

export interface FilePatch {
  filePath: string;
  original: string;
  replacement: string;
}

export interface PatchApplyResult {
  filePath: string;
  success: boolean;
  error?: string;
  originalContent?: string;
  patchedContent?: string;
}

/**
 * Parses the custom search-and-replace blocks from the LLM's raw response.
 */
export function parseSearchReplaceBlocks(text: string): FilePatch[] {
  const patches: FilePatch[] = [];
  
  // Normalize line endings in the LLM output to make parsing easier
  const normalizedText = text.replace(/\r\n/g, '\n');
  
  // Match format:
  // <<<<<<< FILE: filepath
  // <<<<<<< ORIGINAL
  // original content
  // =======
  // replacement content
  // >>>>>>>
  const blockRegex = /<<<<<<< FILE:\s*([^\n]+)\s*\n<<<<<<< ORIGINAL\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>>/g;
  
  let match;
  while ((match = blockRegex.exec(normalizedText)) !== null) {
    const filePath = match[1].trim();
    const original = match[2];
    const replacement = match[3];
    
    patches.push({
      filePath,
      original,
      replacement,
    });
  }
  
  return patches;
}

/**
 * Normalizes line endings to LF (\n) for robust comparison.
 */
function normalizeNewlines(str: string): string {
  return str.replace(/\r\n/g, '\n').trim();
}

/**
 * Applies patches to files in the project.
 */
export function applyPatches(
  projectRoot: string,
  patches: FilePatch[],
  dryRun = false
): PatchApplyResult[] {
  const results: PatchApplyResult[] = [];
  
  // Group patches by file so we apply multiple patches sequentially on the same file
  const patchesByFile: { [key: string]: FilePatch[] } = {};
  for (const patch of patches) {
    if (!patchesByFile[patch.filePath]) {
      patchesByFile[patch.filePath] = [];
    }
    patchesByFile[patch.filePath].push(patch);
  }
  
  for (const [relPath, filePatches] of Object.entries(patchesByFile)) {
    const fullPath = path.resolve(projectRoot, relPath);
    let isNewFile = false;
    
    if (!fs.existsSync(fullPath)) {
      const firstPatch = filePatches[0];
      if (firstPatch && firstPatch.original.trim() === '') {
        isNewFile = true;
      } else {
        results.push({
          filePath: relPath,
          success: false,
          error: `File does not exist: ${relPath}`,
        });
        continue;
      }
    }
    
    try {
      let content = isNewFile ? '' : fs.readFileSync(fullPath, 'utf-8');
      const originalContent = content;
      let fileSuccess = true;
      let fileError: string | undefined;
      
      for (const patch of filePatches) {
        const normOriginal = normalizeNewlines(patch.original);
        const normContent = normalizeNewlines(content);
        
        // Try exact match first
        if (content.includes(patch.original)) {
          content = content.replace(patch.original, patch.replacement);
        } else if (normContent.includes(normOriginal)) {
          // Match with normalized line endings.
          // We need to locate the match in the original content (which may contain \r\n)
          // and replace it. Let's do a sliding window search or regex-based replacement.
          const escapedOriginal = normOriginal.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regexStr = escapedOriginal.split('\n').map(line => line.trim()).join('\\s*\\r?\\n?\\s*');
          const regex = new RegExp(regexStr);
          
          if (regex.test(content)) {
            content = content.replace(regex, patch.replacement);
          } else {
            fileSuccess = false;
            fileError = `Could not match original content block in ${relPath} (whitespace mismatch).`;
            break;
          }
        } else {
          fileSuccess = false;
          fileError = `Could not locate the exact original content block to replace in ${relPath}.\nEnsure original block matches the code precisely.`;
          break;
        }
      }
      
      if (fileSuccess) {
        if (!dryRun) {
          const dir = path.dirname(fullPath);
          if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
          }
          fs.writeFileSync(fullPath, content, 'utf-8');
        }
        results.push({
          filePath: relPath,
          success: true,
          originalContent,
          patchedContent: content,
        });
      } else {
        results.push({
          filePath: relPath,
          success: false,
          error: fileError,
        });
      }
    } catch (e: any) {
      results.push({
        filePath: relPath,
        success: false,
        error: `Error reading/writing file: ${e.message}`,
      });
    }
  }
  
  return results;
}

/**
 * Displays a colorized line-by-line diff of a patch in the terminal.
 */
export function displayDiff(filePath: string, oldContent: string, newContent: string): void {
  console.log(`\n${chalk.bold.yellow('Diff for file:')} ${chalk.bold.cyan(filePath)}`);
  console.log(chalk.gray('─'.repeat(process.stdout.columns || 60)));
  
  const diff = diffLines(oldContent, newContent);
  
  diff.forEach((part) => {
    const lines = part.value.split('\n');
    // If the last line is empty (due to trailing newline split), drop it
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }
    
    lines.forEach((line) => {
      if (part.added) {
        console.log(chalk.green(`+ ${line}`));
      } else if (part.removed) {
        console.log(chalk.red(`- ${line}`));
      } else {
        // Show some context lines in gray, skip middle lines if too long
        console.log(chalk.gray(`  ${line}`));
      }
    });
  });
  console.log(chalk.gray('─'.repeat(process.stdout.columns || 60)));
}
