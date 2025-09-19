/**
 * HTML Escaping and Sanitization Utility Module for TypeScript/Node.js
 * Centralizes all HTML escaping, sanitization, and validation functions
 */

export interface ValidationOptions {
    maxLength?: number;
    minLength?: number;
    allowHtml?: boolean;
    allowEmptyString?: boolean;
}

export interface ValidationResult {
    isValid: boolean;
    sanitized: string;
    errors: string[];
}

export class HtmlUtils {
    /**
     * Escape HTML characters to prevent XSS attacks
     */
    public static escapeHtml(text: string): string {
        if (!text) return '';
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    /**
     * Unescape HTML entities back to their original characters
     */
    public static unescapeHtml(text: string): string {
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
     * Escape file paths for safe use in markdown and HTML
     */
    public static escapeFilePath(filePath: string): string {
        if (!filePath) return '';

        // Only escape characters that actually break markdown syntax
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
     */
    public static escapeRegex(text: string): string {
        if (!text) return '';
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    /**
     * Encode text for URL usage
     */
    public static encodeUrl(text: string): string {
        if (!text) return '';
        return encodeURIComponent(text);
    }

    /**
     * Decode URL-encoded text
     */
    public static decodeUrl(text: string): string {
        if (!text) return '';
        try {
            return decodeURIComponent(text);
        } catch {
            return text; // Return original if decoding fails
        }
    }

    /**
     * Sanitize filename by removing invalid characters
     */
    public static sanitizeFilename(filename: string): string {
        if (!filename) return '';
        return filename
            .replace(/[<>:"/\\|?*]/g, '_')  // Replace invalid filename characters
            .replace(/\s+/g, '_')          // Replace spaces with underscores
            .replace(/_{2,}/g, '_')        // Replace multiple underscores with single
            .replace(/^_+|_+$/g, '');      // Remove leading/trailing underscores
    }

    /**
     * Sanitize text for safe display by removing dangerous patterns
     */
    public static sanitizeText(text: string, options: { preserveWhitespace?: boolean } = {}): string {
        if (!text) return '';

        let sanitized = this.escapeHtml(text);

        // Normalize whitespace unless preserving
        if (!options.preserveWhitespace) {
            sanitized = sanitized.replace(/\s+/g, ' ').trim();
        }

        return sanitized;
    }

    /**
     * Validate hex color format
     */
    public static isValidHexColor(color: string): boolean {
        if (!color) return false;
        // Remove # if present
        const hex = color.startsWith('#') ? color.slice(1) : color;
        // Check for valid hex format (3 or 6 characters)
        return /^[0-9A-Fa-f]{3}$|^[0-9A-Fa-f]{6}$/.test(hex);
    }

    /**
     * Validate email format (basic validation)
     */
    public static isValidEmail(email: string): boolean {
        if (!email) return false;
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }

    /**
     * Validate URL format
     */
    public static isValidUrl(url: string): boolean {
        if (!url) return false;
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Check if a string contains only safe characters for markdown
     */
    public static isSafeForMarkdown(text: string): boolean {
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
     * Validate and sanitize user input for safe usage
     */
    public static validateUserInput(input: string, options: ValidationOptions = {}): ValidationResult {
        const {
            maxLength = 1000,
            minLength = 0,
            allowHtml = false,
            allowEmptyString = true
        } = options;

        const errors: string[] = [];
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
     * Truncate text to specified length with ellipsis
     */
    public static truncateText(text: string, maxLength: number, ellipsis: string = '...'): string {
        if (!text || text.length <= maxLength) return text || '';
        return text.substring(0, maxLength - ellipsis.length) + ellipsis;
    }

    /**
     * Clean HTML by removing script tags and dangerous attributes
     */
    public static cleanHtml(html: string): string {
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
     */
    public static stripHtml(html: string): string {
        if (!html) return '';
        return html.replace(/<[^>]*>/g, '');
    }

    /**
     * Safe innerHTML replacement that escapes content
     * Note: DOM-related, use ValidationUtils in browser environment
     */
    public static safeInnerHtml(element: any, content: string, allowMarkdown: boolean = false): void {
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
     * Create a safe text node
     * Note: DOM-related, use ValidationUtils in browser environment
     */
    public static createSafeTextNode(text: string): any {
        if (typeof globalThis !== 'undefined' && (globalThis as any).document) {
            return (globalThis as any).document.createTextNode(text || '');
        }
        return null;
    }

    /**
     * Safely set an attribute on an element
     * Note: DOM-related, use ValidationUtils in browser environment
     */
    public static setSafeAttribute(element: any, name: string, value: string): void {
        if (!element || !name) return;

        // Prevent dangerous attributes
        const dangerousAttrs = ['onclick', 'onload', 'onerror', 'onmouseover', 'onfocus'];
        if (dangerousAttrs.includes(name.toLowerCase())) {
            return;
        }

        element.setAttribute(name, this.escapeHtml(value || ''));
    }
}

// Export singleton-like static class
export const htmlUtils = HtmlUtils;