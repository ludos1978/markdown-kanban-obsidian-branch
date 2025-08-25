import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileManager } from './fileManager';

export class LinkHandler {
    private _fileManager: FileManager;

    constructor(fileManager: FileManager) {
        this._fileManager = fileManager;
    }

    /**
     * Enhanced file link handler with better path resolution
     */
    public async handleFileLink(href: string) {
        try {
            if (href.startsWith('file://')) {
                href = vscode.Uri.parse(href).fsPath;
            }

            if (href.startsWith('vscode-webview://')) {
                return;
            }

            const resolution = await this._fileManager.resolveFilePath(href);
            
            if (!resolution) {
                vscode.window.showErrorMessage(`Could not resolve file path: ${href}`);
                return;
            }

            const { resolvedPath, exists } = resolution;

            if (!exists) {
                if (resolution.isAbsolute) {
                    vscode.window.showWarningMessage(`File not found: ${resolvedPath}`);
                } else {
                    vscode.window.showWarningMessage(
                        `File not found: ${href}\n` +
                        `Searched in document directory and workspace folders.\n` +
                        `Last attempted: ${resolvedPath}`
                    );
                }
                return;
            }

            try {
                const stats = fs.statSync(resolvedPath);
                
                if (stats.isDirectory()) {
                    vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(resolvedPath));
                    return;
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Error accessing file: ${resolvedPath}`);
                return;
            }

            const config = vscode.workspace.getConfiguration('markdownKanban');
            const openInNewTab = config.get<boolean>('openLinksInNewTab', false);
            
            try {
                const document = await vscode.workspace.openTextDocument(resolvedPath);
                
                if (openInNewTab) {
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        viewColumn: vscode.ViewColumn.Beside
                    });
                } else {
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        preserveFocus: false
                    });
                }
                
                if (!resolution.isAbsolute) {
                    vscode.window.showInformationMessage(
                        `Opened: ${path.basename(resolvedPath)} (resolved from: ${href})`
                    );
                }
                
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${resolvedPath}`);
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to handle file link: ${href}`);
        }
    }

    /**
     * Enhanced method for handling wiki links with proper path resolution
     */
    public async handleWikiLink(documentName: string) {
        const possibleExtensions = ['.md', '.markdown', '.txt', ''];
        
        for (const ext of possibleExtensions) {
            const filename = documentName + ext;
            const resolution = await this._fileManager.resolveFilePath(filename);
            
            if (resolution && resolution.exists) {
                try {
                    const document = await vscode.workspace.openTextDocument(resolution.resolvedPath);
                    await vscode.window.showTextDocument(document, {
                        preview: false,
                        preserveFocus: false
                    });
                    
                    vscode.window.showInformationMessage(
                        `Opened wiki link: ${documentName} → ${path.basename(resolution.resolvedPath)}`
                    );
                    return;
                } catch (error) {
                    continue;
                }
            }
        }
        
        vscode.window.showWarningMessage(
            `Wiki link not found: [[${documentName}]]\n` +
            `Searched for: ${possibleExtensions.map(ext => documentName + ext).join(', ')}\n` +
            `In document directory and workspace folders.`
        );
    }

    public async handleExternalLink(href: string) {
        vscode.env.openExternal(vscode.Uri.parse(href));
    }
}