import chalk from 'chalk';
import { runOrchestratorAgent } from '../../agents/orchestrator/orchestrator.agent.js';

export async function handleFixCommand(issue: string, options: { path: string; apply: boolean }) {
  try {
    console.log(chalk.blue(`\n[MARS Review] Initiating autonomous fix workflow for issue: "${issue}"`));
    await runOrchestratorAgent(options.path, issue, options.apply);
  } catch (err: any) {
    console.error(chalk.red(`\n[Fatal Error] Fix command failed: ${err.message}`));
  }
}
