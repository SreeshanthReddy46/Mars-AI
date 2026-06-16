import { scanProject, ProjectContext } from '../../scanner/projectScanner.js';
import { saveProjectMetadata } from '../../memory/sqlite/sqliteDb.js';
import chalk from 'chalk';

export async function runScannerAgent(projectRoot: string): Promise<ProjectContext> {
  try {
    const context = await scanProject(projectRoot);
    
    // Save metadata to project DB cache
    await saveProjectMetadata(
      projectRoot, 
      context.frameworks.join(',') || 'None', 
      context.languages.join(',') || 'None'
    );
    
    return context;
  } catch (error: any) {
    console.error(chalk.red(`Scanner Agent failed: ${error.message}`));
    throw error;
  }
}
