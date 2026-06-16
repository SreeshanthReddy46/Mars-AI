import { ProjectContext } from '../scanner/projectScanner.js';
import { FilePatch } from '../patch/patchEngine.js';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionState {
  projectRoot: string;
  context: ProjectContext;
  history: ChatMessage[];
  lastDiagnosis?: {
    explanation: string;
    proposedAction: string;
    relevantFiles: string[];
  };
  lastPatches?: FilePatch[];
}

let activeState: SessionState | null = null;

export function getSessionState(): SessionState {
  if (!activeState) {
    throw new Error('Session state is not initialized. Call initSessionState first.');
  }
  return activeState;
}

export function initSessionState(projectRoot: string, context: ProjectContext): SessionState {
  activeState = {
    projectRoot,
    context,
    history: [],
  };
  return activeState;
}

export function updateSessionState(updates: Partial<SessionState>): SessionState {
  const state = getSessionState();
  activeState = { ...state, ...updates };
  return activeState;
}

export function appendHistory(role: 'user' | 'assistant', content: string): void {
  const state = getSessionState();
  state.history.push({ role, content });
}
