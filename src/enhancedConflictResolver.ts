import * as vscode from 'vscode';
import * as path from 'path';
import { ConflictResolver, ConflictContext, ConflictResolution } from './conflictResolver';

/**
 * Enhanced conflict resolver that extends the base resolver with additional
 * scenarios and more robust handling of edge cases.
 *
 * DISABLED: To prevent duplicate dialogs - using centralized system instead
 */
export class EnhancedConflictResolver extends ConflictResolver {
    private static enhancedInstance: EnhancedConflictResolver | undefined;

    // Enhanced conflict types
    public static readonly CONFLICT_TYPES = {
        WATCHER_FAILURE: 'watcher_failure',
        MISSING_FILE: 'missing_file',
        CIRCULAR_DEPENDENCY: 'circular_dependency',
        BATCH_CONFLICTS: 'batch_conflicts',
        NETWORK_TIMEOUT: 'network_timeout',
        RECOVERY_NEEDED: 'recovery_needed'
    };

    // Queue management for batch processing
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
     * Enhanced conflict resolution - DISABLED to prevent duplicate dialogs
     * Using centralized dialog system in KanbanWebviewPanel instead
     */
    public async resolveConflict(context: ConflictContext): Promise<ConflictResolution> {
        console.log('[EnhancedConflictResolver] DISABLED - skipping dialog to prevent duplicates');
        console.log('Context type:', context.type, 'File:', context.fileName);

        // Return a default "ignore" resolution to prevent any action
        return {
            action: 'ignore',
            shouldProceed: false,
            shouldSave: false,
            shouldReload: false,
            shouldCreateBackup: false,
            shouldIgnore: true
        };
    }

    /**
     * All enhanced methods disabled to prevent duplicate dialogs
     */

    public clearQueue(): void {
        this.conflictQueue = [];
        this.activeConflictCount = 0;
    }

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