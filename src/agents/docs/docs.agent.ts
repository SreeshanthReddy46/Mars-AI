import { generateText } from '../../llm/gateway.js';
import { ProjectContext } from '../../scanner/projectScanner.js';

export async function runDocsAgent(
  projectRoot: string,
  context: ProjectContext
): Promise<string> {
  const systemInstruction = `You are an expert Documentation Agent.
Your job is to read project metadata, configurations, and structures, and generate comprehensive documentation (such as README files, architectural guidelines, or API maps) for the codebase.`;

  const prompt = `Project Name: ${context.projectName}
Package Manager: ${context.packageManager}
Languages: ${context.languages.join(', ')}
Frameworks: ${context.frameworks.join(', ')}
Entry Points: ${context.entryPoints.join(', ')}
Configs: ${context.configs.join(', ')}

Folder Structure:
${context.structure}

Please generate a professional, clear, and comprehensive architectural documentation/README for this project.`;

  return generateText(projectRoot, prompt, {
    systemInstruction,
    temperature: 0.3,
    model: 'gemini-2.5-flash',
  });
}
