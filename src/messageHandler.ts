import { FileManager } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { KanbanBoard } from './markdownParser';
import { ExternalFileWatcher } from './externalFileWatcher';
import { configService } from './configurationService';
import { ExportService } from './exportService';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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

            // Update board with new data (used for immediate column include changes)
            case 'updateBoard':
                await this.handleUpdateBoard(message);
                break;

            // Confirm disable include mode (uses VS Code dialog)
            case 'confirmDisableIncludeMode':
                await this.handleConfirmDisableIncludeMode(message);
                break;

            // Request include file name for enabling include mode
            case 'requestIncludeFileName':
                await this.handleRequestIncludeFileName(message);
                break;

            // Request edit include file name for changing include files
            case 'requestEditIncludeFileName':
                await this.handleRequestEditIncludeFileName(message);
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
							  vscode.window.showInformationMessage(message.text);
                break;
            case 'setPreference':
                await this.handleSetPreference(message.key, message.value);
                break;
            case 'setContext':
                await this.handleSetContext(message.contextVariable, message.value);
                break;
            case 'triggerVSCodeSnippet':
                await this.handleVSCodeSnippet(message);
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

                // If this is a task with include mode, save changes to the included file immediately
                const boardForTask = this._getCurrentBoard();
                if (boardForTask) {
                    const column = boardForTask.columns.find(col => col.id === message.columnId);
                    const task = column?.tasks.find(t => t.id === message.taskId);
                    if (task && task.includeMode) {
                        const panel = this._getWebviewPanel();
                        await panel.saveTaskIncludeChanges(task);
                        console.log(`[MessageHandler] Saved task include changes for task ${message.taskId}`);
                    }
                }
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

                // Check if this might be a column include file change
                const currentBoard = this._getCurrentBoard();
                const column = currentBoard?.columns.find(col => col.id === message.columnId);
                const oldIncludeFiles = column?.includeFiles ? [...column.includeFiles] : [];

                console.log(`[MessageHandler Debug] Column before edit:`, {
                    columnId: message.columnId,
                    currentTitle: column?.title,
                    includeMode: column?.includeMode,
                    oldIncludeFiles: oldIncludeFiles,
                    currentTasks: column?.tasks?.length || 0
                });

                await this.performBoardActionSilent(() =>
                    this._boardOperations.editColumnTitle(currentBoard!, message.columnId, message.title)
                );

                console.log(`[MessageHandler Debug] Column after edit:`, {
                    columnId: message.columnId,
                    newTitle: column?.title,
                    includeMode: column?.includeMode,
                    newIncludeFiles: column?.includeFiles,
                    currentTasks: column?.tasks?.length || 0
                });

                // If include files changed, load new content immediately
                const newIncludeFiles = column?.includeFiles || [];
                const includeFilesChanged = JSON.stringify(oldIncludeFiles) !== JSON.stringify(newIncludeFiles);

                console.log(`[MessageHandler Debug] Include files changed: ${includeFilesChanged}`, {
                    oldIncludeFiles: oldIncludeFiles,
                    newIncludeFiles: newIncludeFiles
                });

                if (includeFilesChanged && column && newIncludeFiles.length > 0) {
                    console.log(`[MessageHandler] Include files changed, loading new content from: ${newIncludeFiles.join(', ')}`);

                    // Use the webview panel to load the new content
                    const panel = this._getWebviewPanel();
                    await panel.loadNewIncludeContent(column, newIncludeFiles);
                }
                break;
            case 'editTaskTitle':
                console.log(`[MessageHandler Debug] editTaskTitle received:`, {
                    taskId: message.taskId,
                    columnId: message.columnId,
                    title: message.title
                });

                // Check if this might be a task include file change
                const currentBoardForTask = this._getCurrentBoard();
                const targetColumn = currentBoardForTask?.columns.find(col => col.id === message.columnId);
                const task = targetColumn?.tasks.find(t => t.id === message.taskId);
                const oldTaskIncludeFiles = task?.includeFiles ? [...task.includeFiles] : [];

                console.log(`[MessageHandler Debug] Task before edit:`, {
                    taskId: message.taskId,
                    columnId: message.columnId,
                    currentTitle: task?.title,
                    includeMode: task?.includeMode,
                    oldIncludeFiles: oldTaskIncludeFiles
                });

                // Check if the new title contains task include syntax
                const hasTaskIncludeMatches = message.title.match(/!!!taskinclude\(([^)]+)\)!!!/g);

                if (hasTaskIncludeMatches) {
                    console.log(`[MessageHandler] Task include syntax detected`);

                    // Check if this task currently has unsaved changes
                    if (task && task.includeMode && task.includeFiles && task.includeFiles.length > 0) {
                        const panel = this._getWebviewPanel();
                        const hasUnsavedChanges = await panel.checkTaskIncludeUnsavedChanges(task);

                        if (hasUnsavedChanges) {
                            // Prompt user to save before switching
                            const saveChoice = await vscode.window.showWarningMessage(
                                `The included file "${task.includeFiles[0]}" has unsaved changes. Do you want to save before switching to a new file?`,
                                { modal: true },
                                'Save and Switch',
                                'Discard and Switch',
                                'Cancel'
                            );

                            if (saveChoice === 'Save and Switch') {
                                // Save current changes first
                                await panel.saveTaskIncludeChanges(task);
                            } else if (saveChoice === 'Cancel') {
                                // User cancelled, don't switch
                                return;
                            }
                            // If 'Discard and Switch', just continue without saving
                        }
                    }

                    console.log(`[MessageHandler] Proceeding with include file switch, triggering board re-parse`);

                    // Update the task title first
                    await this.performBoardActionSilent(() =>
                        this._boardOperations.editTask(currentBoardForTask!, message.taskId, message.columnId, { title: message.title })
                    );

                    console.log(`[MessageHandler] Task title updated, extracting include files from new title`);

                    // Extract the include files from the new title
                    const newIncludeFiles: string[] = [];
                    hasTaskIncludeMatches.forEach((match: string) => {
                        const filePath = match.replace(/!!!taskinclude\(([^)]+)\)!!!/, '$1').trim();
                        newIncludeFiles.push(filePath);
                    });

                    console.log(`[MessageHandler] Found include files:`, newIncludeFiles);

                    // Get the updated task and load new content
                    const updatedBoard = this._getCurrentBoard();
                    const updatedColumn = updatedBoard?.columns.find(col => col.id === message.columnId);
                    const updatedTask = updatedColumn?.tasks.find(t => t.id === message.taskId);

                    if (updatedTask && newIncludeFiles.length > 0) {
                        console.log(`[MessageHandler] Loading new content for task ${message.taskId}`);

                        // Use the existing method that works
                        const panel = this._getWebviewPanel();
                        await panel.loadNewTaskIncludeContent(updatedTask, newIncludeFiles);
                    } else {
                        console.log(`[MessageHandler] Could not find updated task or no include files`);
                    }
                } else {
                    // Regular title edit without include syntax
                    await this.performBoardActionSilent(() =>
                        this._boardOperations.editTask(currentBoardForTask!, message.taskId, message.columnId, { title: message.title })
                    );
                }
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
            case 'requestTaskIncludeFileName':
                await this.handleRequestTaskIncludeFileName(message.taskId, message.columnId);
                break;
            case 'updateTaskInBackend':
                // DEPRECATED: This is now handled via markUnsavedChanges with cachedBoard
                // The complete board state is sent, which is more reliable than individual field updates
                break;

            case 'saveClipboardImage':
                await this.handleSaveClipboardImage(
                    message.imageData,
                    message.imagePath,
                    message.mediaFolderPath,
                    message.dropPosition,
                    message.imageFileName,
                    message.mediaFolderName
                );
                break;

            case 'saveClipboardImageWithPath':
                await this.handleSaveClipboardImageWithPath(
                    message.imageData,
                    message.imageType,
                    message.dropPosition,
                    message.md5Hash
                );
                break;

            case 'getExportDefaultFolder':
                await this.handleGetExportDefaultFolder();
                break;

            case 'selectExportFolder':
                await this.handleSelectExportFolder(message.defaultPath);
                break;

            case 'exportWithAssets':
                await this.handleExportWithAssets(message.options);
                break;

            case 'exportColumn':
                await this.handleExportColumn(message.options);
                break;

            case 'showError':
                vscode.window.showErrorMessage(message.message);
                break;

            case 'showInfo':
                vscode.window.showInformationMessage(message.message);
                break;

            case 'askOpenExportFolder':
                await this.handleAskOpenExportFolder(message.path);
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
        if (!board) {return;}

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
        if (!board) {return;}

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
            const document = this._fileManager.getDocument();
            const fileName = document ? path.basename(document.fileName) : 'kanban board';

            // Only create backup if 5+ minutes have passed since unsaved changes
            // This uses the BackupManager to check timing and creates a regular backup
            const webviewPanel = this._getWebviewPanel();
            if (webviewPanel.backupManager && webviewPanel.backupManager.shouldCreatePageHiddenBackup()) {
                await webviewPanel.backupManager.createBackup(document, { label: 'backup' });
                console.log(`Created periodic backup for "${fileName}" (page hidden, 5+ min unsaved)`);
            } else {
                console.log(`Skipped backup for "${fileName}" (page hidden, <5 min since unsaved changes)`);
            }

            // Reset the close prompt flag in webview
            this._getWebviewPanel().webview.postMessage({
                type: 'resetClosePromptFlag'
            });

        } catch (error) {
            console.error('Error handling page hidden backup:', error);
            // Reset flag even if there was an error
            this._getWebviewPanel().webview.postMessage({
                type: 'resetClosePromptFlag'
            });
        }
    }

    private async handleSetPreference(key: string, value: string): Promise<void> {
        try {
            await configService.updateConfig(key as any, value, vscode.ConfigurationTarget.Workspace);
        } catch (error) {
            console.error(`Failed to update preference ${key}:`, error);
            vscode.window.showErrorMessage(`Failed to update ${key} preference: ${error}`);
        }
    }

    private async handleSetContext(contextVariable: string, value: boolean): Promise<void> {
        try {
            await vscode.commands.executeCommand('setContext', contextVariable, value);
        } catch (error) {
            console.error(`Failed to set context variable ${contextVariable}:`, error);
        }
    }

    private async handleVSCodeSnippet(message: any): Promise<void> {
        try {
            // Use VS Code's snippet resolution to get the actual snippet content
            // This leverages VS Code's built-in snippet system
            const snippetName = await this.getSnippetNameForShortcut(message.shortcut);

            if (!snippetName) {
                vscode.window.showInformationMessage(
                    `No snippet configured for ${message.shortcut}. Add a keybinding with "editor.action.insertSnippet" command.`
                );
                return;
            }

            // Resolve the snippet content from VS Code's markdown snippet configuration
            const resolvedContent = await this.resolveSnippetContent(snippetName);

            if (resolvedContent) {
                const panel = this._getWebviewPanel();
                if (panel) {
                    panel._panel.webview.postMessage({
                        type: 'insertSnippetContent',
                        content: resolvedContent,
                        fieldType: message.fieldType,
                        taskId: message.taskId
                    });
                }
            }

        } catch (error) {
            console.error('Failed to handle VS Code snippet:', error);
            vscode.window.showInformationMessage(
                `Use Ctrl+Space in the kanban editor for snippet picker.`
            );
        }
    }

    private async getSnippetNameForShortcut(shortcut: string): Promise<string | null> {
        try {
            // Read VS Code's actual keybindings configuration
            const keybindings = await this.loadVSCodeKeybindings();

            // Find keybinding that matches our shortcut and uses editor.action.insertSnippet
            for (const binding of keybindings) {
                if (this.matchesShortcut(binding.key, shortcut) &&
                    binding.command === 'editor.action.insertSnippet' &&
                    binding.args?.name) {

                    console.log(`Found snippet "${binding.args.name}" for shortcut ${shortcut}`);
                    return binding.args.name;
                }
            }

            console.log(`No snippet keybinding found for shortcut: ${shortcut}`);
            return null;

        } catch (error) {
            console.error('Failed to read VS Code keybindings:', error);
            return null;
        }
    }

    private async loadVSCodeKeybindings(): Promise<any[]> {
        try {
            // Load user keybindings
            const userKeybindingsPath = this.getUserKeybindingsPath();
            let keybindings: any[] = [];

            if (userKeybindingsPath && fs.existsSync(userKeybindingsPath)) {
                const content = fs.readFileSync(userKeybindingsPath, 'utf8');
                // Handle JSON with comments
                const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
                const userKeybindings = JSON.parse(jsonContent);
                if (Array.isArray(userKeybindings)) {
                    keybindings = keybindings.concat(userKeybindings);
                }
            }

            // Also load workspace keybindings if they exist
            const workspaceKeybindingsPath = this.getWorkspaceKeybindingsPath();
            if (workspaceKeybindingsPath && fs.existsSync(workspaceKeybindingsPath)) {
                const content = fs.readFileSync(workspaceKeybindingsPath, 'utf8');
                const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
                const workspaceKeybindings = JSON.parse(jsonContent);
                if (Array.isArray(workspaceKeybindings)) {
                    keybindings = keybindings.concat(workspaceKeybindings);
                }
            }

            console.log(`Loaded ${keybindings.length} keybindings from VS Code configuration`);
            return keybindings;

        } catch (error) {
            console.error('Failed to load VS Code keybindings:', error);
            return [];
        }
    }

    private getUserKeybindingsPath(): string | null {
        try {
            const userDataDir = this.getVSCodeUserDataDir();
            if (userDataDir) {
                return path.join(userDataDir, 'User', 'keybindings.json');
            }
            return null;
        } catch (error) {
            console.error('Failed to get user keybindings path:', error);
            return null;
        }
    }

    private getWorkspaceKeybindingsPath(): string | null {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                return path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'keybindings.json');
            }
            return null;
        } catch (error) {
            console.error('Failed to get workspace keybindings path:', error);
            return null;
        }
    }

    private matchesShortcut(keybindingKey: string, shortcut: string): boolean {
        // Normalize the keybinding format
        // VS Code uses "cmd+6" on Mac, we use "meta+6"
        const normalizedKeybinding = keybindingKey
            .toLowerCase()
            .replace(/cmd/g, 'meta')
            .replace(/ctrl/g, 'ctrl')
            .replace(/\s+/g, '');

        const normalizedShortcut = shortcut
            .toLowerCase()
            .replace(/\s+/g, '');

        return normalizedKeybinding === normalizedShortcut;
    }

    private async resolveSnippetContent(snippetName: string): Promise<string> {
        try {
            // Load all markdown snippets from VS Code's configuration
            const allSnippets = await this.loadMarkdownSnippets();

            // Find the specific snippet
            const snippet = allSnippets[snippetName];
            if (!snippet) {
                console.log(`Snippet "${snippetName}" not found in markdown snippets`);
                return '';
            }

            // Process the snippet body
            let body = '';
            if (Array.isArray(snippet.body)) {
                body = snippet.body.join('\n');
            } else if (typeof snippet.body === 'string') {
                body = snippet.body;
            } else {
                console.log(`Invalid snippet body format for "${snippetName}"`);
                return '';
            }

            // Process VS Code snippet variables and syntax
            return this.processSnippetBody(body);

        } catch (error) {
            console.error(`Failed to resolve snippet "${snippetName}":`, error);
            return '';
        }
    }

    private async loadMarkdownSnippets(): Promise<any> {
        const allSnippets: any = {};

        try {
            // 1. Load user snippets from VS Code user directory
            const userSnippetsPath = this.getUserSnippetsPath();
            if (userSnippetsPath && fs.existsSync(userSnippetsPath)) {
                const userSnippets = await this.loadSnippetsFromFile(userSnippetsPath);
                Object.assign(allSnippets, userSnippets);
            }

            // 2. Load workspace snippets if in a workspace
            const workspaceSnippetsPath = this.getWorkspaceSnippetsPath();
            if (workspaceSnippetsPath && fs.existsSync(workspaceSnippetsPath)) {
                const workspaceSnippets = await this.loadSnippetsFromFile(workspaceSnippetsPath);
                Object.assign(allSnippets, workspaceSnippets);
            }

            // 3. Load extension snippets (built-in markdown snippets)
            const extensionSnippets = await this.loadExtensionSnippets();
            Object.assign(allSnippets, extensionSnippets);

            console.log(`Loaded ${Object.keys(allSnippets).length} markdown snippets`);
            return allSnippets;

        } catch (error) {
            console.error('Failed to load markdown snippets:', error);
            return {};
        }
    }

    private getUserSnippetsPath(): string | null {
        try {
            // VS Code user snippets are stored in different locations per platform
            const userDataDir = this.getVSCodeUserDataDir();
            if (userDataDir) {
                return path.join(userDataDir, 'User', 'snippets', 'markdown.json');
            }
            return null;
        } catch (error) {
            console.error('Failed to get user snippets path:', error);
            return null;
        }
    }

    private getWorkspaceSnippetsPath(): string | null {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                return path.join(workspaceFolders[0].uri.fsPath, '.vscode', 'snippets', 'markdown.json');
            }
            return null;
        } catch (error) {
            console.error('Failed to get workspace snippets path:', error);
            return null;
        }
    }

    private getVSCodeUserDataDir(): string | null {
        const platform = os.platform();
        const homeDir = os.homedir();

        switch (platform) {
            case 'win32':
                return path.join(process.env.APPDATA || '', 'Code');
            case 'darwin':
                return path.join(homeDir, 'Library', 'Application Support', 'Code');
            case 'linux':
                return path.join(homeDir, '.config', 'Code');
            default:
                return null;
        }
    }

    private async loadSnippetsFromFile(filePath: string): Promise<any> {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            // Handle JSON with comments (VS Code snippets support comments)
            const jsonContent = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
            return JSON.parse(jsonContent);
        } catch (error) {
            console.error(`Failed to load snippets from ${filePath}:`, error);
            return {};
        }
    }

    private async loadExtensionSnippets(): Promise<any> {
        // VS Code built-in markdown snippets are not easily accessible from extensions
        // For now, return empty object. Users should define their own snippets.
        return {};
    }

    private processSnippetBody(body: string): string {
        // Process VS Code snippet variables
        const now = new Date();

        return body
            // Date/time variables
            .replace(/\$CURRENT_YEAR/g, now.getFullYear().toString())
            .replace(/\$CURRENT_MONTH/g, (now.getMonth() + 1).toString().padStart(2, '0'))
            .replace(/\$CURRENT_DATE/g, now.getDate().toString().padStart(2, '0'))
            .replace(/\$CURRENT_HOUR/g, now.getHours().toString().padStart(2, '0'))
            .replace(/\$CURRENT_MINUTE/g, now.getMinutes().toString().padStart(2, '0'))
            .replace(/\$CURRENT_SECOND/g, now.getSeconds().toString().padStart(2, '0'))

            // Workspace variables
            .replace(/\$WORKSPACE_NAME/g, vscode.workspace.name || 'workspace')
            .replace(/\$WORKSPACE_FOLDER/g, vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '')

            // File variables (using placeholder since we're in webview)
            .replace(/\$TM_FILENAME/g, 'untitled.md')
            .replace(/\$TM_FILENAME_BASE/g, 'untitled')
            .replace(/\$TM_DIRECTORY/g, '')
            .replace(/\$TM_FILEPATH/g, 'untitled.md')

            // Process placeholders: ${1:default} -> default, ${1} -> empty
            .replace(/\$\{(\d+):([^}]*)\}/g, '$2') // ${1:default} -> default
            .replace(/\$\{\d+\}/g, '') // ${1} -> empty
            .replace(/\$\d+/g, '') // $1 -> empty
            .replace(/\$0/g, ''); // Final cursor position -> empty
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

                // Register the include file with the file watcher
                const watcher = ExternalFileWatcher.getInstance();
                watcher.registerFile(absolutePath, 'include', panel);

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

    private async handleSaveClipboardImage(
        imageData: string,
        imagePath: string,
        mediaFolderPath: string,
        dropPosition: { x: number; y: number },
        imageFileName: string,
        mediaFolderName: string
    ): Promise<void> {
        try {

            // Ensure the media folder exists
            if (!fs.existsSync(mediaFolderPath)) {
                fs.mkdirSync(mediaFolderPath, { recursive: true });
            }

            // Convert base64 to buffer
            const buffer = Buffer.from(imageData, 'base64');

            // Write the image file
            fs.writeFileSync(imagePath, buffer);

            // Notify the webview that the image was saved successfully
            const panel = this._getWebviewPanel();
            if (panel && panel._panel) {
                const message = {
                    type: 'clipboardImageSaved',
                    success: true,
                    imagePath: imagePath,
                    relativePath: `./${mediaFolderName}/${imageFileName}`,
                    dropPosition: dropPosition
                };
                panel._panel.webview.postMessage(message);
            } else {
                console.error('[DEBUG] Cannot send clipboardImageSaved message - no webview panel available');
            }

        } catch (error) {
            console.error('[MESSAGE HANDLER] Error saving clipboard image:', error);

            // Notify the webview that there was an error
            const panel = this._getWebviewPanel();
            if (panel && panel._panel) {
                panel._panel.webview.postMessage({
                    type: 'clipboardImageSaved',
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    dropPosition: dropPosition
                });
            }
        }
    }

    private async handleSaveClipboardImageWithPath(
        imageData: string,
        imageType: string,
        dropPosition: { x: number; y: number },
        md5Hash?: string
    ): Promise<void> {
        try {
            // Get current file path from the file manager
            const document = this._fileManager.getDocument();
            const currentFilePath = document?.uri.fsPath;
            if (!currentFilePath) {
                console.error('[MESSAGE HANDLER] No current file path available');

                // Notify the webview that there was an error
                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'clipboardImageSaved',
                        success: false,
                        error: 'No current file path available',
                        dropPosition: dropPosition
                    });
                }
                return;
            }


            // Extract base filename without extension
            const pathParts = currentFilePath.split(/[\/\\]/);
            const fileName = pathParts.pop() || 'kanban';
            const baseFileName = fileName.replace(/\.[^/.]+$/, '');
            const directory = pathParts.join('/'); // Always use forward slash for consistency

            // Generate filename from MD5 hash if available, otherwise use timestamp
            const extension = imageType.split('/')[1] || 'png';
            const imageFileName = md5Hash ? `${md5Hash}.${extension}` : `clipboard-image-${Date.now()}.${extension}`;

            // Create the media folder path
            const mediaFolderName = `${baseFileName}-MEDIA`;
            const mediaFolderPath = `${directory}/${mediaFolderName}`;
            const imagePath = `${mediaFolderPath}/${imageFileName}`;

            // Ensure the media folder exists
            if (!fs.existsSync(mediaFolderPath)) {
                fs.mkdirSync(mediaFolderPath, { recursive: true });
            }

            // Convert base64 to buffer (remove data URL prefix if present)
            const base64Only = imageData.includes(',') ? imageData.split(',')[1] : imageData;
            const buffer = Buffer.from(base64Only, 'base64');

            // Write the image file
            fs.writeFileSync(imagePath, buffer);

            // Notify the webview that the image was saved successfully
            const panel = this._getWebviewPanel();
            if (panel && panel._panel) {
                const message = {
                    type: 'clipboardImageSaved',
                    success: true,
                    imagePath: imagePath,
                    relativePath: `./${mediaFolderName}/${imageFileName}`,
                    dropPosition: dropPosition
                };
                panel._panel.webview.postMessage(message);
            } else {
                console.error('[DEBUG] Cannot send clipboardImageSaved message - no webview panel available');
            }

        } catch (error) {
            console.error('[MESSAGE HANDLER] Error saving clipboard image with path:', error);

            // Notify the webview that there was an error
            const panel = this._getWebviewPanel();
            if (panel && panel._panel) {
                panel._panel.webview.postMessage({
                    type: 'clipboardImageSaved',
                    success: false,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    dropPosition: dropPosition
                });
            }
        }
    }

    private async handleUpdateBoard(message: any): Promise<void> {
        try {
            const board = message.board;
            if (!board) {
                console.error('[updateBoard] No board data provided');
                return;
            }

            // Set the updated board
            this._setBoard(board);

            // If this is an immediate update (like column include changes), trigger a save and reload
            if (message.immediate) {
                console.log('[updateBoard] Immediate update requested - triggering save and reload');

                // Save the changes to markdown
                await this._onSaveToMarkdown();

                // Trigger a board update to reload with new include files
                await this._onBoardUpdate();
            } else {
                // Regular update - just mark as unsaved
                this._markUnsavedChanges(true, board);
            }

        } catch (error) {
            console.error('[updateBoard] Error handling board update:', error);
        }
    }

    private async handleConfirmDisableIncludeMode(message: any): Promise<void> {
        try {
            const confirmation = await vscode.window.showWarningMessage(
                message.message,
                { modal: true },
                'Disable Include Mode',
                'Cancel'
            );

            if (confirmation === 'Disable Include Mode') {
                // User confirmed - send message back to webview to proceed
                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'proceedDisableIncludeMode',
                        columnId: message.columnId
                    });
                }
            }
            // If cancelled, do nothing

        } catch (error) {
            console.error('[confirmDisableIncludeMode] Error handling confirmation:', error);
        }
    }

    private async handleRequestIncludeFileName(message: any): Promise<void> {
        try {
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter the path to the presentation file',
                placeHolder: 'e.g., presentation.md or slides/intro.md',
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Please enter a file path';
                    }
                    if (!value.endsWith('.md')) {
                        return 'File should be a markdown file (.md)';
                    }
                    return undefined;
                }
            });

            if (fileName && fileName.trim()) {
                // User provided a file name - send message back to webview to proceed
                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'proceedEnableIncludeMode',
                        columnId: message.columnId,
                        fileName: fileName.trim()
                    });
                }
            }
            // If cancelled, do nothing

        } catch (error) {
            console.error('[requestIncludeFileName] Error handling input request:', error);
        }
    }

    private async handleRequestEditIncludeFileName(message: any): Promise<void> {
        try {
            const currentFile = message.currentFile || '';
            const fileName = await vscode.window.showInputBox({
                prompt: 'Edit the path to the presentation file',
                value: currentFile,
                placeHolder: 'e.g., presentation.md or slides/intro.md',
                validateInput: (value) => {
                    if (!value || !value.trim()) {
                        return 'Please enter a file path';
                    }
                    if (!value.endsWith('.md')) {
                        return 'File should be a markdown file (.md)';
                    }
                    return undefined;
                }
            });

            if (fileName && fileName.trim()) {
                // User provided a file name - send message back to webview to proceed
                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'proceedUpdateIncludeFile',
                        columnId: message.columnId,
                        newFileName: fileName.trim(),
                        currentFile: currentFile
                    });
                }
            }
            // If cancelled, do nothing

        } catch (error) {
            console.error('[requestEditIncludeFileName] Error handling input request:', error);
        }
    }

    /**
     * Handle request for task include filename
     */
    private async handleRequestTaskIncludeFileName(taskId: string, columnId: string): Promise<void> {
        try {
            // Request filename from user using input box
            const fileName = await vscode.window.showInputBox({
                prompt: 'Enter the task include file name (e.g., task-content.md)',
                placeHolder: 'task-content.md',
                validateInput: (value) => {
                    if (!value || value.trim() === '') {
                        return 'File name cannot be empty';
                    }
                    if (!value.trim().endsWith('.md')) {
                        return 'File name must end with .md';
                    }
                    return null;
                }
            });

            if (fileName && fileName.trim()) {
                // User provided a file name - enable task include mode
                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'enableTaskIncludeMode',
                        taskId: taskId,
                        columnId: columnId,
                        fileName: fileName.trim()
                    });
                }
            }
            // If cancelled, do nothing

        } catch (error) {
            console.error('[requestTaskIncludeFileName] Error handling input request:', error);
        }
    }

    private async handleGetExportDefaultFolder(): Promise<void> {
        try {
            const document = this._fileManager.getDocument();
            if (!document) {
                console.error('No document available for export');
                return;
            }

            const defaultFolder = ExportService.generateDefaultExportFolder(document.uri.fsPath);
            const panel = this._getWebviewPanel();
            if (panel && panel._panel) {
                panel._panel.webview.postMessage({
                    type: 'exportDefaultFolder',
                    folderPath: defaultFolder
                });
            }
        } catch (error) {
            console.error('Error getting export default folder:', error);
        }
    }

    private async handleSelectExportFolder(defaultPath?: string): Promise<void> {
        try {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select Export Folder',
                defaultUri: defaultPath ? vscode.Uri.file(defaultPath) : undefined
            });

            if (result && result[0]) {
                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'exportFolderSelected',
                        folderPath: result[0].fsPath
                    });
                }
            }
        } catch (error) {
            console.error('Error selecting export folder:', error);
        }
    }

    private async handleExportWithAssets(options: any): Promise<void> {
        try {
            const document = this._fileManager.getDocument();
            if (!document) {
                vscode.window.showErrorMessage('No document available for export');
                return;
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Exporting markdown with assets...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Analyzing assets...' });

                const result = await ExportService.exportWithAssets(document, options);

                progress.report({ increment: 80, message: 'Finalizing export...' });

                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'exportResult',
                        result: result
                    });
                }
            });

        } catch (error) {
            console.error('Error exporting with assets:', error);
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    }

    private async handleExportColumn(options: any): Promise<void> {
        try {
            const document = this._fileManager.getDocument();
            if (!document) {
                vscode.window.showErrorMessage('No document available for export');
                return;
            }

            // Show progress
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: 'Exporting column...',
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 20, message: 'Analyzing column content...' });

                const result = await ExportService.exportColumn(document, options);

                progress.report({ increment: 80, message: 'Finalizing export...' });

                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'columnExportResult',
                        result: result
                    });
                }
            });

        } catch (error) {
            console.error('Error exporting column:', error);
            vscode.window.showErrorMessage(`Column export failed: ${error}`);
        }
    }

    private async handleAskOpenExportFolder(exportPath: string): Promise<void> {
        try {
            const folderPath = path.dirname(exportPath);
            const result = await vscode.window.showInformationMessage(
                'Export completed successfully!',
                'Open Export Folder',
                'Dismiss'
            );

            if (result === 'Open Export Folder') {
                await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(folderPath), true);
            }
        } catch (error) {
            console.error('Error handling export folder open request:', error);
        }
    }
}