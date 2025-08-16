import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MarkdownKanbanParser, KanbanBoard, KanbanTask, KanbanColumn } from './markdownParser';

export class KanbanWebviewPanel {
    public static currentPanel: KanbanWebviewPanel | undefined;
    public static readonly viewType = 'markdownKanbanPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _board?: KanbanBoard;
    private _document?: vscode.TextDocument;
    private _originalTaskOrder: Map<string, string[]> = new Map(); // Store original task order for unsorted state
    private _isInitialized: boolean = false;
    private _isUpdatingFromPanel: boolean = false; // Flag to prevent reload loops

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (KanbanWebviewPanel.currentPanel) {
            KanbanWebviewPanel.currentPanel._panel.reveal(column);
            if (document) {
                KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
            }
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            KanbanWebviewPanel.viewType,
            'Markdown Kanban',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);

        if (document) {
            KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
        }
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri],
        };
        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        this._initialize();
        this._setupEventListeners();
        
        if (this._document) {
            this.loadMarkdownFile(this._document);
        }
    }

    private _initialize() {
        if (!this._isInitialized) {
            this._panel.webview.html = this._getHtmlForWebview();
            this._isInitialized = true;
        }
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible && this._board) {
                    this._sendBoardUpdate();
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    private _handleMessage(message: any) {
        switch (message.type) {
            // Task operations
            case 'moveTask':
                this.moveTask(message.taskId, message.fromColumnId, message.toColumnId, message.newIndex);
                break;
            case 'addTask':
                this.addTask(message.columnId, message.taskData);
                break;
            case 'deleteTask':
                this.deleteTask(message.taskId, message.columnId);
                break;
            case 'editTask':
                this.editTask(message.taskId, message.columnId, message.taskData);
                break;
            case 'duplicateTask':
                this.duplicateTask(message.taskId, message.columnId);
                break;
            case 'insertTaskBefore':
                this.insertTaskBefore(message.taskId, message.columnId);
                break;
            case 'insertTaskAfter':
                this.insertTaskAfter(message.taskId, message.columnId);
                break;
            case 'moveTaskToTop':
                this.moveTaskToTop(message.taskId, message.columnId);
                break;
            case 'moveTaskUp':
                this.moveTaskUp(message.taskId, message.columnId);
                break;
            case 'moveTaskDown':
                this.moveTaskDown(message.taskId, message.columnId);
                break;
            case 'moveTaskToBottom':
                this.moveTaskToBottom(message.taskId, message.columnId);
                break;
            case 'moveTaskToColumn':
                this.moveTaskToColumn(message.taskId, message.fromColumnId, message.toColumnId);
                break;
                
            // Column operations
            case 'addColumn':
                this.addColumn(message.title);
                break;
            case 'moveColumn':
                this.moveColumn(message.fromIndex, message.toIndex);
                break;
            case 'deleteColumn':
                this.deleteColumn(message.columnId);
                break;
            case 'insertColumnBefore':
                this.insertColumnBefore(message.columnId, message.title);
                break;
            case 'insertColumnAfter':
                this.insertColumnAfter(message.columnId, message.title);
                break;
            case 'sortColumn':
                this.sortColumn(message.columnId, message.sortType);
                break;
            case 'editColumnTitle':
                this.editColumnTitle(message.columnId, message.title);
                break;
        }
    }

    public loadMarkdownFile(document: vscode.TextDocument) {
        // Don't reload if we're the ones who just updated the document
        if (this._isUpdatingFromPanel) {
            return;
        }
        
        this._document = document;
        try {
            this._board = MarkdownKanbanParser.parseMarkdown(document.getText());
            // Store original task order for each column
            this._board.columns.forEach(column => {
                this._originalTaskOrder.set(column.id, column.tasks.map(t => t.id));
            });
        } catch (error) {
            console.error('Error parsing Markdown:', error);
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { title: 'Error Loading Board', columns: [], yamlHeader: null, kanbanFooter: null };
        }
        this._sendBoardUpdate();
    }

    private _sendBoardUpdate() {
        if (!this._panel.webview) return;

        const board = this._board || { title: 'Please open a Markdown Kanban file', columns: [], yamlHeader: null, kanbanFooter: null };
        this._panel.webview.postMessage({
            type: 'updateBoard',
            board: board
        });
    }

    private editColumnTitle(columnId: string, title: string) {
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) return;
            
            column.title = title;
        });
    }

    private async saveToMarkdown() {
        if (!this._document || !this._board) return;

        this._isUpdatingFromPanel = true; // Set flag to prevent reload
        
        const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            this._document.uri,
            new vscode.Range(0, 0, this._document.lineCount, 0),
            markdown
        );
        await vscode.workspace.applyEdit(edit);
        await this._document.save();
        
        // Reset flag after a delay (longer than the file watcher delay)
        setTimeout(() => {
            this._isUpdatingFromPanel = false;
        }, 1000);
    }

    private findColumn(columnId: string): KanbanColumn | undefined {
        return this._board?.columns.find(col => col.id === columnId);
    }

    private findTask(columnId: string, taskId: string): { column: KanbanColumn; task: KanbanTask; index: number } | undefined {
        const column = this.findColumn(columnId);
        if (!column) return undefined;

        const taskIndex = column.tasks.findIndex(task => task.id === taskId);
        if (taskIndex === -1) return undefined;

        return {
            column,
            task: column.tasks[taskIndex],
            index: taskIndex
        };
    }

    private async performAction(action: () => void) {
        if (!this._board) return;
        
        action();
        await this.saveToMarkdown();
        this._sendBoardUpdate();
    }

    private generateId(type: 'column' | 'task', parentId?: string): string {
        // Generate a unique but stable ID
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 5);
        
        if (type === 'column') {
            const index = this._board?.columns.length || 0;
            return `col_${index}_${timestamp}_${random}`;
        } else {
            return `task_${parentId}_${timestamp}_${random}`;
        }
    }

    // Task operations
    private moveTask(taskId: string, fromColumnId: string, toColumnId: string, newIndex: number) {
        this.performAction(() => {
            const fromColumn = this.findColumn(fromColumnId);
            const toColumn = this.findColumn(toColumnId);

            if (!fromColumn || !toColumn) return;

            const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
            if (taskIndex === -1) return;

            const task = fromColumn.tasks.splice(taskIndex, 1)[0];
            toColumn.tasks.splice(newIndex, 0, task);
        });
    }

    private addTask(columnId: string, taskData: any) {
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) return;

            const newTask: KanbanTask = {
                id: this.generateId('task', columnId),
                title: taskData.title || '',
                description: taskData.description || ''
            };

            column.tasks.push(newTask);
        });
    }

    private deleteTask(taskId: string, columnId: string) {
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) return;

            const taskIndex = column.tasks.findIndex(task => task.id === taskId);
            if (taskIndex === -1) return;

            column.tasks.splice(taskIndex, 1);
        });
    }

    private editTask(taskId: string, columnId: string, taskData: any) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result) return;

            Object.assign(result.task, {
                title: taskData.title,
                description: taskData.description
            });
        });
    }

    private duplicateTask(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result) return;

            const newTask: KanbanTask = {
                id: this.generateId('task', columnId),
                title: result.task.title + ' (copy)',
                description: result.task.description
            };

            result.column.tasks.splice(result.index + 1, 0, newTask);
        });
    }

    private insertTaskBefore(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result) return;

            const newTask: KanbanTask = {
                id: this.generateId('task', columnId),
                title: '',
                description: ''
            };

            result.column.tasks.splice(result.index, 0, newTask);
        });
    }

    private insertTaskAfter(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result) return;

            const newTask: KanbanTask = {
                id: this.generateId('task', columnId),
                title: '',
                description: ''
            };

            result.column.tasks.splice(result.index + 1, 0, newTask);
        });
    }

    private moveTaskToTop(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result || result.index === 0) return;

            const task = result.column.tasks.splice(result.index, 1)[0];
            result.column.tasks.unshift(task);
        });
    }

    private moveTaskUp(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result || result.index === 0) return;

            const task = result.column.tasks[result.index];
            result.column.tasks[result.index] = result.column.tasks[result.index - 1];
            result.column.tasks[result.index - 1] = task;
        });
    }

    private moveTaskDown(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result || result.index === result.column.tasks.length - 1) return;

            const task = result.column.tasks[result.index];
            result.column.tasks[result.index] = result.column.tasks[result.index + 1];
            result.column.tasks[result.index + 1] = task;
        });
    }

    private moveTaskToBottom(taskId: string, columnId: string) {
        this.performAction(() => {
            const result = this.findTask(columnId, taskId);
            if (!result || result.index === result.column.tasks.length - 1) return;

            const task = result.column.tasks.splice(result.index, 1)[0];
            result.column.tasks.push(task);
        });
    }

    private moveTaskToColumn(taskId: string, fromColumnId: string, toColumnId: string) {
        this.performAction(() => {
            const fromColumn = this.findColumn(fromColumnId);
            const toColumn = this.findColumn(toColumnId);

            if (!fromColumn || !toColumn) return;

            const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
            if (taskIndex === -1) return;

            const task = fromColumn.tasks.splice(taskIndex, 1)[0];
            toColumn.tasks.push(task);
        });
    }

    // Column operations
    private addColumn(title: string) {
        this.performAction(() => {
            if (!this._board) return;

            const newColumn: KanbanColumn = {
                id: this.generateId('column'),
                title: title,
                tasks: []
            };

            this._board.columns.push(newColumn);
            this._originalTaskOrder.set(newColumn.id, []);
        });
    }

    private moveColumn(fromIndex: number, toIndex: number) {
        this.performAction(() => {
            if (!this._board || fromIndex === toIndex) return;

            const columns = this._board.columns;
            const column = columns.splice(fromIndex, 1)[0];
            columns.splice(toIndex, 0, column);
        });
    }

    private deleteColumn(columnId: string) {
        this.performAction(() => {
            if (!this._board) return;

            const index = this._board.columns.findIndex(col => col.id === columnId);
            if (index === -1) return;

            this._board.columns.splice(index, 1);
            this._originalTaskOrder.delete(columnId);
        });
    }

    private insertColumnBefore(columnId: string, title: string) {
        this.performAction(() => {
            if (!this._board) return;

            const index = this._board.columns.findIndex(col => col.id === columnId);
            if (index === -1) return;

            const newColumn: KanbanColumn = {
                id: this.generateId('column'),
                title: title,
                tasks: []
            };

            this._board.columns.splice(index, 0, newColumn);
            this._originalTaskOrder.set(newColumn.id, []);
        });
    }

    private insertColumnAfter(columnId: string, title: string) {
        this.performAction(() => {
            if (!this._board) return;

            const index = this._board.columns.findIndex(col => col.id === columnId);
            if (index === -1) return;

            const newColumn: KanbanColumn = {
                id: this.generateId('column'),
                title: title,
                tasks: []
            };

            this._board.columns.splice(index + 1, 0, newColumn);
            this._originalTaskOrder.set(newColumn.id, []);
        });
    }

    private sortColumn(columnId: string, sortType: 'unsorted' | 'title') {
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) return;

            if (sortType === 'title') {
                // Sort alphabetically by title
                column.tasks.sort((a, b) => {
                    const titleA = a.title || '';
                    const titleB = b.title || '';
                    return titleA.localeCompare(titleB);
                });
            } else if (sortType === 'unsorted') {
                // Restore original order
                const originalOrder = this._originalTaskOrder.get(columnId);
                if (originalOrder) {
                    const taskMap = new Map(column.tasks.map(t => [t.id, t]));
                    column.tasks = [];
                    
                    // Add tasks in original order
                    originalOrder.forEach(taskId => {
                        const task = taskMap.get(taskId);
                        if (task) {
                            column.tasks.push(task);
                            taskMap.delete(taskId);
                        }
                    });
                    
                    // Add any new tasks that weren't in original order
                    taskMap.forEach(task => {
                        column.tasks.push(task);
                    });
                }
            }
        });
    }

    private _getHtmlForWebview() {
        const filePath = vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html', 'webview.html'));
        let html = fs.readFileSync(filePath.fsPath, 'utf8');

        const baseWebviewUri = this._panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html'))
        );

        html = html.replace(/<head>/, `<head><base href="${baseWebviewUri.toString()}/">`);

        return html;
    }

    public dispose() {
        KanbanWebviewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }
}