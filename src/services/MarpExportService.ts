import { marpCli } from '@marp-team/marp-cli';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { ConfigurationService } from '../configurationService';

export type MarpOutputFormat = 'pdf' | 'pptx' | 'html' | 'markdown';

export interface MarpExportOptions {
    /** Output format */
    format: MarpOutputFormat;
    /** Output file path */
    outputPath: string;
    /** Path to custom engine.js */
    enginePath?: string;
    /** Marp theme */
    theme?: string;
    /** Allow local file access */
    allowLocalFiles?: boolean;
    /** Additional Marp CLI arguments */
    additionalArgs?: string[];
}

/**
 * Service to export content using Marp CLI
 */
export class MarpExportService {
    private static readonly DEFAULT_ENGINE_PATH = './marp-engine/engine.js';

    /**
     * Export markdown content using Marp CLI
     * @param markdownContent - The markdown content to export
     * @param options - Export options
     * @returns Promise that resolves when export is complete
     */
    static async export(markdownContent: string, options: MarpExportOptions): Promise<void> {
        // Validate Marp CLI availability
        const isAvailable = await this.isMarpCliAvailable();
        if (!isAvailable) {
            throw new Error('Marp CLI is not available. Please ensure @marp-team/marp-cli is installed.');
        }

        // Get configuration for temp file handling
        const configService = ConfigurationService.getInstance();
        const keepTempFiles = configService.getNestedConfig('marp.keepTempFiles', false) as boolean;

        // Create temporary markdown file
        const tempDir = path.dirname(options.outputPath);
        const tempMdPath = keepTempFiles 
            ? path.join(tempDir, `${path.basename(options.outputPath, path.extname(options.outputPath))}.marp-temp.md`)
            : path.join(tempDir, '.temp-marp-export.md');

        // Get working directory for logging
        const workingDir = process.cwd();
        
        try {
            // Write markdown to temp file
            fs.writeFileSync(tempMdPath, markdownContent, 'utf-8');
            console.log(`[kanban.MarpExportService] Created temp file: ${tempMdPath}`);
            console.log(`[kanban.MarpExportService] Working directory: ${workingDir}`);
            console.log(`[kanban.MarpExportService] Keep temp files: ${keepTempFiles}`);

            // Build Marp CLI arguments
            const args = this.buildMarpCliArgs(tempMdPath, options);

            // Enhanced logging for debugging
            const fullCommand = `npx @marp-team/marp-cli ${args.join(' ')}`;
            console.log(`[kanban.MarpExportService] === MARP EXPORT DEBUG INFO ===`);
            console.log(`[kanban.MarpExportService] Working directory: ${workingDir}`);
            console.log(`[kanban.MarpExportService] Temp file path: ${tempMdPath}`);
            console.log(`[kanban.MarpExportService] Output path: ${options.outputPath}`);
            console.log(`[kanban.MarpExportService] Full command: ${fullCommand}`);
            console.log(`[kanban.MarpExportService] Args array:`, args);
            console.log(`[kanban.MarpExportService] Export options:`, JSON.stringify(options, null, 2));
            console.log(`[kanban.MarpExportService] Temp file exists: ${fs.existsSync(tempMdPath)}`);
            console.log(`[kanban.MarpExportService] Temp file size: ${fs.statSync(tempMdPath).size} bytes`);
            console.log(`[kanban.MarpExportService] ======================================`);

            // Change working directory to workspace root for proper path resolution
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const originalWorkingDir = process.cwd();
            const enginePath = options.enginePath || this.getDefaultEnginePath();
            const absoluteEnginePath = path.resolve(enginePath);
            
            console.log(`[kanban.MarpExportService] === PRE-EXECUTION DEBUG ===`);
            console.log(`[kanban.MarpExportService] Original working directory: ${originalWorkingDir}`);
            console.log(`[kanban.MarpExportService] Engine path: ${enginePath}`);
            console.log(`[kanban.MarpExportService] Absolute engine path: ${absoluteEnginePath}`);
            console.log(`[kanban.MarpExportService] Engine exists: ${fs.existsSync(absoluteEnginePath)}`);
            console.log(`[kanban.MarpExportService] Temp file: ${tempMdPath}`);
            console.log(`[kanban.MarpExportService] Temp file exists: ${fs.existsSync(tempMdPath)}`);
            console.log(`[kanban.MarpExportService] Args before execution:`, args);
            console.log(`[kanban.MarpExportService] Full args string: ${args.join(' ')}`);
            
            // Ensure we're working from the workspace root, not the dist folder
            let workspaceRoot = originalWorkingDir;
            if (workspaceFolders && workspaceFolders.length > 0) {
                workspaceRoot = workspaceFolders[0].uri.fsPath;
                console.log(`[kanban.MarpExportService] Changing working directory to workspace root: ${workspaceRoot}`);
                console.log(`[kanban.MarpExportService] Current working directory before change: ${process.cwd()}`);
                process.chdir(workspaceRoot);
                console.log(`[kanban.MarpExportService] Working directory after change: ${process.cwd()}`);
            }
            
            // Create temp files in workspace root to avoid dist folder issues
            const workspaceTempPath = path.join(workspaceRoot, '.temp-marp-export.md');
            fs.writeFileSync(workspaceTempPath, markdownContent, 'utf-8');
            console.log(`[kanban.MarpExportService] Created workspace temp file: ${workspaceTempPath}`);
            
            // Use absolute paths to avoid any working directory issues
            // but ensure the engine path is correctly resolved
            const finalEnginePath = fs.existsSync(absoluteEnginePath) ? absoluteEnginePath : undefined;
            
            // Rebuild args with workspace temp file
            const updatedArgs = this.buildMarpCliArgs(workspaceTempPath, {
                ...options,
                outputPath: options.outputPath,
                enginePath: finalEnginePath
            });
            
            console.log(`[kanban.MarpExportService] Using workspace temp path: ${workspaceTempPath}`);
            console.log(`[kanban.MarpExportService] Using absolute output path: ${options.outputPath}`);
            console.log(`[kanban.MarpExportService] Final engine path: ${finalEnginePath}`);
            console.log(`[kanban.MarpExportService] Updated args:`, updatedArgs);

            try {
                // Execute Marp CLI with updated args
                console.log(`[kanban.MarpExportService] Executing Marp CLI with args:`, updatedArgs);
                const exitCode = await marpCli(updatedArgs);
                console.log(`[kanban.MarpExportService] Marp CLI exit code: ${exitCode}`);
                
                if (exitCode !== 0) {
                    // Enhanced error logging
                    console.error(`[kanban.MarpExportService] === MARP EXPORT FAILED ===`);
                    console.error(`[kanban.MarpExportService] Exit code: ${exitCode}`);
                    console.error(`[kanban.MarpExportService] Original working directory: ${originalWorkingDir}`);
                    console.error(`[kanban.MarpExportService] Marp CLI working directory: ${process.cwd()}`);
                    console.error(`[kanban.MarpExportService] Command that failed: ${fullCommand}`);
                    console.error(`[kanban.MarpExportService] Temp file: ${workspaceTempPath}`);
                    console.error(`[kanban.MarpExportService] Output path: ${options.outputPath}`);
                    console.error(`[kanban.MarpExportService] Engine path: ${enginePath}`);
                    
                    // Check if output file was partially created
                    if (fs.existsSync(options.outputPath)) {
                        const stats = fs.statSync(options.outputPath);
                        console.error(`[kanban.MarpExportService] Partial output file exists: ${stats.size} bytes`);
                    }
                    
                    console.error(`[kanban.MarpExportService] =========================`);
                    
                    throw new Error(`Marp export failed with exit code ${exitCode}. Original working directory: ${originalWorkingDir}, Marp CLI working directory: ${process.cwd()}, Command: ${fullCommand}, Temp file: ${tempMdPath}, Engine path: ${enginePath}`);
                }

                console.log(`[kanban.MarpExportService] Export completed successfully: ${options.outputPath}`);
            } finally {
                // Restore original working directory
                process.chdir(originalWorkingDir);
                console.log(`[kanban.MarpExportService] Restored working directory to: ${originalWorkingDir}`);
            }

            
            if (keepTempFiles) {
                console.log(`[kanban.MarpExportService] Temp file kept for debugging: ${tempMdPath}`);
            }
        } finally {
            // Cleanup temp files only if not configured to keep it
            if (!keepTempFiles) {
                if (fs.existsSync(tempMdPath)) {
                    try {
                        fs.unlinkSync(tempMdPath);
                        console.log(`[kanban.MarpExportService] Temp file cleaned up: ${tempMdPath}`);
                    } catch (err) {
                        console.warn(`[kanban.MarpExportService] Failed to delete temp file: ${tempMdPath}`, err);
                    }
                }
                if (fs.existsSync(workspaceTempPath)) {
                    try {
                        fs.unlinkSync(workspaceTempPath);
                        console.log(`[kanban.MarpExportService] Workspace temp file cleaned up: ${workspaceTempPath}`);
                    } catch (err) {
                        console.warn(`[kanban.MarpExportService] Failed to delete workspace temp file: ${workspaceTempPath}`, err);
                    }
                }
            }
        }
    }

