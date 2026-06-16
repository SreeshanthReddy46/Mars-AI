# MARS CLI

**Multi-Agent Autonomous Reasoning System** — an AI-powered software engineering assistant that runs entirely in your terminal.

> Point MARS at any codebase. It scans the project, understands the stack, and coordinates specialized AI agents to fix bugs, review code, and generate tests — all from the command line.

---

## What Is This?

MARS is a **local, terminal-based CLI tool** that acts as an autonomous coding assistant. Instead of a single monolithic AI prompt, MARS uses a **multi-agent architecture** — a team of specialized AI agents that each handle a different concern:

| Agent | What It Does |
|---|---|
| **Scanner** | Analyzes your project structure — files, frameworks, languages, configs, entry points |
| **Diagnosis** | Takes a natural-language bug description and identifies the root cause and target files |
| **Bug Fix** | Generates a search-replace code patch to fix the diagnosed issue |
| **Security** | Scans code for vulnerabilities and rates them by severity |
| **Performance** | Reviews code for bottlenecks, unnecessary allocations, and optimization opportunities |
| **Architecture** | Evaluates structural patterns, coupling, and design quality |
| **Refactor** | Identifies code smells, duplication, and cleanup opportunities |
| **Testing** | Generates unit test suites for individual source files |
| **Code Gen** | Generates new code (files, functions, components) from natural-language descriptions |
| **Docs** | Generates documentation for your codebase |
| **Planner** | Breaks down complex tasks into step-by-step execution plans |

An **orchestrator** routes your requests to the right agent(s) and manages the multi-step workflow.

---

## Why MARS?

- **No browser, no SaaS, no cloud** — everything runs locally in your terminal
- **Multi-agent coordination** — specialized agents collaborate instead of one generic prompt doing everything
- **Safe patching** — every code change is previewed as a colorized diff and requires your approval before applying
- **Persistent memory** — MARS remembers past fixes and detected patterns across sessions (stored in `.mars/`)
- **Multi-provider support** — works with Google Gemini, OpenAI, or local Ollama models

---

## Quick Start

### Prerequisites

