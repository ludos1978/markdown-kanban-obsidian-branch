import * as vscode from 'vscode';
import * as path from 'path';

export type ConflictType = 'panel_close' | 'external_main' | 'external_include' | 'presave_check' | 'watcher_failure' | 'permission_denied' | 'file_missing' | 'circular_dependency' | 'batch_conflict' | 'network_timeout' | 'crash_recovery';
export type FileType = 'main' | 'include';

export interface ConflictContext {
    type: ConflictType;
    fileType: FileType;
    filePath: string;
    fileName: string;
    hasMainUnsavedChanges: boolean;
    hasIncludeUnsavedChanges: boolean;
    hasExternalChanges?: boolean;
    changedIncludeFiles: string[];
    isClosing?: boolean;
}

export interface ConflictResolution {
    action: 'save' | 'discard_local' | 'discard_external' | 'ignore' | 'cancel' | 'backup_and_reload';
    shouldProceed: boolean;
    shouldCreateBackup: boolean;
    shouldSave: boolean;
    shouldReload: boolean;
    shouldIgnore: boolean;
    customAction?: string;
}

/**
 * Centralized conflict resolution system that handles all file change protection scenarios
 * with consistent dialogs and unified logic to prevent multiple dialog appearances.
 */
export class ConflictResolver {
    private static instance: ConflictResolver | undefined;
    private activeDialogs = new Set<string>();
    private pendingResolutions = new Map<string, Promise<ConflictResolution>>();

    protected constructor() {}

    public static getInstance(): ConflictResolver {
        if (!ConflictResolver.instance) {
            ConflictResolver.instance = new ConflictResolver();
        }
        return ConflictResolver.instance;
    }

    /**
     * Resolve a conflict with deduplication to prevent multiple dialogs
     */
    public async resolveConflict(context: ConflictContext): Promise<ConflictResolution> {
        const dialogKey = this.generateDialogKey(context);

        // Check if a dialog for this context is already active
        if (this.activeDialogs.has(dialogKey)) {
            const existing = this.pendingResolutions.get(dialogKey);
            if (existing) {
                return await existing;
            }
        }

        // Mark dialog as active and create resolution promise
        this.activeDialogs.add(dialogKey);
        const resolutionPromise = this.showConflictDialog(context);
        this.pendingResolutions.set(dialogKey, resolutionPromise);

        try {
            const resolution = await resolutionPromise;
            return resolution;
        } finally {
            // Clean up tracking
            this.activeDialogs.delete(dialogKey);
            this.pendingResolutions.delete(dialogKey);
        }
    }

    /**
     * Generate a unique key for dialog deduplication
     */
    private generateDialogKey(context: ConflictContext): string {
        const fileIdentifier = context.fileType === 'main' ? 'main' : context.filePath;
        return `${context.type}_${fileIdentifier}`;
    }

    /**
     * Show appropriate conflict dialog based on context
     */
    private async showConflictDialog(context: ConflictContext): Promise<ConflictResolution> {
        switch (context.type) {
            case 'panel_close':
                return this.showPanelCloseDialog(context);
            case 'external_main':
                return this.showExternalMainFileDialog(context);
            case 'external_include':
                return this.showExternalIncludeFileDialog(context);
            case 'presave_check':
                return this.showPresaveCheckDialog(context);
            default:
                throw new Error(`Unknown conflict type: ${context.type}`);
        }
    }

    /**
     * Panel close dialog - handles unsaved changes when panel is being closed
     */
    private async showPanelCloseDialog(context: ConflictContext): Promise<ConflictResolution> {
        let message = '';

        if (context.hasMainUnsavedChanges && context.hasIncludeUnsavedChanges) {
            message = `You have unsaved changes in "${context.fileName}" and in column include files. Do you want to save before closing?`;
        } else if (context.hasMainUnsavedChanges) {
            message = `You have unsaved changes in "${context.fileName}". Do you want to save before closing?`;
        } else if (context.hasIncludeUnsavedChanges) {
            message = `You have unsaved changes in column include files. Do you want to save before closing?`;
        } else {
            // No unsaved changes - allow close
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }

        const saveAndClose = 'Save and close';
        const closeWithoutSaving = 'Close without saving';
        const cancel = 'Cancel (Esc)';

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            saveAndClose,
            closeWithoutSaving,
            cancel
        );

        if (!choice || choice === cancel) {
            return {
                action: 'cancel',
                shouldProceed: false,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: false
            };
        }

