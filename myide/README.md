# myide — AI-Powered Terminal IDE

`myide` is a developer-centric, terminal-based AI IDE designed to run code review, root-cause bug diagnoses, patch generations, and free-form chats directly in your workspace. It leverages Anthropic Claude models and integrates programmatically with Git, ESLint, and TSC to deliver a highly interactive development experience.

---

## Installation

```bash
npm install -g myide
```

---

## Quick Start

Get up and running in three simple commands:

1. **Initialize `myide` in your workspace** (configures API keys and generates local `.myide.json` project file):
   ```bash
   myide init
   ```
2. **Review a file or directory** statically and drop into the interactive AI console:
   ```bash
   myide review src/index.ts
   ```
3. **Automatically diagnose and generate patches** for linter or typescript compiler errors:
   ```bash
   myide fix src/auth.ts
   ```

---

## Commands & Usage

### 1. `myide review [file|glob|dir]`
Performs a sequential analysis pipeline on the targeted directory or workspace files:
`LintTool` ➔ `TypeCheckTool` ➔ `ReviewAgent` ➔ `DebugAgent`
- Streams summaries token-by-token.
- Summarizes static problems.
- Drops into the interactive workspace console automatically.

### 2. `myide fix [file]`
Queries the LLM to write a unified diff patch to fix diagnostic errors.
- `--dry-run`: View proposed patch and reasoning without writing changes.
- `--auto`: Apply patches and verify automatically.
- Without flags: Opens an interactive terminal interface prompt asking to apply (`y`), discard (`n`), or edit (`e`) the patch.

### 3. `myide chat [--context <glob>]`
Starts a full-screen, conversational terminal console with codebase awareness.
- Automatically searches workspace files by keyword matching to feed into prompt context.
- Supports interactive slash commands:
  - `/review <file>`: Reviews a target file.
  - `/fix <file>`: Patches a target file.
  - `/diff <file>`: Outputs git diff.
  - `/clear`: Clears chat logs.
  - `/exit`: Exits the console.

### 4. `myide diff [file]`
Fetches current unstaged modifications and returns a git diff accompanied by an AI-generated explanation summarizing what changed and why it matters.

### 5. `myide config`
Manages global configuration variables stored under `~/.config/myide/config.json`.
- `--list`: Lists current parameters.
- `--get <key>`: Prints a single configuration value.
- `--set <key>=<value>`: Modifies a configuration parameter.

---

## Configuration Settings

| Config Key | Allowed Values | Default Value | Description |
| :--- | :--- | :--- | :--- |
| `apiKey` | String | `""` | Anthropic Claude developer API key. |
| `model` | String | `claude-sonnet-4-6` | AI model to route calls to (translated to standard latest Sonnet). |
| `maxTokens` | Number | `4096` | Max token budget for completions. |
| `theme` | `dark` \| `light` | `dark` | Terminal layout theme mode. |
| `autoFix` | Boolean | `false` | Automatically apply changes without asking. |
| `contextDepth` | Number (1-5) | `3` | Maximum matching files to fetch in Chat. |

---

## Agent Architectures

- **ReviewAgent**: Conducts static review scans, parses structured findings into severity logs (ERROR, WARN, INFO) and returns a human-readable wrap-up.
- **DebugAgent**: Performs root-cause analysis on critical compiler errors or runtime stack traces, defining reproduction steps and conceptual solutions.
- **FixAgent**: Formulates precise unified patches (diff blocks) to solve target problems without breaking existing codebase logic.
- **ChatAgent**: Maintains multi-turn conversation logs in memory and retrieves relevant codebase files via keyword overlap to answer coding questions.
- **AgentOrchestrator**: Acts as an entrypoint parser using a lightweight intent classifier to route arbitrary developer instructions to the correct agent.

---

## Build from Source & Binary Packaging

Ensure you have Node.js and TypeScript installed, then clone this repository and build:

```bash
# 1. Install workspace packages
npm install

# 2. Compile TypeScript files to JavaScript
npm run build

# 3. Compile standalone executable binaries
npm run package
```

This compiles optimized binaries for MacOS, Linux, and Windows:
- Output directory: `./bin/`
- Target outputs: `myide-macos`, `myide-linux`, `myide-win.exe`
