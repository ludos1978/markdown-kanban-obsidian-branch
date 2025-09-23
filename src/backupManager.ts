import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { configService } from './configurationService';

export interface BackupOptions {
    label?: string;           // 'backup', 'conflict', etc.
    forceCreate?: boolean;    // Skip time/content checks
    minIntervalMinutes?: number;  // Minimum time since last backup
}

export class BackupManager {
    private _backupTimer: NodeJS.Timer | null = null;
    private _lastBackupTime: Date | null = null;
    private _lastContentHash: string | null = null;
    private _lastUnsavedChangeTime: Date | null = null;

    constructor() {}

    /**
     * Mark when unsaved changes occurred (for page hidden logic)
     */
    public markUnsavedChanges(): void {
        this._lastUnsavedChangeTime = new Date();
    }

    /**
     * Check if enough time has passed since unsaved changes for page hidden backup
     */
    public shouldCreatePageHiddenBackup(): boolean {
        if (!this._lastUnsavedChangeTime) {
            return false;
        }

        const now = new Date();
        const timeSinceUnsaved = now.getTime() - this._lastUnsavedChangeTime.getTime();
        const fiveMinutesMs = 5 * 60 * 1000;

        return timeSinceUnsaved >= fiveMinutesMs;
    }

    /**
     * Create a backup of the given document
     */
    public async createBackup(document: vscode.TextDocument, options: BackupOptions = {}): Promise<boolean> {
        try {
            const enableBackups = configService.getConfig('enableBackups');
            const defaultIntervalMinutes = configService.getConfig('backupInterval', 15);

            if (!enableBackups && !options.forceCreate) {
                return false;
            }

            const now = new Date();
            const intervalMinutes = options.minIntervalMinutes ?? defaultIntervalMinutes;

            // Check if enough time has passed since last backup (unless forced)
            if (!options.forceCreate && this._lastBackupTime) {
                const timeSinceLastBackup = now.getTime() - this._lastBackupTime.getTime();
                const intervalMs = intervalMinutes * 60 * 1000;

                if (timeSinceLastBackup < intervalMs) {
                    return false;
                }
            }

            const content = document.getText();
            const contentHash = this.hashContent(content);

            // Skip backup if content hasn't changed (unless forced)
            if (!options.forceCreate && this._lastContentHash === contentHash) {
                return false;
            }

            const backupPath = this.generateBackupPath(document, options.label || 'backup');
            
            // Ensure backup directory exists
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Write backup file
            fs.writeFileSync(backupPath, content, 'utf8');

            // Set hidden attribute on Windows
            await this.setFileHidden(backupPath);

            this._lastBackupTime = new Date();
            this._lastContentHash = contentHash;

            console.log(`✅ Backup created: ${backupPath} (Label: ${options.label || 'backup'}, Forced: ${options.forceCreate || false})`);
            
            // Clean up old backups
            await this.cleanupOldBackups(document);
            
            return true;
        } catch (error) {
            console.error('Failed to create backup:', error);
            vscode.window.showWarningMessage(`Failed to create backup: ${error}`);
            return false;
        }
    }

    /**
     * Generate backup file path
     */
    private generateBackupPath(document: vscode.TextDocument, label: string = 'backup'): string {
        const originalPath = document.uri.fsPath;
        const dir = path.dirname(originalPath);
        const basename = path.basename(originalPath, '.md');

        // Generate timestamp in format: YYYYMMDDTHHmmss
        const now = new Date();
        const timestamp = this.formatTimestamp(now);

        const backupLocation = configService.getConfig('backupLocation', 'same-folder');

        let backupDir = dir;

        if (backupLocation === 'workspace-folder') {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                backupDir = path.join(workspaceFolder.uri.fsPath, '.kanban-backups');
            }
        }

        // All automatically generated files should be hidden
        const prefix = '.';
        const backupFileName = `${prefix}${basename}-${label}-${timestamp}.md`;