    /**
     * Build Marp CLI arguments from options
     * @param inputPath - Path to input markdown file
     * @param options - Export options
     * @returns Array of CLI arguments
     */
    private static buildMarpCliArgs(inputPath: string, options: MarpExportOptions): string[] {
        const args: string[] = [inputPath];

        // Output format
        if (options.format === 'pdf') {
            args.push('--pdf');
        } else if (options.format === 'pptx') {
            args.push('--pptx');
        } else if (options.format === 'html') {
            args.push('--html');
            // For HTML export, add preview to open in browser
            args.push('--preview');
        }

        // Output path (only for non-markdown formats, but not for HTML with preview)
        if (options.format !== 'markdown' && !(options.format === 'html' && args.includes('--preview'))) {
            args.push('--output', options.outputPath);
        }

        // Engine path - use absolute path to avoid resolution issues
        const enginePath = options.enginePath || this.getDefaultEnginePath();
        const absoluteEnginePath = path.resolve(enginePath);
        console.log(`[kanban.MarpExportService] Original engine path: ${enginePath}`);
        console.log(`[kanban.MarpExportService] Absolute engine path: ${absoluteEnginePath}`);
        console.log(`[kanban.MarpExportService] Engine file exists: ${fs.existsSync(absoluteEnginePath)}`);
        if (absoluteEnginePath && fs.existsSync(absoluteEnginePath)) {
            args.push('--engine', absoluteEnginePath);
        } else {
            console.warn(`[kanban.MarpExportService] Engine file not found: ${absoluteEnginePath}`);
        }

        // Theme
        if (options.theme) {
            args.push('--theme', options.theme);
        }

        // Theme set - add configured theme directories
        const configService = ConfigurationService.getInstance();
        const configuredThemeFolders = configService.getNestedConfig('marp.themeFolders', []) as string[];
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        // Add configured theme folders first
        if (configuredThemeFolders.length > 0 && workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            
            for (const themeFolder of configuredThemeFolders) {
                let resolvedPath: string;
                
                // Resolve relative paths against workspace root, keep absolute paths as-is
                if (path.isAbsolute(themeFolder)) {
                    resolvedPath = themeFolder;
                } else {
                    resolvedPath = path.resolve(workspaceRoot, themeFolder);
                }
                
                if (fs.existsSync(resolvedPath)) {
                    console.log(`[kanban.MarpExportService] Adding configured theme set directory: ${resolvedPath}`);
                    args.push('--theme-set', resolvedPath);
                } else {
                    console.warn(`[kanban.MarpExportService] Configured theme directory not found: ${resolvedPath}`);
                }
            }
        }
        
        // Fallback to common theme directories if no configured folders were found/added
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            
            // Check for custom theme directories in common locations
            const themePaths = [
                path.join(workspaceRoot, '.marp/themes'),
                path.join(workspaceRoot, 'themes'),
                path.join(workspaceRoot, '_themes'),
                path.join(workspaceRoot, 'assets/themes')
            ];

            for (const themePath of themePaths) {
                if (fs.existsSync(themePath)) {
                    console.log(`[kanban.MarpExportService] Adding fallback theme set directory: ${themePath}`);
                    args.push('--theme-set', themePath);
                    break; // Only add the first found theme directory
                }
            }
        }

