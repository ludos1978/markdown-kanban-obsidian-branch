import { marpCli } from '@marp-team/marp-cli';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

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

        // Create temporary markdown file
        const tempDir = path.dirname(options.outputPath);
        const tempMdPath = path.join(tempDir, '.temp-marp-export.md');

        try {
            // Write markdown to temp file
            fs.writeFileSync(tempMdPath, markdownContent, 'utf-8');

            // Build Marp CLI arguments
            const args = this.buildMarpCliArgs(tempMdPath, options);

            // Log for debugging
            console.log(`[kanban.MarpExportService] Exporting with Marp CLI: ${args.join(' ')}`);

            // Execute Marp CLI
            const exitCode = await marpCli(args);

            if (exitCode !== 0) {
                throw new Error(`Marp export failed with exit code ${exitCode}`);
            }

            console.log(`[kanban.MarpExportService] Export completed successfully: ${options.outputPath}`);
        } finally {
            // Cleanup temp file
            if (fs.existsSync(tempMdPath)) {
                try {
                    fs.unlinkSync(tempMdPath);
                } catch (err) {
                    console.warn(`[kanban.MarpExportService] Failed to delete temp file: ${tempMdPath}`, err);
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
        }

        // Output path (only for non-markdown formats)
        if (options.format !== 'markdown') {
            args.push('--output', options.outputPath);
        }

        // Engine path
        const enginePath = options.enginePath || this.getDefaultEnginePath();
        if (enginePath && fs.existsSync(enginePath)) {
            args.push('--engine', enginePath);
        } else {
            console.warn(`[kanban.MarpExportService] Engine file not found: ${enginePath}`);
        }

        // Theme
        if (options.theme) {
            args.push('--theme', options.theme);
        }

        // Allow local files (required for images)
        if (options.allowLocalFiles !== false) {
            args.push('--allow-local-files');
        }

        // Additional args
        if (options.additionalArgs) {
            args.push(...options.additionalArgs);
        }

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

            // Try to get themes from Marp CLI
            const { marpCli } = await import('@marp-team/marp-cli');
            
            // Create a temporary markdown file to probe themes
            const tempDir = require('os').tmpdir();
            const tempMdPath = require('path').join(tempDir, '.temp-marp-themes.md');
            const tempContent = '---\nmarp: true\ntheme: test\n---\n# Test';
            
            require('fs').writeFileSync(tempMdPath, tempContent, 'utf-8');

            try {
                // Try to run Marp CLI with --help to see available options
                // This is a workaround since Marp CLI doesn't have a direct themes list command
                const themes = [
                    'default',
                    'gaia', 
                    'uncover',
                ];

                // Try to detect custom themes by checking common locations
                const workspaceFolders = vscode.workspace.workspaceFolders;
                console.log('[kanban.MarpExportService.getAvailableThemes] Workspace folders:', workspaceFolders);
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const workspaceRoot = workspaceFolders[0].uri.fsPath;
                    
                    // Check for custom theme files in common locations
                    const themePaths = [
                        require('path').join(workspaceRoot, '.marp/themes'),
                        require('path').join(workspaceRoot, 'themes'),
                        require('path').join(workspaceRoot, '_themes'),
                        require('path').join(workspaceRoot, 'assets/themes')
                    ];

                    for (const themePath of themePaths) {
                        if (require('fs').existsSync(themePath)) {
                            console.log('[kanban.MarpExportService.getAvailableThemes] Found theme directory:', themePath);
                            const files = require('fs').readdirSync(themePath);
                            const cssFiles = files.filter((file: string) => file.endsWith('.css') || file.endsWith('.marp.css'));
                            cssFiles.forEach((file: string) => {
                                const themeName = file.replace(/\.(css|marp\.css)$/, '');
                                if (!themes.includes(themeName)) {
                                    themes.push(themeName);
                                    console.log('[kanban.MarpExportService.getAvailableThemes] Found custom theme:', themeName);
                                }
                            });
                        }
                    }
                }

                const sortedThemes = themes.sort();
                console.log('[kanban.MarpExportService.getAvailableThemes] Final themes list:', sortedThemes);
                return sortedThemes;
            } finally {
                // Clean up temp file
                try {
                    require('fs').unlinkSync(tempMdPath);
                } catch (err) {
                    // Ignore cleanup errors
                }
            }
        } catch (err) {
            console.error('[kanban.MarpExportService.getAvailableThemes] Failed to get available themes:', err);
            return ['default']; // Fallback to default theme
        }
    }
}
