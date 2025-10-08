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
import { getFileStateManager } from './fileStateManager';

interface IncludeFile {
    relativePath: string;
    absolutePath: string;
    type: 'regular' | 'column' | 'task';
    content: string;
    baseline: string;
    hasUnsavedChanges: boolean;
    lastModified: number;
    externalContent?: string;  // Content from external changes
    hasExternalChanges?: boolean;  // Flag for external changes detected
    isUnsavedInEditor?: boolean;  // Track if file has unsaved changes in VS Code editor
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
    private _filesToRemoveAfterSave: string[] = [];  // Files to remove after unsaved changes are handled
    private _unsavedFilesToPrompt: string[] = [];  // Files with unsaved changes that need user prompt
    private _panelId: string;  // Unique identifier for this panel
    private _trackedDocumentUri: string | undefined;  // Track the document URI for panel map management

    // Unified include file tracking system - single source of truth
    private _includeFiles: Map<string, IncludeFile> = new Map(); // relativePath -> IncludeFile
    private _includeFilesChanged: boolean = false;
    private _changedIncludeFiles: Set<string> = new Set();
    private _recentlyReloadedFiles: Set<string> = new Set(); // Track files that were just reloaded from external
    private _fileWatcher: ExternalFileWatcher;
    private _conflictResolver: ConflictResolver;

