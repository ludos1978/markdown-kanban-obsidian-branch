/**
 * Unified options system for save/backup/export operations
 *
 * Consolidates options from:
 * - exportService.ts: UnifiedExportOptions
 * - backupService.ts: BackupOptions
 * - kanbanWebviewPanel.ts: SaveOptions
 */

/**
 * Main operation options for all save/backup/export operations
 */
export interface OperationOptions {
    /** Type of operation */
    operation: 'save' | 'backup' | 'export';

    /** Source file path */
    sourcePath: string;

    /** Target directory (for exports/backups) */
    targetDir?: string;

    /** Target filename (for exports) */
    targetFilename?: string;

    /** Format strategy */
    formatStrategy?: FormatStrategy;

    /** Scope of operation */
    scope?: ExportScope;

    /** Include processing mode */
    includeMode?: IncludeMode;

    /** Additional options */
    createDirectories?: boolean;
    showNotifications?: boolean;
    overwriteExisting?: boolean;
    createBackup?: boolean;

    /** Export-specific options */
    exportOptions?: ExportSpecificOptions;

    /** Backup-specific options */
    backupOptions?: BackupSpecificOptions;
}

/**
 * Format strategy for content conversion
 */
export type FormatStrategy =
    | 'keep'           // Keep original format
    | 'kanban'         // Convert all to kanban
    | 'presentation';  // Convert all to presentation

/**
 * Scope of export operation
 */
export type ExportScope =
    | 'full'           // Entire board
    | 'row'            // Single row
    | 'stack'          // Column stack
    | 'column'         // Single column
    | 'task';          // Single task

/**
 * Include file processing mode
 */
export interface IncludeMode {
    /** How to handle include files */
    strategy: 'merge' | 'separate' | 'ignore';

    /** Types of includes to process */
    processTypes?: IncludeType[];

    /** Whether to resolve nested includes */
    resolveNested?: boolean;

    /** Maximum nesting depth (prevents infinite loops) */
    maxDepth?: number;
}

/**
 * Types of include markers
 */
export type IncludeType =
    | 'include'        // !!!include(...)!!!
    | 'columninclude'  // !!!columninclude(...)!!!
    | 'taskinclude';   // !!!taskinclude(...)!!!

/**
 * Export-specific options
 */
export interface ExportSpecificOptions {
    /** Selected items to export (if scope is not 'full') */
    selectedItems?: ExportItem[];

    /** Whether to include assets (images, etc.) */
    includeAssets?: boolean;

    /** Asset handling strategy */
    assetStrategy?: AssetStrategy;

    /** Whether to preserve YAML frontmatter */
    preserveYaml?: boolean;

    /** Custom export metadata */
    metadata?: Record<string, any>;
}

/**
 * Backup-specific options
 */
export interface BackupSpecificOptions {
    /** Backup naming strategy */
    namingStrategy?: 'timestamp' | 'sequential' | 'custom';

    /** Custom name suffix (if namingStrategy is 'custom') */
    customSuffix?: string;

    /** Maximum number of backups to keep */
    maxBackups?: number;

    /** Whether to compress backup */
    compress?: boolean;
}

/**
 * Represents an item selected for export
 */
export interface ExportItem {
    /** Type of item */
    type: 'row' | 'stack' | 'column' | 'task';

    /** Item identifier (index or ID) */
    id: string;

    /** Display name */
    name: string;

    /** Parent item (if applicable) */
    parent?: string;

    /** Child items (if applicable) */
    children?: ExportItem[];
}

/**
 * Asset handling strategy for exports
 */
export type AssetStrategy =
    | 'embed'          // Embed assets inline (base64)
    | 'copy'           // Copy assets to export directory
    | 'reference'      // Keep original references
    | 'ignore';        // Don't process assets

/**
 * Result of an operation
 */
export interface OperationResult {
    /** Success status */
    success: boolean;

    /** Operation type */
    operation: 'save' | 'backup' | 'export';

    /** Files written */
    filesWritten: FileWriteInfo[];

    /** Total bytes written */
    totalBytes: number;

    /** Execution time in milliseconds */
    executionTime: number;

    /** Errors encountered (if any) */
    errors?: string[];

    /** Warnings (if any) */
    warnings?: string[];

    /** Additional metadata */
    metadata?: Record<string, any>;
}

/**
 * Information about a written file
 */
export interface FileWriteInfo {
    /** Absolute path to the file */
    path: string;

    /** File size in bytes */
    size: number;

