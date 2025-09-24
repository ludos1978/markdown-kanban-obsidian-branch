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