/**
 * Color Utility Module
 * Provides color conversion and validation functions
 */

class ColorUtils {
    /**
     * Convert hex color to RGB
     * @param {string} hex - Hex color string (#RRGGBB or #RGB)
     * @returns {Object|null} RGB object {r, g, b} or null if invalid
     */
    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace(/^#/, '');

        // Handle 3-digit hex
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }

        // Validate hex format
        if (!/^[0-9A-Fa-f]{6}$/.test(hex)) {
            return null;
        }

        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);

        return { r, g, b };
    }

    /**
     * Convert RGB to hex color
     * @param {number} r - Red value (0-255)
     * @param {number} g - Green value (0-255)
     * @param {number} b - Blue value (0-255)
     * @returns {string} Hex color string with #
     */
    rgbToHex(r, g, b) {
        // Ensure values are within range
        r = Math.max(0, Math.min(255, Math.round(r)));
        g = Math.max(0, Math.min(255, Math.round(g)));
        b = Math.max(0, Math.min(255, Math.round(b)));

        const toHex = (n) => {
            const hex = n.toString(16).padStart(2, '0');
            return hex.toUpperCase();
        };

        return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }


    /**
     * Validate hex color format
     * @param {string} color - Color string to validate
     * @returns {boolean} True if valid hex color
     */
    isValidHexColor(color) {
        return /^#([0-9A-Fa-f]{3}){1,2}$/.test(color);
    }

    /**
     * Parse any color format to RGB
     * @param {string} color - Color in any format (hex, rgb, rgba)
     * @returns {Object|null} RGB object or null if invalid
     */
    parseToRgb(color) {
        // Try hex format
        if (color.startsWith('#')) {
            return this.hexToRgb(color);
        }

        // Try rgb/rgba format
        const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgbMatch) {
            return {
                r: parseInt(rgbMatch[1], 10),
                g: parseInt(rgbMatch[2], 10),
                b: parseInt(rgbMatch[3], 10)
            };
        }

        return null;
    }

    /**
     * Lighten a color by percentage
     * @param {string} color - Input color
     * @param {number} percent - Percentage to lighten (0-100)
     * @returns {string} Lightened hex color
     */
    lighten(color, percent) {
        const rgb = this.parseToRgb(color);
        if (!rgb) return color;

        const factor = percent / 100;
        const r = Math.round(rgb.r + (255 - rgb.r) * factor);
        const g = Math.round(rgb.g + (255 - rgb.g) * factor);
        const b = Math.round(rgb.b + (255 - rgb.b) * factor);

        return this.rgbToHex(r, g, b);
    }

    /**
     * Darken a color by percentage
     * @param {string} color - Input color
     * @param {number} percent - Percentage to darken (0-100)
     * @returns {string} Darkened hex color
     */
    darken(color, percent) {
        const rgb = this.parseToRgb(color);
        if (!rgb) return color;

        const factor = 1 - (percent / 100);
        const r = Math.round(rgb.r * factor);
        const g = Math.round(rgb.g * factor);
        const b = Math.round(rgb.b * factor);

        return this.rgbToHex(r, g, b);
    }


    /**
     * Generate color with transparency
     * @param {string} color - Base color
     * @param {number} alpha - Alpha value (0-1)
     * @returns {string} RGBA color string
     */
    withAlpha(color, alpha) {
        const rgb = this.parseToRgb(color);
        if (!rgb) return color;

        alpha = Math.max(0, Math.min(1, alpha));
        return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }

    /**
     * Interpolates between two colors for gradient effects
     * @param {string} color1 - Starting hex color
     * @param {string} color2 - Ending hex color
     * @param {number} factor - Interpolation factor (0-1)
     * @returns {string} Interpolated hex color
     */
    interpolateColor(color1, color2, factor) {
        // Parse colors using internal methods
        const c1 = this.hexToRgb(color1);
        const c2 = this.hexToRgb(color2);

        if (!c1 || !c2) {
            return color1; // Fallback if parsing fails
        }

        // Interpolate each component
        const r = Math.round(c1.r + (c2.r - c1.r) * factor);
        const g = Math.round(c1.g + (c2.g - c1.g) * factor);
        const b = Math.round(c1.b + (c2.b - c1.b) * factor);

        return this.rgbToHex(r, g, b);
    }

    /**
     * Calculate relative luminance of a color (WCAG standard)
     * @param {string} color - Color in any format
     * @returns {number} Luminance value (0-1)
     */
    getLuminance(color) {
        const rgb = this.parseToRgb(color);
        if (!rgb) return 0.5; // Default to mid luminance if parsing fails

        // Convert RGB to linear RGB
        const toLinear = (val) => {
            const normalized = val / 255;
            return normalized <= 0.03928
                ? normalized / 12.92
                : Math.pow((normalized + 0.055) / 1.055, 2.4);
        };

        const r = toLinear(rgb.r);
        const g = toLinear(rgb.g);
        const b = toLinear(rgb.b);

        // Calculate relative luminance using WCAG formula
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }

    /**
     * Determine if dark text should be used on a background color
     * Uses WCAG contrast guidelines
     * @param {string} backgroundColor - Background color
     * @returns {boolean} True if dark text should be used
     */
    shouldUseDarkText(backgroundColor) {
        const luminance = this.getLuminance(backgroundColor);
        // If luminance is above 0.5, use dark text
        // This threshold ensures good contrast
        return luminance > 0.4;
    }

    /**
     * Get appropriate text color (black or white) for a background
     * @param {string} backgroundColor - Background color
     * @returns {string} Either '#000000' or '#ffffff'
     */
    getContrastText(backgroundColor) {
        return this.shouldUseDarkText(backgroundColor) ? '#000000' : '#ffffff';
    }

    /**
     * Calculate contrast ratio between two colors (WCAG standard)
     * @param {string} color1 - First color
     * @param {string} color2 - Second color
     * @returns {number} Contrast ratio (1-21)
     */
    getContrastRatio(color1, color2) {
        const lum1 = this.getLuminance(color1);
        const lum2 = this.getLuminance(color2);

        const lighter = Math.max(lum1, lum2);
        const darker = Math.min(lum1, lum2);

        return (lighter + 0.05) / (darker + 0.05);
    }

    /**
     * Check if contrast between text and background is sufficient
     * @param {string} textColor - Text color
     * @param {string} backgroundColor - Background color
     * @param {number} minRatio - Minimum contrast ratio (default 4.5 for normal text)
     * @returns {boolean} True if contrast is sufficient
     */
    hasGoodContrast(textColor, backgroundColor, minRatio = 4.5) {
        const ratio = this.getContrastRatio(textColor, backgroundColor);
        return ratio >= minRatio;
    }

    /**
     * Get text shadow for better contrast
     * Creates an outline effect when contrast is poor
     * @param {string} textColor - Text color
     * @param {string} backgroundColor - Background color
     * @returns {string} CSS text-shadow value or empty string
     */
    getContrastShadow(textColor, backgroundColor) {
        const ratio = this.getContrastRatio(textColor, backgroundColor);

        // If contrast is good (ratio >= 4.5), no shadow needed
        if (ratio >= 4.5) {
            return '';
        }

        // For poor contrast, add outline shadow
        // Use the opposite color of the text for the outline
        const outlineColor = this.shouldUseDarkText(backgroundColor) ? '#ffffff' : '#000000';

        // Create a multi-directional outline effect
        // return `0 0 2px ${outlineColor}, 0 0 2px ${outlineColor}, 0 0 2px ${outlineColor}`;
        // Smoother and less obstucting
        return `0 0 4px #888`;
    }
}

// Create singleton instance
const colorUtils = new ColorUtils();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = colorUtils;
}

// Global window exposure
if (typeof window !== 'undefined') {
    window.colorUtils = colorUtils;
}