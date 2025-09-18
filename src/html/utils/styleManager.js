/**
 * Style Management Utility
 * Centralizes all dynamic CSS application logic
 */

class StyleManager {
    constructor() {
        this.styleElement = null;
        this.styles = new Map();
        this.initStyleElement();
    }

    /**
     * Initialize or get the dynamic style element
     */
    initStyleElement() {
        const existingElement = document.getElementById('dynamic-styles');
        if (existingElement) {
            this.styleElement = existingElement;
        } else {
            this.styleElement = document.createElement('style');
            this.styleElement.id = 'dynamic-styles';
            document.head.appendChild(this.styleElement);
        }
    }

    /**
     * Generic style applicator
     * @param {string} property - CSS property name
     * @param {string|number} value - CSS value
     * @param {string} selector - CSS selector (default: :root)
     * @param {string} unit - Optional unit to append
     */
    applyStyle(property, value, selector = ':root', unit = '') {
        const key = `${selector}-${property}`;
        const cssValue = unit ? `${value}${unit}` : value;

        this.styles.set(key, {
            selector,
            property,
            value: cssValue
        });

        this.updateStylesheet();
    }

    /**
     * Apply multiple styles at once
     * @param {Object} styles - Object with property-value pairs
     * @param {string} selector - CSS selector
     */
    applyStyles(styles, selector = ':root') {
        Object.entries(styles).forEach(([property, value]) => {
            this.applyStyle(property, value, selector);
        });
    }

    /**
     * Apply CSS variable
     * @param {string} varName - CSS variable name (without --)
     * @param {string|number} value - Variable value
     */
    setCSSVariable(varName, value) {
        this.applyStyle(`--${varName}`, value);
    }

    /**
     * Update the stylesheet with all stored styles
     */
    updateStylesheet() {
        const groupedStyles = new Map();

        // Group styles by selector
        this.styles.forEach(style => {
            if (!groupedStyles.has(style.selector)) {
                groupedStyles.set(style.selector, []);
            }
            groupedStyles.get(style.selector).push(`${style.property}: ${style.value}`);
        });

        // Build CSS text
        let cssText = '';
        groupedStyles.forEach((properties, selector) => {
            cssText += `${selector} { ${properties.join('; ')}; }\n`;
        });

        this.styleElement.textContent = cssText;
    }

    /**
     * Clear all dynamic styles
     */
    clearStyles() {
        this.styles.clear();
        this.styleElement.textContent = '';
    }

    /**
     * Remove specific style
     * @param {string} property - CSS property name
     * @param {string} selector - CSS selector
     */
    removeStyle(property, selector = ':root') {
        const key = `${selector}-${property}`;
        this.styles.delete(key);
        this.updateStylesheet();
    }
}

// Create singleton instance
const styleManager = new StyleManager();

// Convenience methods for common style applications
styleManager.applyColumnWidth = function(width) {
    this.setCSSVariable('column-width', `${width}px`);
};

styleManager.applyCardHeight = function(height) {
    this.setCSSVariable('card-height', height);
};

styleManager.applyWhitespace = function(spacing) {
    this.setCSSVariable('whitespace', `${spacing}px`);
};

styleManager.applyFontSize = function(size) {
    this.setCSSVariable('font-size', `${size}px`);
};

styleManager.applyFontFamily = function(family) {
    this.setCSSVariable('font-family', family);
};

styleManager.applyLayoutRows = function(rows) {
    this.setCSSVariable('layout-rows', rows);
};

styleManager.applyRowHeight = function(height) {
    this.setCSSVariable('row-height', `${height}px`);
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = styleManager;
}