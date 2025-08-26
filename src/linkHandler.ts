import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileManager, FileResolutionResult } from './fileManager';

export class LinkHandler {
    private _fileManager: FileManager;

    constructor(fileManager: FileManager) {
        this._fileManager = fileManager;
    }

    /**
     * Enhanced file link handler with workspace-relative path support
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

            const { resolvedPath, exists, isAbsolute, attemptedPaths } = resolution;

            if (!exists) {
                // Enhanced error message with workspace context
                const workspaceFolders = vscode.workspace.workspaceFolders;
                let contextInfo = '';
                
                if (workspaceFolders && workspaceFolders.length > 0) {
                    const folderNames = workspaceFolders.map(f => path.basename(f.uri.fsPath));
                    
                    // Check if this looks like a workspace-relative path
                    const startsWithWorkspaceFolder = folderNames.some(name => 
                        href.startsWith(name + '/') || href.startsWith(name + '\\')
                    );
                    
                    if (startsWithWorkspaceFolder) {
                        contextInfo = `\n\nNote: This appears to be a workspace-relative path. Available workspace folders: ${folderNames.join(', ')}`;
                    } else {
                        contextInfo = `\n\nTip: For files in workspace folders, use paths like: ${folderNames[0]}/path/to/file.ext`;
                    }
                }
                
                const pathsList = attemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n');
                
                if (isAbsolute) {
                    vscode.window.showWarningMessage(
                        `File not found: ${resolvedPath}\n\nAttempted path:\n${pathsList}${contextInfo}`,
                        { modal: false }
                    );
                } else {
                    vscode.window.showWarningMessage(
                        `File not found: ${href}\n\nSearched in the following locations:\n${pathsList}${contextInfo}`,
                        { modal: false }
                    );
                }
                
                // Enhanced console logging with workspace info
                console.warn(`File not found: ${href}`);
                console.warn('Attempted paths:');
                attemptedPaths.forEach((path, i) => console.warn(`  ${i + 1}. ${path}`));
                if (workspaceFolders) {
                    console.warn('Available workspace folders:', workspaceFolders.map(f => path.basename(f.uri.fsPath)).join(', '));
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
                
                // Enhanced success message showing resolution method
                if (!isAbsolute) {
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    const isWorkspaceRelative = workspaceFolders?.some(f => 
                        href.startsWith(path.basename(f.uri.fsPath) + '/')
                    );
                    
                    const resolutionMethod = isWorkspaceRelative ? 'workspace-relative' : 'document-relative';
                    vscode.window.showInformationMessage(
                        `Opened: ${path.basename(resolvedPath)} (${resolutionMethod} path: ${href})`
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
     * Enhanced wiki link handler with workspace folder context
     */
    public async handleWikiLink(documentName: string) {
        const possibleExtensions = ['.md', '.markdown', '.txt', ''];
        const allAttemptedPaths: string[] = [];
        
        for (const ext of possibleExtensions) {
            const filename = documentName + ext;
            const resolution = await this._fileManager.resolveFilePath(filename);
            
            if (resolution) {
                allAttemptedPaths.push(...resolution.attemptedPaths);
                
                if (resolution.exists) {
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
        }
        
        // Enhanced error message with workspace context
        const workspaceFolders = vscode.workspace.workspaceFolders;
        let contextInfo = '';
        
        if (workspaceFolders && workspaceFolders.length > 0) {
            const folderNames = workspaceFolders.map(f => path.basename(f.uri.fsPath));
            contextInfo = `\n\nTip: For files in specific workspace folders, try: [[${folderNames[0]}/${documentName}]]`;
        }
        
        const pathsList = allAttemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n');
        const extensionsList = possibleExtensions.map(ext => documentName + ext).join(', ');
        
        vscode.window.showWarningMessage(
            `Wiki link not found: [[${documentName}]]\n\nTried extensions: ${extensionsList}\n\nSearched in the following locations:\n${pathsList}${contextInfo}`,
            { modal: false }
        );
        
        // Enhanced console logging
        console.warn(`Wiki link not found: [[${documentName}]]`);
        console.warn('All attempted paths:');
        allAttemptedPaths.forEach((path, i) => console.warn(`  ${i + 1}. ${path}`));
        if (workspaceFolders) {
            console.warn('Available workspace folders:', workspaceFolders.map(f => path.basename(f.uri.fsPath)).join(', '));
        }
    }

    public async handleExternalLink(href: string) {
        vscode.env.openExternal(vscode.Uri.parse(href));
    }
}