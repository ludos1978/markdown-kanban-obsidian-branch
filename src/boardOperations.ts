import { KanbanBoard, KanbanColumn, KanbanTask } from './markdownParser';
import { IdGenerator } from './utils/idGenerator';

export class BoardOperations {
    private _originalTaskOrder: Map<string, string[]> = new Map();

    private generateId(type: 'column' | 'task', parentId?: string): string {
        // Use new UUID-based ID system for consistency
        if (type === 'column') {
            return IdGenerator.generateColumnId();
        } else {
            return IdGenerator.generateTaskId();
        }
    }

    public setOriginalTaskOrder(board: KanbanBoard) {
        this._originalTaskOrder.clear();
        board.columns.forEach(column => {
            this._originalTaskOrder.set(column.id, column.tasks.map(t => t.id));
        });
    }

    private findColumn(board: KanbanBoard, columnId: string): KanbanColumn | undefined {
        return board.columns.find(col => col.id === columnId);
    }

    private findTask(board: KanbanBoard, columnId: string, taskId: string): { column: KanbanColumn; task: KanbanTask; index: number } | undefined {
        const column = this.findColumn(board, columnId);
        if (!column) {return undefined;}

        const taskIndex = column.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) {return undefined;}

        return {
            column,
            task: column.tasks[taskIndex],
            index: taskIndex
        };
    }

    // Task operations
    public moveTask(board: KanbanBoard, taskId: string, fromColumnId: string, toColumnId: string, newIndex: number): boolean {
        const fromColumn = this.findColumn(board, fromColumnId);
        const toColumn = this.findColumn(board, toColumnId);

        if (!fromColumn || !toColumn) {return false;}

        const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) {return false;}

        const task = fromColumn.tasks.splice(taskIndex, 1)[0];
        toColumn.tasks.splice(newIndex, 0, task);
        return true;
    }

    public addTask(board: KanbanBoard, columnId: string, taskData: any): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}

        const newTask: KanbanTask = {
            id: this.generateId('task', columnId),
            title: taskData.title || '',
            description: taskData.description || ''
        };

        column.tasks.push(newTask);
        return true;
    }

    public addTaskAtPosition(board: KanbanBoard, columnId: string, taskData: any, insertionIndex: number): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}

        const newTask: KanbanTask = {
            id: this.generateId('task', columnId),
            title: taskData.title || '',
            description: taskData.description || ''
        };

        if (insertionIndex >= 0 && insertionIndex <= column.tasks.length) {
            column.tasks.splice(insertionIndex, 0, newTask);
        } else {
            column.tasks.push(newTask);
        }
        return true;
    }

    public deleteTask(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}

        const taskIndex = column.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) {return false;}

        column.tasks.splice(taskIndex, 1);
        return true;
    }

    public editTask(board: KanbanBoard, taskId: string, columnId: string, taskData: Partial<KanbanTask>): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}

        const task = column.tasks.find(t => t.id === taskId);
        if (!task) {return false;}

        // Update task properties
        if (taskData.title !== undefined) {
            task.title = taskData.title;
        }
        if (taskData.description !== undefined) {
            task.description = taskData.description;
        }

        return true;
    }

    public duplicateTask(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result) {return false;}

        const newTask: KanbanTask = {
            id: this.generateId('task', columnId),
            title: result.task.title,
            description: result.task.description
        };

        result.column.tasks.splice(result.index + 1, 0, newTask);
        return true;
    }

    public insertTaskBefore(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result) {return false;}

        const newTask: KanbanTask = {
            id: this.generateId('task', columnId),
            title: '',
            description: ''
        };

        result.column.tasks.splice(result.index, 0, newTask);
        return true;
    }

    public insertTaskAfter(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result) {return false;}

        const newTask: KanbanTask = {
            id: this.generateId('task', columnId),
            title: '',
            description: ''
        };

        result.column.tasks.splice(result.index + 1, 0, newTask);
        return true;
    }

    public moveTaskToTop(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === 0) {return false;}

        const task = result.column.tasks.splice(result.index, 1)[0];
        result.column.tasks.unshift(task);
        return true;
    }

    public moveTaskUp(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === 0) {return false;}

        const task = result.column.tasks[result.index];
        result.column.tasks[result.index] = result.column.tasks[result.index - 1];
        result.column.tasks[result.index - 1] = task;
        return true;
    }

    public moveTaskDown(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === result.column.tasks.length - 1) {return false;}

        const task = result.column.tasks[result.index];
        result.column.tasks[result.index] = result.column.tasks[result.index + 1];
        result.column.tasks[result.index + 1] = task;
        return true;
    }

    public moveTaskToBottom(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === result.column.tasks.length - 1) {return false;}

        const task = result.column.tasks.splice(result.index, 1)[0];
        result.column.tasks.push(task);
        return true;
    }

    public moveTaskToColumn(board: KanbanBoard, taskId: string, fromColumnId: string, toColumnId: string): boolean {
        const fromColumn = this.findColumn(board, fromColumnId);
        const toColumn = this.findColumn(board, toColumnId);

        if (!fromColumn || !toColumn) {return false;}

        const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) {return false;}

        const task = fromColumn.tasks.splice(taskIndex, 1)[0];
        toColumn.tasks.push(task);
        return true;
    }

    // Column operations
    public addColumn(board: KanbanBoard, title: string): boolean {
        const newColumn: KanbanColumn = {
            id: this.generateId('column'),
            title: title,
            tasks: []
        };

        board.columns.push(newColumn);
        this._originalTaskOrder.set(newColumn.id, []);
        return true;
    }

    public moveColumn(board: KanbanBoard, fromIndex: number, toIndex: number, fromRow: number, toRow: number): boolean {
        if (fromIndex === toIndex) {return false;}

        const columns = board.columns;
        const column = columns.splice(fromIndex, 1)[0];
        columns.splice(toIndex, 0, column);
        return true;
    }

    public deleteColumn(board: KanbanBoard, columnId: string): boolean {
        const index = board.columns.findIndex(col => col.id === columnId);
        if (index === -1) {return false;}

        board.columns.splice(index, 1);
        this._originalTaskOrder.delete(columnId);
        return true;
    }

    public insertColumnBefore(board: KanbanBoard, columnId: string, title: string): boolean {
        const index = board.columns.findIndex(col => col.id === columnId);
        if (index === -1) {return false;}

        const newColumn: KanbanColumn = {
            id: this.generateId('column'),
            title: title,
            tasks: []
        };

        board.columns.splice(index, 0, newColumn);
        this._originalTaskOrder.set(newColumn.id, []);
        return true;
    }

    public insertColumnAfter(board: KanbanBoard, columnId: string, title: string): boolean {
        const index = board.columns.findIndex(col => col.id === columnId);
        if (index === -1) {return false;}

        const newColumn: KanbanColumn = {
            id: this.generateId('column'),
            title: title,
            tasks: []
        };

        board.columns.splice(index + 1, 0, newColumn);
        this._originalTaskOrder.set(newColumn.id, []);
        return true;
    }

    public editColumnTitle(board: KanbanBoard, columnId: string, title: string): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}

        // Simply save the title as provided - all tag handling is done in frontend
        column.title = title;

        // Check for column include syntax changes
        const columnIncludeMatches = column.title.match(/!!!columninclude\(([^)]+)\)!!!/g);

        if (columnIncludeMatches && columnIncludeMatches.length > 0) {
            // Extract new include files from the title
            const newIncludeFiles: string[] = [];
            columnIncludeMatches.forEach(match => {
                const filePath = match.replace(/!!!columninclude\(([^)]+)\)!!!/, '$1').trim();
                newIncludeFiles.push(filePath);
            });

            // Update include mode properties
            column.includeMode = true;
            column.includeFiles = newIncludeFiles;
            column.originalTitle = column.title;

            // Generate display title without include syntax
            let displayTitle = column.title;
            columnIncludeMatches.forEach(match => {
                displayTitle = displayTitle.replace(match, '').trim();
            });

            // If no display title provided, use filename as title
            if (!displayTitle && newIncludeFiles.length > 0) {
                const path = require('path');
                displayTitle = path.basename(newIncludeFiles[0], path.extname(newIncludeFiles[0]));
            }

            column.displayTitle = displayTitle || 'Included Column';

            console.log(`[BoardOperations] Updated include files for column "${column.title}": [${newIncludeFiles.join(', ')}]`);
        } else if (column.includeMode) {
            // Title no longer contains include syntax - disable include mode
            column.includeMode = false;
            column.includeFiles = undefined;
            column.originalTitle = undefined;
            column.displayTitle = undefined;
            console.log(`[BoardOperations] Disabled include mode for column "${column.title}"`);
        }

        return true;
    }

    public sortColumn(board: KanbanBoard, columnId: string, sortType: 'unsorted' | 'title'): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}

        if (sortType === 'title') {
            column.tasks.sort((a, b) => {
                const titleA = a.title || '';
                const titleB = b.title || '';
                return titleA.localeCompare(titleB);
            });
        } else if (sortType === 'unsorted') {
            const originalOrder = this._originalTaskOrder.get(columnId);
            if (originalOrder) {
                const taskMap = new Map(column.tasks.map(t => [t.id, t]));
                column.tasks = [];
                
                originalOrder.forEach(taskId => {
                    const task = taskMap.get(taskId);
                    if (task) {
                        column.tasks.push(task);
                        taskMap.delete(taskId);
                    }
                });
                
                taskMap.forEach(task => {
                    column.tasks.push(task);
                });
            }
        }
        return true;
    }

    public reorderColumns(board: KanbanBoard, newOrder: string[], movedColumnId: string, targetRow: number): boolean {
        // Find the moved column
        const movedColumn = this.findColumn(board, movedColumnId);
        if (!movedColumn) {return false;}
        
        // Update row tag for the moved column
        let cleanTitle = movedColumn.title
            .replace(/#row\d+\b/gi, '')
            .replace(/\s+#row\d+/gi, '')
            .replace(/#row\d+\s+/gi, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
        
        if (targetRow > 1) {
            movedColumn.title = cleanTitle + ` #row${targetRow}`;
        } else {
            movedColumn.title = cleanTitle;
        }
        
        // Create a map of current columns
        const columnMap = new Map<string, KanbanColumn>();
        board.columns.forEach(col => columnMap.set(col.id, col));
        
        // Rebuild columns array in the new order
        const reorderedColumns: KanbanColumn[] = [];
        newOrder.forEach(id => {
            const col = columnMap.get(id);
            if (col) {
                reorderedColumns.push(col);
            }
        });
        
        // Replace the columns array
        board.columns = reorderedColumns;
        
        
        return true;
    }

    public moveColumnWithRowUpdate(board: KanbanBoard, columnId: string, newPosition: number, newRow: number): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) {return false;}
        
        // First, update the row tag in the title
        let cleanTitle = column.title
            .replace(/#row\d+\b/gi, '')  // Remove existing row tags
            .replace(/\s+#row\d+/gi, '') // Remove with preceding space
            .replace(/#row\d+\s+/gi, '')  // Remove with following space
            .replace(/\s{2,}/g, ' ')      // Clean up multiple spaces
            .trim();                      // Remove leading/trailing spaces
        
        // Add new row tag if not row 1
        if (newRow > 1) {
            column.title = cleanTitle + ` #row${newRow}`;
        } else {
            column.title = cleanTitle;
        }
        
        // Find current index of the column
        const currentIndex = board.columns.findIndex(col => col.id === columnId);
        if (currentIndex === -1) {return false;}
        
        // Build the desired order based on what calculateColumnNewPosition saw
        // We need to reconstruct what the frontend wants the order to be
        const targetOrder: string[] = [];
        
        // The newPosition tells us where this column should be in the final array
        // We need to build that final array
        board.columns.forEach((col, idx) => {
            if (idx !== currentIndex) {
                targetOrder.push(col.id);
            }
        });
        
        // Insert our column ID at the desired position
        targetOrder.splice(newPosition, 0, columnId);
        
        // Now reorder the columns array to match targetOrder
        const reorderedColumns: KanbanColumn[] = [];
        targetOrder.forEach(id => {
            const col = board.columns.find(c => c.id === id);
            if (col) {
                reorderedColumns.push(col);
            }
        });
        
        // Replace the columns array
        board.columns.length = 0;
        board.columns.push(...reorderedColumns);
        
        return true;
    }

    // Helper method to extract row number from column title
    public getColumnRow(column: KanbanColumn): number {
        if (!column.title) {return 1;}
        
        const rowMatch = column.title.match(/#row(\d+)\b/i);
        if (rowMatch) {
            const rowNum = parseInt(rowMatch[1]);
            return Math.min(Math.max(rowNum, 1), 4); // Clamp between 1 and 4
        }
        return 1;
    }

    // Helper method to clean duplicate row tags (for initialization)
    public cleanupRowTags(board: KanbanBoard): boolean {
        let modified = false;
        
        board.columns.forEach(column => {
            const originalTitle = column.title;
            
            // Find all row tags
            const rowTags = column.title.match(/#row\d+\b/gi) || [];
            
            if (rowTags.length > 1) {
                // Multiple row tags found - keep only the last one
                let cleanTitle = column.title;
                rowTags.forEach(tag => {
                    cleanTitle = cleanTitle.replace(new RegExp(tag, 'gi'), '');
                });
                cleanTitle = cleanTitle.replace(/\s{2,}/g, ' ').trim();
                
                // Add back only the last tag
                const lastTag = rowTags[rowTags.length - 1];
                column.title = cleanTitle + ' ' + lastTag;
                
                if (column.title !== originalTitle) {
                    modified = true;
                }
            }
        });
        
        return modified;
    }

    private extractDate(text: string, dateType: string = 'due'): string | null {
        if (!text) {return null;}
        
        // Match shorthand format @YYYY-MM-DD or @DD-MM-YYYY (assumes it's a due date)
        if (dateType === 'due') {
            const shortMatch = text.match(/@(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})(?:\s|$)/);
            if (shortMatch) {
                const dateStr = shortMatch[1];
                // Convert DD-MM-YYYY to YYYY-MM-DD for comparison
                if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    const parts = dateStr.split('-');
                    return `${parts[2]}-${parts[1]}-${parts[0]}`;
                }
                return dateStr;
            }
        }
        
        // Match typed format @type:date (e.g., @due:2025-03-27, @done:2025-03-27)
        const typedRegex = new RegExp(`@${dateType}:(\\d{4}-\\d{2}-\\d{2}|\\d{2}-\\d{2}-\\d{4})(?:\\s|$)`);
        const typedMatch = text.match(typedRegex);
        if (typedMatch) {
            const dateStr = typedMatch[1];
            // Convert DD-MM-YYYY to YYYY-MM-DD for comparison
            if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const parts = dateStr.split('-');
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            return dateStr;
        }
        
        return null;
    }

    private hasSticky(text: string): boolean {
        if (!text) {return false;}
        return /@sticky(?:\s|$)/.test(text);
    }

    // Add this method to extract person names from text
    private extractPersonNames(text: string): string[] {
        if (!text) {return [];}
        const matches = text.match(/@([a-zA-Z0-9_&-]+)/g) || [];
        // Filter out dates
        return matches
            .map(m => m.substring(1))
            .filter(m => !m.match(/^\d{4}-\d{2}-\d{2}$/) && !m.match(/^\d{2}-\d{2}-\d{4}$/));
    }

    // Add this method to get today's date in YYYY-MM-DD format
    private getTodayString(): string {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Add this method to check if a date is within N days
    private isWithinDays(dateStr: string, days: number): boolean {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const futureDate = new Date(today);
        futureDate.setDate(futureDate.getDate() + days);
        
        return date >= today && date <= futureDate;
    }

    // Add this method to check if a date is overdue
    private isOverdue(dateStr: string): boolean {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        
        return date < today;
    }





    // Main sort method
    public performAutomaticSort(board: KanbanBoard): boolean {
        if (!board || !board.columns) {return false;}
        
        // Track sticky tasks that shouldn't move
        const stickyTasks = new Set<string>();
        
        // First, identify all sticky tasks
        board.columns.forEach(column => {
            column.tasks.forEach(task => {
                const taskText = `${task.title || ''} ${task.description || ''}`;
                if (this.hasSticky(taskText)) {
                    stickyTasks.add(task.id);
                }
            });
        });
        
        // Collect gather rules separated by type
        const gatherRules: Array<{
            column: KanbanColumn,
            expression: string
        }> = [];
        
        const ungatheredRules: Array<{
            column: KanbanColumn
        }> = [];
        
        // Collect all rules from columns in order
        board.columns.forEach(column => {
            if (!column.title) {return;}
            
            // Extract gather and ungathered tags
            const matches = column.title.match(/#(gather_[a-zA-Z0-9_&|=><!\-]+|ungathered)/g) || [];
            matches.forEach(match => {
                const tag = match.substring(1);
                if (tag === 'ungathered') {
                    // Store ungathered rules separately
                    ungatheredRules.push({ column: column });
                } else if (tag.startsWith('gather_')) {
                    // Regular gather rules
                    gatherRules.push({
                        column: column,
                        expression: tag.substring(7)
                    });
                }
            });
        });
        
        // Track where each card will go
        const cardDestinations = new Map<string, KanbanColumn>();
        // Track which cards have been matched by gather rules
        const matchedCards = new Set<string>();
        
        // FIRST PASS: Process each card against all regular gather rules
        board.columns.forEach(sourceColumn => {
            sourceColumn.tasks.forEach(task => {
                // Skip sticky tasks
                if (stickyTasks.has(task.id)) {
                    return;
                }
                
                const taskText = `${task.title || ''} ${task.description || ''}`;
                const taskDate = this.extractDate(taskText);
                const personNames = this.extractPersonNames(taskText);
                
                // Check against each gather rule in order (first match wins)
                for (const rule of gatherRules) {
                    const evaluator = this.parseGatherExpression(rule.expression);
                    if (evaluator(taskText, taskDate, personNames)) {
                        cardDestinations.set(task.id, rule.column);
                        matchedCards.add(task.id);
                        break; // First match wins
                    }
                }
            });
        });
        
        // SECOND PASS: Process ungathered rules (for cards with @ tags that weren't matched)
        if (ungatheredRules.length > 0) {
            board.columns.forEach(sourceColumn => {
                sourceColumn.tasks.forEach(task => {
                    // Skip sticky tasks
                    if (stickyTasks.has(task.id)) {
                        return;
                    }
                    
                    // Skip if already matched by a gather rule
                    if (matchedCards.has(task.id)) {
                        return;
                    }
                    
                    const taskText = `${task.title || ''} ${task.description || ''}`;
                    const taskDate = this.extractDate(taskText);
                    const personNames = this.extractPersonNames(taskText);
                    const hasAnyAtTag = taskDate !== null || personNames.length > 0;
                    
                    // If has @ tags but wasn't gathered, apply first ungathered rule
                    if (hasAnyAtTag) {
                        // Use the first ungathered column found
                        cardDestinations.set(task.id, ungatheredRules[0].column);
                    }
                });
            });
        }
        
        // Now move all cards to their destinations
        cardDestinations.forEach((targetColumn, taskId) => {
            // Find the task and its current column
            let sourceColumn: KanbanColumn | null = null;
            let task: KanbanTask | null = null;
            let taskIndex = -1;
            
            for (const column of board.columns) {
                const index = column.tasks.findIndex(t => t.id === taskId);
                if (index !== -1) {
                    sourceColumn = column;
                    task = column.tasks[index];
                    taskIndex = index;
                    break;
                }
            }
            
            // Move the task if found and not already in target
            if (sourceColumn && task && sourceColumn.id !== targetColumn.id) {
                sourceColumn.tasks.splice(taskIndex, 1);
                targetColumn.tasks.push(task);
            }
        });
        
        // THIRD PASS: Apply sorting to columns with sort tags
        board.columns.forEach(column => {
            if (!column.title) {return;}
            
            const sortMatches = column.title.match(/#sort-([a-zA-Z]+)/g) || [];
            sortMatches.forEach(match => {
                const sortType = match.substring(6); // Remove '#sort-' prefix
                if (sortType === 'bydate') {
                    this.sortColumnByDate(column);
                } else if (sortType === 'byname') {
                    this.sortColumnByName(column);
                }
            });
        });
        
        return true;
    }



    // Parse gather expression into an evaluator function
    private parseGatherExpression(expr: string): (taskText: string, taskDate: string | null, personNames: string[]) => boolean {
        // Remove extra spaces and normalize
        expr = expr.trim();
        
        // Handle OR expressions (lowest precedence)
        if (expr.includes('|')) {
            const parts = this.splitByOperator(expr, '|');
            const subEvaluators = parts.map(part => this.parseGatherExpression(part));
            return (taskText, taskDate, personNames) => {
                return subEvaluators.some(evaluator => evaluator(taskText, taskDate, personNames));
            };
        }
        
        // Handle AND expressions (higher precedence)
        if (expr.includes('&')) {
            const parts = this.splitByOperator(expr, '&');
            const subEvaluators = parts.map(part => this.parseGatherExpression(part));
            return (taskText, taskDate, personNames) => {
                return subEvaluators.every(evaluator => evaluator(taskText, taskDate, personNames));
            };
        }
        
        // Handle NOT operator
        if (expr.startsWith('!')) {
            const subEvaluator = this.parseGatherExpression(expr.substring(1));
            return (taskText, taskDate, personNames) => !subEvaluator(taskText, taskDate, personNames);
        }
        
        // Handle inequality operators (!=)
        if (expr.includes('!=')) {
            const parts = expr.split('!=');
            if (parts.length === 2) {
                const [property, value] = parts.map(p => p.trim());
                return this.createComparisonEvaluator(property, '!=', value);
            }
        }
        
        // Handle comparison expressions: property<value, property>value, property=value
        const comparisonMatch = expr.match(/^([a-zA-Z0-9_-]+)([<>=])(.+)$/);
        if (comparisonMatch) {
            const [, property, operator, value] = comparisonMatch;
            return this.createComparisonEvaluator(property.trim(), operator, value.trim());
        }
        
        // Handle range expressions like 0<day, day<3
        const rangeMatch = expr.match(/^(-?\d+)([<>])([a-zA-Z]+)$/);
        if (rangeMatch) {
            const [, value, operator, property] = rangeMatch;
            // Flip operator for reverse notation
            const flippedOp = operator === '<' ? '>' : '<';
            return this.createComparisonEvaluator(property.trim(), flippedOp, value.trim());
        }
        
        // Default: treat as person name
        return (taskText, taskDate, personNames) => {
            return personNames.map(p => p.toLowerCase()).includes(expr.toLowerCase());
        };
    }

    // Add helper method to split by operator respecting nesting
    private splitByOperator(expr: string, operator: string): string[] {
        const parts: string[] = [];
        let current = '';
        let depth = 0;
        
        for (let i = 0; i < expr.length; i++) {
            const char = expr[i];
            
            if (char === '(') {depth++;}
            else if (char === ')') {depth--;}
            else if (char === operator && depth === 0) {
                if (current.trim()) {
                    parts.push(current.trim());
                    current = '';
                    continue;
                }
            }
            current += char;
        }
        
        if (current.trim()) {
            parts.push(current.trim());
        }
        
        return parts;
    }


    // In boardOperations.ts, replace the createComparisonEvaluator method:
    private createComparisonEvaluator(property: string, operator: string, value: string): 
        (taskText: string, taskDate: string | null, personNames: string[]) => boolean {
        
        // List of date-related properties
        const dateProperties = ['dayoffset', 'day', 'weekday', 'weekdaynum', 'month', 'monthnum'];
        const isDateProperty = dateProperties.includes(property.toLowerCase());
        
        if (isDateProperty) {
            return (taskText: string, taskDate: string | null, personNames: string[]) => {
                if (!taskDate) {return false;}
                
                const propValue = this.getDatePropertyValue(property.toLowerCase(), taskDate);
                if (propValue === null) {return false;}
                
                // For weekday string comparison
                if (property.toLowerCase() === 'weekday') {
                    const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                    if (weekdays.includes(value.toLowerCase())) {
                        if (operator === '=') {return propValue === value.toLowerCase();}
                        if (operator === '!=') {return propValue !== value.toLowerCase();}
                        return false;
                    }
                    // If value is a number, convert weekday to number
                    const weekdayNum = weekdays.indexOf(propValue as string);
                    const numValue = parseInt(value);
                    if (!isNaN(numValue)) {
                        switch (operator) {
                            case '=': return weekdayNum === numValue;
                            case '!=': return weekdayNum !== numValue;
                            case '<': return weekdayNum < numValue;
                            case '>': return weekdayNum > numValue;
                            default: return false;
                        }
                    }
                }
                
                // For month string comparison
                if (property.toLowerCase() === 'month') {
                    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                    if (months.includes(value.toLowerCase())) {
                        const monthNum = (propValue as number) - 1; // propValue is 1-12, array is 0-11
                        const targetMonth = months.indexOf(value.toLowerCase()) + 1;
                        switch (operator) {
                            case '=': return (propValue as number) === targetMonth;
                            case '!=': return (propValue as number) !== targetMonth;
                            case '<': return (propValue as number) < targetMonth;
                            case '>': return (propValue as number) > targetMonth;
                            default: return false;
                        }
                    }
                }
                
                // For numeric comparisons
                const numValue = parseInt(value);
                const numPropValue = typeof propValue === 'number' ? propValue : parseInt(propValue as string);
                
                switch (operator) {
                    case '=': return numPropValue === numValue;
                    case '!=': return numPropValue !== numValue;
                    case '<': return numPropValue < numValue;
                    case '>': return numPropValue > numValue;
                    default: return false;
                }
            };
        } else {
            // Treat property as a person name check
            return (taskText: string, taskDate: string | null, personNames: string[]) => {
                const hasPersonName = personNames.map(p => p.toLowerCase()).includes(property.toLowerCase());
                
                switch (operator) {
                    case '=':
                        return value === '1' || value === 'true' ? hasPersonName : !hasPersonName;
                    case '!=':
                        return value === '1' || value === 'true' ? !hasPersonName : hasPersonName;
                    default:
                        return hasPersonName;
                }
            };
        }
    }


    // Gather untagged - only cards with NO @ tags at all
    private gatherUntaggedToColumn(board: KanbanBoard, targetColumn: KanbanColumn, gatheredTasks: Set<string>): void {
        const tasksToMove: Array<{ task: KanbanTask, fromColumn: KanbanColumn }> = [];
        
        board.columns.forEach(sourceColumn => {
            if (sourceColumn.id === targetColumn.id) {return;}
            
            sourceColumn.tasks.forEach(task => {
                // Skip if already moved
                if (gatheredTasks.has(task.id)) {return;}
                
                const taskText = `${task.title || ''} ${task.description || ''}`;
                
                // Check if task has any @ tags
                const hasDateTag = this.extractDate(taskText) !== null;
                const hasPersonTags = this.extractPersonNames(taskText).length > 0;
                const hasAnyAtTag = hasDateTag || hasPersonTags;
                
                // Only gather if it has NO @ tags at all
                if (!hasAnyAtTag) {
                    tasksToMove.push({ task, fromColumn: sourceColumn });
                    gatheredTasks.add(task.id);
                }
            });
        });
        
        // Move the tasks
        tasksToMove.forEach(({ task, fromColumn }) => {
            const taskIndex = fromColumn.tasks.findIndex(t => t.id === task.id);
            if (taskIndex !== -1) {
                fromColumn.tasks.splice(taskIndex, 1);
                targetColumn.tasks.push(task);
            }
        });
    }

    // Gather unsorted - all remaining cards regardless of @ tags
    private gatherUnsortedToColumn(board: KanbanBoard, targetColumn: KanbanColumn, gatheredTasks: Set<string>): void {
        const tasksToMove: Array<{ task: KanbanTask, fromColumn: KanbanColumn }> = [];
        
        board.columns.forEach(sourceColumn => {
            if (sourceColumn.id === targetColumn.id) {return;}
            
            sourceColumn.tasks.forEach(task => {
                // Only move tasks that haven't been gathered yet
                if (!gatheredTasks.has(task.id)) {
                    tasksToMove.push({ task, fromColumn: sourceColumn });
                    gatheredTasks.add(task.id);
                }
            });
        });
        
        // Move the tasks
        tasksToMove.forEach(({ task, fromColumn }) => {
            const taskIndex = fromColumn.tasks.findIndex(t => t.id === task.id);
            if (taskIndex !== -1) {
                fromColumn.tasks.splice(taskIndex, 1);
                targetColumn.tasks.push(task);
            }
        });
    }








    // Helper method to check if a task matches a gather tag
    private taskMatchesGatherTag(task: KanbanTask, tag: string): boolean {
        const taskText = `${task.title || ''} ${task.description || ''}`;
        const taskDate = this.extractDate(taskText);
        const personNames = this.extractPersonNames(taskText);
        
        // Parse the tag to extract base and conditions
        const { baseTag, conditions } = this.parseGatherTag(tag);
        
        // Handle standard gather tags
        if (baseTag === 'gather_today' && taskDate === this.getTodayString()) {
            return true;
        } else if (baseTag === 'gather_next3days' && taskDate && this.isWithinDays(taskDate, 3)) {
            return true;
        } else if (baseTag === 'gather_next7days' && taskDate && this.isWithinDays(taskDate, 7)) {
            return true;
        } else if (baseTag === 'gather_overdue' && taskDate && this.isOverdue(taskDate)) {
            return true;
        } else if (baseTag === 'gather_dayoffset' || baseTag === 'gather_dayoffset') {
            // Handle dayoffset with conditions
            if (!taskDate) {return false;}
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const date = new Date(taskDate);
            date.setHours(0, 0, 0, 0);
            
            const dayOffset = Math.floor((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            
            // Check all conditions
            for (const condition of conditions) {
                let matches = false;
                const value = parseInt(condition.value);
                
                if (condition.operator === '=') {
                    matches = dayOffset === value;
                } else if (condition.operator === '>') {
                    matches = dayOffset > value;
                } else if (condition.operator === '<') {
                    matches = dayOffset < value;
                } else if (condition.operator === '|') {
                    // OR condition - check if dayOffset equals this value
                    matches = dayOffset === value;
                }
                
                if (matches) {return true;} // Any matching condition satisfies the gather
            }
            
            return false;
        } else if (baseTag.startsWith('gather_') && 
                !baseTag.match(/^gather_(today|next3days|next7days|overdue|dayoffset)$/)) {
            // Check for person name gathering
            const targetPerson = baseTag.substring(7); // Remove 'gather_' prefix
            return personNames.includes(targetPerson);
        }
        
        return false;
    }

    private parseGatherTag(tag: string): { 
        baseTag: string; 
        conditions: Array<{ operator: string; value: string }> 
    } {
        // Parse tags like gather_dayoffset=1|dayoffset=2
        const parts = tag.split(/([=|><])/);
        const baseTag = parts[0];
        const conditions: Array<{ operator: string; value: string }> = [];
        
        for (let i = 1; i < parts.length; i += 2) {
            if (i + 1 < parts.length) {
                conditions.push({
                    operator: parts[i],
                    value: parts[i + 1]
                });
            }
        }
        
        return { baseTag, conditions };
    }

    // Get date property value
    private getDatePropertyValue(property: string, dateStr: string | null): number | string | null {
        if (!dateStr) {return null;}
        
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        
        switch (property) {
            case 'dayoffset':
            case 'day':
                // Calculate days difference from today (can be negative for past dates)
                const diffTime = date.getTime() - today.getTime();
                return Math.round(diffTime / (1000 * 60 * 60 * 24));
                
            case 'weekday':
                // Return day name (sun, mon, tue, wed, etc.)
                const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                return days[date.getDay()];
                
            case 'weekdaynum':
                // Return 1-7 where Monday = 1, Sunday = 7
                const dayNum = date.getDay(); // 0 = Sunday
                return dayNum === 0 ? 7 : dayNum;
                
            case 'month':
                // Return month name (jan, feb, mar, etc.)
                const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                return months[date.getMonth()];
                
            case 'monthnum':
                // Return month number 1-12
                return date.getMonth() + 1;
                
            default:
                return null;
        }
    }


    // Sort column by date
    private sortColumnByDate(column: KanbanColumn): void {
        column.tasks.sort((a, b) => {
            const dateA = this.extractDate(`${a.title || ''} ${a.description || ''}`);
            const dateB = this.extractDate(`${b.title || ''} ${b.description || ''}`);
            
            // Tasks without dates go to the bottom
            if (!dateA && !dateB) {return 0;}
            if (!dateA) {return 1;}
            if (!dateB) {return -1;}
            
            return dateA.localeCompare(dateB);
        });
    }

    // Sort column by name
    private sortColumnByName(column: KanbanColumn): void {
        column.tasks.sort((a, b) => {
            const titleA = a.title || '';
            const titleB = b.title || '';
            return titleA.localeCompare(titleB);
        });
    }
}
