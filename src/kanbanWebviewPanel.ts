import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MarkdownKanbanParser, KanbanBoard } from './markdownParser';
import { FileManager, ImagePathMapping } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { MessageHandler } from './messageHandler';
import { BackupManager } from './backupManager';

export class KanbanWebviewPanel {
    private static panels: Map<string, KanbanWebviewPanel> = new Map();

    public static readonly viewType = 'markdownKanbanPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    
    // Main components
    private _fileManager: FileManager;
    private _undoRedoManager: UndoRedoManager;
    private _boardOperations: BoardOperations;
    private _linkHandler: LinkHandler;
    private _messageHandler: MessageHandler;

    private _backupManager: BackupManager;
    
    // State
    private _board?: KanbanBoard;
    private _isInitialized: boolean = false;
    public _isUpdatingFromPanel: boolean = false;  // Made public for external access
    private _lastDocumentVersion: number = -1;  // Track document version

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        console.log('🔧 DEBUG: KanbanWebviewPanel.createOrShow called with document:', document?.fileName);
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        // Clean up any stale panels first
        if (document) {
            const documentKey = document.uri.toString();
            console.log('🔧 DEBUG: Looking for existing panel with key:', documentKey);
            console.log('🔧 DEBUG: Current panels map size:', KanbanWebviewPanel.panels.size);
            console.log('🔧 DEBUG: Current panels keys:', Array.from(KanbanWebviewPanel.panels.keys()));
            
            const existingPanel = KanbanWebviewPanel.panels.get(documentKey);
            if (existingPanel) {
                console.log('🔧 DEBUG: Found existing panel, disposing it to create fresh one');
                // For debugging - always dispose existing panel and create fresh one
                try {
                    existingPanel.dispose();
                } catch (error) {
                    console.log('🔧 DEBUG: Error disposing existing panel:', error);
                }
                KanbanWebviewPanel.panels.delete(documentKey);
                console.log('🔧 DEBUG: Existing panel disposed and removed from map');
            } else {
                console.log('🔧 DEBUG: No existing panel found, will create new one');
            }
        }

        // Create a new panel
        const localResourceRoots = [extensionUri];
        
