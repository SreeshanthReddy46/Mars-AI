import chalk from 'chalk';
import { diffLines } from 'diff';
import { generateText } from '../llm/gateway.js';

export function renderDiffBox(filePath: string, oldContent: string, patchedContent: string): void {
  const boxWidth = Math.min(process.stdout.columns || 80, 80);
  const contentWidth = boxWidth - 4; // space for '║ ' and ' ║'

  const topBorder = chalk.cyan('╔' + '═'.repeat(boxWidth - 2) + '╗');
  const divider = chalk.cyan('╠' + '═'.repeat(boxWidth - 2) + '╣');
  const bottomBorder = chalk.cyan('╚' + '═'.repeat(boxWidth - 2) + '╝');

  console.log(topBorder);
  
  // Header
  const headerText = ` FILE PATCH: ${filePath} `;
  const paddingLeft = Math.floor((contentWidth - headerText.length) / 2);
  const paddingRight = contentWidth - headerText.length - paddingLeft;
  const headerLine = ' '.repeat(paddingLeft) + chalk.bold.yellow(headerText) + ' '.repeat(paddingRight);
  console.log(chalk.cyan('║ ') + headerLine + chalk.cyan(' ║'));
  
  console.log(divider);

  const diff = diffLines(oldContent, patchedContent);

  diff.forEach((part) => {
    const lines = part.value.split('\n');
    if (lines.length > 1 && lines[lines.length - 1] === '') {
      lines.pop();
    }

    lines.forEach((line) => {
      let prefix = '  ';
      let coloredLine = chalk.gray;

      if (part.added) {
        prefix = '+ ';
        coloredLine = chalk.green;
      } else if (part.removed) {
        prefix = '- ';
        coloredLine = chalk.red;
      }

      // Truncate line if it exceeds box content width
      const maxLen = contentWidth - prefix.length;
      let lineToPrint = line;
      if (lineToPrint.length > maxLen) {
        lineToPrint = lineToPrint.substring(0, maxLen - 3) + '...';
      }

      const formattedLine = coloredLine(prefix + lineToPrint);
      const padLen = Math.max(0, contentWidth - (prefix.length + lineToPrint.length));
      const displayLine = formattedLine + ' '.repeat(padLen);

      console.log(chalk.cyan('║ ') + displayLine + chalk.cyan(' ║'));
    });
  });

  console.log(bottomBorder);
}

export function promptASE(rl: any): Promise<'apply' | 'skip' | 'explain'> {
  return new Promise((resolve) => {
    const ask = () => {
      rl.question(chalk.bold.yellow('\nAction: [A] Apply / [S] Skip / [E] Explain > '), (answer: string) => {
        const cleaned = answer.trim().toLowerCase();
        if (cleaned === 'a' || cleaned === 'apply') {
          resolve('apply');
        } else if (cleaned === 's' || cleaned === 'skip') {
          resolve('skip');
        } else if (cleaned === 'e' || cleaned === 'explain') {
          resolve('explain');
        } else {
          console.log(chalk.red('Invalid choice. Please enter A, S, or E.'));
          ask();
        }
      });
    };
    ask();
  });
}

export async function explainPatch(
  projectRoot: string,
  filePath: string,
  oldContent: string,
  patchedContent: string
): Promise<string> {
  const prompt = `You are MARS AI. Explain the modifications in ${filePath} to the developer.
  
Original:
\`\`\`
${oldContent}
\`\`\`

Proposed Patched Content:
\`\`\`
${patchedContent}
\`\`\`

Explain exactly what these modifications fix or improve in a short, concise paragraph.`;

  return await generateText(projectRoot, prompt, {
    systemInstruction: 'You are MARS AI, a helpful autonomous software engineering assistant. Give a concise explanation of code changes.',
    temperature: 0.2,
  });
}
