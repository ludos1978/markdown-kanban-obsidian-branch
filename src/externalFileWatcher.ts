import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';

export type FileChangeType = 'modified' | 'deleted' | 'created';
export type FileType = 'main' | 'include' | 'dependency';

export interface WatchedFile {
    path: string;
    type: FileType;
    panels: Set<KanbanWebviewPanel>;
}

export interface FileChangeEvent {
    path: string;
    changeType: FileChangeType;
    fileType: FileType;
    panels: KanbanWebviewPanel[];
}

/**
 * Centralized file watcher system that monitors all external file changes
 * for the markdown kanban extension. This replaces multiple individual
 * file watching systems with a single, efficient implementation.
 */
export class ExternalFileWatcher implements vscode.Disposable {
    private static instance: ExternalFileWatcher | undefined;

    private watchers: Map<string, vscode.FileSystemWatcher> = new Map();
    private watchedFiles: Map<string, WatchedFile> = new Map();
    private disposables: vscode.Disposable[] = [];
    private fileListenerEnabled: boolean = true;
    private documentSaveListener: vscode.Disposable | undefined;

    // Event emitter for file changes
    private _onFileChanged = new vscode.EventEmitter<FileChangeEvent>();
    public readonly onFileChanged = this._onFileChanged.event;

    private constructor() {
        // Set up document save listener for immediate file change detection
        this.setupDocumentSaveListener();
    }

    /**
     * Get or create the singleton instance
     */
    public static getInstance(): ExternalFileWatcher {
        if (!ExternalFileWatcher.instance) {
            ExternalFileWatcher.instance = new ExternalFileWatcher();
        }
        return ExternalFileWatcher.instance;
    }

    /**
     * Set whether file listening is enabled globally
     */
    public setFileListenerEnabled(enabled: boolean): void {
        this.fileListenerEnabled = enabled;
    }

    /**
     * Get current file listener status
     */
    public getFileListenerEnabled(): boolean {
        return this.fileListenerEnabled;
    }

    /**
     * Set up document save listener for immediate change detection
     */
    private setupDocumentSaveListener(): void {
        this.documentSaveListener = vscode.workspace.onDidSaveTextDocument((document) => {
            if (!this.fileListenerEnabled) {
                return;
            }

            const documentPath = document.uri.fsPath;

            // Check if this document is in our watched files
            const watchedFile = this.watchedFiles.get(documentPath);
            if (watchedFile) {
                // Fire the change event immediately on save
                this.handleFileChange(documentPath, 'modified');
            }
        });

        this.disposables.push(this.documentSaveListener);
    }

    /**
     * Register a file for watching
     */
    public registerFile(path: string, type: FileType, panel: KanbanWebviewPanel): void {

        // Check if this file is already being watched
        let watchedFile = this.watchedFiles.get(path);

        if (watchedFile) {
            // File already watched, just add this panel to the set
            watchedFile.panels.add(panel);
        } else {
            // New file to watch
            watchedFile = {
                path,
                type,
                panels: new Set([panel])
            };
            this.watchedFiles.set(path, watchedFile);

            // Create the actual file system watcher
            this.createWatcher(path, type);
        }
    }

    /**
     * Unregister a file for a specific panel
     */
    public unregisterFile(path: string, panel: KanbanWebviewPanel): void {
        const watchedFile = this.watchedFiles.get(path);
        if (!watchedFile) {return;}

        // Remove this panel from the watchers
        watchedFile.panels.delete(panel);

        // If no panels are watching this file anymore, dispose the watcher
        if (watchedFile.panels.size === 0) {
            this.watchedFiles.delete(path);
            this.disposeWatcher(path);
        }
    }

    /**
     * Unregister all files for a specific panel
     */
    public unregisterPanel(panel: KanbanWebviewPanel): void {
        // Find all files watched by this panel
        const filesToCheck: string[] = [];

        for (const [path, watchedFile] of this.watchedFiles.entries()) {
            if (watchedFile.panels.has(panel)) {
                watchedFile.panels.delete(panel);
                if (watchedFile.panels.size === 0) {
                    filesToCheck.push(path);
                }
            }
        }

        // Clean up files with no watchers
        for (const path of filesToCheck) {
            this.watchedFiles.delete(path);
            this.disposeWatcher(path);
        }
    }

