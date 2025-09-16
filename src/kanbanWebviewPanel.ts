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
import { CacheManager } from './cacheManager';
import { ExternalFileWatcher, FileChangeType } from './externalFileWatcher';

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
    private _cacheManager: CacheManager;
    
    // State
    private _board?: KanbanBoard;
    private _isInitialized: boolean = false;
    public _isUpdatingFromPanel: boolean = false;  // Made public for external access
    private _lastDocumentVersion: number = -1;  // Track document version
    private _isUndoRedoOperation: boolean = false;  // Track undo/redo operations
    private _unsavedChangesCheckInterval?: NodeJS.Timeout;  // Periodic unsaved changes check
    private _hasUnsavedChanges: boolean = false;  // Track unsaved changes at panel level
    private _cachedBoardFromWebview: any = null;  // Store the latest cached board from webview
    private _isClosingPrevented: boolean = false;  // Flag to prevent recursive closing attempts

    // Include file tracking
    private _includedFiles: string[] = [];
    private _includeFilesChanged: boolean = false;
    private _changedIncludeFiles: Set<string> = new Set();
    private _includeFileContents: Map<string, string> = new Map();
    private _fileWatcher: ExternalFileWatcher;

    // External modification tracking
    private _lastKnownFileContent: string = '';
    private _hasExternalUnsavedChanges: boolean = false;

    // Method to force refresh webview content (useful during development)
    public async refreshWebviewContent() {
        if (this._panel && this._board) {
            this._panel.webview.html = this._getHtmlForWebview();
            
            // Send the board data to the refreshed webview
            setTimeout(async () => {
                this._panel.webview.postMessage({
                    type: 'updateBoard',
                    board: this._board,
                    columnWidth: this._getColumnWidthConfiguration(),
                    taskMinHeight: this._getTaskMinHeightConfiguration(),
                    fontSize: this._getFontSizeConfiguration(),
                    fontFamily: this._getFontFamilyConfiguration(),
                    whitespace: this._getWhitespaceConfiguration(),
                    layoutRows: this._getLayoutRowsConfiguration(),
                    rowHeight: this._getRowHeightConfiguration(),
                    showRowTags: this._getShowRowTagsConfiguration(),
                    maxRowHeight: this._getMaxRowHeightConfiguration(),
                    tagColors: await this._getTagConfiguration()
                });
            }, 100);
        }
    }

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        const column = vscode.window.activeTextEditor?.viewColumn || vscode.ViewColumn.One;

        // Check if a panel already exists for this document
        if (document) {
            const existingPanel = KanbanWebviewPanel.panels.get(document.uri.toString());
            if (existingPanel && existingPanel._panel) {
                // Panel exists, just reveal it
                existingPanel._panel.reveal(column);
                
                // Update the file info to ensure context is maintained
                existingPanel._fileManager.sendFileInfo();
                
                // Ensure the board is up to date
                existingPanel.loadMarkdownFile(document);
                return;
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
        
        // Create panel with file-specific title
        const fileName = document ? path.basename(document.fileName) : 'Markdown Kanban';
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

        const kanbanPanel = new KanbanWebviewPanel(panel, extensionUri, context);

        // Store the panel in the map and load document
        if (document) {
            KanbanWebviewPanel.panels.set(document.uri.toString(), kanbanPanel);
            // Load immediately - webview will request data when ready
            kanbanPanel.loadMarkdownFile(document);
        }
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
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        // Initialize components
        this._fileManager = new FileManager(this._panel.webview, extensionUri);
        this._undoRedoManager = new UndoRedoManager(this._panel.webview);
        this._boardOperations = new BoardOperations();
        this._backupManager = new BackupManager();
        this._cacheManager = new CacheManager();

        
        // REPLACE this line:
        this._linkHandler = new LinkHandler(
            this._fileManager,
            this._panel.webview,
            this.handleLinkReplacement.bind(this) // ADD callback
        );

        // Get the file watcher instance
        this._fileWatcher = ExternalFileWatcher.getInstance();

        // Set up document change listener to track external unsaved modifications
        this.setupDocumentChangeListener();

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
                },
                setUndoRedoOperation: (isOperation: boolean) => {
                    this._isUndoRedoOperation = isOperation;
                },
                getWebviewPanel: () => this,
                saveWithBackup: this._createUnifiedBackup.bind(this),
                markUnsavedChanges: (hasChanges: boolean, cachedBoard?: any) => {
                    // console.log(`[Save Debug] markUnsavedChanges callback - hasChanges: ${hasChanges}, previousHasUnsaved: ${this._hasUnsavedChanges}, hasCachedBoard: ${!!cachedBoard}`);
                    this._hasUnsavedChanges = hasChanges;
                    if (hasChanges) {
                        // Track when unsaved changes occur for backup timing
                        this._backupManager.markUnsavedChanges();
                    }
                    if (cachedBoard) {
                        // CRITICAL: Store the cached board data immediately for saving
                        // This ensures we always have the latest data even if webview is disposed
                        // console.log(`[Save Debug] Updating board from cached data - title: ${cachedBoard.title}, columns: ${cachedBoard.columns?.length}`);
                        this._board = cachedBoard;
                        this._cachedBoardFromWebview = cachedBoard; // Keep a separate reference
                    }
                }
            }
        );

        this._initialize();
        this._setupEventListeners();
        
        // ENHANCED: Listen for workspace folder changes
        this._setupWorkspaceChangeListener();
        
        // Listen for document close events
        this._setupDocumentCloseListener();
        
        // Document will be loaded via loadMarkdownFile call from createOrShow
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
                // Update the file info to show no file loaded
                this._fileManager.sendFileInfo();
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

    private async _getTaskMinHeightConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const taskMinHeight = config.get<string>('taskMinHeight', 'auto');
        return taskMinHeight;
    }

    private async _getFontSizeConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const fontSize = config.get<string>('fontSize', 'small');
        return fontSize;
    }

    private async _getFontFamilyConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const fontFamily = config.get<string>('fontFamily', 'system');
        return fontFamily;
    }

    private async _getColumnWidthConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const columnWidth = config.get<string>('columnWidth', 'medium');
        return columnWidth;
    }

    private async _getLayoutRowsConfiguration(): Promise<number> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const layoutRows = config.get<number>('layoutRows', 1);
        return layoutRows;
    }

    private async _getRowHeightConfiguration(): Promise<string> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const rowHeight = config.get<string>('rowHeight', 'auto');
        return rowHeight;
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
        if (!this._isInitialized) {
            this._panel.webview.html = this._getHtmlForWebview();
            this._isInitialized = true;
        }
    }

    private _setupEventListeners() {
        // Handle panel disposal - check for unsaved changes first
        this._panel.onDidDispose(async () => {
            await this._handlePanelClose();
        }, null, this._disposables);

        // View state change handler
        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    // Panel became visible - send file info and ensure board
                    this._fileManager.sendFileInfo();
                    
                    // Only ensure board if we don't have one
                    if (!this._board && this._fileManager.getDocument()) {
                        this._ensureBoardAndSendUpdate();
                    }
                }
                // Note: Unsaved changes are now handled via page visibility events in webview.js
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                console.log(`[Cache Backend] Received message:`, message.type, message);

                if (message.type === 'undo' || message.type === 'redo') {
                }

                try {
                    await this._messageHandler.handleMessage(message);
                } catch (error) {
                    console.error('[WEBVIEW PANEL ERROR] Error handling message:', error);
                    if (error instanceof Error) {
                        console.error('[WEBVIEW PANEL ERROR] Stack trace:', error.stack);
                    }
                }
            },
            null,
            this._disposables
        );
    }

    private async _ensureBoardAndSendUpdate() {
        if (!this._board && this._fileManager.getDocument()) {
            try {
                const document = this._fileManager.getDocument()!;
                const basePath = path.dirname(document.uri.fsPath);
                const parseResult = MarkdownKanbanParser.parseMarkdown(document.getText(), basePath);
                this._board = parseResult.board;
                this._includedFiles = parseResult.includedFiles;

                // Register included files with the external file watcher
                await this._initializeIncludeFileContents();
                this._fileWatcher.updateIncludeFiles(this, this._includedFiles);

                // Re-check if any include files have changed after load
                await this._recheckIncludeFileChanges();

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


    public async loadMarkdownFile(document: vscode.TextDocument, isFromEditorFocus: boolean = false, forceReload: boolean = false) {
        console.log(`[loadMarkdownFile] Called - isFromEditorFocus: ${isFromEditorFocus}, forceReload: ${forceReload}, isUpdatingFromPanel: ${this._isUpdatingFromPanel}`);

        if (this._isUpdatingFromPanel) {
            console.log('[loadMarkdownFile] Skipping - currently updating from panel');
            return;
        }
        
        // Ensure file watcher is always set up for the current document
        const currentDocumentUri = this._fileManager.getDocument()?.uri.toString();
        const isDifferentDocument = currentDocumentUri !== document.uri.toString();
        const isFirstFileLoad = !this._fileManager.getDocument();

        // Set up file watcher if needed (first load or different document)
        if (isFirstFileLoad || isDifferentDocument) {
            console.log(`[File Watcher] Setting up watcher - firstLoad: ${isFirstFileLoad}, different: ${isDifferentDocument}`);

            // Clean up old watcher if switching documents
            if (isDifferentDocument && currentDocumentUri) {
                console.log(`[File Watcher] Cleaning up old watcher for: ${currentDocumentUri}`);
                // Note: We'll clean this up in the document changed section below
            }
        }

        // 🛑 STRICT POLICY: Only reload board in these specific cases:
        // 1. Initial panel creation (no existing board)
        // 2. Switching to a different document
        // 3. User explicitly forces reload via dialog
        const isInitialLoad = !this._board;

        if (!isInitialLoad && !isDifferentDocument && !forceReload) {
            // 🚫 NEVER auto-reload: Preserve existing board state

            // But notify user if external changes detected (but NOT on editor focus)
            const hasExternalChanges = this._lastDocumentVersion !== -1 &&
                                     this._lastDocumentVersion < document.version &&
                                     !this._isUndoRedoOperation &&
                                     !this._isUpdatingFromPanel &&
                                     !isFromEditorFocus; // Don't show dialog on editor focus

            console.log(`[External Change Check] lastVersion: ${this._lastDocumentVersion}, currentVersion: ${document.version}, isUndoRedo: ${this._isUndoRedoOperation}, isUpdating: ${this._isUpdatingFromPanel}, isFromFocus: ${isFromEditorFocus}, hasChanges: ${hasExternalChanges}`);

            if (hasExternalChanges) {
                console.log('[External Change] Showing notification dialog');
                await this.notifyExternalChanges(document);
            } else {
                // Only update version if no external changes were detected (to avoid blocking future detections)
                this._lastDocumentVersion = document.version;
            }
            return;
        }
        
        const previousDocument = this._fileManager.getDocument();
        const documentChanged = previousDocument?.uri.toString() !== document.uri.toString();
        const isFirstDocumentLoad = !previousDocument;

        // If document changed or this is the first document, update panel tracking
        if (documentChanged || isFirstDocumentLoad) {
            // Remove this panel from old document tracking
            const oldDocUri = previousDocument?.uri.toString();
            if (oldDocUri && KanbanWebviewPanel.panels.get(oldDocUri) === this) {
                KanbanWebviewPanel.panels.delete(oldDocUri);
                // Unregister the old main file from the watcher
                this._fileWatcher.unregisterFile(previousDocument!.uri.fsPath, this);
            }

            // Add to new document tracking
            KanbanWebviewPanel.panels.set(document.uri.toString(), this);

            // Update panel title
            const fileName = path.basename(document.fileName);
            this._panel.title = `Kanban: ${fileName}`;

            // Register the new main file with the external file watcher
            console.log(`[File Watcher] Registering main file: ${document.uri.fsPath}`);
            this._fileWatcher.registerFile(document.uri.fsPath, 'main', this);
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
            // ✅ ALLOWED: Loading board (initial load, different document, or force reload)
            const basePath = path.dirname(document.uri.fsPath);
            const parseResult = MarkdownKanbanParser.parseMarkdown(document.getText(), basePath);

            // Update version tracking
            this._lastDocumentVersion = document.version;

            // Handle undo/redo history
            if (isDifferentDocument && !this._isUndoRedoOperation && !this._isUpdatingFromPanel) {
                // Only clear history when switching to completely different documents
                this._undoRedoManager.clear();
            }

            // Update the board
            this._board = parseResult.board;
            this._includedFiles = parseResult.includedFiles;

            // Update our baseline of known file content
            this.updateKnownFileContent(document.getText());

            // Update included files with the external file watcher
            // First, preserve existing include file content baselines to maintain change detection
            const preservedContents = new Map(this._includeFileContents);

            await this._initializeIncludeFileContents();
            console.log(`[Include Debug] Registering ${this._includedFiles.length} include files:`, this._includedFiles);
            this._fileWatcher.updateIncludeFiles(this, this._includedFiles);

            // Re-check if any include files have changed after reload/update
            // Use preserved baselines to maintain change detection across reloads
            await this._recheckIncludeFileChanges(preservedContents);

            // Clean up any duplicate row tags
            const wasModified = this._boardOperations.cleanupRowTags(this._board);
            this._boardOperations.setOriginalTaskOrder(this._board);

            // Clear unsaved changes flag after successful reload
            if (forceReload) {
                this._hasUnsavedChanges = false;
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
        
        // Connect UndoRedoManager with CacheManager for undo cache persistence
        this._undoRedoManager.setCacheManager(this._cacheManager, document);
        
        await this.sendBoardUpdate(false, forceReload);
        this._fileManager.sendFileInfo();
    }

    private async sendBoardUpdate(applyDefaultFolding: boolean = false, isFullRefresh: boolean = false) {
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
        
        const taskMinHeight = await this._getTaskMinHeightConfiguration();
        
        const fontSize = await this._getFontSizeConfiguration();
        
        const fontFamily = await this._getFontFamilyConfiguration();
        
        const columnWidth = await this._getColumnWidthConfiguration();
        
        const layoutRows = await this._getLayoutRowsConfiguration();
        
        const rowHeight = await this._getRowHeightConfiguration();
        
        const showRowTags = await this._getShowRowTagsConfiguration();
        
        const maxRowHeight = await this._getMaxRowHeightConfiguration();
            
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'updateBoard',
                board: board,
                imageMappings: imageMappings,
                tagColors: tagColors,
                whitespace: whitespace,
                taskMinHeight: taskMinHeight,
                fontSize: fontSize,
                fontFamily: fontFamily,
                columnWidth: columnWidth,
                layoutRows: layoutRows,
                rowHeight: rowHeight,
                showRowTags: showRowTags,
                maxRowHeight: maxRowHeight,
                applyDefaultFolding: applyDefaultFolding,
                isFullRefresh: isFullRefresh
            });
        }, 10);

        // Create cache file for crash recovery (only for valid boards with actual content)
        if (board.valid && board.columns && board.columns.length > 0) {
            const document = this._fileManager.getDocument();
            if (document) {
                await this._cacheManager.createCacheFile(document, board);
            }
        }
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

    private async saveToMarkdown(updateVersionTracking: boolean = true) {
        console.log(`💾 Saving kanban to markdown... hasUnsavedChanges: ${this._hasUnsavedChanges}`);
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
                // Reopen the document in the background
                try {
                    const reopenedDoc = await vscode.workspace.openTextDocument(document.uri);
                    // Update the file manager with the reopened document
                    this._fileManager.setDocument(reopenedDoc);
                    document = reopenedDoc;
                } catch (reopenError) {
                    console.error('Failed to reopen document:', reopenError);
                    vscode.window.showErrorMessage(
                        `Cannot save changes: Failed to reopen "${path.basename(document.fileName)}". The file may have been deleted or moved.`
                    );
                    return;
                }
            }
            
            const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
            console.log(`[Save Debug] Generated markdown preview (first 200 chars): ${markdown.substring(0, 200)}...`);

            // Check for external unsaved changes before proceeding
            const canProceed = await this.checkForExternalUnsavedChanges();
            if (!canProceed) {
                console.log('📄 Save cancelled due to external conflicts');
                return;
            }

            // Check if content has actually changed before applying edit
            const currentContent = document.getText();
            console.log(`[Save Debug] Current content length: ${currentContent.length}, Generated markdown length: ${markdown.length}`);
            console.log(`[Save Debug] hasUnsavedChanges: ${this._hasUnsavedChanges}, hasExternalUnsaved: ${this._hasExternalUnsavedChanges}`);
            console.log(`[Save Debug] Content comparison: ${currentContent === markdown ? 'EQUAL' : 'DIFFERENT'}`);

            if (currentContent === markdown) {
                // No changes needed, skip the edit to avoid unnecessary re-renders
                console.log('📄 No changes detected, skipping save');
                this._hasUnsavedChanges = false;
                return;
            }

            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                document.uri,
                new vscode.Range(0, 0, document.lineCount, 0),
                markdown
            );

            const success = await vscode.workspace.applyEdit(edit);
            
            if (!success) {
                // VS Code's applyEdit can return false even when successful
                // Check if the document actually contains our changes before failing
                console.warn('⚠️ workspace.applyEdit returned false, checking if changes were applied...');
                
                // Small delay to let the edit settle
                await new Promise(resolve => setTimeout(resolve, 100));
                
                // Check if the document content matches what we tried to write
                const currentContent = document.getText();
                const expectedContent = markdown;
                
                if (currentContent === expectedContent) {
                } else {
                    console.error('❌ Changes were not applied - this is a real failure');
                    
                    // Find the first difference
                    for (let i = 0; i < Math.max(expectedContent.length, currentContent.length); i++) {
                        if (expectedContent[i] !== currentContent[i]) {
                            break;
                        }
                    }
                    
                    throw new Error('Failed to apply workspace edit: Content mismatch detected');
                }
            }
            
            // Update document version after successful edit (only if tracking is enabled)
            if (updateVersionTracking) {
                this._lastDocumentVersion = document.version + 1;
            }
            
            // Try to save the document
            try {
                await document.save();
                
                // Clean up cache files after successful save
                await this._cacheManager.cleanupCacheFiles(document);
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
            await this._backupManager.createBackup(document);
            
            // Clear unsaved changes flag after successful save
            this._hasUnsavedChanges = false;

            // Update our baseline after successful save
            console.log(`[Save Debug] Updating known file content after successful save (length: ${markdown.length})`);
            this.updateKnownFileContent(markdown);
        } catch (error) {
            console.error('Error saving to markdown:', error);
            
            // Provide more specific error messages based on the error type
            let errorMessage = 'Failed to save kanban changes';
            if (error instanceof Error) {
                if (error.message.includes('Content mismatch detected')) {
                    errorMessage = 'Failed to save kanban changes: The document content could not be updated properly';
                } else if (error.message.includes('Failed to apply workspace edit')) {
                    errorMessage = 'Failed to save kanban changes: Unable to apply changes to the document';
                } else if (error.message.includes('Failed to reopen document')) {
                    errorMessage = 'Failed to save kanban changes: The document could not be accessed for writing';
                } else {
                    errorMessage = `Failed to save kanban changes: ${error.message}`;
                }
            } else {
                errorMessage = `Failed to save kanban changes: ${String(error)}`;
            }
            
            vscode.window.showErrorMessage(errorMessage);
            
            // Also send error to webview for frontend error handling
            this._panel.webview.postMessage({
                type: 'saveError',
                error: error instanceof Error ? error.message : String(error)
            });
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
        
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; media-src ${cspSource} https: data: blob:; script-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource}; frame-src 'none';">`;
        
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
        
        
        const webviewDir = this._panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this._context.extensionPath, 'dist', 'src', 'html'))
        );
        
        // Add cache-busting timestamp for development
        const timestamp = Date.now();
        const isDevelopment = !this._context.extensionMode || this._context.extensionMode === vscode.ExtensionMode.Development;
        const cacheBuster = isDevelopment ? `?v=${timestamp}` : '';
        
        html = html.replace(/href="webview\.css"/, `href="${webviewDir}/webview.css${cacheBuster}"`);
        
        // Replace all JavaScript file references
        const jsFiles = [
            'runtime-tracker.js',
            'markdownRenderer.js',
            'taskEditor.js',
            'boardRenderer.js',
            'dragDrop.js',
            'menuOperations.js',
            'search.js',
            'webview.js',
            'markdown-it-media-browser.js',
            'markdown-it-multicolumn-browser.js',
            'markdown-it-mark-browser.js',
            'markdown-it-sub-browser.js',
            'markdown-it-sup-browser.js',
            'markdown-it-ins-browser.js',
            'markdown-it-strikethrough-alt-browser.js',
            'markdown-it-underline-browser.js',
            'markdown-it-abbr-browser.js',
            'markdown-it-container-browser.js',
            'markdown-it-include-browser.js'
        ];
        
        jsFiles.forEach(jsFile => {
            html = html.replace(
                new RegExp(`src="${jsFile}"`, 'g'), 
                `src="${webviewDir}/${jsFile}${cacheBuster}"`
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

    private async _handlePanelClose() {
        // Check if there are unsaved changes before closing
        if (this._hasUnsavedChanges && !this._isClosingPrevented) {
            this._isClosingPrevented = true;
            
            // Use the cached board that was already sent when changes were made
            if (this._cachedBoardFromWebview) {
                this._board = this._cachedBoardFromWebview;
            }
            
            const document = this._fileManager.getDocument();
            const fileName = document ? path.basename(document.fileName) : 'the kanban board';
            const choice = await vscode.window.showWarningMessage(
                `You have unsaved changes in "${fileName}". Do you want to save before closing?`,
                { modal: true },
                { title: 'Save and close' },
                { title: 'Close without saving' },
                { title: 'Repeat this question (Esc)', isCloseAffordance: true }
            );

            if (!choice || choice.title === 'Repeat this question (Esc)') {
                // User pressed Escape or clicked the repeat option - reset and try again
                this._isClosingPrevented = false;
                this._handlePanelClose(); // Recursively call to show dialog again
                return;
            }

            if (choice.title === 'Save and close') {
                try {
                    // Save the changes before closing
                    await this.saveToMarkdown();
                    this._hasUnsavedChanges = false;
                    this._cachedBoardFromWebview = null; // Clear after save
                    // Allow disposal to continue
                    this.dispose();
                } catch (error) {
                    // If save fails, show error and prevent closing
                    vscode.window.showErrorMessage(`Failed to save changes: ${error instanceof Error ? error.message : String(error)}`);
                    this._isClosingPrevented = false;
                    return;
                }
            } else if (choice.title === 'Close without saving') {
                // User explicitly chose to close without saving
                this._hasUnsavedChanges = false;
                this._cachedBoardFromWebview = null; // Clear cached board
                this.dispose();
            }
        } else {
            // No unsaved changes, proceed with normal disposal
            this.dispose();
        }
    }

    public async dispose() {

        // Clear unsaved changes flag and prevent closing flags
        this._hasUnsavedChanges = false;
        this._isClosingPrevented = false;

        // Stop unsaved changes monitoring
        if (this._unsavedChangesCheckInterval) {
            clearInterval(this._unsavedChangesCheckInterval);
            this._unsavedChangesCheckInterval = undefined;
        }

        // Unregister from external file watcher
        this._fileWatcher.unregisterPanel(this);

        // Remove from panels map
        const documentUri = this._fileManager.getDocument()?.uri.toString();
        if (documentUri && KanbanWebviewPanel.panels.get(documentUri) === this) {
            KanbanWebviewPanel.panels.delete(documentUri);
        }

        // Stop backup timer
        this._backupManager.dispose();
        this._cacheManager.dispose();

        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }

    public get backupManager(): BackupManager {
        return this._backupManager;
    }

    private async _createUnifiedBackup(label: string = 'conflict'): Promise<void> {
        const document = this._fileManager.getDocument();
        if (!document) {return;}

        try {
            if (label === 'conflict' && this._board) {
                // For conflict backups, save the current board state (before external reload)
                // This preserves unsaved internal changes
                const currentBoardMarkdown = MarkdownKanbanParser.generateMarkdown(this._board);
                const backupPath = await this._createBoardStateBackup(currentBoardMarkdown, label);

                // Show notification with backup filename (like the old system did)
                const backupFileName = path.basename(backupPath);
                vscode.window.showInformationMessage(
                    `Internal kanban changes backed up as: ${backupFileName}`,
                    'Open backup file'
                ).then((choice) => {
                    if (choice === 'Open backup file') {
                        const backupUri = vscode.Uri.file(backupPath);
                        vscode.workspace.openTextDocument(backupUri).then(backupDocument => {
                            vscode.window.showTextDocument(backupDocument);
                        });
                    }
                });
            } else {
                // For other backup types (page hidden, etc.), use document content
                await this._backupManager.createBackup(document, {
                    label: label,
                    forceCreate: true
                });
            }

            console.log(`Created ${label} backup for "${path.basename(document.fileName)}"`);
        } catch (error) {
            console.error(`Error creating ${label} backup:`, error);
        }
    }

    private async _createBoardStateBackup(boardMarkdown: string, label: string): Promise<string> {
        const document = this._fileManager.getDocument()!;
        const originalPath = document.uri.fsPath;
        const pathParts = originalPath.split('.');
        const extension = pathParts.pop();
        const basePath = pathParts.join('.');

        // Use standardized timestamp format: YYYYMMDDTHHmmss
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const backupPath = `${basePath}-${label}-${timestamp}.${extension}`;

        // Write backup file with board state as markdown
        const backupUri = vscode.Uri.file(backupPath);
        await vscode.workspace.fs.writeFile(backupUri, Buffer.from(boardMarkdown, 'utf8'));

        return backupPath;
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
        
    }

    private async _getShowRowTagsConfiguration(): Promise<boolean> {
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const showRowTags = config.get<boolean>('showRowTags', false);
        return showRowTags;
    }


    /**
     * Notify user about external changes without forcing reload
     */
    private async notifyExternalChanges(document: vscode.TextDocument): Promise<void> {
        const fileName = path.basename(document.fileName);
        // const hasUnsavedChanges = this._hasUnsavedChanges;

        // if (!hasUnsavedChanges) {
        //     // No unsaved changes - simple reload option
        //     const reloadButton = { title: 'Reload from file' };
        //     const ignoreButton = { title: 'Ignore external changes' };

        //     const choice = await vscode.window.showInformationMessage(
        //         `The file "${fileName}" has been modified externally.`,
        //         reloadButton,
        //         ignoreButton
        //     );

        //     if (choice === reloadButton) {
        //         await this.forceReloadFromFile();
        //     }
        //     return;
        // }

        // Has unsaved changes - full option set
        const discardChanges = { title: 'Discard kanban changes and reload' };
        const saveBackup = { title: 'Save as backup and load external' };
        const discardExternal = { title: 'Discard external changes and save kanban' };
        const ignoreExternal = { title: 'Ignore external changes, dont overwrite (esc)', isCloseAffordance: true };

        const choice = await vscode.window.showWarningMessage(
            `The file "${fileName}" has been modified externally. Your current kanban changes may be lost if you reload the file.`,
            { modal: true },
            discardChanges,
            saveBackup,
            discardExternal,
            ignoreExternal
        );

        if (choice === ignoreExternal) {
            // User wants to keep working with current state - do nothing
            return;
        } else if (choice === discardExternal) {
            // User wants to save current kanban state and ignore external changes
            // Don't update version tracking to continue detecting future external changes
            await this.saveToMarkdown(false);
            return;
        } else if (choice === saveBackup) {
            // Save current board state as backup before reloading
            await this._createUnifiedBackup('conflict');
            // Save current state to undo history before reloading
            if (this._board) {
                this._undoRedoManager.saveStateForUndo(this._board);
            }
            await this.forceReloadFromFile();
            // Version tracking is already handled by forceReloadFromFile
            return;
        } else if (choice === discardChanges) {
            // User chose to discard current changes and reload from external file
            // Save current state to undo history before reloading
            if (this._board) {
                this._undoRedoManager.saveStateForUndo(this._board);
            }
            await this.forceReloadFromFile();
            // Version tracking is already handled by forceReloadFromFile
            return;
        } else {
            // User pressed escape or no choice - default to ignore external changes
            return;
        }
    }

    /**
     * Setup document change listener to track external modifications
     */
    private setupDocumentChangeListener(): void {
        const disposable = vscode.workspace.onDidChangeTextDocument((event) => {
            const currentDocument = this._fileManager.getDocument();
            if (currentDocument && event.document === currentDocument) {
                // Document was modified externally (not by our kanban save operation)
                if (!this._isUpdatingFromPanel) {
                    this._hasExternalUnsavedChanges = true;
                    console.log('[External Modification] Detected unsaved external changes');
                }
            }
        });
        this._disposables.push(disposable);
    }

    /**
     * Check for external unsaved changes when about to save
     */
    private async checkForExternalUnsavedChanges(): Promise<boolean> {
        const document = this._fileManager.getDocument();
        if (!document || !this._hasExternalUnsavedChanges) {
            return true; // No conflicts, safe to save
        }

        const currentContent = document.getText();
        const hasRealChanges = currentContent !== this._lastKnownFileContent;

        if (!hasRealChanges) {
            // False alarm - no real external changes
            this._hasExternalUnsavedChanges = false;
            return true;
        }

        // Real external unsaved changes detected
        const fileName = path.basename(document.fileName);
        const choice = await vscode.window.showWarningMessage(
            `⚠️ CONFLICT: The file "${fileName}" has unsaved external modifications. Saving kanban changes will overwrite these external changes.`,
            { modal: true },
            'Overwrite external changes',
            'Cancel save'
        );

        return choice === 'Overwrite external changes';
    }

    /**
     * Update the known file content baseline
     */
    private updateKnownFileContent(content: string): void {
        this._lastKnownFileContent = content;
        this._hasExternalUnsavedChanges = false;
    }

    /**
     * Force reload the board from file (user-initiated)
     */
    public async forceReloadFromFile(): Promise<void> {
        const document = this._fileManager.getDocument();
        if (document) {
            await this.loadMarkdownFile(document, false, true); // forceReload = true
        }
    }

    /**
     * Initialize include file contents when registering with the file watcher
     */
    private async _initializeIncludeFileContents(): Promise<void> {
        for (const filePath of this._includedFiles) {
            const content = await this._readFileContent(filePath);
            if (content !== null) {
                this._includeFileContents.set(filePath, content);
            }
        }
    }

    /**
     * Re-check if any include files have changed after a reload/update operation
     * This ensures that include file change tracking is maintained across document operations
     */
    private async _recheckIncludeFileChanges(): Promise<void> {
        let hasChanges = false;
        const changedFiles = new Set<string>();

        for (const filePath of this._includedFiles) {
            const currentContent = await this._readFileContent(filePath);
            const previousContent = this._includeFileContents.get(filePath);

            if (currentContent !== previousContent) {
                hasChanges = true;
                changedFiles.add(filePath);
                console.log(`[Include Debug] Detected change in ${filePath}`);

                // Update the stored content
                if (currentContent !== null) {
                    this._includeFileContents.set(filePath, currentContent);
                }
            }
        }

        // Update tracking state if changes were found
        if (hasChanges) {
            this._includeFilesChanged = true;
            // Merge with existing changed files (don't clear existing ones)
            for (const file of changedFiles) {
                this._changedIncludeFiles.add(file);
            }
            this._sendIncludeFileChangeNotification();
            console.log(`[Include Debug] Re-check found ${changedFiles.size} changed include files`);
        }
    }

    /**
     * Handle include file changes from the external file watcher
     */
    public async handleIncludeFileChange(filePath: string, changeType: FileChangeType): Promise<void> {
        console.log(`[Include Debug] handleIncludeFileChange called for ${filePath} with changeType ${changeType}`);
        // Convert absolute path back to relative path for internal tracking
        const document = this._fileManager.getDocument();
        let relativePath = filePath;
        if (document) {
            const basePath = path.dirname(document.uri.fsPath);
            relativePath = path.relative(basePath, filePath);
        }

        if (changeType === 'deleted') {
            this._changedIncludeFiles.add(relativePath);
            this._includeFileContents.delete(relativePath);
            this._includeFilesChanged = true;
            this._sendIncludeFileChangeNotification();
        } else if (changeType === 'modified' || changeType === 'created') {
            await this._handleIncludeFileChange(relativePath);
        }
    }

    private async _readFileContent(filePath: string): Promise<string | null> {
        try {
            const uri = vscode.Uri.file(filePath);
            const content = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(content).toString('utf8');
        } catch (error) {
            console.error(`Failed to read file ${filePath}:`, error);
            return null;
        }
    }

    private async _handleIncludeFileChange(relativePath: string) {
        // Convert relative path to absolute for file reading
        const document = this._fileManager.getDocument();
        if (!document) {
            return;
        }
        const basePath = path.dirname(document.uri.fsPath);
        const absolutePath = path.resolve(basePath, relativePath);

        const newContent = await this._readFileContent(absolutePath);
        if (newContent === null) {
            return;
        }

        const oldContent = this._includeFileContents.get(relativePath);

        // Only mark as changed if content actually differs
        if (oldContent !== newContent) {
            this._includeFileContents.set(relativePath, newContent);
            this._changedIncludeFiles.add(relativePath);
            this._includeFilesChanged = true;
            this._sendIncludeFileChangeNotification();
        }
    }

    private _sendIncludeFileChangeNotification() {
        if (this._panel && this._panel.webview) {
            const changedFiles = Array.from(this._changedIncludeFiles);
            this._panel.webview.postMessage({
                type: 'includeFilesChanged',
                hasChanges: this._includeFilesChanged,
                changedFiles: changedFiles
            });
        }
    }

    public async refreshIncludes() {

        // Reset the change flag and clear changed files list
        this._includeFilesChanged = false;
        this._changedIncludeFiles.clear();

        // Lightweight refresh: just update include file cache and notify frontend
        // This preserves any unsaved changes in the webview
        try {
            // Re-read all include file contents to get latest versions
            await this._refreshIncludeFileContents();

            // Send updated include file contents to frontend
            if (this._panel && this._panel.webview) {
                for (const [filePath, content] of this._includeFileContents) {
                    this._panel.webview.postMessage({
                        type: 'includeFileContent',
                        filePath: filePath,
                        content: content
                    });
                }

                // Then trigger re-render
                this._panel.webview.postMessage({
                    type: 'refreshIncludesOnly',
                    message: 'Include files refreshed'
                });
            }
        } catch (error) {
            console.error('[REFRESH INCLUDES] Error refreshing includes:', error);
        }

        // Send notification to hide the button
        this._sendIncludeFileChangeNotification();
    }

    /**
     * Refresh include file contents without affecting the board
     */
    private async _refreshIncludeFileContents(): Promise<void> {
        // Get all include files that have been requested by the frontend
        const includeFilePaths = Array.from(this._includeFileContents.keys());

        // Re-read each include file
        for (const relativePath of includeFilePaths) {
            const document = this._fileManager.getDocument();
            if (document) {
                const basePath = path.dirname(document.uri.fsPath);
                const absolutePath = path.resolve(basePath, relativePath);
                const content = await this._readFileContent(absolutePath);
                if (content !== null) {
                    this._includeFileContents.set(relativePath, content);
                }
            }
        }
    }
}
