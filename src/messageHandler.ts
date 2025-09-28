import { FileManager } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { KanbanBoard } from './markdownParser';
import { ExternalFileWatcher } from './externalFileWatcher';
import { configService } from './configurationService';
import { ExportService } from './exportService';
import { getFileStateManager } from './fileStateManager';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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
    private _activeOperations = new Map<string, { type: string, startTime: number }>();

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

    private async startOperation(operationId: string, type: string, description: string) {
        this._activeOperations.set(operationId, { type, startTime: Date.now() });

        // Send to frontend
        const panel = this._getWebviewPanel();
        if (panel && panel.webview) {
            panel.webview.postMessage({
                type: 'operationStarted',
                operationId,
                operationType: type,
                description
            });
        }
    }

    private async updateOperationProgress(operationId: string, progress: number, message?: string) {
        const panel = this._getWebviewPanel();
        if (panel && panel.webview) {
            panel.webview.postMessage({
                type: 'operationProgress',
                operationId,
                progress,
                message
            });
        }
    }

    private async endOperation(operationId: string) {
        const operation = this._activeOperations.get(operationId);
        if (operation) {
            this._activeOperations.delete(operationId);

            // Send to frontend
            const panel = this._getWebviewPanel();
            if (panel && panel.webview) {
                panel.webview.postMessage({
                    type: 'operationCompleted',
                    operationId
                });
            }
        }
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

            // Include file content request for frontend processing
            case 'requestIncludeFile':
                await this.handleRequestIncludeFile(message.filePath);
                break;

            // Register inline include for conflict resolution
            case 'registerInlineInclude':
                await this.handleRegisterInlineInclude(message.filePath, message.content);
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

            case 'openFile':
                await this.handleOpenFile(message.filePath);
                break;

            case 'openIncludeFile':
                await this._linkHandler.handleFileLink(message.filePath);
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

                // Note: Task include changes are now only saved when the main kanban file is saved,
                // not automatically on every edit. This prevents unwanted overwrites of external files.
                break;
            case 'updateTaskFromStrikethroughDeletion':
                await this.handleUpdateTaskFromStrikethroughDeletion(message);
                break;
            case 'updateColumnTitleFromStrikethroughDeletion':
                await this.handleUpdateColumnTitleFromStrikethroughDeletion(message);
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

                // Check if the new title contains column include syntax
                const hasColumnIncludeMatches = message.title.match(/!!!columninclude\(([^)]+)\)!!!/g);

                if (hasColumnIncludeMatches) {
                    // Check if this column currently has unsaved changes
                    if (column && column.includeMode && column.includeFiles && column.includeFiles.length > 0) {
                        const panel = this._getWebviewPanel();
                        const hasUnsavedChanges = await panel.checkColumnIncludeUnsavedChanges(column);

                        if (hasUnsavedChanges) {
                            let saveChoice: string | undefined;

                            // Keep asking until user makes a definitive choice (not Cancel/Escape)
                            do {
                                saveChoice = await vscode.window.showWarningMessage(
                                    `The included file "${column.includeFiles[0]}" has unsaved changes. Do you want to save before switching to a new file?`,
                                    { modal: true },
                                    'Save and Switch',
                                    'Discard and Switch',
                                    'Cancel'
                                );
                            } while (saveChoice === 'Cancel' || !saveChoice);

                            if (saveChoice === 'Save and Switch') {
                                // Save current changes first
                                await panel.saveColumnIncludeChanges(column);
                            }
                            // If 'Discard and Switch', just continue without saving
                        }
                    }

                    // Update the column title first
                    await this.performBoardActionSilent(() =>
                        this._boardOperations.editColumnTitle(currentBoard!, message.columnId, message.title)
                    );

                    // Extract the include files from the new title
                    const newIncludeFiles: string[] = [];
                    hasColumnIncludeMatches.forEach((match: string) => {
                        const filePath = match.replace(/!!!columninclude\(([^)]+)\)!!!/, '$1').trim();
                        newIncludeFiles.push(filePath);
                    });

                    // Get the updated column and load new content
                    const updatedBoard = this._getCurrentBoard();
                    const updatedColumn = updatedBoard?.columns.find(col => col.id === message.columnId);

                    if (updatedColumn && newIncludeFiles.length > 0) {
                        // Use the webview panel to load the new content
                        const panel = this._getWebviewPanel();
                        await panel.updateIncludeContentUnified(updatedColumn, newIncludeFiles, 'column_title_edit');
                    } else if (newIncludeFiles.length > 0) {
                        console.error(`[MessageHandler Error] Could not find updated column ${message.columnId} after title edit`);
                    }
                } else {
                    // Regular title edit without include syntax
                    await this.performBoardActionSilent(() =>
                        this._boardOperations.editColumnTitle(currentBoard!, message.columnId, message.title)
                    );
                }
                break;
            case 'editTaskTitle':
                // console.log(`[MessageHandler Debug] editTaskTitle received:`, {
                //     taskId: message.taskId,
                //     columnId: message.columnId,
                //     title: message.title
                // });

                // Check if this might be a task include file change
                const currentBoardForTask = this._getCurrentBoard();
                const targetColumn = currentBoardForTask?.columns.find(col => col.id === message.columnId);
                const task = targetColumn?.tasks.find(t => t.id === message.taskId);

                // console.log(`[MessageHandler Debug] Task before edit:`, {
                //     taskId: message.taskId,
                //     columnId: message.columnId,
                //     currentTitle: task?.title,
                //     includeMode: task?.includeMode,
                //     oldIncludeFiles: oldTaskIncludeFiles
                // });

                // Check if the new title contains task include syntax
                const hasTaskIncludeMatches = message.title.match(/!!!taskinclude\(([^)]+)\)!!!/g);

                if (hasTaskIncludeMatches) {
                    // console.log(`[MessageHandler] Task include syntax detected`);

                    // Check if this task currently has unsaved changes
                    if (task && task.includeMode && task.includeFiles && task.includeFiles.length > 0) {
                        const panel = this._getWebviewPanel();
                        const hasUnsavedChanges = await panel.checkTaskIncludeUnsavedChanges(task);

                        if (hasUnsavedChanges) {
                            let saveChoice: string | undefined;

                            // Keep asking until user makes a definitive choice (not Cancel/Escape)
                            do {
                                saveChoice = await vscode.window.showWarningMessage(
                                    `The included file "${task.includeFiles[0]}" has unsaved changes. Do you want to save before switching to a new file?`,
                                    { modal: true },
                                    'Save and Switch',
                                    'Discard and Switch',
                                    'Cancel'
                                );
                            } while (saveChoice === 'Cancel' || !saveChoice);

                            if (saveChoice === 'Save and Switch') {
                                // Save current changes first
                                await panel.saveTaskIncludeChanges(task);
                            }
                            // If 'Discard and Switch', just continue without saving
                        }
                    }

                    // Update the task title first
                    await this.performBoardActionSilent(() =>
                        this._boardOperations.editTask(currentBoardForTask!, message.taskId, message.columnId, { title: message.title })
                    );

                    // Extract the include files from the new title
                    const newIncludeFiles: string[] = [];
                    hasTaskIncludeMatches.forEach((match: string) => {
                        const filePath = match.replace(/!!!taskinclude\(([^)]+)\)!!!/, '$1').trim();
                        newIncludeFiles.push(filePath);
                    });

                    // Get the updated task and load new content
                    const updatedBoard = this._getCurrentBoard();
                    const updatedColumn = updatedBoard?.columns.find(col => col.id === message.columnId);
                    const updatedTask = updatedColumn?.tasks.find(t => t.id === message.taskId);

                    if (updatedTask && newIncludeFiles.length > 0) {
                        // Use the existing method that works
                        const panel = this._getWebviewPanel();
                        await panel.loadNewTaskIncludeContent(updatedTask, newIncludeFiles);
                    } else if (newIncludeFiles.length > 0) {
                        console.error(`[MessageHandler Error] Could not find updated task ${message.taskId} in column ${message.columnId} after title edit`);
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
                const exportId = `export_${Date.now()}`;
                await this.startOperation(exportId, 'export', 'Exporting kanban with assets...');
                try {
                    await this.handleExportWithAssets(message.options, exportId);
                    await this.endOperation(exportId);
                } catch (error) {
                    await this.endOperation(exportId);
                    throw error;
                }
                break;

            case 'exportColumn':
                const columnExportId = `export_column_${Date.now()}`;
                await this.startOperation(columnExportId, 'export', 'Exporting column...');
                try {
                    await this.handleExportColumn(message.options, columnExportId);
                    await this.endOperation(columnExportId);
                } catch (error) {
                    await this.endOperation(columnExportId);
                    throw error;
                }
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

            case 'getTrackedFilesDebugInfo':
                await this.handleGetTrackedFilesDebugInfo();
                break;

            case 'clearTrackedFilesCache':
                await this.handleClearTrackedFilesCache();
                break;

            case 'reloadAllIncludedFiles':
                await this.handleReloadAllIncludedFiles();
                break;

            case 'saveIndividualFile':
                await this.handleSaveIndividualFile(message.filePath, message.isMainFile);
                break;

            case 'reloadIndividualFile':
                await this.handleReloadIndividualFile(message.filePath, message.isMainFile);
                break;

            default:
                console.error('handleMessage : Unknown message type:', message.type);
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
            if (webviewPanel && webviewPanel._panel && webviewPanel._panel.webview) {
                webviewPanel._panel.webview.postMessage({
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
        if (webviewPanel && webviewPanel._panel && webviewPanel._panel.webview) {
            // Send focus message immediately - webview will wait for rendering to complete
            webviewPanel._panel.webview.postMessage({
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

    /**
     * Handle opening a file in VS Code
     */
    private async handleOpenFile(filePath: string): Promise<void> {
        try {

            // Resolve the file path to absolute if it's relative
            let absolutePath = filePath;
            if (!path.isAbsolute(filePath)) {
                // Get the current document's directory as base
                const document = this._fileManager.getDocument();
                if (document) {
                    const currentDir = path.dirname(document.uri.fsPath);
                    absolutePath = path.resolve(currentDir, filePath);
                } else {
                    console.error('[MessageHandler] Cannot resolve relative path - no current document');
                    return;
                }
            }

            // Create a VS Code URI
            const fileUri = vscode.Uri.file(absolutePath);

            // Normalize the path for comparison (resolve symlinks, normalize separators)
            const normalizedPath = path.resolve(absolutePath);

            console.log(`[EDITOR_REUSE] Attempting to open: ${normalizedPath}`);

            // Check if the file is already open as a document (even if not visible)
            const existingDocument = vscode.workspace.textDocuments.find(doc => {
                const docPath = path.resolve(doc.uri.fsPath);
                return docPath === normalizedPath;
            });

            if (existingDocument) {
                console.log(`[EDITOR_REUSE] Found existing document`);

                // Check if it's currently visible
                const visibleEditor = vscode.window.visibleTextEditors.find(editor =>
                    path.resolve(editor.document.uri.fsPath) === normalizedPath
                );

                if (visibleEditor) {
                    console.log(`[EDITOR_REUSE] Document is visible in column ${visibleEditor.viewColumn}`);
                    console.log(`[EDITOR_REUSE] Current active editor column: ${vscode.window.activeTextEditor?.viewColumn}`);

                    // Document is already visible - check if we need to focus it
                    if (vscode.window.activeTextEditor?.document.uri.fsPath === normalizedPath) {
                        console.log(`[EDITOR_REUSE] Document is already active - no action needed`);
                        return; // Already focused, nothing to do
                    }
                }

                console.log(`[EDITOR_REUSE] Calling showTextDocument`);
                await vscode.window.showTextDocument(existingDocument, {
                    preserveFocus: false,
                    preview: false
                });
                console.log(`[EDITOR_REUSE] showTextDocument completed`);
            } else {
                console.log(`[EDITOR_REUSE] Document not open, opening normally`);
                // Open the document first, then show it
                const document = await vscode.workspace.openTextDocument(absolutePath);
                await vscode.window.showTextDocument(document, {
                    preserveFocus: false,
                    preview: false
                });
            }


        } catch (error) {
            console.error(`[MessageHandler] Error opening file ${filePath}:`, error);
        }
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
            // CRITICAL: Pass the current board so that trackIncludeFileUnsavedChanges is called
            this._markUnsavedChanges(true, this._getCurrentBoard());
        }
    }

    private async handlePageHiddenWithUnsavedChanges(): Promise<void> {

        try {
            const document = this._fileManager.getDocument();
            const fileName = document ? path.basename(document.fileName) : 'kanban board';

            // Only create backup if 5+ minutes have passed since unsaved changes
            // This uses the BackupManager to check timing and creates a regular backup
            const webviewPanel = this._getWebviewPanel();
            if (webviewPanel?.backupManager && webviewPanel.backupManager.shouldCreatePageHiddenBackup()) {
                await webviewPanel.backupManager.createBackup(document, { label: 'backup' });
            } else {
            }

            // Reset the close prompt flag in webview (with null check)
            const panel = this._getWebviewPanel();
            if (panel && panel._panel && panel._panel.webview) {
                panel._panel.webview.postMessage({
                    type: 'resetClosePromptFlag'
                });
            }

        } catch (error) {
            console.error('Error handling page hidden backup:', error);
            // Reset flag even if there was an error (with null check)
            const panel = this._getWebviewPanel();
            if (panel && panel._panel && panel._panel.webview) {
                panel._panel.webview.postMessage({
                    type: 'resetClosePromptFlag'
                });
            }
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

                    return binding.args.name;
                }
            }

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
                return '';
            }

            // Process the snippet body
            let body = '';
            if (Array.isArray(snippet.body)) {
                body = snippet.body.join('\n');
            } else if (typeof snippet.body === 'string') {
                body = snippet.body;
            } else {
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
            // Get current file path from the file manager (use preserved path if document is closed)
            const document = this._fileManager.getDocument();
            const currentFilePath = this._fileManager.getFilePath() || document?.uri.fsPath;
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
                    error: `Error reading file: ${filePath}`
                });
            }
        } catch (error) {
            console.error('[MESSAGE HANDLER] Error handling include file request:', error);
        }
    }

    private async handleRegisterInlineInclude(filePath: string, content: string): Promise<void> {
        try {
            const panel = this._getWebviewPanel();
            if (!panel || !panel.ensureIncludeFileRegistered) {
                return;
            }

            // Normalize path format
            let relativePath = filePath;
            if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
                relativePath = './' + relativePath;
            }

            // Register the inline include in the unified system
            panel.ensureIncludeFileRegistered(relativePath, 'regular');

            // Update the content and baseline
            const includeFile = panel._includeFiles?.get(relativePath);
            if (includeFile && content) {
                includeFile.content = content;
                includeFile.baseline = content;
                includeFile.hasUnsavedChanges = false;
                includeFile.lastModified = Date.now();

                // Set absolute path for file watching
                const currentDocument = this._fileManager.getDocument();
                if (currentDocument) {
                    const basePath = path.dirname(currentDocument.uri.fsPath);
                    includeFile.absolutePath = path.resolve(basePath, filePath);
                }
            }

        } catch (error) {
            console.error('[MESSAGE HANDLER] Error registering inline include:', error);
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

    private async handleExportWithAssets(options: any, operationId?: string): Promise<void> {
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
                // Update both VS Code progress and our custom indicator
                if (operationId) {
                    await this.updateOperationProgress(operationId, 10, 'Analyzing assets...');
                }
                progress.report({ increment: 20, message: 'Analyzing assets...' });

                if (operationId) {
                    await this.updateOperationProgress(operationId, 30, 'Processing files...');
                }

                const result = await ExportService.exportWithAssets(document, options);

                if (operationId) {
                    await this.updateOperationProgress(operationId, 90, 'Finalizing export...');
                }
                progress.report({ increment: 80, message: 'Finalizing export...' });

                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'exportResult',
                        result: result
                    });
                }

                if (operationId) {
                    await this.updateOperationProgress(operationId, 100);
                }
            });

        } catch (error) {
            console.error('Error exporting with assets:', error);
            vscode.window.showErrorMessage(`Export failed: ${error}`);
        }
    }

    private async handleExportColumn(options: any, operationId?: string): Promise<void> {
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
                if (operationId) {
                    await this.updateOperationProgress(operationId, 20, 'Analyzing column content...');
                }
                progress.report({ increment: 20, message: 'Analyzing column content...' });

                const result = await ExportService.exportColumn(document, options);

                if (operationId) {
                    await this.updateOperationProgress(operationId, 90, 'Finalizing export...');
                }
                progress.report({ increment: 80, message: 'Finalizing export...' });

                const panel = this._getWebviewPanel();
                if (panel && panel._panel) {
                    panel._panel.webview.postMessage({
                        type: 'columnExportResult',
                        result: result
                    });
                }

                if (operationId) {
                    await this.updateOperationProgress(operationId, 100);
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

    /**
     * Handle request for tracked files debug information
     */
    private async handleGetTrackedFilesDebugInfo(): Promise<void> {
        try {
            const panel = this._getWebviewPanel();
            if (!panel) {
                return;
            }

            // Collect debug information from various sources
            const debugData = await this.collectTrackedFilesDebugInfo();

            // Send debug data to frontend
            panel._panel.webview.postMessage({
                type: 'trackedFilesDebugInfo',
                data: debugData
            });

        } catch (error) {
            console.error('[MessageHandler] Error getting tracked files debug info:', error);
        }
    }

    /**
     * Handle request to clear tracked files cache
     */
    private async handleClearTrackedFilesCache(): Promise<void> {
        try {
            const panel = this._getWebviewPanel();
            if (!panel) {
                return;
            }

            // Clear various caches
            await this.clearAllTrackedFileCaches();

            // Confirm cache clear
            panel._panel.webview.postMessage({
                type: 'debugCacheCleared'
            });


        } catch (error) {
            console.error('[MessageHandler] Error clearing tracked files cache:', error);
        }
    }

    /**
     * Handle request to reload all included files (images, videos, includes)
     */
    private async handleReloadAllIncludedFiles(): Promise<void> {
        try {
            const panel = this._getWebviewPanel();
            if (!panel) {
                return;
            }

            let reloadCount = 0;

            // Reload all include files by refreshing their content from disk
            const includeFileMap = (panel as any)._includeFiles;
            if (includeFileMap) {
                for (const [relativePath, fileData] of includeFileMap) {
                    try {
                        // Read fresh content from disk
                        const freshContent = await (panel as any)._readFileContent(relativePath);
                        if (freshContent !== null) {
                            // Update content and reset baseline to fresh content
                            (panel as any).updateIncludeFileContent(relativePath, freshContent, true);
                            reloadCount++;
                        }
                    } catch (error) {
                        console.warn(`[MessageHandler] Failed to reload include file ${relativePath}:`, error);
                    }
                }
            }

            // Trigger a full webview refresh to reload all media and includes
            const document = this._fileManager.getDocument();
            if (document) {
                await panel.loadMarkdownFile(document);
            }

            // Send confirmation message
            panel._panel.webview.postMessage({
                type: 'allIncludedFilesReloaded',
                reloadCount: reloadCount
            });


        } catch (error) {
            console.error('[MessageHandler] Error reloading all included files:', error);
        }
    }

    /**
     * Handle request to save an individual file
     */
    private async handleSaveIndividualFile(filePath: string, isMainFile: boolean): Promise<void> {
        try {
            const panel = this._getWebviewPanel();
            if (!panel) {
                return;
            }

            if (isMainFile) {
                // Save the main kanban file by triggering the existing save mechanism
                await panel.saveToMarkdown();

                panel._panel.webview.postMessage({
                    type: 'individualFileSaved',
                    filePath: filePath,
                    isMainFile: true,
                    success: true
                });
            } else {
                // For include files, save the current content to disk
                const includeFileMap = (panel as any)._includeFiles;
                const includeFile = includeFileMap?.get(filePath);

                if (includeFile && includeFile.content) {
                    // Write the current content to disk
                    await (panel as any)._writeFileContent(filePath, includeFile.content);

                    // Update baseline to match saved content
                    includeFile.baseline = includeFile.content;
                    includeFile.hasUnsavedChanges = false;
                    includeFile.lastModified = Date.now();

                    console.log(`[MessageHandler] Saved include file: ${filePath}`);

                    panel._panel.webview.postMessage({
                        type: 'individualFileSaved',
                        filePath: filePath,
                        isMainFile: false,
                        success: true
                    });
                } else {
                    console.warn(`[MessageHandler] Include file not found or has no content: ${filePath}`);

                    panel._panel.webview.postMessage({
                        type: 'individualFileSaved',
                        filePath: filePath,
                        isMainFile: false,
                        success: false,
                        error: 'File not found or has no content'
                    });
                }
            }

        } catch (error) {
            console.error(`[MessageHandler] Error saving individual file ${filePath}:`, error);

            const panel = this._getWebviewPanel();
            if (panel) {
                panel._panel.webview.postMessage({
                    type: 'individualFileSaved',
                    filePath: filePath,
                    isMainFile: isMainFile,
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * Handle request to reload an individual file from saved state
     */
    private async handleReloadIndividualFile(filePath: string, isMainFile: boolean): Promise<void> {
        try {
            const panel = this._getWebviewPanel();
            if (!panel) {
                return;
            }

            if (isMainFile) {
                // Reload the main file by refreshing from the document
                const document = this._fileManager.getDocument();
                if (document) {
                    await panel.loadMarkdownFile(document);
                }
                console.log('[MessageHandler] Reloaded main kanban file');

                panel._panel.webview.postMessage({
                    type: 'individualFileReloaded',
                    filePath: filePath,
                    isMainFile: true,
                    success: true
                });
            } else {
                // For include files, reload content from disk
                const includeFileMap = (panel as any)._includeFiles;
                const includeFile = includeFileMap?.get(filePath);

                console.log(`[MessageHandler] Attempting to reload include file:
                    filePath: ${filePath}
                    includeFileMap exists: ${!!includeFileMap}
                    includeFileMap size: ${includeFileMap?.size || 0}
                    includeFile found: ${!!includeFile}
                    Available keys: ${includeFileMap ? Array.from(includeFileMap.keys()).join(', ') : 'none'}
                `);

                if (includeFile) {
                    try {
                        // Read fresh content from disk
                        const freshContent = await (panel as any)._readFileContent(filePath);

                        if (freshContent !== null) {
                            // Update content and reset baseline
                            includeFile.content = freshContent;
                            includeFile.baseline = freshContent;
                            includeFile.hasUnsavedChanges = false;
                            includeFile.hasExternalChanges = false; // Clear external changes flag
                            includeFile.isUnsavedInEditor = false; // Clear editor unsaved flag
                            includeFile.externalContent = undefined; // Clear external content
                            includeFile.lastModified = Date.now();

                            console.log(`[MessageHandler] Reloaded include file: ${filePath}`);

                            // Trigger webview refresh to show updated content
                            const document = this._fileManager.getDocument();
                            if (document) {
                                await panel.loadMarkdownFile(document);
                            }

                            panel._panel.webview.postMessage({
                                type: 'individualFileReloaded',
                                filePath: filePath,
                                isMainFile: false,
                                success: true
                            });
                        } else {
                            console.warn(`[MessageHandler] Could not read include file: ${filePath}`);

                            panel._panel.webview.postMessage({
                                type: 'individualFileReloaded',
                                filePath: filePath,
                                isMainFile: false,
                                success: false,
                                error: 'Could not read file from disk'
                            });
                        }
                    } catch (readError) {
                        console.error(`[MessageHandler] Error reading include file ${filePath}:`, readError);

                        panel._panel.webview.postMessage({
                            type: 'individualFileReloaded',
                            filePath: filePath,
                            isMainFile: false,
                            success: false,
                            error: readError instanceof Error ? readError.message : String(readError)
                        });
                    }
                } else {
                    console.warn(`[MessageHandler] Include file not tracked: ${filePath}`);

                    panel._panel.webview.postMessage({
                        type: 'individualFileReloaded',
                        filePath: filePath,
                        isMainFile: false,
                        success: false,
                        error: 'File not tracked'
                    });
                }
            }

        } catch (error) {
            console.error(`[MessageHandler] Error reloading individual file ${filePath}:`, error);

            const panel = this._getWebviewPanel();
            if (panel) {
                panel._panel.webview.postMessage({
                    type: 'individualFileReloaded',
                    filePath: filePath,
                    isMainFile: isMainFile,
                    success: false,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }
    }

    /**
     * Collect comprehensive debug information about tracked files
     */
    /**
     * Get unified file state data that all systems should use for consistency
     * THIS METHOD MUST BE USED BY ALL SYSTEMS - FILE STATE WINDOW, POPUPS, CONFLICT RESOLUTION
     */
    public getUnifiedFileState(): {
        hasInternalChanges: boolean;
        hasExternalChanges: boolean;
        isUnsavedInEditor: boolean;
        documentVersion: number;
        lastDocumentVersion: number;
    } {
        const document = this._fileManager.getDocument();
        if (!document) {
            return {
                hasInternalChanges: false,
                hasExternalChanges: false,
                isUnsavedInEditor: false,
                documentVersion: 0,
                lastDocumentVersion: -1
            };
        }

        const fileStateManager = getFileStateManager();
        const mainFileState = fileStateManager.getFileState(document.uri.fsPath);

        if (!mainFileState) {
            // Fallback to legacy method if state not yet initialized
            const panel = this._getWebviewPanel();
            const documentVersion = document.version;
            const lastDocumentVersion = panel ? (panel as any)._lastDocumentVersion || -1 : -1;

            return {
                hasInternalChanges: panel ? (panel as any)._hasUnsavedChanges || false : false,
                hasExternalChanges: panel ? (panel as any)._hasExternalUnsavedChanges || false : false,
                isUnsavedInEditor: document.isDirty,
                documentVersion,
                lastDocumentVersion
            };
        }

        return {
            hasInternalChanges: mainFileState.needsSave,
            hasExternalChanges: mainFileState.needsReload,
            isUnsavedInEditor: mainFileState.backend.isDirtyInEditor,
            documentVersion: mainFileState.backend.documentVersion,
            lastDocumentVersion: mainFileState.backend.documentVersion - 1 // Approximation
        };
    }

    private async collectTrackedFilesDebugInfo(): Promise<any> {
        const document = this._fileManager.getDocument();
        const fileStateManager = getFileStateManager();

        // Get unified file state that all systems should use
        const fileState = this.getUnifiedFileState();


        // Use preserved file path from FileManager, which persists even when document is closed
        const mainFilePath = this._fileManager.getFilePath() || document?.uri.fsPath || 'Unknown';
        const mainFileState = mainFilePath !== 'Unknown' ? fileStateManager.getFileState(mainFilePath) : undefined;

        const mainFileInfo = {
            path: mainFilePath,
            lastModified: mainFileState?.backend.lastModified?.toISOString() || 'Unknown',
            exists: mainFileState?.backend.exists ?? (document ? true : false),
            watcherActive: true, // Assume active for now
            hasInternalChanges: fileState.hasInternalChanges,
            hasExternalChanges: fileState.hasExternalChanges,
            documentVersion: fileState.documentVersion,
            lastDocumentVersion: fileState.lastDocumentVersion,
            isUnsavedInEditor: fileState.isUnsavedInEditor,
            baseline: mainFileState?.frontend.baseline || ''
        };


        // External file watchers
        const externalWatchers: any[] = [];
        let watcherDebugInfo: any = {};
        try {
            // Get external file watcher instance
            const { ExternalFileWatcher } = require('./externalFileWatcher');
            const watcher = ExternalFileWatcher.getInstance();

            // Get debug information from watcher
            watcherDebugInfo = watcher.getDebugInfo();

            // Transform watcher info for display
            watcherDebugInfo.watchers.forEach((watcherInfo: any) => {
                externalWatchers.push({
                    path: watcherInfo.path,
                    active: watcherInfo.active,
                    type: watcherInfo.type
                });
            });
        } catch (error) {
            console.warn('[Debug] Could not access ExternalFileWatcher:', error);
        }

        // Include files from FileStateManager
        const includeFiles: any[] = [];
        const allStates = fileStateManager.getAllStates();


        for (const [filePath, fileStateData] of allStates) {
            // Skip main file - we handle it separately
            if (filePath === mainFilePath) {
                continue;
            }


            includeFiles.push({
                path: fileStateData.relativePath,
                type: fileStateData.fileType,
                exists: fileStateData.backend.exists,
                lastModified: fileStateData.backend.lastModified?.toISOString() || 'Unknown',
                size: 'Unknown', // Size not tracked in FileStateManager yet
                hasInternalChanges: fileStateData.needsSave,
                hasExternalChanges: fileStateData.needsReload,
                isUnsavedInEditor: fileStateData.backend.isDirtyInEditor,
                baseline: fileStateData.frontend.baseline,
                content: fileStateData.frontend.content,
                externalContent: '', // Not tracked separately anymore
                contentLength: fileStateData.frontend.content.length,
                baselineLength: fileStateData.frontend.baseline.length,
                externalContentLength: 0
            });
        }

        // Conflict management status
        const conflictManager = {
            healthy: watcherDebugInfo.listenerEnabled || false,
            trackedFiles: watcherDebugInfo.totalWatchedFiles || (1 + includeFiles.length),
            activeWatchers: watcherDebugInfo.totalWatchers || 0,
            pendingConflicts: 0,
            watcherFailures: 0,
            listenerEnabled: watcherDebugInfo.listenerEnabled || false,
            documentSaveListenerActive: watcherDebugInfo.documentSaveListenerActive || false
        };

        // System health
        const systemHealth = {
            overall: (watcherDebugInfo.totalWatchers > 0 && includeFiles.length > 0) ? 'good' : 'warn',
            extensionState: 'active',
            memoryUsage: 'normal',
            lastError: null
        };

        return {
            mainFile: mainFileInfo.path,
            mainFileLastModified: mainFileInfo.lastModified,
            fileWatcherActive: mainFileInfo.watcherActive,
            externalWatchers: externalWatchers,
            includeFiles: includeFiles,
            conflictManager: conflictManager,
            systemHealth: systemHealth,
            hasUnsavedChanges: this._getWebviewPanel() ? (this._getWebviewPanel() as any)._hasUnsavedChanges || false : false,
            timestamp: new Date().toISOString(),
            watcherDetails: mainFileInfo, // FIX: Send main file info instead of external watcher info
            externalWatcherDebugInfo: watcherDebugInfo // Keep external watcher info separate
        };
    }

    /**
     * Clear all tracked file caches
     */
    private async clearAllTrackedFileCaches(): Promise<void> {
        const panel = this._getWebviewPanel();

        if (panel) {
            // Clear include file caches
            try {
                const includeFileMap = (panel as any)._includeFiles;
                if (includeFileMap) {
                    includeFileMap.clear();
                }

                // Clear cached board state if needed
                (panel as any)._cachedBoardFromWebview = null;

                // Trigger a fresh load
                const document = this._fileManager.getDocument();
                if (document) {
                    await panel.loadMarkdownFile(document, false);
                }
            } catch (error) {
                console.warn('[Debug] Error clearing panel caches:', error);
            }
        }
    }

    /**
     * Handle updating task content after strikethrough deletion
     */
    private async handleUpdateTaskFromStrikethroughDeletion(message: any): Promise<void> {
        console.log('🗑️ Backend: handleUpdateTaskFromStrikethroughDeletion called', message);
        const { taskId, columnId, newContent, contentType } = message;

        try {
            const board = this._getCurrentBoard();
            if (!board) {
                console.error('🗑️ Backend: No current board available for strikethrough deletion');
                return;
            }

            console.log('🗑️ Backend: Received markdown content:', newContent);
            console.log('🗑️ Backend: Content type:', contentType);

            // Content is already in markdown format from frontend
            const markdownContent = newContent;
            console.log('🗑️ Backend: Using markdown content directly:', markdownContent);

            // Update the appropriate field based on content type
            const updateData: any = {};
            if (contentType === 'title') {
                updateData.title = markdownContent;
            } else if (contentType === 'description') {
                updateData.description = markdownContent;
            } else {
                console.warn('🗑️ Backend: Unknown content type, defaulting to title');
                updateData.title = markdownContent;
            }

            await this.performBoardAction(() =>
                this._boardOperations.editTask(board, taskId, columnId, updateData)
            );

            console.log('🗑️ Backend: Task updated successfully');

        } catch (error) {
            console.error('🗑️ Backend: Error updating task from strikethrough deletion:', error);
            vscode.window.showErrorMessage('Failed to update task content');
        }
    }

    /**
     * Handle updating column title after strikethrough deletion
     */
    private async handleUpdateColumnTitleFromStrikethroughDeletion(message: any): Promise<void> {
        console.log('🗑️ Backend: handleUpdateColumnTitleFromStrikethroughDeletion called', message);
        const { columnId, newTitle } = message;

        try {
            const board = this._getCurrentBoard();
            if (!board) {
                console.error('🗑️ Backend: No current board available for strikethrough deletion');
                return;
            }

            console.log('🗑️ Backend: Received markdown title:', newTitle);

            // Content is already in markdown format from frontend
            const markdownTitle = newTitle;
            console.log('🗑️ Backend: Using markdown title directly:', markdownTitle);

            // Update the column title
            await this.performBoardAction(() =>
                this._boardOperations.editColumnTitle(board, columnId, markdownTitle)
            );

            console.log('🗑️ Backend: Column title updated successfully');

        } catch (error) {
            console.error('🗑️ Backend: Error updating column title from strikethrough deletion:', error);
            vscode.window.showErrorMessage('Failed to update column title');
        }
    }

    /**
     * Convert HTML content back to markdown (simplified conversion for strikethrough removal)
     */
    private convertHtmlToMarkdown(htmlContent: string): string {
        // Simple HTML to markdown conversion for the basic elements we expect
        return htmlContent
            .replace(/<br\s*\/?>/gi, '\n')
            .replace(/<\/p><p[^>]*>/gi, '\n\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/<\/p>/gi, '')
            .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
            .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
            .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
            .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
            .replace(/<img[^>]*src="([^"]*)"[^>]*alt="([^"]*)"[^>]*>/gi, '![$2]($1)')
            .replace(/<img[^>]*alt="([^"]*)"[^>]*src="([^"]*)"[^>]*>/gi, '![$1]($2)')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
    }
}