        return path.join(backupDir, backupFileName);
    }

    /**
     * Create a backup of an arbitrary file (for include files)
     */
    public async createFileBackup(filePath: string, content: string, options: BackupOptions = {}): Promise<string | null> {
        try {
            const enableBackups = configService.getConfig('enableBackups');

            if (!enableBackups && !options.forceCreate) {
                return null;
            }

            const contentHash = this.hashContent(content);

            // For include files, we'll create a backup if content changes or force is requested
            if (!options.forceCreate) {
                // Read existing file to compare content
                try {
                    const existingContent = fs.readFileSync(filePath, 'utf8');
                    const existingHash = this.hashContent(existingContent);
                    if (existingHash === contentHash) {
                        return null; // Content hasn't changed
                    }
                } catch (error) {
                    // File might not exist yet, proceed with backup
                }
            }

            const backupPath = this.generateFileBackupPath(filePath, options.label || 'backup');

            // Ensure backup directory exists
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Read current file content for backup (before overwriting)
            let backupContent = '';
            try {
                backupContent = fs.readFileSync(filePath, 'utf8');
            } catch (error) {
                return null; // No existing file to backup
            }

            // Write backup file with current content
            fs.writeFileSync(backupPath, backupContent, 'utf8');

            // Set hidden attribute on Windows
            await this.setFileHidden(backupPath);

            // console.log(`Include file backup created: ${backupPath}`);
            return backupPath;

        } catch (error) {
            console.error('Error creating file backup:', error);
            return null;
        }
    }

    /**
     * Generate backup path for arbitrary files
     */
    private generateFileBackupPath(filePath: string, label: string = 'backup'): string {
        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const basename = path.basename(filePath, ext);

        // Generate timestamp in format: YYYYMMDDTHHmmss
        const now = new Date();
        const timestamp = this.formatTimestamp(now);

        const backupLocation = configService.getConfig('backupLocation', 'same-folder');

        let backupDir = dir;

        if (backupLocation === 'workspace-folder') {
            // Try to find workspace folder for this file
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
            if (workspaceFolder) {
                backupDir = path.join(workspaceFolder.uri.fsPath, '.kanban-backups');
            }
        }

        // All automatically generated files should be hidden
        const prefix = '.';
        const backupFileName = `${prefix}${basename}-${label}-${timestamp}${ext}`;

        return path.join(backupDir, backupFileName);
    }

    /**
     * Format timestamp as YYYYMMDDTHHmmss
     */
    private formatTimestamp(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        return `${year}${month}${day}T${hours}${minutes}${seconds}`;
    }

    /**
     * Simple hash function to detect content changes
     */
    private hashContent(content: string): string {
        let hash = 0;
        for (let i = 0; i < content.length; i++) {
            const char = content.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32bit integer
        }
        return hash.toString(36);
    }

    /**
     * Clean up old backups beyond the configured maximum
     */
    private async cleanupOldBackups(document: vscode.TextDocument): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('markdown-kanban');
            const maxBackups = config.get<number>('maxBackupsPerFile', 10);
            const backupLocation = config.get<string>('backupLocation', 'same-folder');

            const originalPath = document.uri.fsPath;
            const basename = path.basename(originalPath, '.md');

            // Determine backup directory (same logic as generateBackupPath)
            let backupDir = path.dirname(originalPath);
            if (backupLocation === 'workspace-folder') {
                const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
                if (workspaceFolder) {
                    backupDir = path.join(workspaceFolder.uri.fsPath, '.kanban-backups');
                }
            }

            // Check if backup directory exists
            if (!fs.existsSync(backupDir)) {
                return;
            }

            // Find backup and auto files for this document (excluding conflicts which should be preserved)
            // Pattern matches: .basename-(backup|auto)-YYYYMMDDTHHmmss.md
            const backupPattern = new RegExp(`^\\.${basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(backup|auto)-\\d{8}T\\d{6}\\.md$`);

            const files = fs.readdirSync(backupDir);
            const backupFiles = files
                .filter(file => backupPattern.test(file))
                .map(file => ({
                    name: file,
                    path: path.join(backupDir, file),
                    stats: fs.statSync(path.join(backupDir, file))
                }))
                .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Sort by modification time, newest first

            // Delete old backups if we exceed the maximum
            if (backupFiles.length > maxBackups) {
                const filesToDelete = backupFiles.slice(maxBackups);

                for (const file of filesToDelete) {
                    try {
                        fs.unlinkSync(file.path);
                        // console.log(`Deleted old backup: ${file.name}`);
                    } catch (error) {
                        console.error(`Failed to delete backup ${file.name}:`, error);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to cleanup old backups:', error);
        }
    }

    /**
     * Start periodic backup timer
     */
    public startPeriodicBackup(document: vscode.TextDocument): void {
        this.stopPeriodicBackup();
        
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const enableBackups = config.get<boolean>('enableBackups', true);
        const intervalMinutes = config.get<number>('backupInterval', 15);
        
        if (!enableBackups) {
            return;
        }
        
        // Convert minutes to milliseconds
        const intervalMs = intervalMinutes * 60 * 1000;
        
        this._backupTimer = setInterval(async () => {
            await this.createBackup(document);
        }, intervalMs);
    }

    /**
     * Stop periodic backup timer
     */
    public stopPeriodicBackup(): void {
        if (this._backupTimer) {
            clearInterval(this._backupTimer);
            this._backupTimer = null;
        }
    }

    /**
     * Get list of available backups for a document
     */
    public getBackupList(document: vscode.TextDocument): Array<{name: string, path: string, date: Date}> {
        try {
            const originalPath = document.uri.fsPath;
            const dir = path.dirname(originalPath);
            const basename = path.basename(originalPath, '.md');
            
            const backupPattern = new RegExp(`^\\.${basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(backup|auto)-(\\d{8}T\\d{6})\\.md$`);
            
            const files = fs.readdirSync(dir);
            const backups = files
                .filter(file => backupPattern.test(file))
                .map(file => {
                    const match = file.match(backupPattern);
                    if (!match) {return null;}

                    const backupType = match[1]; // backup or auto
                    const timestamp = match[2]; // YYYYMMDDTHHmmss

                    // Parse date from timestamp
                    const year = parseInt(timestamp.substring(0, 4));
                    const month = parseInt(timestamp.substring(4, 6)) - 1;
                    const day = parseInt(timestamp.substring(6, 8));
                    const hours = parseInt(timestamp.substring(9, 11)); // Skip 'T'
                    const minutes = parseInt(timestamp.substring(11, 13));
                    const seconds = parseInt(timestamp.substring(13, 15));

                    const date = new Date(year, month, day, hours, minutes, seconds);
                    
                    return {
                        name: file,
                        path: path.join(dir, file),
                        date: date
                    };
                })
                .filter(item => item !== null)
                .sort((a, b) => b!.date.getTime() - a!.date.getTime());
            
            return backups as Array<{name: string, path: string, date: Date}>;
        } catch (error) {
            console.error('Failed to get backup list:', error);
            return [];
        }
    }

    /**
     * Restore from a backup file
     */
    public async restoreFromBackup(backupPath: string, targetDocument: vscode.TextDocument): Promise<boolean> {
        try {
            const backupContent = fs.readFileSync(backupPath, 'utf8');
            
            const edit = new vscode.WorkspaceEdit();
            edit.replace(
                targetDocument.uri,
                new vscode.Range(0, 0, targetDocument.lineCount, 0),
                backupContent
            );
            
            const success = await vscode.workspace.applyEdit(edit);
            
            if (success) {
                await targetDocument.save();
                vscode.window.showInformationMessage('Successfully restored from backup');
            }
            
            return success;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to restore from backup: ${error}`);
            return false;
        }
    }

    /**
     * Set file as hidden on Windows using attrib command
     * On Unix systems, files starting with . are already hidden
     */
    private async setFileHidden(filePath: string): Promise<void> {
        try {
            // Only need to set hidden attribute on Windows
            if (process.platform === 'win32') {
                const { exec } = await import('child_process');
                const util = await import('util');
                const execPromise = util.promisify(exec);

                try {
                    await execPromise(`attrib +H "${filePath}"`);
                } catch (error) {
                    // Silently fail if attrib command fails
                    // The . prefix will still make it hidden in most file managers
                    console.debug(`Failed to set hidden attribute for ${filePath}:`, error);
                }
            }
        } catch (error) {
            // Silently fail - file is still created with . prefix
            console.debug(`Error setting file hidden:`, error);
        }
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        this.stopPeriodicBackup();
    }
}