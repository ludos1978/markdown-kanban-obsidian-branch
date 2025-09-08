import { FileManager } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { KanbanBoard } from './markdownParser';
import * as vscode from 'vscode';

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
    private _markUnsavedChanges: (hasChanges: boolean) => void;

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
            markUnsavedChanges: (hasChanges: boolean) => void;
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
        console.log('KanbanWebviewPanel received message:', message.type, message);
        
        switch (message.type) {
            // Undo/Redo operations
            case 'undo':
                await this.handleUndo();
                break;
            case 'redo':
                await this.handleRedo();
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
            case 'closeWindow':
                // Check for unsaved changes before closing
                await this.handleCloseWindow();
                break;
            case 'markUnsavedChanges':
                // Track unsaved changes at panel level
                this._markUnsavedChanges(message.hasUnsavedChanges);
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
                await this.performBoardAction(() => 
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
                await this.performBoardAction(() => 
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

                // case 'replaceLinkInMarkdown':
            //     await this.handleLinkReplacement(message);
            //     break;
            default:
                console.warn('Unknown message type:', message.type);
                break;
        }
    }

    // private async handleLinkReplacement(message: any) {
    //     const board = this._getCurrentBoard();
    //     if (!board || !board.valid) return;

    //     const { originalPath, newPath, isImage } = message;
    //     let modified = false;

    //     // Helper function to replace link in text
    //     const replaceLink = (text: string): string => {
    //         if (!text) return text;
            
    //         // Build the regex patterns
    //         const escapedPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
    //         if (isImage) {
    //             // Image link pattern: ![alt](path)
    //             const imageRegex = new RegExp(`(!\\[[^\\]]*\\]\\()${escapedPath}(\\))`, 'g');
    //             if (imageRegex.test(text)) {
    //                 return text.replace(imageRegex, `~~$1${originalPath}$2~~ $1${newPath}$2`);
    //             }
    //         } else {
    //             // Regular link pattern: [text](path)
    //             const linkRegex = new RegExp(`(\\[[^\\]]+\\]\\()${escapedPath}(\\))`, 'g');
    //             if (linkRegex.test(text)) {
    //                 return text.replace(linkRegex, `~~$1${originalPath}$2~~ $1${newPath}$2`);
    //             }
    //         }
            
    //         return text;
    //     };

    //     // Search and replace in all columns and tasks
    //     for (const column of board.columns) {
    //         const newTitle = replaceLink(column.title);
    //         if (newTitle !== column.title) {
    //             column.title = newTitle;
    //             modified = true;
    //         }

    //         for (const task of column.tasks) {
    //             const newTaskTitle = replaceLink(task.title);
    //             if (newTaskTitle !== task.title) {
    //                 task.title = newTaskTitle;
    //                 modified = true;
    //             }

    //             if (task.description) {
    //                 const newDescription = replaceLink(task.description);
    //                 if (newDescription !== task.description) {
    //                     task.description = newDescription;
    //                     modified = true;
    //                 }
    //             }
    //         }
    //     }

    //     if (modified) {
    //         this._undoRedoManager.saveStateForUndo(board);
    //         await this._onSaveToMarkdown();
    //         await this._onBoardUpdate();
    //     }
    // }

    private async handleUndo() {
        const currentBoard = this._getCurrentBoard();
        const restoredBoard = this._undoRedoManager.undo(currentBoard);
        
        if (restoredBoard) {
            this._setUndoRedoOperation(true);
            this._setBoard(restoredBoard);
            this._boardOperations.setOriginalTaskOrder(restoredBoard);
            await this._onSaveToMarkdown();
            await this._onBoardUpdate();
            
            // Reset flag after operations complete
            setTimeout(() => {
                this._setUndoRedoOperation(false);
            }, 2000);
        }
    }

    private async handleRedo() {
        const currentBoard = this._getCurrentBoard();
        const restoredBoard = this._undoRedoManager.redo(currentBoard);
        
        if (restoredBoard) {
            this._setUndoRedoOperation(true);
            this._setBoard(restoredBoard);
            this._boardOperations.setOriginalTaskOrder(restoredBoard);
            await this._onSaveToMarkdown();
            await this._onBoardUpdate();
            
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
            console.log('Selected file:', document.fileName);
        }
    }

    private async handleCloseWindow() {
        // Use the existing unsaved changes check mechanism
        return new Promise<void>((resolve) => {
            // Send message to webview to check for unsaved changes
            const panel = this._getWebviewPanel();
            if (panel?.webview) {
                panel.webview.postMessage({
                    type: 'checkUnsavedChanges',
                    requestId: Date.now().toString()
                });

                // Set up one-time listener for response
                const disposable = panel.webview.onDidReceiveMessage(async (message: any) => {
                    if (message.type === 'hasUnsavedChangesResponse') {
                        disposable.dispose(); // Clean up listener
                        
                        if (message.hasUnsavedChanges) {
                            // Show save confirmation dialog with backup option
                            const choice = await vscode.window.showWarningMessage(
                                'You have unsaved changes. What would you like to do?',
                                { modal: true },
                                'Save',
                                'Save with backup filename',
                                'Don\'t Save'
                            );

                            if (choice === 'Save') {
                                await this._onSaveToMarkdown();
                                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                            } else if (choice === 'Save with backup filename') {
                                await this._saveWithBackup();
                                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                            } else if (choice === 'Don\'t Save') {
                                await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                            }
                            // If user cancels (no choice), don't close
                        } else {
                            // No unsaved changes, close immediately
                            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                        }
                        
                        resolve();
                    }
                });

                // Timeout after 1 second to prevent hanging
                setTimeout(() => {
                    disposable.dispose();
                    // If no response, close anyway
                    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                    resolve();
                }, 1000);
            } else {
                // No webview available, close immediately
                vscode.commands.executeCommand('workbench.action.closeActiveEditor');
                resolve();
            }
        });
    }

    private async handleSaveBoardState(board: any) {
        console.log('📥 Received complete board state for saving:', board);
        
        if (!board) {
            console.warn('❌ No board data received for saving');
            return;
        }
        
        // Save current state for undo
        const currentBoard = this._getCurrentBoard();
        if (currentBoard) {
            this._undoRedoManager.saveStateForUndo(currentBoard);
        }
        
        // Replace the current board with the new one
        this._setBoard(board);
        
        // Save to markdown file and update the webview
        await this._onSaveToMarkdown();
        await this._onBoardUpdate();
        
        console.log('✅ Board state saved successfully');
    }

    private async performBoardAction(action: () => boolean, saveUndo: boolean = true) {
        const board = this._getCurrentBoard();
        if (!board) return;
        
        if (saveUndo) {
            this._undoRedoManager.saveStateForUndo(board);
        }
        
        const success = action();
        
        if (success) {
            await this._onSaveToMarkdown();
            await this._onBoardUpdate();
        }
    }

    private async handlePageHiddenWithUnsavedChanges(): Promise<void> {
        console.log('🔧 DEBUG: Page hidden with unsaved changes - showing save dialog');
        
        try {
            const choice = await vscode.window.showWarningMessage(
                'You have unsaved kanban board changes. Save them now?',
                { modal: true },
                'Save Now',
                'Save with Backup',
                'Don\'t Save'
            );
            
            if (choice === 'Save Now') {
                await this._onSaveToMarkdown();
                vscode.window.showInformationMessage('Kanban board saved successfully!');
            } else if (choice === 'Save with Backup') {
                await this._saveWithBackup();
            }
            // If 'Don't Save', just continue - the user chose to discard changes
            
        } catch (error) {
            console.error('🔧 ERROR: Failed to handle unsaved changes:', error);
            vscode.window.showErrorMessage('Failed to save kanban changes: ' + error);
        }
    }
}