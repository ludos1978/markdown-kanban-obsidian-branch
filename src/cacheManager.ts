import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { KanbanBoard } from './markdownParser';

export class CacheManager {
    private _cacheTimeout: NodeJS.Timeout | null = null;
    private _undoCacheTimeout: NodeJS.Timeout | null = null;

    public async createCacheFile(document: vscode.TextDocument, board: KanbanBoard): Promise<void> {
        if (!document || !board || !board.valid) return;

        // Clear existing timeout to debounce rapid changes
        if (this._cacheTimeout) {
            clearTimeout(this._cacheTimeout);
        }

        // Debounce cache file creation to avoid excessive file I/O
        this._cacheTimeout = setTimeout(async () => {
            try {
                const cacheFilePath = this.generateCacheFilePath(document);
                const markdown = require('./markdownParser').MarkdownKanbanParser.generateMarkdown(board);
                
                await fs.promises.writeFile(cacheFilePath, markdown, 'utf8');
                console.log(`💾 Created cache file: ${path.basename(cacheFilePath)}`);
            } catch (error) {
                console.warn('Failed to create cache file:', error);
            }
        }, 2000); // 2 second debounce
    }

    public async createUndoCacheFile(document: vscode.TextDocument, undoStack: any[], redoStack: any[]): Promise<void> {
        if (!document) return;

        // Clear existing timeout
        if (this._undoCacheTimeout) {
            clearTimeout(this._undoCacheTimeout);
        }

        // Debounce undo cache creation (lighter debounce since it's JSON)
        this._undoCacheTimeout = setTimeout(async () => {
            try {
                const undoCacheFilePath = this.generateUndoCacheFilePath(document);
                const undoData = { undoStack, redoStack, timestamp: new Date().toISOString() };
                
                await fs.promises.writeFile(undoCacheFilePath, JSON.stringify(undoData, null, 2), 'utf8');
                console.log(`🔄 Created undo cache: ${path.basename(undoCacheFilePath)}`);
            } catch (error) {
                console.warn('Failed to create undo cache file:', error);
            }
        }, 1000); // 1 second debounce for undo cache
    }

    public async cleanupCacheFiles(document: vscode.TextDocument): Promise<void> {
        try {
            const cacheFilePath = this.generateCacheFilePath(document);
            const undoCacheFilePath = this.generateUndoCacheFilePath(document);

            // Clean up cache files on successful save
            if (fs.existsSync(cacheFilePath)) {
                await fs.promises.unlink(cacheFilePath);
                console.log(`🧹 Cleaned cache file: ${path.basename(cacheFilePath)}`);
            }

            if (fs.existsSync(undoCacheFilePath)) {
                await fs.promises.unlink(undoCacheFilePath);
                console.log(`🧹 Cleaned undo cache: ${path.basename(undoCacheFilePath)}`);
            }
        } catch (error) {
            console.warn('Failed to cleanup cache files:', error);
        }
    }

    public async checkForCacheRecovery(document: vscode.TextDocument): Promise<{ hasCache: boolean, cacheNewer: boolean, cachePath?: string }> {
        try {
            const cacheFilePath = this.generateCacheFilePath(document);
            
            if (!fs.existsSync(cacheFilePath)) {
                return { hasCache: false, cacheNewer: false };
            }

            const docStats = await fs.promises.stat(document.uri.fsPath);
            const cacheStats = await fs.promises.stat(cacheFilePath);
            
            const cacheNewer = cacheStats.mtime > docStats.mtime;
            
            return { 
                hasCache: true, 
                cacheNewer, 
                cachePath: cacheFilePath 
            };
        } catch (error) {
            console.warn('Error checking cache recovery:', error);
            return { hasCache: false, cacheNewer: false };
        }
    }

    private generateCacheFilePath(document: vscode.TextDocument): string {
        const docPath = document.uri.fsPath;
        const dirName = path.dirname(docPath);
        const baseName = path.basename(docPath, path.extname(docPath));
        const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
        
        return path.join(dirName, `.${baseName}-cache-${timestamp}.md`);
    }

    private generateUndoCacheFilePath(document: vscode.TextDocument): string {
        const docPath = document.uri.fsPath;
        const dirName = path.dirname(docPath);
        const baseName = path.basename(docPath, path.extname(docPath));
        const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
        
        return path.join(dirName, `.${baseName}-undo-${timestamp}.json`);
    }

    public dispose(): void {
        if (this._cacheTimeout) {
            clearTimeout(this._cacheTimeout);
            this._cacheTimeout = null;
        }
        if (this._undoCacheTimeout) {
            clearTimeout(this._undoCacheTimeout);
            this._undoCacheTimeout = null;
        }
    }
}