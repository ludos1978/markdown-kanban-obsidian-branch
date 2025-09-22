import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';

export interface ExportOptions {
    targetFolder: string;
    includeFiles: boolean;
    includeImages: boolean;
    includeVideos: boolean;
    includeOtherMedia: boolean;
    includeDocuments: boolean;
    fileSizeLimitMB: number;
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
     * Export markdown file with selected assets
     */
    public static async exportWithAssets(
        sourceDocument: vscode.TextDocument,
        options: ExportOptions
    ): Promise<{ success: boolean; message: string; exportedPath?: string }> {
        try {
            console.log('🚀 Starting export process...');
            console.log(`Source file: ${sourceDocument.uri.fsPath}`);
            console.log(`Target folder: ${options.targetFolder}`);
            console.log(`Options:`, options);

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
            console.log('✅ Tracking maps cleared');

            const sourcePath = sourceDocument.uri.fsPath;
            const sourceDir = path.dirname(sourcePath);
            const sourceBasename = path.basename(sourcePath, '.md');

            // Validate source file exists
            if (!fs.existsSync(sourcePath)) {
                throw new Error(`Source markdown file not found: ${sourcePath}`);
            }
            console.log(`✅ Source file exists: ${sourcePath}`);

            // Ensure target folder exists
            try {
                if (!fs.existsSync(options.targetFolder)) {
                    console.log(`📁 Creating target folder: ${options.targetFolder}`);
                    fs.mkdirSync(options.targetFolder, { recursive: true });
                }
                console.log('✅ Target folder ready');
            } catch (error) {
                throw new Error(`Failed to create target folder "${options.targetFolder}": ${error}`);
            }

            // Check write permissions on target folder
            try {
                const testFile = path.join(options.targetFolder, '.write-test');
                fs.writeFileSync(testFile, 'test');
                fs.unlinkSync(testFile);
                console.log('✅ Write permissions confirmed');
            } catch (error) {
                throw new Error(`No write permission for target folder "${options.targetFolder}": ${error}`);
            }

            // Process main markdown file
            console.log('📝 Processing main markdown file...');
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
                console.log(`✅ Markdown processing complete: ${stats.includedCount} assets, ${stats.includeFiles} includes`);
            } catch (error) {
                throw new Error(`Failed to process markdown file "${sourcePath}": ${error}`);
            }

            // Write the main markdown file to export folder
            const targetMarkdownPath = path.join(options.targetFolder, path.basename(sourcePath));
            try {
                console.log(`💾 Writing main markdown to: ${targetMarkdownPath}`);
                fs.writeFileSync(targetMarkdownPath, exportedContent, 'utf8');
                console.log('✅ Main markdown file written');
            } catch (error) {
                throw new Error(`Failed to write main markdown file to "${targetMarkdownPath}": ${error}`);
            }

            // Create _not_included.md if there are excluded assets
            if (notIncludedAssets.length > 0) {
                try {
                    console.log(`📋 Creating _not_included.md with ${notIncludedAssets.length} excluded assets`);
                    await this.createNotIncludedFile(notIncludedAssets, options.targetFolder);
                    console.log('✅ _not_included.md created');
                } catch (error) {
                    console.warn(`Failed to create _not_included.md: ${error}`);
                    // Don't fail the entire export for this
                }
            }

            const successMessage = `Export completed successfully!\n${stats.includedCount} assets included, ${stats.excludedCount} assets excluded.\n${stats.includeFiles} included files processed.`;
            console.log('🎉 Export completed successfully!');

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
        console.log(`  📄 Processing: ${path.basename(markdownPath)}`);

        try {
            const content = fs.readFileSync(markdownPath, 'utf8');
            console.log(`  ✅ File read successfully (${content.length} chars)`);
        } catch (error) {
            throw new Error(`Failed to read markdown file "${markdownPath}": ${error}`);
        }

        const content = fs.readFileSync(markdownPath, 'utf8');
        const sourceDir = path.dirname(markdownPath);
        const mediaFolder = path.join(exportFolder, `${fileBasename}-Media`);

        // Find all assets in the markdown
        console.log(`  🔍 Finding assets in markdown...`);
        const assets = this.findAssets(content, sourceDir);
        console.log(`  ✅ Found ${assets.length} assets`);

        // Find and process included markdown files
        console.log(`  📦 Processing included files...`);
        const { processedContent, includeStats } = await this.processIncludedFiles(
            content,
            sourceDir,
            exportFolder,
            options,
            processedIncludes
        );
        console.log(`  ✅ Processed ${includeStats} included files`);

        // Filter assets based on options
        console.log(`  🎯 Filtering assets based on options...`);
        const assetsToInclude = this.filterAssets(assets, options);
        console.log(`  ✅ ${assetsToInclude.length}/${assets.length} assets will be included`);

        // Process assets and update content
        console.log(`  ⚙️ Processing ${assetsToInclude.length} assets...`);
        const { modifiedContent, notIncludedAssets } = await this.processAssets(
            processedContent,
            assetsToInclude,
            assets,
            mediaFolder,
            fileBasename
        );
        console.log(`  ✅ Asset processing complete`);

        const stats = {
            includedCount: assetsToInclude.length,
            excludedCount: notIncludedAssets.length,
            includeFiles: includeStats
        };

        console.log(`  🎉 Markdown file processing complete: ${stats.includedCount} included, ${stats.excludedCount} excluded, ${stats.includeFiles} includes`);

        return {
            exportedContent: modifiedContent,
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
        processedIncludes: Set<string>
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
                        hash.update(chunk.slice(0, remaining));
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

            stream.on('close', () => {
                // Fallback in case stream is destroyed but hasn't resolved yet
                if (!hash.digest) {
                    resolve(hash.digest('hex'));
                }
            });
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
            { regex: imageRegex, isMedia: true },
            { regex: linkRegex, isMedia: false },
            { regex: htmlImgRegex, isMedia: true },
            { regex: htmlMediaRegex, isMedia: true }
        ];

        patterns.forEach(({ regex, isMedia }) => {
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

        console.log(`    📁 Processing assets for: ${fileBasename}`);

        // Ensure media folder exists if we have assets to include
        if (assetsToInclude.length > 0 && !fs.existsSync(mediaFolder)) {
            console.log(`    📁 Creating media folder: ${mediaFolder}`);
            fs.mkdirSync(mediaFolder, { recursive: true });
        }

        // Copy included assets and modify paths
        let processedCount = 0;
        for (const asset of assetsToInclude) {
            try {
                console.log(`    📄 Processing asset ${++processedCount}/${assetsToInclude.length}: ${path.basename(asset.originalPath)}`);

                // Calculate MD5 for duplicate detection
                console.log(`    🔍 Calculating MD5 for: ${asset.resolvedPath}`);
                const md5 = await this.calculateMD5(asset.resolvedPath);
                console.log(`    ✅ MD5 calculated: ${md5.substring(0, 8)}...`);

                // Check if we already exported this exact file
                if (this.exportedFiles.has(md5)) {
                    console.log(`    ♻️ Reusing existing file (same MD5)`);
                    // Use existing exported file path
                    const existingPath = this.exportedFiles.get(md5)!;
                    // Calculate relative path from the markdown location (export folder root) to the existing asset
                    const markdownLocation = path.dirname(mediaFolder); // This is the export folder

                    // Add null check for existingPath
                    if (!existingPath) {
                        console.error(`    ❌ Existing path is undefined for MD5: ${md5}`);
                        throw new Error(`Existing path is undefined for MD5: ${md5}`);
                    }

                    const relativePath = path.relative(markdownLocation, existingPath).replace(/\\/g, '/');
                    modifiedContent = this.replaceAssetPath(modifiedContent, asset.originalPath, relativePath);
                    continue;
                } else {
                    console.log(`    📋 New file, processing...`);
                }

                // Generate unique filename if needed
                console.log(`    📂 Generating filename for: ${asset.resolvedPath}`);
                const fileName = path.basename(asset.resolvedPath);
                const ext = path.extname(fileName);
                const nameWithoutExt = path.basename(fileName, ext);
                console.log(`    📄 File: ${fileName}, ext: ${ext}, name: ${nameWithoutExt}`);

                let targetPath = path.join(mediaFolder, fileName);
                let exportedFileName = fileName;
                let index = 1;
                console.log(`    🎯 Initial target path: ${targetPath}`);

                // Check for filename conflicts
                console.log(`    🔍 Checking for filename conflicts...`);
                while (fs.existsSync(targetPath)) {
                    console.log(`    ⚠️ File exists, checking MD5: ${targetPath}`);
                    const existingMd5 = await this.calculateMD5(targetPath);
                    console.log(`    🔍 Existing MD5: ${existingMd5.substring(0, 8)}..., Current MD5: ${md5.substring(0, 8)}...`);
                    if (existingMd5 === md5) {
                        console.log(`    ✅ Same file, reusing: ${targetPath}`);
                        // Same file, use it
                        break;
                    }
                    // Different file with same name, create alternative name
                    exportedFileName = `${nameWithoutExt}-${index}${ext}`;
                    targetPath = path.join(mediaFolder, exportedFileName);
                    index++;
                    console.log(`    🔄 Trying alternative name: ${exportedFileName} (index: ${index})`);
                }

                // Copy the file if not already there
                console.log(`    📁 Checking if file needs to be copied: ${targetPath}`);
                if (!fs.existsSync(targetPath)) {
                    console.log(`    📋 Copying file: ${asset.resolvedPath} → ${targetPath}`);
                    fs.copyFileSync(asset.resolvedPath, targetPath);
                    this.exportedFiles.set(md5, targetPath);
                    console.log(`    ✅ File copied and MD5 registered`);
                } else {
                    console.log(`    ✅ File already exists, skipping copy`);
                }

                // Update path in content - use relative path from markdown to media folder
                console.log(`    🔗 Updating content path: ${asset.originalPath} → ${exportedFileName}`);
                const relativePath = path.join(`${fileBasename}-Media`, exportedFileName);
                modifiedContent = this.replaceAssetPath(modifiedContent, asset.originalPath, relativePath);
                console.log(`    ✅ Asset ${processedCount} completed successfully`);

            } catch (error) {
                console.error(`Failed to copy asset ${asset.originalPath}:`, error);
                notIncludedAssets.push(asset);
            }
        }

        console.log(`    ✅ Asset processing complete for ${fileBasename}`);

        // Collect assets that weren't included
        for (const asset of allAssets) {
            if (!includedPaths.has(asset.originalPath) && asset.type !== 'markdown') {
                notIncludedAssets.push(asset);
            }
        }

        console.log(`    📊 Final stats: ${processedCount} processed, ${notIncludedAssets.length} excluded`);

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
     * Generate default export folder name
     */
    public static generateDefaultExportFolder(sourceDocumentPath: string): string {
        const sourceDir = path.dirname(sourceDocumentPath);
        const now = new Date();
        const timestamp = now.toISOString()
            .replace(/[-:]/g, '')  // Remove dashes and colons
            .replace(/\..+/, '')   // Remove milliseconds and timezone
            .replace('T', '-')     // Replace T with single dash
            .substring(0, 13);     // YYYYMMDD-HHmm

        return path.join(sourceDir, `_Export-${timestamp}`);
    }
}