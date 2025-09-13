import { IdGenerator } from './utils/idGenerator';
import * as fs from 'fs';
import * as path from 'path';

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
  // Runtime-only ID generation - no persistence to markdown

  /**
   * Process include statements in markdown content
   * !!!include(filepath)!!! -> content of the file
   */
  static processIncludes(content: string, basePath: string): { content: string, includedFiles: string[] } {
    const INCLUDE_RE = /!!!include\(([^)]+)\)!!!/gi;
    let result = content;
    const includedFiles: string[] = [];

    // Simple single-pass processing to avoid recursion issues
    const matches = [...content.matchAll(INCLUDE_RE)];

    for (const match of matches) {
      const fullMatch = match[0];
      const filePath = match[1].trim();

      try {
        // Resolve the file path relative to the base path
        const absolutePath = path.resolve(basePath, filePath);

        // Check if file exists
        if (fs.existsSync(absolutePath)) {
          // Track this file as included
          includedFiles.push(absolutePath);

          // Read the file content
          const includeContent = fs.readFileSync(absolutePath, 'utf8');

          // Add 2 spaces indentation to each line to make it card content
          const indentedContent = includeContent
            .split('\n')
            .map(line => line.length > 0 ? '  ' + line : line)
            .join('\n');

          // Replace the include statement with the indented file content
          result = result.replace(fullMatch, indentedContent);
        } else {
          console.warn(`Include file not found: ${absolutePath}`);
          result = result.replace(fullMatch, `<!-- Include file not found: ${filePath} -->`);
        }
      } catch (error) {
        console.error(`Error processing include ${filePath}:`, error);
        result = result.replace(fullMatch, `<!-- Error processing include: ${filePath} -->`);
      }
    }

    return { content: result, includedFiles };
  }

  static parseMarkdown(content: string, basePath?: string): { board: KanbanBoard, includedFiles: string[] } {
      // Process includes if basePath is provided
      let processedContent = content;
      let includedFiles: string[] = [];

      if (basePath) {
        try {
          const includeResult = this.processIncludes(content, basePath);
          processedContent = includeResult.content;
          includedFiles = includeResult.includedFiles;
        } catch (error) {
          console.error('Error processing includes:', error);
          // Fall back to original content if include processing fails
          processedContent = content;
        }
      }

      const lines = processedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
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
      let columnIndex = 0;  // Add counter for columns
      let taskIndexInColumn = 0;  // Add counter for tasks within column

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
            board.valid = board.yamlHeader.includes('kanban-plugin: board');
            if (!board.valid) {
              return { board, includedFiles };
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

        // Parse column with runtime UUID generation
        if (line.startsWith('## ')) {
          if (collectingDescription) {
            this.finalizeCurrentTask(currentTask, currentColumn);
            collectingDescription = false;
          }
          currentTask = null;
          if (currentColumn) {
            board.columns.push(currentColumn);
          }
          
          const columnTitle = line.substring(3);
          
          currentColumn = {
            id: IdGenerator.generateColumnId(),
            title: columnTitle,
            tasks: []
          };
          
          columnIndex++;
          taskIndexInColumn = 0;  // Reset task counter for new column
          continue;
        }

        // Parse task with runtime UUID generation
        if (line.startsWith('- ')) {
          if (collectingDescription) {
            this.finalizeCurrentTask(currentTask, currentColumn);
            collectingDescription = false;
          }

          if (currentColumn) {
            const taskTitle = line.substring(6);
            
            currentTask = {
              id: IdGenerator.generateTaskId(),
              title: taskTitle,
              description: ''
            };
            
            taskIndexInColumn++;
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

      return { board, includedFiles };
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

    // Add columns (no ID persistence - runtime only)
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