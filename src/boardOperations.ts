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
        
        // Only move if the position actually changed
        if (currentIndex !== newPosition) {
            // Remove from current position
            const [movedColumn] = board.columns.splice(currentIndex, 1);
            
            // Adjust target position because we just removed an element
            // If we removed from before the target position, the target shifts down by 1
            let insertPosition = newPosition;
            if (currentIndex < newPosition) {
                insertPosition = newPosition - 1;
            }
            
            // Insert at adjusted position
            board.columns.splice(insertPosition, 0, movedColumn);
        }
        
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
}
