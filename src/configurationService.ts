/**
 * Centralized Configuration Service for Markdown Kanban
 * Provides unified access to VS Code configuration with caching and type safety
 */

import * as vscode from 'vscode';

export interface KanbanConfiguration {
    enableBackups: boolean;
    backupInterval: number;
    backupLocation: string;
    openLinksInNewTab: boolean;
    pathGeneration: 'relative' | 'absolute';
    whitespace: string;
    maxRowHeight: number;
    tagColors: { [key: string]: string };
    taskMinHeight: string;
    sectionMaxHeight: string;
    fontSize: string;
    fontFamily: string;
    columnWidth: string;
    columnBorder: string;
    taskBorder: string;
    layoutRows: number;
    rowHeight: string;
    layoutPreset: string;
    layoutPresets: { [key: string]: any };
    tagVisibility: string;
    exportTagVisibility: boolean;
    imageFill: string;
    arrowKeyFocusScroll: string;
}

export interface ConfigurationDefaults {
    enableBackups: boolean;
    backupInterval: number;
    backupLocation: string;
    openLinksInNewTab: boolean;
    pathGeneration: 'relative' | 'absolute';
    whitespace: string;
    maxRowHeight: number;
    taskMinHeight: string;
    sectionMaxHeight: string;
    fontSize: string;
    fontFamily: string;
    columnWidth: string;
    columnBorder: string;
    taskBorder: string;
    layoutRows: number;
    rowHeight: string;
    layoutPreset: string;
    tagVisibility: string;
    exportTagVisibility: boolean;
    imageFill: string;
    arrowKeyFocusScroll: string;
}

export class ConfigurationService {
    private static instance: ConfigurationService;
    private cache: Map<string, any> = new Map();
    private readonly CONFIGURATION_SECTION = 'markdown-kanban';

    // Default configuration values
    private readonly defaults: ConfigurationDefaults = {
        enableBackups: true,
        backupInterval: 15,
        backupLocation: '',
        openLinksInNewTab: false,
        pathGeneration: 'relative' as 'relative' | 'absolute',
        whitespace: 'normal',
        maxRowHeight: 0,
        taskMinHeight: 'auto',
        sectionMaxHeight: 'auto',
        fontSize: 'medium',
        fontFamily: 'default',
        columnWidth: 'auto',
        columnBorder: '1px solid var(--vscode-panel-border)',
        taskBorder: '1px solid var(--vscode-panel-border)',
        layoutRows: 1,
        rowHeight: 'auto',
        layoutPreset: 'default',
        tagVisibility: 'visible',
        exportTagVisibility: true,
        imageFill: 'contain',
        arrowKeyFocusScroll: 'center'
    };

    private constructor() {
        // Listen for configuration changes
        vscode.workspace.onDidChangeConfiguration((event) => {
            if (event.affectsConfiguration(this.CONFIGURATION_SECTION)) {
                this.clearCache();
            }
        });
    }

    public static getInstance(): ConfigurationService {
        if (!ConfigurationService.instance) {
            ConfigurationService.instance = new ConfigurationService();
        }
        return ConfigurationService.instance;
    }

    /**
     * Get configuration value with caching and default fallback
     */
    public getConfig<K extends keyof KanbanConfiguration>(
        key: K,
        defaultValue?: KanbanConfiguration[K]
    ): KanbanConfiguration[K] {
        const cacheKey = `${this.CONFIGURATION_SECTION}.${key}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
        const value = config.get<KanbanConfiguration[K]>(
            key as string,
            (defaultValue ?? this.defaults[key as keyof ConfigurationDefaults]) as KanbanConfiguration[K]
        );

        this.cache.set(cacheKey, value);
        return value;
    }

    /**
     * Get nested configuration property using dot notation
     */
    public getNestedConfig(path: string, defaultValue?: any): any {
        const cacheKey = `${this.CONFIGURATION_SECTION}.${path}`;

        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }

        const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
        const value = this.getNestedProperty(config, path) ?? defaultValue;

        this.cache.set(cacheKey, value);
        return value;
    }

    /**
     * Update configuration value
     */
    public async updateConfig<K extends keyof KanbanConfiguration>(
        key: K,
        value: KanbanConfiguration[K],
        target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Workspace
    ): Promise<void> {
        const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
        await config.update(key as string, value, target);

        // Clear cache for this key
        const cacheKey = `${this.CONFIGURATION_SECTION}.${key}`;
        this.cache.delete(cacheKey);
    }

    /**
     * Get all configuration as typed object
     */
    public getAllConfig(): Partial<KanbanConfiguration> {
        const config = vscode.workspace.getConfiguration(this.CONFIGURATION_SECTION);
        const result: Partial<KanbanConfiguration> = {};

        // Get all known configuration keys
        for (const key of Object.keys(this.defaults) as Array<keyof ConfigurationDefaults>) {
            result[key as keyof KanbanConfiguration] = config.get(
                key,
                this.defaults[key]
            ) as any;
        }

        return result;
    }

    /**
     * Clear configuration cache
     */
    public clearCache(): void {
        this.cache.clear();
    }

    /**
     * Get configuration for specific features
     */

    // Tag configuration
    public getTagConfiguration() {
        return {
            tagColors: this.getConfig('tagColors', {}),
            tagVisibility: this.getConfig('tagVisibility'),
            exportTagVisibility: this.getConfig('exportTagVisibility')
        };
    }

    // Layout configuration
    public getLayoutConfiguration() {
        return {
            whitespace: this.getConfig('whitespace'),
            taskMinHeight: this.getConfig('taskMinHeight'),
            sectionMaxHeight: this.getConfig('sectionMaxHeight'),
            fontSize: this.getConfig('fontSize'),
            fontFamily: this.getConfig('fontFamily'),
            columnWidth: this.getConfig('columnWidth'),
            layoutRows: this.getConfig('layoutRows'),
            rowHeight: this.getConfig('rowHeight'),
            maxRowHeight: this.getConfig('maxRowHeight'),
            layoutPreset: this.getConfig('layoutPreset'),
            layoutPresets: this.getConfig('layoutPresets', {}),
            arrowKeyFocusScroll: this.getConfig('arrowKeyFocusScroll')
        };
    }

    // Backup configuration
    public getBackupConfiguration() {
        return {
            enableBackups: this.getConfig('enableBackups'),
            backupInterval: this.getConfig('backupInterval'),
            backupLocation: this.getConfig('backupLocation')
        };
    }

    // Link configuration
    public getLinkConfiguration() {
        return {
            openLinksInNewTab: this.getConfig('openLinksInNewTab'),
            pathGeneration: this.getConfig('pathGeneration')
        };
    }

    // Path generation configuration
    public getPathGenerationMode(): 'relative' | 'absolute' {
        return this.getConfig('pathGeneration');
    }

    // Media configuration
    public getMediaConfiguration() {
        return {
            imageFill: this.getConfig('imageFill')
        };
    }

    /**
     * Validate configuration value
     */
    public validateConfig<K extends keyof KanbanConfiguration>(
        key: K,
        value: any
    ): boolean {
        // Add validation logic based on configuration key
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
            case 'imageFill':
                return ['contain', 'cover', 'fill', 'scale-down', 'none'].includes(value);
            default:
                return true; // Default to valid for unknown keys
        }
    }

    /**
     * Helper method to get nested property from object using dot notation
     */
    private getNestedProperty(obj: any, path: string): any {
        return path.split('.').reduce((current, prop) => {
            return current && current[prop] !== undefined ? current[prop] : undefined;
        }, obj);
    }
}

// Export singleton instance
export const configService = ConfigurationService.getInstance();