        switch (choice) {
            case saveAndClose:
                return {
                    action: 'save',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false
                };
            case closeWithoutSaving:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            default:
                return {
                    action: 'cancel',
                    shouldProceed: false,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: false
                };
        }
    }

    /**
     * External main file change dialog
     */
    private async showExternalMainFileDialog(context: ConflictContext): Promise<ConflictResolution> {
        const hasAnyUnsavedChanges = context.hasMainUnsavedChanges || context.hasIncludeUnsavedChanges;

        if (!hasAnyUnsavedChanges) {
            // No unsaved changes - simple reload option
            const reloadFromFile = 'Reload from file';
            const ignoreExternalChanges = 'Ignore external changes';

            const choice = await vscode.window.showInformationMessage(
                `The file "${context.fileName}" has been modified externally.`,
                reloadFromFile,
                ignoreExternalChanges
            );

            if (choice === reloadFromFile) {
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            } else {
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true
                };
            }
        }

        // Has unsaved changes - full option set
        let message = `The file "${context.fileName}" has been modified externally.`;
        if (context.hasMainUnsavedChanges && context.hasIncludeUnsavedChanges) {
            message += ` Your current kanban changes and column include file changes may be lost if you reload.`;
        } else if (context.hasMainUnsavedChanges) {
            message += ` Your current kanban changes may be lost if you reload.`;
        } else {
            message += ` Your current column include file changes may be lost if you reload.`;
        }

        const discardMyChanges = 'Discard my changes and reload';
        const saveAsBackup = 'Save my changes as backup and reload';
        const saveAndIgnoreExternal = 'Save my changes and ignore external';
        const ignoreExternal = 'Ignore external changes (Esc)';

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            discardMyChanges,
            saveAsBackup,
            saveAndIgnoreExternal,
            ignoreExternal
        );

        if (!choice || choice === ignoreExternal) {
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }

        switch (choice) {
            case discardMyChanges:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            case saveAsBackup:
                return {
                    action: 'backup_and_reload',
                    shouldProceed: true,
                    shouldCreateBackup: true,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            case saveAndIgnoreExternal:
                return {
                    action: 'discard_external',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false
                };
            default:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true
                };
        }
    }

    /**
     * External include file change dialog
     */
    private async showExternalIncludeFileDialog(context: ConflictContext): Promise<ConflictResolution> {
        const hasIncludeChanges = context.hasIncludeUnsavedChanges;
        const hasExternalChanges = context.hasExternalChanges ?? true; // Default to true for safety

        if (!hasIncludeChanges && !hasExternalChanges) {
            // No unsaved changes and no external changes - nothing to do
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }

        if (!hasIncludeChanges && hasExternalChanges) {
            // External changes but no internal changes - simple reload
            return {
                action: 'discard_local',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        }

        // Has unsaved include file changes - show conflict dialog
        const discardMyChanges = 'Discard my changes and reload';
        const saveAsBackup = 'Save my changes as backup and reload';
        const saveAndIgnoreExternal = 'Save my changes and ignore external';
        const ignoreExternal = 'Ignore external changes (Esc)';

        let message: string;
        if (hasExternalChanges) {
            message = `The include file "${context.fileName}" has been modified externally. Your current kanban changes to this file may be lost if you reload.`;
        } else {
            message = `You have unsaved changes in the include file "${context.fileName}". How would you like to proceed?`;
        }

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            discardMyChanges,
            saveAsBackup,
            saveAndIgnoreExternal,
            ignoreExternal
        );

        if (!choice || choice === ignoreExternal) {
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }

        switch (choice) {
            case discardMyChanges:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            case saveAsBackup:
                return {
                    action: 'backup_and_reload',
                    shouldProceed: true,
                    shouldCreateBackup: true,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            case saveAndIgnoreExternal:
                return {
                    action: 'discard_external',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false
                };
            default:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true
                };
        }
    }

    /**
     * Pre-save check dialog - shown when about to save but external changes detected
     */
    private async showPresaveCheckDialog(context: ConflictContext): Promise<ConflictResolution> {
        const overwriteExternal = 'Overwrite external changes';
        const cancelSave = 'Cancel save';

        // Customize message based on file type
        let message: string;
        if (context.fileType === 'include') {
            message = `⚠️ CONFLICT: The include file "${context.fileName}" has been modified externally. Saving your kanban changes will overwrite these external changes.`;
        } else {
            message = `⚠️ CONFLICT: The file "${context.fileName}" has unsaved external modifications. Saving kanban changes will overwrite these external changes.`;
        }

        const choice = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            overwriteExternal,
            cancelSave
        );

        if (choice === overwriteExternal) {
            return {
                action: 'discard_external',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: true,
                shouldReload: false,
                shouldIgnore: false
            };
        } else {
            return {
                action: 'cancel',
                shouldProceed: false,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: false
            };
        }
    }

    /**
     * Clear all active dialogs (used for cleanup or reset)
     */
    public clearActiveDialogs(): void {
        this.activeDialogs.clear();
        this.pendingResolutions.clear();
    }
}