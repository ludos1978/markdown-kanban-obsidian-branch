import * as path from 'path';
import { PathResolver } from './PathResolver';
import { FileWriter, FileToWrite } from './FileWriter';
import { FormatConverter } from './FormatConverter';
import { IncludeProcessor } from './IncludeProcessor';
import { AssetHandler } from './AssetHandler';
import {
    OperationOptions,
    OperationResult,
    FileWriteInfo
} from './OperationOptions';

/**
 * Unified content pipeline service
 *
 * Orchestrates all operations: save, backup, export
 * Uses all Phase 1 and Phase 2 services to provide a single, unified API
 *
 * This replaces:
 * - exportService.ts: exportKanbanBoard, unifiedExport
 * - backupService.ts: createBackup
 * - kanbanWebviewPanel.ts: saveKanbanFile
 */
export class ContentPipelineService {
    /**
     * Execute an operation (save, backup, or export)
     *
     * @param content - Source content
     * @param options - Operation options
     * @returns Operation result
     */
    static async execute(content: string, options: OperationOptions): Promise<OperationResult> {
        const startTime = Date.now();

        try {
            switch (options.operation) {
                case 'save':
                    return await this.executeSave(content, options, startTime);
                case 'backup':
                    return await this.executeBackup(content, options, startTime);
                case 'export':
                    return await this.executeExport(content, options, startTime);
                default:
                    throw new Error(`Unknown operation: ${options.operation}`);
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            return {
                success: false,
                operation: options.operation,
                filesWritten: [],
                totalBytes: 0,
                executionTime: Date.now() - startTime,
                errors: [errorMsg]
            };
        }
    }

    /**
     * Execute save operation
     */
    private static async executeSave(
        content: string,
        options: OperationOptions,
        startTime: number
    ): Promise<OperationResult> {
        const basePath = path.dirname(options.sourcePath);

        // Create backup if requested
        if (options.createBackup) {
            const backupPath = await this.createBackupFile(options.sourcePath);
            console.log(`[ContentPipeline] Created backup: ${backupPath}`);
        }

        // Write the file
        const writeResult = await FileWriter.writeFile(
            options.sourcePath,
            content,
            {
                createDirs: options.createDirectories,
                showNotification: options.showNotifications
            }
        );

        if (!writeResult.success) {
            return {
                success: false,
                operation: 'save',
                filesWritten: [],
                totalBytes: 0,
                executionTime: Date.now() - startTime,
                errors: [writeResult.error || 'Unknown error']
            };
        }

        return {
            success: true,
            operation: 'save',
            filesWritten: [{
                path: options.sourcePath,
                size: writeResult.bytesWritten || 0,
                type: 'main',
                isNew: false
            }],
            totalBytes: writeResult.bytesWritten || 0,
            executionTime: Date.now() - startTime
        };
    }

    /**
     * Execute backup operation
     */
    private static async executeBackup(
        content: string,
        options: OperationOptions,
        startTime: number
    ): Promise<OperationResult> {
        const backupPath = await this.createBackupFile(
            options.sourcePath,
            options.targetDir,
            options.backupOptions
        );

        const stats = FileWriter.fileExists(backupPath)
            ? require('fs').statSync(backupPath)
            : { size: 0 };

        return {
            success: true,
            operation: 'backup',
            filesWritten: [{
                path: backupPath,
                size: stats.size,
                type: 'backup',
                isNew: true
            }],
            totalBytes: stats.size,
            executionTime: Date.now() - startTime
        };
    }

    /**
     * Execute export operation
     */
    private static async executeExport(
        content: string,
        options: OperationOptions,
        startTime: number
    ): Promise<OperationResult> {
        const basePath = path.dirname(options.sourcePath);
        const targetDir = options.targetDir || basePath;
        const filesWritten: FileWriteInfo[] = [];
        let totalBytes = 0;
        const errors: string[] = [];
        const warnings: string[] = [];

        // Step 1: Format conversion (if needed)
        let processedContent = content;
        const formatStrategy = options.formatStrategy || 'keep';

        if (formatStrategy !== 'keep') {
            const sourceFormat = FormatConverter.detectFormat(content);
            if (sourceFormat !== formatStrategy) {
                processedContent = FormatConverter.convert(
                    content,
                    formatStrategy,
                    {
                        preserveYaml: options.exportOptions?.preserveYaml
                    }
                );
            }
        }

        // Step 2: Process includes
        const includeMode = options.includeMode || {
            strategy: 'merge',
            processTypes: ['include', 'columninclude', 'taskinclude'],
            resolveNested: true,
            maxDepth: 10
        };

        const includeResult = await IncludeProcessor.processIncludes(
            processedContent,
            basePath,
            includeMode
        );

        processedContent = includeResult.content;
        errors.push(...includeResult.errors);

        // If strategy is 'separate', write include files
        if (includeMode.strategy === 'separate') {
            for (const includeFile of includeResult.includeFiles) {
                const includeContent = FileWriter.readFile(includeFile.path);
                const includeBasename = path.basename(includeFile.path);
                const includePath = path.join(targetDir, includeBasename);

                const writeResult = await FileWriter.writeFile(
                    includePath,
                    includeContent,
                    {
                        createDirs: options.createDirectories,
                        showNotification: false
                    }
                );

                if (writeResult.success) {
                    filesWritten.push({
                        path: includePath,
                        size: writeResult.bytesWritten || 0,
                        type: 'include',
                        isNew: true
                    });
                    totalBytes += writeResult.bytesWritten || 0;
                } else {
                    errors.push(`Failed to write include: ${includeBasename}`);
                }
            }
        }

        // Step 3: Process assets
        const assetStrategy = options.exportOptions?.assetStrategy || 'reference';
        let finalContent = processedContent;

        if (assetStrategy !== 'ignore' && options.exportOptions?.includeAssets) {
            const assetResult = await AssetHandler.processAssets(
                processedContent,
                basePath,
                targetDir,
                assetStrategy
            );

            finalContent = assetResult.content;
            errors.push(...assetResult.errors);

            // Track copied assets
            if (assetStrategy === 'copy') {
                // Assets are tracked in FileWriter operations
                warnings.push(`Copied ${assetResult.assetsCopied} assets`);
            } else if (assetStrategy === 'embed') {
                warnings.push(`Embedded ${assetResult.assetsEmbedded} assets`);
            }
        }

        // Step 4: Write main export file
        const targetFilename = options.targetFilename ||
            path.basename(options.sourcePath);
        const targetPath = path.join(targetDir, targetFilename);

        const mainWriteResult = await FileWriter.writeFile(
            targetPath,
            finalContent,
            {
                createDirs: options.createDirectories,
                showNotification: options.showNotifications
            }
        );

        if (!mainWriteResult.success) {
            errors.push(`Failed to write main file: ${mainWriteResult.error}`);
        } else {
            filesWritten.push({
                path: targetPath,
                size: mainWriteResult.bytesWritten || 0,
                type: 'main',
                isNew: !FileWriter.fileExists(targetPath)
            });
            totalBytes += mainWriteResult.bytesWritten || 0;
        }

        // Step 5: Build result
        const success = errors.length === 0 && mainWriteResult.success;

        return {
            success,
            operation: 'export',
            filesWritten,
            totalBytes,
            executionTime: Date.now() - startTime,
            errors: errors.length > 0 ? errors : undefined,
            warnings: warnings.length > 0 ? warnings : undefined,
            metadata: {
                includesProcessed: includeResult.includesProcessed,
                formatStrategy,
                includeStrategy: includeMode.strategy
            }
        };
    }

    /**
     * Create a backup file
     */
    private static async createBackupFile(
        sourcePath: string,
        targetDir?: string,
        backupOptions?: any
    ): Promise<string> {
        const timestamp = new Date().toISOString()
            .replace(/[:.]/g, '-')
            .replace('T', '_')
            .split('Z')[0];

        const dir = targetDir || path.dirname(sourcePath);
        const ext = path.extname(sourcePath);
        const base = path.basename(sourcePath, ext);

        const backupPath = path.join(dir, `${base}_backup_${timestamp}${ext}`);

        // Copy file
        require('fs').copyFileSync(sourcePath, backupPath);

        return backupPath;
    }

    /**
     * Batch export multiple items
     *
     * @param items - Items to export with their content
     * @param baseOptions - Base options for all exports
     * @returns Results for each item
     */
    static async batchExport(
        items: ExportItem[],
        baseOptions: OperationOptions
    ): Promise<BatchExportResult> {
        const results: OperationResult[] = [];
        const startTime = Date.now();

        for (const item of items) {
            const itemOptions: OperationOptions = {
                ...baseOptions,
                targetFilename: item.filename,
                showNotifications: false // Suppress individual notifications
            };

            const result = await this.execute(item.content, itemOptions);
            results.push(result);
        }

        const success = results.every(r => r.success);
        const totalFiles = results.reduce((sum, r) => sum + r.filesWritten.length, 0);
        const totalBytes = results.reduce((sum, r) => sum + r.totalBytes, 0);

        return {
            success,
            results,
            totalFiles,
            totalBytes,
            executionTime: Date.now() - startTime
        };
    }

    /**
     * Validate content before operation
     *
     * @param content - Content to validate
     * @param basePath - Base path for asset validation
     * @returns Validation result
     */
    static validateContent(content: string, basePath: string): ContentValidationResult {
        const issues: string[] = [];
        const warnings: string[] = [];

        // Check for includes
        const hasIncludes = IncludeProcessor.hasIncludes(content);
        if (hasIncludes) {
            const detection = IncludeProcessor.detectIncludes(content, basePath);
            const totalIncludes =
                detection.includes.length +
                detection.columnIncludes.length +
                detection.taskIncludes.length;
            warnings.push(`Found ${totalIncludes} include references`);
        }

        // Check for assets
        const assets = AssetHandler.findAssets(content, basePath);
        if (assets.length > 0) {
            const validation = AssetHandler.validateAssets(content, basePath);
            if (validation.missing.length > 0) {
                issues.push(`${validation.missing.length} missing assets`);
            }
            if (validation.broken.length > 0) {
                issues.push(`${validation.broken.length} broken assets`);
            }
        }

        // Detect format
        const format = FormatConverter.detectFormat(content);
        if (format === 'unknown') {
            warnings.push('Unable to detect content format');
        }

        return {
            valid: issues.length === 0,
            format,
            hasIncludes,
            assetCount: assets.length,
            issues,
            warnings
        };
    }
}

/**
 * Item to export in batch operation
 */
export interface ExportItem {
    /** Content to export */
    content: string;

    /** Target filename */
    filename: string;
}

/**
 * Result of batch export
 */
export interface BatchExportResult {
    /** Overall success */
    success: boolean;

    /** Individual results */
    results: OperationResult[];

    /** Total files written */
    totalFiles: number;

    /** Total bytes written */
    totalBytes: number;

    /** Total execution time */
    executionTime: number;
}

/**
 * Content validation result
 */
export interface ContentValidationResult {
    /** Whether content is valid */
    valid: boolean;

    /** Detected format */
    format: 'kanban' | 'presentation' | 'unknown';

    /** Whether content has includes */
    hasIncludes: boolean;

    /** Number of assets found */
    assetCount: number;

    /** Validation issues */
    issues: string[];

    /** Warnings */
    warnings: string[];
}
