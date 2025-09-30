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
        // Check if document is available (browser environment)
        if (typeof document === 'undefined') {
            console.warn('StyleManager: document not available, running in non-browser environment');
            return;
        }

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
        if (!this.styleElement) {
            this.initStyleElement();
            if (!this.styleElement) return; // Still no element, can't update
        }

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

}

// Create singleton instance
const styleManager = new StyleManager();

// Convenience methods for common style applications
styleManager.applyColumnWidth = function(width) {
    // Convert value to CSS using getCSS helper
    const actualWidth = typeof window.getCSS === 'function' ? window.getCSS('columnWidth', width) : width;
    this.setCSSVariable('column-width', actualWidth);
};

styleManager.applyCardHeight = function(height) {
    // Convert value to CSS using getCSS helper
    const actualHeight = typeof window.getCSS === 'function' ? window.getCSS('cardHeight', height) : height;

    // Use the correct CSS variable name
    this.setCSSVariable('task-height', actualHeight);

    // Properly manage the task-height-limited class
    if (height !== 'auto') {
        document.body.classList.add('task-height-limited');
    } else {
        document.body.classList.remove('task-height-limited');
    }
};

styleManager.applyWhitespace = function(spacing) {
    // Convert value to CSS using getCSS helper
    const actualSpacing = typeof window.getCSS === 'function' ? window.getCSS('whitespace', spacing) : spacing;
    this.setCSSVariable('whitespace', actualSpacing);
};

styleManager.applyFontSize = function(size) {
    // fontSize uses body classes, not CSS variables
    // The getCSS helper returns the multiplier value which applyFontSize in webview.js uses
    // This method is kept for consistency but fontSize is handled via body classes
    const multiplier = typeof window.getCSS === 'function' ? window.getCSS('fontSize', size) : parseFloat(size);
    this.setCSSVariable('font-size-multiplier', multiplier);
};

styleManager.applyFontFamily = function(family) {
    this.setCSSVariable('font-family', family);
};

styleManager.applyLayoutRows = function(rows) {
    // Convert value to CSS using getCSS helper
    const actualRows = typeof window.getCSS === 'function' ? window.getCSS('layoutRows', rows) : rows;
    this.setCSSVariable('layout-rows', actualRows);
};

styleManager.applyRowHeight = function(height) {
    // Convert value to CSS using getCSS helper
    const actualHeight = typeof window.getCSS === 'function' ? window.getCSS('rowHeight', height) : height;
    this.setCSSVariable('row-height', actualHeight);
};

styleManager.applySectionMaxHeight = function(height) {
    // Convert value to CSS using getCSS helper
    const actualHeight = typeof window.getCSS === 'function' ? window.getCSS('sectionMaxHeight', height) : height;

    // Set both min and max height to the same value for fixed height
    this.setCSSVariable('section-max-height', actualHeight);
    this.setCSSVariable('section-min-height', actualHeight);

    if (height !== 'auto') {
        document.body.classList.add('section-height-limited');
    } else {
        document.body.classList.remove('section-height-limited');
    }
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = styleManager;
}