    /**
     * Update the list of include files for a panel
     * This will unregister old includes and register new ones
     */
    public updateIncludeFiles(panel: KanbanWebviewPanel, newIncludeFiles: string[]): void {
        // Find current include files for this panel
        const currentIncludes: string[] = [];

        for (const [path, watchedFile] of this.watchedFiles.entries()) {
            if (watchedFile.type === 'include' && watchedFile.panels.has(panel)) {
                currentIncludes.push(path);
            }
        }

        // Unregister files that are no longer included
        for (const path of currentIncludes) {
            if (!newIncludeFiles.includes(path)) {
                this.unregisterFile(path, panel);
            }
        }

        // Register new include files
        for (const path of newIncludeFiles) {
            if (!currentIncludes.includes(path)) {
                this.registerFile(path, 'include', panel);
            }
        }
    }

    /**
     * Create a file system watcher for a path
     */
    private createWatcher(path: string, type: FileType): void {
        // Don't create duplicate watchers
        if (this.watchers.has(path)) {
            return;
        }

        try {
            const watcher = vscode.workspace.createFileSystemWatcher(path);

            // Handle file changes
            watcher.onDidChange(async () => {
                if (!this.fileListenerEnabled) {return;}
                await this.handleFileChange(path, 'modified');
            });

            // Handle file deletion
            watcher.onDidDelete(() => {
                if (!this.fileListenerEnabled) {return;}
                this.handleFileChange(path, 'deleted');
            });

            // Handle file creation (useful for recreated files)
            watcher.onDidCreate(() => {
                if (!this.fileListenerEnabled) {return;}
                this.handleFileChange(path, 'created');
            });

            this.watchers.set(path, watcher);
            this.disposables.push(watcher);
        } catch (error) {
            console.error(`[ExternalFileWatcher] Failed to create watcher for ${path}:`, error);
        }
    }

    /**
     * Dispose a specific file watcher
     */
    private disposeWatcher(path: string): void {
        const watcher = this.watchers.get(path);
        if (watcher) {
            watcher.dispose();
            this.watchers.delete(path);

            // Remove from disposables array
            const index = this.disposables.indexOf(watcher);
            if (index > -1) {
                this.disposables.splice(index, 1);
            }
        }
    }

    /**
     * Handle a file change event
     */
    private async handleFileChange(path: string, changeType: FileChangeType): Promise<void> {
        const watchedFile = this.watchedFiles.get(path);
        if (!watchedFile) {return;}

        // Convert Set to Array for the event
        const affectedPanels = Array.from(watchedFile.panels);

        // Filter out panels that are currently updating (to prevent loops)
        const panelsToNotify = affectedPanels.filter(panel => {
            const isUpdating = (panel as any)._isUpdatingFromPanel;
            if (isUpdating) {
            }
            return !isUpdating;
        });

        if (panelsToNotify.length === 0) {return;}

        // Emit the change event
        const event: FileChangeEvent = {
            path,
            changeType,
            fileType: watchedFile.type,
            panels: panelsToNotify
        };


        this._onFileChanged.fire(event);
    }

    /**
     * Dispose all watchers and clean up
     */
    public dispose(): void {
        // Dispose all watchers
        for (const watcher of this.watchers.values()) {
            watcher.dispose();
        }
        this.watchers.clear();
        this.watchedFiles.clear();

        // Dispose document save listener
        if (this.documentSaveListener) {
            this.documentSaveListener.dispose();
            this.documentSaveListener = undefined;
        }

        // Dispose event emitter
        this._onFileChanged.dispose();

        // Dispose all disposables
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
        this.disposables = [];

        // Clear singleton instance
        if (ExternalFileWatcher.instance === this) {
            ExternalFileWatcher.instance = undefined;
        }
    }
}