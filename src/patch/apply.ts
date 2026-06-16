import { applyPatches, FilePatch, PatchApplyResult } from './patchEngine.js';

export function commitPatches(
  projectRoot: string,
  patches: FilePatch[]
): PatchApplyResult[] {
  return applyPatches(projectRoot, patches, false);
}
