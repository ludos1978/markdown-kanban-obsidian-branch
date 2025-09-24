/**
 * Shared File Type Definitions and Utilities
 * This module provides environment-agnostic file type definitions and utilities
 * that can be used by both Node.js (TypeScript) and browser (JavaScript) environments.
 */

/**
 * File extension definitions (without dots for consistency)
 */
export const FILE_EXTENSIONS = {
    image: [
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
        'ico', 'tiff', 'tif', 'avif', 'heic', 'heif'
    ],
    video: [
        'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv',
        'm4v', '3gp', 'ogv', 'mpg', 'mpeg'
    ],
    audio: [
        'mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'wma',
        'opus', 'aiff', 'au'
    ],
    text: [
        'txt', 'md', 'rst', 'org', 'tex', 'rtf', 'csv',
        'tsv', 'log', 'ini', 'cfg', 'conf'
    ],
    document: [
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'odt', 'ods', 'odp'
    ],
    code: [
        'js', 'ts', 'html', 'css', 'scss', 'sass', 'less',
        'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb',
        'go', 'rs', 'swift', 'kt', 'scala', 'sh', 'bat',
        'ps1', 'json', 'xml', 'yaml', 'yml', 'toml'
    ],
    archive: [
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
        'lzma', 'lz4', 'zst'
    ]
};

/**
 * MIME type mappings for common file extensions
 */
export const MIME_TYPE_MAP: Record<string, string> = {
    // Images
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'bmp': 'image/bmp',
    'svg': 'image/svg+xml',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'tiff': 'image/tiff',
    'tif': 'image/tiff',
    'avif': 'image/avif',
    'heic': 'image/heic',
    'heif': 'image/heif',

    // Videos
    'mp4': 'video/mp4',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'webm': 'video/webm',
    'mkv': 'video/x-matroska',
    'm4v': 'video/x-m4v',
    '3gp': 'video/3gpp',
    'ogv': 'video/ogg',
    'mpg': 'video/mpeg',
    'mpeg': 'video/mpeg',

    // Audio
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'ogg': 'audio/ogg',
    'aac': 'audio/aac',
    'flac': 'audio/flac',
    'm4a': 'audio/x-m4a',
    'wma': 'audio/x-ms-wma',
    'opus': 'audio/opus',
    'aiff': 'audio/aiff',
    'au': 'audio/basic',

    // Text/Markdown
    'txt': 'text/plain',
    'md': 'text/markdown',
    'rst': 'text/x-rst',
    'org': 'text/org',
    'tex': 'text/x-tex',
    'rtf': 'application/rtf',
    'csv': 'text/csv',
    'tsv': 'text/tab-separated-values',
    'log': 'text/plain',
    'ini': 'text/plain',
    'cfg': 'text/plain',
    'conf': 'text/plain',

    // Documents
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'ppt': 'application/vnd.ms-powerpoint',
    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'odt': 'application/vnd.oasis.opendocument.text',
    'ods': 'application/vnd.oasis.opendocument.spreadsheet',
    'odp': 'application/vnd.oasis.opendocument.presentation',

    // Code/Web
    'js': 'text/javascript',
    'ts': 'text/typescript',
    'html': 'text/html',
    'css': 'text/css',
    'scss': 'text/x-scss',
    'sass': 'text/x-sass',
    'less': 'text/x-less',
    'py': 'text/x-python',
    'java': 'text/x-java-source',
    'cpp': 'text/x-c++src',
    'c': 'text/x-csrc',
    'h': 'text/x-chdr',
    'cs': 'text/x-csharp',
    'php': 'text/x-php',
    'rb': 'text/x-ruby',
    'go': 'text/x-go',
    'rs': 'text/x-rust',
    'swift': 'text/x-swift',
    'kt': 'text/x-kotlin',
    'scala': 'text/x-scala',
    'sh': 'text/x-shellscript',
    'bat': 'text/x-msdos-batch',
    'ps1': 'text/x-powershell',
    'json': 'application/json',
    'xml': 'application/xml',
    'yaml': 'text/yaml',
    'yml': 'text/yaml',
    'toml': 'text/x-toml',

    // Archives
    'zip': 'application/zip',
    'rar': 'application/vnd.rar',
    '7z': 'application/x-7z-compressed',
    'tar': 'application/x-tar',
    'gz': 'application/gzip',
    'bz2': 'application/x-bzip2',
    'xz': 'application/x-xz',
    'lzma': 'application/x-lzma',
    'lz4': 'application/x-lz4',
    'zst': 'application/zstd'
};

