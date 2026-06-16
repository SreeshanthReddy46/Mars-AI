import chalk from 'chalk';
import readline from 'readline';

export interface TaskProgress {
  name: string;
  percentage: number;
  status?: string; // e.g. "Running", "Done", "Pending"
}

export class MultiProgressBar {
  private tasks: TaskProgress[] = [];
  private title: string = '';
  private lastLinesCount: number = 0;

  constructor(title: string, tasks: TaskProgress[]) {
    this.title = title;
    this.tasks = tasks;
  }

  public updateTask(name: string, percentage: number, status?: string) {
    const task = this.tasks.find(t => t.name === name);
    if (task) {
      task.percentage = Math.min(100, Math.max(0, percentage));
      if (status) task.status = status;
    }
    this.render();
  }

  public render() {
    // Move cursor up to overwrite the previous render
    if (this.lastLinesCount > 0) {
      readline.moveCursor(process.stdout, 0, -this.lastLinesCount);
      // Clear line from cursor down
      readline.cursorTo(process.stdout, 0);
      for (let i = 0; i < this.lastLinesCount; i++) {
        readline.clearLine(process.stdout, 0);
        readline.moveCursor(process.stdout, 0, 1);
      }
      readline.moveCursor(process.stdout, 0, -this.lastLinesCount);
    }

    const lines: string[] = [];
    lines.push(chalk.bold.yellow(this.title));
    lines.push(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    for (const task of this.tasks) {
      const barLength = 20;
      const completedLength = Math.round((task.percentage / 100) * barLength);
      const remainingLength = barLength - completedLength;

      const completedBar = '█'.repeat(completedLength);
      const remainingBar = '░'.repeat(remainingLength);

      let barColor = chalk.cyan;
      if (task.percentage === 100) {
        barColor = chalk.green;
      } else if (task.percentage > 0) {
        barColor = chalk.blue;
      } else {
        barColor = chalk.gray;
      }

      const barStr = barColor(completedBar + remainingBar);
      const nameStr = task.name.padEnd(20);
      const pctStr = `${task.percentage}%`.padStart(4);
      const statusStr = task.status ? chalk.gray(` [${task.status}]`) : '';

      lines.push(`${nameStr} ${barStr} ${pctStr}${statusStr}`);
    }

    lines.push(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

    for (const line of lines) {
      console.log(line);
    }

    this.lastLinesCount = lines.length;
  }

  public finish() {
    // Make sure all tasks are at 100% and final render is printed
    for (const task of this.tasks) {
      task.percentage = 100;
      task.status = 'Done';
    }
    this.render();
    console.log(); // Add empty line
  }
}
