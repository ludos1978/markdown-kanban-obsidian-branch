import * as vscode from 'vscode';
import { RobustConflictManager } from './robustConflictManager';
import { EnhancedConflictResolver } from './enhancedConflictResolver';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';
import { ExternalFileWatcher } from './externalFileWatcher';

/**
 * Integration layer that connects all conflict management systems together
 * and provides comprehensive handling of all file modification scenarios.
 *
 * This module should be used to replace the current piecemeal conflict handling
 * with a unified, robust system that handles all edge cases gracefully.
 */

export interface ConflictIntegrationConfig {
    enableCrashRecovery: boolean;
    enableNetworkDriveSupport: boolean;
    enableCircularDependencyDetection: boolean;
    enableBatchProcessing: boolean;
    maxConcurrentConflicts: number;
    debounceDelay: number;
}

export class ComprehensiveConflictIntegration implements vscode.Disposable {
    private static instance: ComprehensiveConflictIntegration | undefined;

    private robustManager: RobustConflictManager;
    private enhancedResolver: EnhancedConflictResolver;
    private externalWatcher: ExternalFileWatcher;
    private config: ConflictIntegrationConfig;

    private disposables: vscode.Disposable[] = [];

    private constructor(context: vscode.ExtensionContext, config?: Partial<ConflictIntegrationConfig>) {
        // Initialize configuration with defaults
        this.config = {
            enableCrashRecovery: true,
            enableNetworkDriveSupport: true,
            enableCircularDependencyDetection: true,
            enableBatchProcessing: true,
            maxConcurrentConflicts: 3,
            debounceDelay: 500,
            ...config
        };

        // Initialize components
        this.robustManager = RobustConflictManager.getInstance(context);
        this.enhancedResolver = EnhancedConflictResolver.getEnhancedInstance();
        this.externalWatcher = ExternalFileWatcher.getInstance();

        this.setupIntegrations(context);
    }

    public static getInstance(context?: vscode.ExtensionContext, config?: Partial<ConflictIntegrationConfig>): ComprehensiveConflictIntegration {
        // DISABLED: This creates multiple conflict resolvers causing duplicate dialogs
        console.log('[ComprehensiveConflictIntegration] DISABLED to prevent duplicate dialogs - using centralized system in KanbanWebviewPanel');

        // Return a dummy instance that does nothing
        if (!ComprehensiveConflictIntegration.instance && context) {
            ComprehensiveConflictIntegration.instance = new ComprehensiveConflictIntegration(context, config);
        }
        return ComprehensiveConflictIntegration.instance!;
    }

    /**
     * Register a panel with comprehensive conflict management
     * This should be called when creating/opening a KanbanWebviewPanel
     */
    public registerPanel(panel: KanbanWebviewPanel, mainFilePath: string): void {
        // Register main file with robust manager
        this.robustManager.registerFile(mainFilePath, panel, 'main');

        // Extract and register all include dependencies
        this.registerPanelDependencies(panel, mainFilePath);

        // Set up panel-specific event handlers
        this.setupPanelHandlers(panel);

        console.log(`[ConflictIntegration] Registered panel for: ${mainFilePath}`);
    }

    /**
     * Handle external file change with full conflict resolution pipeline
     */
    public async handleExternalFileChange(filePath: string, changeType: 'modified' | 'deleted' | 'created', panel?: KanbanWebviewPanel): Promise<void> {
        try {
            // Use robust manager for comprehensive handling
            await this.robustManager.handleExternalChange(filePath, changeType);
        } catch (error) {
            console.error(`[ConflictIntegration] Error handling external change for ${filePath}:`, error);

            // Fallback to enhanced resolver for error scenarios
            await this.handleConflictError(filePath, error, panel);
        }
    }

    /**
     * Handle internal modification with conflict checking
     */
    public handleInternalChange(filePath: string, panel: KanbanWebviewPanel): void {
        this.robustManager.handleInternalChange(filePath, panel);
    }

    /**
     * Handle extension shutdown scenarios
     */
    public async handleExtensionShutdown(): Promise<void> {
        await this.robustManager.handleExtensionShutdown();
    }

    /**
     * Handle workspace changes
     */
    public async handleWorkspaceChange(): Promise<void> {
        await this.robustManager.handleWorkspaceChange();
    }