    // Centralized dialog management to prevent duplicate dialogs
    private _activeConflictDialog: Promise<any> | null = null;
    private _lastDialogTimestamp: number = 0;
    private readonly _MIN_DIALOG_INTERVAL = 2000; // 2 seconds minimum between dialogs

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
                    sectionMaxHeight: this._getSectionMaxHeightConfiguration(),
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
            const docUri = document.uri.toString();
            kanbanPanel._trackedDocumentUri = docUri;  // Track the URI for cleanup
            KanbanWebviewPanel.panels.set(docUri, kanbanPanel);
            // Load immediately - webview will request data when ready
            kanbanPanel.loadMarkdownFile(document);
        }
    }

    // Static set to track document URIs being revived to prevent duplicates
    private static _revivedUris: Set<string> = new Set();

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
            // Fallback: Look for panel states in workspace that haven't been revived yet
            const allKeys = context.globalState.keys();
            // Look for both old kanban_panel_* keys and new kanban_doc_* keys
            const panelKeys = allKeys.filter(key => key.startsWith('kanban_panel_') || key.startsWith('kanban_doc_'));

            if (panelKeys.length > 0) {
                // Find available panel states, prioritizing recent ones
                const availableStates: Array<{ uri: string; time: number }> = [];

                for (const key of panelKeys) {
                    const panelState = context.globalState.get(key) as any;
                    if (panelState?.documentUri && !KanbanWebviewPanel._revivedUris.has(panelState.documentUri)) {
                        availableStates.push({
                            uri: panelState.documentUri,
                            time: panelState.lastAccessed || 0
                        });
                    }
                }

                // Sort by most recent and use the first available
                if (availableStates.length > 0) {
                    availableStates.sort((a, b) => b.time - a.time);
                    documentUri = availableStates[0].uri;
                    // Mark this URI as revived to prevent other panels from using it
                    KanbanWebviewPanel._revivedUris.add(documentUri);

                    // Clear the revival tracking after a short delay (panels should be revived quickly)
                    setTimeout(() => {
                        KanbanWebviewPanel._revivedUris.clear();
                    }, 5000);
                }
            }
        } else {
            // State was provided by webview serialization - this is the preferred path
            // Mark as revived to prevent fallback logic from using it
            KanbanWebviewPanel._revivedUris.add(documentUri);
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
                    const document = this._fileManager.getDocument();
                    if (!document) {
                        return;
                    }

                    const fileStateManager = getFileStateManager();

                    // Initialize main file state if needed
                    const mainFileState = fileStateManager.initializeFile(
                        document.uri.fsPath,
                        '.',
                        true,
                        'main'
                    );

                    if (hasChanges && cachedBoard) {
                        // First, track changes in include files
                        const onlyIncludeChanges = this.trackIncludeFileUnsavedChanges(cachedBoard);

                        // Mark frontend changes based on whether main file or only includes changed
                        if (!onlyIncludeChanges) {
                            fileStateManager.markFrontendChange(document.uri.fsPath, true, JSON.stringify(cachedBoard));
                            this._hasUnsavedChanges = true; // Keep legacy flag for compatibility
                        } else {
                            fileStateManager.markFrontendChange(document.uri.fsPath, false);
                            this._hasUnsavedChanges = false;
                        }

                        // Track when unsaved changes occur for backup timing
                        this._backupManager.markUnsavedChanges();

                        // Attempt to create backup if minimum interval has passed
                        if (document) {
                            this._backupManager.createBackup(document, { label: 'auto' })
                                .catch(error => console.error('Cache update backup failed:', error));
                        }
                    } else {

                        // Check if any include files have unsaved changes before potentially resetting the flag
                        const hasIncludeFileChanges = Array.from(this._includeFiles.values()).some(file => file.hasUnsavedChanges);

                        fileStateManager.markFrontendChange(document.uri.fsPath, hasChanges);

                        // Only update _hasUnsavedChanges if we're not losing include file changes
                        if (hasChanges || !hasIncludeFileChanges) {
                            this._hasUnsavedChanges = hasChanges;
                        } else {
                            this._hasUnsavedChanges = true;
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

            // CRITICAL: Check if this file had unsaved changes in FileStateManager before creating
            const fileStateManager = getFileStateManager();
            const existingState = fileStateManager.getFileState(absolutePath);
            const preservedUnsavedFlag = existingState?.frontend?.hasUnsavedChanges || false;


            // Load actual file content for proper baseline
            let fileContent = '';
            try {
                if (fs.existsSync(absolutePath)) {
                    fileContent = fs.readFileSync(absolutePath, 'utf8');
                }
            } catch (error) {
                console.error(`[getOrCreateIncludeFile] Error reading file ${absolutePath}:`, error);
            }

            includeFile = {
                relativePath,
                absolutePath,
                type,
                content: fileContent,
                baseline: fileContent, // Use actual file content as baseline
                hasUnsavedChanges: preservedUnsavedFlag, // Preserve any existing unsaved state
                lastModified: 0
            };
            this._includeFiles.set(relativePath, includeFile);

            // Also register in FileStateManager - reuse existing fileStateManager
            const fileType = type === 'column' ? 'include-column' :
                           type === 'task' ? 'include-task' :
                           'include-regular'; // regular includes

            fileStateManager.initializeFile(
                absolutePath,
                relativePath,
                false,
                fileType
            );
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
    private updateIncludeFileContent(relativePath: string, content: string, updateBaseline: boolean = true, preserveUnsavedFlag: boolean = false): void {
        const includeFile = this._includeFiles.get(relativePath);
        if (includeFile) {
            includeFile.content = content;
            includeFile.lastModified = Date.now();
            if (updateBaseline) {
                includeFile.baseline = content;
                const previousUnsaved = includeFile.hasUnsavedChanges;

                // Only reset hasUnsavedChanges if we're not preserving it
                if (!preserveUnsavedFlag) {
                    includeFile.hasUnsavedChanges = false;
                    if (previousUnsaved) {
                    }
                } else {
                }
            }

            // Also update FileStateManager
            const fileStateManager = getFileStateManager();
            if (updateBaseline) {
                // File was reloaded from disk, update baseline and clear changes
                fileStateManager.markReloaded(includeFile.absolutePath, content);
            } else {
                // Just update content but not baseline
                fileStateManager.markFrontendChange(includeFile.absolutePath, true, content);
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

        // Read current file content from disk to check for external changes
        try {
            const currentFileContent = fs.existsSync(includeFile.absolutePath)
                ? fs.readFileSync(includeFile.absolutePath, 'utf8')
                : '';
            return includeFile.baseline.trim() !== currentFileContent.trim();
        } catch (error) {
            console.error(`[hasExternalChanges] Error reading file ${includeFile.absolutePath}:`, error);
            return true; // Assume external change if we can't read the file
        }
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

        // Helper function to normalize include paths consistently
        const normalizePath = (filePath: string): string => {
            if (!path.isAbsolute(filePath) && !filePath.startsWith('.')) {
                return './' + filePath;
            }
            return filePath;
        };

        // Create or update entries for each file type
        includedFiles.forEach(relativePath => {
            const normalizedPath = normalizePath(relativePath);
            const includeFile = this.getOrCreateIncludeFile(normalizedPath, 'regular');
        });

        columnIncludeFiles.forEach(relativePath => {
            const normalizedPath = normalizePath(relativePath);
            const includeFile = this.getOrCreateIncludeFile(normalizedPath, 'column');
        });

        taskIncludeFiles.forEach(relativePath => {
            const normalizedPath = normalizePath(relativePath);
            const includeFile = this.getOrCreateIncludeFile(normalizedPath, 'task');
        });

        // Remove files that are no longer referenced
        const allCurrentFiles = new Set([
            ...includedFiles.map(normalizePath),
            ...columnIncludeFiles.map(normalizePath),
            ...taskIncludeFiles.map(normalizePath)
        ]);

        // Check for unsaved changes in files that will be removed
        const filesToRemove: string[] = [];
        const unsavedFilesToPrompt: string[] = [];

        for (const [relativePath, includeFile] of this._includeFiles) {
            if (!allCurrentFiles.has(relativePath)) {
                filesToRemove.push(relativePath);
                if (includeFile.hasUnsavedChanges) {
                    unsavedFilesToPrompt.push(relativePath);
                }
            }
        }

        // If there are unsaved changes, we need to handle this asynchronously
        // Store the files to remove for later processing
        this._filesToRemoveAfterSave = filesToRemove;
        this._unsavedFilesToPrompt = unsavedFilesToPrompt;

        // For now, don't remove files here - this will be handled by the async check

    }

    /**
     * Handle unsaved changes in files that need to be removed during include file path changes
     */
    private async _handleUnsavedIncludeFileChanges(): Promise<void> {
        if (this._unsavedFilesToPrompt.length === 0) {
            // No unsaved changes, safe to remove files
            this._removeTrackedFiles();
            return;
        }

        // Build a user-friendly message about unsaved changes
        const fileNames = this._unsavedFilesToPrompt.map(relativePath => path.basename(relativePath));
        const fileList = fileNames.join(', ');

        const message = `The following include files have unsaved changes and will no longer be included:\n\n${fileList}\n\nWhat would you like to do?`;

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            'Save Changes',
            'Discard Changes',
            'Cancel'
        );

        if (choice === 'Save Changes') {
            // Save all unsaved include files first
            for (const relativePath of this._unsavedFilesToPrompt) {
                const includeFile = this._includeFiles.get(relativePath);
                if (includeFile?.hasUnsavedChanges && (includeFile.type === 'column' || includeFile.type === 'task')) {
                    // Only column and task includes can be saved back to files
                    await this.saveIncludeFileChanges(includeFile.absolutePath);
                }
            }
            // Now safe to remove files
            this._removeTrackedFiles();

        } else if (choice === 'Discard Changes') {
            // User wants to discard changes, safe to remove files
            this._removeTrackedFiles();

        } else {
            // User cancelled - we need to revert the board change
            // This is complex since the board has already been updated
            // For now, show a warning and proceed with removal
            vscode.window.showWarningMessage('Cannot cancel include file change after board has been updated. Unsaved changes will be lost.');
            this._removeTrackedFiles();
        }

        // Clear the tracking arrays
        this._filesToRemoveAfterSave = [];
        this._unsavedFilesToPrompt = [];
    }

    /**
     * Remove files from tracking after unsaved changes have been handled
     */
    private _removeTrackedFiles(): void {
        for (const relativePath of this._filesToRemoveAfterSave) {
            // Get the include file before removing it
            const includeFile = this._includeFiles.get(relativePath);

            // Remove from include files map
            this._includeFiles.delete(relativePath);

            // Also clear from FileStateManager
            if (includeFile) {
                const fileStateManager = getFileStateManager();
                fileStateManager.clearFileState(includeFile.absolutePath);
            }
        }
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

                    // For column includes, we need to set baseline to the presentation format
                    // not the original file content, since we compare against tasksToPresentation output
                    if (includeFile.type === 'column') {
                        // Find the column that uses this include file to set proper baseline
                        let presentationBaseline = '';
                        if (this._board && this._board.columns) {
                            for (const column of this._board.columns) {
                                if (column.includeMode && column.includeFiles?.includes(relativePath)) {
                                    presentationBaseline = column.tasks.length > 0
                                        ? PresentationParser.tasksToPresentation(column.tasks)
                                        : '';
                                    break;
                                }
                            }
                        }
                        includeFile.baseline = presentationBaseline;
                        // Also update FileStateManager with the presentation format baseline
                        const fileStateManager = getFileStateManager();
                        fileStateManager.markReloaded(includeFile.absolutePath, presentationBaseline);
                    } else {
                        // For regular and task includes, use file content as baseline
                        includeFile.baseline = content;

                        // Also update FileStateManager with the content baseline
                        const fileStateManager = getFileStateManager();
                        fileStateManager.markReloaded(includeFile.absolutePath, content);
                    }

                    includeFile.lastModified = Date.now();
                }
            }

            // Check if this file is currently open in VS Code and has unsaved changes
            const openTextDocuments = vscode.workspace.textDocuments;
            for (const doc of openTextDocuments) {
                if (doc.uri.fsPath === includeFile.absolutePath) {
                    includeFile.isUnsavedInEditor = doc.isDirty;
                    if (doc.isDirty) {
                    }
                    break;
                }
            }
        }
    }

    // ============= END UNIFIED INCLUDE FILE SYSTEM METHODS =============

    private async handleLinkReplacement(originalPath: string, newPath: string, isImage: boolean, taskId?: string, columnId?: string, linkIndex?: number) {
        if (!this._board || !this._board.valid) { return; }

        this._undoRedoManager.saveStateForUndo(this._board);

        let modified = false;

        // URL encode the new path for proper markdown links
        const encodedNewPath = encodeURI(newPath).replace(/[()]/g, (match) => {
            return match === '(' ? '%28' : '%29';
        });

        // If we have specific context, target only that link instance
        if (taskId && columnId) {
            // Find the specific column and task
            const targetColumn = this._board.columns.find(col => col.id === columnId);
            if (!targetColumn) {
                console.warn(`Column ${columnId} not found for link replacement`);
                return;
            }

            const targetTask = targetColumn.tasks.find(task => task.id === taskId);
            if (!targetTask) {
                console.warn(`Task ${taskId} not found for link replacement`);
                return;
            }

            // Replace only the specific occurrence by index in the specific task
            // Check task title first
            const updatedTitle = this.replaceSingleLink(targetTask.title, originalPath, encodedNewPath, linkIndex);
            if (updatedTitle !== targetTask.title) {
                targetTask.title = updatedTitle;
                modified = true;
            }
            // If not found in title and task has description, check description
            else if (targetTask.description) {
                const updatedDescription = this.replaceSingleLink(targetTask.description, originalPath, encodedNewPath, linkIndex);
                if (updatedDescription !== targetTask.description) {
                    targetTask.description = updatedDescription;
                    modified = true;
                }
            }
        }
        // If no specific context but we have a columnId, target only that column
        else if (columnId && !taskId) {
            const targetColumn = this._board.columns.find(col => col.id === columnId);
            if (!targetColumn) {
                console.warn(`Column ${columnId} not found for link replacement`);
                return;
            }

            // Replace only the specific occurrence by index in the column title
            const updatedTitle = this.replaceSingleLink(targetColumn.title, originalPath, encodedNewPath, linkIndex);
            if (updatedTitle !== targetColumn.title) {
                targetColumn.title = updatedTitle;
                modified = true;
            }
        }
        // Fallback: global replacement (original behavior)
        else {
            // Helper function to replace link in text with precise strikethrough placement
            const replaceLink = (text: string): string => {
                return this.replaceSingleLink(text, originalPath, encodedNewPath);
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
        }

        if (modified) {
            // Mark as having unsaved changes but don't auto-save
            // The user will need to manually save to persist the changes

            // Mark board as having unsaved changes in the file state manager
            const document = this._fileManager.getDocument();
            if (document) {
                const fileStateManager = getFileStateManager();
                fileStateManager.markFrontendChange(document.uri.fsPath, true, JSON.stringify(this._board));
                this._hasUnsavedChanges = true;
            }

            await this.sendBoardUpdate();
        }
    }

    /**
     * Replace only the specific occurrence (by index) of a specific link in text
     * Handles both already strikethrough and regular links properly
     */
    private replaceSingleLink(text: string, originalPath: string, encodedNewPath: string, targetIndex: number = 0): string {
        if (!text) { return text; }


        // Escape special regex characters in the original path
        const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Define all patterns we need to check
        const patterns = [
            // Already strikethrough patterns
            { regex: new RegExp(`~~(!\\[[^\\]]*\\]\\(${escapedPath}\\))~~`, 'g'), type: 'strikeImage' },
            { regex: new RegExp(`~~(\\[[^\\]]+\\]\\(${escapedPath}\\))~~`, 'g'), type: 'strikeLink' },
            { regex: new RegExp(`~~(\\[\\[\\s*${escapedPath}(?:\\|[^\\]]*)?\\]\\])~~`, 'g'), type: 'strikeWiki' },
            { regex: new RegExp(`~~(<${escapedPath}>)~~`, 'g'), type: 'strikeAuto' },
            // Regular patterns
            { regex: new RegExp(`(!\\[[^\\]]*\\]\\(${escapedPath}\\))`, 'g'), type: 'image' },
            { regex: new RegExp(`(^|[^!])(\\[[^\\]]+\\]\\(${escapedPath}\\))`, 'gm'), type: 'link' },
            { regex: new RegExp(`(\\[\\[\\s*${escapedPath}(?:\\|[^\\]]*)?\\]\\])`, 'g'), type: 'wiki' },
            { regex: new RegExp(`(<${escapedPath}>)`, 'g'), type: 'auto' }
        ];

        // Find all matches with their positions
        const allMatches = [];
        for (const pattern of patterns) {
            let match;
            const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
            while ((match = regex.exec(text)) !== null) {
                allMatches.push({
                    match: match,
                    start: match.index,
                    end: match.index + match[0].length,
                    type: pattern.type,
                    fullMatch: match[0]
                });
                // Prevent infinite loops on zero-width matches
                if (match.index === regex.lastIndex) {
                    regex.lastIndex++;
                }
            }
        }

        // Sort matches by position
        allMatches.sort((a, b) => a.start - b.start);

        // Remove nested matches - if we have both ~~![image]~~ and ![image], remove the inner one
        const filteredMatches = [];
        for (const match of allMatches) {
            // Check if this match is contained within any other match
            const isNested = allMatches.some(other =>
                other !== match &&
                other.start < match.start &&
                other.end > match.end &&
                (other.type.startsWith('strike') && !match.type.startsWith('strike'))
            );

            if (!isNested) {
                filteredMatches.push(match);
            }
        }

        filteredMatches.forEach((match, i) => {
        });

        // Check if targetIndex is valid (using filtered matches)
        if (targetIndex >= 0 && targetIndex < filteredMatches.length) {
            const targetMatch = filteredMatches[targetIndex];
            return this.replaceMatchAtPosition(text, targetMatch, originalPath, encodedNewPath);
        } else if (filteredMatches.length > 0) {
            // Fallback: replace first match
            const targetMatch = filteredMatches[0];
            return this.replaceMatchAtPosition(text, targetMatch, originalPath, encodedNewPath);
        }

        // No matches found
        return text;
    }

    /**
     * Replace a specific match at its exact position with the new path
     * Uses position-based slicing instead of pattern-based replacement to avoid replacing wrong occurrences
     */
    private replaceMatchAtPosition(text: string, matchInfo: any, originalPath: string, encodedNewPath: string): string {
        const { match, type, start, end } = matchInfo;
        const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');


        let replacement = '';

        switch (type) {
            case 'strikeImage': {
                const imageLink = match[1];
                const newImageLink = imageLink.replace(new RegExp(escapedPath, 'g'), encodedNewPath);
                replacement = `~~${imageLink}~~ ${newImageLink}`;
                break;
            }
            case 'strikeLink': {
                const regularLink = match[1];
                const newRegularLink = regularLink.replace(new RegExp(escapedPath, 'g'), encodedNewPath);
                replacement = `~~${regularLink}~~ ${newRegularLink}`;
                break;
            }
            case 'strikeWiki': {
                const wikiLink = match[1];
                const newWikiLink = wikiLink.replace(new RegExp(escapedPath, 'g'), encodedNewPath);
                replacement = `~~${wikiLink}~~ ${newWikiLink}`;
                break;
            }
            case 'strikeAuto': {
                const autoLink = match[1];
                const newAutoLink = `<${encodedNewPath}>`;
                replacement = `~~${autoLink}~~ ${newAutoLink}`;
                break;
            }
            case 'image': {
                const imageLink = match[1];
                const newImageLink = imageLink.replace(new RegExp(escapedPath, 'g'), encodedNewPath);
                replacement = `~~${imageLink}~~ ${newImageLink}`;
                break;
            }
            case 'link': {
                const before = match[1];
                const regularLink = match[2];
                const newRegularLink = regularLink.replace(new RegExp(escapedPath, 'g'), encodedNewPath);
                replacement = `${before}~~${regularLink}~~ ${newRegularLink}`;
                break;
            }
            case 'wiki': {
                const wikiLink = match[1];
                const newWikiLink = wikiLink.replace(new RegExp(escapedPath, 'g'), encodedNewPath);
                replacement = `~~${wikiLink}~~ ${newWikiLink}`;
                break;
            }
            case 'auto': {
                const autoLink = match[1];
                const newAutoLink = `<${encodedNewPath}>`;
                replacement = `~~${autoLink}~~ ${newAutoLink}`;
                break;
            }
            default:
                return text;
        }

        // Use position-based replacement: slice before + replacement + slice after
        const result = text.slice(0, start) + replacement + text.slice(end);
        return result;
    }

    /**
     * Setup listener for document close events to handle graceful degradation
     */
    private _setupDocumentCloseListener() {
        // Listen for document close events
        const documentCloseListener = vscode.workspace.onDidCloseTextDocument(async (document) => {
            const currentDocument = this._fileManager.getDocument();


            if (currentDocument && currentDocument.uri.toString() === document.uri.toString()) {
                // DO NOT close the panel when the document is closed!
                // The kanban should stay open and functional
                // Clear document reference but keep file path for display
                this._fileManager.clearDocument();
                this._fileManager.sendFileInfo();
            } else {
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

    private async _getSectionMaxHeightConfiguration(): Promise<string> {
        return configService.getConfig('sectionMaxHeight');
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
										sectionMaxHeight: "auto",
                    fontSize: "0_5x",
                    whitespace: "8px",
                    tagVisibility: "allexcludinglayout",
                    arrowKeyFocusScroll: "center"
                }
            },
            normal: {
                label: "Normal",
                description: "Default balanced view",
                settings: {
                    columnWidth: "350px",
                    cardHeight: "auto",
										sectionMaxHeight: "auto",
                    fontSize: "1x",
                    whitespace: "8px",
                    tagVisibility: "allexcludinglayout",
                    arrowKeyFocusScroll: "center"
                }
            },
            grid3x: {
                label: "3x3 Grid",
                description: "Grid layout for organized viewing",
                settings: {
                    columnWidth: "33percent",
                    cardHeight: "auto",
										sectionMaxHeight: "auto",
                    fontSize: "1x",
                    whitespace: "12px",
                    arrowKeyFocusScroll: "nearest"
                }
            },
						twoThirds: {
							label: "2/3 Grid",
							description: "Grid layout for organized viewing",
							settings: {
									columnWidth: "66percent",
									cardHeight: "auto",
									fontSize: "1_5x",
									whitespace: "12px",
									sectionMaxHeight: "66percent",
                  arrowKeyFocusScroll: "nearest"
							}
						},
            presentation: {
                label: "Presentation",
                description: "Full screen view for presentations",
                settings: {
                    columnWidth: "100percent",
                    cardHeight: "100percent",
										sectionMaxHeight: "100percent",
                    fontSize: "3x",
                    stickyHeaders: "disabled",
                    tagVisibility: "none",
                    whitespace: "16px",
                    arrowKeyFocusScroll: "center"
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
        KanbanWebviewPanel.panelStates.set(this._panelId, {
            documentUri: document.uri.toString(),
            panelId: this._panelId
        });

        // Also store in VSCode's global state for persistence across restarts
        // Use documentUri hash as stable key so panels can find their state after restart
        const stableKey = `kanban_doc_${Buffer.from(document.uri.toString()).toString('base64').replace(/[^a-zA-Z0-9]/g, '_')}`;
        this._context.globalState.update(stableKey, {
            documentUri: document.uri.toString(),
            lastAccessed: Date.now(),
            panelId: this._panelId  // Store for cleanup but don't use for lookup
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
            const oldDocUri = this._trackedDocumentUri || previousDocument?.uri.toString();
            if (oldDocUri && KanbanWebviewPanel.panels.get(oldDocUri) === this) {
                KanbanWebviewPanel.panels.delete(oldDocUri);
                // Unregister the old main file from the watcher if we have a previous document
                if (previousDocument) {
                    this._fileWatcher.unregisterFile(previousDocument.uri.fsPath, this);
                }
            }

            // Add to new document tracking
            const newDocUri = document.uri.toString();
            this._trackedDocumentUri = newDocUri;  // Remember this URI for cleanup
            KanbanWebviewPanel.panels.set(newDocUri, this);

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

            // Handle any unsaved changes in files that need to be removed
            await this._handleUnsavedIncludeFileChanges();

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

        const sectionMaxHeight = await this._getSectionMaxHeightConfiguration();

        const fontSize = await this._getFontSizeConfiguration();
        
        const fontFamily = await this._getFontFamilyConfiguration();
        
        const columnWidth = await this._getColumnWidthConfiguration();
        
        const layoutRows = await this._getLayoutRowsConfiguration();
        
        const rowHeight = await this._getRowHeightConfiguration();

        const layoutPreset = await this._getLayoutPresetConfiguration();

        const layoutPresets = await this._getLayoutPresetsConfiguration();

        const showRowTags = await this._getShowRowTagsConfiguration();

        const maxRowHeight = await this._getMaxRowHeightConfiguration();

        const columnBorder = await this._getColumnBorderConfiguration();

        const taskBorder = await this._getTaskBorderConfiguration();

        console.log('[Border-Debug] About to send via postMessage - columnBorder:', columnBorder, 'taskBorder:', taskBorder);

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
                sectionMaxHeight: sectionMaxHeight,
                fontSize: fontSize,
                fontFamily: fontFamily,
                columnWidth: columnWidth,
                layoutRows: layoutRows,
                rowHeight: rowHeight,
                layoutPreset: layoutPreset,
                layoutPresets: layoutPresets,
                showRowTags: showRowTags,
                maxRowHeight: maxRowHeight,
                columnBorder: columnBorder,
                taskBorder: taskBorder,
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
            ).then(async selection => {
                if (selection === 'Open File') {
                    await this.openFileWithReuseCheck(document.uri.fsPath);
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
            'utils/activityIndicator.js',
            'runtime-tracker.js',
            'markdownRenderer.js',
            'taskEditor.js',
            'boardRenderer.js',
            'dragDrop.js',
            'menuOperations.js',
            'search.js',
            'debugOverlay.js',
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
            'markdown-it-include-browser.js',
            'markdown-it-image-figures-browser.js'
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
        // Check if there are unsaved changes before closing - use unified file state
        const fileState = this._messageHandler?.getUnifiedFileState();
        const hasMainUnsavedChanges = fileState?.hasInternalChanges || false;
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

            // Use the unified conflict resolver with consistent data
            const context: ConflictContext = {
                type: 'panel_close',
                fileType: 'main', // Main context but includes both main and include files
                filePath: document?.uri.fsPath || '',
                fileName: fileName,
                hasMainUnsavedChanges: hasMainUnsavedChanges, // This was already updated above
                hasIncludeUnsavedChanges: hasIncludeUnsavedChanges,
                changedIncludeFiles: changedIncludeFiles,
                isClosing: true
            };

            try {
                const resolution = await this.showConflictDialog(context);

                if (!resolution || !resolution.shouldProceed) {
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

        // Remove from panels map using the tracked URI (which persists even after document is closed)
        if (this._trackedDocumentUri && KanbanWebviewPanel.panels.get(this._trackedDocumentUri) === this) {
            KanbanWebviewPanel.panels.delete(this._trackedDocumentUri);
        }

        // Also check all entries as a fallback in case tracking failed
        for (const [uri, panel] of KanbanWebviewPanel.panels.entries()) {
            if (panel === this) {
                KanbanWebviewPanel.panels.delete(uri);
            }
        }

        // Clear panel state
        KanbanWebviewPanel.panelStates.delete(this._panelId);

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
                ).then(async (choice) => {
                    if (choice === 'Open backup file') {
                        await this.openFileWithReuseCheck(backupPath);
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

    private async _getColumnBorderConfiguration(): Promise<string> {
        const value = configService.getConfig('columnBorder', '1px solid var(--vscode-panel-border)');
        console.log('[Border-Debug] _getColumnBorderConfiguration returned:', value);
        return value;
    }

    private async _getTaskBorderConfiguration(): Promise<string> {
        const value = configService.getConfig('taskBorder', '1px solid var(--vscode-panel-border)');
        console.log('[Border-Debug] _getTaskBorderConfiguration returned:', value);
        return value;
    }


    /**
     * Centralized dialog manager - prevents duplicate conflict dialogs
     */
    private async showConflictDialog(context: ConflictContext): Promise<ConflictResolution | null> {
        const now = Date.now();

        // If there's already an active dialog, wait for it to complete first
        if (this._activeConflictDialog) {
            await this._activeConflictDialog;
        }

        // Throttle dialog frequency to prevent spam
        const timeSinceLastDialog = now - this._lastDialogTimestamp;
        if (timeSinceLastDialog < this._MIN_DIALOG_INTERVAL) {
            return null; // Skip this dialog
        }

        // Update timestamp before showing dialog
        this._lastDialogTimestamp = now;

        // Start the new dialog and track it
        this._activeConflictDialog = this._conflictResolver.resolveConflict(context);

        try {
            const resolution = await this._activeConflictDialog;
            return resolution;
        } finally {
            this._activeConflictDialog = null;
        }
    }

    /**
     * Notify user about external changes without forcing reload
     */
    private async notifyExternalChanges(document: vscode.TextDocument): Promise<void> {
        const fileName = path.basename(document.fileName);

        // Get unified file state from message handler - ALL SYSTEMS MUST USE THIS!
        const fileState = this._messageHandler?.getUnifiedFileState();

        const hasIncludeUnsavedChanges = Array.from(this._includeFiles.values()).some(file => file.hasUnsavedChanges);
        const changedIncludeFiles = Array.from(this._changedIncludeFiles);

        // Use the unified conflict resolver with consistent data
        const context: ConflictContext = {
            type: 'external_main',
            fileType: 'main',
            filePath: document.uri.fsPath,
            fileName: fileName,
            hasMainUnsavedChanges: fileState?.hasInternalChanges || false,
            hasIncludeUnsavedChanges: hasIncludeUnsavedChanges,
            changedIncludeFiles: changedIncludeFiles
        };

        try {
            const resolution = await this.showConflictDialog(context);

            if (!resolution) {
                // Dialog was throttled/skipped
                return;
            }

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
        const fileStateManager = getFileStateManager();

        // Listen for document changes
        const changeDisposable = vscode.workspace.onDidChangeTextDocument((event) => {
            const currentDocument = this._fileManager.getDocument();
            if (currentDocument && event.document === currentDocument) {
                // Update FileStateManager with editor changes for main file
                fileStateManager.markEditorChange(
                    event.document.uri.fsPath,
                    event.document.isDirty,
                    event.document.version
                );

                // Document was modified externally (not by our kanban save operation)
                if (!this._isUpdatingFromPanel) {
                    this._hasExternalUnsavedChanges = true;
                }

                // Notify debug overlay of document state change so it can update editor state
                this._panel.webview.postMessage({
                    type: 'documentStateChanged',
                    isDirty: event.document.isDirty,
                    version: event.document.version
                });
            }

            // Check if this is an included file
            for (const [relativePath, includeFile] of this._includeFiles) {
                if (event.document.uri.fsPath === includeFile.absolutePath) {
                    // Update FileStateManager with editor changes for include file
                    fileStateManager.markEditorChange(
                        event.document.uri.fsPath,
                        event.document.isDirty,
                        event.document.version
                    );

                    // Mark the included file as having unsaved changes in the editor (legacy compatibility)
                    includeFile.isUnsavedInEditor = event.document.isDirty;

                    // Notify debug overlay to update
                    this._panel.webview.postMessage({
                        type: 'includeFileStateChanged',
                        filePath: relativePath,
                        isUnsavedInEditor: event.document.isDirty
                    });
                    break;
                }
            }
        });
        this._disposables.push(changeDisposable);

        // Listen for document saves to sync version tracking
        const saveDisposable = vscode.workspace.onDidSaveTextDocument((document) => {
            const currentDocument = this._fileManager.getDocument();
            if (currentDocument && document === currentDocument) {
                // Update FileStateManager that main file was saved
                fileStateManager.markSaved(document.uri.fsPath, ''); // Content will be updated by save operation

                // Document was saved, update our version tracking to match (legacy compatibility)
                this._lastDocumentVersion = document.version;
                this._hasExternalUnsavedChanges = false;
            }

            // Check if this is an included file
            for (const [relativePath, includeFile] of this._includeFiles) {
                if (document.uri.fsPath === includeFile.absolutePath) {
                    // Update FileStateManager that include file was saved
                    fileStateManager.markSaved(document.uri.fsPath, includeFile.content || '');

                    // Clear unsaved state for the included file (legacy compatibility)
                    includeFile.isUnsavedInEditor = false;

                    // Mark that this include file has external changes that need reloading (legacy compatibility)
                    includeFile.hasExternalChanges = true;
                    this._includeFilesChanged = true;
                    this._changedIncludeFiles.add(relativePath);

                    // Notify debug overlay to update
                    this._panel.webview.postMessage({
                        type: 'includeFileStateChanged',
                        filePath: relativePath,
                        isUnsavedInEditor: false
                    });

                    // Trigger external change handling which will offer to reload
                    const changeEvent: import('./externalFileWatcher').FileChangeEvent = {
                        path: includeFile.absolutePath,
                        changeType: 'modified',
                        fileType: 'include',
                        panels: [this]
                    };
                    this.handleExternalFileChange(changeEvent);
                    break;
                }
            }
        });
        this._disposables.push(saveDisposable);
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

                // Use unified file state for consistent data
                const fileState = this._messageHandler?.getUnifiedFileState();

                const context: ConflictContext = {
                    type: 'presave_check',
                    fileType: 'main',
                    filePath: document.uri.fsPath,
                    fileName: fileName,
                    hasMainUnsavedChanges: fileState?.hasInternalChanges || true, // We're in the process of saving
                    hasIncludeUnsavedChanges: false,
                    changedIncludeFiles: []
                };

                try {
                    const resolution = await this.showConflictDialog(context);
                    if (!resolution || !resolution.shouldProceed) {
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
                        const resolution = await this.showConflictDialog(context);
                        if (!resolution || !resolution.shouldProceed) {
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
     * This is used for manual refresh operations, not external file changes
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

        // For manual refresh, we update all columns that use include files
        // This goes through the unified entry point
        if (this._board) {
            for (const column of this._board.columns) {
                if (column.includeMode && column.includeFiles && column.includeFiles.length > 0) {
                    await this.updateIncludeContentUnified(column, column.includeFiles, 'manual_refresh');
                }
            }
        }
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

            // CRITICAL: Check if the unified system has this include file and if it matches the column
            const normalizedPath = includeFile.startsWith('./') ? includeFile : './' + includeFile;
            const unifiedIncludeFile = this._includeFiles.get(normalizedPath) || this._includeFiles.get(includeFile);

            if (!unifiedIncludeFile) {
                return false;
            }

            // CRITICAL FIX: Check if the column's tasks actually came from this file's baseline
            // This prevents saving old file's tasks to a new file after changing the include path
            const baselineTasks = PresentationParser.parseMarkdownToTasks(unifiedIncludeFile.baseline);

            // Check overlap between baseline and current column tasks
            let baselineOverlapCount = 0;
            if (baselineTasks.length > 0 && column.tasks.length > 0) {
                for (const baselineTask of baselineTasks) {
                    for (const columnTask of column.tasks) {
                        if (baselineTask.title === columnTask.title ||
                            baselineTask.title.includes(columnTask.title) ||
                            columnTask.title.includes(baselineTask.title)) {
                            baselineOverlapCount++;
                            break;
                        }
                    }
                }
            }

            const baselineOverlapRatio = baselineTasks.length > 0
                ? baselineOverlapCount / Math.min(baselineTasks.length, column.tasks.length)
                : 0;

            // If there's NO overlap with the baseline, the tasks came from a different file
            // This happens when include file path is changed but new content hasn't loaded yet
            if (baselineTasks.length > 0 && column.tasks.length > 0 && baselineOverlapRatio < 0.3) {
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

            // Update unified system tracking (reuse the variable we already found)
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
        // Try both with and without ./ prefix for path normalization
        const normalizedPath = includeFile.startsWith('./') ? includeFile : './' + includeFile;
        const unifiedIncludeFile = this._includeFiles.get(includeFile) || this._includeFiles.get(normalizedPath);

        // Check if this file has unsaved changes using unified system
        return unifiedIncludeFile?.hasUnsavedChanges === true;
    }

    /**
     * Check if a column's include files have unsaved changes
     */
    public async checkColumnIncludeUnsavedChanges(column: KanbanColumn): Promise<boolean> {
        if (!column.includeMode || !column.includeFiles || column.includeFiles.length === 0) {
            return false;
        }

        const includeFile = column.includeFiles[0];
        // Try both with and without ./ prefix for path normalization
        const normalizedPath = includeFile.startsWith('./') ? includeFile : './' + includeFile;
        const unifiedIncludeFile = this._includeFiles.get(includeFile) || this._includeFiles.get(normalizedPath);

        // Check if this file has unsaved changes using unified system
        return unifiedIncludeFile?.hasUnsavedChanges === true;
    }

    /**
     * Check if a specific include file has unsaved changes
     */
    public hasUnsavedIncludeFileChanges(relativePath: string): boolean {
        const unifiedIncludeFile = this._includeFiles.get(relativePath);
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
     * UNIFIED ENTRY POINT for all include content updates
     * This method MUST be used for all include content changes to ensure proper conflict detection
     */
    public async updateIncludeContentUnified(
        column: KanbanColumn,
        newIncludeFiles: string[],
        source: 'external_file_change' | 'column_title_edit' | 'manual_refresh' | 'conflict_resolution'
    ): Promise<void> {

        // For external file changes, we MUST go through conflict detection
        if (source === 'external_file_change') {
            throw new Error('External file changes must go through handleIncludeFileConflict for proper conflict detection');
        }

        // For all other sources, proceed with direct update
        await this.loadNewIncludeContent(column, newIncludeFiles);
    }

    /**
     * Load new content into a column when its include files change
     * INTERNAL METHOD - should only be called from updateIncludeContentUnified
     */
    private async loadNewIncludeContent(column: KanbanColumn, newIncludeFiles: string[]): Promise<void> {

        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                console.warn(`[loadNewIncludeContent] No current document available`);
                return;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);

            // For now, handle single file includes
            const includeFile = newIncludeFiles[0];
            const absolutePath = path.resolve(basePath, includeFile);

            // Ensure the new include file is registered in the unified system
            this.getOrCreateIncludeFile(includeFile, 'column');

            // Use shared method to read and update content
            const fileContent = await this.readAndUpdateIncludeContent(absolutePath, includeFile);

            if (fileContent !== null) {

                // Smart detection: check if content is presentation format or regular markdown tasks
                const hasSlideMarkers = fileContent.includes('---');
                const hasTaskMarkers = fileContent.includes('- [ ]') || fileContent.includes('- [x]');

                let newTasks: KanbanTask[];
                if (hasSlideMarkers && !hasTaskMarkers) {
                    // Use presentation parser for slide-based content
                    newTasks = PresentationParser.parseMarkdownToTasks(fileContent);
                } else if (hasTaskMarkers) {
                    // Use existing markdown parser for task-based content
                    const tempParseResult = MarkdownKanbanParser.parseMarkdown(fileContent);
                    // Extract all tasks from all columns in the parsed board
                    newTasks = tempParseResult.board.columns.flatMap(col => col.tasks);
                } else {
                    // Default to presentation parser
                    newTasks = PresentationParser.parseMarkdownToTasks(fileContent);
                }


                // Update the column's tasks directly
                column.tasks = newTasks;

                const updateMessage = {
                    type: 'updateColumnContent',
                    columnId: column.id,
                    tasks: newTasks,
                    includeFile: includeFile,
                    columnTitle: column.title,
                    displayTitle: column.displayTitle,
                    includeMode: column.includeMode,
                    includeFiles: column.includeFiles
                };

                // Send targeted update message to frontend instead of full refresh
                this._panel.webview.postMessage(updateMessage);

                // Update file watcher to monitor the new include file
                const allIncludePaths = this.getAllIncludeFilePaths();
                this._fileWatcher.updateIncludeFiles(this, allIncludePaths);

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

                // Still update file watcher even for missing files (in case they get created later)
                const allIncludePaths = this.getAllIncludeFilePaths();
                this._fileWatcher.updateIncludeFiles(this, allIncludePaths);
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

            // Normalize the path to match keys in _includeFiles map
            const normalizedIncludeFile = includeFile.startsWith('./') ? includeFile : './' + includeFile;

            // Use shared method to read and update content
            const fileContent = await this.readAndUpdateIncludeContent(absolutePath, normalizedIncludeFile);

            if (fileContent !== null) {
                const lines = fileContent.split('\n');

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
                    includeFile: normalizedIncludeFile,
                    taskTitle: task.title,
                    displayTitle: task.displayTitle,
                    originalTitle: task.originalTitle,
                    includeMode: task.includeMode,
                    includeFiles: task.includeFiles
                });

                // Clear the hasUnsavedChanges flag since we just loaded from external file
                const includeFileEntry = this._includeFiles.get(normalizedIncludeFile);
                if (includeFileEntry) {
                    includeFileEntry.hasUnsavedChanges = false;
                }

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
     * Update task include with conflict detection (like column includes)
     */
    private async updateTaskIncludeWithConflictDetection(task: KanbanTask, relativePath: string): Promise<void> {
        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                return;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);
            const absolutePath = path.resolve(basePath, relativePath);

            // Normalize the path to match keys in _includeFiles map
            const normalizedPath = relativePath.startsWith('./') ? relativePath : './' + relativePath;

            // Get or create the include file entry
            const unifiedIncludeFile = this.getOrCreateIncludeFile(normalizedPath, 'task');


            // Check if there are unsaved changes that would be overwritten
            if (unifiedIncludeFile?.hasUnsavedChanges === true) {
                // Show conflict dialog just like column includes
                await this.handleIncludeFileConflict(absolutePath, normalizedPath);
            } else {
                // No conflicts, proceed with direct update
                await this.loadNewTaskIncludeContent(task, [relativePath]);
            }
        } catch (error) {
            console.error(`[TASK-CONFLICT-ERROR] Error in updateTaskIncludeWithConflictDetection:`, error);
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

        // Filter out columns whose include files were recently reloaded from external
        const columnsToSave = includeColumns.filter(col => {
            if (!col.includeFiles || col.includeFiles.length === 0) {
                return true; // No include files to check
            }

            // Check if any of the column's include files were recently reloaded
            return !col.includeFiles.some(file => {
                const normalizedFile = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                const isRecentlyReloaded = this._recentlyReloadedFiles.has(normalizedFile) || this._recentlyReloadedFiles.has(file);
                return isRecentlyReloaded;
            });
        });

        const savePromises = columnsToSave.map(col => this.saveColumnIncludeChanges(col));

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
                    // Check if any of the task's include files were recently reloaded
                    const shouldSkip = task.includeFiles?.some(file => {
                        const normalizedFile = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                        const isRecentlyReloaded = this._recentlyReloadedFiles.has(normalizedFile) || this._recentlyReloadedFiles.has(file);
                        return isRecentlyReloaded;
                    });

                    if (!shouldSkip) {
                        includeTasks.push(task);
                    }
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

        // Normalize path format to match how includes are stored (with ./ prefix for relative paths)
        if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
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

        // Capture the unsaved changes flag BEFORE any file operations
        let hasUnsavedIncludeChanges = includeFile.hasUnsavedChanges;

        // Check if the external file has actually changed BEFORE loading it (for automatic reload decision)
        const hasExternalChangesBeforeLoad = this.hasExternalChanges(relativePath);

        // CASE 1: No unsaved changes + external changes = Auto-reload immediately (no dialog)
        // This is the normal case for include files since they "cannot be modified internally"
        if (!hasUnsavedIncludeChanges && hasExternalChangesBeforeLoad) {
            // Safe auto-reload: update internal content to match external file
            await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task', true);
            return;
        }

        // CASE 2: Has unsaved changes - need to show conflict dialog
        // Load the external content to check if there's actually a conflict
        const updatedContent = await this.readAndUpdateIncludeContent(filePath, relativePath);
        if (updatedContent === null) {
            return;
        }

        // Check external changes again AFTER loading
        const hasExternalChanges = this.hasExternalChanges(relativePath);

        // CASE 3: No conflict - nothing to do
        if (!hasUnsavedIncludeChanges && !hasExternalChanges) {
            return;
        }

        // CASE 4: Show conflict dialog with proper options per specification
        const context: ConflictContext = {
            type: 'external_include',
            fileType: 'include',
            filePath: filePath,
            fileName: fileName,
            hasMainUnsavedChanges: false,
            hasIncludeUnsavedChanges: hasUnsavedIncludeChanges,
            hasExternalChanges: hasExternalChanges,
            changedIncludeFiles: [relativePath]
        };

        try {
            const resolution = await this._conflictResolver.resolveConflict(context);

            if (resolution.shouldReload && !resolution.shouldCreateBackup) {
                // Discard local changes and reload from external file
                includeFile.hasUnsavedChanges = false;
                await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task', true);

                // Mark this file as recently reloaded to prevent immediate re-saving
                const basePath = path.dirname(this._fileManager.getDocument()!.uri.fsPath);
                const relativePath = path.relative(basePath, filePath);
                const normalizedPath = (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) ? './' + relativePath : relativePath;
                this._recentlyReloadedFiles.add(normalizedPath);

                // Clear the flag after a short delay to allow normal saving later
                setTimeout(() => {
                    this._recentlyReloadedFiles.delete(normalizedPath);
                }, 2000); // 2 second delay

            } else if (resolution.shouldCreateBackup && resolution.shouldReload) {
                // Save current changes as backup, then reload external
                if (includeFile.type === 'column' || includeFile.type === 'task') {
                    await this.saveIncludeFileAsBackup(filePath);
                }

                includeFile.hasUnsavedChanges = false;
                await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task', true);

                // Mark this file as recently reloaded to prevent immediate re-saving
                const basePath = path.dirname(this._fileManager.getDocument()!.uri.fsPath);
                const relativePath = path.relative(basePath, filePath);
                const normalizedPath = (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) ? './' + relativePath : relativePath;
                this._recentlyReloadedFiles.add(normalizedPath);

                // Clear the flag after a short delay to allow normal saving later
                setTimeout(() => {
                    this._recentlyReloadedFiles.delete(normalizedPath);
                }, 2000); // 2 second delay

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
     * Shared method to read include file content and update unified system
     */
    private async readAndUpdateIncludeContent(filePath: string, relativePath: string): Promise<string | null> {
        let updatedContent: string | null = null;
        try {
            if (fs.existsSync(filePath)) {
                updatedContent = fs.readFileSync(filePath, 'utf8');
            }
        } catch (error) {
            console.error(`[readAndUpdateIncludeContent] Error reading file:`, error);
            return null;
        }

        // Update the unified system content and baseline
        if (updatedContent !== null) {
            // CRITICAL: Don't reset hasUnsavedChanges when loading external content if user has unsaved changes
            const includeFile = this._includeFiles.get(relativePath);
            const preserveUnsavedFlag = includeFile?.hasUnsavedChanges === true;

            this.updateIncludeFileContent(relativePath, updatedContent, true, preserveUnsavedFlag);
        }

        return updatedContent;
    }


    /**
     * Unified method to update any type of include file
     */
    private async updateIncludeFile(filePath: string, isColumnInclude: boolean, isTaskInclude: boolean, skipConflictDetection: boolean = false): Promise<void> {
        if (!this._board) {
            return;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        let relativePath = path.relative(basePath, filePath);

        // Normalize path format to match how includes are stored (with ./ prefix for relative paths)
        if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }

        if (isColumnInclude) {
            // Handle column includes using existing system
            for (const column of this._board.columns) {
                // Check both normalized and original paths since column.includeFiles might store the original format
                const hasFile = column.includeMode && column.includeFiles?.some(file => {
                    const normalizedFile = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                    return normalizedFile === relativePath || file === relativePath;
                });
                if (hasFile) {
                    await this.updateIncludeContentUnified(column, [relativePath], 'conflict_resolution');
                    break;
                }
            }
        } else if (isTaskInclude) {
            // Handle task includes - need to find and update the specific task with conflict detection
            for (const column of this._board.columns) {
                for (const task of column.tasks) {
                    // Check both normalized and original paths since task.includeFiles might store the original format
                    const hasFile = task.includeMode && task.includeFiles?.some(file => {
                        const normalizedFile = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                        return normalizedFile === relativePath || file === relativePath;
                    });
                    if (hasFile) {
                        if (skipConflictDetection) {
                            // Skip conflict detection and update directly (already resolved)
                            await this.loadNewTaskIncludeContent(task, [relativePath]);
                        } else {
                            // Use task-specific conflict detection
                            await this.updateTaskIncludeWithConflictDetection(task, relativePath);
                        }
                        return; // Found and updated the task
                    }
                }
            }
        } else {
            // Handle regular includes using unified system
            const updatedContent = await this.readAndUpdateIncludeContent(filePath, relativePath);

            // Send updated content to frontend only if content was successfully read
            if (updatedContent !== null) {
                this._panel?.webview.postMessage({
                    type: 'updateIncludeContent',
                    filePath: relativePath,
                    content: updatedContent
                });

                // NOTE: Don't send includesUpdated message here as it causes redundant renders
                // The frontend will re-render when it receives the updateIncludeContent message
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

        // Normalize path to match the format stored in includeFiles
        // Column includes store without ./ prefix, task includes store with ./ prefix
        const normalizedRelativePath = relativePath.startsWith('./') ? relativePath : './' + relativePath;
        const normalizedRelativePathWithoutPrefix = relativePath.startsWith('./') ? relativePath.substring(2) : relativePath;

        for (const column of this._board.columns) {
            // Check column includes (they store without ./ prefix)
            if (column.includeMode && column.includeFiles?.includes(normalizedRelativePathWithoutPrefix)) {
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
                    ).then(async choice => {
                        if (choice === 'Open backup file') {
                            await this.openFileWithReuseCheck(backupPath);
                        }
                    });
                }
                return; // Found and handled column include
            }

            // Check task includes
            for (const task of column.tasks) {
                if (task.includeMode && task.includeFiles?.includes(normalizedRelativePath)) {
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

                    // Use BackupManager for consistent backup creation
                    const backupPath = await this._backupManager.createFileBackup(filePath, expectedContent, {
                        label: 'conflict',
                        forceCreate: true
                    });

                    if (backupPath) {
                        vscode.window.showInformationMessage(
                            `Backup saved as "${path.basename(backupPath)}"`,
                            'Open backup file'
                        ).then(async choice => {
                            if (choice === 'Open backup file') {
                                await this.openFileWithReuseCheck(backupPath);
                            }
                        });
                    }
                    return; // Found and handled task include
                }
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
        let relativePath: string;

        // Handle both absolute and relative paths
        if (path.isAbsolute(filePath)) {
            relativePath = path.relative(basePath, filePath);
        } else {
            relativePath = filePath;
        }

        // Normalize paths for comparison - need to handle both storage formats
        const normalizedRelativePath = relativePath.startsWith('./') ? relativePath : './' + relativePath;
        const normalizedRelativePathWithoutPrefix = relativePath.startsWith('./') ? relativePath.substring(2) : relativePath;

        // Check column includes - they can be stored in multiple formats
        for (const column of this._board.columns) {
            if (column.includeMode && column.includeFiles) {
                // Check if any of the stored paths match our target file
                const hasMatch = column.includeFiles.some(storedPath => {
                    // Compare all possible path formats
                    const normalizedStored = storedPath.startsWith('./') ? storedPath : './' + storedPath;
                    const storedWithoutPrefix = storedPath.startsWith('./') ? storedPath.substring(2) : storedPath;

                    return storedPath === relativePath ||
                           storedPath === normalizedRelativePath ||
                           storedPath === normalizedRelativePathWithoutPrefix ||
                           normalizedStored === normalizedRelativePath ||
                           storedWithoutPrefix === normalizedRelativePathWithoutPrefix;
                });

                if (hasMatch) {
                    await this.saveColumnIncludeChanges(column);
                    return; // Found and saved column include
                }
            }
        }

        // Check task includes - they can also be stored in multiple formats
        for (const column of this._board.columns) {
            for (const task of column.tasks) {
                if (task.includeMode && task.includeFiles) {
                    // Check if any of the stored paths match our target file
                    const hasMatch = task.includeFiles.some(storedPath => {
                        // Compare all possible path formats
                        const normalizedStored = storedPath.startsWith('./') ? storedPath : './' + storedPath;
                        const storedWithoutPrefix = storedPath.startsWith('./') ? storedPath.substring(2) : storedPath;

                        return storedPath === relativePath ||
                               storedPath === normalizedRelativePath ||
                               storedPath === normalizedRelativePathWithoutPrefix ||
                               normalizedStored === normalizedRelativePath ||
                               storedWithoutPrefix === normalizedRelativePathWithoutPrefix;
                    });

                    if (hasMatch) {
                        // Save task include content
                        await this.saveTaskIncludeChanges(task);

                        // Also clear the unsaved changes flag in unified system
                        const includeFile = this._includeFiles.get(normalizedRelativePath);
                        if (includeFile) {
                            includeFile.hasUnsavedChanges = false;
                        }

                        return; // Found and saved task include
                    }
                }
            }
        }
    }

    /**
     * Handle external file changes from the file watcher
     */
    private async handleExternalFileChange(event: import('./externalFileWatcher').FileChangeEvent): Promise<void> {
        try {
            // Check if this panel is affected by the change
            if (!event.panels.includes(this)) {
                return;
            }

            // Handle different types of file changes
            if (event.fileType === 'include') {
                // Check if this is a column include file or inline include file
                const isColumnInclude = await this.isColumnIncludeFile(event.path);
                const isTaskInclude = await this.isTaskIncludeFile(event.path);

                if (isColumnInclude || isTaskInclude) {
                    // This is a column or task include file - handle conflict resolution
                    await this.handleIncludeFileConflict(event.path, event.changeType);
                } else {
                    // This is an inline include file - use conflict resolution
                    await this.handleInlineIncludeFileChange(event.path, event.changeType);
                }
            } else if (event.fileType === 'main') {
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
        if (!this._board) {
            return false;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return false;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        let relativePath = path.relative(basePath, filePath);

        // Normalize path format to match how includes are stored (with ./ prefix for relative paths)
        if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }

        // Check if any column uses this file as an include file
        for (const column of this._board.columns) {
            if (column.includeMode && column.includeFiles) {
                // Check for match with proper normalization
                const hasMatch = column.includeFiles.some(file => {
                    // Normalize both the stored file path and the relative path for comparison
                    const normalizedStored = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                    const normalizedRelative = (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) ? './' + relativePath : relativePath;
                    return normalizedStored === normalizedRelative || file === relativePath || normalizedStored === relativePath;
                });
                if (hasMatch) {
                    return true;
                }
            }
        }
        return false;
    }

    /**
     * Check if a file path is used as a task include file
     */
    private async isTaskIncludeFile(filePath: string): Promise<boolean> {
        if (!this._board) {
            return false;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return false;
        }

        const basePath = path.dirname(currentDocument.uri.fsPath);
        let relativePath = path.relative(basePath, filePath);

        // Normalize path format to match how includes are stored (with ./ prefix for relative paths)
        if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
            relativePath = './' + relativePath;
        }

        // Check if any task uses this file as an include file
        for (const column of this._board.columns) {
            for (const task of column.tasks) {
                if (task.includeMode && task.includeFiles) {
                    // Check for match with proper normalization
                    const hasMatch = task.includeFiles.some(file => {
                        // Normalize both the stored file path and the relative path for comparison
                        const normalizedStored = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                        const normalizedRelative = (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) ? './' + relativePath : relativePath;
                        return normalizedStored === normalizedRelative || file === relativePath || normalizedStored === relativePath;
                    });
                    if (hasMatch) {
                        return true;
                    }
                }
            }
        }
        return false;
    }

    /**
     * Read content from a file on disk
     */
    private async readFileContent(filePath: string): Promise<string | null> {
        try {
            const fs = require('fs').promises;
            const content = await fs.readFile(filePath, 'utf8');
            return content;
        } catch (error) {
            console.warn(`[KanbanWebviewPanel] Could not read file ${filePath}:`, error);
            return null;
        }
    }

    /**
     * Handle changes to inline include files (!!!include(file)!!! statements)
     */
    private async handleInlineIncludeFileChange(filePath: string, changeType: string): Promise<void> {
        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                return;
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);
            let relativePath = path.relative(basePath, filePath);

            // Normalize path format to match how includes are stored (with ./ prefix for relative paths)
            if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
                relativePath = './' + relativePath;
            }

            // Ensure the inline include file is registered in the unified system
            this.ensureIncludeFileRegistered(relativePath, 'regular');

            // Read the new external content
            const newExternalContent = await this.readFileContent(filePath);

            if (newExternalContent !== null) {
                // Update the include file in the unified system
                const includeFile = this._includeFiles.get(relativePath);
                if (includeFile) {
                    // Check if content actually changed
                    if (newExternalContent !== includeFile.content) {
                        // Update the content and baseline
                        includeFile.content = newExternalContent;
                        includeFile.baseline = newExternalContent;
                        includeFile.hasUnsavedChanges = false;
                        includeFile.hasExternalChanges = false;
                        includeFile.lastModified = Date.now();

                        // Automatically update the content in the frontend
                        await this.updateInlineIncludeFile(filePath, relativePath);

                        // Trigger a board refresh to re-render with the new content
                        await this.sendBoardUpdate(false, true);

                    }
                }
            }

        } catch (error) {
            console.error('[InlineInclude] Error handling inline include file change:', error);
        }
    }

    /**
     * Ensure an include file is registered in the unified system for conflict resolution
     */
    public ensureIncludeFileRegistered(relativePath: string, type: 'regular' | 'column' | 'task'): void {
        if (!this._includeFiles.has(relativePath)) {
            const currentDocument = this._fileManager.getDocument();
            const basePath = currentDocument ? path.dirname(currentDocument.uri.fsPath) : '';
            const absolutePath = path.resolve(basePath, relativePath);

            // Register the inline include file in the unified system
            const includeFile: IncludeFile = {
                absolutePath: absolutePath,
                relativePath: relativePath,
                type: type,
                content: '',
                baseline: '',
                hasUnsavedChanges: false,
                lastModified: Date.now()
            };
            this._includeFiles.set(relativePath, includeFile);

            // Also register in FileStateManager
            const fileStateManager = getFileStateManager();
            const fileType = type === 'column' ? 'include-column' :
                           type === 'task' ? 'include-task' :
                           'include-regular'; // regular includes

            fileStateManager.initializeFile(
                absolutePath,
                relativePath,
                false,
                fileType
            );
        }
    }

    /**
     * Save main kanban changes (used when user chooses to overwrite external include changes)
     */
    private async saveMainKanbanChanges(): Promise<void> {
        try {
            await this.saveToMarkdown();
        } catch (error) {
            console.error('[InlineInclude] Error saving main kanban changes:', error);
            vscode.window.showErrorMessage(`Error saving kanban changes: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Update an inline include file by reading content and sending to frontend
     */
    private async updateInlineIncludeFile(absolutePath: string, relativePath: string): Promise<void> {
        try {
            let updatedContent: string | null = null;
            if (fs.existsSync(absolutePath)) {
                updatedContent = fs.readFileSync(absolutePath, 'utf8');
            }

            // Update the unified system
            const includeFile = this._includeFiles.get(relativePath);
            if (includeFile && updatedContent !== null) {
                includeFile.content = updatedContent;
                includeFile.baseline = updatedContent;
                includeFile.hasUnsavedChanges = false;
                includeFile.lastModified = Date.now();
            }

            // Send updated content to frontend
            if (this._panel) {
                this._panel.webview.postMessage({
                    type: 'includeFileContent',
                    filePath: relativePath,
                    content: updatedContent
                });
            }

        } catch (error) {
            console.error('[InlineInclude] Error updating inline include file:', error);
        }
    }

    /**
     * Open a file with reuse check - focuses existing editor if already open
     */
    private async openFileWithReuseCheck(filePath: string): Promise<void> {
        try {
            // Normalize the path for comparison (resolve symlinks, normalize separators)
            const normalizedPath = path.resolve(filePath);

            // Check if the file is already open as a document (even if not visible)
            const existingDocument = vscode.workspace.textDocuments.find(doc => {
                const docPath = path.resolve(doc.uri.fsPath);
                return docPath === normalizedPath;
            });

            if (existingDocument) {
                // File is already open, focus it
                await vscode.window.showTextDocument(existingDocument, {
                    preserveFocus: false,
                    preview: false
                    // Let VS Code find the existing tab location
                });
            } else {
                // File is not open, open it normally
                const fileUri = vscode.Uri.file(filePath);
                const document = await vscode.workspace.openTextDocument(fileUri);
                await vscode.window.showTextDocument(document, {
                    preserveFocus: false,
                    preview: false
                });
            }
        } catch (error) {
            console.error(`[KanbanWebviewPanel] Error opening file ${filePath}:`, error);
        }
    }

    /**
     * Track unsaved changes in include files when board is modified
     * @returns true if ONLY include files have changes (no main file changes), false otherwise
     */
    private trackIncludeFileUnsavedChanges(board: KanbanBoard): boolean {
        if (!board.columns) {
            return false;
        }

        const currentDocument = this._fileManager.getDocument();
        if (!currentDocument) {
            return false;
        }

        const fileStateManager = getFileStateManager();
        const basePath = path.dirname(currentDocument.uri.fsPath);
        let hasIncludeChanges = false;
        let hasMainFileChanges = false;

        // Check each column that has include mode enabled
        for (const column of board.columns) {
            if (column.includeMode && column.includeFiles && column.includeFiles.length > 0) {
                for (const includeFile of column.includeFiles) {
                    const absolutePath = path.resolve(basePath, includeFile);

                    // CRITICAL: Normalize the path to match keys in _includeFiles map
                    const normalizedIncludeFile = includeFile.startsWith('./') ? includeFile : './' + includeFile;

                    // Get or create include file in legacy system (this loads content)
                    const unifiedIncludeFile = this.getOrCreateIncludeFile(normalizedIncludeFile, 'column');

                    // Initialize or get include file state in FileStateManager
                    const includeFileState = fileStateManager.initializeFile(
                        absolutePath,
                        normalizedIncludeFile,
                        false,
                        'include-column'
                    );

                    // Use the baseline from the legacy system if FileStateManager baseline is empty
                    const effectiveBaseline = includeFileState.frontend.baseline || unifiedIncludeFile.baseline;

                    const currentPresentationContent = column.tasks.length > 0
                        ? PresentationParser.tasksToPresentation(column.tasks)
                        : '';

                    if (effectiveBaseline.trim() !== currentPresentationContent.trim()) {
                        // Mark frontend changes in FileStateManager
                        fileStateManager.markFrontendChange(absolutePath, true, currentPresentationContent);
                        hasIncludeChanges = true;

                        // Keep legacy tracking for compatibility
                        const unifiedIncludeFile = this._includeFiles.get(normalizedIncludeFile);
                        if (unifiedIncludeFile) {
                            unifiedIncludeFile.hasUnsavedChanges = true;

                            // CRITICAL: Also synchronize to FileStateManager for recovery
                            fileStateManager.markFrontendChange(absolutePath, true, currentPresentationContent);

                            this._includeFilesChanged = true;
                            this._changedIncludeFiles.add(normalizedIncludeFile);
                        }
                    } else {
                        // Clear frontend changes in FileStateManager
                        fileStateManager.markFrontendChange(absolutePath, false);

                        // Clear legacy tracking
                        if (unifiedIncludeFile && unifiedIncludeFile.hasUnsavedChanges) {
                            unifiedIncludeFile.hasUnsavedChanges = false;
                            this._changedIncludeFiles.delete(normalizedIncludeFile);

                            if (this._changedIncludeFiles.size === 0) {
                                this._includeFilesChanged = false;
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

                        // CRITICAL: Normalize the path to match keys in _includeFiles map
                        const normalizedIncludeFile = includeFile.startsWith('./') ? includeFile : './' + includeFile;

                        // Get or create include file in legacy system (this loads content)
                        const unifiedIncludeFile = this.getOrCreateIncludeFile(normalizedIncludeFile, 'task');

                        // Initialize or get include file state in FileStateManager
                        const includeFileState = fileStateManager.initializeFile(
                            absolutePath,
                            normalizedIncludeFile,
                            false,
                            'include-task'
                        );

                        // Use the baseline from the legacy system if FileStateManager baseline is empty
                        const effectiveBaseline = includeFileState.frontend.baseline || unifiedIncludeFile.baseline;

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

                        if (effectiveBaseline.trim() !== expectedContent.trim()) {
                            // Mark frontend changes in FileStateManager
                            fileStateManager.markFrontendChange(absolutePath, true, expectedContent);
                            hasIncludeChanges = true;

                            // Keep legacy tracking for compatibility
                            if (unifiedIncludeFile) {
                                unifiedIncludeFile.hasUnsavedChanges = true;

                                // CRITICAL: Also synchronize to FileStateManager for recovery
                                fileStateManager.markFrontendChange(absolutePath, true, expectedContent);

                                this._includeFilesChanged = true;
                                this._changedIncludeFiles.add(normalizedIncludeFile);
                            }
                        } else {
                            // Clear frontend changes in FileStateManager
                            fileStateManager.markFrontendChange(absolutePath, false);

                            // Clear legacy tracking
                            if (unifiedIncludeFile && unifiedIncludeFile.hasUnsavedChanges) {
                                unifiedIncludeFile.hasUnsavedChanges = false;
                                this._changedIncludeFiles.delete(normalizedIncludeFile);

                                if (this._changedIncludeFiles.size === 0) {
                                    this._includeFilesChanged = false;
                                }
                            }
                        }
                    }
                }
            }
        }

        // For now, we'll only return true if we detected include changes
        // and the board only contains included content
        // This is a conservative approach - we might incorrectly mark the main file
        // as changed when it hasn't, but that's safer than missing main file changes

        // Check if ALL columns and tasks are from includes
        let allContentIsFromIncludes = true;
        for (const column of board.columns) {
            if (!column.includeMode || !column.includeFiles || column.includeFiles.length === 0) {
                // Found a column that's not from an include
                if (column.tasks && column.tasks.length > 0) {
                    // Check if all tasks in this column are from includes
                    const hasNonIncludeTasks = column.tasks.some(task =>
                        !task.includeMode || !task.includeFiles || task.includeFiles.length === 0
                    );
                    if (hasNonIncludeTasks) {
                        allContentIsFromIncludes = false;
                        break;
                    }
                }
            }
        }

        // Return true only if we have include changes AND all content is from includes
        return hasIncludeChanges && allContentIsFromIncludes;
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

    /**
     * Write content to a file (used by save operations)
     */
    private async _writeFileContent(filePath: string, content: string): Promise<void> {
        try {
            const currentDocument = this._fileManager.getDocument();
            if (!currentDocument) {
                throw new Error('No current document available');
            }

            const basePath = path.dirname(currentDocument.uri.fsPath);
            const absolutePath = path.resolve(basePath, filePath);

            fs.writeFileSync(absolutePath, content, 'utf8');

        } catch (error) {
            console.error(`[_writeFileContent] Error writing file ${filePath}:`, error);
            throw error;
        }
    }
}
