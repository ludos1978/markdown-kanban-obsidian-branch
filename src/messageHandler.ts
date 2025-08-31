import { FileManager } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { KanbanBoard } from './markdownParser';

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
            case 'requestFileInfo':
                this._fileManager.sendFileInfo();
                break;
            case 'initializeFile':
                await this._onInitializeFile();
                break;
            case 'showMessage':
                // vscode.window.showInformationMessage(message.text);
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
            default:
                console.warn('Unknown message type:', message.type);
                break;
        }
    }

    private async handleUndo() {
        const currentBoard = this._getCurrentBoard();
        const restoredBoard = this._undoRedoManager.undo(currentBoard);
        
        if (restoredBoard) {
            this._setBoard(restoredBoard);
            this._boardOperations.setOriginalTaskOrder(restoredBoard);
            await this._onSaveToMarkdown();
            await this._onBoardUpdate();
        }
    }

    private async handleRedo() {
        const currentBoard = this._getCurrentBoard();
        const restoredBoard = this._undoRedoManager.redo(currentBoard);
        
        if (restoredBoard) {
            this._setBoard(restoredBoard);
            this._boardOperations.setOriginalTaskOrder(restoredBoard);
            await this._onSaveToMarkdown();
            await this._onBoardUpdate();
        }
    }

    private async handleSelectFile() {
        const document = await this._fileManager.selectFile();
        if (document) {
            // This would need to be handled by the main panel
            console.log('Selected file:', document.fileName);
        }
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
}