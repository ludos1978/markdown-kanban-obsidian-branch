/**
 * Validation and Sanitization Utilities
 * Centralizes all validation, escaping, and sanitization functions
 */

class ValidationUtils {
    /**
     * Escape HTML characters to prevent XSS attacks
     * @param {string} text - Text to escape
     * @returns {string} HTML-safe text
     */
    static escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Escape file paths for safe use in markdown and HTML with proper URL encoding
     * For standard markdown links [](path) and image links ![](path)
     * @param {string} filePath - File path to escape
     * @returns {string} URL-encoded file path safe for markdown links
     */
    static escapeFilePath(filePath) {
        if (!filePath) return '';

        // Convert Windows backslashes to forward slashes for URL compatibility
        let normalizedPath = filePath.replace(/\\/g, '/');

        // URL encode the path components to handle spaces, special characters, etc.
        // Split on slashes, encode each part, then rejoin
        const pathParts = normalizedPath.split('/');
        const encodedParts = pathParts.map(part => {
            // Don't encode empty parts (from leading slashes or double slashes)
            if (!part) return part;

            // Don't encode Windows drive letters (C:, D:, etc.)
            if (/^[a-zA-Z]:$/.test(part)) return part;

            // URL encode the part
            return encodeURIComponent(part);
        });

        return encodedParts.join('/');
    }

