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
    this.setCSSVariable('column-width', `${width}px`);
};

styleManager.applyCardHeight = function(height) {
    // Use the correct CSS variable name
    this.setCSSVariable('task-height', height);

    // Properly manage the task-height-limited class
    if (height !== 'auto') {
        document.body.classList.add('task-height-limited');
    } else {
        document.body.classList.remove('task-height-limited');
    }
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

styleManager.applySectionMaxHeight = function(height) {
    this.setCSSVariable('section-max-height', height);
    if (height !== 'auto') {
        document.body.classList.add('section-height-limited');
    } else {
        document.body.classList.remove('section-height-limited');
    }
};

/**
 * Wrap content sections between HRs in task descriptions
 * This allows applying max-height to sections independently without limiting overall task height
 */
styleManager.wrapTaskDescriptionSections = function() {
    const taskDescriptions = document.querySelectorAll('.task-description-display');

    taskDescriptions.forEach(desc => {
        // Skip if already processed
        if (desc.hasAttribute('data-sections-wrapped')) return;

        const hrs = Array.from(desc.querySelectorAll('hr'));

        if (hrs.length === 0) {
            // No HRs: wrap entire content in a section
            const wrapper = document.createElement('div');
            wrapper.className = 'task-section';
            while (desc.firstChild) {
                wrapper.appendChild(desc.firstChild);
            }
            desc.appendChild(wrapper);
        } else {
            // Has HRs: wrap sections between HRs
            const sections = [];
            let currentSection = [];

            Array.from(desc.childNodes).forEach(node => {
                if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'HR') {
                    // Save current section if it has content
                    if (currentSection.length > 0) {
                        sections.push(currentSection);
                        currentSection = [];
                    }
                    sections.push([node]); // HR gets its own section
                } else {
                    currentSection.push(node);
                }
            });

            // Don't forget the last section
            if (currentSection.length > 0) {
                sections.push(currentSection);
            }

            // Clear the description and rebuild with wrapped sections
            desc.innerHTML = '';
            sections.forEach(sectionNodes => {
                const isHR = sectionNodes.length === 1 && sectionNodes[0].tagName === 'HR';
                if (isHR) {
                    // HR stays unwrapped
                    desc.appendChild(sectionNodes[0]);
                } else {
                    // Wrap content in a section div
                    const wrapper = document.createElement('div');
                    wrapper.className = 'task-section';
                    sectionNodes.forEach(node => wrapper.appendChild(node));
                    desc.appendChild(wrapper);
                }
            });
        }

        desc.setAttribute('data-sections-wrapped', 'true');
    });
};

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = styleManager;
}