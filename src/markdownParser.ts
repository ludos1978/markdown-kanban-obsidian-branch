export interface KanbanTask {
  id: string;
  title: string;
  description?: string;
  tags?: string[];
  priority?: 'low' | 'medium' | 'high';
  workload?: 'Easy' | 'Normal' | 'Hard' | 'Extreme';
  dueDate?: string;
  startDate?: string;
  defaultExpanded?: boolean;
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
    let inTaskContent = false;
    let inCodeBlock = false;
    let taskIndentLevel = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      const currentIndentLevel = line.search(/\S/);

      // Check for code block markers
      if (trimmedLine.startsWith('```')) {
        if (inTaskContent && currentTask) {
          inCodeBlock = !inCodeBlock;
          if (inCodeBlock && trimmedLine === '```md') {
            continue; // Skip the opening ```md line
          }
          if (!inCodeBlock && trimmedLine === '```') {
            continue; // Skip the closing ``` line
          }
        }
      }

      // If in code block, add to description
      if (inCodeBlock && currentTask) {
        const cleanLine = line.replace(/^\s{4,}/, '');
        currentTask.description = currentTask.description 
          ? currentTask.description + '\n' + cleanLine
          : cleanLine;
        continue;
      }

      // Parse board title
      if (!inCodeBlock && trimmedLine.startsWith('# ') && !board.title) {
        board.title = trimmedLine.substring(2).trim();
        this.finalizeCurrentTask(currentTask, currentColumn);
        currentTask = null;
        inTaskContent = false;
        taskIndentLevel = -1;
        continue;
      }

      // Parse column title
      if (!inCodeBlock && trimmedLine.startsWith('## ')) {
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
        inTaskContent = false;
        taskIndentLevel = -1;
        continue;
      }

      // Parse task title (### or top-level -)
      if (!inCodeBlock && this.isTaskTitle(line, trimmedLine)) {
        this.finalizeCurrentTask(currentTask, currentColumn);

        if (currentColumn) {
          let taskTitle = '';
          
          if (trimmedLine.startsWith('### ')) {
            taskTitle = trimmedLine.substring(4).trim();
            taskIndentLevel = -1; // ### tasks don't have indent-based content
          } else {
            taskTitle = trimmedLine.substring(2).trim();
            taskIndentLevel = currentIndentLevel;
            // Remove checkbox markers if present
            if (taskTitle.startsWith('[ ] ') || taskTitle.startsWith('[x] ')) {
              taskTitle = taskTitle.substring(4).trim();
            }
          }

          currentTask = {
            id: this.generateId(),
            title: taskTitle,
            description: ''
          };
          inTaskContent = true;
        }
        continue;
      }

      // Parse task properties and description (anything indented under the task)
      if (!inCodeBlock && currentTask && inTaskContent) {
        // For ### tasks, only process lines that start with at least 2 spaces
        // For - tasks, process lines that are indented more than the task line
        const isIndentedContent = taskIndentLevel === -1 
          ? line.startsWith('  ') // For ### tasks
          : currentIndentLevel > taskIndentLevel; // For - tasks

        if (isIndentedContent) {
          // Check if it's a known property
          if (this.parseTaskProperty(line, currentTask)) {
            continue;
          }
          
          // Check if it's the start of a code block
          if (line.match(/^\s+```md/)) {
            inCodeBlock = true;
            continue;
          }
          
          // Otherwise, treat it as part of the description
          // Remove the indentation relative to the task
          let cleanLine = '';
          if (taskIndentLevel === -1) {
            // For ### tasks, remove at least 2 spaces
            cleanLine = line.replace(/^  /, '');
          } else {
            // For - tasks, remove the extra indentation
            const spacesToRemove = currentIndentLevel - taskIndentLevel - 2;
            if (spacesToRemove > 0) {
              cleanLine = line.substring(spacesToRemove);
            } else {
              cleanLine = line.trimStart();
            }
          }
          
          // Add to description
          currentTask.description = currentTask.description 
            ? currentTask.description + '\n' + cleanLine
            : cleanLine;
          continue;
        }
      }

      // Handle empty lines
      if (trimmedLine === '') {
        if (currentTask && inTaskContent) {
          // Add empty line to description to preserve formatting
          currentTask.description = currentTask.description 
            ? currentTask.description + '\n'
            : '';
        }
        continue;
      }

      // If we reach here with a current task, and the line is not indented, end the task
      if (!inCodeBlock && currentTask && inTaskContent) {
        const isIndentedContent = taskIndentLevel === -1 
          ? line.startsWith('  ')
          : currentIndentLevel > taskIndentLevel;
          
        if (!isIndentedContent) {
          this.finalizeCurrentTask(currentTask, currentColumn);
          currentTask = null;
          inTaskContent = false;
          taskIndentLevel = -1;
          i--; // Re-process this line
        }
      }
    }

    // Add final task and column
    this.finalizeCurrentTask(currentTask, currentColumn);
    if (currentColumn) {
      board.columns.push(currentColumn);
    }

    return board;
  }

  private static isTaskTitle(line: string, trimmedLine: string): boolean {
    // Task titles are either ### headers or top-level - items
    // Exclude property lines
    if (line.startsWith('  ')) {
      return false;
    }
    
    if (trimmedLine.startsWith('### ')) {
      return true;
    }
    
    if (line.startsWith('- ') && !line.match(/^\s*- (due|tags|priority|workload|defaultExpanded):/)) {
      return true;
    }
    
    return false;
  }

  private static parseTaskProperty(line: string, task: KanbanTask): boolean {
    const propertyMatch = line.match(/^\s+- (due|tags|priority|workload|defaultExpanded):\s*(.*)$/);
    if (!propertyMatch) return false;

    const [, propertyName, propertyValue] = propertyMatch;
    const value = propertyValue.trim();

    switch (propertyName) {
      case 'due':
        task.dueDate = value;
        break;
      case 'tags':
        const tagsMatch = value.match(/\[(.*)\]/);
        if (tagsMatch) {
          task.tags = tagsMatch[1].split(',').map(tag => tag.trim());
        }
        break;
      case 'priority':
        if (['low', 'medium', 'high'].includes(value)) {
          task.priority = value as 'low' | 'medium' | 'high';
        }
        break;
      case 'workload':
        if (['Easy', 'Normal', 'Hard', 'Extreme'].includes(value)) {
          task.workload = value as 'Easy' | 'Normal' | 'Hard' | 'Extreme';
        }
        break;
      case 'defaultExpanded':
        task.defaultExpanded = value.toLowerCase() === 'true';
        break;
    }
    return true;
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
        if (taskHeaderFormat === 'title') {
          markdown += `### ${task.title}\n\n`;
        } else {
          markdown += `- ${task.title}\n`;
        }

        // Add task properties
        markdown += this.generateTaskProperties(task);

        // Add description
        if (task.description && task.description.trim() !== '') {
          markdown += `    \`\`\`md\n`;
          const descriptionLines = task.description.trim().split('\n');
          for (const descLine of descriptionLines) {
            markdown += `    ${descLine}\n`;
          }
          markdown += `    \`\`\`\n`;
        }

        markdown += '\n';
      }
    }
    return markdown;
  }

  private static generateTaskProperties(task: KanbanTask): string {
    let properties = '';

    if (task.dueDate) {
      properties += `  - due: ${task.dueDate}\n`;
    }
    if (task.tags && task.tags.length > 0) {
      properties += `  - tags: [${task.tags.join(', ')}]\n`;
    }
    if (task.priority) {
      properties += `  - priority: ${task.priority}\n`;
    }
    if (task.workload) {
      properties += `  - workload: ${task.workload}\n`;
    }
    if (task.defaultExpanded !== undefined) {
      properties += `  - defaultExpanded: ${task.defaultExpanded}\n`;
    }

    return properties;
  }
}