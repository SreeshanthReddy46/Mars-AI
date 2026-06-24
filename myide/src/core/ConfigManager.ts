import Conf from 'conf';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as dotenv from 'dotenv';
import { Config } from '../types';

// Load dotenv as early as possible
dotenv.config();

const CONFIG_DIR = path.join(os.homedir(), '.config', 'myide');

const store = new Conf<Partial<Config>>({
  cwd: CONFIG_DIR,
  configName: 'config',
  schema: {
    apiKey: { type: 'string', default: '' },
    model: { type: 'string', default: 'claude-sonnet-4-6' },
    maxTokens: { type: 'number', default: 4096 },
    theme: { type: 'string', default: 'dark' },
    autoFix: { type: 'boolean', default: false },
    contextDepth: { type: 'number', default: 3 }
  }
});

/**
 * Manager for handling global and project-level configuration options.
 */
export class ConfigManager {
  /**
   * Retrieves the combined configuration (global config, project config, env vars).
   * Resolution order: Default -> Global Config -> Project .myide.json -> Env Variables
   * @returns {Config} The resolved configuration object.
   */
  public static getConfig(): Config {
    // 1. Get global config (defaults handled by Conf)
    const globalConfig: Config = {
      apiKey: store.get('apiKey') || '',
      model: store.get('model') || 'claude-sonnet-4-6',
      maxTokens: store.get('maxTokens') || 4096,
      theme: (store.get('theme') as 'dark' | 'light') || 'dark',
      autoFix: store.get('autoFix') || false,
      contextDepth: store.get('contextDepth') || 3,
    };

    // 2. Override with project-level configuration (.myide.json in cwd)
    const projectConfigPath = path.join(process.cwd(), '.myide.json');
    let projectOverrides: Partial<Config> = {};
    if (fs.existsSync(projectConfigPath)) {
      try {
        const rawContent = fs.readFileSync(projectConfigPath, 'utf-8');
        projectOverrides = JSON.parse(rawContent);
      } catch (err) {
        // Silently ignore malformed project config
      }
    }

    const merged = {
      ...globalConfig,
      ...projectOverrides,
    };

    // 3. Override with environment variables if present
    if (process.env.ANTHROPIC_API_KEY) {
      merged.apiKey = process.env.ANTHROPIC_API_KEY;
    }
    if (process.env.MYIDE_MODEL) {
      merged.model = process.env.MYIDE_MODEL;
    }
    if (process.env.MYIDE_MAX_TOKENS) {
      const parsed = parseInt(process.env.MYIDE_MAX_TOKENS, 10);
      if (!isNaN(parsed)) {
        merged.maxTokens = parsed;
      }
    }

    return merged;
  }

  /**
   * Updates a single configuration key globally.
   * @param {string} key - Config key to set.
   * @param {any} value - Value to set for the key.
   * @returns {void}
   */
  public static setGlobalKey(key: keyof Config, value: any): void {
    if (key === 'maxTokens' || key === 'contextDepth') {
      const num = parseInt(value, 10);
      store.set(key, isNaN(num) ? value : num);
    } else if (key === 'autoFix') {
      store.set(key, value === 'true' || value === true);
    } else {
      store.set(key, value);
    }
  }

  /**
   * Writes configuration to the project-level .myide.json in current working directory.
   * @param {Partial<Config>} config - The config options to write.
   * @returns {void}
   */
  public static writeProjectConfig(config: Partial<Config>): void {
    const projectConfigPath = path.join(process.cwd(), '.myide.json');
    fs.writeFileSync(projectConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Gets the underlying global configuration keys and values.
   * @returns {Partial<Config>} The raw global config.
   */
  public static getGlobalConfig(): Partial<Config> {
    return store.store;
  }

  /**
   * Clears the configuration store.
   * @returns {void}
   */
  public static clearGlobalConfig(): void {
    store.clear();
  }
}
