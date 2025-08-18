import * as vscode from 'vscode';
import * as path from 'path';

import { MarkdownKanbanParser, KanbanBoard, KanbanTask, KanbanColumn } from './markdownParser';

interface HistoryEntry {
    board: KanbanBoard;
    timestamp: number;
}

export class KanbanWebviewPanel {
    public static currentPanel: KanbanWebviewPanel | undefined;
    public static readonly viewType = 'markdownKanbanPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    private _board?: KanbanBoard;
    private _document?: vscode.TextDocument;
    
    // Undo/Redo history
    private _history: HistoryEntry[] = [];
    private _historyIndex: number = -1;
    private _maxHistorySize: number = 50;
    private _historyUri?: vscode.Uri;

    public static async createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        if (KanbanWebviewPanel.currentPanel) {
            KanbanWebviewPanel.currentPanel._panel.reveal();
            if (document) {
                await KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
            }
            return;
        }

        // If we have a document, show it in the first column
        if (document) {
            await vscode.window.showTextDocument(document, vscode.ViewColumn.One, false);
        }

        const panel = vscode.window.createWebviewPanel(
            KanbanWebviewPanel.viewType,
            'Markdown Kanban',
            vscode.ViewColumn.Two, // Always show in second column
            {
                enableScripts: true,
                localResourceRoots: [extensionUri],
                retainContextWhenHidden: true
            }
        );

        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);

        if (document) {
            await KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
        }
    }

    public static async revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
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

        this._panel.webview.html = this._getHtmlForWebview();
        this._setupEventListeners();
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            message => this._handleMessage(message),
            null,
            this._disposables
        );
    }

    private async _handleMessage(message: any) {
        switch (message.type) {
            // Undo/Redo operations
            case 'undo':
                await this.undo();
                break;
            case 'redo':
                await this.redo();
                break;
            case 'save':
                await this.saveDocument();
                break;
                
            // Task operations
            case 'moveTask':
                await this.moveTask(message.fromColumnIndex, message.taskIndex, message.toColumnIndex, message.newIndex);
                break;
            case 'addTask':
                await this.addTask(message.columnIndex, message.taskData);
                break;
            case 'deleteTask':
                await this.deleteTask(message.columnIndex, message.taskIndex);
                break;
            case 'editTask':
                await this.editTask(message.columnIndex, message.taskIndex, message.taskData);
                break;
            case 'duplicateTask':
                await this.duplicateTask(message.columnIndex, message.taskIndex);
                break;
            case 'insertTaskBefore':
                await this.insertTaskBefore(message.columnIndex, message.taskIndex);
                break;
            case 'insertTaskAfter':
                await this.insertTaskAfter(message.columnIndex, message.taskIndex);
                break;
                
            // Column operations
            case 'addColumn':
                await this.addColumn(message.title);
                break;
            case 'moveColumn':
                await this.moveColumn(message.fromIndex, message.toIndex);
                break;
            case 'deleteColumn':
                await this.deleteColumn(message.columnIndex);
                break;
            case 'editColumnTitle':
                await this.editColumnTitle(message.columnIndex, message.title);
                break;
            case 'sortColumn':
                await this.sortColumn(message.columnIndex, message.sortType);
                break;
        }
    }

    public async loadMarkdownFile(document: vscode.TextDocument) {
        this._document = document;
        
        // Set up history file path
        const docUri = document.uri;
        const dir = vscode.Uri.joinPath(docUri, '..');
        const filename = path.basename(docUri.fsPath);
        this._historyUri = vscode.Uri.joinPath(dir, `.${filename}.history`);
        
        // Load history from file
        await this.loadHistory();
        
        try {
            this._board = MarkdownKanbanParser.parseMarkdown(document.getText());
            
            // Only add to history if it's different from the current state
            if (!this.isBoardEqual(this._board, this.getCurrentHistoryBoard())) {
                this.addToHistory(this._board);
            }
        } catch (error) {
            console.error('Error parsing Markdown:', error);
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { title: 'Error Loading Board', columns: [], yamlHeader: null, kanbanFooter: null };
        }
        
        this._sendBoardUpdate();
    }

    private async loadHistory() {
        if (!this._historyUri) {
            this._history = [];
            this._historyIndex = -1;
            return;
        }

        try {
            const data = await vscode.workspace.fs.readFile(this._historyUri);
            const jsonStr = new TextDecoder().decode(data);
            const parsed = JSON.parse(jsonStr);
            this._history = parsed.history || [];
            this._historyIndex = parsed.index || -1;
        } catch (error) {
            // File doesn't exist or is corrupted, start fresh
            this._history = [];
            this._historyIndex = -1;
        }
    }

    private async saveHistory() {
        if (!this._historyUri) return;

        try {
            const data = {
                history: this._history,
                index: this._historyIndex
            };
            const jsonStr = JSON.stringify(data, null, 2);
            await vscode.workspace.fs.writeFile(this._historyUri, Buffer.from(jsonStr, 'utf8'));
        } catch (error) {
            console.error('Error saving history:', error);
        }
    }

    private addToHistory(board: KanbanBoard) {
        // Remove any history after current index
        this._history = this._history.slice(0, this._historyIndex + 1);
        
        // Add new entry
        this._history.push({
            board: JSON.parse(JSON.stringify(board)), // Deep clone
            timestamp: Date.now()
        });
        
        // Limit history size
        if (this._history.length > this._maxHistorySize) {
            this._history.shift();
        } else {
            this._historyIndex++;
        }
        
        this.saveHistory();
    }

    private getCurrentHistoryBoard(): KanbanBoard | null {
        if (this._historyIndex >= 0 && this._historyIndex < this._history.length) {
            return this._history[this._historyIndex].board;
        }
        return null;
    }

    private isBoardEqual(board1: KanbanBoard | null, board2: KanbanBoard | null): boolean {
        if (!board1 || !board2) return board1 === board2;
        return JSON.stringify(board1) === JSON.stringify(board2);
    }

    private async undo() {
        if (this._historyIndex > 0) {
            this._historyIndex--;
            this._board = JSON.parse(JSON.stringify(this._history[this._historyIndex].board));
            await this.saveToMarkdown();
            this._sendBoardUpdate();
            await this.saveHistory();
        } else {
            vscode.window.showInformationMessage('Nothing to undo');
        }
    }

    private async redo() {
        if (this._historyIndex < this._history.length - 1) {
            this._historyIndex++;
            this._board = JSON.parse(JSON.stringify(this._history[this._historyIndex].board));
            await this.saveToMarkdown();
            this._sendBoardUpdate();
            await this.saveHistory();
        } else {
            vscode.window.showInformationMessage('Nothing to redo');
        }
    }

    private _sendBoardUpdate() {
        if (!this._panel.webview) return;

        const board = this._board || { title: 'Please open a Markdown Kanban file', columns: [], yamlHeader: null, kanbanFooter: null };
        this._panel.webview.postMessage({
            type: 'updateBoard',
            board: board,
            canUndo: this._historyIndex > 0,
            canRedo: this._historyIndex < this._history.length - 1
        });
    }

    private async saveToMarkdown() {
        if (!this._document || !this._board) return;

        const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
        
        // Write directly to file
        try {
            await vscode.workspace.fs.writeFile(this._document.uri, Buffer.from(markdown, 'utf8'));
            
            // Reload the document to sync with text editor
            this._document = await vscode.workspace.openTextDocument(this._document.uri);
        } catch (error) {
            console.error('Error saving markdown:', error);
            vscode.window.showErrorMessage('Failed to save Kanban board');
        }
    }

    private async saveDocument() {
        if (this._document) {
            await this._document.save();
            vscode.window.showInformationMessage('Document saved');
        }
    }

    private async performAction(action: () => void) {
        if (!this._board) return;
        
        action();
        
        // Add to history and save
        this.addToHistory(this._board);
        await this.saveToMarkdown();
        this._sendBoardUpdate();
    }

    // Task operations
    private async moveTask(fromColumnIndex: number, taskIndex: number, toColumnIndex: number, newIndex: number) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const fromColumn = this._board.columns[fromColumnIndex];
            const toColumn = this._board.columns[toColumnIndex];
            
            if (!fromColumn || !toColumn) return;
            
            const task = fromColumn.tasks.splice(taskIndex, 1)[0];
            toColumn.tasks.splice(newIndex, 0, task);
        });
    }

    private async addTask(columnIndex: number, taskData: any) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;

            const newTask: KanbanTask = {
                title: taskData.title || '',
                description: taskData.description || ''
            };

            column.tasks.push(newTask);
        });
    }

    private async deleteTask(columnIndex: number, taskIndex: number) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;

            column.tasks.splice(taskIndex, 1);
        });
    }

    private async editTask(columnIndex: number, taskIndex: number, taskData: any) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;
            
            const task = column.tasks[taskIndex];
            if (!task) return;

            task.title = taskData.title;
            task.description = taskData.description;
        });
    }

    private async duplicateTask(columnIndex: number, taskIndex: number) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;
            
            const task = column.tasks[taskIndex];
            if (!task) return;

            const newTask: KanbanTask = {
                title: task.title + ' (copy)',
                description: task.description
            };

            column.tasks.splice(taskIndex + 1, 0, newTask);
        });
    }

    private async insertTaskBefore(columnIndex: number, taskIndex: number) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;

            const newTask: KanbanTask = {
                title: '',
                description: ''
            };

            column.tasks.splice(taskIndex, 0, newTask);
        });
    }

    private async insertTaskAfter(columnIndex: number, taskIndex: number) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;

            const newTask: KanbanTask = {
                title: '',
                description: ''
            };

            column.tasks.splice(taskIndex + 1, 0, newTask);
        });
    }

    // Column operations
    private async addColumn(title: string) {
        await this.performAction(() => {
            if (!this._board) return;

            const newColumn: KanbanColumn = {
                title: title,
                tasks: []
            };

            this._board.columns.push(newColumn);
        });
    }

    private async moveColumn(fromIndex: number, toIndex: number) {
        await this.performAction(() => {
            if (!this._board || fromIndex === toIndex) return;

            const columns = this._board.columns;
            const column = columns.splice(fromIndex, 1)[0];
            columns.splice(toIndex, 0, column);
        });
    }

    private async deleteColumn(columnIndex: number) {
        await this.performAction(() => {
            if (!this._board) return;

            this._board.columns.splice(columnIndex, 1);
        });
    }

    private async editColumnTitle(columnIndex: number, title: string) {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;
            
            column.title = title;
        });
    }

    private async sortColumn(columnIndex: number, sortType: 'unsorted' | 'title') {
        await this.performAction(() => {
            if (!this._board) return;
            
            const column = this._board.columns[columnIndex];
            if (!column) return;

            if (sortType === 'title') {
                column.tasks.sort((a, b) => {
                    const titleA = a.title || '';
                    const titleB = b.title || '';
                    return titleA.localeCompare(titleB);
                });
            }
            // Note: 'unsorted' doesn't do anything now since we don't track original order
        });
    }

    private _getHtmlForWebview() {
        const htmlPath = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'html', 'webview.html');
        const cssPath = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'html', 'webview.css');
        const jsPath = vscode.Uri.joinPath(this._context.extensionUri, 'src', 'html', 'webview.js');

        const cssUri = this._panel.webview.asWebviewUri(cssPath);
        const jsUri = this._panel.webview.asWebviewUri(jsPath);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown Kanban</title>
    <link href="${cssUri}" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/marked/4.3.0/marked.min.js"></script>
</head>
<body>
    <div id="kanban-board">
        <!-- Board content will be dynamically generated here -->
    </div>
    <script src="${jsUri}"></script>
</body>
</html>`;
    }

    public async dispose() {
        // Clean up history file if empty
        if (this._historyUri && this._history.length === 0) {
            try {
                await vscode.workspace.fs.delete(this._historyUri);
            } catch (error) {
                // Ignore errors
            }
        }
        
        KanbanWebviewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }
}