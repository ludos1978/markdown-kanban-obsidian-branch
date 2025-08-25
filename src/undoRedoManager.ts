import * as vscode from 'vscode';
import { KanbanBoard } from './markdownParser';

function deepCloneBoard(board: KanbanBoard): KanbanBoard {
    return JSON.parse(JSON.stringify(board));
}

export class UndoRedoManager {
    private _undoStack: KanbanBoard[] = [];
    private _redoStack: KanbanBoard[] = [];
    private readonly _maxUndoStackSize = 50;
    private _webview: vscode.Webview;

    constructor(webview: vscode.Webview) {
        this._webview = webview;
    }

    public saveStateForUndo(board: KanbanBoard) {
        if (!board || !board.valid) return;
        
        this._undoStack.push(deepCloneBoard(board));
        
        if (this._undoStack.length > this._maxUndoStackSize) {
            this._undoStack.shift();
        }
        
        this._redoStack = [];
        this.sendUndoRedoStatus();
    }

    public undo(currentBoard: KanbanBoard | undefined): KanbanBoard | null {
        if (this._undoStack.length === 0) {
            vscode.window.showInformationMessage('Nothing to undo');
            return null;
        }
        
        if (currentBoard && currentBoard.valid) {
            this._redoStack.push(deepCloneBoard(currentBoard));
        }
        
        const restoredBoard = this._undoStack.pop()!;
        this.sendUndoRedoStatus();
        
        this.disableFileListenerTemporarily();
        
        return restoredBoard;
    }

    public redo(currentBoard: KanbanBoard | undefined): KanbanBoard | null {
        if (this._redoStack.length === 0) {
            vscode.window.showInformationMessage('Nothing to redo');
            return null;
        }
        
        if (currentBoard && currentBoard.valid) {
            this._undoStack.push(deepCloneBoard(currentBoard));
        }
        
        const restoredBoard = this._redoStack.pop()!;
        this.sendUndoRedoStatus();
        
        this.disableFileListenerTemporarily();
        
        return restoredBoard;
    }

    public canUndo(): boolean {
        return this._undoStack.length > 0;
    }

    public canRedo(): boolean {
        return this._redoStack.length > 0;
    }

    public clear() {
        this._undoStack = [];
        this._redoStack = [];
        this.sendUndoRedoStatus();
    }

    private sendUndoRedoStatus() {
        setTimeout(() => {
            this._webview.postMessage({
                type: 'undoRedoStatus',
                canUndo: this.canUndo(),
                canRedo: this.canRedo()
            });
        }, 10);
    }

    private disableFileListenerTemporarily() {
        try {
            const kanbanFileListener = (globalThis as any).kanbanFileListener;
            if (kanbanFileListener && kanbanFileListener.getStatus) {
                const wasEnabled = kanbanFileListener.getStatus();
                if (wasEnabled) {
                    kanbanFileListener.setStatus(false);
                    
                    setTimeout(() => {
                        if (kanbanFileListener) {
                            kanbanFileListener.setStatus(true);
                        }
                    }, 2000);
                }
            }
        } catch (error) {
            console.warn('Failed to disable file listener during undo/redo:', error);
        }
    }
}