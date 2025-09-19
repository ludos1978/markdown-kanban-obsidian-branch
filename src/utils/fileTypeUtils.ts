/**
 * File Type Validation Utility Module for TypeScript/Node.js
 * Provides unified file type detection and validation functions
 */

import * as path from 'path';

export class FileTypeUtils {
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
        if (text.includes('://')) return false; // URLs
        if (text.startsWith('mailto:')) return false; // Email links
        if (text.includes('@') && !text.includes('/') && !text.includes('\\')) return false; // Email addresses

        return true;
    }

    /**
     * Check if a file is an image based on its extension
     */
    static isImageFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const imageExtensions = [
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp',
            '.ico', '.tiff', '.tif', '.avif', '.heic', '.heif'
        ];

        const ext = path.extname(fileName).toLowerCase();
        return imageExtensions.includes(ext);
    }

    /**
     * Check if a file is a video based on its extension
     */
    static isVideoFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const videoExtensions = [
            '.mp4', '.mov', '.avi', '.mkv', '.m4v', '.mpg', '.mpeg',
            '.ogv', '.webm', '.wmv', '.flv', '.3gp'
        ];

        const ext = path.extname(fileName).toLowerCase();
        return videoExtensions.includes(ext);
    }

    /**
     * Check if a file is an audio file based on its extension
     */
    static isAudioFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const audioExtensions = [
            '.mp3', '.m4a', '.wav', '.ogg', '.flac', '.aac', '.oga',
            '.wma', '.opus', '.aiff', '.au'
        ];

        const ext = path.extname(fileName).toLowerCase();
        return audioExtensions.includes(ext);
    }

    /**
     * Check if a file is any type of media file (image, video, or audio)
     */
    static isMediaFile(fileName: string): boolean {
        return this.isImageFile(fileName) ||
               this.isVideoFile(fileName) ||
               this.isAudioFile(fileName);
    }

    /**
     * Check if a file is a markdown file
     */
    static isMarkdownFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const markdownExtensions = ['.md', '.markdown', '.mdown', '.mkd', '.mkdn', '.mdx'];
        const ext = path.extname(fileName).toLowerCase();
        return markdownExtensions.includes(ext);
    }

    /**
     * Check if a file is a text file
     */
    static isTextFile(fileName: string): boolean {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const textExtensions = [
            '.txt', '.text', '.log', '.readme', '.json', '.xml', '.yaml', '.yml',
            '.csv', '.tsv', '.ini', '.cfg', '.conf', '.properties'
        ];
        const ext = path.extname(fileName).toLowerCase();
        return textExtensions.includes(ext) || this.isMarkdownFile(fileName);
    }

    /**
     * Get the MIME type for a file based on its extension
     */
    static getMimeType(fileName: string): string {
        if (!fileName || typeof fileName !== 'string') {
            return 'application/octet-stream';
        }

        const ext = path.extname(fileName).toLowerCase().substring(1); // Remove the dot

        // Image MIME types
        const imageMimes: Record<string, string> = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'gif': 'image/gif', 'bmp': 'image/bmp', 'svg': 'image/svg+xml',
            'webp': 'image/webp', 'ico': 'image/x-icon', 'tiff': 'image/tiff',
            'tif': 'image/tiff', 'avif': 'image/avif', 'heic': 'image/heic',
            'heif': 'image/heif'
        };

        // Video MIME types
        const videoMimes: Record<string, string> = {
            'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska', 'm4v': 'video/x-m4v', 'mpg': 'video/mpeg',
            'mpeg': 'video/mpeg', 'ogv': 'video/ogg', 'webm': 'video/webm',
            'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', '3gp': 'video/3gpp'
        };

        // Audio MIME types
        const audioMimes: Record<string, string> = {
            'mp3': 'audio/mpeg', 'm4a': 'audio/x-m4a', 'wav': 'audio/wav',
            'ogg': 'audio/ogg', 'flac': 'audio/flac', 'aac': 'audio/aac',
            'oga': 'audio/ogg', 'wma': 'audio/x-ms-wma', 'opus': 'audio/opus',
            'aiff': 'audio/x-aiff', 'au': 'audio/basic'
        };

        // Text MIME types
        const textMimes: Record<string, string> = {
            'txt': 'text/plain', 'md': 'text/markdown', 'markdown': 'text/markdown',
            'json': 'application/json', 'xml': 'application/xml',
            'yaml': 'application/x-yaml', 'yml': 'application/x-yaml',
            'csv': 'text/csv', 'html': 'text/html', 'css': 'text/css',
            'js': 'application/javascript', 'ts': 'application/typescript'
        };

        return imageMimes[ext] ||
               videoMimes[ext] ||
               audioMimes[ext] ||
               textMimes[ext] ||
               'application/octet-stream';
    }

    /**
     * Get the category of a file based on its type
     */
    static getFileCategory(fileName: string): 'image' | 'video' | 'audio' | 'text' | 'markdown' | 'unknown' {
        if (this.isImageFile(fileName)) return 'image';
        if (this.isVideoFile(fileName)) return 'video';
        if (this.isAudioFile(fileName)) return 'audio';
        if (this.isMarkdownFile(fileName)) return 'markdown';
        if (this.isTextFile(fileName)) return 'text';
        return 'unknown';
    }
}