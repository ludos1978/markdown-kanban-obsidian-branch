import { FileManager } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { KanbanBoard } from './markdownParser';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FocusTarget {
    type: 'task' | 'column';
    id: string;
    operation: 'created' | 'modified' | 'deleted' | 'moved';
}

export class MessageHandler {
    private _fileManager: FileManager;
    private _undoRedoManager: UndoRedoManager;
    private _boardOperations: BoardOperations;
    private _linkHandler: LinkHandler;
    private _onBoardUpdate: () => Promise<void>;
    private _onSaveToMarkdown: () => Promise<void>;
    private _onInitializeFile: () => Promise<void>;
    private _getCurrentBoard: () => KanbanBoard | undefined;
    private _setBoard: (board: KanbanBoard) => void;
    private _setUndoRedoOperation: (isOperation: boolean) => void;
    private _getWebviewPanel: () => any;
    private _saveWithBackup: () => Promise<void>;
    private _markUnsavedChanges: (hasChanges: boolean, cachedBoard?: any) => void;
    private _previousBoardForFocus?: KanbanBoard;

    constructor(
        fileManager: FileManager,
        undoRedoManager: UndoRedoManager,
        boardOperations: BoardOperations,
        linkHandler: LinkHandler,
        callbacks: {
            onBoardUpdate: () => Promise<void>;
            onSaveToMarkdown: () => Promise<void>;
            onInitializeFile: () => Promise<void>;
            getCurrentBoard: () => KanbanBoard | undefined;
            setBoard: (board: KanbanBoard) => void;
            setUndoRedoOperation: (isOperation: boolean) => void;
            getWebviewPanel: () => any;
            saveWithBackup: () => Promise<void>;
            markUnsavedChanges: (hasChanges: boolean, cachedBoard?: any) => void;
        }
    ) {
        this._fileManager = fileManager;
        this._undoRedoManager = undoRedoManager;
        this._boardOperations = boardOperations;
        this._linkHandler = linkHandler;
        this._onBoardUpdate = callbacks.onBoardUpdate;
        this._onSaveToMarkdown = callbacks.onSaveToMarkdown;
        this._onInitializeFile = callbacks.onInitializeFile;
        this._getCurrentBoard = callbacks.getCurrentBoard;
        this._setBoard = callbacks.setBoard;
        this._setUndoRedoOperation = callbacks.setUndoRedoOperation;
        this._getWebviewPanel = callbacks.getWebviewPanel;
        this._saveWithBackup = callbacks.saveWithBackup;
        this._markUnsavedChanges = callbacks.markUnsavedChanges;
    }

