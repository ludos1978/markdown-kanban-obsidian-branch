import { KanbanBoard, KanbanColumn, KanbanTask } from './markdownParser';

export class BoardOperations {
    private _originalTaskOrder: Map<string, string[]> = new Map();

    private generateId(type: 'column' | 'task', parentId?: string): string {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        
        if (type === 'column') {
            return `col_${timestamp}_${random}`;
        } else {
            return `task_${parentId}_${timestamp}_${random}`;
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
        if (!column) return undefined;

        const taskIndex = column.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return undefined;

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

        if (!fromColumn || !toColumn) return false;

        const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return false;

        const task = fromColumn.tasks.splice(taskIndex, 1)[0];
        toColumn.tasks.splice(newIndex, 0, task);
        return true;
    }

    public addTask(board: KanbanBoard, columnId: string, taskData: any): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) return false;

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
        if (!column) return false;

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
        if (!column) return false;

        const taskIndex = column.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return false;

        column.tasks.splice(taskIndex, 1);
        return true;
    }

    public editTask(board: KanbanBoard, taskId: string, columnId: string, taskData: Partial<KanbanTask>): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) return false;

        const task = column.tasks.find(t => t.id === taskId);
        if (!task) return false;

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
        if (!result) return false;

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
        if (!result) return false;

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
        if (!result) return false;

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
        if (!result || result.index === 0) return false;

        const task = result.column.tasks.splice(result.index, 1)[0];
        result.column.tasks.unshift(task);
        return true;
    }

    public moveTaskUp(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === 0) return false;

        const task = result.column.tasks[result.index];
        result.column.tasks[result.index] = result.column.tasks[result.index - 1];
        result.column.tasks[result.index - 1] = task;
        return true;
    }

    public moveTaskDown(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === result.column.tasks.length - 1) return false;

        const task = result.column.tasks[result.index];
        result.column.tasks[result.index] = result.column.tasks[result.index + 1];
        result.column.tasks[result.index + 1] = task;
        return true;
    }

    public moveTaskToBottom(board: KanbanBoard, taskId: string, columnId: string): boolean {
        const result = this.findTask(board, columnId, taskId);
        if (!result || result.index === result.column.tasks.length - 1) return false;

        const task = result.column.tasks.splice(result.index, 1)[0];
        result.column.tasks.push(task);
        return true;
    }

    public moveTaskToColumn(board: KanbanBoard, taskId: string, fromColumnId: string, toColumnId: string): boolean {
        const fromColumn = this.findColumn(board, fromColumnId);
        const toColumn = this.findColumn(board, toColumnId);

        if (!fromColumn || !toColumn) return false;

        const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return false;

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
        if (fromIndex === toIndex) return false;

        const columns = board.columns;
        const column = columns.splice(fromIndex, 1)[0];
        columns.splice(toIndex, 0, column);
        return true;
    }

    public deleteColumn(board: KanbanBoard, columnId: string): boolean {
        const index = board.columns.findIndex(col => col.id === columnId);
        if (index === -1) return false;

        board.columns.splice(index, 1);
        this._originalTaskOrder.delete(columnId);
        return true;
    }

    public insertColumnBefore(board: KanbanBoard, columnId: string, title: string): boolean {
        const index = board.columns.findIndex(col => col.id === columnId);
        if (index === -1) return false;

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
        if (index === -1) return false;

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
        if (!column) return false;
        
        // Preserve the current row tag
        const currentRow = this.getColumnRow(column);
        
        // Clean the input title of any row tags the user might have accidentally included
        let cleanTitle = title
            .replace(/#row\d+\b/gi, '')  // Remove any row tags
            .replace(/\s+#row\d+/gi, '') // Remove with preceding space
            .replace(/#row\d+\s+/gi, '')  // Remove with following space
            .replace(/\s{2,}/g, ' ')      // Clean up multiple spaces
            .trim();                      // Remove leading/trailing spaces
        
        // Re-add the row tag if the column is not in row 1
        if (currentRow > 1) {
            column.title = cleanTitle + ` #row${currentRow}`;
        } else {
            column.title = cleanTitle;
        }
        
        return true;
    }

    public sortColumn(board: KanbanBoard, columnId: string, sortType: 'unsorted' | 'title'): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) return false;

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
        if (!movedColumn) return false;
        
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
        
        console.log('Reordered columns to:', reorderedColumns.map(c => c.id));
        
        return true;
    }

    public moveColumnWithRowUpdate(board: KanbanBoard, columnId: string, newPosition: number, newRow: number): boolean {
        const column = this.findColumn(board, columnId);
        if (!column) return false;
        
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
        if (currentIndex === -1) return false;
        
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
        if (!column.title) return 1;
        
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

    // Add this method to extract date from text
    private extractDate(text: string): string | null {
        if (!text) return null;
        // Match both YYYY-MM-DD and DD-MM-YYYY formats
        const match = text.match(/@(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})/);
        if (match) {
            const dateStr = match[1];
            // Convert DD-MM-YYYY to YYYY-MM-DD for comparison
            if (dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const parts = dateStr.split('-');
                return `${parts[2]}-${parts[1]}-${parts[0]}`;
            }
            return dateStr;
        }
        return null;
    }

    // Add this method to extract person names from text
    private extractPersonNames(text: string): string[] {
        if (!text) return [];
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
        if (!board || !board.columns) return false;
        
        // Track which tasks have been moved to avoid duplicates
        const movedTasks = new Set<string>();
        
        // First, identify all columns with gather tags and their requirements
        const gatherColumns: Array<{
            column: KanbanColumn,
            tags: string[]
        }> = [];
        
        board.columns.forEach(column => {
            if (!column.title) return;
            
            // Extract all gather and sort tags from column title - include & in gather tags
            const tags = column.title.match(/#(gather_[a-zA-Z0-9_&-]+|sort-[a-zA-Z0-9_-]+|ungathered|unsorted)/g) || [];
            if (tags.length > 0) {
                gatherColumns.push({
                    column: column,
                    tags: tags.map(t => t.substring(1)) // Remove #
                });
            }
        });
        
        // Process each column's tags in 3 passes to ensure proper priority
        
        // FIRST PASS: Process specific gather tags (like gather_john, gather_today, etc.)
        gatherColumns.forEach(({ column, tags }) => {
            tags.forEach(tag => {
                if (tag.startsWith('gather_') && 
                    tag !== 'gather_untagged') { // Don't process gather_untagged yet
                    // All specific gather tags (including combined conditions)
                    this.gatherToColumn(board, column, tag, movedTasks);
                }
            });
        });
        
        // SECOND PASS: Process ungathered (cards with @ tags that weren't gathered)
        gatherColumns.forEach(({ column, tags }) => {
            tags.forEach(tag => {
                if (tag === 'ungathered') {
                    this.gatherUngatheredToColumn(board, column, movedTasks);
                }
            });
        });
        
        // THIRD PASS: Process untagged and unsorted
        gatherColumns.forEach(({ column, tags }) => {
            tags.forEach(tag => {
                if (tag === 'gather_untagged') {
                    this.gatherUntaggedToColumn(board, column, movedTasks);
                } else if (tag === 'unsorted') {
                    this.gatherUnsortedToColumn(board, column, movedTasks);
                }
            });
        });
        
        // FOURTH PASS: Apply sorting to columns
        gatherColumns.forEach(({ column, tags }) => {
            tags.forEach(tag => {
                if (tag === 'sort-bydate') {
                    this.sortColumnByDate(column);
                } else if (tag === 'sort-byname') {
                    this.sortColumnByName(column);
                }
            });
        });
        
        return true;
    }

    // Gather unsorted tasks (all tasks not yet moved - regardless of @ tags)
    private gatherUnsortedToColumn(board: KanbanBoard, targetColumn: KanbanColumn, movedTasks: Set<string>): void {
        const tasksToMove: Array<{ task: KanbanTask, fromColumn: KanbanColumn }> = [];
        
        board.columns.forEach(sourceColumn => {
            if (sourceColumn.id === targetColumn.id) return;
            
            sourceColumn.tasks.forEach(task => {
                // Only move tasks that haven't been moved yet
                if (!movedTasks.has(task.id)) {
                    tasksToMove.push({ task, fromColumn: sourceColumn });
                    movedTasks.add(task.id);
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
            if (!taskDate) return false;
            
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
                
                if (matches) return true; // Any matching condition satisfies the gather
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


    // Gather tasks to a specific column based on tag
    private gatherToColumn(board: KanbanBoard, targetColumn: KanbanColumn, tag: string, movedTasks: Set<string>): void {
        const tasksToMove: Array<{ task: KanbanTask, fromColumn: KanbanColumn }> = [];
        
        // Parse combined conditions (e.g., "gather_today&john" or "gather_overdue&sarah")
        const gatherPart = tag.substring(7); // Remove 'gather_' prefix
        const conditions = gatherPart.split('&').map(c => c.trim());
        
        // Collect tasks that match ALL conditions (AND logic)
        board.columns.forEach(sourceColumn => {
            if (sourceColumn.id === targetColumn.id) return;
            
            sourceColumn.tasks.forEach(task => {
                if (movedTasks.has(task.id)) return;
                
                const taskText = `${task.title || ''} ${task.description || ''}`;
                const taskDate = this.extractDate(taskText);
                const personNames = this.extractPersonNames(taskText);
                
                let allConditionsMet = true;
                
                for (const condition of conditions) {
                    let conditionMet = false;
                    
                    // Check date-based conditions
                    if (condition === 'today' && taskDate === this.getTodayString()) {
                        conditionMet = true;
                    } else if (condition === 'next3days' && taskDate && this.isWithinDays(taskDate, 3)) {
                        conditionMet = true;
                    } else if (condition === 'next7days' && taskDate && this.isWithinDays(taskDate, 7)) {
                        conditionMet = true;
                    } else if (condition === 'overdue' && taskDate && this.isOverdue(taskDate)) {
                        conditionMet = true;
                    } else if (!condition.match(/^(today|next3days|next7days|overdue)$/)) {
                        // Check for person name condition
                        if (personNames.includes(condition)) {
                            conditionMet = true;
                        }
                    }
                    
                    if (!conditionMet) {
                        allConditionsMet = false;
                        break;
                    }
                }
                
                if (allConditionsMet) {
                    tasksToMove.push({ task, fromColumn: sourceColumn });
                    movedTasks.add(task.id);
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

    // Gather ungathered tasks (with @ tags but not moved)
    private gatherUngatheredToColumn(board: KanbanBoard, targetColumn: KanbanColumn, movedTasks: Set<string>): void {
        const tasksToMove: Array<{ task: KanbanTask, fromColumn: KanbanColumn }> = [];
        
        board.columns.forEach(sourceColumn => {
            if (sourceColumn.id === targetColumn.id) return;
            
            sourceColumn.tasks.forEach(task => {
                // Skip if already moved by another gather column
                if (movedTasks.has(task.id)) return;
                
                const taskText = `${task.title || ''} ${task.description || ''}`;
                
                // Check if task has any @ tags (date or person)
                const hasDateTag = this.extractDate(taskText) !== null;
                const hasPersonTags = this.extractPersonNames(taskText).length > 0;
                const hasAnyAtTag = hasDateTag || hasPersonTags;
                
                // Only move to ungathered if:
                // 1. Has @ tags
                // 2. Wasn't already moved by a specific gather column
                if (hasAnyAtTag) {
                    tasksToMove.push({ task, fromColumn: sourceColumn });
                    movedTasks.add(task.id);
                }
                // If no @ tags, leave the card where it is
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

    private gatherUntaggedToColumn(board: KanbanBoard, targetColumn: KanbanColumn, movedTasks: Set<string>): void {
        const tasksToMove: Array<{ task: KanbanTask, fromColumn: KanbanColumn }> = [];
        
        board.columns.forEach(sourceColumn => {
            if (sourceColumn.id === targetColumn.id) return;
            
            sourceColumn.tasks.forEach(task => {
                // Skip if already moved
                if (movedTasks.has(task.id)) return;
                
                const taskText = `${task.title || ''} ${task.description || ''}`;
                
                // Check if task has any @ tags (date or person)
                const hasDateTag = this.extractDate(taskText) !== null;
                const hasPersonTags = this.extractPersonNames(taskText).length > 0;
                const hasAnyAtTag = hasDateTag || hasPersonTags;
                
                // Only move to untagged if it has NO @ tags at all
                if (!hasAnyAtTag) {
                    tasksToMove.push({ task, fromColumn: sourceColumn });
                    movedTasks.add(task.id);
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

    // Parse and evaluate gather expressions with operators
    private parseGatherExpression(tag: string): (taskText: string, taskDate: string | null, personNames: string[]) => boolean {
        // Remove 'gather_' or 'gather_' prefix
        let expr = tag.replace(/^gather_/, '');
        
        // Handle legacy simple tags first
        if (expr === 'today') {
            return (taskText, taskDate, personNames) => taskDate === this.getTodayString();
        }
        if (expr === 'next3days') {
            return (taskText, taskDate, personNames) => taskDate ? this.isWithinDays(taskDate, 3) : false;
        }
        if (expr === 'next7days') {
            return (taskText, taskDate, personNames) => taskDate ? this.isWithinDays(taskDate, 7) : false;
        }
        if (expr === 'overdue') {
            return (taskText, taskDate, personNames) => taskDate ? this.isOverdue(taskDate) : false;
        }
        
        // Handle OR expressions (lower precedence)
        if (expr.includes('|')) {
            const parts = expr.split('|');
            const subEvaluators = parts.map(part => this.parseGatherExpression('gather_' + part.trim()));
            return (taskText, taskDate, personNames) => {
                return subEvaluators.some(evaluator => evaluator(taskText, taskDate, personNames));
            };
        }
        
        // Handle AND expressions (higher precedence)
        if (expr.includes('&')) {
            const parts = expr.split('&');
            const subEvaluators = parts.map(part => this.parseGatherExpression('gather_' + part.trim()));
            return (taskText, taskDate, personNames) => {
                return subEvaluators.every(evaluator => evaluator(taskText, taskDate, personNames));
            };
        }
        
        // Handle comparison expressions: property=value, property<value, property>value, value<property
        const comparisonMatch = expr.match(/^([a-zA-Z_]+|\d+)([<>=])([a-zA-Z_]+|\d+)$/);
        if (comparisonMatch) {
            const [, left, operator, right] = comparisonMatch;
            return this.createComparisonEvaluator(left, operator, right);
        }
        
        // Handle simple person names (no operators) for backward compatibility
        if (!expr.match(/[<>=]/)) {
            return (taskText, taskDate, personNames) => {
                return personNames.map(p => p.toLowerCase()).includes(expr.toLowerCase());
            };
        }
        
        // Default: no match
        return () => false;
    }

    // Create comparison evaluator for date properties
    private createComparisonEvaluator(left: string, operator: string, right: string): 
        (taskText: string, taskDate: string | null, personNames: string[]) => boolean {
        
        // Determine if left or right is the property
        const properties = ['dayoffset', 'weekday', 'weekdaynum', 'month'];
        const isLeftProperty = properties.includes(left);
        const property = isLeftProperty ? left : right;
        const value = isLeftProperty ? right : left;
        
        // Reverse operator if value is on the left side
        let actualOperator = operator;
        if (!isLeftProperty) {
            if (operator === '<') actualOperator = '>';
            else if (operator === '>') actualOperator = '<';
        }
        
        return (taskText: string, taskDate: string | null, personNames: string[]) => {
            if (!taskDate && property !== 'person') return false;
            
            const propValue = this.getDatePropertyValue(property, taskDate);
            if (propValue === null) return false;
            
            // For weekday string comparison
            if (property === 'weekday') {
                return actualOperator === '=' && propValue === value.toLowerCase();
            }
            
            // For numeric comparisons
            const numValue = parseInt(value);
            const numPropValue = typeof propValue === 'number' ? propValue : parseInt(propValue);
            
            switch (actualOperator) {
                case '=': return numPropValue === numValue;
                case '<': return numPropValue < numValue;
                case '>': return numPropValue > numValue;
                default: return false;
            }
        };
    }

    // Get date property value
    private getDatePropertyValue(property: string, dateStr: string | null): number | string | null {
        if (!dateStr) return null;
        
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        date.setHours(0, 0, 0, 0);
        
        switch (property) {
            case 'dayoffset':
                // Calculate days difference from today
                const diffTime = date.getTime() - today.getTime();
                return Math.round(diffTime / (1000 * 60 * 60 * 24));
                
            case 'weekday':
                // Return day name (mon, tue, wed, etc.)
                const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
                return days[date.getDay()];
                
            case 'weekdaynum':
                // Return 1-7 where Monday = 1, Sunday = 7
                const dayNum = date.getDay(); // 0 = Sunday
                return dayNum === 0 ? 7 : dayNum;
                
            case 'month':
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
            if (!dateA && !dateB) return 0;
            if (!dateA) return 1;
            if (!dateB) return -1;
            
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
