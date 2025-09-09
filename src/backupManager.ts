import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class BackupManager {
    private _backupTimer: NodeJS.Timer | null = null;
    private _lastBackupTime: Date | null = null;
    private _lastContentHash: string | null = null;

    constructor() {}

    /**
     * Create a backup of the given document
     */
    public async createBackup(document: vscode.TextDocument): Promise<boolean> {
        try {
            const config = vscode.workspace.getConfiguration('markdown-kanban');
            const enableBackups = config.get<boolean>('enableBackups', true);
            const intervalMinutes = config.get<number>('backupInterval', 15);
            
            if (!enableBackups) {
                return false;
            }

            // Check if enough time has passed since last backup
            if (this._lastBackupTime) {
                const now = new Date();
                const timeSinceLastBackup = now.getTime() - this._lastBackupTime.getTime();
                const intervalMs = intervalMinutes * 60 * 1000;
                
                if (timeSinceLastBackup < intervalMs) {
                    return false;
                }
            }

            const content = document.getText();
            const contentHash = this.hashContent(content);
            
            // Skip backup if content hasn't changed
            if (this._lastContentHash === contentHash) {
                return false;
            }

            const backupPath = this.generateBackupPath(document);
            
            // Ensure backup directory exists
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }

            // Write backup file
            fs.writeFileSync(backupPath, content, 'utf8');
            
            this._lastBackupTime = new Date();
            this._lastContentHash = contentHash;
            
            console.log(`Backup created: ${backupPath}`);
            
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
    private generateBackupPath(document: vscode.TextDocument): string {
        const originalPath = document.uri.fsPath;
        const dir = path.dirname(originalPath);
        const basename = path.basename(originalPath, '.md');
        
        // Generate timestamp in format: 20250902-2349
        const now = new Date();
        const timestamp = this.formatTimestamp(now);
        
        const config = vscode.workspace.getConfiguration('markdown-kanban');
        const backupLocation = config.get<string>('backupLocation', 'same-folder');
        
        let backupDir = dir;
        
        if (backupLocation === 'workspace-folder') {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                backupDir = path.join(workspaceFolder.uri.fsPath, '.kanban-backups');
            }
        }
        
        // Hidden file with . prefix
        const backupFileName = `.${basename}-backup-${timestamp}.md`;
        
        return path.join(backupDir, backupFileName);
    }

    /**
     * Format timestamp as YYYYMMDD-HHMM
     */
    private formatTimestamp(date: Date): string {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        
        return `${year}${month}${day}-${hours}${minutes}`;
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
            
            const originalPath = document.uri.fsPath;
            const dir = path.dirname(originalPath);
            const basename = path.basename(originalPath, '.md');
            
            // Find all backup files for this document
            const backupPattern = new RegExp(`^\\.${basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-backup-\\d{8}-\\d{4}\\.md$`);
            
            const files = fs.readdirSync(dir);
            const backupFiles = files
                .filter(file => backupPattern.test(file))
                .map(file => ({
                    name: file,
                    path: path.join(dir, file),
                    stats: fs.statSync(path.join(dir, file))
                }))
                .sort((a, b) => b.stats.mtime.getTime() - a.stats.mtime.getTime()); // Sort by modification time, newest first
            
            // Delete old backups if we exceed the maximum
            if (backupFiles.length > maxBackups) {
                const filesToDelete = backupFiles.slice(maxBackups);
                
                for (const file of filesToDelete) {
                    try {
                        fs.unlinkSync(file.path);
                        console.log(`Deleted old backup: ${file.name}`);
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
            
            const backupPattern = new RegExp(`^\\.${basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-backup-(\\d{8})-(\\d{4})\\.md$`);
            
            const files = fs.readdirSync(dir);
            const backups = files
                .filter(file => backupPattern.test(file))
                .map(file => {
                    const match = file.match(backupPattern);
                    if (!match) return null;
                    
                    const dateStr = match[1];
                    const timeStr = match[2];
                    
                    // Parse date from filename
                    const year = parseInt(dateStr.substring(0, 4));
                    const month = parseInt(dateStr.substring(4, 6)) - 1;
                    const day = parseInt(dateStr.substring(6, 8));
                    const hours = parseInt(timeStr.substring(0, 2));
                    const minutes = parseInt(timeStr.substring(2, 4));
                    
                    const date = new Date(year, month, day, hours, minutes);
                    
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
     * Dispose of resources
     */
    public dispose(): void {
        this.stopPeriodicBackup();
    }
}