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
  valid: boolean;
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
      valid: false,
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
        } 
        // finish the header reading
        else if (inYamlHeader) {
          yamlLines.push(line);
          board.yamlHeader = yamlLines.join('\n');
          // if (!board.yamlHeader.includes('kanban-plugin: board')) {
          //   // invalid file
          //   return board;
          // }
          board.valid = board.yamlHeader.includes('kanban-plugin: board');
          if (!board.valid) {
            return board;
          }
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
        
        currentColumn = {
          id: this.generateId(),
          title: line.substring(3),
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
          currentTask = {
            id: this.generateId(),
            title: line.substring(6),
            description: ''
          };
          collectingDescription = true;
        }
        continue;
      }

      // Collect description from any indented content
      if (currentTask && collectingDescription) {
        let descLine = line;
        // remove the first leading spaces if there
        if (line.startsWith('  ')) {
          descLine = line.substring(2);
        }
        if (!currentTask.description) {
          currentTask.description = descLine;
        } else {
          currentTask.description += '\n' + descLine;
        }
        continue;
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
    // if (board.title) {
    //   markdown += `# ${board.title}\n\n`;
    // }

    // Add columns
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
      markdown += '\n';
    }

    return markdown;
  }
}