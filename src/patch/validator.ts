import { applyPatches, displayDiff, FilePatch, PatchApplyResult } from './patchEngine.js';

export interface ValidationResult {
  isValid: boolean;
  results: PatchApplyResult[];
  errors: string[];
}

export function validatePatches(
  projectRoot: string,
  patches: FilePatch[]
): ValidationResult {
  const dryRunResults = applyPatches(projectRoot, patches, true);
  
  const errors: string[] = [];
  let isValid = true;

  for (const res of dryRunResults) {
    if (!res.success) {
      isValid = false;
      errors.push(`File: ${res.filePath} - ${res.error}`);
    }
  }

  return {
    isValid,
    results: dryRunResults,
    errors,
  };
}

export { displayDiff };
