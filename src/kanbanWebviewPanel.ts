import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MarkdownKanbanParser, KanbanBoard, KanbanTask, KanbanColumn } from './markdownParser';

// Deep clone helper for board state
function deepCloneBoard(board: KanbanBoard): KanbanBoard {
    // return JSON.parse(JSON.stringify(board));
    return structuredClone(board);
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
    private _originalTaskOrder: Map<string, string[]> = new Map(); // Store original task order for unsorted state
    private _isInitialized: boolean = false;
    private _isUpdatingFromPanel: boolean = false; // Flag to prevent reload loops
    private _isFileLocked: boolean = false; // Flag to prevent automatic file switching

    // Undo/Redo stacks
    private _undoStack: KanbanBoard[] = [];
    private _redoStack: KanbanBoard[] = [];
    private readonly _maxUndoStackSize = 50; // Limit stack size to prevent memory issues

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (KanbanWebviewPanel.currentPanel) {
            KanbanWebviewPanel.currentPanel._panel.reveal(column);
            if (document) {
                console.log('CreateOrShow:1:loadMarkdownFile');
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
                retainContextWhenHidden: true,
                enableCommandUris: true
            }
        );

        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);

        if (document) {
            console.log('CreateOrShow:2:loadMarkdownFile');
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
            console.log('Constructor:loadMarkdownFile');
            this.loadMarkdownFile(this._document);
        }
    }

    // Public methods for external access
    public isFileLocked(): boolean {
        return this._isFileLocked;
    }

    public toggleFileLock(): void {
        this._isFileLocked = !this._isFileLocked;
        this._sendFileInfo();
        const status = this._isFileLocked ? 'locked' : 'unlocked';
        vscode.window.showInformationMessage(`Kanban file ${status}`);
    }

    public getCurrentDocumentUri(): vscode.Uri | undefined {
        return this._document?.uri;
    }

    private _initialize() {
        if (!this._isInitialized) {
            this._panel.webview.html = this._getHtmlForWebview();
            this._isInitialized = true;
        }
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Fixed: Always ensure board is sent when panel becomes visible
        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    // Always try to send board update when panel becomes visible
                    // This ensures the webview has the current board data
                    this._ensureBoardAndSendUpdate();
                    this._sendFileInfo();
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

    // New method to ensure we have board data and send update
    private _ensureBoardAndSendUpdate() {
        // If we don't have a board but we have a document, reload it
        if (!this._board && this._document) {
            try {
                this._board = MarkdownKanbanParser.parseMarkdown(this._document.getText());
                // Store original task order for each column
                this._board.columns.forEach(column => {
                    this._originalTaskOrder.set(column.id, column.tasks.map(t => t.id));
                });
            } catch (error) {
                console.error('Error parsing Markdown:', error);
                this._board = { valid:false, title: 'Error Loading Board', columns: [], yamlHeader: null, kanbanFooter: null };
            }
        }
        
        // Always send the update
        this._sendBoardUpdate();
    }

    // Undo/Redo methods
    private _saveStateForUndo() {
        if (!this._board || !this._board.valid) return;
        
        // Push current state to undo stack
        this._undoStack.push(deepCloneBoard(this._board));
        
        // Limit stack size
        if (this._undoStack.length > this._maxUndoStackSize) {
            this._undoStack.shift();
        }
        
        // Clear redo stack when new action is performed
        this._redoStack = [];
        
        // Send undo/redo status to webview
        this._sendUndoRedoStatus();
    }

    private async _undo() {
        if (this._undoStack.length === 0) {
            vscode.window.showInformationMessage('Nothing to undo');
            return;
        }
        
        // Save current state to redo stack
        if (this._board && this._board.valid) {
            this._redoStack.push(deepCloneBoard(this._board));
        }
        
        // Restore previous state
        this._board = this._undoStack.pop()!;
        
        // Restore original task order for sorting
        this._board.columns.forEach(column => {
            this._originalTaskOrder.set(column.id, column.tasks.map(t => t.id));
        });
        
        // Disable file listener when undoing to prevent conflicts
        try {
            const kanbanFileListener = (globalThis as any).kanbanFileListener;
            if (kanbanFileListener && kanbanFileListener.getStatus) {
                const wasEnabled = kanbanFileListener.getStatus();
                if (wasEnabled) {
                    // Disable file listener temporarily during undo
                    kanbanFileListener.setStatus(false);
                    
                    // Re-enable after a short delay to avoid interference with other operations
                    setTimeout(() => {
                        if (kanbanFileListener) {
                            kanbanFileListener.setStatus(true);
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.warn('Failed to disable file listener during undo:', error);
        }
        
        // Save and update
        await this.saveToMarkdown();
        this._sendBoardUpdate();
        this._sendUndoRedoStatus();
    }

    private async _redo() {
        if (this._redoStack.length === 0) {
            vscode.window.showInformationMessage('Nothing to redo');
            return;
        }
        
        // Save current state to undo stack
        if (this._board && this._board.valid) {
            this._undoStack.push(deepCloneBoard(this._board));
        }
        
        // Restore next state
        this._board = this._redoStack.pop()!;
        
        // Restore original task order for sorting
        this._board.columns.forEach(column => {
            this._originalTaskOrder.set(column.id, column.tasks.map(t => t.id));
        });
        
        // Disable file listener when undoing to prevent conflicts
        try {
            const kanbanFileListener = (globalThis as any).kanbanFileListener;
            if (kanbanFileListener && kanbanFileListener.getStatus) {
                const wasEnabled = kanbanFileListener.getStatus();
                if (wasEnabled) {
                    // Disable file listener temporarily during undo
                    kanbanFileListener.setStatus(false);
                    
                    // Re-enable after a short delay to avoid interference with other operations
                    setTimeout(() => {
                        if (kanbanFileListener) {
                            kanbanFileListener.setStatus(true);
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.warn('Failed to disable file listener during undo:', error);
        }
        
        // Save and update
        await this.saveToMarkdown();
        this._sendBoardUpdate();
        this._sendUndoRedoStatus();
    }

    private _sendUndoRedoStatus() {
        if (!this._panel.webview) return;
        
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'undoRedoStatus',
                canUndo: this._undoStack.length > 0,
                canRedo: this._redoStack.length > 0
            });
        }, 10);
    }

    // Helper methods for drag and drop
    private _getRelativePath(filePath: string): string {
        if (!this._document) {
            return filePath;
        }
        
        const documentDir = path.dirname(this._document.uri.fsPath);
        const relativePath = path.relative(documentDir, filePath);
        
        // Convert backslashes to forward slashes for markdown compatibility
        return relativePath.replace(/\\/g, '/');
    }

    private _isImageFile(fileName: string): boolean {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
        const ext = path.extname(fileName).toLowerCase();
        return imageExtensions.includes(ext);
    }

    private async _handleFileDrop(message: any) {
        try {
            console.log('_handleFileDrop called with:', message);
            const { fileName, dropPosition, activeEditor } = message;
            
            // Since we can't get the actual file path from a browser file drop,
            // we'll create a simple relative path
            const isImage = this._isImageFile(fileName);
            const relativePath = `./${fileName}`;
            
            console.log('File info - Name:', fileName, 'Relative:', relativePath, 'IsImage:', isImage);
            
            const fileInfo = {
                fileName,
                relativePath,
                isImage,
                activeEditor,
                dropPosition
            };
            
            // Send back to webview to insert the link
            console.log('Sending insertFileLink message back to webview');
            this._panel.webview.postMessage({
                type: 'insertFileLink',
                fileInfo: fileInfo
            });
            
        } catch (error) {
            console.error('Error handling file drop:', error);
            vscode.window.showErrorMessage(`Failed to handle file drop: ${error}`);
        }
    }

    private async _handleUriDrop(message: any) {
        try {
            console.log('_handleUriDrop called with:', message);
            const { uris, dropPosition, activeEditor } = message;
            
            for (const uriString of uris) {
                console.log('Processing URI:', uriString);
                
                let uri: vscode.Uri;
                try {
                    // Handle both file:// URIs and regular paths
                    if (uriString.startsWith('file://')) {
                        uri = vscode.Uri.parse(uriString);
                    } else {
                        // Try to parse as a file path
                        uri = vscode.Uri.file(uriString);
                    }
                } catch (parseError) {
                    console.error('Failed to parse URI:', uriString, parseError);
                    continue;
                }
                
                console.log('Parsed URI:', uri.toString());
                console.log('File path:', uri.fsPath);
                
                const fileName = path.basename(uri.fsPath);
                const relativePath = this._getRelativePath(uri.fsPath);
                const isImage = this._isImageFile(fileName);
                
                console.log('File info - Name:', fileName, 'Relative:', relativePath, 'IsImage:', isImage);
                
                const fileInfo = {
                    fileName,
                    relativePath,
                    isImage,
                    activeEditor,
                    dropPosition
                };
                
                // Send back to webview to insert the link
                console.log('Sending insertFileLink message back to webview');
                this._panel.webview.postMessage({
                    type: 'insertFileLink',
                    fileInfo: fileInfo
                });
                
                break; // Only handle the first file for now
            }
            
        } catch (error) {
            console.error('Error handling URI drop:', error);
            vscode.window.showErrorMessage(`Failed to handle URI drop: ${error}`);
        }
    }

    private _handleMessage(message: any) {
        console.log('KanbanWebviewPanel received message:', message.type, message);
        
        switch (message.type) {
            // Undo/Redo operations
            case 'undo':
                this._undo();
                break;
            case 'redo':
                this._redo();
                break;
                
            // Special request for board update
            case 'requestBoardUpdate':
                this._ensureBoardAndSendUpdate();
                this._sendFileInfo();
                this._sendUndoRedoStatus();
                break;

            // Drag and drop operations
            case 'handleFileDrop':
                console.log('Handling file drop message');
                this._handleFileDrop(message);
                break;
            case 'handleUriDrop':
                console.log('Handling URI drop message');
                this._handleUriDrop(message);
                break;
            
            case 'convertImagePaths':
                this._convertImagePaths(message.conversions);
                break;
            case 'openFileLink':
                this._handleFileLink(message.href, message.currentDocumentPath);
                break;
                        
            // File management
            case 'toggleFileLock':
                this.toggleFileLock();
                break;
            case 'selectFile':
                this._selectFile();
                break;
            case 'requestFileInfo':
                this._sendFileInfo();
                break;
            case 'initializeFile':
                this._initializeFile();
                break;
            case 'showMessage':
                vscode.window.showInformationMessage(message.text);
                break;

            // Task operations
            case 'moveTask':
                this.moveTask(message.taskId, message.fromColumnId, message.toColumnId, message.newIndex);
                break;
            case 'addTask':
                console.log('Adding task:', message.columnId, message.taskData);
                this.addTask(message.columnId, message.taskData);
                break;
            case 'addTaskAtPosition':  // NEW CASE
                console.log('Adding task at position:', message.columnId, message.taskData, 'at index:', message.insertionIndex);
                this.addTaskAtPosition(message.columnId, message.taskData, message.insertionIndex);
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
            default:
                console.warn('Unknown message type:', message.type);
                break;
        }
    }

    private async _selectFile() {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Markdown files': ['md']
            }
        });

        if (fileUris && fileUris.length > 0) {
            const targetUri = fileUris[0];
            try {
                const document = await vscode.workspace.openTextDocument(targetUri);
                console.log('_selectFile:loadMarkdownFile');
                this.loadMarkdownFile(document);
                vscode.window.showInformationMessage(`Kanban switched to: ${document.fileName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${error}`);
            }
        }
    }

    private _convertImagePaths(conversions: Array<{relativePath: string, absolutePath: string}>) {
        const pathMappings: {[key: string]: string} = {};
        
        for (const conversion of conversions) {
            try {
                // Convert absolute file path to webview URI
                const fileUri = vscode.Uri.file(conversion.absolutePath);
                const webviewUri = this._panel.webview.asWebviewUri(fileUri);
                pathMappings[conversion.relativePath] = webviewUri.toString();
            } catch (error) {
                console.error('Failed to convert image path:', conversion.absolutePath, error);
                // Fallback to original path
                pathMappings[conversion.relativePath] = conversion.relativePath;
            }
        }
        
        // Send the converted paths back to webview
        this._panel.webview.postMessage({
            type: 'imagePathsConverted',
            pathMappings: pathMappings
        });
    }

    private async _handleFileLink(href: string, currentDocumentPath: string) {
        try {
            let targetPath: string;
            
            if (href.startsWith('file://')) {
                // Handle file:// URLs
                targetPath = vscode.Uri.parse(href).fsPath;
            } else if (href.startsWith('/')) {
                // Absolute path
                targetPath = href;
            } else {
                // Relative path - resolve relative to current document
                const currentDir = path.dirname(currentDocumentPath);
                targetPath = path.resolve(currentDir, href);
            }
            
            // Check if file exists
            if (fs.existsSync(targetPath)) {
                // Open in VS Code
                const document = await vscode.workspace.openTextDocument(targetPath);
                await vscode.window.showTextDocument(document);
            } else {
                vscode.window.showWarningMessage(`File not found: ${targetPath}`);
            }
            
        } catch (error) {
            console.error('Error opening file link:', error);
            vscode.window.showErrorMessage(`Failed to open file: ${href}`);
        }
    }
    
    private async _initializeFile() {
        if (!this._document) {
            vscode.window.showErrorMessage('No document loaded');
            return;
        }

        this._isUpdatingFromPanel = true; // Set flag to prevent reload

        const kanbanHeader = "---\n\nkanban-plugin: board\n\n---\n\n";
        const currentContent = this._document.getText();
        const newContent = kanbanHeader + currentContent;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            this._document.uri,
            new vscode.Range(0, 0, this._document.lineCount, 0),
            newContent
        );
        
        try {
            console.log('applyEdit & save');
            await vscode.workspace.applyEdit(edit);
            await this._document.save();
            
            // Reload the file
            setTimeout(() => {
                console.log('_initializeFile:loadMarkdownFile');
                this.loadMarkdownFile(this._document!);
                this._isUpdatingFromPanel = false;
            }, 100);
            
            vscode.window.showInformationMessage('Kanban board initialized successfully');
        } catch (error) {
            this._isUpdatingFromPanel = false;
            vscode.window.showErrorMessage(`Failed to initialize file: ${error}`);
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
            
            // Clear undo/redo stacks when loading new file
            console.log('clearing undo & redo stack!');
            this._undoStack = [];
            this._redoStack = [];
        } catch (error) {
            console.error('Error parsing Markdown:', error);
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { valid:false, title: 'Error Loading Board', columns: [], yamlHeader: null, kanbanFooter: null };
        }
        this._sendBoardUpdate();
        this._sendFileInfo();
        this._sendUndoRedoStatus();
    }

    private _sendBoardUpdate() {
        if (!this._panel.webview) return;

        const board = this._board || { title: 'Please open a Markdown Kanban file', columns: [], yamlHeader: null, kanbanFooter: null };
        
        // Use setTimeout to ensure the webview is ready to receive messages
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'updateBoard',
                board: board
            });
        }, 10);
    }

    private _sendFileInfo() {
        if (!this._panel.webview) return;

        const fileInfo = {
            fileName: this._document ? path.basename(this._document.fileName) : 'No file loaded',
            filePath: this._document ? this._document.fileName : '',
            documentPath: this._document ? this._document.uri.fsPath : '', // Add this line
            isLocked: this._isFileLocked
        };

        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'updateFileInfo',
                fileInfo: fileInfo
            });
        }, 10);
}

    private editColumnTitle(columnId: string, title: string) {
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) return;
            
            column.title = title;
        });
    }

    private async saveToMarkdown() {
        if (!this._document || !this._board || !this._board.valid) return;

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

    private async performAction(action: () => void, saveUndo: boolean = true) {
        if (!this._board) return;
        
        // Save state for undo before performing action
        if (saveUndo) {
            this._saveStateForUndo();
        }
        
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

    private addTaskAtPosition(columnId: string, taskData: any, insertionIndex: number) {
        console.log(`addTaskAtPosition called: columnId=${columnId}, insertionIndex=${insertionIndex}`, taskData);
        
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) {
                console.error('Column not found:', columnId);
                return;
            }

            const newTask: KanbanTask = {
                id: this.generateId('task', columnId),
                title: taskData.title || '',
                description: taskData.description || ''
            };

            // Insert at specific position or append to end
            if (insertionIndex >= 0 && insertionIndex <= column.tasks.length) {
                console.log(`Inserting task at position ${insertionIndex} in column ${columnId}`);
                column.tasks.splice(insertionIndex, 0, newTask);
            } else {
                console.log(`Appending task to end of column ${columnId} (insertionIndex was ${insertionIndex})`);
                column.tasks.push(newTask);
            }
            
            console.log(`Task added successfully. Column now has ${column.tasks.length} tasks.`);
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
                title: result.task.title,
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