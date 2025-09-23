import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MarkdownKanbanParser, KanbanBoard, KanbanColumn, KanbanTask } from './markdownParser';
import { PresentationParser } from './presentationParser';
import { FileManager, ImagePathMapping } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { MessageHandler } from './messageHandler';
import { BackupManager } from './backupManager';
import { CacheManager } from './cacheManager';
import { ExternalFileWatcher } from './externalFileWatcher';
import { ConflictResolver, ConflictContext, ConflictResolution } from './conflictResolver';
import { configService, ConfigurationService } from './configurationService';

interface IncludeFile {
    relativePath: string;
    absolutePath: string;
    type: 'regular' | 'column' | 'task';
    content: string;
    baseline: string;
    hasUnsavedChanges: boolean;
    lastModified: number;
}

export class KanbanWebviewPanel {
    private static panels: Map<string, KanbanWebviewPanel> = new Map();
    private static panelStates: Map<string, any> = new Map();

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
    private _lastDocumentUri?: string;  // Track current document for serialization
    private _panelId: string;  // Unique identifier for this panel

    // Unified include file tracking system - single source of truth
    private _includeFiles: Map<string, IncludeFile> = new Map(); // relativePath -> IncludeFile
    private _includeFilesChanged: boolean = false;
    private _changedIncludeFiles: Set<string> = new Set();
    private _fileWatcher: ExternalFileWatcher;
    private _conflictResolver: ConflictResolver;

