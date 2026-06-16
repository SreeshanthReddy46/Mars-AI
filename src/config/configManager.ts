import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export interface MarsConfig {
  provider?: 'gemini' | 'openai' | 'ollama' | 'mock';
  geminiApiKey?: string;
  openaiApiKey?: string;
  ollamaEndpoint?: string;
  defaultModel?: string;
  excludePatterns?: string[];
}

const CONFIG_DIR_NAME = '.mars';
const CONFIG_FILE_NAME = 'config.json';

export function getProjectConfigPath(projectRoot: string): string {
  return path.join(projectRoot, CONFIG_DIR_NAME, CONFIG_FILE_NAME);
}

export function loadConfig(projectRoot: string): MarsConfig {
  const config: MarsConfig = {
    provider: 'gemini',
    defaultModel: 'gemini-2.5-flash',
    excludePatterns: [],
  };

  // 1. Try to load from local project .env file
  const envPath = path.join(projectRoot, '.env');
  if (fs.existsSync(envPath)) {
    const parsed = dotenv.parse(fs.readFileSync(envPath));
    if (parsed.MARS_PROVIDER || parsed.NEXUS_PROVIDER) {
      config.provider = (parsed.MARS_PROVIDER || parsed.NEXUS_PROVIDER) as any;
    }
    if (parsed.GEMINI_API_KEY) {
      config.geminiApiKey = parsed.GEMINI_API_KEY;
    }
    if (parsed.OPENAI_API_KEY) {
      config.openaiApiKey = parsed.OPENAI_API_KEY;
    }
    if (parsed.OLLAMA_ENDPOINT) {
      config.ollamaEndpoint = parsed.OLLAMA_ENDPOINT;
    }
  }

  // 2. Try to load from system environment variables
  if (process.env.MARS_PROVIDER || process.env.NEXUS_PROVIDER) {
    config.provider = (process.env.MARS_PROVIDER || process.env.NEXUS_PROVIDER) as any;
  }
  if (process.env.GEMINI_API_KEY) {
    config.geminiApiKey = process.env.GEMINI_API_KEY;
  }
  if (process.env.OPENAI_API_KEY) {
    config.openaiApiKey = process.env.OPENAI_API_KEY;
  }
  if (process.env.OLLAMA_ENDPOINT) {
    config.ollamaEndpoint = process.env.OLLAMA_ENDPOINT;
  }

  // 3. Try to load from .mars/config.json
  const localConfigPath = getProjectConfigPath(projectRoot);
  if (fs.existsSync(localConfigPath)) {
    try {
      const fileData = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
      if (fileData.provider) config.provider = fileData.provider;
      if (fileData.geminiApiKey) config.geminiApiKey = fileData.geminiApiKey;
      if (fileData.openaiApiKey) config.openaiApiKey = fileData.openaiApiKey;
      if (fileData.ollamaEndpoint) config.ollamaEndpoint = fileData.ollamaEndpoint;
      if (fileData.defaultModel) config.defaultModel = fileData.defaultModel;
      if (fileData.excludePatterns) config.excludePatterns = fileData.excludePatterns;
    } catch (e) {
      // skip
    }
  }

  // 4. Auto-fallback to mock if no keys are found
  if (config.provider !== 'ollama' && !config.geminiApiKey && !config.openaiApiKey) {
    config.provider = 'mock';
  }

  return config;
}

export function saveConfig(projectRoot: string, newConfig: Partial<MarsConfig>): void {
  const configDir = path.join(projectRoot, CONFIG_DIR_NAME);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  const configPath = getProjectConfigPath(projectRoot);
  let currentConfig: MarsConfig = {};
  if (fs.existsSync(configPath)) {
    try {
      currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      // ignore
    }
  }

  const merged = { ...currentConfig, ...newConfig };
  fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf-8');
}
