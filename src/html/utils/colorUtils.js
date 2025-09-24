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