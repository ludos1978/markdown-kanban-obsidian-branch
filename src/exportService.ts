import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { TagUtils, TagVisibility } from './utils/tagUtils';
import { MarkdownKanbanParser } from './markdownParser';
import { PresentationParser } from './presentationParser';
import { ContentPipelineService } from './services/ContentPipelineService';
import { OperationOptionsBuilder, OperationOptions, FormatStrategy } from './services/OperationOptions';
import { PathResolver } from './services/PathResolver';
import { MarpConverter, MarpConversionOptions } from './services/MarpConverter';
import { MarpExportService, MarpOutputFormat } from './services/MarpExportService';

export type ExportScope = 'full' | 'row' | 'stack' | 'column' | 'task';
export type ExportFormat = 'keep' | 'kanban' | 'presentation' | 'marp-markdown' | 'marp-pdf' | 'marp-pptx' | 'marp-html';

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
    mergeIncludes?: boolean;  // If true, merge all includes into one file; if false, keep as separate files
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
    // New export behavior options
    autoExportOnSave?: boolean;  // If true, automatically re-export when file is saved
    openAfterExport?: boolean;   // If true, open exported file in browser/viewer after export
    marpTheme?: string;           // Marp theme (for Marp exports)
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
    // For taskinclude, match the entire task line including the checkbox prefix
    // This prevents checkbox duplication when replacing with converted content
    private static readonly TASK_INCLUDE_PATTERN = /^(\s*)-\s*\[\s*\]\s*!!!taskinclude\s*\(([^)]+)\)\s*!!!/gm;
    // For columninclude, match the entire column header line
    // Captures: prefix title, file path, and suffix (tags/other content)
    private static readonly COLUMN_INCLUDE_PATTERN = /^##\s+(.*?)!!!columninclude\s*\(([^)]+)\)\s*!!!(.*?)$/gm;

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
     * Ensure YAML frontmatter exists in kanban content
     * Adds standard kanban YAML header if not present
     */
    private static ensureYamlFrontmatter(content: string): string {
        // Check if content already has YAML frontmatter
        const hasYaml = content.trim().startsWith('---');

        if (hasYaml) {
            // Already has YAML, return as-is
            return content;
        }

        // Add standard kanban YAML frontmatter
        const yamlHeader = '---\n\nkanban-plugin: board\n\n---\n\n';
        return yamlHeader + content;
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

            // Ensure YAML frontmatter (exportWithAssets always exports kanban format)
            exportedContent = this.ensureYamlFrontmatter(exportedContent);

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

            // Ensure YAML frontmatter (column export is kanban format)
            exportedContent = this.ensureYamlFrontmatter(exportedContent);

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
        processedIncludes: Set<string>,
        convertToPresentation: boolean = false
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
            processedIncludes,
            convertToPresentation
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
        convertToPresentation: boolean = false,
        mergeIncludes: boolean = false
    ): Promise<{ processedContent: string; includeStats: number }> {
        if (!options.includeFiles) {
            return { processedContent: content, includeStats: 0 };
        }

        let processedContent = content;
        let includeCount = 0;

        // Define include patterns and their replacement formats
        // If mergeIncludes is true, don't write separate files for ANY includes
        // Otherwise, write separate files for all include types
        const includePatterns = [
            {
                pattern: this.INCLUDE_PATTERN,
                replacement: (filename: string, prefixTitle: string = '', suffix: string = '') => `!!!include(${filename})!!!`,
                shouldWriteSeparateFile: !mergeIncludes,
                includeType: 'include'
            },
            {
                pattern: this.TASK_INCLUDE_PATTERN,
                replacement: (filename: string, prefixTitle: string = '', suffix: string = '') => `${prefixTitle}- [ ] !!!taskinclude(${filename})!!!`,
                shouldWriteSeparateFile: !mergeIncludes,
                includeType: 'taskinclude'
            },
            {
                pattern: this.COLUMN_INCLUDE_PATTERN,
                replacement: (filename: string, prefixTitle: string = '', suffix: string = '') => `## ${prefixTitle}!!!columninclude(${filename})!!!${suffix}`,
                shouldWriteSeparateFile: !mergeIncludes,
                includeType: 'columninclude'
            }
        ];

        // Process each include pattern
        for (const { pattern, replacement, shouldWriteSeparateFile, includeType } of includePatterns) {
            const regex = new RegExp(pattern.source, pattern.flags);
            console.log(`[kanban.exportService.processIncludedFiles] Searching with pattern: ${pattern.source}`);

            // Collect all matches first before modifying content
            const matches: RegExpExecArray[] = [];
            let match;
            while ((match = regex.exec(processedContent)) !== null) {
                matches.push(match);
            }

            // Process matches in reverse order to maintain correct string positions
            for (let i = matches.length - 1; i >= 0; i--) {
                match = matches[i];
                console.log(`[kanban.exportService.processIncludedFiles] Found match: ${match[0]}`);

                // Extract data based on include type
                // taskinclude: match[1]=indentation, match[2]=path
                // columninclude: match[1]=prefixTitle, match[2]=path, match[3]=suffix
                // include: match[1]=path
                let prefixTitle = '';
                let suffix = '';
                let includePath = '';

                if (includeType === 'taskinclude') {
                    prefixTitle = match[1]; // indentation
                    includePath = match[2].trim();
                } else if (includeType === 'columninclude') {
                    prefixTitle = match[1].trim();
                    includePath = match[2].trim();
                    suffix = match[3].trim();
                } else {
                    includePath = match[1].trim();
                }

                console.log(`[kanban.exportService.processIncludedFiles]   includePath: "${includePath}"`);
                // PathResolver.resolve() handles URL decoding
                const resolvedPath = PathResolver.resolve(sourceDir, includePath);
                console.log(`[kanban.exportService.processIncludedFiles]   resolvedPath: "${resolvedPath}"`);
                console.log(`[kanban.exportService.processIncludedFiles]   exists: ${fs.existsSync(resolvedPath)}`);

                // Avoid circular references
                if (processedIncludes.has(resolvedPath)) {
                    console.log(`[kanban.exportService.processIncludedFiles]   Skipping (circular reference)`);
                    continue;
                }

                if (fs.existsSync(resolvedPath) && path.extname(resolvedPath) === '.md') {
                    processedIncludes.add(resolvedPath);
                    includeCount++;

                    const includeBasename = path.basename(resolvedPath, '.md');

                    console.log(`[kanban.exportService.processIncludedFiles] Processing include: ${resolvedPath}`);
                    console.log(`[kanban.exportService.processIncludedFiles]   mergeIncludes: ${mergeIncludes}, shouldWriteSeparateFile: ${shouldWriteSeparateFile}`);

                    // Detect if the included file is already in presentation format
                    const includeContent = fs.readFileSync(resolvedPath, 'utf8');
                    const isKanbanFormat = includeContent.includes('kanban-plugin: board');

                    // Determine if we need to convert the include file
                    let shouldConvertInclude = false;
                    if (convertToPresentation) {
                        // Exporting to presentation: convert if include is kanban format
                        shouldConvertInclude = isKanbanFormat;
                    } else if (mergeIncludes && !isKanbanFormat) {
                        // Exporting to kanban AND merging: convert if include is NOT kanban format
                        // When merging into a kanban file, presentation includes must be converted to kanban
                        // This will be handled differently - we need to convert presentation to kanban
                        console.log(`[kanban.exportService.processIncludedFiles]   Include is presentation format, needs conversion to kanban for merge`);
                    }

                    console.log(`[kanban.exportService.processIncludedFiles]   isKanbanFormat: ${isKanbanFormat}, shouldConvertInclude: ${shouldConvertInclude}`);

                    // Process the included file recursively
                    // IMPORTANT: When merging into presentation, don't convert - keep raw format
                    const shouldProcessInclude = !mergeIncludes || shouldConvertInclude;
                    let exportedContent: string;

                    if (shouldProcessInclude) {
                        const result = await this.processMarkdownFile(
                            resolvedPath,
                            exportFolder,
                            includeBasename,
                            options,
                            processedIncludes,
                            shouldConvertInclude
                        );
                        exportedContent = result.exportedContent;
                    } else {
                        // When merging, use raw content without processing
                        // This preserves ## headers and slide structure
                        console.log(`[kanban.exportService.processIncludedFiles]   Using raw content for merge (no conversion)`);
                        exportedContent = includeContent;
                    }

                    // If merging into kanban format and include is presentation format,
                    // convert presentation slides to kanban tasks
                    if (mergeIncludes && !convertToPresentation && !isKanbanFormat) {
                        console.log(`[kanban.exportService.processIncludedFiles]   Converting presentation to kanban format for merge`);
                        exportedContent = this.convertPresentationToKanban(exportedContent, match[0]);
                    }

                    if (shouldWriteSeparateFile) {
                        // Mode: Keep separate files
                        // Calculate MD5 for duplicate detection
                        const includeBuffer = Buffer.from(exportedContent, 'utf8');
                        const md5Hash = crypto.createHash('md5').update(includeBuffer).digest('hex');

                        // Check if we already exported this exact content
                        let exportedRelativePath: string;
                        if (this.exportedFiles.has(md5Hash)) {
                            // Use existing exported file
                            const existingPath = this.exportedFiles.get(md5Hash)!;
                            exportedRelativePath = path.relative(exportFolder, existingPath).replace(/\\/g, '/');
                            console.log(`[kanban.exportService.processIncludedFiles]   Reusing existing file (MD5 match): ${exportedRelativePath}`);
                        } else {
                            // Generate unique filename if needed
                            const fileName = path.basename(resolvedPath);
                            const ext = path.extname(fileName);
                            const nameWithoutExt = path.basename(fileName, ext);

                            let targetIncludePath = path.join(exportFolder, fileName);
                            let exportedFileName = fileName;
                            let index = 1;

                            // Check for filename conflicts
                            while (fs.existsSync(targetIncludePath)) {
                                const existingContent = fs.readFileSync(targetIncludePath, 'utf8');
                                const existingHash = crypto.createHash('md5').update(existingContent, 'utf8').digest('hex');
                                if (existingHash === md5Hash) {
                                    // Same content, use existing file
                                    break;
                                }
                                // Different content with same name, create alternative name
                                exportedFileName = `${nameWithoutExt}-${index}${ext}`;
                                targetIncludePath = path.join(exportFolder, exportedFileName);
                                index++;
                            }

                            // Write the file if not already there
                            if (!fs.existsSync(targetIncludePath)) {
                                fs.writeFileSync(targetIncludePath, exportedContent, 'utf8');
                                this.exportedFiles.set(md5Hash, targetIncludePath);
                                console.log(`[kanban.exportService.processIncludedFiles]   Wrote separate file: ${targetIncludePath}`);
                            } else {
                                console.log(`[kanban.exportService.processIncludedFiles]   File already exists with same content: ${targetIncludePath}`);
                            }

                            exportedRelativePath = exportedFileName;
                        }

                        // Update the marker to reference the exported file
                        processedContent = processedContent.replace(
                            match[0],
                            replacement(exportedRelativePath, prefixTitle, suffix)
                        );
                    } else {
                        // Mode: Merge includes into main file
                        // Replace the marker with the actual content
                        console.log(`[kanban.exportService.processIncludedFiles]   Merging content inline (${exportedContent.length} chars)`);
                        console.log(`[kanban.exportService.processIncludedFiles]   First 200 chars: ${exportedContent.substring(0, 200)}`);

                        let contentToInsert = exportedContent;

                        // Handle different include types
                        if (includeType === 'taskinclude' && prefixTitle) {
                            // For taskinclude, apply indentation to each line of merged content
                            contentToInsert = exportedContent.split('\n')
                                .map(line => line ? prefixTitle + line : line)
                                .join('\n');
                        } else if (includeType === 'columninclude') {
                            // For columninclude, reconstruct the column header
                            // Get filename from path
                            const filename = path.basename(includePath);
                            const reconstructedHeader = `## ${prefixTitle}${prefixTitle ? ' ' : ''}${filename}${suffix ? ' ' + suffix : ''}`;
                            // Content should be tasks only (no ## header), so just prepend the header
                            contentToInsert = `${reconstructedHeader}\n${exportedContent}`;
                        }

                        processedContent = processedContent.replace(
                            match[0],
                            contentToInsert
                        );
                    }
                }
            }
        }

        return { processedContent, includeStats: includeCount };
    }

    /**
     * Calculate MD5 hash for file (first 1MB for large files)
     */
    private static async calculateMD5(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            const stats = fs.statSync(filePath);

            let bytesRead = 0;
            const maxBytes = stats.size > 1024 * 1024 ? 1024 * 1024 : stats.size; // 1MB for files > 1MB

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

                // PathResolver.resolve() handles URL decoding
                const resolvedPath = PathResolver.resolve(sourceDir, rawPath);

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
     * Format: {filename}-YYYYMMDD-HHmm (using local time)
     */
    public static generateDefaultExportFolder(sourceDocumentPath: string): string {
        const sourceDir = path.dirname(sourceDocumentPath);
        const sourceBasename = path.basename(sourceDocumentPath, '.md');
        const now = new Date();

        // Use local time instead of UTC (toISOString uses UTC/GMT)
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const timestamp = `${year}${month}${day}-${hours}${minutes}`;  // YYYYMMDD-HHmm

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
        processedIncludes: Set<string>,
        convertToPresentation: boolean = false,
        mergeIncludes: boolean = false
    ): Promise<{
        exportedContent: string;
        notIncludedAssets: AssetInfo[];
        stats: { includedCount: number; excludedCount: number; includeFiles: number };
    }> {
        const mediaFolder = path.join(exportFolder, `${fileBasename}-Media`);

        // Find all assets in the markdown
        const assets = this.findAssets(content, sourceDir);

        // Find and process included markdown files
        console.log(`[kanban.exportService.processMarkdownContent] Before processIncludedFiles, content contains ${content.match(/!!!include/g)?.length || 0} include markers`);
        const { processedContent, includeStats } = await this.processIncludedFiles(
            content,
            sourceDir,
            exportFolder,
            options,
            processedIncludes,
            convertToPresentation,
            mergeIncludes
        );
        console.log(`[kanban.exportService.processMarkdownContent] After processIncludedFiles, content contains ${processedContent.match(/!!!include/g)?.length || 0} include markers`);

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
        let filteredContent = this.applyTagFiltering(modifiedContent, options);

        // Convert to presentation format if requested
        // When merging includes, skip conversion to preserve raw merged content
        console.log(`[kanban.exportService.processMarkdownContent] convertToPresentation: ${convertToPresentation}, mergeIncludes: ${mergeIncludes}`);
        if (convertToPresentation && !mergeIncludes) {
            filteredContent = this.convertToPresentationFormat(filteredContent, false);
            console.log(`[kanban.exportService.processMarkdownContent] After conversion, content contains ${filteredContent.match(/!!!include/g)?.length || 0} include markers`);
        } else if (convertToPresentation && mergeIncludes) {
            console.log(`[kanban.exportService.processMarkdownContent] Skipping conversion - using raw merged content to preserve structure`);
        }

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
     * A stack includes: base column (without #stack) + all consecutive #stack columns after it
     */
    private static extractStackContent(markdownContent: string, rowNumber: number, stackIndex: number): string | null {
        console.log(`[kanban.exportService.extractStackContent] Extracting row ${rowNumber}, stack ${stackIndex}`);

        const isKanban = markdownContent.includes('kanban-plugin: board');
        if (!isKanban) { return null; }

        const lines = markdownContent.split('\n');

        // First, collect all columns in the target row
        const rowColumns: { content: string; stacked: boolean; title: string }[] = [];
        let currentColumn: { content: string[]; row: number; stacked: boolean } | null = null;

        for (const line of lines) {
            if (line.startsWith('## ')) {
                // Save previous column if it's in the target row
                if (currentColumn && currentColumn.row === rowNumber) {
                    rowColumns.push({
                        content: currentColumn.content.join('\n'),
                        stacked: currentColumn.stacked,
                        title: currentColumn.content[0]
                    });
                }

                // Start new column
                const columnRow = this.getColumnRow(line);
                const isStacked = this.isColumnStacked(line);
                currentColumn = { content: [line], row: columnRow, stacked: isStacked };
            } else if (currentColumn) {
                currentColumn.content.push(line);
            }
        }

        // Don't forget the last column
        if (currentColumn && currentColumn.row === rowNumber) {
            rowColumns.push({
                content: currentColumn.content.join('\n'),
                stacked: currentColumn.stacked,
                title: currentColumn.content[0]
            });
        }

        console.log(`[kanban.exportService.extractStackContent] Found ${rowColumns.length} columns in row ${rowNumber}:`);
        rowColumns.forEach((col, i) => {
            console.log(`  [${i}] stacked:${col.stacked} title:"${col.title}"`);
        });

        // Now group columns into stacks (matching frontend logic)
        // A stack is: base column + all consecutive #stack columns
        const stacks: string[][] = [];
        let i = 0;

        while (i < rowColumns.length) {
            const currentStack = [rowColumns[i].content]; // Start with base column
            console.log(`[kanban.exportService.extractStackContent] Starting stack ${stacks.length} with base: "${rowColumns[i].title}"`);
            i++;

            // Add all consecutive #stack columns to this stack
            while (i < rowColumns.length && rowColumns[i].stacked) {
                console.log(`[kanban.exportService.extractStackContent]   Adding stacked: "${rowColumns[i].title}"`);
                currentStack.push(rowColumns[i].content);
                i++;
            }

            console.log(`[kanban.exportService.extractStackContent] Stack ${stacks.length} has ${currentStack.length} columns`);
            stacks.push(currentStack);
        }

        console.log(`[kanban.exportService.extractStackContent] Total stacks: ${stacks.length}, requesting index: ${stackIndex}`);

        if (stackIndex >= stacks.length) {
            console.log(`[kanban.exportService.extractStackContent] Stack index ${stackIndex} out of bounds (only ${stacks.length} stacks)`);
            return null;
        }

        const result = stacks[stackIndex].join('\n\n');
        console.log(`[kanban.exportService.extractStackContent] Returning stack ${stackIndex} with ${stacks[stackIndex].length} columns, ${result.split('## ').length - 1} column headers`);
        return result;
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
     * Convert presentation format to kanban format
     * For column includes and task includes that are in presentation format
     */
    private static convertPresentationToKanban(presentationContent: string, includeMarker: string): string {
        console.log('[kanban.exportService.convertPresentationToKanban] Converting presentation to kanban format');

        // Determine the include type from the marker
        const isColumnInclude = includeMarker.includes('!!!columninclude');
        const isTaskInclude = includeMarker.includes('!!!taskinclude');

        // Parse presentation content into slides
        const slides = PresentationParser.parsePresentation(presentationContent);

        if (isColumnInclude) {
            // Convert slides to tasks ONLY (no column header)
            // The column header is reconstructed in processIncludedFiles using the prefix title, filename, and suffix
            // All slides become tasks (including the first one)
            if (slides.length === 0) return '';

            let kanbanContent = '';
            const tasks = PresentationParser.slidesToTasks(slides);
            for (const task of tasks) {
                kanbanContent += `- [ ] ${task.title}\n`;
                if (task.description) {
                    // Indent description lines
                    const descLines = task.description.split('\n');
                    for (const line of descLines) {
                        kanbanContent += `  ${line}\n`;
                    }
                }
            }

            console.log(`[kanban.exportService.convertPresentationToKanban] Converted ${slides.length} slides to ${tasks.length} tasks (columninclude - no header)`);
            return kanbanContent;

        } else if (isTaskInclude) {
            // For taskinclude, use raw presentation content as single task
            // First non-empty line becomes task title, rest becomes description
            // This preserves all formatting including --- separators
            const lines = presentationContent.split('\n');
            let title = '';
            let description = '';
            let titleIndex = -1;

            // Find first non-empty line for title
            for (let i = 0; i < lines.length; i++) {
                if (lines[i].trim()) {
                    title = lines[i].trim();
                    titleIndex = i;
                    break;
                }
            }

            // Everything after title becomes description (preserving --- and all content)
            if (titleIndex >= 0 && titleIndex < lines.length - 1) {
                description = lines.slice(titleIndex + 1).join('\n').trim();
            }

            let kanbanContent = `- [ ] ${title || 'Untitled'}\n`;
            if (description) {
                const descLines = description.split('\n');
                for (const line of descLines) {
                    kanbanContent += `  ${line}\n`;
                }
            }

            console.log(`[kanban.exportService.convertPresentationToKanban] Converted taskinclude to single task with title: "${title}"`);
            return kanbanContent;

        } else {
            // Regular include - just return as-is or wrapped in a column
            console.log(`[kanban.exportService.convertPresentationToKanban] Regular include, returning as-is`);
            return presentationContent;
        }
    }

    /**
     * Convert kanban format to presentation format
     * Each task becomes a slide separated by ---
     * Column titles are included as slides before their tasks
     * Task checkboxes (- [ ]) are removed from titles
     *
     * @param content - The kanban content to convert
     * @param mergeIncludes - If true, preserve column structure without separating tasks into slides
     */
    private static convertToPresentationFormat(content: string, mergeIncludes: boolean = false): string {
        console.log(`[kanban.exportService.convertToPresentationFormat] Converting to presentation format, mergeIncludes: ${mergeIncludes}`);

        // Add temporary YAML header if missing (needed for parser)
        let contentToParse = content;
        const hasYaml = content.trim().startsWith('---');

        if (!hasYaml) {
            contentToParse = '---\nkanban-plugin: board\n---\n\n' + content;
            console.log('[kanban.exportService.convertToPresentationFormat] Added temporary YAML header for parsing');
        }

        // Parse the kanban content to extract tasks
        const { board } = MarkdownKanbanParser.parseMarkdown(contentToParse);

        if (!board.valid) {
            console.log('[kanban.exportService.convertToPresentationFormat] No valid kanban board found after adding YAML, returning original content');
            return content;
        }

        if (board.columns.length === 0) {
            console.log('[kanban.exportService.convertToPresentationFormat] No columns found');
            return '';
        }

        if (mergeIncludes) {
            // When merging includes, preserve column structure
            // Don't split tasks into individual slides
            let presentationContent = '';

            for (const column of board.columns) {
                const columnTitle = column.title.trim();
                console.log(`[kanban.exportService.convertToPresentationFormat] Column: "${columnTitle}"`);

                // Add column as a section with ## header
                if (columnTitle) {
                    presentationContent += `## ${columnTitle}\n\n`;
                }

                // Add tasks under the column (not as separate slides)
                if (column.tasks && column.tasks.length > 0) {
                    for (const task of column.tasks) {
                        // Add task with its title and description
                        const taskTitle = task.title.replace(/^- \[ \]\s*/, '').trim();
                        presentationContent += `${taskTitle}\n`;

                        if (task.description && task.description.trim()) {
                            presentationContent += `\n${task.description.trim()}\n`;
                        }
                        presentationContent += '\n';
                    }
                }

                // Separate columns with slide separator
                presentationContent += '---\n\n';
            }

            console.log(`[kanban.exportService.convertToPresentationFormat] Preserved column structure for ${board.columns.length} columns (mergeIncludes mode)`);
            return presentationContent;

        } else {
            // Build slides with column titles as section headers
            const slides: string[] = [];

            for (const column of board.columns) {
                // Add column title as a slide
                // The parser already removed "## " from column.title, just use it directly
                const columnTitle = column.title.trim();

                console.log(`[kanban.exportService.convertToPresentationFormat] Column title: "${columnTitle}"`);

                // Add the column title as-is (parser already stripped the kanban ## structure)
                if (columnTitle) {
                    slides.push(columnTitle);
                    console.log(`[kanban.exportService.convertToPresentationFormat]   Added column title as slide`);
                }

                // Convert column tasks to slides
                if (column.tasks && column.tasks.length > 0) {
                    const columnSlides = PresentationParser.tasksToPresentation(column.tasks);
                    // Remove the trailing newline from tasksToPresentation and split by slide separator
                    const taskSlideArray = columnSlides.trim().split(/\n\n---\n\n/);
                    slides.push(...taskSlideArray);
                }
            }

            console.log(`[kanban.exportService.convertToPresentationFormat] Converted ${board.columns.length} columns with column titles as slides`);

            // Join all slides with separator
            const presentationContent = slides.join('\n\n---\n\n') + '\n';

            return presentationContent;
        }
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

            // For copy operations (no pack), apply tag filtering and format conversion
            if (!options.packAssets || !options.targetFolder) {
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

                return {
                    success: true,
                    message: 'Content generated successfully',
                    content: processedContent
                };
            }

            // Pack assets if requested
            const sourceDir = path.dirname(sourcePath);
            const sourceBasename = path.basename(sourcePath, '.md');

            // Build scope suffix with indices
            let scopeSuffix = '';
            if (options.scope !== 'full') {
                const parts: string[] = [];

                if (options.selection.rowNumber !== undefined) {
                    parts.push(`row${options.selection.rowNumber}`);
                }
                if (options.selection.stackIndex !== undefined) {
                    parts.push(`stack${options.selection.stackIndex}`);
                }
                if (options.selection.columnIndex !== undefined) {
                    parts.push(`col${options.selection.columnIndex}`);
                }

                // If no indices specified, just use scope name
                if (parts.length === 0) {
                    scopeSuffix = `-${options.scope}`;
                } else {
                    scopeSuffix = `-${parts.join('-')}`;
                }
            }

            const targetBasename = `${sourceBasename}${scopeSuffix}`;

            console.log(`[kanban.exportService.exportUnified] Format: ${options.format}, Will convert to presentation: ${options.format === 'presentation'}`);

            // Ensure target folder exists
            if (!fs.existsSync(options.targetFolder)) {
                fs.mkdirSync(options.targetFolder, { recursive: true });
            }

            // Clear tracking maps
            this.fileHashMap.clear();
            this.exportedFiles.clear();

            // Process with asset packing
            // Pass raw content - processMarkdownContent will handle tag filtering and format conversion
            const convertToPresentation = options.format === 'presentation';
            // For scoped exports (not full), merge includes by default unless explicitly set
            const mergeIncludes = options.mergeIncludes ?? (options.scope !== 'full');
            console.log(`[kanban.exportService.exportUnified] Scope: ${options.scope}, mergeIncludes: ${mergeIncludes}, convertToPresentation: ${convertToPresentation}`);

            const exportOptions = {
                targetFolder: options.targetFolder,
                includeFiles: options.packOptions?.includeFiles ?? false,
                includeImages: options.packOptions?.includeImages ?? false,
                includeVideos: options.packOptions?.includeVideos ?? false,
                includeOtherMedia: options.packOptions?.includeOtherMedia ?? false,
                includeDocuments: options.packOptions?.includeDocuments ?? false,
                fileSizeLimitMB: options.packOptions?.fileSizeLimitMB ?? 100,
                tagVisibility: options.tagVisibility
            };
            console.log(`[kanban.exportService.exportUnified] Export options:`, exportOptions);

            const result = await this.processMarkdownContent(
                content,
                sourceDir,
                targetBasename,
                options.targetFolder,
                exportOptions,
                new Set<string>(),
                convertToPresentation,
                mergeIncludes
            );

            // Ensure YAML frontmatter for kanban format exports
            let finalContent = result.exportedContent;
            if (options.format === 'kanban' || options.format === 'keep') {
                finalContent = this.ensureYamlFrontmatter(finalContent);
            }

            // Write the markdown file
            const targetMarkdownPath = path.join(options.targetFolder, `${targetBasename}.md`);
            fs.writeFileSync(targetMarkdownPath, finalContent, 'utf8');

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

    /**
     * Export using ContentPipelineService (v2 implementation)
     *
     * This is the new unified export that uses the ContentPipelineService
     * for all processing. It coexists with the old exportUnified() method
     * to allow gradual migration and testing.
     *
     * @param sourceDocument Source document to export from
     * @param options Export options
     * @returns Export result
     */
    public static async exportUnifiedV2(
        sourceDocument: vscode.TextDocument,
        options: UnifiedExportOptions
    ): Promise<{ success: boolean; message: string; content?: string; exportedPath?: string }> {
        try {
            const sourcePath = sourceDocument.uri.fsPath;

            // Read source content
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source file not found: ${sourcePath}`);
            }
            const fullContent = fs.readFileSync(sourcePath, 'utf8');

            // Step 1: Extract content based on scope (reuse existing extraction methods)
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

            // Step 2: Apply tag filtering (still needed, not part of pipeline)
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

            // Step 3: For copy operations (no pack), return processed content
            if (!options.packAssets || !options.targetFolder) {
                // Convert format if needed using ContentPipelineService
                const formatStrategy: FormatStrategy = options.format === 'presentation' ? 'presentation' : 'keep';

                if (formatStrategy !== 'keep') {
                    const tempOptions = new OperationOptionsBuilder()
                        .operation('export')
                        .source(sourcePath)
                        .format(formatStrategy)
                        .build();

                    // Just use FormatConverter directly for in-memory conversion
                    const { FormatConverter } = require('./services/FormatConverter');
                    processedContent = FormatConverter.convert(processedContent, formatStrategy);
                }

                // Ensure YAML frontmatter for kanban format exports
                if (options.format === 'kanban' || options.format === 'keep') {
                    processedContent = this.ensureYamlFrontmatter(processedContent);
                }

                return {
                    success: true,
                    message: 'Content generated successfully',
                    content: processedContent
                };
            }

            // Step 4: Pack assets using ContentPipelineService
            const sourceDir = path.dirname(sourcePath);
            const sourceBasename = path.basename(sourcePath, '.md');

            // Build scope suffix with indices
            let scopeSuffix = '';
            if (options.scope !== 'full') {
                const parts: string[] = [];

                if (options.selection.rowNumber !== undefined) {
                    parts.push(`row${options.selection.rowNumber}`);
                }
                if (options.selection.stackIndex !== undefined) {
                    parts.push(`stack${options.selection.stackIndex}`);
                }
                if (options.selection.columnIndex !== undefined) {
                    parts.push(`col${options.selection.columnIndex}`);
                }

                if (parts.length === 0) {
                    scopeSuffix = `-${options.scope}`;
                } else {
                    scopeSuffix = `-${parts.join('-')}`;
                }
            }

            const targetBasename = `${sourceBasename}${scopeSuffix}`;
            const targetFolder = options.targetFolder || this.generateDefaultExportFolder(sourcePath);

            // Step 5: Build OperationOptions for ContentPipelineService
            const formatStrategy: FormatStrategy = options.format === 'presentation' ? 'presentation' : 'keep';
            const mergeIncludes = options.mergeIncludes ?? (options.scope !== 'full');

            const pipelineOptions = new OperationOptionsBuilder()
                .operation('export')
                .source(sourcePath)
                .targetDir(targetFolder)
                .targetFilename(`${targetBasename}.md`)
                .format(formatStrategy)
                .scope(options.scope as any)
                .includes({
                    strategy: mergeIncludes ? 'merge' : 'separate',
                    processTypes: ['include', 'columninclude', 'taskinclude'],
                    resolveNested: true,
                    maxDepth: 10
                })
                .exportOptions({
                    includeAssets: options.packAssets && (
                        (options.packOptions?.includeImages ?? false) ||
                        (options.packOptions?.includeVideos ?? false) ||
                        (options.packOptions?.includeOtherMedia ?? false) ||
                        (options.packOptions?.includeDocuments ?? false)
                    ),
                    assetStrategy: options.packAssets ? 'copy' : 'ignore',
                    preserveYaml: true
                })
                .build();

            // Step 6: Execute pipeline with extracted content
            const result = await ContentPipelineService.execute(processedContent, pipelineOptions);

            if (!result.success) {
                throw new Error(result.errors?.join('; ') || 'Export failed');
            }

            // Step 7: Build success message
            const mainFile = result.filesWritten.find(f => f.type === 'main');
            const includeCount = result.filesWritten.filter(f => f.type === 'include').length;
            const assetCount = result.filesWritten.filter(f => f.type === 'asset').length;

            const successMessage = `Export completed! ${includeCount} includes, ${assetCount} assets included. Time: ${result.executionTime}ms`;

            return {
                success: true,
                message: successMessage,
                exportedPath: mainFile?.path
            };

        } catch (error) {
            console.error('[kanban.exportService.exportUnifiedV2] Export failed:', error);
            return {
                success: false,
                message: `Export failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }

    /**
     * Export using Marp (markdown, PDF, PPTX, or HTML)
     * @param sourceDocument Source document to export from
     * @param options Export options
     * @returns Export result
     */
    public static async exportWithMarp(
        sourceDocument: vscode.TextDocument,
        options: UnifiedExportOptions & {
            marpTheme?: string;
            marpEnginePath?: string;
        }
    ): Promise<{ success: boolean; message: string; exportedPath?: string }> {
        try {
            const sourcePath = sourceDocument.uri.fsPath;

            // Read source content
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

            // FIRST: Convert kanban to presentation format (slides separated by ---)
            // This matches the "Convert to Presentation Format" export option
            console.log('[kanban.exportService.exportWithMarp] Converting to presentation format first');
            processedContent = this.convertToPresentationFormat(processedContent, false);

            // THEN: Add Marp directives (frontmatter) on top of the presentation content
            const marpOptions: MarpConversionOptions = {
                theme: options.marpTheme,
                tagVisibility: options.tagVisibility,
                preserveYaml: true
            };

            // Just add Marp frontmatter to the already-converted presentation content
            const marpMarkdown = MarpConverter.addMarpDirectives(processedContent, marpOptions);

            // Determine output format and path
            let outputFormat: MarpOutputFormat;
            let outputPath: string;

            if (!options.targetFolder) {
                throw new Error('Target folder is required for Marp export');
            }

            const sourceBasename = path.basename(sourcePath, '.md');

            // Build scope suffix
            let scopeSuffix = '';
            if (options.scope !== 'full') {
                const parts: string[] = [];
                if (options.selection.rowNumber !== undefined) {
                    parts.push(`row${options.selection.rowNumber}`);
                }
                if (options.selection.stackIndex !== undefined) {
                    parts.push(`stack${options.selection.stackIndex}`);
                }
                if (options.selection.columnIndex !== undefined) {
                    parts.push(`col${options.selection.columnIndex}`);
                }
                scopeSuffix = parts.length > 0 ? `-${parts.join('-')}` : `-${options.scope}`;
            }

            const targetBasename = `${sourceBasename}${scopeSuffix}`;

            // Ensure target folder exists
            if (!fs.existsSync(options.targetFolder)) {
                fs.mkdirSync(options.targetFolder, { recursive: true });
            }

            // Determine output format from options.format
            switch (options.format) {
                case 'marp-markdown':
                    outputFormat = 'markdown';
                    outputPath = path.join(options.targetFolder, `${targetBasename}-marp.md`);
                    // Just save the Marp markdown
                    fs.writeFileSync(outputPath, marpMarkdown, 'utf-8');
                    return {
                        success: true,
                        message: `Marp markdown exported to ${outputPath}`,
                        exportedPath: outputPath
                    };

                case 'marp-pdf':
                    outputFormat = 'pdf';
                    outputPath = path.join(options.targetFolder, `${targetBasename}.pdf`);
                    break;

                case 'marp-pptx':
                    outputFormat = 'pptx';
                    outputPath = path.join(options.targetFolder, `${targetBasename}.pptx`);
                    break;

                case 'marp-html':
                    outputFormat = 'html';
                    outputPath = path.join(options.targetFolder, `${targetBasename}.html`);
                    break;

                default:
                    throw new Error(`Unsupported Marp export format: ${options.format}`);
            }

            // Export using Marp CLI
            await MarpExportService.export(marpMarkdown, {
                format: outputFormat,
                outputPath,
                enginePath: options.marpEnginePath,
                theme: options.marpTheme,
                allowLocalFiles: true
            });

            return {
                success: true,
                message: `Successfully exported to ${outputFormat.toUpperCase()}: ${outputPath}`,
                exportedPath: outputPath
            };

        } catch (error) {
            console.error('[kanban.exportService.exportWithMarp] Export failed:', error);
            return {
                success: false,
                message: `Marp export failed: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
}