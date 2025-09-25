import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConflictResolver, ConflictContext, ConflictResolution } from './conflictResolver';

/**
 * Enhanced conflict resolver that extends the base resolver with additional
 * scenarios and more robust handling of edge cases.
 */
export class EnhancedConflictResolver extends ConflictResolver {
    private static enhancedInstance: EnhancedConflictResolver | undefined;

    // Enhanced conflict types
    public static readonly CONFLICT_TYPES = {
        ...['panel_close', 'external_main', 'external_include', 'presave_check'],
        WATCHER_FAILURE: 'watcher_failure',
        PERMISSION_DENIED: 'permission_denied',
        FILE_MISSING: 'file_missing',
        CIRCULAR_DEPENDENCY: 'circular_dependency',
        BATCH_CONFLICT: 'batch_conflict',
        NETWORK_TIMEOUT: 'network_timeout',
        CRASH_RECOVERY: 'crash_recovery'
    } as const;

    private activeConflictCount = 0;
    private maxConcurrentConflicts = 3;
    private conflictQueue: ConflictContext[] = [];

    public static getEnhancedInstance(): EnhancedConflictResolver {
        if (!EnhancedConflictResolver.enhancedInstance) {
            EnhancedConflictResolver.enhancedInstance = new EnhancedConflictResolver();
        }
        return EnhancedConflictResolver.enhancedInstance!;
    }

    /**
     * Enhanced conflict resolution with queue management and batch processing
     */
    public async resolveConflict(context: ConflictContext): Promise<ConflictResolution> {
        // Check if we're at max concurrent conflicts
        if (this.activeConflictCount >= this.maxConcurrentConflicts) {
            // Queue the conflict for later processing
            return new Promise<ConflictResolution>((resolve) => {
                const queuedContext = { ...context } as any;
                queuedContext.resolve = resolve;
                this.conflictQueue.push(queuedContext);
            });
        }

        this.activeConflictCount++;

        try {
            // Handle enhanced conflict types
            if (this.isEnhancedConflictType(context.type)) {
                return await this.handleEnhancedConflict(context);
            }

            // Delegate to base resolver for standard conflicts
            return await super.resolveConflict(context);
        } finally {
            this.activeConflictCount--;
            this.processQueue();
        }
    }

