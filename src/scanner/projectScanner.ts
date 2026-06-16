import fs from 'fs';
import path from 'path';
import glob from 'fast-glob';

export interface ProjectContext {
  rootPath: string;
  projectName: string;
  packageManager: string;
  languages: string[];
  frameworks: string[];
  entryPoints: string[];
  configs: string[];
  files: string[];
  structure: string;
}

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/.next/**',
  '**/dist/**',
  '**/build/**',
  '**/coverage/**',
  '**/.cache/**',
  '**/out/**',
];

export async function scanProject(rootPath: string): Promise<ProjectContext> {
  const absoluteRoot = path.resolve(rootPath);
  
  // 1. Detect Project Name
  let projectName = path.basename(absoluteRoot);
  const packageJsonPath = path.join(absoluteRoot, 'package.json');
  let packageJsonData: any = {};
  if (fs.existsSync(packageJsonPath)) {
    try {
      packageJsonData = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      if (packageJsonData.name) {
        projectName = packageJsonData.name;
      }
    } catch (e) {
      // ignore
    }
  }

  // 2. Detect Package Manager
  let packageManager = 'unknown';
  if (fs.existsSync(path.join(absoluteRoot, 'package-lock.json'))) {
    packageManager = 'npm';
  } else if (fs.existsSync(path.join(absoluteRoot, 'pnpm-lock.yaml'))) {
    packageManager = 'pnpm';
  } else if (fs.existsSync(path.join(absoluteRoot, 'yarn.lock'))) {
    packageManager = 'yarn';
  } else if (fs.existsSync(path.join(absoluteRoot, 'bun.lockb'))) {
    packageManager = 'bun';
  } else if (packageJsonData.dependencies || packageJsonData.devDependencies) {
    packageManager = 'npm (assumed)';
  }

  // 3. Scan for Files (JS, TS, Python, Go, HTML, CSS, JSON, md, prisma, etc)
  const globPatterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.mjs',
    '**/*.cjs',
    '**/*.py',
    '**/*.go',
    '**/*.json',
    '**/*.html',
    '**/*.css',
    '**/*.prisma',
  ];

  const files = await glob(globPatterns, {
    cwd: absoluteRoot,
    ignore: IGNORE_PATTERNS,
    dot: false,
  });

  // 4. Detect Languages
  const languagesSet = new Set<string>();
  files.forEach(file => {
    const ext = path.extname(file);
    if (ext === '.ts' || ext === '.tsx') languagesSet.add('TypeScript');
    else if (ext === '.js' || ext === '.jsx' || ext === '.mjs' || ext === '.cjs') languagesSet.add('JavaScript');
    else if (ext === '.py') languagesSet.add('Python');
    else if (ext === '.go') languagesSet.add('Go');
    else if (ext === '.prisma') languagesSet.add('Prisma Schema');
  });
  const languages = Array.from(languagesSet);

  // 5. Detect Frameworks
  const frameworksSet = new Set<string>();
  const deps = {
    ...packageJsonData.dependencies,
    ...packageJsonData.devDependencies,
  };

  if (deps['next']) frameworksSet.add('Next.js');
  if (deps['react']) frameworksSet.add('React');
  if (deps['express']) frameworksSet.add('Express');
  if (deps['@nestjs/core']) frameworksSet.add('NestJS');
  if (deps['vue'] || deps['nuxt']) frameworksSet.add('Vue/Nuxt');
  if (deps['vite']) frameworksSet.add('Vite');
  if (deps['prisma']) frameworksSet.add('Prisma');
  if (deps['tailwindcss']) frameworksSet.add('TailwindCSS');
  
  // File-based fallback framework detection
  if (fs.existsSync(path.join(absoluteRoot, 'next.config.js')) || fs.existsSync(path.join(absoluteRoot, 'next.config.mjs'))) {
    frameworksSet.add('Next.js');
  }
  if (fs.existsSync(path.join(absoluteRoot, 'vite.config.ts')) || fs.existsSync(path.join(absoluteRoot, 'vite.config.js'))) {
    frameworksSet.add('Vite');
  }
  
  const frameworks = Array.from(frameworksSet);

  // 6. Detect Entry Points
  const entryPoints: string[] = [];
  const candidateEntries = [
    'src/main.ts',
    'src/index.ts',
    'src/app.ts',
    'src/main.js',
    'src/index.js',
    'src/app.js',
    'index.js',
    'app.js',
  ];
  candidateEntries.forEach(entry => {
    if (fs.existsSync(path.join(absoluteRoot, entry))) {
      entryPoints.push(entry);
    }
  });

  // 7. Detect Config Files
  const configs: string[] = [];
  const candidateConfigs = [
    'tsconfig.json',
    'package.json',
    'next.config.js',
    'next.config.mjs',
    'vite.config.ts',
    'vite.config.js',
    'tailwind.config.js',
    'tailwind.config.ts',
    'postcss.config.js',
    '.env',
    '.env.local',
    '.env.production',
    '.env.development',
    'eslint.config.js',
    '.eslintrc.js',
    '.eslintrc.json',
  ];
  candidateConfigs.forEach(conf => {
    if (fs.existsSync(path.join(absoluteRoot, conf))) {
      configs.push(conf);
    }
  });

  // 8. Build Folder Structure tree string (up to 3 levels deep for display)
  const structure = buildTreeString(absoluteRoot, 3);

  return {
    rootPath: absoluteRoot,
    projectName,
    packageManager,
    languages,
    frameworks,
    entryPoints,
    configs,
    files,
    structure,
  };
}

function buildTreeString(dir: string, maxDepth: number, currentDepth = 0, prefix = ''): string {
  if (currentDepth > maxDepth) return '';
  let result = '';
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true })
      .filter(item => {
        // filter ignored folders
        const name = item.name;
        if (name === 'node_modules' || name === '.git' || name === '.next' || name === 'dist' || name === 'build') {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

    items.forEach((item, index) => {
      const isLast = index === items.length - 1;
      const marker = isLast ? '└── ' : '├── ';
      result += `${prefix}${marker}${item.name}${item.isDirectory() ? '/' : ''}\n`;
      if (item.isDirectory() && currentDepth < maxDepth) {
        const nextPrefix = prefix + (isLast ? '    ' : '│   ');
        result += buildTreeString(path.join(dir, item.name), maxDepth, currentDepth + 1, nextPrefix);
      }
    });
  } catch (e) {
    // skip
  }
  return result;
}