/**
 * File category type definition
 */
export type FileCategory = 'image' | 'video' | 'audio' | 'text' | 'document' | 'code' | 'archive' | 'unknown';

/**
 * Core utility functions that work in any environment
 */
export class BaseFileTypeUtils {
    /**
     * Normalize file extension by removing leading dot and converting to lowercase
     */
    static normalizeExtension(extension: string): string {
        return extension.startsWith('.') ? extension.slice(1).toLowerCase() : extension.toLowerCase();
    }

    /**
     * Check if text appears to be a file path
     */
    static isFilePath(text: string): boolean {
        if (!text || typeof text !== 'string') {
            return false;
        }

        // Has file extension
        if (!/\.[a-zA-Z0-9]{1,10}$/.test(text)) {
            return false;
        }

        // Basic checks to avoid false positives
        if (text.includes('://')) { return false; } // URLs
        if (text.startsWith('mailto:')) { return false; } // Email links
        if (text.includes('@') && !text.includes('/') && !text.includes('\\')) { return false; } // Email addresses

        return true;
    }

    /**
     * Check if a file extension is in a given category
     */
    static isFileType(extension: string, category: keyof typeof FILE_EXTENSIONS): boolean {
        const normalizedExt = this.normalizeExtension(extension);
        return FILE_EXTENSIONS[category].includes(normalizedExt);
    }

    /**
     * Check if a file is an image based on its extension
     */
    static isImageFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }
        const extension = this.getFileExtension(fileName);
        return this.isFileType(extension, 'image');
    }

    /**
     * Check if a file is a video based on its extension
     */
    static isVideoFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }
        const extension = this.getFileExtension(fileName);
        return this.isFileType(extension, 'video');
    }

    /**
     * Check if a file is an audio file based on its extension
     */
    static isAudioFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }
        const extension = this.getFileExtension(fileName);
        return this.isFileType(extension, 'audio');
    }

    /**
     * Check if a file is a media file (image, video, or audio)
     */
    static isMediaFile(fileName: string): boolean {
        return this.isImageFile(fileName) || this.isVideoFile(fileName) || this.isAudioFile(fileName);
    }

    /**
     * Check if a file is a markdown file
     */
    static isMarkdownFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }
        const extension = this.getFileExtension(fileName);
        return extension === 'md';
    }

    /**
     * Check if a file is a text file based on its extension
     */
    static isTextFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }
        const extension = this.getFileExtension(fileName);
        return this.isFileType(extension, 'text');
    }

    /**
     * Get MIME type for a file extension
     */
    static getMimeType(fileName: string): string {
        if (!fileName || typeof fileName !== 'string') {
            return 'application/octet-stream';
        }
        const extension = this.getFileExtension(fileName);
        return MIME_TYPE_MAP[extension] || 'application/octet-stream';
    }

    /**
     * Get file category based on extension
     */
    static getFileCategory(fileName: string): FileCategory {
        if (!fileName || typeof fileName !== 'string') {
            return 'unknown';
        }

        const extension = this.getFileExtension(fileName);

        for (const [category, extensions] of Object.entries(FILE_EXTENSIONS)) {
            if (extensions.includes(extension)) {
                return category as FileCategory;
            }
        }

        return 'unknown';
    }

    /**
     * Abstract method to get file extension - must be implemented by environment-specific classes
     */
    static getFileExtension(fileName: string): string {
        throw new Error('getFileExtension must be implemented by environment-specific subclass');
    }
}