        // Allow local files (required for images)
        if (options.allowLocalFiles !== false) {
            args.push('--allow-local-files');
        }

        // Browser setting - prioritize options.additionalArgs, then config
        let browser: string | undefined;

        // First, extract browser from additionalArgs if present
        if (options.additionalArgs) {
            const browserIndex = options.additionalArgs.findIndex(arg => arg === '--browser');
            if (browserIndex !== -1 && browserIndex + 1 < options.additionalArgs.length) {
                browser = options.additionalArgs[browserIndex + 1];
                // Remove from additionalArgs to avoid duplication
                options.additionalArgs.splice(browserIndex, 2);
                console.log(`[kanban.MarpExportService] Using browser from additionalArgs: ${browser}`);
            }
        }

        // If no browser in additionalArgs, use from config
        if (!browser) {
            const configService = ConfigurationService.getInstance();
            browser = configService.getNestedConfig('marp.browser', 'chrome');
            console.log(`[kanban.MarpExportService] Using browser from config: ${browser}`);
            console.log(`[kanban.MarpExportService] Config service instance:`, !!configService);
        }

        if (browser && browser !== 'auto') {
            // Add browser option for all formats that can use it
            // HTML export uses browser for preview, PDF/PPTX for rendering
            args.push('--browser', browser);
            console.log(`[kanban.MarpExportService] Using browser for ${options.format}: ${browser}`);
        }

