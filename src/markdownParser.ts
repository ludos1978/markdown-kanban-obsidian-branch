export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: KanbanTask[];
}

export interface KanbanBoard {
  title: string;
  columns: KanbanColumn[];
  yamlHeader: string | null;
  kanbanFooter: string | null;
}

export class MarkdownKanbanParser {
  private static generateId(): string {
    return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  static parseMarkdown(content: string): KanbanBoard {
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const board: KanbanBoard = {
      title: '',
      columns: [],
      yamlHeader: null,
      kanbanFooter: null
    };

    let currentColumn: KanbanColumn | null = null;
    let currentTask: KanbanTask | null = null;
    let collectingDescription = false;
    let inYamlHeader = false;
    let inKanbanFooter = false;
    let yamlLines: string[] = [];
    let footerLines: string[] = [];
    let yamlStartFound = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Handle YAML front matter
      if (line.startsWith('---')) {
        if (!yamlStartFound) {
          yamlStartFound = true;
          inYamlHeader = true;
          yamlLines.push(line);
          continue;
        } else if (inYamlHeader) {
          yamlLines.push(line);
          board.yamlHeader = yamlLines.join('\n');
          inYamlHeader = false;
          continue;
        }
      }

      if (inYamlHeader) {
        yamlLines.push(line);
        continue;
      }

      // Handle Kanban footer
      if (line.startsWith('%%')) {
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }
        inKanbanFooter = true;
        footerLines.push(line);
        continue;
      }

      if (inKanbanFooter) {
        footerLines.push(line);
        continue;
      }

      // Parse board title
      if (line.startsWith('# ') && !board.title) {
        board.title = trimmedLine.substring(2).trim();
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }
        currentTask = null;
        continue;
      }

      // Parse column with ID comment
      if (line.startsWith('## ')) {
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }
        currentTask = null;
        if (currentColumn) {
          board.columns.push(currentColumn);
        }
        
        let columnTitle = trimmedLine.substring(3);
        let columnId = this.generateId();
        
        currentColumn = {
          id: columnId,
          title: columnTitle,
          tasks: []
        };
        continue;
      }

      // Parse task with ID comment
      if (line.startsWith('- ')) {
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }

        if (currentColumn) {
          let taskTitle = trimmedLine.substring(2).trim();
          
          // Remove checkbox markers if present
          if (taskTitle.startsWith('[ ] ') || taskTitle.startsWith('[x] ')) {
            taskTitle = taskTitle.substring(4).trim();
          }

          let taskId = this.generateId();
          
          currentTask = {
            id: taskId,
            title: taskTitle,
            description: ''
          };
          collectingDescription = true;
        }
        continue;
      }

      // Collect description from any indented content
      if (currentTask && collectingDescription) {
        let descLine = line;
        // if (line.startsWith('  ') || line.startsWith('\t')) {
        descLine = line.trimStart();
        if (currentTask.description) {
          currentTask.description += '\n' + descLine;
        } else {
          currentTask.description = descLine;
        }
        continue;
        // }
        // unindented line is not expected here
        // else {
        //   collectingDescription = false;
        // }
      }

      if (trimmedLine === '') {
        continue;
      }
    }

    // Add the last task and column
    if (collectingDescription) {
      this.finalizeCurrentTask(currentTask, currentColumn);
    }
    if (currentColumn) {
      board.columns.push(currentColumn);
    }

    if (footerLines.length > 0) {
      board.kanbanFooter = footerLines.join('\n');
    }

    return board;
  }

  private static finalizeCurrentTask(task: KanbanTask | null, column: KanbanColumn | null): void {
    if (!task || !column) return;

    if (task.description) {
      task.description = task.description.trimEnd();
      if (task.description === '') {
        delete task.description;
      }
    }
    column.tasks.push(task);
  }

  static generateMarkdown(board: KanbanBoard): string {
    let markdown = '';

    // Add YAML front matter if it exists
    if (board.yamlHeader) {
      markdown += board.yamlHeader + '\n\n';
    }

    // Add board title if it exists
    if (board.title) {
      markdown += `# ${board.title}\n\n`;
    }

    // Add columns with ID comments
    for (const column of board.columns) {
      markdown += `## ${column.title}\n`;

      for (const task of column.tasks) {
        markdown += `- [ ] ${task.title}\n`;

        // Add description with proper indentation
        if (task.description && task.description.trim() !== '') {
          const descriptionLines = task.description.split('\n');
          for (const descLine of descriptionLines) {
            markdown += `  ${descLine}\n`;
          }
        }
      }

      markdown += '\n';
    }

    // Add Kanban footer if it exists
    if (board.kanbanFooter) {
      if (markdown.endsWith('\n\n')) {
        markdown = markdown.slice(0, -1);
      }
      markdown += board.kanbanFooter;
      if (!board.kanbanFooter.endsWith('\n')) {
        markdown += '\n';
      }
    } else {
      markdown = markdown.trimEnd() + '\n';
    }

    return markdown;
  }
}