import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { TagUtils, TagVisibility } from './utils/tagUtils';

export type ExportScope = 'full' | 'row' | 'stack' | 'column' | 'task';
export type ExportFormat = 'kanban' | 'presentation';

export interface ExportOptions {
    targetFolder: string;
    includeFiles: boolean;
    includeImages: boolean;
    includeVideos: boolean;
    includeOtherMedia: boolean;
    includeDocuments: boolean;
    fileSizeLimitMB: number;
    tagVisibility?: TagVisibility;
}

export interface ColumnExportOptions extends ExportOptions {
    columnIndex: number;
    columnTitle?: string;
}

export interface UnifiedExportOptions {
    targetFolder?: string;
    scope: ExportScope;
    format: ExportFormat;
    tagVisibility: TagVisibility;
    packAssets: boolean;
    packOptions?: {
        includeFiles: boolean;
        includeImages: boolean;
        includeVideos: boolean;
        includeOtherMedia: boolean;
        includeDocuments: boolean;
        fileSizeLimitMB: number;
    };
    selection: {
        rowNumber?: number;
        stackIndex?: number;
        columnIndex?: number;
        taskId?: string;
        columnId?: string;
    };
}

export interface AssetInfo {
    originalPath: string;
    resolvedPath: string;
    relativePath: string;
    type: 'image' | 'video' | 'audio' | 'document' | 'file' | 'markdown';
    size: number;
    exists: boolean;
    md5?: string;
}

interface ProcessedAsset {
    original: AssetInfo;
    exportedPath: string;
    exportedRelativePath: string;
}

export class ExportService {
    private static readonly IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp'];
    private static readonly VIDEO_EXTENSIONS = ['.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv'];
    private static readonly AUDIO_EXTENSIONS = ['.mp3', '.wav', '.flac', '.aac', '.ogg', '.m4a'];
    private static readonly DOCUMENT_EXTENSIONS = ['.pdf', '.epub', '.doc', '.docx', '.txt'];

