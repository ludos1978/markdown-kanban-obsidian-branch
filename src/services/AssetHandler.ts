import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PathResolver } from './PathResolver';
import { FileWriter } from './FileWriter';
import { AssetStrategy } from './OperationOptions';

/**
 * Unified asset handling utility
 *
 * Consolidates asset processing logic from:
 * - exportService.ts: findAssets, copyAssetsToExportFolder, calculateMD5
 * - kanbanWebviewPanel.ts: Asset path resolution
 */
export class AssetHandler {
    /** Supported image extensions */
    private static readonly IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.bmp', '.ico'];

    /** Supported video extensions */
    private static readonly VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov', '.avi'];

    /** Supported audio extensions */
    private static readonly AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.flac'];

    /**
     * Find all assets referenced in markdown content
     *
     * @param content - Markdown content
     * @param basePath - Base path for resolving relative asset paths
     * @returns List of detected assets
     */
    static findAssets(content: string, basePath: string): AssetInfo[] {
        const assets: AssetInfo[] = [];
        const seenPaths = new Set<string>();

        // Markdown image syntax: ![alt](path)
        const imageRegex = /!\[[^\]]*\]\(([^)]+)\)/g;

        // Markdown link syntax: [text](path)
        const linkRegex = /(?<!!)\[[^\]]*\]\(([^)]+)\)/g;

        // HTML img tags: <img src="path">
        const htmlImgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;

        // HTML video/audio tags: <video src="path">, <audio src="path">
        const htmlMediaRegex = /<(?:video|audio)[^>]+src=["']([^"']+)["'][^>]*>/gi;

        // Process all patterns
        const patterns = [
            { regex: imageRegex, type: 'image' as AssetType },
            { regex: linkRegex, type: 'link' as AssetType },
            { regex: htmlImgRegex, type: 'image' as AssetType },
            { regex: htmlMediaRegex, type: 'media' as AssetType }
        ];

        for (const { regex, type } of patterns) {
            let match;
            while ((match = regex.exec(content)) !== null) {
                const assetPath = match[1].trim();

                // Skip URLs (http://, https://, data:, etc.)
                if (this.isRemoteUrl(assetPath)) {
                    continue;
                }

                // Skip anchor links
                if (assetPath.startsWith('#')) {
                    continue;
                }

                // Remove query params and anchors
                const cleanPath = assetPath.split(/[?#]/)[0];

                try {
                    // Resolve path
                    const decodedPath = decodeURIComponent(cleanPath);
                    const resolvedPath = PathResolver.resolve(basePath, decodedPath);

                    // Skip if already seen
                    if (seenPaths.has(resolvedPath)) {
                        continue;
                    }

                    seenPaths.add(resolvedPath);

                    // Check if file exists
                    if (!fs.existsSync(resolvedPath)) {
                        continue;
                    }

                    // Determine asset type by extension
                    const ext = path.extname(resolvedPath).toLowerCase();
                    const detectedType = this.detectAssetType(ext);

                    assets.push({
                        originalPath: assetPath,
                        resolvedPath: resolvedPath,
                        type: detectedType || type,
                        size: fs.statSync(resolvedPath).size,
                        extension: ext
                    });

                } catch (error) {
                    // Skip invalid paths
                    console.warn(`[AssetHandler] Failed to process asset: ${assetPath}`, error);
                }
            }
        }

        return assets;
    }

    /**
     * Process assets according to strategy
     *
     * @param content - Markdown content with asset references
     * @param basePath - Base path for resolving assets
     * @param targetDir - Target directory for copied assets
     * @param strategy - Asset handling strategy
     * @returns Processed content and asset processing results
     */
    static async processAssets(
        content: string,
        basePath: string,
        targetDir: string,
        strategy: AssetStrategy
    ): Promise<AssetProcessResult> {
        const result: AssetProcessResult = {
            content: content,
            assetsProcessed: 0,
            assetsCopied: 0,
            assetsEmbedded: 0,
            errors: []
        };

        if (strategy === 'ignore') {
            return result;
        }

        // Find all assets
        const assets = this.findAssets(content, basePath);
        result.assetsProcessed = assets.length;

        // Process each asset based on strategy
        for (const asset of assets) {
            try {
                if (strategy === 'copy') {
                    await this.copyAsset(asset, targetDir, result);
                } else if (strategy === 'embed') {
                    await this.embedAsset(asset, content, result);
                } else if (strategy === 'reference') {
                    // Keep original references - no processing needed
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Failed to process asset ${asset.originalPath}: ${errorMsg}`);
            }
        }

        return result;
    }

    /**
     * Copy asset to target directory
     */
    private static async copyAsset(
        asset: AssetInfo,
        targetDir: string,
        result: AssetProcessResult
    ): Promise<void> {
        // Ensure target directory exists
        FileWriter.ensureDirectory(targetDir);

        // Generate target filename (preserve original name, add hash if collision)
        const basename = path.basename(asset.resolvedPath);
        let targetPath = path.join(targetDir, basename);

        // If file already exists and is different, add hash suffix
        if (FileWriter.fileExists(targetPath)) {
            const existingHash = await this.calculateMD5(targetPath);
            const newHash = await this.calculateMD5(asset.resolvedPath);

            if (existingHash !== newHash) {
                const ext = path.extname(basename);
                const name = path.basename(basename, ext);
                targetPath = path.join(targetDir, `${name}_${newHash.substring(0, 8)}${ext}`);
            }
        }

        // Copy file
        fs.copyFileSync(asset.resolvedPath, targetPath);
        result.assetsCopied++;

        // Update content to reference copied asset
        const relativePath = './' + path.basename(targetPath);
        result.content = result.content.replace(asset.originalPath, relativePath);
    }

    /**
     * Embed asset as base64 data URL
     */
    private static async embedAsset(
        asset: AssetInfo,
        content: string,
        result: AssetProcessResult
    ): Promise<void> {
        // Only embed images and small files (< 100KB)
        if (asset.type !== 'image' || asset.size > 100 * 1024) {
            result.errors.push(`Asset too large or wrong type for embedding: ${asset.originalPath}`);
            return;
        }

        // Read file and convert to base64
        const fileContent = fs.readFileSync(asset.resolvedPath);
        const base64 = fileContent.toString('base64');

        // Determine MIME type
        const mimeType = this.getMimeType(asset.extension);

        // Create data URL
        const dataUrl = `data:${mimeType};base64,${base64}`;

        // Replace in content
        result.content = result.content.replace(asset.originalPath, dataUrl);
        result.assetsEmbedded++;
    }

    /**
     * Calculate MD5 hash for a file
     *
     * @param filePath - Path to the file
     * @param maxBytes - Maximum bytes to hash (for large files)
     * @returns MD5 hash
     */
    static async calculateMD5(filePath: string, maxBytes: number = 100 * 1024): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            const stats = fs.statSync(filePath);

            let bytesRead = 0;
            const limit = Math.min(stats.size, maxBytes);

            stream.on('data', (chunk) => {
                bytesRead += chunk.length;
                if (bytesRead <= limit) {
                    hash.update(chunk);
                } else {
                    const remaining = limit - (bytesRead - chunk.length);
                    if (remaining > 0) {
                        hash.update(
                            Buffer.isBuffer(chunk)
                                ? chunk.subarray(0, remaining)
                                : chunk.slice(0, remaining)
                        );
                    }
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
     * Detect asset type from file extension
     */
    private static detectAssetType(extension: string): AssetType | null {
        const ext = extension.toLowerCase();

        if (this.IMAGE_EXTENSIONS.includes(ext)) {
            return 'image';
        }
        if (this.VIDEO_EXTENSIONS.includes(ext)) {
            return 'video';
        }
        if (this.AUDIO_EXTENSIONS.includes(ext)) {
            return 'audio';
        }

        return null;
    }

    /**
     * Check if a path is a remote URL
     */
    private static isRemoteUrl(assetPath: string): boolean {
        return assetPath.startsWith('http://') ||
               assetPath.startsWith('https://') ||
               assetPath.startsWith('data:') ||
               assetPath.startsWith('//');
    }

    /**
     * Get MIME type for file extension
     */
    private static getMimeType(extension: string): string {
        const mimeTypes: Record<string, string> = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
            '.ico': 'image/x-icon',
            '.mp4': 'video/mp4',
            '.webm': 'video/webm',
            '.ogg': 'video/ogg',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4'
        };

        return mimeTypes[extension.toLowerCase()] || 'application/octet-stream';
    }

    /**
     * Get all assets of a specific type
     */
    static getAssetsByType(assets: AssetInfo[], type: AssetType): AssetInfo[] {
        return assets.filter(asset => asset.type === type);
    }

    /**
     * Calculate total size of assets
     */
    static getTotalSize(assets: AssetInfo[]): number {
        return assets.reduce((total, asset) => total + asset.size, 0);
    }

    /**
     * Validate asset paths in content
     */
    static validateAssets(content: string, basePath: string): AssetValidationResult {
        const assets = this.findAssets(content, basePath);
        const missing: string[] = [];
        const broken: string[] = [];

        for (const asset of assets) {
            if (!fs.existsSync(asset.resolvedPath)) {
                missing.push(asset.originalPath);
            } else {
                try {
                    fs.accessSync(asset.resolvedPath, fs.constants.R_OK);
                } catch {
                    broken.push(asset.originalPath);
                }
            }
        }

        return {
            total: assets.length,
            valid: assets.length - missing.length - broken.length,
            missing,
            broken
        };
    }
}

/**
 * Information about an asset
 */
export interface AssetInfo {
    /** Original path as it appears in content */
    originalPath: string;

    /** Resolved absolute path */
    resolvedPath: string;

    /** Asset type */
    type: AssetType;

    /** File size in bytes */
    size: number;

    /** File extension */
    extension: string;
}

/**
 * Asset type classification
 */
export type AssetType = 'image' | 'video' | 'audio' | 'link' | 'media';

/**
 * Result of asset processing
 */
export interface AssetProcessResult {
    /** Processed content with updated asset references */
    content: string;

    /** Total number of assets processed */
    assetsProcessed: number;

    /** Number of assets copied */
    assetsCopied: number;

    /** Number of assets embedded */
    assetsEmbedded: number;

    /** Errors encountered */
    errors: string[];
}

/**
 * Result of asset validation
 */
export interface AssetValidationResult {
    /** Total assets found */
    total: number;

    /** Number of valid assets */
    valid: number;

    /** Missing asset paths */
    missing: string[];

    /** Broken asset paths (exist but unreadable) */
    broken: string[];
}