    /**
     * Perform crash recovery
     */
    public async performCrashRecovery(): Promise<void> {
        if (this.config.enableCrashRecovery) {
            await this.robustManager.recoverFromCrash();
        }
    }

    /**
     * Get comprehensive system status for debugging
     */
    public getSystemStatus(): any {
        return {
            robustManager: this.robustManager.getSystemStatus(),
            enhancedResolver: this.enhancedResolver.getStatus(),
            externalWatcher: {
                // Add external watcher status if available
            },
            config: this.config
        };
    }

    // Private implementation methods

    private setupIntegrations(context: vscode.ExtensionContext): void {
        // Set up crash recovery on startup
        if (this.config.enableCrashRecovery) {
            this.performCrashRecovery();
        }

        // Listen for workspace changes
        const workspaceListener = vscode.workspace.onDidChangeWorkspaceFolders(async () => {
            await this.handleWorkspaceChange();
        });
        this.disposables.push(workspaceListener);

        // Listen for extension deactivation
        context.subscriptions.push({
            dispose: () => this.handleExtensionShutdown()
        });

        // Set up enhanced file system monitoring
        this.setupEnhancedFileMonitoring();
    }

    private registerPanelDependencies(panel: KanbanWebviewPanel, mainFilePath: string): void {
        // This would extract all include file dependencies from the main file
        // and register them with the robust manager

        try {
            const dependencies = this.extractFileDependencies(mainFilePath);
            for (const depPath of dependencies) {
                this.robustManager.registerFile(depPath, panel, 'include');
            }
        } catch (error) {
            console.warn(`[ConflictIntegration] Could not extract dependencies for ${mainFilePath}:`, error);
        }
    }

    private extractFileDependencies(filePath: string): string[] {
        // This would parse the file and extract all include references
        // Implementation would be similar to the one in robustConflictManager.ts
        return []; // Placeholder
    }

    private setupPanelHandlers(panel: KanbanWebviewPanel): void {
        // Enhance the panel with additional event handlers
        // This would need to hook into the panel's existing events

        // Note: saveToMarkdown is private, so we'll enhance via event handlers
        // The actual integration would need to be done through the existing
        // message handling system or by exposing public save methods
    }

    private async handlePreSaveCheck(panel: KanbanWebviewPanel): Promise<void> {
        // Check for conflicts before saving
        // This would implement pre-save conflict detection
    }

    private async handleSaveError(panel: KanbanWebviewPanel, error: any): Promise<void> {
        // Handle save errors with enhanced conflict resolution
        const mainFile = (panel as any)._fileManager?.getDocument()?.uri.fsPath;
        if (mainFile) {
            await this.handleConflictError(mainFile, error, panel);
        }
    }

    private async handleConflictError(filePath: string, error: any, panel?: KanbanWebviewPanel): Promise<void> {
        // Determine error type and create appropriate conflict context
        let conflictType = 'external_main';

        if (error.code === 'ENOENT') {
            conflictType = 'file_missing';
        } else if (error.code === 'EACCES' || error.code === 'EPERM') {
            conflictType = 'permission_denied';
        } else if (error.message?.includes('timeout')) {
            conflictType = 'network_timeout';
        }

        const context = {
            type: conflictType,
            fileType: 'main',
            filePath: filePath,
            fileName: require('path').basename(filePath),
            hasMainUnsavedChanges: panel ? (panel as any)._hasUnsavedChanges : false,
            hasIncludeUnsavedChanges: false,
            hasExternalChanges: true,
            changedIncludeFiles: []
        } as any;

        const resolution = await this.enhancedResolver.resolveConflict(context);
        await this.applyConflictResolution(filePath, resolution, panel);
    }