    // External modification tracking for main document
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
                    layoutPreset: this._getLayoutPresetConfiguration(),
                    layoutPresets: this._getLayoutPresetsConfiguration(),
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

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext, state?: any) {
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

        // Try to restore the previously loaded document from state
        // First check the serializer state parameter, then check workspace state for recent panels
        let documentUri = state?.documentUri;

        if (!documentUri) {
            // Fallback: Look for recent panel states in workspace
            const allKeys = context.globalState.keys();
            const panelKeys = allKeys.filter(key => key.startsWith('kanban_panel_'));

            if (panelKeys.length > 0) {
                // Find the most recently accessed panel
                let mostRecentUri = null;
                let mostRecentTime = 0;

                for (const key of panelKeys) {
                    const panelState = context.globalState.get(key) as any;
                    if (panelState?.documentUri && panelState?.lastAccessed > mostRecentTime) {
                        mostRecentTime = panelState.lastAccessed;
                        mostRecentUri = panelState.documentUri;
                    }
                }

                documentUri = mostRecentUri;
            }
        }


        if (documentUri) {
            try {
                vscode.workspace.openTextDocument(vscode.Uri.parse(documentUri))
                    .then(async document => {
                        try {
                            await kanbanPanel.loadMarkdownFile(document);
                        } catch (error) {
                            console.warn('Failed to load document on panel revival:', error);
                            // Fallback: try to find an active markdown document
                            kanbanPanel.tryAutoLoadActiveMarkdown();
                        }
                    });
            } catch (error) {
                console.warn('Failed to open document URI on panel revival:', error);
                // Fallback: try to find an active markdown document
                kanbanPanel.tryAutoLoadActiveMarkdown();
            }
        } else {
            // No state available, try to auto-load active markdown document
            kanbanPanel.tryAutoLoadActiveMarkdown();
        }
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

    // Panel state management methods
    public setPanelState(state: any): void {
        KanbanWebviewPanel.panelStates.set(this._panelId, state);
    }

    public getPanelState(): any {
        const state = KanbanWebviewPanel.panelStates.get(this._panelId);
        return state;
    }

    public clearPanelState(): void {
        KanbanWebviewPanel.panelStates.delete(this._panelId);
    }

    public getPanelId(): string {
        return this._panelId;
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._panelId = `panel_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`; // Generate unique ID
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

        // Get the conflict resolver instance
        this._conflictResolver = ConflictResolver.getInstance();

        // Subscribe to file change events
        this._disposables.push(
            this._fileWatcher.onFileChanged(this.handleExternalFileChange.bind(this))
        );

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
                    this._hasUnsavedChanges = hasChanges;
                    if (hasChanges) {
                        // Track when unsaved changes occur for backup timing
                        this._backupManager.markUnsavedChanges();

                        // Track unsaved changes in include files
                        if (cachedBoard) {
                            this.trackIncludeFileUnsavedChanges(cachedBoard);
                        }

                        // Attempt to create backup if minimum interval has passed
                        const document = this._fileManager.getDocument();
                        if (document) {
                            this._backupManager.createBackup(document, { label: 'auto' })
                                .catch(error => console.error('Cache update backup failed:', error));
                        }
                    }
                    if (cachedBoard) {
                        // CRITICAL: Store the cached board data immediately for saving
                        // This ensures we always have the latest data even if webview is disposed
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

    // ============= UNIFIED INCLUDE FILE SYSTEM METHODS =============

    /**
     * Get or create an include file entry in the unified system
     */
    private getOrCreateIncludeFile(relativePath: string, type: 'regular' | 'column' | 'task'): IncludeFile {
        let includeFile = this._includeFiles.get(relativePath);
        if (!includeFile) {
            const currentDocument = this._fileManager.getDocument();
            const basePath = currentDocument ? path.dirname(currentDocument.uri.fsPath) : '';
            const absolutePath = path.resolve(basePath, relativePath);

            includeFile = {
                relativePath,
                absolutePath,
                type,
                content: '',
                baseline: '',
                hasUnsavedChanges: false,
                lastModified: 0
            };
            this._includeFiles.set(relativePath, includeFile);
        }
        return includeFile;
    }

    /**
     * Get all include files of a specific type
     */
    private getIncludeFilesByType(type: 'regular' | 'column' | 'task'): string[] {
        return Array.from(this._includeFiles.values())
            .filter(file => file.type === type)
            .map(file => file.relativePath);
    }

    /**
     * Update include file content and baseline
     */
    private updateIncludeFileContent(relativePath: string, content: string, updateBaseline: boolean = true): void {
        const includeFile = this._includeFiles.get(relativePath);
        if (includeFile) {
            includeFile.content = content;
            includeFile.lastModified = Date.now();
            if (updateBaseline) {
                includeFile.baseline = content;
                includeFile.hasUnsavedChanges = false;
            }
        }
    }

    /**
     * Check if an include file has external changes (content differs from baseline)
     */
    private hasExternalChanges(relativePath: string): boolean {
        const includeFile = this._includeFiles.get(relativePath);
        if (!includeFile || !includeFile.baseline) {
            return true; // No baseline means treat as external change
        }
        return includeFile.baseline.trim() !== includeFile.content.trim();
    }

    /**
     * Get all include file paths for file watcher registration
     */
    private getAllIncludeFilePaths(): string[] {
        return Array.from(this._includeFiles.values()).map(file => file.absolutePath);
    }

    /**
     * Update the unified include system with parsed file lists
     */
    private _updateUnifiedIncludeSystem(includedFiles: string[], columnIncludeFiles: string[], taskIncludeFiles: string[]): void {
        console.log(`[Unified Include] Updating system with:`, {
            regular: includedFiles,
            column: columnIncludeFiles,
            task: taskIncludeFiles
        });

        // Create or update entries for each file type
        includedFiles.forEach(relativePath => {
            const includeFile = this.getOrCreateIncludeFile(relativePath, 'regular');
            console.log(`[Unified Include] Created/updated regular include: ${relativePath} -> ${includeFile.absolutePath}`);
        });

        columnIncludeFiles.forEach(relativePath => {
            const includeFile = this.getOrCreateIncludeFile(relativePath, 'column');
            console.log(`[Unified Include] Created/updated column include: ${relativePath} -> ${includeFile.absolutePath}`);
        });

        taskIncludeFiles.forEach(relativePath => {
            const includeFile = this.getOrCreateIncludeFile(relativePath, 'task');
            console.log(`[Unified Include] Created/updated task include: ${relativePath} -> ${includeFile.absolutePath}`);
        });

        // Remove files that are no longer referenced
        const allCurrentFiles = new Set([...includedFiles, ...columnIncludeFiles, ...taskIncludeFiles]);
        for (const [relativePath] of this._includeFiles) {
            if (!allCurrentFiles.has(relativePath)) {
                console.log(`[Unified Include] Removing unused include: ${relativePath}`);
                this._includeFiles.delete(relativePath);
            }
        }

        console.log(`[Unified Include] Final unified system:`, Array.from(this._includeFiles.entries()));
    }

    /**
     * Initialize content for new include files (preserve existing baselines)
     */
    private async _initializeUnifiedIncludeContents(): Promise<void> {
        for (const [relativePath, includeFile] of this._includeFiles) {
            // Only initialize if we don't have content yet
            if (!includeFile.content && !includeFile.baseline) {
                const content = await this._readFileContent(relativePath);
                if (content !== null) {
                    includeFile.content = content;
                    includeFile.baseline = content;
                    includeFile.lastModified = Date.now();
                }
            }
        }
    }

    // ============= END UNIFIED INCLUDE FILE SYSTEM METHODS =============

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
        return configService.getConfig('tagColors', {});
    }

    private async _getWhitespaceConfiguration(): Promise<string> {
        return configService.getConfig('whitespace', '8px');
    }

    private async _getTaskMinHeightConfiguration(): Promise<string> {
        return configService.getConfig('taskMinHeight');
    }

    private async _getFontSizeConfiguration(): Promise<string> {
        return configService.getConfig('fontSize');
    }

    private async _getFontFamilyConfiguration(): Promise<string> {
        return configService.getConfig('fontFamily');
    }

    private async _getColumnWidthConfiguration(): Promise<string> {
        return configService.getConfig('columnWidth', '350px');
    }

    private async _getLayoutRowsConfiguration(): Promise<number> {
        return configService.getConfig('layoutRows');
    }

    private async _getRowHeightConfiguration(): Promise<string> {
        return configService.getConfig('rowHeight');
    }

    private async _getLayoutPresetConfiguration(): Promise<string> {
        return configService.getConfig('layoutPreset', 'normal');
    }

    private async _getLayoutPresetsConfiguration(): Promise<any> {
        const userPresets = configService.getConfig('layoutPresets', {});

        // Default presets as fallback
        const defaultPresets = {
            overview: {
                label: "Overview",
                description: "Compact view for seeing many cards",
                settings: {
                    columnWidth: "250px",
                    cardHeight: "auto",
                    fontSize: "0_5x",
                    whitespace: "4px",
                    tagVisibility: "allexcludinglayout"
                }
            },
            normal: {
                label: "Normal",
                description: "Default balanced view",
                settings: {
                    columnWidth: "350px",
                    cardHeight: "auto",
                    fontSize: "1x",
                    whitespace: "8px",
                    tagVisibility: "allexcludinglayout"
                }
            },
            grid3x3: {
                label: "3x3 Grid",
                description: "Grid layout for organized viewing",
                settings: {
                    columnWidth: "33percent",
                    cardHeight: "33percent",
                    fontSize: "2x",
                    layoutRows: 3,
                    whitespace: "12px"
                }
            },
            presentation: {
                label: "Presentation",
                description: "Full screen view for presentations",
                settings: {
                    columnWidth: "100percent",
                    cardHeight: "100percent",
                    fontSize: "3x",
                    stickyHeaders: "disabled",
                    tagVisibility: "none",
                    whitespace: "16px"
                }
            }
        };

        // Merge user presets with defaults (user presets override defaults)
        return { ...defaultPresets, ...userPresets };
    }

    private async _getMaxRowHeightConfiguration(): Promise<number> {
        return configService.getConfig('maxRowHeight', 0);
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
                    // Panel became visible - send file info
                    this._fileManager.sendFileInfo();

                    // Only ensure board content is sent in specific cases to avoid unnecessary re-renders
                    // This fixes empty view issues after debug restart or workspace restore
                    // but avoids re-rendering when the view just temporarily lost focus (e.g., showing messages)
                    if (this._fileManager.getDocument()) {
                        // Only refresh if:
                        // 1. Board hasn't been initialized yet, OR
                        // 2. Board is null/undefined (needs initialization)
                        // Don't refresh just because the panel regained visibility after showing a message
                        if (!this._board || !this._isInitialized) {
                            this._ensureBoardAndSendUpdate();
                        }
                    }
                }
                // Note: Unsaved changes are now handled via page visibility events in webview.js
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            async (message) => {

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
        if (this._fileManager.getDocument()) {
            try {
                const document = this._fileManager.getDocument()!;

                // If we have unsaved changes with a cached board, use that instead of re-parsing
                // This preserves user's work when switching views
                if (this._hasUnsavedChanges && this._cachedBoardFromWebview) {
                    this._board = this._cachedBoardFromWebview;
                    // Keep using the cached board and existing include file states
                } else {
                    // Only re-parse from document if no unsaved changes
                    const basePath = path.dirname(document.uri.fsPath);
                    const parseResult = MarkdownKanbanParser.parseMarkdown(document.getText(), basePath);
                    this._board = parseResult.board;
                    // Update the unified include system
                    this._updateUnifiedIncludeSystem(parseResult.includedFiles, parseResult.columnIncludeFiles, parseResult.taskIncludeFiles || []);
                }

                // Register included files with the external file watcher
                // Preserve existing change state
                const preservedChangeState = this._includeFilesChanged;
                const preservedChangedFiles = new Set(this._changedIncludeFiles);

                // Initialize content for new files only (preserve existing baselines)
                await this._initializeUnifiedIncludeContents();

                // Register all include files with the file watcher
                const allIncludePaths = this.getAllIncludeFilePaths();
                console.log(`[File Watcher] Registering include files:`, allIncludePaths);
                this._fileWatcher.updateIncludeFiles(this, allIncludePaths);


                // ALWAYS re-check for changes after reload
                // This will detect any changes between the preserved baseline and current state
                await this._recheckIncludeFileChanges(this._includeFiles.size > 0);

                // Only restore the change state if recheck didn't find changes
                // (If recheck found changes, it already set the state)
                if (!this._includeFilesChanged && preservedChangeState) {
                    this._includeFilesChanged = true;
                    this._changedIncludeFiles = preservedChangedFiles;
                }

                // Send notification again in case it was lost
                if (this._includeFilesChanged) {
                        }

                if (this._board) {
                    this._boardOperations.setOriginalTaskOrder(this._board);
                }
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

        if (this._isUpdatingFromPanel) {
            return;
        }

        // Store document URI for serialization
        this._lastDocumentUri = document.uri.toString();

        // Store panel state for serialization in VSCode context
        this.setPanelState({
            documentUri: document.uri.toString(),
            panelId: this._panelId
        });

        // Also store in VSCode's global state for persistence across restarts
        this._context.globalState.update(`kanban_panel_${this._panelId}`, {
            documentUri: document.uri.toString(),
            lastAccessed: Date.now()
        });
        
        // Ensure file watcher is always set up for the current document
        const currentDocumentUri = this._fileManager.getDocument()?.uri.toString();
        const isDifferentDocument = currentDocumentUri !== document.uri.toString();
        const isFirstFileLoad = !this._fileManager.getDocument();

        // Set up file watcher if needed (first load or different document)
        if (isFirstFileLoad || isDifferentDocument) {

            // Clean up old watcher if switching documents
            if (isDifferentDocument && currentDocumentUri) {
                // Note: We'll clean this up in the document changed section below
            }
        }

        // STRICT POLICY: Only reload board in these specific cases:
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


            if (hasExternalChanges) {
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
            // ALLOWED: Loading board (initial load, different document, or force reload)
            const basePath = path.dirname(document.uri.fsPath);
            const parseResult = MarkdownKanbanParser.parseMarkdown(document.getText(), basePath);

            // Update version tracking
            this._lastDocumentVersion = document.version;

            // Handle undo/redo history
            if (isDifferentDocument && !this._isUndoRedoOperation && !this._isUpdatingFromPanel && !forceReload) {
                // Only clear history when switching to completely different documents
                // Don't clear on force reload of same document (e.g., external changes)
                this._undoRedoManager.clear();
            }

            // Update the board
            this._board = parseResult.board;
            // Update the unified include system
            this._updateUnifiedIncludeSystem(parseResult.includedFiles, parseResult.columnIncludeFiles, parseResult.taskIncludeFiles || []);

            // Update our baseline of known file content
            this.updateKnownFileContent(document.getText());

            // Update included files with the external file watcher
            // Preserve existing change state
            const preservedChangeState = this._includeFilesChanged;
            const preservedChangedFiles = new Set(this._changedIncludeFiles);

            // Initialize content for new files only (preserve existing baselines)
            await this._initializeUnifiedIncludeContents();

            // Register all include files with the file watcher
            const allIncludePaths = this.getAllIncludeFilePaths();
            console.log(`[File Watcher] Registering include files:`, allIncludePaths);
            this._fileWatcher.updateIncludeFiles(this, allIncludePaths);

            // Always send notification to update tracked files list

            // ALWAYS re-check for changes after reload
            // This will detect any changes between the preserved baseline and current state
            await this._recheckIncludeFileChanges(this._includeFiles.size > 0);

            // Only restore the change state if recheck didn't find changes
            // (If recheck found changes, it already set the state)
            if (!this._includeFilesChanged && preservedChangeState) {
                this._includeFilesChanged = true;
                this._changedIncludeFiles = preservedChangedFiles;
            }

            // Send notification after recheck to ensure UI is updated with current state

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

        const layoutPreset = await this._getLayoutPresetConfiguration();

        const layoutPresets = await this._getLayoutPresetsConfiguration();

        const showRowTags = await this._getShowRowTagsConfiguration();
        
        const maxRowHeight = await this._getMaxRowHeightConfiguration();

        // Get version from package.json
        const packageJson = require('../package.json');
        const version = packageJson.version || 'Unknown';

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
                layoutPreset: layoutPreset,
                layoutPresets: layoutPresets,
                showRowTags: showRowTags,
                maxRowHeight: maxRowHeight,
                applyDefaultFolding: applyDefaultFolding,
                isFullRefresh: isFullRefresh,
                version: version
            });
        }, 10);

        // Send include file contents after board update using unified system
        if (this._includeFiles.size > 0) {
            setTimeout(() => {
                for (const [relativePath, includeFile] of this._includeFiles) {
                    this._panel.webview.postMessage({
                        type: 'updateIncludeContent',
                        filePath: relativePath,
                        content: includeFile.content
                    });
                }
            }, 20);
        }

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

            // First, save any changes to column and task include files (bidirectional editing)
            await this.saveAllColumnIncludeChanges();
            await this.saveAllTaskIncludeChanges();

            const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
            // Check for external unsaved changes before proceeding
            const canProceed = await this.checkForExternalUnsavedChanges();
            if (!canProceed) {
                return;
            }

            // Check if content has actually changed before applying edit
            const currentContent = document.getText();
            if (currentContent === markdown) {
                // No changes needed, skip the edit to avoid unnecessary re-renders
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
            
            // After successful save, create a backup (respects minimum interval)
            await this._backupManager.createBackup(document);
            
            // Clear unsaved changes flag after successful save
            this._hasUnsavedChanges = false;

            // Update our baseline after successful save
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

            // Reload the file after successful initialization
            // Keep _isUpdatingFromPanel = true during reload to prevent undo stack clearing
            await this.loadMarkdownFile(document);
            this._isUpdatingFromPanel = false;

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
            'utils/colorUtils.js',
            'utils/fileTypeUtils.js',
            'utils/tagUtils.js',
            'utils/configManager.js',
            'utils/styleManager.js',
            'utils/menuManager.js',
            'utils/dragStateManager.js',
            'utils/validationUtils.js',
            'utils/modalUtils.js',
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
        const hasMainUnsavedChanges = this._hasUnsavedChanges;
        const hasIncludeUnsavedChanges = Array.from(this._includeFiles.values()).some(file => file.hasUnsavedChanges);

        if ((hasMainUnsavedChanges || hasIncludeUnsavedChanges) && !this._isClosingPrevented) {
            this._isClosingPrevented = true;

            // Use the cached board that was already sent when changes were made
            if (this._cachedBoardFromWebview) {
                this._board = this._cachedBoardFromWebview;
            }

            const document = this._fileManager.getDocument();
            const fileName = document ? path.basename(document.fileName) : 'the kanban board';
            const changedIncludeFiles = Array.from(this._changedIncludeFiles);

            // Use the unified conflict resolver
            const context: ConflictContext = {
                type: 'panel_close',
                fileType: 'main', // Main context but includes both main and include files
                filePath: document?.uri.fsPath || '',
                fileName: fileName,
                hasMainUnsavedChanges: hasMainUnsavedChanges,
                hasIncludeUnsavedChanges: hasIncludeUnsavedChanges,
                changedIncludeFiles: changedIncludeFiles,
                isClosing: true
            };

            try {
                const resolution = await this._conflictResolver.resolveConflict(context);

                if (!resolution.shouldProceed) {
                    // User cancelled - reset and try again
                    this._isClosingPrevented = false;
                    this._handlePanelClose(); // Recursively call to show dialog again
                    return;
                }

                if (resolution.shouldSave) {
                    try {
                        // Save the changes before closing (this will save both main and include files)
                        await this.saveToMarkdown();
                        this._hasUnsavedChanges = false;
                        // Clear all include file unsaved changes
                        for (const [, includeFile] of this._includeFiles) {
                            includeFile.hasUnsavedChanges = false;
                        }
                        this._cachedBoardFromWebview = null; // Clear after save
                        // Allow disposal to continue
                        this.dispose();
                    } catch (error) {
                        // If save fails, show error and prevent closing
                        vscode.window.showErrorMessage(`Failed to save changes: ${error instanceof Error ? error.message : String(error)}`);
                        this._isClosingPrevented = false;
                        return;
                    }
                } else {
                    // User explicitly chose to close without saving
                    this._hasUnsavedChanges = false;
                    // Clear all include file unsaved changes
                    for (const [, includeFile] of this._includeFiles) {
                        includeFile.hasUnsavedChanges = false;
                    }
                    this._cachedBoardFromWebview = null; // Clear cached board
                    this.dispose();
                }
            } catch (error) {
                console.error('[_handlePanelClose] Error in conflict resolution:', error);
                this._isClosingPrevented = false;
                vscode.window.showErrorMessage(`Error handling panel close: ${error instanceof Error ? error.message : String(error)}`);
            }
        } else {
            // No unsaved changes, proceed with normal disposal
            this.dispose();
        }
    }

    private tryAutoLoadActiveMarkdown() {
        // Try to find the active markdown document in the editor
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.languageId === 'markdown') {
            this.loadMarkdownFile(activeEditor.document);
            return;
        }

        // If no active markdown editor, look for any open markdown document
        const openMarkdownDocs = vscode.workspace.textDocuments.filter(doc =>
            doc.languageId === 'markdown' && !doc.isUntitled
        );

        if (openMarkdownDocs.length > 0) {
            // TEMP DISABLED: Don't auto-load random markdown files
            // This was causing wrong files to be loaded on revival
            // this.loadMarkdownFile(openMarkdownDocs[0]);
            return;
        }

        // No markdown documents available - panel will remain empty
        // User can manually select a file to load
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

        // Clear panel state
        this.clearPanelState();

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
                // For other backup types (page hidden, etc.), use document content and respect timing
                await this._backupManager.createBackup(document, {
                    label: label,
                    forceCreate: false  // Respect minimum interval timing for non-conflict backups
                });
            }

        } catch (error) {
            console.error(`Error creating ${label} backup:`, error);
        }
    }

    private async _createBoardStateBackup(boardMarkdown: string, label: string): Promise<string> {
        const document = this._fileManager.getDocument()!;
        const originalPath = document.uri.fsPath;
        const dir = path.dirname(originalPath);
        const basename = path.basename(originalPath, path.extname(originalPath));
        const extension = path.extname(originalPath);

        // Use standardized timestamp format: YYYYMMDDTHHmmss
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;

        // All automatically generated files should be hidden
        const prefix = '.';
        const backupFileName = `${prefix}${basename}-${label}-${timestamp}${extension}`;
        const backupPath = path.join(dir, backupFileName);

        // Write backup file with board state as markdown
        const backupUri = vscode.Uri.file(backupPath);
        await vscode.workspace.fs.writeFile(backupUri, Buffer.from(boardMarkdown, 'utf8'));

        // Set hidden attribute on Windows
        await this.setFileHidden(backupPath);

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
        const hasMainUnsavedChanges = this._hasUnsavedChanges;
        const hasIncludeUnsavedChanges = Array.from(this._includeFiles.values()).some(file => file.hasUnsavedChanges);
        const changedIncludeFiles = Array.from(this._changedIncludeFiles);

        // Use the unified conflict resolver
        const context: ConflictContext = {
            type: 'external_main',
            fileType: 'main',
            filePath: document.uri.fsPath,
            fileName: fileName,
            hasMainUnsavedChanges: hasMainUnsavedChanges,
            hasIncludeUnsavedChanges: hasIncludeUnsavedChanges,
            changedIncludeFiles: changedIncludeFiles
        };

        try {
            const resolution = await this._conflictResolver.resolveConflict(context);

            if (resolution.shouldIgnore) {
                // User wants to keep working with current state - do nothing
                return;
            } else if (resolution.shouldSave && !resolution.shouldReload) {
                // User wants to save current kanban state and ignore external changes
                // Don't update version tracking to continue detecting future external changes
                await this.saveToMarkdown(false);
                return;
            } else if (resolution.shouldCreateBackup && resolution.shouldReload) {
                // Save current board state as backup before reloading

                // IMPORTANT: Preserve include file state before any operations
                const preservedIncludeState = {
                    changed: this._includeFilesChanged,
                    changedFiles: new Set(this._changedIncludeFiles),
                    includeFiles: new Map(this._includeFiles) // Preserve the entire unified system
                };

                await this._createUnifiedBackup('conflict');

                // Restore include file state after backup (in case it was modified)
                this._includeFilesChanged = preservedIncludeState.changed;
                this._changedIncludeFiles = preservedIncludeState.changedFiles;
                this._includeFiles = preservedIncludeState.includeFiles;


                // Save current state to undo history before reloading
                if (this._board) {
                    this._undoRedoManager.saveStateForUndo(this._board);
                }
                await this.forceReloadFromFile();
                return;
            } else if (resolution.shouldReload && !resolution.shouldCreateBackup) {
                // User chose to discard current changes and reload from external file
                // Save current state to undo history before reloading
                if (this._board) {
                    this._undoRedoManager.saveStateForUndo(this._board);
                }
                await this.forceReloadFromFile();
                return;
            }
        } catch (error) {
            console.error('[notifyExternalChanges] Error in conflict resolution:', error);
            vscode.window.showErrorMessage(`Error handling external file changes: ${error instanceof Error ? error.message : String(error)}`);
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
                }
            }
        });
        this._disposables.push(disposable);
    }

    /**
     * Check for external unsaved changes when about to save
     */
    private async checkForExternalUnsavedChanges(): Promise<boolean> {
        // First check main file for external changes
        const document = this._fileManager.getDocument();
        if (!document) {
            return true; // No document, nothing to check
        }

        // Check main file external changes
        if (this._hasExternalUnsavedChanges) {
            const currentContent = document.getText();
            const hasRealChanges = currentContent !== this._lastKnownFileContent;

            if (hasRealChanges) {
                // Real external unsaved changes detected in main file
                const fileName = path.basename(document.fileName);
                const context: ConflictContext = {
                    type: 'presave_check',
                    fileType: 'main',
                    filePath: document.uri.fsPath,
                    fileName: fileName,
                    hasMainUnsavedChanges: true, // We're in the process of saving
                    hasIncludeUnsavedChanges: false,
                    changedIncludeFiles: []
                };

                try {
                    const resolution = await this._conflictResolver.resolveConflict(context);
                    if (!resolution.shouldProceed) {
                        return false; // User chose not to proceed
                    }
                } catch (error) {
                    console.error('[checkForExternalUnsavedChanges] Error in main file conflict resolution:', error);
                    return false;
                }
            } else {
                // False alarm - no real external changes
                this._hasExternalUnsavedChanges = false;
            }
        }

        // Now check include files for external changes
        const hasExternalIncludeChanges = await this.checkForExternalIncludeFileChanges();
        if (!hasExternalIncludeChanges) {
            return false; // User chose not to proceed with include file conflicts
        }

        return true; // All checks passed
    }

    /**
     * Check for external changes in column include files before saving
     */
    private async checkForExternalIncludeFileChanges(): Promise<boolean> {
        if (!this._board) {
            return true;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return true;
        }

        // Check all include files using unified system
        for (const [relativePath, includeFile] of this._includeFiles) {
            // Skip if file doesn't exist
            if (!fs.existsSync(includeFile.absolutePath)) {
                continue;
            }

            // Read current file content
            const currentFileContent = fs.readFileSync(includeFile.absolutePath, 'utf8');

            // Check for external changes using unified system
            if (includeFile.baseline && includeFile.baseline.trim() !== currentFileContent.trim()) {
                if (includeFile.hasUnsavedChanges) {
                    // We have both internal changes and external changes - conflict!
                    const fileName = path.basename(includeFile.absolutePath);
                    const context: ConflictContext = {
                        type: 'presave_check',
                        fileType: 'include',
                        filePath: includeFile.absolutePath,
                        fileName: fileName,
                        hasMainUnsavedChanges: false,
                        hasIncludeUnsavedChanges: true,
                        changedIncludeFiles: [includeFile.absolutePath]
                    };

                    try {
                        const resolution = await this._conflictResolver.resolveConflict(context);
                        if (!resolution.shouldProceed) {
                            return false; // User chose not to proceed
                        }
                        // If user chose to proceed, update our baseline to the external version
                        includeFile.baseline = currentFileContent;
                    } catch (error) {
                        console.error(`[checkForExternalIncludeFileChanges] Error in include file conflict resolution for ${relativePath}:`, error);
                        return false;
                    }
                } else {
                    // External changes but no internal changes - update our baseline
                    includeFile.baseline = currentFileContent;
                    includeFile.content = currentFileContent;
                }
            }
        }

        return true; // All include file checks passed
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
     * Re-check if any include files have changed after a reload/update operation
     * This ensures that include file change tracking is maintained across document operations
     */
    private async _recheckIncludeFileChanges(usingPreservedBaselines: boolean = false): Promise<void> {
        let hasChanges = false;
        const changedFiles = new Set<string>();

        for (const [relativePath, includeFile] of this._includeFiles) {
            const currentContent = await this._readFileContent(relativePath);

            if (currentContent === null || !includeFile.baseline) {
                continue; // Skip this file since we can't compare
            }

            if (currentContent.trim() !== includeFile.baseline.trim()) {
                hasChanges = true;
                changedFiles.add(relativePath);

                // Update current content but preserve baseline for continuous change detection
                includeFile.content = currentContent;
                if (!usingPreservedBaselines) {
                    includeFile.baseline = currentContent;
                    includeFile.hasUnsavedChanges = false;
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
        }
    }

    // NOTE: handleIncludeFileChange() method removed - include file changes are now
    // handled through the file watcher subscription and handleIncludeFileConflict() method

    private async _readFileContent(filePath: string): Promise<string | null> {
        try {
            // Check if it's a relative path and convert to absolute if needed
            let absolutePath = filePath;
            if (!path.isAbsolute(filePath)) {
                const document = this._fileManager.getDocument();
                if (document) {
                    const basePath = path.dirname(document.uri.fsPath);
                    absolutePath = path.resolve(basePath, filePath);
                }
            }

            const uri = vscode.Uri.file(absolutePath);
            const content = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(content).toString('utf8');
        } catch (error) {
            console.error(`[Include Debug] Failed to read file ${filePath}:`, error);
            return null;
        }
    }




    /**
     * Refresh include file contents without affecting the board
     */
    private async _refreshIncludeFileContents(): Promise<void> {
        // Refresh all include files using unified system
        for (const [relativePath, includeFile] of this._includeFiles) {
            const content = await this._readFileContent(relativePath);
            if (content !== null) {
                includeFile.content = content;
                includeFile.baseline = content;
                includeFile.hasUnsavedChanges = false;
                includeFile.lastModified = Date.now();
            }
        }

        // Send notification after refresh to update button state
    }

    /**
     * Save modifications from include columns back to their original presentation files
     * This enables bidirectional editing
     */
    public async saveColumnIncludeChanges(column: KanbanColumn): Promise<boolean> {
        if (!column.includeMode || !column.includeFiles || column.includeFiles.length === 0) {
            return false;
        }

        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                return false;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);

            // For now, handle single file includes (could be extended for multi-file)
            const includeFile = column.includeFiles[0];
            const absolutePath = path.resolve(basePath, includeFile);

            // Check if the file exists - if not, this might be a new file path that hasn't been loaded yet
            if (!fs.existsSync(absolutePath)) {
                return false;
            }

            // CRITICAL FIX: Check if the current tasks actually came from this file
            // Read the current file content and compare with what we would generate
            const currentFileContent = fs.readFileSync(absolutePath, 'utf8');
            const currentFileTasks = PresentationParser.parseMarkdownToTasks(currentFileContent);


            // Smart validation: Detect file path changes vs legitimate edits/additions
            const taskCountDifference = Math.abs(currentFileTasks.length - column.tasks.length);

            // Check for content overlap to distinguish file path changes from legitimate edits
            let hasContentOverlap = false;
            let overlapCount = 0;

            if (currentFileTasks.length > 0 && column.tasks.length > 0) {
                // Count how many tasks have similar titles (indicating they're the same content)
                for (const fileTask of currentFileTasks) {
                    for (const columnTask of column.tasks) {
                        if (fileTask.title === columnTask.title ||
                            fileTask.title.includes(columnTask.title) ||
                            columnTask.title.includes(fileTask.title)) {
                            overlapCount++;
                            break; // Count each file task only once
                        }
                    }
                }

                // If most tasks overlap, it's likely legitimate editing
                const overlapRatio = overlapCount / Math.min(currentFileTasks.length, column.tasks.length);
                hasContentOverlap = overlapRatio >= 0.5; // At least 50% overlap
            }

            // Only block save if there's a big count difference AND no content overlap
            // This indicates a file path change where completely different content was loaded
            const isLikelyFilePathChange = taskCountDifference > 2 && !hasContentOverlap;

            if (isLikelyFilePathChange) {
                return false;
            }

            // Check if we have any actual task changes to save
            // If the tasks came from a file include and haven't been modified, don't overwrite
            if (column.tasks.length === 0) {
                return false;
            }

            // Convert tasks back to presentation format
            const presentationContent = PresentationParser.tasksToPresentation(column.tasks);

            // Don't write if the content would be empty or just separators
            if (!presentationContent || presentationContent.trim() === '' || presentationContent.trim() === '---') {
                return false;
            }

            // Additional safety check: don't write if the generated content is identical to current file
            if (currentFileContent.trim() === presentationContent.trim()) {
                return false;
            }

            // Create backup before writing (same protection as main file)
            await this._backupManager.createFileBackup(absolutePath, presentationContent, {
                label: 'auto',
                forceCreate: false
            });

            // Write to file
            fs.writeFileSync(absolutePath, presentationContent, 'utf8');

            // Update unified system tracking
            const unifiedIncludeFile = this._includeFiles.get(includeFile);
            if (unifiedIncludeFile) {
                unifiedIncludeFile.content = presentationContent;
                unifiedIncludeFile.baseline = presentationContent;
                unifiedIncludeFile.hasUnsavedChanges = false;
                unifiedIncludeFile.lastModified = Date.now();
            }

            // Clear from changed files tracking and update visual indicators
            this._changedIncludeFiles.delete(includeFile);
            if (this._changedIncludeFiles.size === 0) {
                this._includeFilesChanged = false;
            }

            return true;

        } catch (error) {
            console.error(`[Column Include] Error saving changes to ${column.includeFiles[0]}:`, error);
            vscode.window.showErrorMessage(`Failed to save changes to column include file: ${error}`);
            return false;
        }
    }

    /**
     * Save modifications from task includes back to their original files
     * This enables bidirectional editing for task includes
     */
    public async reprocessTaskIncludes(): Promise<void> {

        if (!this._board) {
            return;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);

        // Process task includes in the current board
        let tasksProcessed = 0;
        for (const column of this._board.columns) {
            for (const task of column.tasks) {
                tasksProcessed++;
                // Check if task title contains taskinclude syntax
                const taskIncludeMatches = task.title.match(/!!!taskinclude\(([^)]+)\)!!!/g);

                if (taskIncludeMatches && taskIncludeMatches.length > 0) {

                    // Process this task as a task include
                    const includeFiles: string[] = [];
                    taskIncludeMatches.forEach(match => {
                        const filePath = match.replace(/!!!taskinclude\(([^)]+)\)!!!/, '$1').trim();
                        includeFiles.push(filePath);
                    });


                    // Read content from included files
                    let includeTitle = '';
                    let includeDescription = '';

                    for (const filePath of includeFiles) {
                        const resolvedPath = path.resolve(basePath, filePath);
                        try {
                            if (fs.existsSync(resolvedPath)) {
                                const fileContent = fs.readFileSync(resolvedPath, 'utf8');
                                const lines = fileContent.split('\n');

                                // Find first non-empty line for title
                                let titleFound = false;
                                let descriptionLines: string[] = [];

                                for (let i = 0; i < lines.length; i++) {
                                    const line = lines[i].trim();
                                    if (!titleFound && line) {
                                        includeTitle = lines[i]; // Use original line with indentation
                                        titleFound = true;
                                    } else if (titleFound) {
                                        descriptionLines.push(lines[i]);
                                    }
                                }

                                // Join remaining lines as description
                                includeDescription = descriptionLines.join('\n').trim();

                            } else {
                                console.warn(`[ReprocessTaskIncludes] File not found: ${resolvedPath}`);
                            }
                        } catch (error) {
                            console.error(`[ReprocessTaskIncludes] Error processing ${filePath}:`, error);
                        }
                    }

                    // If no title found in file, use filename
                    if (!includeTitle && includeFiles.length > 0) {
                        const path = require('path');
                        includeTitle = path.basename(includeFiles[0], path.extname(includeFiles[0]));
                    }

                    // Update task properties for include mode
                    task.includeMode = true;
                    task.includeFiles = includeFiles;
                    task.originalTitle = task.title; // Keep original title with include syntax
                    task.displayTitle = includeTitle || 'Untitled'; // Display title from file
                    task.description = includeDescription; // Description from file


                    // Send targeted update to frontend for this specific task
                    this._panel.webview.postMessage({
                        type: 'updateTaskContent',
                        taskId: task.id,
                        taskTitle: task.title, // Contains include syntax
                        displayTitle: task.displayTitle, // Content from file
                        description: task.description, // Description from file
                        includeMode: task.includeMode,
                        includeFiles: task.includeFiles
                    });
                }
            }
        }

        // Send targeted update to frontend instead of full board refresh
        // This mimics how column includes work - only update the affected elements
    }

    public async checkTaskIncludeUnsavedChanges(task: KanbanTask): Promise<boolean> {
        if (!task.includeMode || !task.includeFiles || task.includeFiles.length === 0) {
            return false;
        }

        const includeFile = task.includeFiles[0];
        const unifiedIncludeFile = this._includeFiles.get(includeFile);

        // Check if this file has unsaved changes using unified system
        return unifiedIncludeFile?.hasUnsavedChanges === true;
    }

    public async saveTaskIncludeChanges(task: KanbanTask): Promise<boolean> {
        if (!task.includeMode || !task.includeFiles || task.includeFiles.length === 0) {
            return false;
        }

        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                return false;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);

            // For now, handle single file includes (could be extended for multi-file)
            const includeFile = task.includeFiles[0];
            const absolutePath = path.resolve(basePath, includeFile);

            // Check if the file exists - if not, create it
            if (!fs.existsSync(absolutePath)) {
                // Ensure directory exists
                const dir = path.dirname(absolutePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }

            // Reconstruct file content from task title and description
            let fileContent = '';

            // First line: use displayTitle (the content from the file), not title (which contains include syntax)
            // This matches the column include pattern where displayTitle is the actual content
            const titleToSave = task.displayTitle || '';
            if (titleToSave) {
                fileContent = titleToSave;
            }

            // Remaining lines: task description
            if (task.description && task.description.trim()) {
                if (fileContent) {
                    fileContent += '\n\n'; // Add blank line between title and description
                }
                fileContent += task.description;
            }

            // Don't write if the content would be empty
            if (!fileContent || fileContent.trim() === '') {
                return false;
            }

            // Read current file content to check if it's actually different
            let currentFileContent = '';
            if (fs.existsSync(absolutePath)) {
                currentFileContent = fs.readFileSync(absolutePath, 'utf8');
            }

            // Don't write if the content is identical
            if (currentFileContent.trim() === fileContent.trim()) {
                return false;
            }

            // Create backup before writing (same protection as main file)
            await this._backupManager.createFileBackup(absolutePath, fileContent, {
                label: 'auto',
                forceCreate: false
            });

            // Write to file
            fs.writeFileSync(absolutePath, fileContent, 'utf8');

            // Update unified system tracking
            const unifiedIncludeFile = this._includeFiles.get(includeFile);
            if (unifiedIncludeFile) {
                unifiedIncludeFile.content = fileContent;
                unifiedIncludeFile.baseline = fileContent;
                unifiedIncludeFile.hasUnsavedChanges = false;
                unifiedIncludeFile.lastModified = Date.now();
            }

            // Clear from changed files tracking and update visual indicators
            this._changedIncludeFiles.delete(includeFile);
            if (this._changedIncludeFiles.size === 0) {
                this._includeFilesChanged = false;
            }

            return true;

        } catch (error) {
            console.error(`[Task Include] Error saving changes to ${task.includeFiles[0]}:`, error);
            vscode.window.showErrorMessage(`Failed to save changes to task include file: ${error}`);
            return false;
        }
    }

    /**
     * Load new content into a column when its include files change
     */
    public async loadNewIncludeContent(column: KanbanColumn, newIncludeFiles: string[]): Promise<void> {

        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                return;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);

            // For now, handle single file includes
            const includeFile = newIncludeFiles[0];
            const absolutePath = path.resolve(basePath, includeFile);

            if (fs.existsSync(absolutePath)) {
                const fileContent = fs.readFileSync(absolutePath, 'utf8');

                // Update unified system tracking
                const unifiedIncludeFile = this._includeFiles.get(includeFile);
                if (unifiedIncludeFile) {
                    unifiedIncludeFile.content = fileContent;
                    unifiedIncludeFile.baseline = fileContent;
                    unifiedIncludeFile.hasUnsavedChanges = false;
                    unifiedIncludeFile.lastModified = Date.now();
                }

                const newTasks = PresentationParser.parseMarkdownToTasks(fileContent);

                // Update the column's tasks directly
                column.tasks = newTasks;


                // Send targeted update message to frontend instead of full refresh
                this._panel.webview.postMessage({
                    type: 'updateColumnContent',
                    columnId: column.id,
                    tasks: newTasks,
                    includeFile: includeFile,
                    columnTitle: column.title,
                    displayTitle: column.displayTitle,
                    includeMode: column.includeMode,
                    includeFiles: column.includeFiles
                });

            } else {
                console.warn(`[LoadNewInclude] Include file not found: ${absolutePath}`);
                // Clear tasks if file doesn't exist
                column.tasks = [];

                // Send targeted update with empty tasks
                this._panel.webview.postMessage({
                    type: 'updateColumnContent',
                    columnId: column.id,
                    tasks: [],
                    includeFile: includeFile,
                    columnTitle: column.title,
                    displayTitle: column.displayTitle,
                    includeMode: column.includeMode,
                    includeFiles: column.includeFiles
                });
            }
        } catch (error) {
            console.error(`[LoadNewInclude] Error loading new include content:`, error);
        }
    }

    public async loadNewTaskIncludeContent(task: KanbanTask, newIncludeFiles: string[]): Promise<void> {

        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                return;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);

            // For now, handle single file includes
            const includeFile = newIncludeFiles[0];
            const absolutePath = path.resolve(basePath, includeFile);

            if (fs.existsSync(absolutePath)) {
                const fileContent = fs.readFileSync(absolutePath, 'utf8');
                const lines = fileContent.split('\n');

                // Update unified system tracking
                const unifiedIncludeFile = this._includeFiles.get(includeFile);
                if (unifiedIncludeFile) {
                    unifiedIncludeFile.content = fileContent;
                    unifiedIncludeFile.baseline = fileContent;
                    unifiedIncludeFile.hasUnsavedChanges = false;
                    unifiedIncludeFile.lastModified = Date.now();
                }

                // Parse first non-empty line as title, rest as description
                let titleFound = false;
                let newTitle = '';
                let descriptionLines: string[] = [];

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!titleFound && line) {
                        newTitle = lines[i]; // Use original line with indentation
                        titleFound = true;
                    } else if (titleFound) {
                        descriptionLines.push(lines[i]);
                    }
                }

                // Update the task with parsed content
                // Keep the original title (with include syntax) and set display properties
                task.includeMode = true;
                task.includeFiles = newIncludeFiles;
                task.originalTitle = task.title; // Preserve the include syntax
                task.displayTitle = newTitle || 'Untitled'; // Title from file
                task.description = descriptionLines.join('\n').trim(); // Description from file


                // Send targeted update message to frontend instead of full refresh
                this._panel.webview.postMessage({
                    type: 'updateTaskContent',
                    taskId: task.id,
                    description: task.description,
                    includeFile: includeFile,
                    taskTitle: task.title,
                    displayTitle: task.displayTitle,
                    originalTitle: task.originalTitle,
                    includeMode: task.includeMode,
                    includeFiles: task.includeFiles
                });

            } else {
                console.warn(`[LoadNewTaskInclude] Include file not found: ${absolutePath}`);
                // Clear description if file doesn't exist
                task.description = '';

                // Send targeted update with empty description
                this._panel.webview.postMessage({
                    type: 'updateTaskContent',
                    taskId: task.id,
                    description: '',
                    includeFile: includeFile,
                    taskTitle: task.title,
                    displayTitle: task.displayTitle,
                    originalTitle: task.originalTitle,
                    includeMode: task.includeMode,
                    includeFiles: task.includeFiles
                });
            }
        } catch (error) {
            console.error(`[LoadNewTaskInclude] Error loading new task include content:`, error);
        }
    }

    /**
     * Save all modified column includes when the board is saved
     */
    public async saveAllColumnIncludeChanges(): Promise<void> {
        if (!this._board) {
            return;
        }

        const includeColumns = this._board.columns.filter(col => col.includeMode);
        const savePromises = includeColumns.map(col => this.saveColumnIncludeChanges(col));

        try {
            await Promise.all(savePromises);
        } catch (error) {
            console.error('[Column Include] Error saving column include changes:', error);
        }
    }

    /**
     * Save all modified task includes when the board is saved
     */
    public async saveAllTaskIncludeChanges(): Promise<void> {
        if (!this._board) {
            return;
        }

        // Collect all tasks with include mode from all columns
        const includeTasks: KanbanTask[] = [];
        for (const column of this._board.columns) {
            for (const task of column.tasks) {
                if (task.includeMode) {
                    includeTasks.push(task);
                }
            }
        }

        if (includeTasks.length === 0) {
            return;
        }

        const savePromises = includeTasks.map(task => this.saveTaskIncludeChanges(task));

        try {
            await Promise.all(savePromises);
        } catch (error) {
            console.error('[Task Include] Error saving task include changes:', error);
        }
    }

    /**
     * Handle conflicts when include files are changed externally
     */
    private async handleIncludeFileConflict(filePath: string, changeType: string): Promise<void> {
        const fileName = path.basename(filePath);

        // Get the relative path for unified system lookup
        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        let relativePath = path.relative(basePath, filePath);

        // Normalize path format to match how includes are stored (with ./ prefix for same directory)
        if (!relativePath.startsWith('.') && path.dirname(relativePath) === '.') {
            relativePath = './' + relativePath;
        }

        // Get the include file from unified system
        const includeFile = this._includeFiles.get(relativePath);
        if (!includeFile) {
            return;
        }

        // Don't process include file changes if we're currently updating from the panel
        // But only for column/task includes which can be edited internally
        // Regular includes should always update since they're read-only
        if (this._isUpdatingFromPanel && (includeFile.type === 'column' || includeFile.type === 'task')) {
            return;
        }

        let hasUnsavedIncludeChanges = includeFile.hasUnsavedChanges;
        let knownContent = includeFile.baseline;
        let currentFileContent = '';

        console.log(`[Include Update] Processing ${includeFile.type} include: ${relativePath}, has baseline: ${!!knownContent}, has unsaved: ${hasUnsavedIncludeChanges}`);

        // Read current file content
        try {
            if (fs.existsSync(filePath)) {
                currentFileContent = fs.readFileSync(filePath, 'utf8');
            }
        } catch (error) {
            console.error(`[handleIncludeFileConflict] Error reading file ${filePath}:`, error);
        }

        // Update the current content in the unified system
        includeFile.content = currentFileContent;

        // Check if the external file has actually changed using unified system
        const hasExternalChanges = this.hasExternalChanges(relativePath);

        console.log(`[Include Update] External changes: ${hasExternalChanges}, unsaved changes: ${hasUnsavedIncludeChanges}`);

        if (!hasUnsavedIncludeChanges && !hasExternalChanges) {
            // No unsaved changes and no external changes - nothing to do
            console.log(`[Include Update] No changes detected for ${fileName}, skipping update`);
            return;
        }

        if (!hasUnsavedIncludeChanges && hasExternalChanges) {
            // External changes but no internal changes - simple update
            console.log(`[Include Update] External changes detected for ${fileName}, updating...`);
            await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task');
            return;
        }

        // Use the unified conflict resolver
        const context: ConflictContext = {
            type: 'external_include',
            fileType: 'include',
            filePath: filePath,
            fileName: fileName,
            hasMainUnsavedChanges: false, // Not relevant for include file conflicts
            hasIncludeUnsavedChanges: hasUnsavedIncludeChanges,
            hasExternalChanges: hasExternalChanges,
            changedIncludeFiles: [filePath]
        };

        try {
            const resolution = await this._conflictResolver.resolveConflict(context);

            if (resolution.shouldReload && !resolution.shouldCreateBackup) {
                // Discard local changes and reload from external file
                includeFile.hasUnsavedChanges = false;
                await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task');

            } else if (resolution.shouldCreateBackup && resolution.shouldReload) {
                // Save current changes as backup, then reload external
                if (includeFile.type === 'column' || includeFile.type === 'task') {
                    await this.saveIncludeFileAsBackup(filePath);
                }
                includeFile.hasUnsavedChanges = false;
                await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task');

            } else if (resolution.shouldSave && !resolution.shouldReload) {
                // Save current kanban changes, overwriting external
                if (includeFile.type === 'column' || includeFile.type === 'task') {
                    await this.saveIncludeFileChanges(filePath);
                }
                includeFile.hasUnsavedChanges = false;
                // For regular includes, this would mean saving main kanban changes (already handled elsewhere)

            } else if (resolution.shouldIgnore) {
                // Ignore external changes - do nothing
            }
        } catch (error) {
            console.error('[handleIncludeFileConflict] Error in conflict resolution:', error);
            vscode.window.showErrorMessage(`Error handling include file conflict: ${error instanceof Error ? error.message : String(error)}`);
        }
    }


    /**
     * Unified method to update any type of include file
     */
    private async updateIncludeFile(filePath: string, isColumnInclude: boolean, isTaskInclude: boolean): Promise<void> {
        if (!this._board) {
            return;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        let relativePath = path.relative(basePath, filePath);

        // Normalize path format to match how includes are stored (with ./ prefix for same directory)
        if (!relativePath.startsWith('.') && path.dirname(relativePath) === '.') {
            relativePath = './' + relativePath;
        }

        if (isColumnInclude) {
            // Handle column includes using existing system
            for (const column of this._board.columns) {
                if (column.includeMode && column.includeFiles?.includes(relativePath)) {
                    await this.loadNewIncludeContent(column, [relativePath]);
                    break;
                }
            }
        } else if (isTaskInclude) {
            // Handle task includes - need to find and update the specific task
            for (const column of this._board.columns) {
                for (const task of column.tasks) {
                    if (task.includeMode && task.includeFiles?.includes(relativePath)) {
                        await this.loadNewTaskIncludeContent(task, [relativePath]);
                        return; // Found and updated the task
                    }
                }
            }
        } else {
            // Handle regular includes using unified system
            console.log(`[Include Update] Updating regular include: ${relativePath}`);
            let updatedContent: string | null = null;
            try {
                if (fs.existsSync(filePath)) {
                    updatedContent = fs.readFileSync(filePath, 'utf8');
                    console.log(`[Include Update] Read ${updatedContent.length} characters from ${relativePath}`);
                }
            } catch (error) {
                console.error(`[updateIncludeFile] Error reading file:`, error);
            }

            // Update the unified system content and baseline
            if (updatedContent !== null) {
                this.updateIncludeFileContent(relativePath, updatedContent, true);
            }

            // Send updated content to frontend only if content was successfully read
            if (updatedContent !== null) {
                console.log(`[Include Update] Sending updateIncludeContent message for ${relativePath}`);
                this._panel?.webview.postMessage({
                    type: 'updateIncludeContent',
                    filePath: relativePath,
                    content: updatedContent
                });

                // NOTE: Don't send includesUpdated message here as it causes redundant renders
                // The frontend will re-render when it receives the updateIncludeContent message
            } else {
                console.error(`[Include Update] Failed to read content for ${relativePath}, skipping frontend update`);
            }
        }
    }

    /**
     * Save include file changes before external reload
     */
    private async saveIncludeFileAsBackup(filePath: string): Promise<void> {
        if (!this._board) {
            return;
        }

        // Find the column that uses this include file and save its content as backup
        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        const relativePath = path.relative(basePath, filePath);

        for (const column of this._board.columns) {
            if (column.includeMode && column.includeFiles?.includes(relativePath)) {
                const presentationContent = PresentationParser.tasksToPresentation(column.tasks);

                // Use BackupManager for consistent backup creation
                const backupPath = await this._backupManager.createFileBackup(filePath, presentationContent, {
                    label: 'conflict',
                    forceCreate: true
                });

                if (backupPath) {
                    vscode.window.showInformationMessage(
                        `Backup saved as "${path.basename(backupPath)}"`,
                        'Open backup file'
                    ).then(choice => {
                        if (choice === 'Open backup file') {
                            vscode.commands.executeCommand('vscode.open', vscode.Uri.file(backupPath));
                        }
                    });
                }
                break;
            }
        }
    }

    /**
     * Save current kanban changes to include file
     */
    private async saveIncludeFileChanges(filePath: string): Promise<void> {
        if (!this._board) {
            return;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        const relativePath = path.relative(basePath, filePath);


        // Find the column that uses this include file and save its changes
        for (const column of this._board.columns) {
            if (column.includeMode && column.includeFiles?.includes(relativePath)) {
                await this.saveColumnIncludeChanges(column);
                break;
            }
        }
    }

    /**
     * Handle external file changes from the file watcher
     */
    private async handleExternalFileChange(event: import('./externalFileWatcher').FileChangeEvent): Promise<void> {
        try {
            console.log(`[External File Change] Received event:`, {
                path: event.path,
                changeType: event.changeType,
                fileType: event.fileType,
                affectedPanels: event.panels.length
            });

            // Check if this panel is affected by the change
            if (!event.panels.includes(this)) {
                console.log(`[External File Change] Panel not affected by change`);
                return;
            }

            // Handle different types of file changes
            if (event.fileType === 'include') {
                console.log(`[External File Change] Handling include file change: ${event.path}`);
                // All include types now use the same unified conflict resolution system
                await this.handleIncludeFileConflict(event.path, event.changeType);
            } else if (event.fileType === 'main') {
                console.log(`[External File Change] Handling main file change: ${event.path}`);
                // This is the main kanban file - handle external changes
                const currentDocument = this._fileManager.getDocument();
                if (currentDocument) {
                    await this.notifyExternalChanges(currentDocument);
                }
            }

        } catch (error) {
            console.error('[ExternalFileChange] Error handling file change:', error);
        }
    }

    /**
     * Check if a file path is used as a column include file
     */
    private async isColumnIncludeFile(filePath: string): Promise<boolean> {
        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return false;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        const relativePath = path.relative(basePath, filePath);

        const includeFile = this._includeFiles.get(relativePath);
        return includeFile?.type === 'column' || false;
    }

    /**
     * Check if a file path is used as a task include file
     */
    private async isTaskIncludeFile(filePath: string): Promise<boolean> {
        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return false;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        const relativePath = path.relative(basePath, filePath);

        const includeFile = this._includeFiles.get(relativePath);
        return includeFile?.type === 'task' || false;
    }


    /**
     * Track unsaved changes in include files when board is modified
     */
    private trackIncludeFileUnsavedChanges(board: KanbanBoard): void {
        if (!board.columns) {
            return;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);

        // Check each column that has include mode enabled
        for (const column of board.columns) {
            if (column.includeMode && column.includeFiles && column.includeFiles.length > 0) {
                for (const includeFile of column.includeFiles) {
                    const absolutePath = path.resolve(basePath, includeFile);

                    // Compare current tasks with known content using unified system
                    const unifiedIncludeFile = this._includeFiles.get(includeFile);
                    if (unifiedIncludeFile && unifiedIncludeFile.baseline) {
                        const currentPresentationContent = column.tasks.length > 0
                            ? PresentationParser.tasksToPresentation(column.tasks)
                            : '';

                        if (unifiedIncludeFile.baseline.trim() !== currentPresentationContent.trim()) {
                            unifiedIncludeFile.hasUnsavedChanges = true;

                            // Add to changed files tracking and trigger visual indicators
                            this._includeFilesChanged = true;
                            this._changedIncludeFiles.add(includeFile);
                        } else {
                            // No changes detected, clear unsaved flag if it was set
                            if (unifiedIncludeFile.hasUnsavedChanges) {
                                unifiedIncludeFile.hasUnsavedChanges = false;
                                this._changedIncludeFiles.delete(includeFile);

                                // Update visual indicators if no more changes
                                if (this._changedIncludeFiles.size === 0) {
                                    this._includeFilesChanged = false;
                                }
                            }
                        }
                    }
                }
            }

            // Check each task that has include mode enabled
            for (const task of column.tasks) {
                if (task.includeMode && task.includeFiles && task.includeFiles.length > 0) {
                    for (const includeFile of task.includeFiles) {
                        const absolutePath = path.resolve(basePath, includeFile);

                        // Compare current task content with known content using unified system
                        const unifiedIncludeFile = this._includeFiles.get(includeFile);
                        if (unifiedIncludeFile && unifiedIncludeFile.baseline) {
                            // Reconstruct what the file content should be from task data
                            let expectedContent = '';
                            if (task.displayTitle) {
                                expectedContent = task.displayTitle;
                            }
                            if (task.description && task.description.trim()) {
                                if (expectedContent) {
                                    expectedContent += '\n\n';
                                }
                                expectedContent += task.description;
                            }

                            if (unifiedIncludeFile.baseline.trim() !== expectedContent.trim()) {
                                unifiedIncludeFile.hasUnsavedChanges = true;

                                // Add to changed files tracking and trigger visual indicators
                                this._includeFilesChanged = true;
                                this._changedIncludeFiles.add(includeFile);

                                // Mark as changed but don't auto-save (user controls when to save)
                            } else {
                                // No changes detected, clear unsaved flag if it was set
                                if (unifiedIncludeFile.hasUnsavedChanges) {
                                    unifiedIncludeFile.hasUnsavedChanges = false;
                                    this._changedIncludeFiles.delete(includeFile);

                                    // Update visual indicators if no more changes
                                    if (this._changedIncludeFiles.size === 0) {
                                        this._includeFilesChanged = false;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    /**
     * Set file as hidden on Windows using attrib command
     * On Unix systems, files starting with . are already hidden
     */
    private async setFileHidden(filePath: string): Promise<void> {
        try {
            // Only need to set hidden attribute on Windows
            if (process.platform === 'win32') {
                const { exec } = await import('child_process');
                const util = await import('util');
                const execPromise = util.promisify(exec);

                try {
                    await execPromise(`attrib +H "${filePath}"`);
                } catch (error) {
                    // Silently fail if attrib command fails
                    // The . prefix will still make it hidden in most file managers
                    console.debug(`Failed to set hidden attribute for ${filePath}:`, error);
                }
            }
        } catch (error) {
            // Silently fail - file is still created with . prefix
            console.debug(`Error setting file hidden:`, error);
        }
    }

    /**
     * Trigger snippet insertion in the webview
     */
    public triggerSnippetInsertion(): void {
        if (this._panel) {
            this._panel.webview.postMessage({
                type: 'triggerSnippet'
            });
        }
    }
}
