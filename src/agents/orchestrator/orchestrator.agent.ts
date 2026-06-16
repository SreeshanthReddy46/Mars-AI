import { executeFixWorkflow, WorkflowState } from './workflow.js';

export async function runOrchestratorAgent(
  projectRoot: string,
  issue: string,
  autoApply: boolean
): Promise<WorkflowState> {
  return executeFixWorkflow(projectRoot, issue, autoApply);
}
