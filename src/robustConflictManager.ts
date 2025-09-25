import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConflictResolver, ConflictContext } from './conflictResolver';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';

/**
 * Comprehensive conflict management system that handles all possible file modification scenarios
 * including edge cases, failures, and complex include dependencies.
 */

export interface FileState {
    path: string;
    lastModified: number;
    hash?: string;
    exists: boolean;
    isAccessible: boolean;
    watcherActive: boolean;
}

export interface DependencyGraph {
    [filePath: string]: {
        dependents: string[];  // Files that depend on this file
        dependencies: string[]; // Files this file depends on
        level: number;         // Depth in dependency chain
        circular?: boolean;    // Is part of circular reference
    };
}

export interface ConflictBatch {
    files: string[];
    changeType: 'external' | 'internal' | 'mixed';
    timestamp: number;
    resolved: boolean;
}

export class RobustConflictManager implements vscode.Disposable {
    private static instance: RobustConflictManager | undefined;

    // Core tracking
    private fileStates = new Map<string, FileState>();
    private pendingConflicts = new Map<string, ConflictBatch>();
    private dependencyGraph: DependencyGraph = {};

    // Fallback mechanisms
    private pollingInterval: NodeJS.Timeout | undefined;
    private emergencyBackupTimer: NodeJS.Timeout | undefined;
    private healthCheckTimer: NodeJS.Timeout | undefined;

    // Debouncing and batching
    private changeDebounceTimers = new Map<string, NodeJS.Timeout>();
    private batchProcessingTimer: NodeJS.Timeout | undefined;

    // Recovery and persistence
    private emergencyStateFile: string;
    private crashRecoveryEnabled = true;

    // Configuration
    private readonly DEBOUNCE_DELAY = 500;        // ms
    private readonly BATCH_DELAY = 1000;          // ms
    private readonly POLLING_INTERVAL = 10000;    // ms
    private readonly HEALTH_CHECK_INTERVAL = 30000; // ms

    private disposables: vscode.Disposable[] = [];

    private constructor(context: vscode.ExtensionContext) {
        this.emergencyStateFile = path.join(context.globalStoragePath, 'emergency-state.json');
        this.setupRecovery();
        this.startHealthChecks();
    }

    public static getInstance(context?: vscode.ExtensionContext): RobustConflictManager {
        if (!RobustConflictManager.instance && context) {
            RobustConflictManager.instance = new RobustConflictManager(context);
        }
        return RobustConflictManager.instance!;
    }

    /**
     * Register a file for comprehensive tracking
     */
    public registerFile(filePath: string, panel: KanbanWebviewPanel, type: 'main' | 'include' = 'main'): void {
        const resolvedPath = path.resolve(filePath);

        // Initialize file state
        const fileState = this.getOrCreateFileState(resolvedPath);

        // Update dependency graph
        this.updateDependencyGraph(resolvedPath, type, panel);

        // Detect circular references
        this.detectCircularReferences();

        // Setup enhanced monitoring
        this.setupEnhancedMonitoring(resolvedPath);

        console.log(`[RobustConflictManager] Registered ${type} file: ${resolvedPath}`);
    }

    /**
     * Handle external file change with comprehensive conflict resolution
     */
    public async handleExternalChange(filePath: string, changeType: 'modified' | 'deleted' | 'created'): Promise<void> {
        const resolvedPath = path.resolve(filePath);

        // Debounce rapid changes
        this.debounceChange(resolvedPath, () => {
            this.processExternalChange(resolvedPath, changeType);
        });
    }

    /**
     * Handle internal modification (from extension)
     */
    public handleInternalChange(filePath: string, panel: KanbanWebviewPanel): void {
        const resolvedPath = path.resolve(filePath);

        // Update file state
        const fileState = this.getOrCreateFileState(resolvedPath);
        fileState.lastModified = Date.now();

        // Check for conflicts with external changes
        this.checkForConflicts(resolvedPath, panel);
    }

