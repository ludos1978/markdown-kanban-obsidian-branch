/**
 * Menu Management Utility
 * Centralizes all menu generation and update logic
 */

class MenuManager {
    constructor() {
        this.menuConfigs = new Map();
        this.currentValues = new Map();
        this.updateCallbacks = new Map();
    }

    /**
     * Register a menu configuration
     * @param {string} key - Menu identifier
     * @param {Array} config - Menu items configuration
     * @param {Function} getCurrentValue - Function to get current value
     * @param {Function} onUpdate - Callback when menu item is selected
     */
    registerMenu(key, config, getCurrentValue, onUpdate) {
        this.menuConfigs.set(key, config);
        this.updateCallbacks.set(key, { getCurrentValue, onUpdate });
    }

    /**
     * Generate HTML for a specific menu
     * @param {string} key - Menu identifier
     * @returns {string} Generated HTML
     */
    generateMenuHTML(key) {
        const config = this.menuConfigs.get(key);
        const callbacks = this.updateCallbacks.get(key);

        if (!config || !callbacks) {
            console.warn(`Menu configuration not found for: ${key}`);
            return '';
        }

        const currentValue = callbacks.getCurrentValue();
        let html = '';

        for (const item of config) {
            if (item.separator) {
                html += '<div class="file-bar-menu-divider"></div>';
                continue;
            }

            const isSelected = this.isItemSelected(item, currentValue);
            html += this.generateMenuItem(item, isSelected, key);
        }

        return html;
    }

    /**
     * Check if menu item is selected
     * @param {Object} item - Menu item
     * @param {*} currentValue - Current value
     * @returns {boolean} True if selected
     */
    isItemSelected(item, currentValue) {
        // Handle different value types
        if (typeof item.value === 'string' && typeof currentValue === 'string') {
            return item.value === currentValue;
        }
        if (typeof item.value === 'number' && typeof currentValue === 'number') {
            return item.value === currentValue;
        }
        // Special handling for percentage values
        if (item.value && item.value.includes && item.value.includes('percent')) {
            const percentage = item.value.replace('percent', '');
            return currentValue === `${percentage}%` || currentValue === item.value;
        }
        return item.value === currentValue;
    }

    /**
     * Generate individual menu item HTML
     * @param {Object} item - Menu item configuration
     * @param {boolean} isSelected - Whether item is selected
     * @param {string} menuKey - Menu identifier
     * @returns {string} Menu item HTML
     */
    generateMenuItem(item, isSelected, menuKey) {
        const iconHtml = this.generateIcon(item);
        const selectedClass = isSelected ? ' selected' : '';
        const checkmark = isSelected ? '<span class="menu-checkmark">✓</span>' : '';
        const description = item.description ? ` title="${item.description}"` : '';

        // Use data attributes for cleaner event handling
        return `<button class="file-bar-menu-item${selectedClass}"
                data-menu="${menuKey}"
                data-value="${item.value}"
                onclick="menuManager.handleMenuClick('${menuKey}', '${item.value}')"
                ${description}>
                ${iconHtml}${item.label}${checkmark}
            </button>`;
    }

    /**
     * Generate icon HTML for menu item
     * @param {Object} item - Menu item configuration
     * @returns {string} Icon HTML
     */
    generateIcon(item) {
        if (!item.icon) return '';

        const style = item.iconStyle ? ` style="${item.iconStyle}"` : '';
        return `<span class="menu-icon"${style}>${item.icon}</span> `;
    }

    /**
     * Handle menu item click
     * @param {string} key - Menu identifier
     * @param {string} value - Selected value
     */
    handleMenuClick(key, value) {
        const callbacks = this.updateCallbacks.get(key);
        if (callbacks && callbacks.onUpdate) {
            callbacks.onUpdate(value);
            // Refresh the menu to update selected state
            this.updateMenu(key);
        }
    }

    /**
     * Update a specific menu's HTML
     * @param {string} key - Menu identifier
     */
    updateMenu(key) {
        const selector = `[data-menu="${key}"]`;
        const menuElement = document.querySelector(selector);

        if (menuElement) {
            menuElement.innerHTML = this.generateMenuHTML(key);
        }
    }

    /**
     * Update all registered menus
     */
    updateAllMenus() {
        for (const key of this.menuConfigs.keys()) {
            this.updateMenu(key);
        }
    }

    /**
     * Generate submenu HTML with proper structure
     * @param {string} key - Menu identifier
     * @param {string} parentSelector - Parent element selector
     * @returns {string} Submenu HTML
     */
    generateSubmenu(key, parentSelector) {
        const html = this.generateMenuHTML(key);
        return `<div class="file-bar-menu-submenu" data-menu="${key}">${html}</div>`;
    }

    /**
     * Initialize menu system with event delegation
     */
    initialize() {
        // Set up event delegation for better performance
        document.addEventListener('click', (e) => {
            const menuItem = e.target.closest('.file-bar-menu-item[data-menu][data-value]');
            if (menuItem) {
                const menuKey = menuItem.getAttribute('data-menu');
                const value = menuItem.getAttribute('data-value');
                if (menuKey && value) {
                    e.preventDefault();
                    this.handleMenuClick(menuKey, value);
                }
            }
        });
    }

    /**
     * Clear all menu configurations
     */
    clear() {
        this.menuConfigs.clear();
        this.currentValues.clear();
        this.updateCallbacks.clear();
    }
}

// Create singleton instance
const menuManager = new MenuManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = menuManager;
}