    public async handleMessage(message: any): Promise<void> {

        switch (message.type) {
            // Undo/Redo operations
            case 'undo':
                await this.handleUndo();
                break;
            case 'redo':
                await this.handleRedo();
                break;

            // Include file refresh
            case 'refreshIncludes':
                await this.handleRefreshIncludes();
                break;

            // Include file content request for frontend processing
            case 'requestIncludeFile':
                await this.handleRequestIncludeFile(message.filePath);
                break;

            // Runtime function tracking report
            case 'runtimeTrackingReport':
                await this.handleRuntimeTrackingReport(message.report);
                break;

            // Special request for board update
            case 'requestBoardUpdate':
                await this._onBoardUpdate();
                this._fileManager.sendFileInfo();
                break;

            // Enhanced file and link handling
            case 'openFileLink':
                await this._linkHandler.handleFileLink(message.href);
                break;
            case 'openWikiLink':
                await this._linkHandler.handleWikiLink(message.documentName);
                break;
            case 'openExternalLink':
                await this._linkHandler.handleExternalLink(message.href);
                break;

            // Drag and drop operations
            case 'handleFileDrop':
                await this._fileManager.handleFileDrop(message);
                break;
            case 'handleUriDrop':
                await this._fileManager.handleUriDrop(message);
                break;
                            
            // File management
            case 'toggleFileLock':
                this._fileManager.toggleFileLock();
                break;
            case 'selectFile':
                await this.handleSelectFile();
                break;
            case 'markUnsavedChanges':
                // Track unsaved changes at panel level and update cached board if provided
                this._markUnsavedChanges(message.hasUnsavedChanges, message.cachedBoard);
                break;
            case 'saveUndoState':
                // Save current board state for undo without executing any operation
                // Use the board state from the webview cache if provided, otherwise fallback to backend board
                const boardToSave = message.currentBoard || this._getCurrentBoard();
                if (boardToSave) {
                    this._undoRedoManager.saveStateForUndo(boardToSave);
                } else {
                    console.warn('❌ No current board available for undo state saving');
                }
                break;
            case 'pageHiddenWithUnsavedChanges':
                // Handle page becoming hidden with unsaved changes
                await this.handlePageHiddenWithUnsavedChanges();
                break;
            case 'requestFileInfo':
                this._fileManager.sendFileInfo();
                break;
            case 'initializeFile':
                await this._onInitializeFile();
                break;
            case 'showMessage':
                // vscode.window.showInformationMessage(message.text);
                break;
            case 'setPreference':
                await this.handleSetPreference(message.key, message.value);
                break;
            case 'resolveAndCopyPath':
                const resolution = await this._fileManager.resolveFilePath(message.path);
                if (resolution && resolution.exists) {
                    await vscode.env.clipboard.writeText(resolution.resolvedPath);
                    vscode.window.showInformationMessage('Full path copied: ' + resolution.resolvedPath);
                } else {
                    vscode.window.showWarningMessage('Could not resolve path: ' + message.path);
                }
                break;
        
            // Task operations
            case 'editTask':
                await this.performBoardActionSilent(() =>
                    this._boardOperations.editTask(this._getCurrentBoard()!, message.taskId, message.columnId, message.taskData)
                );
                break;
            case 'moveTask':
                await this.performBoardAction(() => 
                    this._boardOperations.moveTask(this._getCurrentBoard()!, message.taskId, message.fromColumnId, message.toColumnId, message.newIndex)
                );
                break;
            case 'addTask':
                await this.performBoardAction(() => 
                    this._boardOperations.addTask(this._getCurrentBoard()!, message.columnId, message.taskData)
                );
                break;
            case 'addTaskAtPosition':
                await this.performBoardAction(() => 
                    this._boardOperations.addTaskAtPosition(this._getCurrentBoard()!, message.columnId, message.taskData, message.insertionIndex)
                );
                break;
            case 'deleteTask':
                await this.performBoardAction(() => 
                    this._boardOperations.deleteTask(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'duplicateTask':
                await this.performBoardAction(() => 
                    this._boardOperations.duplicateTask(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'insertTaskBefore':
                await this.performBoardAction(() => 
                    this._boardOperations.insertTaskBefore(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'insertTaskAfter':
                await this.performBoardAction(() => 
                    this._boardOperations.insertTaskAfter(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'moveTaskToTop':
                await this.performBoardAction(() => 
                    this._boardOperations.moveTaskToTop(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'moveTaskUp':
                await this.performBoardAction(() => 
                    this._boardOperations.moveTaskUp(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'moveTaskDown':
                await this.performBoardAction(() => 
                    this._boardOperations.moveTaskDown(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'moveTaskToBottom':
                await this.performBoardAction(() => 
                    this._boardOperations.moveTaskToBottom(this._getCurrentBoard()!, message.taskId, message.columnId)
                );
                break;
            case 'moveTaskToColumn':
                await this.performBoardAction(() => 
                    this._boardOperations.moveTaskToColumn(this._getCurrentBoard()!, message.taskId, message.fromColumnId, message.toColumnId)
                );
                break;
                
            // Column operations
            case 'addColumn':
                await this.performBoardAction(() => 
                    this._boardOperations.addColumn(this._getCurrentBoard()!, message.title)
                );
                break;
            case 'moveColumn':
                await this.performBoardAction(() => 
                    this._boardOperations.moveColumn(this._getCurrentBoard()!, message.fromIndex, message.toIndex, message.fromRow, message.toRow)
                );
                break;
            case 'deleteColumn':
                await this.performBoardAction(() => 
                    this._boardOperations.deleteColumn(this._getCurrentBoard()!, message.columnId)
                );
                break;
            case 'insertColumnBefore':
                await this.performBoardAction(() => 
                    this._boardOperations.insertColumnBefore(this._getCurrentBoard()!, message.columnId, message.title)
                );
                break;
            case 'insertColumnAfter':
                await this.performBoardAction(() => 
                    this._boardOperations.insertColumnAfter(this._getCurrentBoard()!, message.columnId, message.title)
                );
                break;
            case 'sortColumn':
                await this.performBoardAction(() => 
                    this._boardOperations.sortColumn(this._getCurrentBoard()!, message.columnId, message.sortType)
                );
                break;
            case 'editColumnTitle':
                await this.performBoardActionSilent(() =>
                    this._boardOperations.editColumnTitle(this._getCurrentBoard()!, message.columnId, message.title)
                );
                break;
            case 'moveColumnWithRowUpdate':
                await this.performBoardAction(() => 
                    this._boardOperations.moveColumnWithRowUpdate(
                        this._getCurrentBoard()!, 
                        message.columnId, 
                        message.newPosition, 
                        message.newRow
                    )
                );
                break;
            case 'reorderColumns':
                await this.performBoardAction(() => 
                    this._boardOperations.reorderColumns(
                        this._getCurrentBoard()!, 
                        message.newOrder,
                        message.movedColumnId,
                        message.targetRow
                    )
                );
                break;
            case 'performSort':
                await this.performBoardAction(() => 
                    this._boardOperations.performAutomaticSort(this._getCurrentBoard()!)
                );
                break;
            case 'saveBoardState':
                await this.handleSaveBoardState(message.board);
                break;
            case 'updateTaskInBackend':
                // Update specific task in backend board
                this.updateTaskInBackend(message.taskId, message.columnId, message.field, message.value);
                break;

            default:
                console.warn('Unknown message type:', message.type);
                break;
        }
    }

    private async handleUndo() {
        const currentBoard = this._getCurrentBoard();
        const restoredBoard = this._undoRedoManager.undo(currentBoard);
        
        if (restoredBoard) {
            // Detect changes for focusing
            const focusTargets = this.detectBoardChanges(currentBoard, restoredBoard);
            this._previousBoardForFocus = JSON.parse(JSON.stringify(currentBoard));
            
            // Unfold columns BEFORE board update if cards are being added to collapsed columns
            if (focusTargets.length > 0) {
                await this.unfoldColumnsForFocusTargets(focusTargets, restoredBoard);
            }
            
            this._setUndoRedoOperation(true);
            this._setBoard(restoredBoard);
            this._boardOperations.setOriginalTaskOrder(restoredBoard);
            
            // Use cache-first architecture: mark as unsaved instead of direct save
            this._markUnsavedChanges(true);
            await this._onBoardUpdate();
            
            // Send focus information to webview after board update
            if (focusTargets.length > 0) {
                this.sendFocusTargets(focusTargets);
            } else {
            }
            
            // Reset flag after operations complete
            setTimeout(() => {
                this._setUndoRedoOperation(false);
            }, 2000);
        }
    }

    private detectBoardChanges(oldBoard: KanbanBoard | undefined, newBoard: KanbanBoard): FocusTarget[] {
        if (!oldBoard) {
            return [];
        }
        
        const focusTargets: FocusTarget[] = [];
        
        // Create maps for efficient lookup
        const oldColumns = new Map(oldBoard.columns.map(col => [col.id, col]));
        const newColumns = new Map(newBoard.columns.map(col => [col.id, col]));
        
        const oldTasks = new Map();
        const newTasks = new Map();
        
        // Build task maps
        oldBoard.columns.forEach(col => {
            col.tasks.forEach(task => {
                oldTasks.set(task.id, { task, columnId: col.id });
            });
        });
        
        newBoard.columns.forEach(col => {
            col.tasks.forEach(task => {
                newTasks.set(task.id, { task, columnId: col.id });
            });
        });
        
        // Check for column changes
        for (const [columnId, newColumn] of newColumns) {
            const oldColumn = oldColumns.get(columnId);
            if (!oldColumn) {
                focusTargets.push({ type: 'column', id: columnId, operation: 'created' });
            } else if (JSON.stringify(oldColumn) !== JSON.stringify(newColumn)) {
                focusTargets.push({ type: 'column', id: columnId, operation: 'modified' });
            }
        }
        
        // Check for deleted columns
        for (const columnId of oldColumns.keys()) {
            if (!newColumns.has(columnId)) {
                focusTargets.push({ type: 'column', id: columnId, operation: 'deleted' });
            }
        }
        
        // Check for task changes
        for (const [taskId, newTaskData] of newTasks) {
            const oldTaskData = oldTasks.get(taskId);
            if (!oldTaskData) {
                focusTargets.push({ type: 'task', id: taskId, operation: 'created' });
            } else if (oldTaskData.columnId !== newTaskData.columnId) {
                focusTargets.push({ type: 'task', id: taskId, operation: 'moved' });
            } else if (JSON.stringify(oldTaskData.task) !== JSON.stringify(newTaskData.task)) {
                focusTargets.push({ type: 'task', id: taskId, operation: 'modified' });
            }
        }
        
        // Check for deleted tasks
        for (const taskId of oldTasks.keys()) {
            if (!newTasks.has(taskId)) {
                focusTargets.push({ type: 'task', id: taskId, operation: 'deleted' });
            }
        }
        
        return focusTargets;
    }

    private async unfoldColumnsForFocusTargets(focusTargets: FocusTarget[], restoredBoard: KanbanBoard) {
        const columnsToUnfold = new Set<string>();
        
        focusTargets.forEach(target => {
            if (target.type === 'task' && (target.operation === 'created' || target.operation === 'moved')) {
                // For task operations, check the restored board to find which column the task will be in
                for (const column of restoredBoard.columns) {
                    if (column.tasks.some(task => task.id === target.id)) {
                        columnsToUnfold.add(column.id);
                        break;
                    }
                }
            } else if (target.type === 'column' && target.operation === 'created') {
                columnsToUnfold.add(target.id);
            }
        });
        
        if (columnsToUnfold.size > 0) {
            const webviewPanel = this._getWebviewPanel();
            if (webviewPanel && webviewPanel.webview) {
                webviewPanel.webview.postMessage({
                    type: 'unfoldColumnsBeforeUpdate',
                    columnIds: Array.from(columnsToUnfold)
                });
                
                // Wait a bit for the unfolding to happen before proceeding
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    }

    private sendFocusTargets(focusTargets: FocusTarget[]) {
        const webviewPanel = this._getWebviewPanel();
        if (webviewPanel && webviewPanel.webview) {
            // Send focus message immediately - webview will wait for rendering to complete
            webviewPanel.webview.postMessage({
                type: 'focusAfterUndoRedo',
                focusTargets: focusTargets
            });
        } else {
        }
    }

    private async handleRedo() {
        const currentBoard = this._getCurrentBoard();
        const restoredBoard = this._undoRedoManager.redo(currentBoard);
        
        if (restoredBoard) {
            // Detect changes for focusing
            const focusTargets = this.detectBoardChanges(currentBoard, restoredBoard);
            this._previousBoardForFocus = JSON.parse(JSON.stringify(currentBoard));
            
            // Unfold columns BEFORE board update if cards are being added to collapsed columns
            if (focusTargets.length > 0) {
                await this.unfoldColumnsForFocusTargets(focusTargets, restoredBoard);
            }
            
            this._setUndoRedoOperation(true);
            this._setBoard(restoredBoard);
            this._boardOperations.setOriginalTaskOrder(restoredBoard);
            
            // Use cache-first architecture: mark as unsaved instead of direct save
            this._markUnsavedChanges(true);
            await this._onBoardUpdate();
            
            // Send focus information to webview after board update
            if (focusTargets.length > 0) {
                this.sendFocusTargets(focusTargets);
            } else {
            }
            
            // Reset flag after operations complete
            setTimeout(() => {
                this._setUndoRedoOperation(false);
            }, 2000);
        }
    }

    private async handleSelectFile() {
        const document = await this._fileManager.selectFile();
        if (document) {
            // This would need to be handled by the main panel
        }
    }

    private updateTaskInBackend(taskId: string, columnId: string, field: string, value: string) {
        const board = this._getCurrentBoard();
        if (!board) {
            console.warn('No board available to update task');
            return;
        }
        
        // Find and update the task
        for (const column of board.columns) {
            if (column.id === columnId) {
                const task = column.tasks.find((t: any) => t.id === taskId);
                if (task) {
                    (task as any)[field] = value;
                    // Update the board reference to ensure it's saved
                    this._setBoard(board);
                    return;
                }
            }
        }
        console.warn(`Task ${taskId} not found in column ${columnId}`);
    }

    private async handleSaveBoardState(board: any) {
        if (!board) {
            console.warn('❌ No board data received for saving');
            return;
        }
        
        // NOTE: Do not save undo state here - individual operations already saved their undo states
        // before making changes. Saving here would create duplicate/grouped undo states.
        
        // Replace the current board with the new one
        this._setBoard(board);
        
        // Save to markdown file only - do NOT trigger board update
        // The webview already has the correct state (it sent us this board)
        // Triggering _onBoardUpdate() would cause folding state to be lost
        await this._onSaveToMarkdown();
        
        // No board update needed - webview state is already correct
    }

    private async performBoardAction(action: () => boolean, saveUndo: boolean = true) {
        const board = this._getCurrentBoard();
        if (!board) return;

        if (saveUndo) {
            this._undoRedoManager.saveStateForUndo(board);
        }

        const success = action();

        if (success) {
            // Use cache-first architecture: mark as unsaved instead of direct save
            this._markUnsavedChanges(true);
            await this._onBoardUpdate();
        }
    }

    private async performBoardActionSilent(action: () => boolean, saveUndo: boolean = true) {
        const board = this._getCurrentBoard();
        if (!board) return;

        if (saveUndo) {
            this._undoRedoManager.saveStateForUndo(board);
        }

        const success = action();

        if (success) {
            // Use cache-first architecture: mark as unsaved but don't send board update
            // The frontend already has the correct state from immediate updates
            this._markUnsavedChanges(true);
        }
    }

    private async handlePageHiddenWithUnsavedChanges(): Promise<void> {

        try {
            // Automatically create backup when page is hidden with unsaved changes
            // This provides safety without interrupting the user's workflow
            await this._saveWithBackup();

            const document = this._fileManager.getDocument();
            const fileName = document ? path.basename(document.fileName) : 'kanban board';
            console.log(`Created backup for "${fileName}" (page hidden with unsaved changes)`);

            // Reset the close prompt flag in webview
            this._getWebviewPanel().webview.postMessage({
                type: 'resetClosePromptFlag'
            });

        } catch (error) {
            console.error('Error creating backup on page hidden:', error);
            // Reset flag even if there was an error
            this._getWebviewPanel().webview.postMessage({
                type: 'resetClosePromptFlag'
            });
        }
    }

    private async handleSetPreference(key: string, value: string): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('markdown-kanban');
            await config.update(key, value, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            console.error(`Failed to update preference ${key}:`, error);
            vscode.window.showErrorMessage(`Failed to update ${key} preference: ${error}`);
        }
    }

    private async handleRefreshIncludes(): Promise<void> {
        try {
            // Call refreshIncludes on the webview panel
            const panel = this._getWebviewPanel();
            if (panel && typeof panel.refreshIncludes === 'function') {
                await panel.refreshIncludes();
            } else {
            }
        } catch (error) {
            console.error('[MESSAGE HANDLER] Error refreshing includes:', error);
            vscode.window.showErrorMessage(`Failed to refresh includes: ${error}`);
        }
    }

    private async handleRequestIncludeFile(filePath: string): Promise<void> {

        try {
            const panel = this._getWebviewPanel();
            if (!panel || !panel._panel) {
                console.error('[MESSAGE HANDLER] No webview panel available');
                return;
            }

            // Resolve the file path relative to the current document
            const document = this._fileManager.getDocument();
            if (!document) {
                console.error('[MESSAGE HANDLER] No current document available');
                return;
            }

            const basePath = path.dirname(document.uri.fsPath);
            const absolutePath = path.resolve(basePath, filePath);


            // Read the file content
            let content: string;
            try {
                if (!fs.existsSync(absolutePath)) {
                    console.warn('[MESSAGE HANDLER] Include file not found:', absolutePath);
                    // Send null content to indicate file not found
                    await panel._panel.webview.postMessage({
                        type: 'includeFileContent',
                        filePath: filePath,
                        content: null,
                        error: `File not found: ${filePath}`
                    });
                    return;
                }

                content = fs.readFileSync(absolutePath, 'utf8');

                // Send the content back to the frontend
                await panel._panel.webview.postMessage({
                    type: 'includeFileContent',
                    filePath: filePath,
                    content: content
                });

            } catch (fileError) {
                console.error('[MESSAGE HANDLER] Error reading include file:', fileError);
                await panel._panel.webview.postMessage({
                    type: 'includeFileContent',
                    filePath: filePath,
                    content: null,
                    error: `Error reading file: ${fileError}`
                });
            }

        } catch (error) {
            console.error('[MESSAGE HANDLER] Error handling include file request:', error);
        }
    }

    private async handleRuntimeTrackingReport(report: any): Promise<void> {

        try {
            // Save runtime report to file
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filename = `runtime-tracking-${report.metadata.sessionId}-${timestamp}.json`;
            const reportPath = path.join(__dirname, '..', '..', 'tools', 'reports', filename);

            // Ensure reports directory exists
            const reportsDir = path.dirname(reportPath);
            if (!fs.existsSync(reportsDir)) {
                fs.mkdirSync(reportsDir, { recursive: true });
            }

            // Write report
            fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));


            // Log summary
            if (report.summary) {
                console.log(`[MESSAGE HANDLER] Session summary:`, {
                    duration: Math.round(report.metadata.duration / 1000) + 's',
                    totalCalls: report.summary.totalCalls,
                    uniqueFunctions: report.summary.uniqueFunctions,
                    mostCalled: report.summary.mostCalled?.[0]?.name
                });
            }

        } catch (error) {
            console.error('[MESSAGE HANDLER] Error saving runtime tracking report:', error);
        }
    }
}