    /**
     * Handle file watcher failure scenarios
     */
    private async handleWatcherFailure(context: ConflictContext): Promise<ConflictResolution> {
        const retryWatcher = 'Retry File Watcher';
        const usePolling = 'Use Polling Fallback';
        const ignoreFile = 'Stop Tracking This File';

        const choice = await vscode.window.showWarningMessage(
            `File watcher failed for "${context.fileName}". External changes may not be detected automatically.`,
            { modal: true },
            retryWatcher,
            usePolling,
            ignoreFile
        );

        switch (choice) {
            case retryWatcher:
                return {
                    action: 'discard_external',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'retry_watcher'
                } as any;

            case usePolling:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true,
                    customAction: 'enable_polling'
                } as any;

            case ignoreFile:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true,
                    customAction: 'untrack_file'
                } as any;

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Handle permission denied scenarios
     */
    private async handlePermissionDenied(context: ConflictContext): Promise<ConflictResolution> {
        const retryWithSudo = 'Retry as Administrator';
        const saveElsewhere = 'Save Copy Elsewhere';
        const viewOnly = 'Continue Read-Only';

        let message = `Permission denied when accessing "${context.fileName}".`;
        if (context.type === 'presave_check') {
            message = `Cannot save "${context.fileName}" due to permission restrictions.`;
        }

        const choice = await vscode.window.showErrorMessage(
            message,
            { modal: true },
            retryWithSudo,
            saveElsewhere,
            viewOnly
        );

        switch (choice) {
            case retryWithSudo:
                return {
                    action: 'save',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'sudo_save'
                } as any;

            case saveElsewhere:
                return {
                    action: 'backup_and_reload',
                    shouldProceed: true,
                    shouldCreateBackup: true,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'save_copy'
                } as any;

            case viewOnly:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true,
                    customAction: 'read_only_mode'
                } as any;

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Handle missing file scenarios
     */
    private async handleFileMissing(context: ConflictContext): Promise<ConflictResolution> {
        const recreateFile = 'Create New File';
        const findAlternative = 'Choose Alternative File';
        const removeReference = 'Remove Reference';

        const choice = await vscode.window.showWarningMessage(
            `The file "${context.fileName}" no longer exists. It may have been moved or deleted.`,
            { modal: true },
            recreateFile,
            findAlternative,
            removeReference
        );

        switch (choice) {
            case recreateFile:
                return {
                    action: 'save',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'create_file'
                } as any;

            case findAlternative:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false,
                    customAction: 'choose_alternative'
                } as any;

            case removeReference:
                return {
                    action: 'save',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'remove_reference'
                } as any;

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Handle circular dependency scenarios
     */
    private async handleCircularDependency(context: ConflictContext): Promise<ConflictResolution> {
        const breakCircle = 'Break Circular Reference';
        const ignoreCircular = 'Ignore (May Cause Issues)';
        const viewDependencies = 'View Dependency Graph';

        const choice = await vscode.window.showWarningMessage(
            `Circular dependency detected involving "${context.fileName}". This may cause infinite loops or unexpected behavior.`,
            { modal: true },
            breakCircle,
            viewDependencies,
            ignoreCircular
        );

        switch (choice) {
            case breakCircle:
                return {
                    action: 'save',
                    shouldProceed: true,
                    shouldCreateBackup: true,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'break_circular'
                } as any;

            case viewDependencies:
                return {
                    action: 'ignore',
                    shouldProceed: false,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true,
                    customAction: 'show_dependencies'
                } as any;

            case ignoreCircular:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true
                };

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Handle batch conflicts (multiple files changing simultaneously)
     */
    private async handleBatchConflict(context: ConflictContext): Promise<ConflictResolution> {
        const files = context.changedIncludeFiles.length;
        const processAll = 'Process All Changes';
        const processSelectively = 'Choose Files to Process';
        const ignoreAll = 'Ignore All Changes';

        const choice = await vscode.window.showWarningMessage(
            `Multiple files have changed (${files} files). How would you like to handle these changes?`,
            { modal: true },
            processAll,
            processSelectively,
            ignoreAll
        );

        switch (choice) {
            case processAll:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: true,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false,
                    customAction: 'batch_process_all'
                } as any;

            case processSelectively:
                return {
                    action: 'ignore',
                    shouldProceed: false,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'batch_select'
                } as any;

            case ignoreAll:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true
                };

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Handle network timeout scenarios
     */
    private async handleNetworkTimeout(context: ConflictContext): Promise<ConflictResolution> {
        const retryOperation = 'Retry';
        const useLocal = 'Use Local Version';
        const workOffline = 'Work Offline';

        const choice = await vscode.window.showWarningMessage(
            `Network timeout while accessing "${context.fileName}". The file may be on a slow network drive.`,
            { modal: true },
            retryOperation,
            useLocal,
            workOffline
        );

        switch (choice) {
            case retryOperation:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false,
                    customAction: 'retry_network'
                } as any;

            case useLocal:
                return {
                    action: 'save',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false
                };

            case workOffline:
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true,
                    customAction: 'offline_mode'
                } as any;

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Handle crash recovery scenarios
     */
    private async handleCrashRecovery(context: ConflictContext): Promise<ConflictResolution> {
        const recoverAll = 'Recover All Changes';
        const recoverSelective = 'Choose What to Recover';
        const startFresh = 'Start Fresh';

        const choice = await vscode.window.showInformationMessage(
            `The extension detected unsaved changes from a previous session. Would you like to recover them?`,
            { modal: true },
            recoverAll,
            recoverSelective,
            startFresh
        );

        switch (choice) {
            case recoverAll:
                return {
                    action: 'discard_external',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: true,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'recover_all'
                } as any;

            case recoverSelective:
                return {
                    action: 'ignore',
                    shouldProceed: false,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: false,
                    customAction: 'recover_selective'
                } as any;

            case startFresh:
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false,
                    customAction: 'clear_recovery'
                } as any;

            default:
                return this.createCancelResolution();
        }
    }

    /**
     * Enhanced conflict handler dispatcher
     */
    private async handleEnhancedConflict(context: ConflictContext): Promise<ConflictResolution> {
        switch (context.type) {
            case 'watcher_failure':
                return await this.handleWatcherFailure(context);

            case 'permission_denied':
                return await this.handlePermissionDenied(context);

            case 'file_missing':
                return await this.handleFileMissing(context);

            case 'circular_dependency':
                return await this.handleCircularDependency(context);

            case 'batch_conflict':
                return await this.handleBatchConflict(context);

            case 'network_timeout':
                return await this.handleNetworkTimeout(context);

            case 'crash_recovery':
                return await this.handleCrashRecovery(context);

            default:
                // Fallback to base resolver
                return await super.resolveConflict(context);
        }
    }

    private isEnhancedConflictType(type: string): boolean {
        return Object.values(EnhancedConflictResolver.CONFLICT_TYPES).includes(type as any);
    }

    private createCancelResolution(): ConflictResolution {
        return {
            action: 'cancel',
            shouldProceed: false,
            shouldCreateBackup: false,
            shouldSave: false,
            shouldReload: false,
            shouldIgnore: false
        };
    }

    private processQueue(): void {
        if (this.conflictQueue.length > 0 && this.activeConflictCount < this.maxConcurrentConflicts) {
            const nextConflict = this.conflictQueue.shift();
            if (nextConflict) {
                const resolve = (nextConflict as any).resolve;
                delete (nextConflict as any).resolve;
                this.resolveConflict(nextConflict).then(resolve);
            }
        }
    }

    /**
     * Clear the conflict queue (useful for emergency shutdown)
     */
    public clearQueue(): void {
        this.conflictQueue = [];
        this.activeConflictCount = 0;
    }

    /**
     * Get system status for debugging
     */
    public getStatus(): any {
        return {
            activeConflicts: this.activeConflictCount,
            queuedConflicts: this.conflictQueue.length,
            maxConcurrent: this.maxConcurrentConflicts
        };
    }

    public dispose(): void {
        this.clearQueue();
        super.clearActiveDialogs();
        EnhancedConflictResolver.enhancedInstance = undefined;
    }
}