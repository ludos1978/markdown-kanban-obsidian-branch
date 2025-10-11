/**
 * Enhanced Configuration Management Utility
 * Centralizes all configuration retrieval and application logic
 * Provides feature-specific configuration methods and preference management
 */

class ConfigManager {
    constructor() {
        this.cache = new Map();
        this.preferenceCache = new Map();
        // Use the global vscode instance if it exists, otherwise try window.vscode
        this.vscode = (typeof vscode !== 'undefined' && vscode) ||
                      (typeof window !== 'undefined' && window.vscode) ||
                      null;

        // Configuration defaults
        this.defaults = {
            enableBackups: true,
            backupInterval: 300,
            backupLocation: '',
            openLinksInNewTab: false,
            whitespace: 'normal',
            maxRowHeight: 'auto',
            taskMinHeight: 'auto',
            fontSize: 'medium',
            fontFamily: 'default',
            columnWidth: 'auto',
            columnBorder: '1px solid var(--vscode-panel-border)',
            taskBorder: '1px solid var(--vscode-panel-border)',
            layoutRows: 1,
            rowHeight: 'auto',
            layoutPreset: 'default',
            stickyStackMode: 'titleonly',
            tagVisibility: 'visible',
            exportTagVisibility: true,
            arrowKeyFocusScroll: 'center',
            tagColors: {},
            showHtmlComments: false
        };
    }

    /**
     * Generic configuration getter with caching and defaults
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
            const finalDefault = defaultValue ?? this.defaults[key] ?? null;
            const value = this.getNestedProperty(config, key) ?? finalDefault;
            this.cache.set(key, value);
            return value;
        } catch (error) {
            console.error(`Error getting config for ${key}:`, error);
            return defaultValue ?? this.defaults[key] ?? null;
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

    /**
     * Send preference update to VS Code
     * @param {string} key - Preference key
     * @param {*} value - New value
     */
    setPreference(key, value) {
        if (this.vscode) {
            this.vscode.postMessage({
                type: 'setPreference',
                key: key,
                value: value
            });
            this.preferenceCache.set(key, value);
        }
    }

    /**
     * Get preference value with caching
     * @param {string} key - Preference key
     * @param {*} defaultValue - Default value
     * @returns {*} Preference value
     */
    getPreference(key, defaultValue = null) {
        return this.preferenceCache.get(key) ?? defaultValue;
    }

    /**
     * Feature-specific configuration getters
     */

    // Tag configuration
    getTagConfiguration() {
        return {
            tagColors: this.getConfig('tagColors'),
            tagVisibility: this.getConfig('tagVisibility'),
            exportTagVisibility: this.getConfig('exportTagVisibility')
        };
    }

    // Layout configuration
    getLayoutConfiguration() {
        return {
            whitespace: this.getConfig('whitespace'),
            taskMinHeight: this.getConfig('taskMinHeight'),
            fontSize: this.getConfig('fontSize'),
            fontFamily: this.getConfig('fontFamily'),
            columnWidth: this.getConfig('columnWidth'),
            layoutRows: this.getConfig('layoutRows'),
            rowHeight: this.getConfig('rowHeight'),
            maxRowHeight: this.getConfig('maxRowHeight'),
            layoutPreset: this.getConfig('layoutPreset'),
            layoutPresets: this.getConfig('layoutPresets'),
            stickyStackMode: this.getConfig('stickyStackMode')
        };
    }

    // Backup configuration
    getBackupConfiguration() {
        return {
            enableBackups: this.getConfig('enableBackups'),
            backupInterval: this.getConfig('backupInterval'),
            backupLocation: this.getConfig('backupLocation')
        };
    }

    // Link configuration
    getLinkConfiguration() {
        return {
            openLinksInNewTab: this.getConfig('openLinksInNewTab')
        };
    }

    /**
     * Get all configuration as object
     * @returns {object} All configuration values
     */
    getAllConfig() {
        const result = {};
        for (const key of Object.keys(this.defaults)) {
            result[key] = this.getConfig(key);
        }
        return result;
    }

    /**
     * Validate configuration value
     * @param {string} key - Configuration key
     * @param {*} value - Value to validate
     * @returns {boolean} True if valid
     */
    validateConfig(key, value) {
        switch (key) {
            case 'enableBackups':
                return typeof value === 'boolean';
            case 'backupInterval':
                return typeof value === 'number' && value > 0;
            case 'layoutRows':
                return typeof value === 'number' && value >= 1;
            case 'fontSize':
                return ['small', 'medium', 'large', 'xlarge'].includes(value);
            case 'whitespace':
                return ['normal', 'nowrap', 'pre', 'pre-wrap'].includes(value);
            case 'tagVisibility':
                return ['visible', 'hover', 'hidden'].includes(value);
            default:
                return true; // Default to valid for unknown keys
        }
    }
}

// Create singleton instance
const configManager = new ConfigManager();

// Make available globally for browser context
if (typeof window !== 'undefined') {
    window.configManager = configManager;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = configManager;
}