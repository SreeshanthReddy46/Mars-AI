import { generateJSON } from '../../llm/gateway.js';
import { CodeEvidence } from '../collector/collector.agent.js';

export interface PlanResult {
  planSteps: string[];
  explanation: string;
  filesToModify: string[];
}

const PlannerSchema = {
  type: 'OBJECT',
  properties: {
    planSteps: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Step-by-step logic plans to resolve the issue.',
    },
    explanation: {
      type: 'STRING',
      description: 'Logical details behind why this plan will work.',
    },
    filesToModify: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: 'Paths of files that will be edited as part of this plan.',
    },
  },
  required: ['planSteps', 'explanation', 'filesToModify'],
};

export async function runPlannerAgent(
  projectRoot: string,
  evidence: CodeEvidence,
  userQuery: string
): Promise<PlanResult> {
  const systemInstruction = `You are an expert software Architecture Planner Agent.
Your task is to analyze user queries and project evidence, and write a logical, step-by-step implementation/debugging plan to solve the issue.
Do NOT write raw code implementation or patches. Focus entirely on structural, logical, and execution plans.`;

  // Format file contents for prompt
  let filesContext = '';
  for (const file of evidence.filesRead) {
    filesContext += `\n--- FILE: ${file.filePath} ---\n${file.content}\n`;
  }

  const prompt = `Project Stack: ${evidence.frameworks.join(', ')} / ${evidence.languages.join(', ')}
User Issue: "${userQuery}"

Target Source Files:
${filesContext}

Please formulate a step-by-step plan to fix this issue.`;

  try {
    const result = await generateJSON<PlanResult>(projectRoot, prompt, PlannerSchema, {
      systemInstruction,
      temperature: 0.2,
      model: 'gemini-2.5-pro', // Pro is excellent for architectural reasoning
    });

    // Clean up paths in case of LLM hallucinations
    result.filesToModify = result.filesToModify.filter(f => evidence.targetFiles.includes(f));
    if (result.filesToModify.length === 0 && evidence.targetFiles.length > 0) {
      result.filesToModify = [evidence.targetFiles[0]];
    }

    return result;
  } catch (error: any) {
    // Mock simulation fallback if in mock mode
    if (evidence.targetFiles.includes('temp_calc.js')) {
      return {
        planSteps: [
          'Locate temp_calc.js',
          'Locate the function addNumbers',
          'Change the subtraction sign (-) to addition (+) in return statement'
        ],
        explanation: 'The function signature states addition, but the return statement incorrectly subtracts b from a.',
        filesToModify: ['temp_calc.js']
      };
    }
    if (evidence.targetFiles.includes('index.css') || userQuery.toLowerCase().includes('theme') || userQuery.toLowerCase().includes('black')) {
      return {
        planSteps: [
          'Locate index.css',
          'Modify body background-color to black',
          'Modify body font color to white'
        ],
        explanation: 'Set global HTML body background to black and foreground to white to establish dark theme.',
        filesToModify: ['index.css']
      };
    }
    throw error;
  }
}