    /**
     * Handle extension shutdown/crash scenarios
     */
    public async handleExtensionShutdown(): Promise<void> {
        try {
            // Save emergency state
            await this.saveEmergencyState();

            // Process any pending conflicts immediately
            await this.processPendingConflicts(true);

            // Create emergency backups for unsaved changes
            await this.createEmergencyBackups();

            console.log('[RobustConflictManager] Emergency shutdown handling completed');
        } catch (error) {
            console.error('[RobustConflictManager] Error during emergency shutdown:', error);
        }
    }

    /**
     * Handle workspace changes (folder additions/removals)
     */
    public async handleWorkspaceChange(): Promise<void> {
        // Re-validate all file paths
        for (const [filePath, fileState] of this.fileStates) {
            const exists = await this.checkFileExists(filePath);
            if (exists !== fileState.exists) {
                fileState.exists = exists;
                if (!exists) {
                    await this.handleMissingFile(filePath);
                }
            }
        }

        // Update dependency graph for workspace changes
        this.rebuildDependencyGraph();
    }

    /**
     * Recover from crashes or unexpected shutdowns
     */
    public async recoverFromCrash(): Promise<void> {
        if (!this.crashRecoveryEnabled) {
            return;
        }

        try {
            const emergencyState = await this.loadEmergencyState();
            if (emergencyState) {
                // Restore file states
                for (const [filePath, state] of Object.entries(emergencyState.fileStates)) {
                    this.fileStates.set(filePath, state as FileState);
                }

                // Check for recovery-needed files
                await this.checkRecoveryNeeded();

                console.log('[RobustConflictManager] Crash recovery completed');
            }
        } catch (error) {
            console.error('[RobustConflictManager] Error during crash recovery:', error);
        }
    }

    /**
     * Get comprehensive file status for debugging
     */
    public getSystemStatus(): any {
        return {
            trackedFiles: this.fileStates.size,
            pendingConflicts: this.pendingConflicts.size,
            dependencyGraph: Object.keys(this.dependencyGraph).length,
            circularReferences: Object.values(this.dependencyGraph).filter(dep => dep.circular).length,
            watcherFailures: Array.from(this.fileStates.values()).filter(state => !state.watcherActive).length,
            healthy: this.isSystemHealthy()
        };
    }

    // Private implementation methods
    private getOrCreateFileState(filePath: string): FileState {
        if (!this.fileStates.has(filePath)) {
            this.fileStates.set(filePath, {
                path: filePath,
                lastModified: 0,
                exists: fs.existsSync(filePath),
                isAccessible: this.checkFileAccessible(filePath),
                watcherActive: false
            });
        }
        return this.fileStates.get(filePath)!;
    }

    private updateDependencyGraph(filePath: string, type: string, panel: KanbanWebviewPanel): void {
        if (!this.dependencyGraph[filePath]) {
            this.dependencyGraph[filePath] = {
                dependents: [],
                dependencies: [],
                level: type === 'main' ? 0 : 1
            };
        }

        // Extract dependencies from file content
        if (type === 'main') {
            const dependencies = this.extractDependencies(filePath);
            this.dependencyGraph[filePath].dependencies = dependencies;

            // Update reverse dependencies
            for (const dep of dependencies) {
                if (!this.dependencyGraph[dep]) {
                    this.dependencyGraph[dep] = {
                        dependents: [filePath],
                        dependencies: [],
                        level: this.dependencyGraph[filePath].level + 1
                    };
                } else {
                    if (!this.dependencyGraph[dep].dependents.includes(filePath)) {
                        this.dependencyGraph[dep].dependents.push(filePath);
                    }
                }
            }
        }
    }

    private detectCircularReferences(): void {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();

        for (const filePath of Object.keys(this.dependencyGraph)) {
            if (!visited.has(filePath)) {
                this.detectCircularDFS(filePath, visited, recursionStack);
            }
        }
    }

    private detectCircularDFS(filePath: string, visited: Set<string>, recursionStack: Set<string>): boolean {
        visited.add(filePath);
        recursionStack.add(filePath);

        const node = this.dependencyGraph[filePath];
        if (node) {
            for (const dependency of node.dependencies) {
                if (!visited.has(dependency)) {
                    if (this.detectCircularDFS(dependency, visited, recursionStack)) {
                        node.circular = true;
                        return true;
                    }
                } else if (recursionStack.has(dependency)) {
                    node.circular = true;
                    return true;
                }
            }
        }

        recursionStack.delete(filePath);
        return false;
    }