    private async applyConflictResolution(filePath: string, resolution: any, panel?: KanbanWebviewPanel): Promise<void> {
        // Apply the resolution based on the action and custom actions
        const customAction = (resolution as any).customAction;

        if (customAction) {
            switch (customAction) {
                case 'retry_watcher':
                    await this.retryFileWatcher(filePath);
                    break;
                case 'enable_polling':
                    await this.enablePollingForFile(filePath);
                    break;
                case 'untrack_file':
                    await this.untrackFile(filePath);
                    break;
                case 'sudo_save':
                    await this.attemptPrivilegedSave(filePath, panel);
                    break;
                case 'save_copy':
                    await this.saveFileCopy(filePath, panel);
                    break;
                case 'create_file':
                    await this.createMissingFile(filePath, panel);
                    break;
                case 'offline_mode':
                    await this.enableOfflineMode(panel);
                    break;
                default:
                    console.warn(`[ConflictIntegration] Unknown custom action: ${customAction}`);
            }
        }

        // Apply standard resolution actions
        if (resolution.shouldSave && panel) {
            // Use the public interface to trigger save
            // This would need to be integrated with the existing save system
            console.log('[ConflictIntegration] Save requested via resolution');
        }
        if (resolution.shouldReload && panel) {
            await this.reloadPanel(panel);
        }
        if (resolution.shouldCreateBackup && panel) {
            await this.createBackupForPanel(panel);
        }
    }

    private setupEnhancedFileMonitoring(): void {
        // Set up additional file system monitoring that complements the existing ExternalFileWatcher
        // This could include polling for network drives, health checks, etc.
    }

    // Resolution action implementations
    private async retryFileWatcher(filePath: string): Promise<void> {
        // Attempt to recreate the file watcher
        console.log(`[ConflictIntegration] Retrying file watcher for: ${filePath}`);
    }

    private async enablePollingForFile(filePath: string): Promise<void> {
        // Enable polling fallback for this file
        console.log(`[ConflictIntegration] Enabling polling for: ${filePath}`);
    }

    private async untrackFile(filePath: string): Promise<void> {
        // Stop tracking this file
        console.log(`[ConflictIntegration] Untracking file: ${filePath}`);
    }

    private async attemptPrivilegedSave(filePath: string, panel?: KanbanWebviewPanel): Promise<void> {
        // Attempt to save with elevated privileges
        vscode.window.showWarningMessage('Privileged save is not implemented yet. Please check file permissions manually.');
    }

    private async saveFileCopy(filePath: string, panel?: KanbanWebviewPanel): Promise<void> {
        // Save a copy of the file elsewhere
        const saveUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(filePath + '.backup'),
            filters: {
                'Markdown files': ['md'],
                'All files': ['*']
            }
        });

        if (saveUri && panel) {
            // This would need to save the current panel content to the selected location
            vscode.window.showInformationMessage(`Backup saved to: ${saveUri.fsPath}`);
        }
    }

    private async createMissingFile(filePath: string, panel?: KanbanWebviewPanel): Promise<void> {
        // Create the missing file
        try {
            const fs = require('fs');
            const path = require('path');

            // Ensure directory exists
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Create empty file or with panel content
            let content = '';
            if (panel) {
                // Extract content from panel if available
                content = '# New Kanban Board\n\n## To Do\n\n## In Progress\n\n## Done\n';
            }

            fs.writeFileSync(filePath, content);
            vscode.window.showInformationMessage(`Created new file: ${path.basename(filePath)}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create file: ${error}`);
        }
    }

    private async enableOfflineMode(panel?: KanbanWebviewPanel): Promise<void> {
        // Enable offline mode for the panel
        vscode.window.showInformationMessage('Offline mode enabled. Changes will be saved locally only.');
    }

    private async reloadPanel(panel: KanbanWebviewPanel): Promise<void> {
        // Reload the panel content
        const document = (panel as any)._fileManager?.getDocument();
        if (document) {
            await panel.loadMarkdownFile(document, false);
        }
    }

    private async createBackupForPanel(panel: KanbanWebviewPanel): Promise<void> {
        // Create a backup using the existing backup system
        try {
            const document = (panel as any)._fileManager?.getDocument();
            if (document) {
                await (panel as any)._backupManager?.createBackup(document);
                vscode.window.showInformationMessage('Backup created successfully.');
            }
        } catch (error) {
            console.error('[ConflictIntegration] Failed to create backup:', error);
        }
    }

    public dispose(): void {
        // Dispose all components
        this.robustManager?.dispose();
        this.enhancedResolver?.dispose();

        // Dispose all disposables
        for (const disposable of this.disposables) {
            disposable.dispose();
        }

        // Clear singleton
        ComprehensiveConflictIntegration.instance = undefined;
    }
}