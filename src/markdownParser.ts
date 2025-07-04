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
  steps?: Array<{ text: string; completed: boolean }>;
}

export interface KanbanColumn {
  id: string;
  title: string;
  tasks: KanbanTask[];
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
    let inTaskProperties = false;
    let inTaskDescription = false;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // 检查代码块标记
      if (trimmedLine.startsWith('```')) {
        if (inTaskDescription) {
          if (trimmedLine === '```md' || trimmedLine === '```') {
            inCodeBlock = !inCodeBlock;
            continue;
          }
        }
      }

      // 如果在代码块内部，处理为描述内容
      if (inCodeBlock && inTaskDescription && currentTask) {
        if (trimmedLine === '```') {
          inCodeBlock = false;
          inTaskDescription = false;
          continue;
        } else {
          const cleanLine = line.replace(/^\s{4,}/, '');
          currentTask.description = currentTask.description 
            ? currentTask.description + '\n' + cleanLine
            : cleanLine;
        }
        continue;
      }

      // 解析看板标题
      if (!inCodeBlock && trimmedLine.startsWith('# ') && !board.title) {
        board.title = trimmedLine.substring(2).trim();
        this.finalizeCurrentTask(currentTask, currentColumn);
        currentTask = null;
        inTaskProperties = false;
        inTaskDescription = false;
        continue;
      }

      // 解析列标题
      if (!inCodeBlock && trimmedLine.startsWith('## ')) {
        this.finalizeCurrentTask(currentTask, currentColumn);
        currentTask = null;
        if (currentColumn) {
          board.columns.push(currentColumn);
        }
        currentColumn = {
          id: this.generateId(),
          title: trimmedLine.substring(3).trim(),
          tasks: []
        };
        inTaskProperties = false;
        inTaskDescription = false;
        continue;
      }

      // 解析任务标题
      if (!inCodeBlock && this.isTaskTitle(line, trimmedLine)) {
        this.finalizeCurrentTask(currentTask, currentColumn);

        if (currentColumn) {
          let taskTitle = '';
          
          if (trimmedLine.startsWith('### ')) {
            taskTitle = trimmedLine.substring(4).trim();
          } else {
            taskTitle = trimmedLine.substring(2).trim();
            // 移除复选框标记
            if (taskTitle.startsWith('[ ] ') || taskTitle.startsWith('[x] ')) {
              taskTitle = taskTitle.substring(4).trim();
            }
          }

          currentTask = {
            id: this.generateId(),
            title: taskTitle,
            description: ''
          };
          inTaskProperties = true;
          inTaskDescription = false;
        }
        continue;
      }

      // 解析任务属性
      if (!inCodeBlock && currentTask && inTaskProperties) {
        if (this.parseTaskProperty(line, currentTask)) {
          continue;
        }
        
        // 解析 steps 中的具体步骤项
        if (this.parseTaskStep(line, currentTask)) {
          continue;
        }
        
        // 检查是否开始描述部分
        if (line.match(/^\s+```md/)) {
          inTaskProperties = false;
          inTaskDescription = true;
          inCodeBlock = true;
          continue;
        }
      }

      // 处理空行
      if (trimmedLine === '') {
        continue;
      }

      // 结束当前任务
      if (!inCodeBlock && currentTask && (inTaskProperties || inTaskDescription)) {
        this.finalizeCurrentTask(currentTask, currentColumn);
        currentTask = null;
        inTaskProperties = false;
        inTaskDescription = false;
        i--;
      }
    }

    // 添加最后的任务和列
    this.finalizeCurrentTask(currentTask, currentColumn);
    if (currentColumn) {
      board.columns.push(currentColumn);
    }

    return board;
  }

  private static isTaskTitle(line: string, trimmedLine: string): boolean {
    // 排除属性行和步骤项
    if (line.startsWith('- ') && 
        (trimmedLine.match(/^\s*- (due|tags|priority|workload|steps|defaultExpanded):/) ||
         line.match(/^\s{6,}- \[([ x])\]/))) {
      return false;
    }
    
    return (line.startsWith('- ') && !line.startsWith('  ')) || 
           trimmedLine.startsWith('### ');
  }

  private static parseTaskProperty(line: string, task: KanbanTask): boolean {
    const propertyMatch = line.match(/^\s+- (due|tags|priority|workload|steps|defaultExpanded):\s*(.*)$/);
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
      case 'steps':
        task.steps = [];
        break;
    }
    return true;
  }

  private static parseTaskStep(line: string, task: KanbanTask): boolean {
    if (!task.steps) return false;
    
    const stepMatch = line.match(/^\s{6,}- \[([ x])\]\s*(.*)$/);
    if (!stepMatch) return false;

    const [, checkmark, text] = stepMatch;
    task.steps.push({ 
      text: text.trim(), 
      completed: checkmark === 'x' 
    });
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
      markdown += `## ${column.title}\n\n`;

      for (const task of column.tasks) {
        if (taskHeaderFormat === 'title') {
          markdown += `### ${task.title}\n\n`;
        } else {
          markdown += `- ${task.title}\n`;
        }

        // 添加任务属性
        markdown += this.generateTaskProperties(task);

        // 添加描述
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
    if (task.steps && task.steps.length > 0) {
      properties += `  - steps:\n`;
      for (const step of task.steps) {
        const checkbox = step.completed ? '[x]' : '[ ]';
        properties += `      - ${checkbox} ${step.text}\n`;
      }
    }

    return properties;
  }
}