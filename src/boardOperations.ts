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

    public moveColumn(board: KanbanBoard, fromIndex: number, toIndex: number): boolean {
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
        
        column.title = title;
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
}