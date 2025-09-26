/**
 * Unified File State Management System
 *
 * This module provides a single source of truth for all file state tracking,
 * clearly separating backend (file system) changes from frontend (Kanban UI) changes.
 */

import * as vscode from 'vscode';

/**
 * Represents the complete state of a file
 */
export interface FileState {
    // File identification
    path: string;
    relativePath: string;
    isMainFile: boolean;
    fileType: 'main' | 'include-column' | 'include-task';

    // Backend states (file system & VS Code editor)
    backend: {
        exists: boolean;
        lastModified: Date | null;
        isDirtyInEditor: boolean;      // VS Code editor has unsaved changes
        documentVersion: number;        // VS Code document version
        hasFileSystemChanges: boolean; // File changed on disk outside VS Code
    };

    // Frontend states (Kanban UI)
    frontend: {
        hasUnsavedChanges: boolean;    // Kanban UI has modifications
        content: string;                // Current content in Kanban
        baseline: string;               // Last known saved content
    };

    // Computed state
    needsReload: boolean;              // Backend changes need to be loaded into frontend
    needsSave: boolean;                // Frontend changes need to be saved to backend
    hasConflict: boolean;              // Both backend and frontend have changes
}

/**
 * Manages all file states for the Kanban system
 */
export class FileStateManager {
    private static instance: FileStateManager;
    private fileStates: Map<string, FileState> = new Map();

    private constructor() {}

    public static getInstance(): FileStateManager {
        if (!FileStateManager.instance) {
            FileStateManager.instance = new FileStateManager();
        }
        return FileStateManager.instance;
    }

    /**
     * Initialize or update a file's state
     */
    public initializeFile(
        path: string,
        relativePath: string,
        isMainFile: boolean,
        fileType: 'main' | 'include-column' | 'include-task'
    ): FileState {
        let state = this.fileStates.get(path);

        if (!state) {
            state = {
                path,
                relativePath,
                isMainFile,
                fileType,
                backend: {
                    exists: true,
                    lastModified: null,
                    isDirtyInEditor: false,
                    documentVersion: 0,
                    hasFileSystemChanges: false
                },
                frontend: {
                    hasUnsavedChanges: false,
                    content: '',
                    baseline: ''
                },
                needsReload: false,
                needsSave: false,
                hasConflict: false
            };
            this.fileStates.set(path, state);
        }

        return state;
    }

    /**
     * Update backend state when file changes on disk
     */
    public markFileSystemChange(path: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.backend.hasFileSystemChanges = true;
            state.backend.lastModified = new Date();
            this.updateComputedState(state);
            console.log(`[FileStateManager] File system change detected: ${path}`);
        }
    }

    /**
     * Update backend state when document changes in VS Code editor
     */
    public markEditorChange(path: string, isDirty: boolean, version: number): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.backend.isDirtyInEditor = isDirty;
            state.backend.documentVersion = version;
            this.updateComputedState(state);
            console.log(`[FileStateManager] Editor change detected: ${path}, dirty=${isDirty}, version=${version}`);
        }
    }

    /**
     * Update frontend state when Kanban UI modifies content
     */
    public markFrontendChange(path: string, hasChanges: boolean, content?: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.frontend.hasUnsavedChanges = hasChanges;
            if (content !== undefined) {
                state.frontend.content = content;
            }
            this.updateComputedState(state);
            console.log(`[FileStateManager] Frontend change detected: ${path}, hasChanges=${hasChanges}`);
        }
    }

    /**
     * Mark file as saved (clears frontend changes)
     */
    public markSaved(path: string, newBaseline: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.frontend.hasUnsavedChanges = false;
            state.frontend.baseline = newBaseline;
            state.frontend.content = newBaseline;
            state.backend.hasFileSystemChanges = false;
            state.backend.isDirtyInEditor = false;
            this.updateComputedState(state);
            console.log(`[FileStateManager] File saved: ${path}`);
        }
    }

    /**
     * Mark file as reloaded (clears backend changes)
     */
    public markReloaded(path: string, newContent: string): void {
        const state = this.fileStates.get(path);
        if (state) {
            state.backend.hasFileSystemChanges = false;
            state.backend.isDirtyInEditor = false;
            state.frontend.content = newContent;
            state.frontend.baseline = newContent;
            state.frontend.hasUnsavedChanges = false;
            this.updateComputedState(state);
            console.log(`[FileStateManager] File reloaded: ${path}`);
        }
    }

    /**
     * Update computed state based on backend and frontend states
     */
    private updateComputedState(state: FileState): void {
        // Need to reload if backend has changes but frontend doesn't
        state.needsReload = (state.backend.hasFileSystemChanges || state.backend.isDirtyInEditor)
                          && !state.frontend.hasUnsavedChanges;

        // Need to save if frontend has changes
        state.needsSave = state.frontend.hasUnsavedChanges;

        // Has conflict if both have changes
        state.hasConflict = state.frontend.hasUnsavedChanges
                         && (state.backend.hasFileSystemChanges || state.backend.isDirtyInEditor);
    }

    /**
     * Get state for a specific file
     */
    public getFileState(path: string): FileState | undefined {
        return this.fileStates.get(path);
    }

    /**
     * Get all file states
     */
    public getAllStates(): Map<string, FileState> {
        return new Map(this.fileStates);
    }

    /**
     * Get summary for debug overlay
     */
    public getDebugSummary(): any {
        const states = Array.from(this.fileStates.values());

        return {
            totalFiles: states.length,
            mainFile: states.find(s => s.isMainFile),
            includeFiles: states.filter(s => !s.isMainFile),
            filesNeedingReload: states.filter(s => s.needsReload).length,
            filesNeedingSave: states.filter(s => s.needsSave).length,
            filesWithConflicts: states.filter(s => s.hasConflict).length
        };
    }

    /**
     * Clear state for a file
     */
    public clearFileState(path: string): void {
        this.fileStates.delete(path);
        console.log(`[FileStateManager] Cleared state for: ${path}`);
    }

    /**
     * Clear all states
     */
    public clearAll(): void {
        this.fileStates.clear();
        console.log(`[FileStateManager] Cleared all file states`);
    }
}

/**
 * Global instance getter for convenience
 */
export function getFileStateManager(): FileStateManager {
    return FileStateManager.getInstance();
}