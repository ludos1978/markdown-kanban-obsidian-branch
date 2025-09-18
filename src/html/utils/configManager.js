/**
 * Configuration Management Utility
 * Centralizes all configuration retrieval and application logic
 */

class ConfigManager {
    constructor() {
        this.cache = new Map();
        this.vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : null;
    }

    /**
     * Generic configuration getter with caching
     * @param {string} key - Configuration key
     * @param {*} defaultValue - Default value if config not found
     * @returns {*} Configuration value
     */
    getConfig(key, defaultValue = null) {
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        try {
            const config = window.vscode?.getConfiguration?.('markdown-kanban') || {};
            const value = this.getNestedProperty(config, key) ?? defaultValue;
            this.cache.set(key, value);
            return value;
        } catch (error) {
            console.error(`Error getting config for ${key}:`, error);
            return defaultValue;
        }
    }

    /**
     * Get nested property from object using dot notation
     * @param {object} obj - Source object
     * @param {string} path - Dot notation path
     * @returns {*} Property value
     */
    getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    /**
     * Clear configuration cache
     */
    clearCache() {
        this.cache.clear();
    }

    /**
     * Send configuration update to VS Code
     * @param {string} key - Configuration key
     * @param {*} value - New value
     */
    updateConfig(key, value) {
        if (this.vscode) {
            this.vscode.postMessage({
                type: 'updateConfig',
                key: key,
                value: value
            });
            this.cache.set(key, value);
        }
    }
}

// Create singleton instance
const configManager = new ConfigManager();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = configManager;
}