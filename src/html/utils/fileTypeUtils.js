/**
 * File Type Validation Utility Module for Browser/JavaScript
 * Provides unified file type detection and validation functions using shared definitions
 *
 * Note: This extends the base functionality but cannot use ES6 imports in browser context
 * So we duplicate the core definitions here but maintain consistency with the shared module
 */

class FileTypeUtils {
    constructor() {
        // Shared file extension definitions (consistent with shared module)
        this.FILE_EXTENSIONS = {
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
            ]
        };
    }

    /**
     * Check if text appears to be a file path
     * @param {string} text - Text to check
     * @returns {boolean} True if looks like a file path
     */
    isFilePath(text) {
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
     * Check if a file is an image based on its extension
     * @param {string} fileName - File name or path
     * @returns {boolean} True if it's an image file
     */
    isImageFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const extension = this._getFileExtension(fileName);
        return this.FILE_EXTENSIONS.image.includes(extension);
    }

    /**
     * Check if a file is a video based on its extension
     * @param {string} fileName - File name or path
     * @returns {boolean} True if it's a video file
     */
    isVideoFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const extension = this._getFileExtension(fileName);
        return this.FILE_EXTENSIONS.video.includes(extension);
    }

    /**
     * Check if a file is an audio file based on its extension
     * @param {string} fileName - File name or path
     * @returns {boolean} True if it's an audio file
     */
    isAudioFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const extension = this._getFileExtension(fileName);
        return this.FILE_EXTENSIONS.audio.includes(extension);
    }

    /**
     * Check if a file is any type of media file (image, video, or audio)
     * @param {string} fileName - File name or path
     * @returns {boolean} True if it's a media file
     */
    isMediaFile(fileName) {
        return this.isImageFile(fileName) ||
               this.isVideoFile(fileName) ||
               this.isAudioFile(fileName);
    }

    /**
     * Check if a file is a markdown file
     * @param {string} fileName - File name or path
     * @returns {boolean} True if it's a markdown file
     */
    isMarkdownFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const extension = this._getFileExtension(fileName);
        return extension === 'md';
    }

    /**
     * Check if a file is a text file
     * @param {string} fileName - File name or path
     * @returns {boolean} True if it's a text file
     */
    isTextFile(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            return false;
        }

        const extension = this._getFileExtension(fileName);
        return this.FILE_EXTENSIONS.text.includes(extension);
    }

    /**
     * Get the MIME type for a file based on its extension
     * @param {string} fileName - File name or path
     * @returns {string} MIME type or 'application/octet-stream' for unknown types
     */
    getMimeType(fileName) {
        if (!fileName || typeof fileName !== 'string') {
            return 'application/octet-stream';
        }

        const extension = this._getFileExtension(fileName);

        // Image MIME types
        const imageMimes = {
            'jpg': 'image/jpeg', 'jpeg': 'image/jpeg', 'png': 'image/png',
            'gif': 'image/gif', 'bmp': 'image/bmp', 'svg': 'image/svg+xml',
            'webp': 'image/webp', 'ico': 'image/x-icon', 'tiff': 'image/tiff',
            'tif': 'image/tiff', 'avif': 'image/avif', 'heic': 'image/heic',
            'heif': 'image/heif'
        };

        // Video MIME types
        const videoMimes = {
            'mp4': 'video/mp4', 'mov': 'video/quicktime', 'avi': 'video/x-msvideo',
            'mkv': 'video/x-matroska', 'm4v': 'video/x-m4v', 'mpg': 'video/mpeg',
            'mpeg': 'video/mpeg', 'ogv': 'video/ogg', 'webm': 'video/webm',
            'wmv': 'video/x-ms-wmv', 'flv': 'video/x-flv', '3gp': 'video/3gpp'
        };

        // Audio MIME types
        const audioMimes = {
            'mp3': 'audio/mpeg', 'm4a': 'audio/x-m4a', 'wav': 'audio/wav',
            'ogg': 'audio/ogg', 'flac': 'audio/flac', 'aac': 'audio/aac',
            'oga': 'audio/ogg', 'wma': 'audio/x-ms-wma', 'opus': 'audio/opus',
            'aiff': 'audio/x-aiff', 'au': 'audio/basic'
        };

        // Text MIME types
        const textMimes = {
            'txt': 'text/plain', 'md': 'text/markdown', 'markdown': 'text/markdown',
            'json': 'application/json', 'xml': 'application/xml',
            'yaml': 'application/x-yaml', 'yml': 'application/x-yaml',
            'csv': 'text/csv', 'html': 'text/html', 'css': 'text/css',
            'js': 'application/javascript', 'ts': 'application/typescript'
        };

        return imageMimes[extension] ||
               videoMimes[extension] ||
               audioMimes[extension] ||
               textMimes[extension] ||
               'application/octet-stream';
    }

    /**
     * Get the category of a file based on its type
     * @param {string} fileName - File name or path
     * @returns {string} Category: 'image', 'video', 'audio', 'text', 'markdown', 'unknown'
     */
    getFileCategory(fileName) {
        if (this.isImageFile(fileName)) { return 'image'; }
        if (this.isVideoFile(fileName)) { return 'video'; }
        if (this.isAudioFile(fileName)) { return 'audio'; }
        if (this.isMarkdownFile(fileName)) { return 'markdown'; }
        if (this.isTextFile(fileName)) { return 'text'; }
        return 'unknown';
    }

    /**
     * Extract file extension from filename (private helper)
     * @param {string} fileName - File name or path
     * @returns {string} Lowercase extension without the dot
     * @private
     */
    _getFileExtension(fileName) {
        const extension = fileName.split('.').pop();
        return extension ? extension.toLowerCase() : '';
    }
}

// Create singleton instance
const fileTypeUtils = new FileTypeUtils();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = fileTypeUtils;
}

// Global window exposure
if (typeof window !== 'undefined') {
    window.fileTypeUtils = fileTypeUtils;
}