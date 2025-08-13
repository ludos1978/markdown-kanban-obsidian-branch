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
    return Math.random().toString(36).substr(2, 9);
  }

  static parseMarkdown(content: string): KanbanBoard {
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const board: KanbanBoard = {
      title: '',
      columns: [],
      yamlHeader: '',
      kanbanFooter: ''
    };

    let currentColumn: KanbanColumn | null = null;
    let currentTask: KanbanTask | null = null;
    let collectingDescription = false;
    let collectingYamlHeading = false;
    let yamlHeader = null;
    let collectingKabanFooter = false;
    let kanbanFooter = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // parse board header
      if (trimmedLine.startsWith('---')) {
        collectingYamlHeading = true;
      }

      if (collectingYamlHeading) {
        if (trimmedLine.startsWith('---')) {
          collectingYamlHeading = false;
        }

        if (board.yamlHeader) {
          board.yamlHeader += '\n' + trimmedLine;
        }
        else {
          board.yamlHeader = trimmedLine;
        } 
      }

      if (trimmedLine.startsWith('%%')) {
        // finalize previous task if we get the footer
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }
        collectingYamlHeading = false;
        collectingKabanFooter = true;
      }

      if (collectingKabanFooter) {
        if (trimmedLine.startsWith('%%')) {
          collectingYamlHeading = false;
        }
        if (board.kanbanFooter) {
          board.kanbanFooter += '\n' + trimmedLine;
        }
        else {
          board.kanbanFooter = trimmedLine;
        } 
      }

      // Parse board title
      if (trimmedLine.startsWith('# ') && !board.title) {
        board.title = trimmedLine.substring(2).trim();
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }
        currentTask = null;
        continue;
      }

      // Parse column title
      if (trimmedLine.startsWith('## ')) {
        if (collectingDescription) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          collectingDescription = false;
        }
        currentTask = null;
        if (currentColumn) {
          board.columns.push(currentColumn);
        }
        
        let columnTitle = trimmedLine.substring(3).trim();
        
        currentColumn = {
          id: this.generateId(),
          title: columnTitle,
          tasks: []
        };
        continue;
      }

      // Parse task title (list format - only top-level items)
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

          currentTask = {
            id: this.generateId(),
            title: taskTitle,
            description: ''
          };
          collectingDescription = true;
        }
        continue;
      }

      // Collect description from any indented content
      if (currentTask && collectingDescription) {
        // Add to description
        if (currentTask.description) {
          currentTask.description += '\n' + trimmedLine;
        } else {
          currentTask.description = trimmedLine;
        }
        continue;
      }

      // Handle empty lines
      if (trimmedLine === '') {
        continue;
      }
    }

    // Add the last task and column
    if (collectingDescription) {
      this.finalizeCurrentTask(currentTask, currentColumn);
      collectingDescription = false;
    }
    if (currentColumn) {
      board.columns.push(currentColumn);
    }

    return board;
  }

  private static finalizeCurrentTask(task: KanbanTask | null, column: KanbanColumn | null): void {
    if (!task || !column) return;

    if (task.description) {
      if (task.description === '') {
        delete task.description;
      }
    }
    column.tasks.push(task);
  }

  static generateMarkdown(board: KanbanBoard): string {
    let markdown = '';

    if (board.yamlHeader) {
      markdown += `${board.yamlHeader}\n\n`;
    }

    if (board.title) {
      markdown += `# ${board.title}\n\n`;
    }

    for (const column of board.columns) {
      markdown += `## ${column.title}\n\n`;

      for (const task of column.tasks) {
        markdown += `- ${task.title}\n`;

        // Add description as indented lines
        if (task.description && task.description.trim() !== '') {
          const descriptionLines = task.description.trim().split('\n');
          for (const descLine of descriptionLines) {
            markdown += `  ${descLine}\n`;
          }
        }
      }
    }

    if (board.kanbanFooter) {
      markdown += `${board.kanbanFooter}\n`;
    }

    return markdown;
  }
}