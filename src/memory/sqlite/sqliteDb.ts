import fs from 'fs';
import path from 'path';

let useSqlite = false;
let sqliteDb: any = null;
let jsonDbPath: string = '';

// Fallback JSON DB schema
interface FallbackData {
  projectName: string;
  framework: string;
  language: string;
  history: { issue: string; files_patched: string; timestamp: string }[];
  conventions: string[];
}

const DEFAULT_CONVENTIONS = [
  'Use clean formatting',
  'Follow TypeScript strict modes',
  'Add comments to complex functions',
];

export async function initDb(projectRoot: string): Promise<void> {
  const dirPath = path.join(projectRoot, '.mars');
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }

  jsonDbPath = path.join(dirPath, 'metadata.json');

  try {
    // Dynamically try to import sqlite3 and sqlite to check if C++ modules are available
    const sqlite3Module = await import('sqlite3');
    const { open } = await import('sqlite');
    
    const dbPath = path.join(dirPath, 'metadata.db');
    sqliteDb = await open({
      filename: dbPath,
      driver: sqlite3Module.default.Database
    });

    // Create tables
    await sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_path TEXT UNIQUE,
        framework TEXT,
        language TEXT
      );
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        issue TEXT,
        files_patched TEXT,
        timestamp TEXT
      );
      CREATE TABLE IF NOT EXISTS conventions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        rule TEXT UNIQUE
      );
    `);

    // Prepopulate default conventions if empty
    const countRes = await sqliteDb.get('SELECT COUNT(*) as count FROM conventions');
    if (countRes.count === 0) {
      for (const rule of DEFAULT_CONVENTIONS) {
        await sqliteDb.run('INSERT OR IGNORE INTO conventions (rule) VALUES (?)', rule);
      }
    }

    useSqlite = true;
  } catch (error) {
    // If SQLite package isn't installed or fails to compile, fallback to JSON
    useSqlite = false;
    if (!fs.existsSync(jsonDbPath)) {
      const initialData: FallbackData = {
        projectName: path.basename(projectRoot),
        framework: '',
        language: '',
        history: [],
        conventions: DEFAULT_CONVENTIONS,
      };
      fs.writeFileSync(jsonDbPath, JSON.stringify(initialData, null, 2), 'utf-8');
    }
  }
}

export async function saveProjectMetadata(
  projectRoot: string,
  framework: string,
  language: string
): Promise<void> {
  if (useSqlite && sqliteDb) {
    await sqliteDb.run(`
      INSERT INTO projects (project_path, framework, language)
      VALUES (?, ?, ?)
      ON CONFLICT(project_path) DO UPDATE SET
        framework = excluded.framework,
        language = excluded.language
    `, projectRoot, framework, language);
  } else {
    // Fallback JSON edit
    const data = getJsonData();
    data.framework = framework;
    data.language = language;
    saveJsonData(data);
  }
}

export async function recordFixHistory(
  projectRoot: string,
  issue: string,
  filesPatched: string[]
): Promise<void> {
  const filesStr = filesPatched.join(',');
  const timestamp = new Date().toISOString();

  if (useSqlite && sqliteDb) {
    await sqliteDb.run(
      'INSERT INTO history (issue, files_patched, timestamp) VALUES (?, ?, ?)',
      issue,
      filesStr,
      timestamp
    );
  } else {
    const data = getJsonData();
    data.history.push({
      issue,
      files_patched: filesStr,
      timestamp,
    });
    saveJsonData(data);
  }
}

export async function getFixHistory(): Promise<any[]> {
  if (useSqlite && sqliteDb) {
    return sqliteDb.all('SELECT * FROM history ORDER BY id DESC');
  } else {
    const data = getJsonData();
    return [...data.history].reverse();
  }
}

export async function getConventions(): Promise<string[]> {
  if (useSqlite && sqliteDb) {
    const rows = await sqliteDb.all('SELECT rule FROM conventions');
    return rows.map((r: any) => r.rule);
  } else {
    const data = getJsonData();
    return data.conventions;
  }
}

export async function saveConvention(rule: string): Promise<void> {
  if (useSqlite && sqliteDb) {
    await sqliteDb.run('INSERT OR IGNORE INTO conventions (rule) VALUES (?)', rule);
  } else {
    const data = getJsonData();
    if (!data.conventions.includes(rule)) {
      data.conventions.push(rule);
      saveJsonData(data);
    }
  }
}

// JSON Sync Helpers
function getJsonData(): FallbackData {
  try {
    if (fs.existsSync(jsonDbPath)) {
      return JSON.parse(fs.readFileSync(jsonDbPath, 'utf-8'));
    }
  } catch (e) {
    // ignore
  }
  return {
    projectName: '',
    framework: '',
    language: '',
    history: [],
    conventions: DEFAULT_CONVENTIONS,
  };
}

function saveJsonData(data: FallbackData): void {
  fs.writeFileSync(jsonDbPath, JSON.stringify(data, null, 2), 'utf-8');
}