        // Additional args
        if (options.additionalArgs) {
            args.push(...options.additionalArgs);
        }

        // Final log of all arguments
        console.log(`[kanban.MarpExportService.buildMarpCliArgs] Final arguments:`, args);
        console.log(`[kanban.MarpExportService.buildMarpCliArgs] Arguments count: ${args.length}`);

        return args;
    }

    /**
     * Get the default engine path from workspace configuration
     * @returns Resolved engine path
     */
    private static getDefaultEnginePath(): string {
        const config = vscode.workspace.getConfiguration('markdown-kanban.marp');
        const configuredPath = config.get<string>('enginePath');

        if (configuredPath) {
            // Resolve relative to workspace root
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (workspaceFolders && workspaceFolders.length > 0) {
                return path.resolve(workspaceFolders[0].uri.fsPath, configuredPath);
            }
            return path.resolve(configuredPath);
        }

        // Default to ./marp-engine/engine.js relative to workspace
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            return path.join(workspaceFolders[0].uri.fsPath, this.DEFAULT_ENGINE_PATH);
        }

        return this.DEFAULT_ENGINE_PATH;
    }

    /**
     * Export to PDF using Marp
     * @param markdownContent - Markdown content
     * @param outputPath - Output PDF path
     * @param enginePath - Optional custom engine path
     * @returns Promise that resolves when export is complete
     */
    static async exportToPdf(
        markdownContent: string,
        outputPath: string,
        enginePath?: string
    ): Promise<void> {
        return this.export(markdownContent, {
            format: 'pdf',
            outputPath,
            enginePath
        });
    }

    /**
     * Export to PPTX using Marp
     * @param markdownContent - Markdown content
     * @param outputPath - Output PPTX path
     * @param enginePath - Optional custom engine path
     * @returns Promise that resolves when export is complete
     */
    static async exportToPptx(
        markdownContent: string,
        outputPath: string,
        enginePath?: string
    ): Promise<void> {
        return this.export(markdownContent, {
            format: 'pptx',
            outputPath,
            enginePath
        });
    }

    /**
     * Export to HTML using Marp
     * @param markdownContent - Markdown content
     * @param outputPath - Output HTML path
     * @param enginePath - Optional custom engine path
     * @returns Promise that resolves when export is complete
     */
    static async exportToHtml(
        markdownContent: string,
        outputPath: string,
        enginePath?: string
    ): Promise<void> {
        return this.export(markdownContent, {
            format: 'html',
            outputPath,
            enginePath
        });
    }

    /**
     * Check if Marp CLI is available
     * @returns Promise that resolves to true if available
     */
    static async isMarpCliAvailable(): Promise<boolean> {
        try {
            // Try to import marpCli
            const cli = await import('@marp-team/marp-cli');
            return !!cli.marpCli;
        } catch (err) {
            console.error('[kanban.MarpExportService] Marp CLI not available:', err);
            return false;
        }
    }

    /**
     * Check if custom engine file exists
     * @param enginePath - Optional custom path, otherwise uses default
     * @returns True if engine file exists
     */
    static engineFileExists(enginePath?: string): boolean {
        const resolvedPath = enginePath || this.getDefaultEnginePath();
        return fs.existsSync(resolvedPath);
    }

    /**
     * Get Marp CLI version
     * @returns Version string or null if not available
     */
    static async getMarpVersion(): Promise<string | null> {
        try {
            // Try to read package.json from node_modules
            const fs = await import('fs');
            const path = await import('path');
            const pkgPath = path.join(__dirname, '../../node_modules/@marp-team/marp-cli/package.json');
            if (fs.existsSync(pkgPath)) {
                const pkgContent = fs.readFileSync(pkgPath, 'utf-8');
                const pkg = JSON.parse(pkgContent);
                return pkg.version;
            }
            return null;
        } catch (err) {
            return null;
        }
    }

    /**
     * Get available Marp themes
     * @returns Promise that resolves to an array of available theme names
     */
    static async getAvailableThemes(): Promise<string[]> {
        console.log('[kanban.MarpExportService.getAvailableThemes] Starting to get available themes...');
        try {
            // Check if Marp CLI is available first
            const isAvailable = await this.isMarpCliAvailable();
            console.log('[kanban.MarpExportService.getAvailableThemes] Marp CLI available:', isAvailable);
            if (!isAvailable) {
                console.log('[kanban.MarpExportService.getAvailableThemes] Using fallback themes');
                return ['default']; // Fallback to default theme
            }

            // Start with built-in themes
            const themes = [
                'default',
                'gaia', 
                'uncover',
            ];

            // Get configured theme folders
            const configService = ConfigurationService.getInstance();
            const configuredThemeFolders = configService.getNestedConfig('marp.themeFolders', []) as string[];
            const workspaceFolders = vscode.workspace.workspaceFolders;
            console.log('[kanban.MarpExportService.getAvailableThemes] Workspace folders:', workspaceFolders);
            console.log('[kanban.MarpExportService.getAvailableThemes] Configured theme folders:', configuredThemeFolders);
            
            // Check configured theme folders first
            if (configuredThemeFolders.length > 0 && workspaceFolders && workspaceFolders.length > 0) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                
                for (const themeFolder of configuredThemeFolders) {
                    let resolvedPath: string;
                    
                    // Resolve relative paths against workspace root, keep absolute paths as-is
                    if (path.isAbsolute(themeFolder)) {
                        resolvedPath = themeFolder;
                    } else {
                        resolvedPath = path.resolve(workspaceRoot, themeFolder);
                    }
                    
                    if (fs.existsSync(resolvedPath)) {
                        console.log('[kanban.MarpExportService.getAvailableThemes] Found configured theme directory:', resolvedPath);
                        const files = fs.readdirSync(resolvedPath);
                        const cssFiles = files.filter((file: string) => file.endsWith('.css') || file.endsWith('.marp.css'));
                        cssFiles.forEach((file: string) => {
                            const themeName = file.replace(/\.(css|marp\.css)$/, '');
                            if (!themes.includes(themeName)) {
                                themes.push(themeName);
                                console.log('[kanban.MarpExportService.getAvailableThemes] Found custom theme:', themeName);
                            }
                        });
                    } else {
                        console.warn('[kanban.MarpExportService.getAvailableThemes] Configured theme directory not found:', resolvedPath);
                    }
                }
            }
            
            // Fallback to common theme directories
            if (workspaceFolders && workspaceFolders.length > 0) {
                const workspaceRoot = workspaceFolders[0].uri.fsPath;
                
                // Check for custom theme files in common locations
                const themePaths = [
                    path.join(workspaceRoot, '.marp/themes'),
                    path.join(workspaceRoot, 'themes'),
                    path.join(workspaceRoot, '_themes'),
                    path.join(workspaceRoot, 'assets/themes')
                ];

                for (const themePath of themePaths) {
                    if (fs.existsSync(themePath)) {
                        console.log('[kanban.MarpExportService.getAvailableThemes] Found fallback theme directory:', themePath);
                        const files = fs.readdirSync(themePath);
                        const cssFiles = files.filter((file: string) => file.endsWith('.css') || file.endsWith('.marp.css'));
                        cssFiles.forEach((file: string) => {
                            const themeName = file.replace(/\.(css|marp\.css)$/, '');
                            if (!themes.includes(themeName)) {
                                themes.push(themeName);
                                console.log('[kanban.MarpExportService.getAvailableThemes] Found fallback custom theme:', themeName);
                            }
                        });
                    }
                }
            }

            const sortedThemes = themes.sort();
            console.log('[kanban.MarpExportService.getAvailableThemes] Final themes list:', sortedThemes);
            return sortedThemes;
        } catch (err) {
            console.error('[kanban.MarpExportService.getAvailableThemes] Failed to get available themes:', err);
            return ['default']; // Fallback to default theme
        }
    }
}
