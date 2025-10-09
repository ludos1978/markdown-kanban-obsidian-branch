import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { PathResolver } from './PathResolver';

/**
 * Unified file writing utility
 * Consolidates all file write operations from across the codebase
 *
 * Replaces 8+ duplicate file write locations:
 * - exportService.ts: Multiple writeFileSync calls
 * - kanbanWebviewPanel.ts: Save operations
 * - backupService.ts: Backup file writing
 */
export class FileWriter {
    /**
     * Write content to a file with proper error handling
     *
     * @param filePath - Absolute path to the file
     * @param content - Content to write
     * @param options - Write options
     * @returns Success status
     */
    static async writeFile(
        filePath: string,
        content: string,
        options: FileWriteOptions = {}
    ): Promise<FileWriteResult> {
        const {
            createDirs = true,
            encoding = 'utf-8',
            backup = false,
            showNotification = true
        } = options;

        try {
            // Ensure directory exists
            if (createDirs) {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            }

            // Create backup if requested
            if (backup && fs.existsSync(filePath)) {
                await this.createBackup(filePath);
            }

            // Write the file
            fs.writeFileSync(filePath, content, { encoding });

            // Show success notification
            if (showNotification) {
                vscode.window.showInformationMessage(
                    `File saved: ${path.basename(filePath)}`
                );
            }

            return {
                success: true,
                filePath,
                bytesWritten: Buffer.byteLength(content, encoding)
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);

            if (showNotification) {
                vscode.window.showErrorMessage(
                    `Failed to write file: ${errorMessage}`
                );
            }

            return {
                success: false,
                filePath,
                error: errorMessage
            };
        }
    }

    /**
     * Write multiple files in a batch operation
     * More efficient than calling writeFile multiple times
     *
     * @param files - Array of files to write
     * @param options - Write options (applied to all files)
     * @returns Array of write results
     */
    static async writeBatch(
        files: FileToWrite[],
        options: FileWriteOptions = {}
    ): Promise<FileWriteResult[]> {
        const results: FileWriteResult[] = [];

        for (const file of files) {
            const result = await this.writeFile(
                file.filePath,
                file.content,
                { ...options, showNotification: false } // Suppress individual notifications
            );
            results.push(result);
        }

        // Show summary notification
        if (options.showNotification !== false) {
            const successCount = results.filter(r => r.success).length;
            const totalCount = results.length;

            if (successCount === totalCount) {
                vscode.window.showInformationMessage(
                    `Successfully wrote ${successCount} file(s)`
                );
            } else {
                vscode.window.showWarningMessage(
                    `Wrote ${successCount}/${totalCount} file(s). Some files failed.`
                );
            }
        }

        return results;
    }

    /**
     * Create a backup of a file
     *
     * @param filePath - Path to the file to backup
     * @returns Path to the backup file
     */
    private static async createBackup(filePath: string): Promise<string> {
        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .split('Z')[0];

        const dir = path.dirname(filePath);
        const ext = path.extname(filePath);
        const base = path.basename(filePath, ext);

        const backupPath = path.join(dir, `${base}_backup_${timestamp}${ext}`);

        // Copy file to backup location
        fs.copyFileSync(filePath, backupPath);

        return backupPath;
    }

    /**
     * Check if a file exists
     *
     * @param filePath - Path to check
     * @returns True if file exists
     */
    static fileExists(filePath: string): boolean {
        try {
            return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
        } catch {
            return false;
        }
    }

    /**
     * Check if a directory exists
     *
     * @param dirPath - Path to check
     * @returns True if directory exists
     */
    static directoryExists(dirPath: string): boolean {
        try {
            return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
        } catch {
            return false;
        }
    }

    /**
     * Generate a unique filename by appending a number if file exists
     *
     * @param basePath - Base file path (e.g., /path/to/file.md)
     * @returns Unique file path that doesn't exist
     */
    static getUniqueFilePath(basePath: string): string {
        if (!this.fileExists(basePath)) {
            return basePath;
        }

        const dir = path.dirname(basePath);
        const ext = path.extname(basePath);
        const base = path.basename(basePath, ext);

        let counter = 1;
        let uniquePath: string;

        do {
            uniquePath = path.join(dir, `${base}_${counter}${ext}`);
            counter++;
        } while (this.fileExists(uniquePath));

        return uniquePath;
    }

    /**
     * Safely delete a file (move to trash if possible)
     *
     * @param filePath - Path to the file to delete
     * @param permanent - If true, permanently delete. If false, try to use trash.
     * @returns Success status
     */
    static async deleteFile(
        filePath: string,
        permanent: boolean = false
    ): Promise<boolean> {
        try {
            if (!this.fileExists(filePath)) {
                return true; // Already deleted
            }

            if (permanent) {
                // Permanent deletion
                fs.unlinkSync(filePath);
            } else {
                // Try to use VSCode's trash functionality
                const uri = vscode.Uri.file(filePath);
                await vscode.workspace.fs.delete(uri, { useTrash: true });
            }

            return true;
        } catch (error) {
            console.error(`Failed to delete file ${filePath}:`, error);
            return false;
        }
    }

    /**
     * Read file content
     * Simple wrapper for consistency
     *
     * @param filePath - Path to the file
     * @param encoding - File encoding
     * @returns File content
     */
    static readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): string {
        return fs.readFileSync(filePath, { encoding });
    }

    /**
     * Create directory if it doesn't exist
     *
     * @param dirPath - Directory path
     * @returns Success status
     */
    static ensureDirectory(dirPath: string): boolean {
        try {
            if (!this.directoryExists(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            return true;
        } catch (error) {
            console.error(`Failed to create directory ${dirPath}:`, error);
            return false;
        }
    }
}

/**
 * Options for file write operations
 */
export interface FileWriteOptions {
    /** Create parent directories if they don't exist (default: true) */
    createDirs?: boolean;

    /** File encoding (default: 'utf-8') */
    encoding?: BufferEncoding;

    /** Create backup before writing (default: false) */
    backup?: boolean;

    /** Show VSCode notification on success/failure (default: true) */
    showNotification?: boolean;
}

/**
 * Result of a file write operation
 */
export interface FileWriteResult {
    /** Whether the write was successful */
    success: boolean;

    /** Path to the written file */
    filePath: string;

    /** Number of bytes written (only on success) */
    bytesWritten?: number;

    /** Error message (only on failure) */
    error?: string;
}

/**
 * Represents a file to be written in batch operations
 */
export interface FileToWrite {
    /** Absolute path where the file should be written */
    filePath: string;

    /** Content to write to the file */
    content: string;
}