    /** File type/role */
    type: 'main' | 'include' | 'asset' | 'backup';

    /** Whether this is a new file or overwrite */
    isNew: boolean;
}

/**
 * Utility class for creating and validating operation options
 */
export class OperationOptionsBuilder {
    private options: Partial<OperationOptions>;

    constructor() {
        this.options = {
            createDirectories: true,
            showNotifications: true,
            overwriteExisting: false,
            createBackup: false
        };
    }

    /**
     * Set operation type
     */
    operation(type: 'save' | 'backup' | 'export'): this {
        this.options.operation = type;
        return this;
    }

    /**
     * Set source file path
     */
    source(path: string): this {
        this.options.sourcePath = path;
        return this;
    }

    /**
     * Set target directory
     */
    targetDir(dir: string): this {
        this.options.targetDir = dir;
        return this;
    }

    /**
     * Set target filename
     */
    targetFilename(filename: string): this {
        this.options.targetFilename = filename;
        return this;
    }

    /**
     * Set format strategy
     */
    format(strategy: FormatStrategy): this {
        this.options.formatStrategy = strategy;
        return this;
    }

    /**
     * Set export scope
     */
    scope(scope: ExportScope): this {
        this.options.scope = scope;
        return this;
    }

    /**
     * Set include processing mode
     */
    includes(mode: IncludeMode): this {
        this.options.includeMode = mode;
        return this;
    }

    /**
     * Enable/disable directory creation
     */
    createDirs(create: boolean): this {
        this.options.createDirectories = create;
        return this;
    }

    /**
     * Enable/disable notifications
     */
    notify(show: boolean): this {
        this.options.showNotifications = show;
        return this;
    }

    /**
     * Enable/disable overwrite
     */
    overwrite(allow: boolean): this {
        this.options.overwriteExisting = allow;
        return this;
    }

    /**
     * Enable/disable backup before operation
     */
    backup(create: boolean): this {
        this.options.createBackup = create;
        return this;
    }

    /**
     * Set export-specific options
     */
    exportOptions(options: ExportSpecificOptions): this {
        this.options.exportOptions = options;
        return this;
    }

    /**
     * Set backup-specific options
     */
    backupOptions(options: BackupSpecificOptions): this {
        this.options.backupOptions = options;
        return this;
    }

    /**
     * Build and validate options
     */
    build(): OperationOptions {
        // Validate required fields
        if (!this.options.operation) {
            throw new Error('Operation type is required');
        }

        if (!this.options.sourcePath) {
            throw new Error('Source path is required');
        }

        // Set defaults based on operation type
        if (this.options.operation === 'export') {
            this.options.formatStrategy = this.options.formatStrategy || 'keep';
            this.options.scope = this.options.scope || 'full';
            this.options.includeMode = this.options.includeMode || {
                strategy: 'merge',
                processTypes: ['include', 'columninclude', 'taskinclude'],
                resolveNested: true,
                maxDepth: 10
            };
        }

        if (this.options.operation === 'backup') {
            this.options.backupOptions = this.options.backupOptions || {
                namingStrategy: 'timestamp',
                maxBackups: 10,
                compress: false
            };
        }

        return this.options as OperationOptions;
    }

    /**
     * Create a quick export options object
     */
    static quickExport(
        sourcePath: string,
        targetDir: string,
        format: FormatStrategy = 'keep',
        mergeIncludes: boolean = true
    ): OperationOptions {
        return new OperationOptionsBuilder()
            .operation('export')
            .source(sourcePath)
            .targetDir(targetDir)
            .format(format)
            .includes({
                strategy: mergeIncludes ? 'merge' : 'separate',
                processTypes: ['include', 'columninclude', 'taskinclude'],
                resolveNested: true,
                maxDepth: 10
            })
            .build();
    }

    /**
     * Create a quick save options object
     */
    static quickSave(sourcePath: string, createBackup: boolean = false): OperationOptions {
        return new OperationOptionsBuilder()
            .operation('save')
            .source(sourcePath)
            .backup(createBackup)
            .build();
    }

    /**
     * Create a quick backup options object
     */
    static quickBackup(
        sourcePath: string,
        targetDir?: string,
        maxBackups: number = 10
    ): OperationOptions {
        const builder = new OperationOptionsBuilder()
            .operation('backup')
            .source(sourcePath)
            .backupOptions({
                namingStrategy: 'timestamp',
                maxBackups,
                compress: false
            });

        if (targetDir) {
            builder.targetDir(targetDir);
        }

        return builder.build();
    }
}
