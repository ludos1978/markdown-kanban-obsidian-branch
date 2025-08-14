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
    private _isUpdatingFromDocument = false;
    private _isInternalUpdate = false;

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (KanbanWebviewPanel.currentPanel) {
            KanbanWebviewPanel.currentPanel._panel.reveal(column);
            if (document) {
                KanbanWebviewPanel.currentPanel.loadMarkdownFile(document, true);
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
            KanbanWebviewPanel.currentPanel.loadMarkdownFile(document, true);
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

        this._update();
        this._setupEventListeners();
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    this._update();
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

    private async _handleMessage(message: any) {
        switch (message.type) {
            case 'moveTask':
                await this.moveTask(message.taskId, message.fromColumnId, message.toColumnId, message.newIndex);
                break;
            case 'addTask':
                await this.addTask(message.columnId, message.taskData);
                break;
            case 'deleteTask':
                await this.deleteTask(message.taskId, message.columnId);
                break;
            case 'editTask':
                await this.editTask(message.taskId, message.columnId, message.taskData, true);
                break;
            case 'editTaskNoUpdate':
                // For inline edits, save without ANY UI update - the webview already updated locally
                await this.editTaskSilent(message.taskId, message.columnId, message.taskData);
                break;
            case 'addColumn':
                await this.addColumn(message.title);
                break;
            case 'deleteColumn':
                await this.deleteColumn(message.columnId);
                break;
            case 'moveColumn':
                await this.moveColumn(message.fromIndex, message.toIndex);
                break;
        }
    }

    public loadMarkdownFile(document: vscode.TextDocument, forceUpdate: boolean = false) {
        // Skip if this is our own internal update (from saveToMarkdown)
        if (this._isInternalUpdate && !forceUpdate) {
            return;
        }
        
        this._document = document;
        this._isUpdatingFromDocument = true;
        
        try {
            this._board = MarkdownKanbanParser.parseMarkdown(document.getText());
        } catch (error) {
            console.error('Error parsing Markdown:', error);
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { title: 'Error Loading Board', columns: [], yamlHeader: null, kanbanFooter: null };
        }
        
        // Only update UI if not an internal update
        if (!this._isInternalUpdate) {
            this._updateWithScrollPreservation();
        }
        
        this._isUpdatingFromDocument = false;
    }

    private _update() {
        if (!this._panel.webview) return;

        this._panel.webview.html = this._getHtmlForWebview();
        
        const board = this._board || { title: 'Please open a Markdown Kanban file', columns: [], yamlHeader: null, kanbanFooter: null };
        this._panel.webview.postMessage({
            type: 'updateBoard',
            board: board
        });
    }

    private _updateWithScrollPreservation() {
        if (!this._panel.webview) return;

        this._panel.webview.html = this._getHtmlForWebview();
        
        const board = this._board || { title: 'Please open a Markdown Kanban file', columns: [], yamlHeader: null, kanbanFooter: null };
        this._panel.webview.postMessage({
            type: 'updateBoardPreserveScroll',
            board: board
        });
    }

    private async saveToMarkdown(silent: boolean = false) {
        if (!this._document || !this._board || this._isUpdatingFromDocument) return;

        const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
        const edit = new vscode.WorkspaceEdit();
        
        // Replace entire document content
        const fullRange = new vscode.Range(
            this._document.positionAt(0),
            this._document.positionAt(this._document.getText().length)
        );
        
        edit.replace(this._document.uri, fullRange, markdown);
        
        if (silent) {
            // Set flag to prevent re-processing our own update
            // Use longer timeout than the document change listener delay (300ms)
            this._isInternalUpdate = true;
            
            // Apply edit without saving - this allows undo/redo to work
            const success = await vscode.workspace.applyEdit(edit);
            
            // Reset flag after document change listener would have fired
            setTimeout(() => {
                this._isInternalUpdate = false;
            }, 500);
            
            if (!success) {
                vscode.window.showErrorMessage('Failed to update the document');
            }
        } else {
            // Normal save - allow updates
            const success = await vscode.workspace.applyEdit(edit);
            
            if (!success) {
                vscode.window.showErrorMessage('Failed to update the document');
            }
        }
    }

    private async performAction(action: () => void, updateUI: boolean = true) {
        if (!this._board) return;
        
        action();
        await this.saveToMarkdown(false);
        
        if (updateUI) {
            this._updateWithScrollPreservation();
        }
    }

    private async performSilentAction(action: () => void) {
        if (!this._board) return;
        
        action();
        await this.saveToMarkdown(true);
        // No UI update at all - the webview has already updated locally
    }

    private async moveTask(taskId: string, fromColumnId: string, toColumnId: string, newIndex: number) {
        await this.performAction(() => {
            const fromColumn = this._board?.columns.find(col => col.id === fromColumnId);
            const toColumn = this._board?.columns.find(col => col.id === toColumnId);

            if (!fromColumn || !toColumn) return;

            const taskIndex = fromColumn.tasks.findIndex(task => task.id === taskId);
            if (taskIndex === -1) return;

            const [task] = fromColumn.tasks.splice(taskIndex, 1);
            toColumn.tasks.splice(newIndex, 0, task);
        });
    }

    private async addTask(columnId: string, taskData: any) {
        await this.performAction(() => {
            const column = this._board?.columns.find(col => col.id === columnId);
            if (!column) return;

            const newTask: KanbanTask = {
                id: Math.random().toString(36).substr(2, 9),
                title: taskData.title || '',
                description: taskData.description
            };

            column.tasks.push(newTask);
        });
    }

    private async deleteTask(taskId: string, columnId: string) {
        await this.performAction(() => {
            const column = this._board?.columns.find(col => col.id === columnId);
            if (!column) return;

            const taskIndex = column.tasks.findIndex(task => task.id === taskId);
            if (taskIndex !== -1) {
                column.tasks.splice(taskIndex, 1);
            }
        });
    }

    private async editTask(taskId: string, columnId: string, taskData: any, updateUI: boolean) {
        await this.performAction(() => {
            const column = this._board?.columns.find(col => col.id === columnId);
            if (!column) return;

            const task = column.tasks.find(t => t.id === taskId);
            if (!task) return;

            task.title = taskData.title || '';
            task.description = taskData.description;
        }, updateUI);
    }

    private async editTaskSilent(taskId: string, columnId: string, taskData: any) {
        await this.performSilentAction(() => {
            const column = this._board?.columns.find(col => col.id === columnId);
            if (!column) return;

            const task = column.tasks.find(t => t.id === taskId);
            if (!task) return;

            task.title = taskData.title || '';
            task.description = taskData.description;
        });
    }

    private async addColumn(title: string) {
        await this.performAction(() => {
            if (!this._board) return;

            const newColumn: KanbanColumn = {
                id: Math.random().toString(36).substr(2, 9),
                title: title,
                tasks: []
            };

            this._board.columns.push(newColumn);
        });
    }

    private async deleteColumn(columnId: string) {
        await this.performAction(() => {
            if (!this._board) return;

            const columnIndex = this._board.columns.findIndex(col => col.id === columnId);
            if (columnIndex !== -1) {
                this._board.columns.splice(columnIndex, 1);
            }
        });
    }

    private async moveColumn(fromIndex: number, toIndex: number) {
        await this.performAction(() => {
            if (!this._board || fromIndex === toIndex) return;

            const [column] = this._board.columns.splice(fromIndex, 1);
            this._board.columns.splice(toIndex, 0, column);
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