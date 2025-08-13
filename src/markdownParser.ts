export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: KanbanTask[];
  archived?: boolean;
}

export interface KanbanBoard {
  title: string;
  columns: KanbanColumn[];
}

export class MarkdownKanbanParser {
  private static generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  static parseMarkdown(content: string): KanbanBoard {
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const board: KanbanBoard = {
      title: '',
      columns: []
    };

    let currentColumn: KanbanColumn | null = null;
    let currentTask: KanbanTask | null = null;
    let collectingDescription = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Parse board title
      if (trimmedLine.startsWith('# ') && !board.title) {
        board.title = trimmedLine.substring(2).trim();
        this.finalizeCurrentTask(currentTask, currentColumn);
        currentTask = null;
        collectingDescription = false;
        continue;
      }

      // Parse column title
      if (trimmedLine.startsWith('## ')) {
        this.finalizeCurrentTask(currentTask, currentColumn);
        currentTask = null;
        if (currentColumn) {
          board.columns.push(currentColumn);
        }
        
        let columnTitle = trimmedLine.substring(3).trim();
        let isArchived = false;
        
        // Check for [Archived] marker
        if (columnTitle.endsWith('[Archived]')) {
          isArchived = true;
          columnTitle = columnTitle.replace(/\s*\[Archived\]$/, '').trim();
        }
        
        currentColumn = {
          id: this.generateId(),
          title: columnTitle,
          tasks: [],
          archived: isArchived
        };
        collectingDescription = false;
        continue;
      }

      // Parse task title (list format - only top-level items)
      if (line.startsWith('- ')) {
        this.finalizeCurrentTask(currentTask, currentColumn);

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
        // Check if this is indented content (subitem) by space or tabs and not empty
        // if ( line.startsWith('  ') || line.startsWith('\t') ) {
          // Remove leading indentation (2 spaces minimum)
          let descLine = trimmedLine;
          
          // Add to description
          if (currentTask.description) {
            currentTask.description += '\n' + descLine;
          } else {
            currentTask.description = descLine;
          }
          continue;
        // }
      }

      // Handle empty lines
      if (trimmedLine === '') {
        continue;
      }

      // DISABLED, it's possible to add lines to a description but still continue to have more lines
      // If we hit non-indented content that's not a header, finalize current task
      // if (currentTask && !line.startsWith('  ') && !trimmedLine.startsWith('#')) {
      //   this.finalizeCurrentTask(currentTask, currentColumn);
      //   currentTask = null;
      //   collectingDescription = false;
      //   i--; // Re-process this line
      // }
    }

    // Add the last task and column
    this.finalizeCurrentTask(currentTask, currentColumn);
    if (currentColumn) {
      board.columns.push(currentColumn);
    }

    return board;
  }

  private static finalizeCurrentTask(task: KanbanTask | null, column: KanbanColumn | null): void {
    if (!task || !column) return;

    if (task.description) {
      task.description = task.description.trim();
      if (task.description === '') {
        delete task.description;
      }
    }
    column.tasks.push(task);
  }

  static generateMarkdown(board: KanbanBoard, taskHeaderFormat: 'title' | 'list' = 'title'): string {
    let markdown = '';

    if (board.title) {
      markdown += `# ${board.title}\n\n`;
    }

    for (const column of board.columns) {
      const columnTitle = column.archived ? `${column.title} [Archived]` : column.title;
      markdown += `## ${columnTitle}\n\n`;

      for (const task of column.tasks) {
        markdown += `- ${task.title}\n`;

        // Add description as indented lines
        if (task.description && task.description.trim() !== '') {
          // markdown += '\n';
          const descriptionLines = task.description.trim().split('\n');
          for (const descLine of descriptionLines) {
            markdown += `  ${descLine}\n`;
          }
        }

        // markdown += '\n';
      }
    }
    return markdown;
  }
}