    /**
     * Escape file paths for wiki links [[...]]
     * Wiki links don't use URL encoding, just escape special markdown characters
     * @param {string} filePath - File path to escape
     * @returns {string} Escaped file path safe for wiki links
     */
    static escapeWikiLinkPath(filePath) {
        if (!filePath) return '';

        // Convert Windows backslashes to forward slashes for consistency
        let normalizedPath = filePath.replace(/\\/g, '/');

        // Only escape characters that break wiki link syntax
        // Wiki links can contain spaces and most special characters
        return normalizedPath
            .replace(/\]/g, '\\]')  // Escape closing brackets
            .replace(/\|/g, '\\|'); // Escape pipe character (used for aliases)
    }

    /**
     * Escape special regex characters for safe pattern matching
     * @param {string} text - Text to escape for regex
     * @returns {string} Regex-safe text
     */
    static escapeRegex(text) {
        if (!text) return '';
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Validate hex color format
     * @param {string} color - Color string to validate
     * @returns {boolean} True if valid hex color
     */
    static isValidHexColor(color) {
        if (!color) return false;
        // Remove # if present
        const hex = color.startsWith('#') ? color.slice(1) : color;
        // Check for valid hex format (3 or 6 characters)
        return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex);
    }


    /**
     * Sanitize filename by removing invalid characters
     * @param {string} filename - Filename to sanitize
     * @returns {string} Safe filename
     */
    static sanitizeFilename(filename) {
        if (!filename) return '';
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid filename characters
            .replace(/\s+/g, '_')          // Replace spaces with underscores
            .replace(/_{2,}/g, '_')        // Replace multiple underscores with single
            .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
    }

    /**
     * Validate and sanitize user input for safe usage
     * @param {string} input - User input to validate
     * @param {Object} options - Validation options
     * @returns {Object} {isValid: boolean, sanitized: string, errors: string[]}
     */
    static validateUserInput(input, options = {}) {
        const {
            maxLength = 1000,
            minLength = 0,
            allowHtml = false,
            allowEmptyString = true
        } = options;

        const errors = [];
        let sanitized = input || '';

        // Check length constraints
        if (sanitized.length < minLength) {
            errors.push(`Input must be at least ${minLength} characters`);
        }
        if (sanitized.length > maxLength) {
            errors.push(`Input must not exceed ${maxLength} characters`);
            sanitized = sanitized.substring(0, maxLength);
        }

        // Check empty string constraint
        if (!allowEmptyString && sanitized.trim() === '') {
            errors.push('Input cannot be empty');
        }

        // Sanitize HTML if not allowed
        if (!allowHtml) {
            sanitized = this.escapeHtml(sanitized);
        }

        return {
            isValid: errors.length === 0,
            sanitized,
            errors
        };
    }

    /**
     * Check if a string contains only safe characters for markdown
     * @param {string} text - Text to check
     * @returns {boolean} True if safe for markdown
     */
    static isSafeForMarkdown(text) {
        if (!text) return true;
        // Check for potentially dangerous markdown patterns
        const dangerousPatterns = [
            /<script/i,
            /javascript:/i,
            /on\w+\s*=/i,
            /data:text\/html/i
        ];
        return !dangerousPatterns.some(pattern => pattern.test(text));
    }

    /**
     * Truncate text to specified length with ellipsis
     * @param {string} text - Text to truncate
     * @param {number} maxLength - Maximum length
     * @param {string} ellipsis - Ellipsis string (default: '...')
     * @returns {string} Truncated text
     */
    static truncateText(text, maxLength, ellipsis = '...') {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength - ellipsis.length) + ellipsis;
    }

    /**
     * Unescape HTML entities back to their original characters
     * @param {string} text - Text to unescape
     * @returns {string} Unescaped text
     */
    static unescapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&#039;/g, "'")
            .replace(/&apos;/g, "'");
    }

    /**
     * Encode text for URL usage
     * @param {string} text - Text to encode
     * @returns {string} URL-encoded text
     */
    static encodeUrl(text) {
        if (!text) return '';
        return encodeURIComponent(text);
    }

    /**
     * Decode URL-encoded text
     * @param {string} text - Text to decode
     * @returns {string} Decoded text
     */
    static decodeUrl(text) {
        if (!text) return '';
        try {
            return decodeURIComponent(text);
        } catch {
            return text; // Return original if decoding fails
        }
    }

    /**
     * Sanitize text for safe display by removing dangerous patterns
     * @param {string} text - Text to sanitize
     * @param {Object} options - Sanitization options
     * @returns {string} Sanitized text
     */
    static sanitizeText(text, options = {}) {
        if (!text) return '';

        const { preserveWhitespace = false } = options;
        let sanitized = this.escapeHtml(text);

        // Normalize whitespace unless preserving
        if (!preserveWhitespace) {
            sanitized = sanitized.replace(/\s+/g, ' ').trim();
        }

        return sanitized;
    }

    /**
     * Clean HTML by removing script tags and dangerous attributes
     * @param {string} html - HTML to clean
     * @returns {string} Cleaned HTML
     */
    static cleanHtml(html) {
        if (!html) return '';

        return html
            // Remove script tags
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            // Remove dangerous event handlers
            .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
            // Remove javascript: urls
            .replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '')
            .replace(/src\s*=\s*["']javascript:[^"']*["']/gi, '');
    }

    /**
     * Strip all HTML tags from text
     * @param {string} html - HTML to strip
     * @returns {string} Text without HTML tags
     */
    static stripHtml(html) {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, '');
    }

    /**
     * Safe innerHTML replacement that escapes content
     * @param {HTMLElement} element - Element to set content for
     * @param {string} content - Content to set
     * @param {boolean} allowMarkdown - Whether to allow markdown content
     */
    static safeInnerHtml(element, content, allowMarkdown = false) {
        if (!element) return;

        if (allowMarkdown) {
            // For markdown content, we trust it's been processed safely
            element.innerHTML = content;
        } else {
            // For user content, always escape
            element.textContent = content;
        }
    }

    /**
     * Safely set an attribute on an element
     * @param {HTMLElement} element - Element to set attribute on
     * @param {string} name - Attribute name
     * @param {string} value - Attribute value
     */
    static setSafeAttribute(element, name, value) {
        if (!element || !name) return;

        // Prevent dangerous attributes
        const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus'];
        if (dangerousAttrs.includes(name.toLowerCase())) {
            return;
        }

        element.setAttribute(name, this.escapeHtml(value || ''));
    }

    /**
     * Check if text looks like a file path
     * @param {string} text - Text to check
     * @returns {boolean} True if text appears to be a file path
     */
    static isFilePath(text) {
        if (!text) return false;

        // Basic checks to avoid false positives first
        if (text.includes('://')) return false; // URLs
        if (text.startsWith('mailto:')) return false; // Email links
        if (text.includes('@') && !text.includes('/') && !text.includes('\\')) return false; // Email addresses

        // Check for Windows absolute paths (C:\ or C:/ style)
        if (/^[a-zA-Z]:[\/\\]/.test(text)) {
            // Has file extension
            if (/\.[a-zA-Z0-9]{1,10}$/.test(text)) return true;
        }

        // Check for Unix/Linux absolute paths starting with /
        if (text.startsWith('/')) {
            // Has file extension
            if (/\.[a-zA-Z0-9]{1,10}$/.test(text)) return true;
        }

        // Check for relative paths with directory separators
        if (text.includes('/') || text.includes('\\')) {
            // Has file extension
            if (/\.[a-zA-Z0-9]{1,10}$/.test(text)) return true;
        }

        // Check for simple filename with extension
        if (/\.[a-zA-Z0-9]{1,10}$/.test(text)) return true;

        return false;
    }

    /**
     * Check if filename is an image file
     * @param {string} fileName - Filename to check
     * @returns {boolean} True if filename has image extension
     */
    static isImageFile(fileName) {
        if (!fileName) return false;
        const imageExtensions = [
            'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
            'ico', 'tiff', 'tif', 'avif', 'heic', 'heif'
        ];
        const extension = fileName.split('.').pop().toLowerCase();
        return imageExtensions.includes(extension);
    }
}

// Make it globally available for compatibility
if (typeof window !== 'undefined') {
    window.ValidationUtils = ValidationUtils;

    // Export individual functions for backward compatibility
    window.escapeHtml = ValidationUtils.escapeHtml;
    window.unescapeHtml = ValidationUtils.unescapeHtml;
    window.escapeFilePath = ValidationUtils.escapeFilePath;
    window.escapeWikiLinkPath = ValidationUtils.escapeWikiLinkPath;
    window.escapeRegex = ValidationUtils.escapeRegex;
    window.encodeUrl = ValidationUtils.encodeUrl;
    window.decodeUrl = ValidationUtils.decodeUrl;
    window.isValidHexColor = ValidationUtils.isValidHexColor;
    window.sanitizeFilename = ValidationUtils.sanitizeFilename;
    window.sanitizeText = ValidationUtils.sanitizeText;
    window.cleanHtml = ValidationUtils.cleanHtml;
    window.stripHtml = ValidationUtils.stripHtml;
    window.safeInnerHtml = ValidationUtils.safeInnerHtml;
    window.setSafeAttribute = ValidationUtils.setSafeAttribute;
    window.isFilePath = ValidationUtils.isFilePath;
    window.isImageFile = ValidationUtils.isImageFile;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationUtils;
}