    // Include patterns for different include types
    private static readonly INCLUDE_PATTERN = /!!!include\s*\(([^)]+)\)\s*!!!/g;
    private static readonly TASK_INCLUDE_PATTERN = /!!!taskinclude\s*\(([^)]+)\)\s*!!!/g;
    private static readonly COLUMN_INCLUDE_PATTERN = /!!!columninclude\s*\(([^)]+)\)\s*!!!/g;

    // Track MD5 hashes to detect duplicates
    private static fileHashMap = new Map<string, string>();
    private static exportedFiles = new Map<string, string>(); // MD5 -> exported path

    /**
     * Apply tag filtering to content based on export options
     * DRY method to avoid duplication
     */
    private static applyTagFiltering(content: string, options: ExportOptions): string {
        if (options.tagVisibility && options.tagVisibility !== 'all') {
            return TagUtils.processMarkdownContent(content, options.tagVisibility);
        }
        return content;
    }

    /**
     * Export markdown file with selected assets
     */
    public static async exportWithAssets(
        sourceDocument: vscode.TextDocument,
        options: ExportOptions
    ): Promise<{ success: boolean; message: string; exportedPath?: string }> {
        try {

            // Validate inputs
            if (!sourceDocument || !sourceDocument.uri) {
                throw new Error('Invalid source document provided');
            }

            if (!options.targetFolder || options.targetFolder.trim() === '') {
                throw new Error('Target folder path is empty or invalid');
            }

            // Clear tracking maps for new export
            this.fileHashMap.clear();
            this.exportedFiles.clear();

            const sourcePath = sourceDocument.uri.fsPath;
            const sourceDir = path.dirname(sourcePath);
            const sourceBasename = path.basename(sourcePath, '.md');

            // Validate source file exists
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source markdown file not found: ${sourcePath}`);
            }

            // Ensure target folder exists
            try {
                if (!fs.existsSync(options.targetFolder)) {
                    fs.mkdirSync(options.targetFolder, { recursive: true });
                }
            } catch (error) {
                throw new Error(`Failed to create target folder "${options.targetFolder}": ${error}`);
            }

            // Check write permissions on target folder
            try {
                const testFile = path.join(options.targetFolder, '.write-test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
            } catch (error) {
                throw new Error(`No write permission for target folder "${options.targetFolder}": ${error}`);
            }

            // Process main markdown file
            let exportedContent, notIncludedAssets, stats;
            try {
                const result = await this.processMarkdownFile(
                    sourcePath,
                    options.targetFolder,
                    sourceBasename,
                    options,
                    new Set() // Track processed includes to avoid circular references
                );
                exportedContent = result.exportedContent;
                notIncludedAssets = result.notIncludedAssets;
                stats = result.stats;

                // Tag filtering is now applied within processMarkdownFile/processMarkdownContent
            } catch (error) {
                throw new Error(`Failed to process markdown file "${sourcePath}": ${error}`);
            }

            // Write the main markdown file to export folder
            const targetMarkdownPath = path.join(options.targetFolder, path.basename(sourcePath));
            try {
                fs.writeFileSync(targetMarkdownPath, exportedContent, 'utf8');
            } catch (error) {
                throw new Error(`Failed to write main markdown file to "${targetMarkdownPath}": ${error}`);
            }

            // Create _not_included.md if there are excluded assets
            if (notIncludedAssets.length > 0) {
                try {
                    await this.createNotIncludedFile(notIncludedAssets, options.targetFolder);
                } catch (error) {
                    console.warn(`Failed to create _not_included.md: ${error}`);
                    // Don't fail the entire export for this
                }
            }

            const successMessage = `Export completed successfully!\n${stats.includedCount} assets included, ${stats.excludedCount} assets excluded.\n${stats.includeFiles} included files processed.`;

            return {
                success: true,
                message: successMessage,
                exportedPath: targetMarkdownPath
            };

        } catch (error) {
            const errorMessage = `Export failed: ${error instanceof Error ? error.message : String(error)}`;
            console.error('❌ Export failed:', error);
            console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace available');

            return {
                success: false,
                message: errorMessage
            };
        }
    }

    /**
     * Export a single column from a kanban board
     */
    public static async exportColumn(
        sourceDocument: vscode.TextDocument,
        options: ColumnExportOptions
    ): Promise<{ success: boolean; message: string; exportedPath?: string }> {
        try {
            // Clear tracking maps for new export
            this.fileHashMap.clear();
            this.exportedFiles.clear();

            const sourcePath = sourceDocument.uri.fsPath;
            const sourceBasename = path.basename(sourcePath, '.md');

            // Validate source file exists
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source markdown file not found: ${sourcePath}`);
            }

            // Read the full markdown content
            const fullContent = fs.readFileSync(sourcePath, 'utf8');

            // Extract column content
            const columnContent = this.extractColumnContent(fullContent, options.columnIndex);
            if (!columnContent) {
                throw new Error(`Column ${options.columnIndex} not found or empty`);
            }

            // Generate sanitized column name
            const sanitizedColumnName = this.sanitizeColumnName(options.columnTitle, options.columnIndex);
            const columnFileName = `${sourceBasename}-${sanitizedColumnName}`;

            // Ensure target folder exists
            try {
                if (!fs.existsSync(options.targetFolder)) {
                    fs.mkdirSync(options.targetFolder, { recursive: true });
                }
            } catch (error) {
                throw new Error(`Failed to create target folder "${options.targetFolder}": ${error}`);
            }

            // Verify write permissions
            try {
                const testFile = path.join(options.targetFolder, '.write-test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
            } catch (error) {
                throw new Error(`No write permission for target folder "${options.targetFolder}": ${error}`);
            }

            // Process the column content and its assets
            const sourceDir = path.dirname(sourcePath);
            let exportedContent: string;
            let notIncludedAssets: AssetInfo[];
            let stats: { includedCount: number; excludedCount: number; includeFiles: number };

            try {
                const result = await this.processMarkdownContent(
                    columnContent,
                    sourceDir,
                    columnFileName,
                    options.targetFolder,
                    options,
                    new Set<string>()
                );
                exportedContent = result.exportedContent;
                notIncludedAssets = result.notIncludedAssets;
                stats = result.stats;

                // Tag filtering is now applied within processMarkdownFile/processMarkdownContent
            } catch (error) {
                throw new Error(`Failed to process column content: ${error}`);
            }

            // Write the column markdown file to export folder
            const targetMarkdownPath = path.join(options.targetFolder, `${columnFileName}.md`);
            try {
                fs.writeFileSync(targetMarkdownPath, exportedContent, 'utf8');
            } catch (error) {
                throw new Error(`Failed to write column markdown file to "${targetMarkdownPath}": ${error}`);
            }

            // Create _not_included.md if there are excluded assets
            if (notIncludedAssets.length > 0) {
                try {
                    await this.createNotIncludedFile(notIncludedAssets, options.targetFolder);
                } catch (error) {
                    console.warn(`Failed to create _not_included.md: ${error}`);
                    // Don't fail the entire export for this
                }
            }

            const successMessage = `Column export completed successfully!\n${stats.includedCount} assets included, ${stats.excludedCount} assets excluded.\n${stats.includeFiles} included files processed.`;

            return {
                success: true,
                message: successMessage,
                exportedPath: targetMarkdownPath
            };

        } catch (error) {
            const errorMessage = `Column export failed: ${error instanceof Error ? error.message : String(error)}`;
            console.error('❌ Column export failed:', error);

            return {
                success: false,
                message: errorMessage
            };
        }
    }

    /**
     * Process a markdown file and its assets
     */
    private static async processMarkdownFile(
        markdownPath: string,
        exportFolder: string,
        fileBasename: string,
        options: ExportOptions,
        processedIncludes: Set<string>
    ): Promise<{
        exportedContent: string;
        notIncludedAssets: AssetInfo[];
        stats: { includedCount: number; excludedCount: number; includeFiles: number };
    }> {
        const content = fs.readFileSync(markdownPath, 'utf8');
        const sourceDir = path.dirname(markdownPath);
        const mediaFolder = path.join(exportFolder, `${fileBasename}-Media`);

        // Find all assets in the markdown
        const assets = this.findAssets(content, sourceDir);

        // Find and process included markdown files
        const { processedContent, includeStats } = await this.processIncludedFiles(
            content,
            sourceDir,
            exportFolder,
            options,
            processedIncludes
        );

        // Filter assets based on options
        const assetsToInclude = this.filterAssets(assets, options);

        // Process assets and update content
        const { modifiedContent, notIncludedAssets } = await this.processAssets(
            processedContent,
            assetsToInclude,
            assets,
            mediaFolder,
            fileBasename
        );

        const stats = {
            includedCount: assetsToInclude.length,
            excludedCount: notIncludedAssets.length,
            includeFiles: includeStats
        };

        // Apply tag filtering to the content if specified
        // This ensures all markdown files (main and included) get tag filtering
        const filteredContent = this.applyTagFiltering(modifiedContent, options);

        return {
            exportedContent: filteredContent,
            notIncludedAssets,
            stats
        };
    }

    /**
     * Process included markdown files
     */
    private static async processIncludedFiles(
        content: string,
        sourceDir: string,
        exportFolder: string,
        options: ExportOptions,
        processedIncludes: Set<string>,
        convertToPresentation: boolean = false
    ): Promise<{ processedContent: string; includeStats: number }> {
        if (!options.includeFiles) {
            return { processedContent: content, includeStats: 0 };
        }

        let processedContent = content;
        let includeCount = 0;

        // Define include patterns and their replacement formats
        const includePatterns = [
            {
                pattern: this.INCLUDE_PATTERN,
                replacement: (filename: string) => `!!!include(${filename})!!!`
            },
            {
                pattern: this.TASK_INCLUDE_PATTERN,
                replacement: (filename: string) => `!!!taskinclude(${filename})!!!`
            },
            {
                pattern: this.COLUMN_INCLUDE_PATTERN,
                replacement: (filename: string) => `!!!columninclude(${filename})!!!`
            }
        ];

        // Process each include pattern
        for (const { pattern, replacement } of includePatterns) {
            let match;
            const regex = new RegExp(pattern.source, pattern.flags);

            while ((match = regex.exec(processedContent)) !== null) {
                const includePath = match[1].trim();
                // Decode URL-encoded include paths
                const decodedIncludePath = decodeURIComponent(includePath);
                const resolvedPath = path.isAbsolute(decodedIncludePath)
                    ? decodedIncludePath
                    : path.resolve(sourceDir, decodedIncludePath);

                // Avoid circular references
                if (processedIncludes.has(resolvedPath)) {
                    continue;
                }

                if (fs.existsSync(resolvedPath) && path.extname(resolvedPath) === '.md') {
                    processedIncludes.add(resolvedPath);
                    includeCount++;

                    const includeBasename = path.basename(resolvedPath, '.md');

                    // Process the included file recursively
                    const { exportedContent } = await this.processMarkdownFile(
                        resolvedPath,
                        exportFolder,
                        includeBasename,
                        options,
                        processedIncludes
                    );

                    // Copy the processed included file to export folder
                    const targetIncludePath = path.join(exportFolder, path.basename(resolvedPath));
                    fs.writeFileSync(targetIncludePath, exportedContent, 'utf8');

                    // Update the include reference to use the new path
                    processedContent = processedContent.replace(
                        match[0],
                        replacement(path.basename(resolvedPath))
                    );
                }
            }
        }

        return { processedContent, includeStats: includeCount };
    }

    /**
     * Calculate MD5 hash for file (first 100KB for large files)
     */
    private static async calculateMD5(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            const stats = fs.statSync(filePath);

            let bytesRead = 0;
            const maxBytes = stats.size > 1024 * 1024 ? 100 * 1024 : stats.size; // 100KB for files > 1MB

            stream.on('data', (chunk) => {
                bytesRead += chunk.length;
                if (bytesRead <= maxBytes) {
                    hash.update(chunk);
                } else {
                    const remaining = maxBytes - (bytesRead - chunk.length);
                    if (remaining > 0) {
                        hash.update(Buffer.isBuffer(chunk) ? chunk.subarray(0, remaining) : chunk.slice(0, remaining));
                    }
                    // Resolve immediately when we've read enough data
                    stream.destroy();
                    resolve(hash.digest('hex'));
                    return;
                }
            });

            stream.on('end', () => {
                resolve(hash.digest('hex'));
            });

            stream.on('error', reject);
        });
    }

    /**
     * Find all assets referenced in the markdown content
     */
    private static findAssets(content: string, sourceDir: string): AssetInfo[] {
        const assets: AssetInfo[] = [];

        // Match markdown images: ![alt](path) and ![alt](path "title")
        const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;

        // Match markdown links: [text](path) and [text](path "title")
        const linkRegex = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;

        // Match HTML img tags: <img src="path">
        const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

        // Match HTML video/audio tags: <video src="path">, <audio src="path">
        const htmlMediaRegex = /<(?:video|audio)[^>]+src=["']([^"']+)["'][^>]*>/gi;

        // Process all matches
        const patterns = [
            imageRegex,
            linkRegex,
            htmlImgRegex,
            htmlMediaRegex
        ];

        patterns.forEach((regex) => {
            let match;
            while ((match = regex.exec(content)) !== null) {
                const rawPath = match[1].split(' ')[0].replace(/["']/g, ''); // Remove quotes and titles

                // Skip URLs
                if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
                    continue;
                }

                // Decode URL-encoded paths (e.g., %20 for spaces)
                const decodedPath = decodeURIComponent(rawPath);

                const resolvedPath = path.isAbsolute(decodedPath)
                    ? decodedPath
                    : path.resolve(sourceDir, decodedPath);

                const exists = fs.existsSync(resolvedPath);
                const stats = exists ? fs.statSync(resolvedPath) : null;
                const size = stats ? stats.size : 0;

                assets.push({
                    originalPath: rawPath, // Keep original encoded path for replacement
                    resolvedPath,
                    relativePath: path.relative(sourceDir, resolvedPath),
                    type: this.getAssetType(resolvedPath),
                    size,
                    exists
                });
            }
        });

        return assets;
    }

    /**
     * Determine asset type based on file extension
     */
    private static getAssetType(filePath: string): AssetInfo['type'] {
        const ext = path.extname(filePath).toLowerCase();

        if (ext === '.md') { return 'markdown'; }
        if (this.IMAGE_EXTENSIONS.includes(ext)) { return 'image'; }
        if (this.VIDEO_EXTENSIONS.includes(ext)) { return 'video'; }
        if (this.AUDIO_EXTENSIONS.includes(ext)) { return 'audio'; }
        if (this.DOCUMENT_EXTENSIONS.includes(ext)) { return 'document'; }

        return 'file';
    }

    /**
     * Filter assets based on export options
     */
    private static filterAssets(assets: AssetInfo[], options: ExportOptions): AssetInfo[] {
        return assets.filter(asset => {
            // Check if asset exists
            if (!asset.exists) { return false; }

            // Check file size limit
            const sizeMB = asset.size / (1024 * 1024);
            if (sizeMB > options.fileSizeLimitMB) { return false; }

            // Check type-specific inclusion
            switch (asset.type) {
                case 'markdown': return options.includeFiles; // Markdown files handled separately
                case 'image': return options.includeImages;
                case 'video': return options.includeVideos;
                case 'audio': return options.includeOtherMedia;
                case 'document': return options.includeDocuments;
                case 'file': return options.includeFiles;
                default: return false;
            }
        });
    }

    /**
     * Process assets: copy included ones and track excluded ones
     */
    private static async processAssets(
        content: string,
        assetsToInclude: AssetInfo[],
        allAssets: AssetInfo[],
        mediaFolder: string,
        fileBasename: string
    ): Promise<{ modifiedContent: string; notIncludedAssets: AssetInfo[] }> {
        let modifiedContent = content;
        const notIncludedAssets: AssetInfo[] = [];
        const includedPaths = new Set(assetsToInclude.map(a => a.originalPath));

        // Ensure media folder exists if we have assets to include
        if (assetsToInclude.length > 0 && !fs.existsSync(mediaFolder)) {
            fs.mkdirSync(mediaFolder, { recursive: true });
        }

        // Copy included assets and modify paths
        for (const asset of assetsToInclude) {
            try {
                // Calculate MD5 for duplicate detection
                const md5 = await this.calculateMD5(asset.resolvedPath);

                // Check if we already exported this exact file
                if (this.exportedFiles.has(md5)) {
                    // Use existing exported file path
                    const existingPath = this.exportedFiles.get(md5)!;
                    // Calculate relative path from the markdown location (export folder root) to the existing asset
                    const markdownLocation = path.dirname(mediaFolder); // This is the export folder

                    if (!existingPath) {
                        throw new Error(`Existing path is undefined for MD5: ${md5}`);
                    }

                    const relativePath = path.relative(markdownLocation, existingPath).replace(/\\/g, '/');
                    modifiedContent = this.replaceAssetPath(modifiedContent, asset.originalPath, relativePath);
                    continue;
                }

                // Generate unique filename if needed
                const fileName = path.basename(asset.resolvedPath);
                const ext = path.extname(fileName);
                const nameWithoutExt = path.basename(fileName, ext);

                let targetPath = path.join(mediaFolder, fileName);
                let exportedFileName = fileName;
                let index = 1;

                // Check for filename conflicts
                while (fs.existsSync(targetPath)) {
                    const existingMd5 = await this.calculateMD5(targetPath);
                    if (existingMd5 === md5) {
                        // Same file, use it
                        break;
                    }
                    // Different file with same name, create alternative name
                    exportedFileName = `${nameWithoutExt}-${index}${ext}`;
                    targetPath = path.join(mediaFolder, exportedFileName);
                    index++;
                }

                // Copy the file if not already there
                if (!fs.existsSync(targetPath)) {
                    fs.copyFileSync(asset.resolvedPath, targetPath);
                    this.exportedFiles.set(md5, targetPath);
                }

                // Update path in content - use relative path from markdown to media folder
                const relativePath = path.join(`${fileBasename}-Media`, exportedFileName);
                modifiedContent = this.replaceAssetPath(modifiedContent, asset.originalPath, relativePath);

            } catch (error) {
                console.error(`Failed to copy asset ${asset.originalPath}:`, error);
                notIncludedAssets.push(asset);
            }
        }

        // Collect assets that weren't included
        for (const asset of allAssets) {
            if (!includedPaths.has(asset.originalPath) && asset.type !== 'markdown') {
                notIncludedAssets.push(asset);
            }
        }

        return { modifiedContent, notIncludedAssets };
    }

    /**
     * Replace asset path in content
     */
    private static replaceAssetPath(content: string, oldPath: string, newPath: string): string {
        // Escape special regex characters in the old path
        const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // Normalize path separators for cross-platform compatibility
        const normalizedNewPath = newPath.replace(/\\/g, '/');

        // Replace in markdown images: ![alt](oldPath) -> ![alt](newPath)
        content = content.replace(
            new RegExp(`(!\\[[^\\]]*\\]\\()${escapedOldPath}((?:\\s+[^)]*)?\\))`, 'g'),
            `$1${normalizedNewPath}$2`
        );

        // Replace in markdown links: [text](oldPath) -> [text](newPath)
        content = content.replace(
            new RegExp(`((?<!!)\\[[^\\]]*\\]\\()${escapedOldPath}((?:\\s+[^)]*)?\\))`, 'g'),
            `$1${normalizedNewPath}$2`
        );

        // Replace in HTML img tags: src="oldPath" -> src="newPath"
        content = content.replace(
            new RegExp(`(<img[^>]+src=["'])${escapedOldPath}(["'][^>]*>)`, 'gi'),
            `$1${normalizedNewPath}$2`
        );

        // Replace in HTML media tags: src="oldPath" -> src="newPath"
        content = content.replace(
            new RegExp(`(<(?:video|audio)[^>]+src=["'])${escapedOldPath}(["'][^>]*>)`, 'gi'),
            `$1${normalizedNewPath}$2`
        );

        return content;
    }

    /**
     * Create _not_included.md file with excluded assets
     */
    private static async createNotIncludedFile(notIncludedAssets: AssetInfo[], targetFolder: string): Promise<void> {
        const content = [
            '# Assets Not Included in Export',
            '',
            'The following assets were not included in this export:',
            ''
        ];

        // Group by reason for exclusion
        const missingAssets = notIncludedAssets.filter(a => !a.exists);
        const oversizedAssets = notIncludedAssets.filter(a => a.exists && a.size > 100 * 1024 * 1024);
        const excludedByType = notIncludedAssets.filter(a => a.exists && a.size <= 100 * 1024 * 1024);

        if (missingAssets.length > 0) {
            content.push('## Missing Files');
            content.push('');
            missingAssets.forEach(asset => {
                content.push(`- [${path.basename(asset.originalPath)}](${asset.originalPath}) - File not found`);
            });
            content.push('');
        }

        if (oversizedAssets.length > 0) {
            content.push('## Files Too Large');
            content.push('');
            oversizedAssets.forEach(asset => {
                const sizeMB = Math.round(asset.size / (1024 * 1024) * 100) / 100;
                content.push(`- [${path.basename(asset.originalPath)}](${asset.originalPath}) - ${sizeMB} MB`);
            });
            content.push('');
        }

        if (excludedByType.length > 0) {
            content.push('## Excluded by Type');
            content.push('');
            excludedByType.forEach(asset => {
                content.push(`- [${path.basename(asset.originalPath)}](${asset.originalPath}) - ${asset.type}`);
            });
            content.push('');
        }

        const notIncludedPath = path.join(targetFolder, '_not_included.md');
        fs.writeFileSync(notIncludedPath, content.join('\n'), 'utf8');
    }

    /**
     * Generate default export folder name based on source filename and timestamp
     * Format: {filename}-YYYYMMDD-HHmm
     */
    public static generateDefaultExportFolder(sourceDocumentPath: string): string {
        const sourceDir = path.dirname(sourceDocumentPath);
        const sourceBasename = path.basename(sourceDocumentPath, '.md');
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[-:]/g, '')  // Remove dashes and colons
            .replace(/\..+/, '')   // Remove milliseconds and timezone
            .replace('T', '-')     // Replace T with single dash
            .substring(0, 13);     // YYYYMMDD-HHmm

        return path.join(sourceDir, `${sourceBasename}-${timestamp}`);
    }

    /**
     * Process markdown content directly (for column export)
     */
    private static async processMarkdownContent(
        content: string,
        sourceDir: string,
        fileBasename: string,
        exportFolder: string,
        options: ExportOptions,
        processedIncludes: Set<string>
    ): Promise<{
        exportedContent: string;
        notIncludedAssets: AssetInfo[];
        stats: { includedCount: number; excludedCount: number; includeFiles: number };
    }> {
        const mediaFolder = path.join(exportFolder, `${fileBasename}-Media`);

        // Find all assets in the markdown
        const assets = this.findAssets(content, sourceDir);

        // Find and process included markdown files
        const { processedContent, includeStats } = await this.processIncludedFiles(
            content,
            sourceDir,
            exportFolder,
            options,
            processedIncludes
        );

        // Filter assets based on options
        const assetsToInclude = this.filterAssets(assets, options);

        // Process assets and update content
        const { modifiedContent, notIncludedAssets } = await this.processAssets(
            processedContent,
            assetsToInclude,
            assets,
            mediaFolder,
            fileBasename
        );

        const stats = {
            includedCount: assetsToInclude.length,
            excludedCount: notIncludedAssets.length,
            includeFiles: includeStats
        };

        // Apply tag filtering to the content if specified
        // This ensures all markdown files (main and included) get tag filtering
        const filteredContent = this.applyTagFiltering(modifiedContent, options);

        return {
            exportedContent: filteredContent,
            notIncludedAssets,
            stats
        };
    }

    /**
     * Extract content from a specific column
     */
    private static extractColumnContent(markdownContent: string, columnIndex: number): string | null {
        // Kanban columns are defined by ## headers
        // First, check if this is a kanban board
        const isKanban = markdownContent.includes('kanban-plugin: board');

        if (!isKanban) {
            return null;
        }

        // Split content by lines and find all column headers
        const lines = markdownContent.split('\n');
        const columns: { startIndex: number; endIndex: number; content: string[] }[] = [];
        let currentColumn: { startIndex: number; endIndex: number; content: string[] } | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Check if this is a column header (starts with ##)
            if (line.startsWith('## ')) {
                // Save previous column if exists
                if (currentColumn) {
                    currentColumn.endIndex = i - 1;
                    columns.push(currentColumn);
                }

                // Start new column
                currentColumn = {
                    startIndex: i,
                    endIndex: lines.length - 1,
                    content: [line]
                };
            } else if (currentColumn) {
                // Add content to current column
                currentColumn.content.push(line);
            }
        }

        // Don't forget the last column
        if (currentColumn) {
            columns.push(currentColumn);
        }

        // Check if the requested column index exists
        if (columnIndex >= columns.length) {
            console.error(`Column index ${columnIndex} out of range. Found ${columns.length} columns.`);
            return null;
        }

        // Return the content of the requested column
        const selectedColumn = columns[columnIndex];
        return selectedColumn.content.join('\n');
    }

    /**
     * Sanitize column name for use in filename
     */
    private static sanitizeColumnName(columnTitle: string | undefined, columnIndex: number): string {
        if (columnTitle) {
            // Remove special characters and spaces, replace with underscores
            return columnTitle
                .replace(/[^a-zA-Z0-9]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_|_$/g, '')
                .toLowerCase();
        } else {
            return `Row${columnIndex}`;
        }
    }

    /**
     * Get row number from column title (defaults to 1)
     */
    private static getColumnRow(title: string): number {
        if (!title) { return 1; }
        const rowMatches = title.match(/#row(\d+)\b/gi);
        if (rowMatches && rowMatches.length > 0) {
            const lastMatch = rowMatches[rowMatches.length - 1];
            const num = parseInt(lastMatch.replace(/#row/i, ''), 10);
            return isNaN(num) ? 1 : num;
        }
        return 1;
    }

    /**
     * Check if column has #stack tag
     */
    private static isColumnStacked(title: string): boolean {
        return /#stack\b/i.test(title);
    }

    /**
     * Extract all columns content from a specific row
     */
    private static extractRowContent(markdownContent: string, rowNumber: number): string | null {
        const isKanban = markdownContent.includes('kanban-plugin: board');
        if (!isKanban) { return null; }

        const lines = markdownContent.split('\n');
        const rowColumns: string[] = [];
        let currentColumn: { content: string[]; row: number } | null = null;

        for (const line of lines) {
            if (line.startsWith('## ')) {
                // Save previous column if it's in the target row
                if (currentColumn && currentColumn.row === rowNumber) {
                    rowColumns.push(currentColumn.content.join('\n'));
                }
                // Start new column
                const columnRow = this.getColumnRow(line);
                currentColumn = { content: [line], row: columnRow };
            } else if (currentColumn) {
                currentColumn.content.push(line);
            }
        }

        // Don't forget the last column
        if (currentColumn && currentColumn.row === rowNumber) {
            rowColumns.push(currentColumn.content.join('\n'));
        }

        return rowColumns.length > 0 ? rowColumns.join('\n\n') : null;
    }

    /**
     * Extract stack content (consecutive stacked columns in same row)
     */
    private static extractStackContent(markdownContent: string, rowNumber: number, stackIndex: number): string | null {
        const isKanban = markdownContent.includes('kanban-plugin: board');
        if (!isKanban) { return null; }

        const lines = markdownContent.split('\n');
        const stacks: string[][] = [];
        let currentStack: string[] = [];
        let currentColumn: { content: string[]; row: number; stacked: boolean } | null = null;
        let inTargetRow = false;

        for (const line of lines) {
            if (line.startsWith('## ')) {
                // Process previous column
                if (currentColumn) {
                    if (currentColumn.row === rowNumber && currentColumn.stacked) {
                        currentStack.push(currentColumn.content.join('\n'));
                    } else if (currentColumn.row === rowNumber) {
                        // Non-stacked column ends current stack
                        if (currentStack.length > 0) {
                            stacks.push([...currentStack]);
                            currentStack = [];
                        }
                    }
                }

                // Start new column
                const columnRow = this.getColumnRow(line);
                const isStacked = this.isColumnStacked(line);
                inTargetRow = columnRow === rowNumber;
                currentColumn = { content: [line], row: columnRow, stacked: isStacked };
            } else if (currentColumn) {
                currentColumn.content.push(line);
            }
        }

        // Don't forget the last column
        if (currentColumn && currentColumn.row === rowNumber && currentColumn.stacked) {
            currentStack.push(currentColumn.content.join('\n'));
        }
        if (currentStack.length > 0) {
            stacks.push(currentStack);
        }

        if (stackIndex >= stacks.length) {
            return null;
        }

        return stacks[stackIndex].join('\n\n');
    }

    /**
     * Extract single task content from a column
     */
    private static extractTaskContent(columnContent: string, taskId?: string): string | null {
        const lines = columnContent.split('\n');
        const tasks: string[] = [];
        let currentTask: string[] = [];
        let inTask = false;

        for (const line of lines) {
            if (line.trim().startsWith('---')) {
                // Task separator
                if (currentTask.length > 0) {
                    tasks.push(currentTask.join('\n'));
                    currentTask = [];
                }
                inTask = true;
            } else if (inTask) {
                currentTask.push(line);
            }
        }

        // Don't forget the last task
        if (currentTask.length > 0) {
            tasks.push(currentTask.join('\n'));
        }

        // If taskId provided, find specific task; otherwise return first
        return tasks.length > 0 ? tasks[0] : null;
    }

    /**
     * Convert kanban format to presentation format
     */
    private static convertToPresentationFormat(content: string): string {
        const lines = content.split('\n');
        const result: string[] = [];

        for (const line of lines) {
            if (line.startsWith('## ')) {
                // Column header → presentation header
                result.push('#' + line);
            } else if (line.trim() === '---') {
                // Task separator stays the same
                result.push(line);
            } else if (line.trim().startsWith('##')) {
                // Task header stays the same
                result.push(line);
            } else if (!line.startsWith('#')) {
                // Regular content
                result.push(line);
            } else {
                // Other headers (shouldn't happen in well-formed kanban)
                result.push(line);
            }
        }

        return result.join('\n');
    }

    /**
     * Unified export method - handles all export scopes and formats
     */
    public static async exportUnified(
        sourceDocument: vscode.TextDocument,
        options: UnifiedExportOptions
    ): Promise<{ success: boolean; message: string; content?: string; exportedPath?: string }> {
        try {
            // Read source content
            const sourcePath = sourceDocument.uri.fsPath;
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }
            const fullContent = fs.readFileSync(sourcePath, 'utf8');

            // Extract content based on scope
            let content: string | null = null;
            switch (options.scope) {
                case 'full':
                    content = fullContent;
                    break;
                case 'row':
                    if (options.selection.rowNumber === undefined) {
                        throw new Error('Row number required for row scope');
                    }
                    content = this.extractRowContent(fullContent, options.selection.rowNumber);
                    break;
                case 'stack':
                    if (options.selection.rowNumber === undefined || options.selection.stackIndex === undefined) {
                        throw new Error('Row number and stack index required for stack scope');
                    }
                    content = this.extractStackContent(fullContent, options.selection.rowNumber, options.selection.stackIndex);
                    break;
                case 'column':
                    if (options.selection.columnIndex === undefined) {
                        throw new Error('Column index required for column scope');
                    }
                    content = this.extractColumnContent(fullContent, options.selection.columnIndex);
                    break;
                case 'task':
                    if (options.selection.columnIndex === undefined) {
                        throw new Error('Column index required for task scope');
                    }
                    const columnContent = this.extractColumnContent(fullContent, options.selection.columnIndex);
                    content = columnContent ? this.extractTaskContent(columnContent, options.selection.taskId) : null;
                    break;
            }

            if (!content) {
                throw new Error(`Could not extract content for scope: ${options.scope}`);
            }

            // Apply tag filtering
            let processedContent = this.applyTagFiltering(content, {
                targetFolder: '',
                includeFiles: false,
                includeImages: false,
                includeVideos: false,
                includeOtherMedia: false,
                includeDocuments: false,
                fileSizeLimitMB: 100,
                tagVisibility: options.tagVisibility
            });

            // Convert format if needed
            if (options.format === 'presentation') {
                processedContent = this.convertToPresentationFormat(processedContent);
            }

            // If no pack, just return content (for copy operations)
            if (!options.packAssets || !options.targetFolder) {
                return {
                    success: true,
                    message: 'Content generated successfully',
                    content: processedContent
                };
            }

            // Pack assets if requested
            const sourceDir = path.dirname(sourcePath);
            const sourceBasename = path.basename(sourcePath, '.md');
            const scopeSuffix = options.scope === 'full' ? '' : `-${options.scope}`;
            const targetBasename = `${sourceBasename}${scopeSuffix}`;

            // Ensure target folder exists
            if (!fs.existsSync(options.targetFolder)) {
                fs.mkdirSync(options.targetFolder, { recursive: true });
            }

            // Clear tracking maps
            this.fileHashMap.clear();
            this.exportedFiles.clear();

            // Process with asset packing
            const result = await this.processMarkdownContent(
                processedContent,
                sourceDir,
                targetBasename,
                options.targetFolder,
                {
                    targetFolder: options.targetFolder,
                    includeFiles: options.packOptions?.includeFiles ?? false,
                    includeImages: options.packOptions?.includeImages ?? false,
                    includeVideos: options.packOptions?.includeVideos ?? false,
                    includeOtherMedia: options.packOptions?.includeOtherMedia ?? false,
                    includeDocuments: options.packOptions?.includeDocuments ?? false,
                    fileSizeLimitMB: options.packOptions?.fileSizeLimitMB ?? 100,
                    tagVisibility: options.tagVisibility
                },
                new Set<string>()
            );

            // Write the markdown file
            const targetMarkdownPath = path.join(options.targetFolder, `${targetBasename}.md`);
            fs.writeFileSync(targetMarkdownPath, result.exportedContent, 'utf8');

            // Create _not_included.md if needed
            if (result.notIncludedAssets.length > 0) {
                await this.createNotIncludedFile(result.notIncludedAssets, options.targetFolder);
            }

            const successMessage = `Export completed! ${result.stats.includedCount} assets included, ${result.stats.excludedCount} excluded.`;

            return {
                success: true,
                message: successMessage,
                exportedPath: targetMarkdownPath
            };

        } catch (error) {
            console.error('[kanban.exportService.exportUnified] Export failed:', error);
            return {
                success: false,
                message: `Export failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}