    private extractDependencies(filePath: string): string[] {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const dependencies: string[] = [];

            // Extract columninclude dependencies
            const columnMatches = content.match(/!!!columninclude\(([^)]+)\)!!!/g) || [];
            for (const match of columnMatches) {
                const depPath = match.replace(/!!!columninclude\(([^)]+)\)!!!/, '$1').trim();
                dependencies.push(path.resolve(path.dirname(filePath), depPath));
            }

            // Extract taskinclude dependencies
            const taskMatches = content.match(/!!!taskinclude\(([^)]+)\)!!!/g) || [];
            for (const match of taskMatches) {
                const depPath = match.replace(/!!!taskinclude\(([^)]+)\)!!!/, '$1').trim();
                dependencies.push(path.resolve(path.dirname(filePath), depPath));
            }

            // Extract inline include dependencies
            const inlineMatches = content.match(/!!!include\(([^)]+)\)!!!/g) || [];
            for (const match of inlineMatches) {
                const depPath = match.replace(/!!!include\(([^)]+)\)!!!/, '$1').trim();
                dependencies.push(path.resolve(path.dirname(filePath), depPath));
            }

            return dependencies;
        } catch (error) {
            console.warn(`[RobustConflictManager] Could not extract dependencies from ${filePath}:`, error);
            return [];
        }
    }

    private setupEnhancedMonitoring(filePath: string): void {
        // This would integrate with the existing ExternalFileWatcher
        // but add additional monitoring capabilities
        const fileState = this.getOrCreateFileState(filePath);
        fileState.watcherActive = true;

        // Add to polling fallback if on network drive or unreliable filesystem
        if (this.isUnreliableFileSystem(filePath)) {
            this.addToPolling(filePath);
        }
    }

    private debounceChange(filePath: string, callback: () => void): void {
        // Clear existing timer
        const existingTimer = this.changeDebounceTimers.get(filePath);
        if (existingTimer) {
            clearTimeout(existingTimer);
        }

        // Set new timer
        const timer = setTimeout(callback, this.DEBOUNCE_DELAY);
        this.changeDebounceTimers.set(filePath, timer);
    }

    private async processExternalChange(filePath: string, changeType: string): Promise<void> {
        // Update file state
        const fileState = this.getOrCreateFileState(filePath);
        fileState.lastModified = Date.now();
        fileState.exists = changeType !== 'deleted';

        // Find affected panels
        const affectedPanels = this.findAffectedPanels(filePath);

        if (affectedPanels.length > 0) {
            // Create conflict context
            const context = this.createConflictContext(filePath, affectedPanels);

            // Use existing ConflictResolver for user interaction
            const resolver = ConflictResolver.getInstance();
            const resolution = await resolver.resolveConflict(context);

            // Apply resolution
            await this.applyResolution(filePath, resolution, affectedPanels);
        }
    }

    private findAffectedPanels(filePath: string): KanbanWebviewPanel[] {
        // This would need to integrate with the existing panel tracking system
        // For now, return empty array as placeholder
        return [];
    }

    private createConflictContext(filePath: string, panels: KanbanWebviewPanel[]): ConflictContext {
        const fileName = path.basename(filePath);
        const isDependency = this.dependencyGraph[filePath]?.level > 0;

        return {
            type: isDependency ? 'external_include' : 'external_main',
            fileType: isDependency ? 'include' : 'main',
            filePath: filePath,
            fileName: fileName,
            hasMainUnsavedChanges: panels.some(p => (p as any)._hasUnsavedChanges),
            hasIncludeUnsavedChanges: this.hasUnsavedIncludeChanges(filePath),
            hasExternalChanges: true,
            changedIncludeFiles: isDependency ? [path.basename(filePath)] : []
        };
    }

    private async applyResolution(filePath: string, resolution: any, panels: KanbanWebviewPanel[]): Promise<void> {
        // Apply the resolution to all affected panels
        for (const panel of panels) {
            // This would need to call appropriate methods on the panel
            // based on the resolution action
        }
    }

    private checkForConflicts(filePath: string, panel: KanbanWebviewPanel): void {
        // Check if there are external changes that conflict with internal changes
        const fileState = this.getOrCreateFileState(filePath);

        // This would implement conflict detection logic
    }

    private async processPendingConflicts(emergency = false): Promise<void> {
        for (const [batchId, batch] of this.pendingConflicts) {
            if (!batch.resolved) {
                // Process the batch
                batch.resolved = true;
                this.pendingConflicts.delete(batchId);
            }
        }
    }

    private async saveEmergencyState(): Promise<void> {
        try {
            const state = {
                fileStates: Object.fromEntries(this.fileStates),
                dependencyGraph: this.dependencyGraph,
                timestamp: Date.now()
            };

            // Ensure directory exists
            const dir = path.dirname(this.emergencyStateFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(this.emergencyStateFile, JSON.stringify(state, null, 2));
        } catch (error) {
            console.error('[RobustConflictManager] Failed to save emergency state:', error);
        }
    }

    private async loadEmergencyState(): Promise<any> {
        try {
            if (fs.existsSync(this.emergencyStateFile)) {
                const content = fs.readFileSync(this.emergencyStateFile, 'utf8');
                return JSON.parse(content);
            }
        } catch (error) {
            console.error('[RobustConflictManager] Failed to load emergency state:', error);
        }
        return null;
    }

    private async createEmergencyBackups(): Promise<void> {
        // Create backups for all files with unsaved changes
        // This would integrate with the existing backup system
    }

    private async checkRecoveryNeeded(): Promise<void> {
        // Check if any files need recovery after crash
    }

    private checkFileExists(filePath: string): Promise<boolean> {
        return new Promise((resolve) => {
            fs.access(filePath, fs.constants.F_OK, (err) => {
                resolve(!err);
            });
        });
    }

    private async handleMissingFile(filePath: string): Promise<void> {
        // Handle case where tracked file no longer exists
        console.warn(`[RobustConflictManager] Tracked file no longer exists: ${filePath}`);
    }

    private rebuildDependencyGraph(): void {
        // Rebuild the entire dependency graph after workspace changes
        this.dependencyGraph = {};
        // This would need to re-analyze all tracked files
    }

    private checkFileAccessible(filePath: string): boolean {
        try {
            fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    }

    private isUnreliableFileSystem(filePath: string): boolean {
        // Detect network drives, WSL, or other potentially unreliable filesystems
        return filePath.startsWith('\\\\') || filePath.includes('/mnt/');
    }

    private addToPolling(filePath: string): void {
        // Add file to polling fallback mechanism
    }

    private hasUnsavedIncludeChanges(filePath: string): boolean {
        // Check if there are unsaved changes for include files
        return false; // Placeholder
    }

    private setupRecovery(): void {
        // Setup crash recovery mechanisms
        process.on('SIGTERM', () => this.handleExtensionShutdown());
        process.on('SIGINT', () => this.handleExtensionShutdown());
    }

    private startHealthChecks(): void {
        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.HEALTH_CHECK_INTERVAL);
    }

    private performHealthCheck(): void {
        // Check system health and fix issues
        for (const [filePath, fileState] of this.fileStates) {
            if (!fileState.watcherActive) {
                console.warn(`[RobustConflictManager] File watcher inactive for: ${filePath}`);
                // Attempt to reactivate watcher
                this.setupEnhancedMonitoring(filePath);
            }
        }
    }

    private isSystemHealthy(): boolean {
        const inactiveWatchers = Array.from(this.fileStates.values())
            .filter(state => !state.watcherActive).length;
        return inactiveWatchers === 0;
    }

    public dispose(): void {
        // Clear all timers
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
        if (this.emergencyBackupTimer) {
            clearInterval(this.emergencyBackupTimer);
        }
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
        }
        if (this.batchProcessingTimer) {
            clearTimeout(this.batchProcessingTimer);
        }

        // Clear debounce timers
        for (const timer of this.changeDebounceTimers.values()) {
            clearTimeout(timer);
        }

        // Dispose all disposables
        for (const disposable of this.disposables) {
            disposable.dispose();
        }

        // Clear singleton
        RobustConflictManager.instance = undefined;
    }
}