import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MarkdownKanbanParser, KanbanBoard, KanbanTask, KanbanColumn } from './markdownParser';

// Deep clone helper for board state
function deepCloneBoard(board: KanbanBoard): KanbanBoard {
    // return structuredClone(board);
    return JSON.parse(JSON.stringify(board));
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
                KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
            }
            return;
        }

        // Get workspace folders to include in localResourceRoots
        const workspaceFolders = vscode.workspace.workspaceFolders?.map(folder => folder.uri) || [];
        
        const panel = vscode.window.createWebviewPanel(
            KanbanWebviewPanel.viewType,
            'Markdown Kanban',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    extensionUri,
                    ...workspaceFolders,
                    // Add the document's directory if available
                    ...(document ? [vscode.Uri.file(path.dirname(document.uri.fsPath))] : [])
                ],
                retainContextWhenHidden: true,
                enableCommandUris: true
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
            const { fileName, dropPosition, activeEditor } = message;
            const isImage = this._isImageFile(fileName);
            
            // Use consistent path resolution for dropped files
            let relativePath = await this._getSmartRelativePath(fileName);
            
            const fileInfo = {
                fileName,
                relativePath,
                isImage,
                activeEditor,
                dropPosition
            };

            this._panel.webview.postMessage({
                type: 'insertFileLink',
                fileInfo: fileInfo
            });
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to handle file drop: ${error}`);
        }
    }

    private async _handleUriDrop(message: any) {
        try {
            const { uris, dropPosition, activeEditor } = message;
            
            for (const uriString of uris) {
                let uri: vscode.Uri;
                try {
                    if (uriString.startsWith('file://')) {
                        uri = vscode.Uri.parse(uriString);
                    } else {
                        uri = vscode.Uri.file(uriString);
                    }
                } catch (parseError) {
                    continue;
                }
                
                const fileName = path.basename(uri.fsPath);
                const isImage = this._isImageFile(fileName);
                
                // Use smart relative path that will work with our resolution logic
                const relativePath = await this._getSmartRelativePath(uri.fsPath);
                
                const fileInfo = {
                    fileName,
                    relativePath,
                    isImage,
                    activeEditor,
                    dropPosition
                };
                
                this._panel.webview.postMessage({
                    type: 'insertFileLink',
                    fileInfo: fileInfo
                });
                
                break; // Only handle the first file for now
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to handle URI drop: ${error}`);
        }
    }

    // Smart relative path generator that creates the shortest working path
    private async _getSmartRelativePath(filePath: string): Promise<string> {
        if (!this._document) {
            return path.basename(filePath);
        }
        
        const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(filePath);
        
        // Try to make relative to document first
        const documentDir = path.dirname(this._document.uri.fsPath);
        const docRelative = path.relative(documentDir, absolutePath);
        
        // If the relative path goes up too many levels, try workspace relative
        const upLevels = (docRelative.match(/\.\.[\\\/]/g) || []).length;
        
        if (upLevels > 2) {
            // Try relative to workspace root instead
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders) {
                for (const folder of workspaceFolders) {
                    const workspaceRelative = path.relative(folder.uri.fsPath, absolutePath);
                    const workspaceUpLevels = (workspaceRelative.match(/\.\.[\\\/]/g) || []).length;
                    
                    // Use workspace relative if it's simpler
                    if (workspaceUpLevels < upLevels) {
                        return workspaceRelative.replace(/\\/g, '/');
                    }
                }
            }
        }
        
        // Use document relative path (convert backslashes for cross-platform compatibility)
        return docRelative.replace(/\\/g, '/');
    }

    private _handleImageConversionRequest(imageReferences: string[]) {
        const pathMappings = this._convertImagePaths(imageReferences);
        
        this._panel.webview.postMessage({
            type: 'imagePathsConverted',
            pathMappings: pathMappings
        });
    }

    private async _convertImageToBase64(imagePath: string): Promise<string | null> {
        try {
            const imageUri = vscode.Uri.file(imagePath);
            const imageData = await vscode.workspace.fs.readFile(imageUri);
            const base64 = Buffer.from(imageData).toString('base64');
            const ext = path.extname(imagePath).toLowerCase().substring(1);
            const mimeType = this._getImageMimeType(ext);
            return `data:${mimeType};base64,${base64}`;
        } catch (error) {
            console.error('Failed to convert image to base64:', error);
            return null;
        }
    }

    private _getImageMimeType(ext: string): string {
        const mimeTypes: { [key: string]: string } = {
            'jpg': 'image/jpeg',
            'jpeg': 'image/jpeg',
            'png': 'image/png',
            'gif': 'image/gif',
            'svg': 'image/svg+xml',
            'bmp': 'image/bmp',
            'webp': 'image/webp'
        };
        return mimeTypes[ext] || 'image/png';
    }

    // Add this method to scan and convert existing images in the board
    // private async _processExistingImages() {
    //     if (!this._board || !this._document) return;
        
    //     const documentDir = path.dirname(this._document.uri.fsPath);
    //     const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    //     const pathMappings: { [key: string]: string } = {};
        
    //     for (const column of this._board.columns) {
    //         for (const task of column.tasks) {
    //             // Process title and description for image links
    //             const allText = `${task.title || ''}\n${task.description || ''}`;
    //             let match;
                
    //             while ((match = imagePattern.exec(allText)) !== null) {
    //                 const imagePath = match[2];
                    
    //                 // Skip if already a data URI or webview URI
    //                 if (imagePath.startsWith('data:') || imagePath.startsWith('vscode-webview://')) {
    //                     continue;
    //                 }
                    
    //                 // Convert relative path to absolute, then to webview URI
    //                 const absolutePath = path.isAbsolute(imagePath) 
    //                     ? imagePath 
    //                     : path.join(documentDir, imagePath);
                    
    //                 try {
    //                     const imageUri = vscode.Uri.file(absolutePath);
    //                     await vscode.workspace.fs.stat(imageUri);
    //                     const webviewUri = this._panel.webview.asWebviewUri(imageUri);
    //                     pathMappings[imagePath] = webviewUri.toString();
    //                 } catch (error) {
    //                     console.log(`Could not process image: ${imagePath}`);
    //                 }
    //             }
    //         }
    //     }
        
    //     // Send path mappings to webview if any were found
    //     if (Object.keys(pathMappings).length > 0) {
    //         this._panel.webview.postMessage({
    //             type: 'updateImagePaths',
    //             pathMappings: pathMappings
    //         });
    //     }
    // }

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
                this._handleFileDrop(message);
                break;
            case 'handleUriDrop':
                this._handleUriDrop(message);
                break;
            
            // case 'convertImagePaths':
            //     this._convertImagePathsFromMessage(message.imageReferences);
            //     break;
            case 'openFileLink':
                this._handleFileLink(message.href);
                break;
            case 'openExternalLink':
                vscode.env.openExternal(vscode.Uri.parse(message.href));
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
                this.addTask(message.columnId, message.taskData);
                break;
            case 'addTaskAtPosition':
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
                this.loadMarkdownFile(document);
                vscode.window.showInformationMessage(`Kanban switched to: ${document.fileName}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${error}`);
            }
        }
    }

    private _convertImagePaths(imageReferences: string[]): {[key: string]: string} {
        const pathMappings: {[key: string]: string} = {};
        
        if (!this._document) {
            return pathMappings;
        }
        
        const documentDir = path.dirname(this._document.uri.fsPath);
        
        for (const imagePath of imageReferences) {
            try {
                let absolutePath: string;
                
                if (path.isAbsolute(imagePath)) {
                    absolutePath = imagePath;
                } else {
                    // Resolve relative to document directory
                    absolutePath = path.resolve(documentDir, imagePath);
                }
                
                // Check if file exists
                if (fs.existsSync(absolutePath)) {
                    const fileUri = vscode.Uri.file(absolutePath);
                    const webviewUri = this._panel.webview.asWebviewUri(fileUri);
                    pathMappings[imagePath] = webviewUri.toString();
                } else {
                    console.warn('Image file not found:', absolutePath);
                    pathMappings[imagePath] = imagePath; // Keep original as fallback
                }
            } catch (error) {
                console.error('Failed to convert image path:', imagePath, error);
                pathMappings[imagePath] = imagePath; // Keep original as fallback
            }
        }
        
        return pathMappings;
    }

    private _extractImageReferences(board: KanbanBoard): string[] {
        const imageReferences = new Set<string>();
        const imageRegex = /!\[.*?\]\(([^)]+)\)/g;
        
        // Extract from column titles
        board.columns.forEach(column => {
            if (column.title) {
                let match;
                while ((match = imageRegex.exec(column.title)) !== null) {
                    imageReferences.add(match[1]);
                }
            }
            
            // Extract from task titles and descriptions
            column.tasks.forEach(task => {
                if (task.title) {
                    let match;
                    imageRegex.lastIndex = 0; // Reset regex
                    while ((match = imageRegex.exec(task.title)) !== null) {
                        imageReferences.add(match[1]);
                    }
                }
                
                if (task.description) {
                    let match;
                    imageRegex.lastIndex = 0; // Reset regex
                    while ((match = imageRegex.exec(task.description)) !== null) {
                        imageReferences.add(match[1]);
                    }
                }
            });
        });
        
        return Array.from(imageReferences);
    }

    private _convertImagePathsFromMessage(imageReferences: string[]) {
        const pathMappings = this._convertImagePaths(imageReferences);
        
        this._panel.webview.postMessage({
            type: 'imagePathsConverted',
            pathMappings: pathMappings
        });
    }

    private async _handleFileLink(href: string) {
        try {
            if (!this._document) {
                vscode.window.showErrorMessage('No document is currently loaded');
                return;
            }

            // Clean up the href - remove any file:// prefix for processing
            let cleanPath = href;
            if (cleanPath.startsWith('file://')) {
                cleanPath = vscode.Uri.parse(cleanPath).fsPath;
            }

            // Handle wiki links - add .md extension if not present
            const isWikiLink = !path.extname(cleanPath) && !cleanPath.includes('://');
            if (isWikiLink) {
                cleanPath = cleanPath + '.md';
            }

            // Rule 1: Check if path is absolute
            const isAbsolute = this._isAbsolutePath(cleanPath);
            
            if (isAbsolute) {
                // Try to open as absolute path
                if (await this._fileExists(cleanPath)) {
                    await this._openFile(cleanPath);
                    return;
                } else {
                    vscode.window.showWarningMessage(`File not found: ${cleanPath}`);
                    return;
                }
            }
            
            // Rule 2: Try relative to current document
            const currentDir = path.dirname(this._document.uri.fsPath);
            const documentRelativePath = path.resolve(currentDir, cleanPath);
            
            if (await this._fileExists(documentRelativePath)) {
                await this._openFile(documentRelativePath);
                return;
            }
            
            // Rule 3: Try relative to each workspace folder
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                for (const workspaceFolder of workspaceFolders) {
                    const workspaceRelativePath = path.join(workspaceFolder.uri.fsPath, cleanPath);
                    if (await this._fileExists(workspaceRelativePath)) {
                        await this._openFile(workspaceRelativePath);
                        return;
                    }
                }
            }
            
            // If still not found, show more helpful error with attempted paths
            const attemptedPaths = [
                `Document relative: ${documentRelativePath}`,
                ...(workspaceFolders?.map(w => 
                    `Workspace relative: ${path.join(w.uri.fsPath, cleanPath)}`
                ) || [])
            ];
            
            vscode.window.showWarningMessage(
                `File not found: ${cleanPath}\n\nSearched in:\n${attemptedPaths.join('\n')}`
            );
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to open file: ${href} - ${error}`);
        }
    }

    private async _fileExists(filePath: string): Promise<boolean> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.workspace.fs.stat(uri);
            return true;
        } catch {
            return false;
        }
    }

    private _isAbsolutePath(filePath: string): boolean {
        // Check for Windows drive letters (C:, D:, etc.)
        if (/^[a-zA-Z]:/.test(filePath)) {
            return true;
        }
        
        // Check for Unix/Mac absolute paths (starts with /)
        if (filePath.startsWith('/')) {
            return true;
        }
        
        // Check for Windows UNC paths (\\server\share)
        if (filePath.startsWith('\\\\')) {
            return true;
        }
        
        // Use path.isAbsolute as fallback
        return path.isAbsolute(filePath);
    }

    private async _openFile(targetPath: string) {
        try {
            const uri = vscode.Uri.file(targetPath);
            const stat = await vscode.workspace.fs.stat(uri);
            
            if (stat.type === vscode.FileType.Directory) {
                // Open folder in OS explorer
                vscode.commands.executeCommand('revealFileInOS', uri);
            } else {
                // Get configuration for how to open files
                const config = vscode.workspace.getConfiguration('markdownKanban');
                const openInNewTab = config.get<boolean>('openLinksInNewTab', false);
                
                // Open file in VS Code
                const document = await vscode.workspace.openTextDocument(uri);
                
                if (openInNewTab) {
                    // Open in a new tab (beside current)
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        viewColumn: vscode.ViewColumn.Beside
                    });
                } else {
                    // Open in current tab (replace current editor)
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        preserveFocus: false
                    });
                }
            }
        } catch (error) {
            throw new Error(`Failed to open ${targetPath}: ${error}`);
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
            await vscode.workspace.applyEdit(edit);
            await this._document.save();
            
            // Reload the file
            setTimeout(() => {
                this.loadMarkdownFile(this._document!);
                this._isUpdatingFromPanel = false;
            }, 100);
            
            vscode.window.showInformationMessage('Kanban board initialized successfully');
        } catch (error) {
            this._isUpdatingFromPanel = false;
            vscode.window.showErrorMessage(`Failed to initialize file: ${error}`);
        }
    }
    
    public async loadMarkdownFile(document: vscode.TextDocument) {
        // Don't reload if we're the ones who just updated the document
        if (this._isUpdatingFromPanel) {
            return;
        }
        
        const documentChanged = this._document?.uri.toString() !== document.uri.toString();
        this._document = document;
        
        // If document changed, we need to refresh the HTML to update base href
        if (documentChanged) {
            this._panel.webview.html = this._getHtmlForWebview();
        }
        
        try {
            // Parse the markdown - keep original paths in board data
            this._board = MarkdownKanbanParser.parseMarkdown(document.getText());
            
            // DO NOT modify the board data with webview URIs
            // Keep original markdown paths in the data structure
            
            // Store original task order
            this._board.columns.forEach(column => {
                this._originalTaskOrder.set(column.id, column.tasks.map(t => t.id));
            });
            
            this._undoStack = [];
            this._redoStack = [];
            
        } catch (error) {
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { valid:false, title: 'Error Loading Board', columns: [], yamlHeader: null, kanbanFooter: null };
        }
        
        // this._sendBoardUpdate();
        this._sendFileInfo();
        this._sendUndoRedoStatus();
    }

    // private _sendBoardUpdate() {
    //     if (!this._panel.webview) return;

    //     let board = this._board || { valid: false, title: 'Please open a Markdown Kanban file', columns: [], yamlHeader: null, kanbanFooter: null };
        
    //     // Create a display version of the board with converted image paths
    //     const displayBoard = this._createDisplayBoard(board);
        
    //     setTimeout(() => {
    //         this._panel.webview.postMessage({
    //             type: 'updateBoard',
    //             board: displayBoard
    //         });
    //     }, 10);
    // }

    // private _createDisplayBoard(board: KanbanBoard): KanbanBoard {
    //     if (!board.valid || !this._document) {
    //         return board;
    //     }

    //     // Deep clone the board to avoid modifying original
    //     const displayBoard: KanbanBoard = JSON.parse(JSON.stringify(board));
    //     const documentDir = path.dirname(this._document.uri.fsPath);

    //     // Convert image paths for display only
    //     // displayBoard.columns.forEach(column => {
    //     //     column.tasks.forEach(task => {
    //     //         if (task.title) {
    //     //             task.title = this._convertImagePathsForDisplay(task.title, documentDir);
    //     //         }
    //     //         if (task.description) {
    //     //             task.description = this._convertImagePathsForDisplay(task.description, documentDir);
    //     //         }
    //     //     });
    //     // });

    //     return displayBoard;
    // }

    // Updated method to convert all image paths in the board for display
    private async _createDisplayBoard(board: KanbanBoard): Promise<KanbanBoard> {
        if (!board.valid || !this._document) {
            return board;
        }

        // Deep clone the board to avoid modifying original
        const displayBoard: KanbanBoard = JSON.parse(JSON.stringify(board));
        
        // Collect all image paths that need conversion
        const imagePaths = new Set<string>();
        const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
        
        // Extract image paths from all content
        displayBoard.columns.forEach(column => {
            // Check column title for images
            if (column.title) {
                let match;
                while ((match = imagePattern.exec(column.title)) !== null) {
                    imagePaths.add(match[2]);
                }
            }
            
            // Check tasks for images
            column.tasks.forEach(task => {
                if (task.title) {
                    let match;
                    imagePattern.lastIndex = 0;
                    while ((match = imagePattern.exec(task.title)) !== null) {
                        imagePaths.add(match[2]);
                    }
                }
                if (task.description) {
                    let match;
                    imagePattern.lastIndex = 0;
                    while ((match = imagePattern.exec(task.description)) !== null) {
                        imagePaths.add(match[2]);
                    }
                }
            });
        });
            
        // Create mapping of original paths to webview URIs
        const pathMappings: { [key: string]: string } = {};
        
        for (const imagePath of imagePaths) {
            const webviewUri = await this._processImageForWebview(imagePath);
            if (webviewUri !== imagePath) {
                pathMappings[imagePath] = webviewUri;
            }
        }
        
        // Apply the mappings to the display board
        displayBoard.columns.forEach(column => {
            if (column.title) {
                column.title = this._replaceImagePaths(column.title, pathMappings);
            }
            
            column.tasks.forEach(task => {
                if (task.title) {
                    task.title = this._replaceImagePaths(task.title, pathMappings);
                }
                if (task.description) {
                    task.description = this._replaceImagePaths(task.description, pathMappings);
                }
            });
        });
        
        return displayBoard;
    }


    // Helper to replace image paths in text
    private _replaceImagePaths(text: string, pathMappings: { [key: string]: string }): string {
        const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
        
        return text.replace(imagePattern, (match, alt, imagePath) => {
            const mappedPath = pathMappings[imagePath];
            if (mappedPath) {
                return `![${alt}](${mappedPath})`;
            }
            return match;
        });
    }

    // Update sendBoardUpdate to use async display board creation
    private async _sendBoardUpdate() {
        if (!this._panel.webview) return;

        let board = this._board || { 
            valid: false, 
            title: 'Please open a Markdown Kanban file', 
            columns: [], 
            yamlHeader: null, 
            kanbanFooter: null 
        };
        
        // Create a display version of the board with converted image paths
        const displayBoard = await this._createDisplayBoard(board);
        
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'updateBoard',
                board: displayBoard
            });
        }, 10);
    }

    // private _convertImagePathsForDisplay(content: string, documentDir: string): string {
    //     if (!content) return content;

    //     const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        
    //     return content.replace(imageRegex, (match, alt, imagePath) => {
    //         // Skip if already converted or external
    //         if (imagePath.startsWith('vscode-webview://') || 
    //             imagePath.startsWith('http://') || 
    //             imagePath.startsWith('https://') ||
    //             imagePath.startsWith('data:')) {
    //             return match;
    //         }
            
    //         try {
    //             // Convert to absolute path
    //             const absolutePath = path.isAbsolute(imagePath) 
    //                 ? imagePath 
    //                 : path.resolve(documentDir, imagePath);
                
    //             const imageUri = vscode.Uri.file(absolutePath);
                
    //             // Check if file exists synchronously for display
    //             if (fs.existsSync(absolutePath)) {
    //                 const webviewUri = this._panel.webview.asWebviewUri(imageUri);
    //                 return `![${alt}](${webviewUri.toString()})`;
    //             } else {
    //                 // Return error placeholder for display
    //                 return `![ERROR: ${imagePath}](data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg'%3E%3Ctext%3EFile not found%3C/text%3E%3C/svg%3E)`;
    //             }
    //         } catch (error) {
    //             return match; // Return original on error
    //         }
    //     });
    // }

    // private async editTask(taskId: string, columnId: string, taskData: any) {
    //     await this.performAction(async () => {
    //         const result = this.findTask(columnId, taskId);
    //         if (!result) return;

    //         // DO NOT preprocess image paths here - keep original markdown paths
    //         // The conversion will happen only for display in _createDisplayBoard
    //         Object.assign(result.task, {*
    //             title: taskData.title,
    //             description: taskData.description
    //         });
    //     });
    // }

    private async editTask(taskId: string, columnId: string, taskData: any) {
        await this.performAction(async () => {
            const result = this.findTask(columnId, taskId);
            if (!result) return;

            // Process image paths in edited content
            // if (taskData.title) {
            //     taskData.title = await this._preprocessImagePaths(taskData.title);
            // }
            // if (taskData.description) {
            //     taskData.description = await this._preprocessImagePaths(taskData.description);
            // }

            Object.assign(result.task, {
                valid: taskData.valid,
                title: taskData.title,
                description: taskData.description
            });
        });
    }

    private _sendFileInfo() {
        if (!this._panel.webview) return;

        const fileInfo = {
            fileName: this._document ? path.basename(this._document.fileName) : 'No file loaded',
            filePath: this._document ? this._document.fileName : '',
            documentPath: this._document ? this._document.uri.fsPath : '',
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

    private async performAction(action: (() => void) | (() => Promise<void>), saveUndo: boolean = true) {
        if (!this._board) return;
        
        if (saveUndo) {
            this._saveStateForUndo();
        }
        
        await action();
        await this.saveToMarkdown();
        this._sendBoardUpdate();
    }

    // private async _fixAllImagePaths() {
    //     if (!this._board || !this._board.valid) return;
        
    //     let hasChanges = false;
        
    //     // for (const column of this._board.columns) {
    //     //     for (const task of column.tasks) {
    //     //         // Process title
    //     //         if (task.title) {
    //     //             const processed = await this._preprocessImagePaths(task.title);
    //     //             if (processed !== task.title) {
    //     //                 task.title = processed;
    //     //                 hasChanges = true;
    //     //             }
    //     //         }
    //     //         // Process description
    //     //         if (task.description) {
    //     //             const processed = await this._preprocessImagePaths(task.description);
    //     //             if (processed !== task.description) {
    //     //                 task.description = processed;
    //     //                 hasChanges = true;
    //     //             }
    //     //         }
    //     //     }
    //     // }
        
    //     if (hasChanges) {
    //         await this.saveToMarkdown();
    //         this._sendBoardUpdate();
    //         vscode.window.showInformationMessage('Image paths have been updated');
    //     }
    // }

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
        this.performAction(() => {
            const column = this.findColumn(columnId);
            if (!column) {
                return;
            }

            const newTask: KanbanTask = {
                id: this.generateId('task', columnId),
                title: taskData.title || '',
                description: taskData.description || ''
            };

            // Insert at specific position or append to end
            if (insertionIndex >= 0 && insertionIndex <= column.tasks.length) {
                column.tasks.splice(insertionIndex, 0, newTask);
            } else {
                column.tasks.push(newTask);
            }
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

    private async _processImageForWebview(imagePath: string): Promise<string> {
        if (!this._document) return imagePath;
        
        // Skip if already a webview URI or external URL
        if (imagePath.startsWith('vscode-webview://') || 
            imagePath.startsWith('http://') || 
            imagePath.startsWith('https://') ||
            imagePath.startsWith('data:')) {
            return imagePath;
        }
        
        let resolvedPath: string | null = null;
        
        // Check if absolute path
        if (this._isAbsolutePath(imagePath)) {
            if (await this._fileExists(imagePath)) {
                resolvedPath = imagePath;
            }
        } else {
            // Try relative to document first
            const documentDir = path.dirname(this._document.uri.fsPath);
            const documentRelativePath = path.resolve(documentDir, imagePath);
            
            if (await this._fileExists(documentRelativePath)) {
                resolvedPath = documentRelativePath;
            } else {
                // Try relative to workspace folders
                const workspaceFolders = vscode.workspace.workspaceFolders;
                if (workspaceFolders) {
                    for (const folder of workspaceFolders) {
                        const workspaceRelativePath = path.join(folder.uri.fsPath, imagePath);
                        if (await this._fileExists(workspaceRelativePath)) {
                            resolvedPath = workspaceRelativePath;
                            break;
                        }
                    }
                }
            }
        }
        
        // Convert resolved path to webview URI
        if (resolvedPath) {
            try {
                const imageUri = vscode.Uri.file(resolvedPath);
                const webviewUri = this._panel.webview.asWebviewUri(imageUri);
                return webviewUri.toString();
            } catch (error) {
                console.error(`Failed to convert image to webview URI: ${imagePath}`, error);
            }
        }
        
        // Return original if not found or conversion failed
        return imagePath;
    }

    private _getHtmlForWebview() {
        // console.log('MDKB: !!! GENERATING HTML !!!');
        
        const filePath = vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html', 'webview.html'));
        let html = fs.readFileSync(filePath.fsPath, 'utf8');

        // CSP MUST be added
        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;
        
        // This MUST be in the HTML
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; script-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">`;
        
        // Make sure it's added
        if (!html.includes('Content-Security-Policy')) {
            html = html.replace('<head>', `<head>\n    ${cspMeta}`);
        }
        
        // Resource roots
        const localResourceRoots = [this._extensionUri];
        if (this._document) {
            const documentDir = vscode.Uri.file(path.dirname(this._document.uri.fsPath));
            const baseHref = this._panel.webview.asWebviewUri(documentDir).toString() + '/';
            // define the source path for files relative path
            html = html.replace(/<head>/, `<head><base href="${baseHref}">`);

            const markdownItUri = this._panel.webview.asWebviewUri(
                vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js')
            );
            html = html.replace(/<head>/, `<script src="${markdownItUri}"></script>`);

            localResourceRoots.push(vscode.Uri.file(path.dirname(this._document.uri.fsPath)));
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(this._document.uri);
            if (workspaceFolder) {
                localResourceRoots.push(workspaceFolder.uri);
            }
        }
        
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots
        };
        
        // Convert paths
        const webviewDir = this._panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html'))
        );
        
        html = html.replace(/href="webview\.css"/, `href="${webviewDir}/webview.css"`);
        html = html.replace(/src="webview\.js"/, `src="${webviewDir}/webview.js"`);

        return html;
    }

    // Helper to generate nonce for CSP
    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    // private async _replaceAsyncImages(
    //     str: string, 
    //     regex: RegExp, 
    //     asyncFn: (match: string, alt: string, imagePath: string) => Promise<string>
    // ): Promise<string> {
    //     const matches: Array<{match: string, alt: string, path: string, index: number}> = [];
    //     let m;
        
    //     while ((m = regex.exec(str)) !== null) {
    //         matches.push({
    //             match: m[0],
    //             alt: m[1],
    //             path: m[2],
    //             index: m.index
    //         });
    //     }
        
    //     // Process all matches
    //     let result = str;
    //     let offset = 0;
        
    //     for (const matchInfo of matches) {
    //         const replacement = await asyncFn(matchInfo.match, matchInfo.alt, matchInfo.path);
    //         const startIndex = matchInfo.index + offset;
    //         const endIndex = startIndex + matchInfo.match.length;
            
    //         result = result.substring(0, startIndex) + replacement + result.substring(endIndex);
    //         offset += replacement.length - matchInfo.match.length;
    //     }
        
    //     return result;
    // }

    // private async _replaceAsync(
    //     str: string, 
    //     regex: RegExp, 
    //     asyncFn: (match: string, ...args: string[]) => Promise<string>
    // ): Promise<string> {
    //     const promises: Promise<string>[] = [];
    //     str.replace(regex, (match: string, ...args: any[]): string => {
    //         promises.push(asyncFn(match, ...args));
    //         return match;
    //     });
    //     const data = await Promise.all(promises);
    //     return str.replace(regex, () => data.shift()!);
    // }

    public dispose() {
        KanbanWebviewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }
}