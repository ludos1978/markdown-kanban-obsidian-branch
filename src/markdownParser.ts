import { IdGenerator } from './utils/idGenerator';
import { PresentationParser } from './presentationParser';
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
  includeMode?: boolean;  // When true, tasks are generated from included files
  includeFiles?: string[]; // Paths to included presentation files
  originalTitle?: string;  // Original title before include processing
  displayTitle?: string;   // Cleaned title for display (without include syntax)
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


  static parseMarkdown(content: string, basePath?: string): { board: KanbanBoard, includedFiles: string[], columnIncludeFiles: string[] } {
      // First parse with original content to preserve raw descriptions
      const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

      // Detect all include files in the content
      let includedFiles: string[] = [];
      const includeRegex = /!!!include\(([^)]+)\)!!!/gi;
      let match;
      while ((match = includeRegex.exec(content)) !== null) {
          const includeFile = match[1].trim();
          if (!includedFiles.includes(includeFile)) {
              includedFiles.push(includeFile);
              console.log(`[Parser] Found include file: ${includeFile}`);
          }
      }

      // Detect column include files in column titles
      let columnIncludeFiles: string[] = [];
      const columnIncludeRegex = /!!!columninclude\(([^)]+)\)!!!/gi;
      while ((match = columnIncludeRegex.exec(content)) !== null) {
          const includeFile = match[1].trim();
          if (!columnIncludeFiles.includes(includeFile)) {
              columnIncludeFiles.push(includeFile);
              console.log(`[Parser] Found column include file: ${includeFile}`);
          }
      }
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
              return { board, includedFiles, columnIncludeFiles };
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

          // Check for column include syntax
          const columnIncludeMatches = columnTitle.match(/!!!columninclude\(([^)]+)\)!!!/g);

          if (columnIncludeMatches && columnIncludeMatches.length > 0) {
            // This is a column include - process included files
            const includeFiles: string[] = [];
            columnIncludeMatches.forEach(match => {
              const filePath = match.replace(/!!!columninclude\(([^)]+)\)!!!/, '$1').trim();
              includeFiles.push(filePath);
            });

            // Generate tasks from included files
            const includeTasks: KanbanTask[] = [];
            for (const filePath of includeFiles) {
              const resolvedPath = basePath ? path.resolve(basePath, filePath) : filePath;
              try {
                if (fs.existsSync(resolvedPath)) {
                  const fileContent = fs.readFileSync(resolvedPath, 'utf8');
                  const slideTasks = PresentationParser.parseMarkdownToTasks(fileContent);
                  includeTasks.push(...slideTasks);
                  console.log(`[Parser] Processed column include: ${filePath} (${slideTasks.length} slides)`);
                } else {
                  console.warn(`[Parser] Column include file not found: ${resolvedPath}`);
                }
              } catch (error) {
                console.error(`[Parser] Error processing column include ${filePath}:`, error);
              }
            }

            // Clean title from include syntax for display
            let displayTitle = columnTitle;
            columnIncludeMatches.forEach(match => {
              displayTitle = displayTitle.replace(match, '').trim();
            });

            // Use filename as title if no display title provided
            if (!displayTitle && includeFiles.length > 0) {
              displayTitle = path.basename(includeFiles[0], path.extname(includeFiles[0]));
            }

            currentColumn = {
              id: IdGenerator.generateColumnId(),
              title: columnTitle, // Keep full title with include syntax for editing
              tasks: includeTasks,
              includeMode: true,
              includeFiles: includeFiles,
              originalTitle: columnTitle,
              displayTitle: displayTitle || 'Included Column' // Store cleaned title for display
            };
          } else {
            // Regular column
            currentColumn = {
              id: IdGenerator.generateColumnId(),
              title: columnTitle,
              tasks: []
            };
          }

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

          if (currentColumn && !currentColumn.includeMode) {
            // Only parse tasks for non-include columns
            const taskTitle = line.substring(6);

            currentTask = {
              id: IdGenerator.generateTaskId(),
              title: taskTitle,
              description: ''
            };

            taskIndexInColumn++;
            collectingDescription = true;
          } else if (currentColumn && currentColumn.includeMode) {
            // For include columns, skip task parsing as tasks are already generated
            currentTask = null;
            collectingDescription = false;
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

          // Store description (frontend will handle include processing)
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


      return { board, includedFiles, columnIncludeFiles };
  }

  private static finalizeCurrentTask(task: KanbanTask | null, column: KanbanColumn | null): void {
    if (!task || !column) {return;}

    // Clean up description
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
      if (column.includeMode) {
        // For include columns, use the current title (which may have been updated with tags)
        // column.title should contain the include syntax plus any added tags
        const titleToUse = column.title;
        markdown += `## ${titleToUse}\n`;
        // Skip generating tasks for include columns - they remain as includes
      } else {
        // Regular column processing
        markdown += `## ${column.title}\n`;

        for (const task of column.tasks) {
          markdown += `- [ ] ${task.title}\n`;

          // Add description with proper indentation
          const descriptionToUse = task.description;
          if (descriptionToUse && descriptionToUse.trim() !== '') {
            const descriptionLines = descriptionToUse.split('\n');
            for (const descLine of descriptionLines) {
              markdown += `  ${descLine}\n`;
            }
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