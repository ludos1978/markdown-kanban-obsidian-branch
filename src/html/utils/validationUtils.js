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
     * Escape file paths for safe use in markdown and HTML
     * @param {string} filePath - File path to escape
     * @returns {string} Escaped file path
     */
    static escapeFilePath(filePath) {
        if (!filePath) return '';

        // Don't resolve or modify paths - just escape special characters that break markdown
        // Only escape characters that actually break markdown syntax, not the whole path
        return filePath
            .replace(/\(/g, '\\(')
            .replace(/\)/g, '\\)')
            .replace(/\[/g, '\\[')
            .replace(/\]/g, '\\]')
            .replace(/'/g, "\\'")
            .replace(/"/g, '\\"');
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
     * Validate email format (basic validation)
     * @param {string} email - Email to validate
     * @returns {boolean} True if valid email format
     */
    static isValidEmail(email) {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate URL format
     * @param {string} url - URL to validate
     * @returns {boolean} True if valid URL format
     */
    static isValidUrl(url) {
        if (!url) return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
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
}

// Make it globally available for compatibility
if (typeof window !== 'undefined') {
    window.ValidationUtils = ValidationUtils;

    // Export individual functions for backward compatibility
    window.escapeHtml = ValidationUtils.escapeHtml;
    window.escapeFilePath = ValidationUtils.escapeFilePath;
    window.escapeRegex = ValidationUtils.escapeRegex;
    window.isValidHexColor = ValidationUtils.isValidHexColor;
    window.sanitizeFilename = ValidationUtils.sanitizeFilename;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationUtils;
}