- **Node.js v20+**
- An API key for at least one AI provider:
  - `GEMINI_API_KEY` (for Google Gemini — default)
  - `OPENAI_API_KEY` (for OpenAI)
  - Or a running [Ollama](https://ollama.ai) instance (no key needed)

### Install

```bash
git clone https://github.com/your-username/mars-cli.git
cd mars-cli
npm install
```

### Configure Your API Key

**Option A** — Environment variable:
```bash
export GEMINI_API_KEY=your_key_here
```

**Option B** — `.env` file in the project root:
```env
GEMINI_API_KEY=your_key_here
```

**Option C** — Interactive configuration:
```bash
npm run dev -- config
```

### Build (for production use)

```bash
npm run build
```

---

## How to Use

MARS has **two entry modes**:

### 1. Interactive Shell (Recommended)

Launch the full interactive AI console — a REPL-like shell where you can type natural-language commands and MARS routes them to the appropriate agent automatically.

```bash
# Development mode (uses tsx, no build required)
npm run dev

# Production mode (requires npm run build first)
npm start
```

The shell provides a conversational interface with progress indicators, colorized output, and interactive prompts.

### 2. Direct CLI Subcommands

Run specific commands directly without entering the shell:

#### `scan` — Analyze Project Structure
Generates a full summary of your project: languages, frameworks, config files, entry points, and file tree.

```bash
npm run dev -- scan
```

#### `fix <issue>` — Diagnose & Fix a Bug
Describe a bug in plain English. MARS will scan the codebase, find the relevant file, diagnose the root cause, generate a patch, show you a side-by-side diff, and apply the fix with your approval.

```bash
npm run dev -- fix "The calculate function should multiply instead of add"
npm run dev -- fix "Login form doesn't validate email format"
```

Use `--apply` to auto-apply patches without interactive approval:
```bash
npm run dev -- fix "Remove unused imports in utils.ts" --apply
```

#### `review [file]` — Specialized Code Review
Interactively choose from specialized review agents to run on your codebase or a specific file:

- **Security Scan** — find vulnerabilities
- **Performance Review** — find bottlenecks
- **Architecture Check** — evaluate design patterns
- **Refactor Cleanup** — find code smells

```bash
npm run dev -- review                        # Interactive: choose agent + scope
npm run dev -- review src/agents/scanner     # Review a specific file/directory
```

#### `test <file>` — Generate Unit Tests
Automatically generate a comprehensive test suite for a given file.

```bash
npm run dev -- test src/scanner/projectScanner.ts
npm run dev -- test src/utils.ts -o src/__tests__/utils.test.ts   # Write directly to file
```

#### `config` — Configure Settings
Set your AI provider (Gemini / OpenAI / Ollama), API keys, and default model.

```bash
npm run dev -- config
```

---

## Project Structure

```
mars-cli/
├── src/
│   ├── cli.ts                  # Main entrypoint — boots the interactive shell
│   ├── cli/
│   │   ├── index.ts            # Commander.js CLI — registers all subcommands
│   │   └── commands/
│   │       ├── scan.ts         # `mars scan` handler
│   │       ├── fix.ts          # `mars fix` handler
│   │       ├── review.ts       # `mars review` handler
│   │       └── test.ts         # `mars test` handler
│   ├── agents/                 # Specialized AI agents
│   │   ├── architecture/       # Architecture review agent
│   │   ├── bugfix/             # Bug fix patch generation
│   │   ├── codegen/            # Code generation from descriptions
│   │   ├── collector/          # Data collection for agent inputs
│   │   ├── diagnosis/          # Bug root-cause analysis
│   │   ├── docs/               # Documentation generation
│   │   ├── performance/        # Performance review agent
│   │   ├── planner/            # Task planning and breakdown
│   │   ├── refactor/           # Refactoring recommendations
│   │   ├── retrieval/          # Relevant file retrieval for agents
│   │   ├── scanner/            # Project scanning agent
│   │   ├── security/           # Security vulnerability scanning
│   │   ├── testing/            # Test suite generation
│   │   ├── orchestrator/       # Multi-agent coordination
│   │   └── reviewAgent.ts      # Base review agent logic
│   ├── orchestrator/
│   │   └── router.ts           # Routes requests to the correct agent(s)
│   ├── shell/                  # Interactive REPL shell
│   │   ├── index.ts            # Shell main loop
│   │   ├── state.ts            # Shell session state management
│   │   ├── progress.ts         # Progress spinners and status display
│   │   └── diffViewer.ts       # Colorized side-by-side diff output
│   ├── scanner/                # File glob and AST-based code scanning
│   ├── analyzer/               # Dependency analysis
│   ├── config/                 # Config loading/saving (.mars/config.json)
│   ├── llm/                    # AI provider gateway (Gemini, OpenAI, Ollama)
│   ├── memory/                 # Persistent session memory (.mars/metadata.json)
│   ├── patch/                  # Search-replace patch parsing and application
│   └── __tests__/              # Unit tests (Vitest)
├── .mars/                      # Local project data (memory, config) — git-ignored
├── package.json
├── tsconfig.json
└── .gitignore
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js (v20+) with TypeScript |
| **CLI Framework** | [Commander.js](https://github.com/tj/commander.js) |
| **Terminal UI** | [Chalk](https://github.com/chalk/chalk) (colors), [Ora](https://github.com/sindresorhus/ora) (spinners), [Inquirer](https://github.com/SBoudrias/Inquirer.js) (prompts) |
| **Code Scanning** | [fast-glob](https://github.com/mrmlnc/fast-glob), [ts-morph](https://github.com/dsherret/ts-morph) (TypeScript AST) |
| **Diff Engine** | [diff](https://github.com/kpdecker/jsdiff) (diffLines) |
| **AI Providers** | [@google/genai](https://github.com/google/genai-js) (Gemini 2.5), OpenAI API, Ollama |
| **Persistence** | SQLite via [sqlite3](https://github.com/TryGhost/node-sqlite3), JSON metadata files |
| **Testing** | [Vitest](https://vitest.dev) |

---

## How the Multi-Agent Pipeline Works

Here's what happens when you run a `fix` command, for example:

```
You: "The calculate function should multiply instead of add"
 │
 ▼
┌─────────────────────────┐
│  Orchestrator / Router   │  Routes your request to the right agents
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Scanner Agent           │  Scans project structure, finds relevant files
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Diagnosis Agent         │  Analyzes the target file, identifies root cause
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Bug Fix Agent           │  Generates a search-replace patch
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Diff Viewer             │  Shows colorized side-by-side diff
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Patch Applicator        │  Applies changes after your approval
└─────────────────────────┘
```

---

## Development

```bash
# Run in dev mode (no build needed)
npm run dev

# Run tests
npm test

# Build for production
npm run build

# Run production build
npm start
```

---

## License

MIT