        // Add all workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            workspaceFolders.forEach(folder => {
                localResourceRoots.push(folder.uri);
            });
        }
        
        // Add document directory if it's outside workspace folders
        if (document) {
            const documentDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
            const isInWorkspace = workspaceFolders?.some(folder => 
                documentDir.fsPath.startsWith(folder.uri.fsPath)
            );
            
            if (!isInWorkspace) {
                localResourceRoots.push(documentDir);
            }
        }
        
        console.log('Creating webview with localResourceRoots:', localResourceRoots.map(uri => uri.fsPath));
        
        // Create panel with file-specific title
        const fileName = document ? path.basename(document.fileName) : 'Markdown Kanban';
        console.log('🔧 DEBUG: Creating webview panel with title:', `Kanban: ${fileName}`);
        const panel = vscode.window.createWebviewPanel(
            KanbanWebviewPanel.viewType,
            `Kanban: ${fileName}`,
            column,
            {
                enableScripts: true,
                localResourceRoots: localResourceRoots,
                retainContextWhenHidden: true,
                enableCommandUris: true
            }
        );
        console.log('🔧 DEBUG: Webview panel created successfully');

        const kanbanPanel = new KanbanWebviewPanel(panel, extensionUri, context);
        console.log('🔧 DEBUG: KanbanWebviewPanel instance created');

        // Store the panel in the map
        if (document) {
            console.log('🔧 DEBUG: Storing panel in map and loading document');
            KanbanWebviewPanel.panels.set(document.uri.toString(), kanbanPanel);
            kanbanPanel.loadMarkdownFile(document);
        }
        console.log('🔧 DEBUG: createOrShow completed successfully');
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        // ENHANCED: Set comprehensive permissions on revive
        const localResourceRoots = [extensionUri];
        
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            workspaceFolders.forEach(folder => {
                localResourceRoots.push(folder.uri);
            });
        }
        
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots,
        };
        
        console.log('Reviving webview with localResourceRoots:', localResourceRoots.map(uri => uri.fsPath));
        
        const kanbanPanel = new KanbanWebviewPanel(panel, extensionUri, context);
        // Don't store in map yet - will be stored when document is loaded
    }

    // Add this method to get a panel by document URI:
    public static getPanelForDocument(documentUri: string): KanbanWebviewPanel | undefined {
        return KanbanWebviewPanel.panels.get(documentUri);
    }

    // Add this method to get all panels:
    public static getAllPanels(): KanbanWebviewPanel[] {
        return Array.from(KanbanWebviewPanel.panels.values());
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        console.log('🔧 DEBUG: KanbanWebviewPanel constructor called');
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        // Initialize components
        this._fileManager = new FileManager(this._panel.webview, extensionUri);
        this._undoRedoManager = new UndoRedoManager(this._panel.webview);
        this._boardOperations = new BoardOperations();
        this._backupManager = new BackupManager();

        
        // REPLACE this line:
        this._linkHandler = new LinkHandler(
            this._fileManager, 
            this._panel.webview,
            this.handleLinkReplacement.bind(this) // ADD callback
        );

        // Initialize message handler with callbacks
        this._messageHandler = new MessageHandler(
            this._fileManager,
            this._undoRedoManager,
            this._boardOperations,
            this._linkHandler,
            {
                onBoardUpdate: this.sendBoardUpdate.bind(this),
                onSaveToMarkdown: this.saveToMarkdown.bind(this),
                onInitializeFile: this.initializeFile.bind(this),
                getCurrentBoard: () => this._board,
                setBoard: (board: KanbanBoard) => {
                    this._board = board;
                }
            }
        );

        this._initialize();
        this._setupEventListeners();
        
        // ENHANCED: Listen for workspace folder changes
        this._setupWorkspaceChangeListener();
        
        // Listen for document close events
        this._setupDocumentCloseListener();
        
        if (this._fileManager.getDocument()) {
            this.loadMarkdownFile(this._fileManager.getDocument()!);
        }
    }

    private async handleLinkReplacement(originalPath: string, newPath: string, isImage: boolean) {
        if (!this._board || !this._board.valid) { return; }

        this._undoRedoManager.saveStateForUndo(this._board);
        
        let modified = false;

        // Helper function to replace link in text
        const replaceLink = (text: string): string => {
            if (!text) { return text; }
            // Escape special regex characters in the original path
            const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            let out = text;
            let changed = false;

            // Image link pattern: ![alt](path)
            const imageRegex = new RegExp(`(!\\[[^\\]]*\\]\\()${escapedPath}(\\))`, 'g');
            if (imageRegex.test(out)) {
                out = out.replace(imageRegex, `~~$1${originalPath}$2~~ $1${newPath}$2`);
                changed = true;
            }

            // Regular link pattern: [text](path)
            const linkRegex = new RegExp(`(\\[[^\\]]+\\]\\()${escapedPath}(\\))`, 'g');
            if (linkRegex.test(out)) {
                out = out.replace(linkRegex, `~~$1${originalPath}$2~~ $1${newPath}$2`);
                changed = true;
            }

            // Wiki link pattern: [[target|label]] or [[target]]
            const wikiRegex = new RegExp(`(\\[\\[)\s*${escapedPath}(\\|[^\]]*)?(\\]\\])`, 'g');
            if (wikiRegex.test(out)) {
                out = out.replace(wikiRegex, (_m, p1, p2 = '', p3) => {
                    const labelPart = p2 || '';
                    return `~~${p1}${originalPath}${labelPart}${p3}~~ ${p1}${newPath}${labelPart}${p3}`;
                });
                changed = true;
            }

            return changed ? out : text;
        };

        // Search and replace in all columns and tasks
        for (const column of this._board.columns) {
            const newTitle = replaceLink(column.title);
            if (newTitle !== column.title) {
                column.title = newTitle;
                modified = true;
            }

            for (const task of column.tasks) {
                const newTaskTitle = replaceLink(task.title);
                if (newTaskTitle !== task.title) {
                    task.title = newTaskTitle;
                    modified = true;
                }

                if (task.description) {
                    const newDescription = replaceLink(task.description);
                    if (newDescription !== task.description) {
                        task.description = newDescription;
                        modified = true;
                    }
                }
            }
        }

        if (modified) {
            await this.saveToMarkdown();
            await this.sendBoardUpdate();
        }
    }

    /**
     * Setup listener for document close events to handle graceful degradation
     */
    private _setupDocumentCloseListener() {
        // Listen for document close events
        const documentCloseListener = vscode.workspace.onDidCloseTextDocument(document => {
            const currentDocument = this._fileManager.getDocument();
            if (currentDocument && currentDocument.uri.toString() === document.uri.toString()) {
                console.log('Current kanban document was closed:', document.fileName);
                
                // Clear the document reference
                // this._fileManager.setDocument(undefined as any);
                
                // Update the file info to show no file loaded
                this._fileManager.sendFileInfo();
                
                // Optionally show a message to the user
                // vscode.window.showInformationMessage(
                //     `Kanban document "${path.basename(document.fileName)}" was closed. Changes will not be saved until you open a new document.`,
                //     'Open File'
                // ).then(selection => {
                //     if (selection === 'Open File') {
                //         vscode.commands.executeCommand('markdown-kanban.switchFile');
                //     }
                // });
            }
        });
        
        this._disposables.push(documentCloseListener);
    }

    /**
     * Setup listener for workspace folder changes to update webview permissions
     */
    private _setupWorkspaceChangeListener() {
        // Listen for workspace folder changes
        const workspaceChangeListener = vscode.workspace.onDidChangeWorkspaceFolders(event => {
            console.log('Workspace folders changed, updating webview permissions');
            this._updateWebviewPermissions();
        });
        
        this._disposables.push(workspaceChangeListener);
    }

    /**
     * Update webview permissions to include all current workspace folders
     */
    private _updateWebviewPermissions() {
        const localResourceRoots = [this._extensionUri];
        
        // Add all current workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            workspaceFolders.forEach(folder => {
                localResourceRoots.push(folder.uri);
            });
        }
        
        // Add document directory if it's outside workspace folders
        if (this._fileManager.getDocument()) {
            const document = this._fileManager.getDocument()!;
            const documentDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
            const isInWorkspace = workspaceFolders?.some(folder => 
                documentDir.fsPath.startsWith(folder.uri.fsPath)
            );
            
            if (!isInWorkspace) {
                localResourceRoots.push(documentDir);
            }
        }
        
        // Update webview options
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots,
            enableCommandUris: true
        };
        
        console.log('Updated webview localResourceRoots:', localResourceRoots.map(uri => uri.fsPath));
        
        // Refresh the webview HTML to apply new permissions
        if (this._isInitialized) {
            this._panel.webview.html = this._getHtmlForWebview();
        }
    }

    private async _getTagConfiguration(): Promise<any> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const tagColors = config.get<any>('tagColors', {});
        return tagColors;
    }

    private async _getWhitespaceConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const whitespace = config.get<string>('whitespace', '4px');
        return whitespace;
    }

    private async _getMaxRowHeightConfiguration(): Promise<number> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const maxRowHeight = config.get<number>('maxRowHeight', 0);
        return maxRowHeight;
    }

    // Public methods for external access
    public isFileLocked(): boolean {
        return this._fileManager.isFileLocked();
    }

    public toggleFileLock(): void {
        this._fileManager.toggleFileLock();
    }

    public getCurrentDocumentUri(): vscode.Uri | undefined {
        return this._fileManager.getCurrentDocumentUri();
    }

    private _initialize() {
        console.log('🔧 DEBUG: _initialize called, isInitialized:', this._isInitialized);
        if (!this._isInitialized) {
            console.log('🔧 DEBUG: Setting webview HTML');
            this._panel.webview.html = this._getHtmlForWebview();
            this._isInitialized = true;
            console.log('🔧 DEBUG: Webview HTML set, panel initialized');
        }
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    // Only send file info, don't re-send board data unless necessary
                    this._fileManager.sendFileInfo();
                    
                    // Only ensure board if we don't have one
                    if (!this._board && this._fileManager.getDocument()) {
                        this._ensureBoardAndSendUpdate();
                    }
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            message => this._messageHandler.handleMessage(message),
            null,
            this._disposables
        );
    }

    private async _ensureBoardAndSendUpdate() {
        if (!this._board && this._fileManager.getDocument()) {
            try {
                this._board = MarkdownKanbanParser.parseMarkdown(this._fileManager.getDocument()!.getText());
                this._boardOperations.setOriginalTaskOrder(this._board);
            } catch (error) {
                this._board = { 
                    valid: false, 
                    title: 'Error Loading Board', 
                    columns: [], 
                    yamlHeader: null, 
                    kanbanFooter: null 
                };
            }
        }
        
        await this.sendBoardUpdate();
    }

    public async loadMarkdownFile(document: vscode.TextDocument) {
        if (this._isUpdatingFromPanel) {
            console.log('Skipping load - currently updating from panel');
            return;
        }
        
        // Check if this is a genuine external change
        const currentVersion = document.version;
        const isExternalChange = this._lastDocumentVersion !== -1 && 
                                this._lastDocumentVersion !== currentVersion - 1;
        
        if (isExternalChange) {
            console.log('External change detected - reloading board');
        }
        
        this._lastDocumentVersion = currentVersion;
        
        const documentChanged = this._fileManager.getDocument()?.uri.toString() !== document.uri.toString();
        
        // If document changed, update panel tracking
        if (documentChanged) {
            // Remove this panel from old document tracking
            const oldDocUri = this._fileManager.getDocument()?.uri.toString();
            if (oldDocUri && KanbanWebviewPanel.panels.get(oldDocUri) === this) {
                KanbanWebviewPanel.panels.delete(oldDocUri);
            }
            
            // Add to new document tracking
            KanbanWebviewPanel.panels.set(document.uri.toString(), this);
            
            // Update panel title
            const fileName = path.basename(document.fileName);
            this._panel.title = `Kanban: ${fileName}`;
        }
        
        this._fileManager.setDocument(document);
        
        if (documentChanged) {
            this._updateWebviewPermissions();
            
            // Create initial backup
            await this._backupManager.createBackup(document);
            
            // Start periodic backup timer
            this._backupManager.startPeriodicBackup(document);
        }
        
        try {
            this._board = MarkdownKanbanParser.parseMarkdown(document.getText());
            
            // Clean up any duplicate row tags
            const wasModified = this._boardOperations.cleanupRowTags(this._board);
            if (wasModified) {
                console.log('Cleaned up duplicate row tags in loaded board');
            }
            
            this._boardOperations.setOriginalTaskOrder(this._board);
            
            // Only clear undo history on document change or external edit
            if (documentChanged || isExternalChange) {
                this._undoRedoManager.clear();
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { 
                valid: false, 
                title: 'Error Loading Board', 
                columns: [], 
                yamlHeader: null, 
                kanbanFooter: null 
            };
        }
        
        await this.sendBoardUpdate();
        this._fileManager.sendFileInfo();
    }

    private async sendBoardUpdate() {
        if (!this._panel.webview) { return; }

        let board = this._board || { 
            valid: false, 
            title: 'Please open a Markdown Kanban file', 
            columns: [], 
            yamlHeader: null, 
            kanbanFooter: null 
        };
        
        // Generate image path mappings without modifying the board content
        const imageMappings = await this._generateImageMappings(board);
        
        // Get tag configuration
        const tagColors = await this._getTagConfiguration();
        
        const whitespace = await this._getWhitespaceConfiguration();
        
        const showRowTags = await this._getShowRowTagsConfiguration();
        
        const maxRowHeight = await this._getMaxRowHeightConfiguration();
            
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'updateBoard',
                board: board,
                imageMappings: imageMappings,
                tagColors: tagColors,
                whitespace: whitespace,
                showRowTags: showRowTags,
                maxRowHeight: maxRowHeight
            });
        }, 10);
    }


    private async _generateImageMappings(board: KanbanBoard): Promise<ImagePathMapping> {
        const mappings: ImagePathMapping = {};
        
        if (!board.valid || !this._fileManager.getDocument()) {
            return mappings;
        }

        // Collect all content that might contain images
        for (const column of board.columns) {
            if (column.title) {
                const titleMappings = await this._fileManager.generateImagePathMappings(column.title);
                Object.assign(mappings, titleMappings);
            }
            
            for (const task of column.tasks) {
                if (task.title) {
                    const titleMappings = await this._fileManager.generateImagePathMappings(task.title);
                    Object.assign(mappings, titleMappings);
                }
                if (task.description) {
                    const descMappings = await this._fileManager.generateImagePathMappings(task.description);
                    Object.assign(mappings, descMappings);
                }
            }
        }

        return mappings;
    }

    private async saveToMarkdown() {
        let document = this._fileManager.getDocument();
        if (!document || !this._board || !this._board.valid) {
            console.warn('Cannot save: no document or invalid board');
            return;
        }

        this._isUpdatingFromPanel = true;
        
        try {
            // Check if document is still valid/open
            const isDocumentOpen = vscode.workspace.textDocuments.some(doc => 
                doc.uri.toString() === document!.uri.toString()
            );
            
            if (!isDocumentOpen) {
                console.log('Document is closed, reopening in background for save...');
                
                // Reopen the document in the background
                try {
                    const reopenedDoc = await vscode.workspace.openTextDocument(document.uri);
                    // Update the file manager with the reopened document
                    this._fileManager.setDocument(reopenedDoc);
                    document = reopenedDoc;
                    console.log('Document reopened successfully in background');
                } catch (reopenError) {
                    console.error('Failed to reopen document:', reopenError);
                    vscode.window.showErrorMessage(
                        `Cannot save changes: Failed to reopen "${path.basename(document.fileName)}". The file may have been deleted or moved.`
                    );
                    return;
                }
            }
            
            const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(0, 0, document.lineCount, 0),
                markdown
            );
            
            const success = await vscode.workspace.applyEdit(edit);
            if (!success) {
                throw new Error('Failed to apply workspace edit');
            }
            
            // Update document version after successful edit
            this._lastDocumentVersion = document.version + 1;
            
            // Try to save the document
            try {
                await document.save();
            } catch (saveError) {
                // If save fails, it might be because the document was closed
                console.warn('Failed to save document:', saveError);
                
                // Check if the document is still open
                const stillOpen = vscode.workspace.textDocuments.some(doc => 
                    doc.uri.toString() === document!.uri.toString()
                );
                
                if (!stillOpen) {
                    vscode.window.showWarningMessage(
                        `Changes applied but could not save: "${path.basename(document.fileName)}" was closed during the save operation.`
                    );
                } else {
                    throw saveError; // Re-throw if it's a different error
                }
            }
            
            // After successful save, create a backup
            if (success) {
                await this._backupManager.createBackup(document);
            }
                        
        } catch (error) {
            console.error('Error saving to markdown:', error);
            vscode.window.showErrorMessage(`Failed to save kanban changes: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            setTimeout(() => {
                this._isUpdatingFromPanel = false;
            }, 1000);
        }
    }

    private async initializeFile() {
        const document = this._fileManager.getDocument();
        if (!document) {
            vscode.window.showErrorMessage('No document loaded');
            return;
        }

        // Check if document is still open
        const isDocumentOpen = vscode.workspace.textDocuments.some(doc => 
            doc.uri.toString() === document.uri.toString()
        );
        
        if (!isDocumentOpen) {
            vscode.window.showWarningMessage(
                `Cannot initialize: "${path.basename(document.fileName)}" has been closed. Please reopen the file.`,
                'Open File'
            ).then(selection => {
                if (selection === 'Open File') {
                    vscode.workspace.openTextDocument(document.uri).then(reopenedDoc => {
                        this.loadMarkdownFile(reopenedDoc);
                        vscode.window.showTextDocument(reopenedDoc);
                    });
                }
            });
            return;
        }

        this._isUpdatingFromPanel = true;

        const kanbanHeader = "---\n\nkanban-plugin: board\n\n---\n\n";
        const currentContent = document.getText();
        const newContent = kanbanHeader + currentContent;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            newContent
        );
        
        try {
            await vscode.workspace.applyEdit(edit);
            await document.save();
            
            setTimeout(() => {
                this.loadMarkdownFile(document);
                this._isUpdatingFromPanel = false;
            }, 100);
            
            vscode.window.showInformationMessage('Kanban board initialized successfully');
        } catch (error) {
            this._isUpdatingFromPanel = false;
            vscode.window.showErrorMessage(`Failed to initialize file: ${error}`);
        }
    }

    private _getHtmlForWebview() {
        const filePath = vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html', 'webview.html'));
        let html = fs.readFileSync(filePath.fsPath, 'utf8');

        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;
        
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; script-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">`;
        
        if (!html.includes('Content-Security-Policy')) {
            html = html.replace('<head>', `<head>\n    ${cspMeta}`);
        }
        
        // ENHANCED: Build comprehensive localResourceRoots for cross-workspace access
        const localResourceRoots = [this._extensionUri];
        
        // Add ALL workspace folders (not just the one containing current document)
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            workspaceFolders.forEach(folder => {
                localResourceRoots.push(folder.uri);
            });
        }
        
        // Add document-specific paths if available
        if (this._fileManager.getDocument()) {
            const document = this._fileManager.getDocument()!;
            const documentDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
            
            // Only add document dir if it's not already covered by workspace folders
            const isInWorkspace = workspaceFolders?.some(folder => 
                documentDir.fsPath.startsWith(folder.uri.fsPath)
            );
            
            if (!isInWorkspace) {
                localResourceRoots.push(documentDir);
            }

            const baseHref = this._panel.webview.asWebviewUri(documentDir).toString() + '/';
            html = html.replace(/<head>/, `<head><base href="${baseHref}">`);

            // Try to use local markdown-it, but keep CDN as fallback
            try {
                const markdownItPath = vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js');
                if (fs.existsSync(markdownItPath.fsPath)) {
                    const markdownItUri = this._panel.webview.asWebviewUri(markdownItPath);
                    html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/markdown-it\/13\.0\.2\/markdown-it\.min\.js"><\/script>/, `<script src="${markdownItUri}"></script>`);
                }
                // If local file doesn't exist, keep the CDN version in HTML
            } catch (error) {
                // If there's any error, keep the CDN version in HTML
                console.warn('Failed to load local markdown-it, using CDN version:', error);
            }
        }
        
        // Apply the enhanced localResourceRoots
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots
        };
        
        console.log('Webview localResourceRoots:', localResourceRoots.map(uri => uri.fsPath));
        
        const webviewDir = this._panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html'))
        );
        
        html = html.replace(/href="webview\.css"/, `href="${webviewDir}/webview.css"`);
        
        // Replace all JavaScript file references
        const jsFiles = [
            'markdownRenderer.js',
            'taskEditor.js', 
            'boardRenderer.js',
            'dragDrop.js',
            'menuOperations.js',
            'search.js',
            'webview.js'
        ];
        
        jsFiles.forEach(jsFile => {
            html = html.replace(
                new RegExp(`src="${jsFile}"`, 'g'), 
                `src="${webviewDir}/${jsFile}"`
            );
        });

        return html;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose() {
        console.log('🔧 DEBUG: Disposing KanbanWebviewPanel');
        // Remove from panels map
        const documentUri = this._fileManager.getDocument()?.uri.toString();
        if (documentUri && KanbanWebviewPanel.panels.get(documentUri) === this) {
            console.log('🔧 DEBUG: Removing panel from map for URI:', documentUri);
            KanbanWebviewPanel.panels.delete(documentUri);
        }
        
        // Stop backup timer
        this._backupManager.dispose();
        
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
        console.log('🔧 DEBUG: Panel disposal completed');
    }

    /**
     * Debug method to check webview permissions and image resolution
     * ---
     * You can call this method from the VS Code command palette or after loading a document
     * Add to your extension.ts if you want a debug command:
     *  const debugCommand = vscode.commands.registerCommand('markdown-kanban.debugPermissions', () => {
     *      if (KanbanWebviewPanel.currentPanel) {
     *          KanbanWebviewPanel.currentPanel.debugWebviewPermissions();
     *      } else {
     *          vscode.window.showWarningMessage('No kanban panel is open');
     *      }
     *  });
     *  context.subscriptions.push(debugCommand);
     */
    public debugWebviewPermissions() {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const currentDocument = this._fileManager.getDocument();
        
        console.log('=== WEBVIEW PERMISSIONS DEBUG ===');
        
        console.log('Workspace folders:');
        workspaceFolders?.forEach((folder, i) => {
            console.log(`  ${i + 1}. ${folder.name}: ${folder.uri.fsPath}`);
        });
        
        console.log('Current document:', currentDocument?.uri.fsPath || 'None');
        
        console.log('Webview localResourceRoots:');
        const options = this._panel.webview.options as any;
        options?.localResourceRoots?.forEach((root: vscode.Uri, i: number) => {
            console.log(`  ${i + 1}. ${root.fsPath}`);
        });
        
        console.log('Current board images:');
        if (this._board?.valid) {
            this._board.columns.forEach(column => {
                column.tasks.forEach(task => {
                    const imageMatches = [
                        ...(task.title?.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || []),
                        ...(task.description?.match(/!\[([^\]]*)\]\(([^)]+)\)/g) || [])
                    ];
                    
                    imageMatches.forEach(match => {
                        const src = match.match(/\(([^)]+)\)/)?.[1];
                        if (src) {
                            console.log(`  Image: ${src}`);
                            
                            // Test if this image would be accessible
                            this._fileManager.resolveFilePath(src).then(resolution => {
                                if (resolution?.exists) {
                                    const webviewUri = this._panel.webview.asWebviewUri(
                                        vscode.Uri.file(resolution.resolvedPath)
                                    );
                                    console.log(`    Resolved: ${resolution.resolvedPath}`);
                                    console.log(`    Webview URI: ${webviewUri.toString()}`);
                                } else {
                                    console.log(`    NOT FOUND - attempted paths:`, resolution?.attemptedPaths);
                                }
                            });
                        }
                    });
                });
            });
        }
        
        console.log('=== END DEBUG ===');
    }

    private async _getShowRowTagsConfiguration(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const showRowTags = config.get<boolean>('showRowTags', false);
        return showRowTags;
    }
}
