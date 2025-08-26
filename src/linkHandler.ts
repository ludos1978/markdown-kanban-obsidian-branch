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
     * Enhanced wiki link handler with smart extension handling and workspace folder context
     */
    public async handleWikiLink(documentName: string) {
        const allAttemptedPaths: string[] = [];
        let triedFilenames: string[] = [];
        
        // Check if the document name already has a file extension
        const hasExtension = /\.[a-zA-Z0-9]+$/.test(documentName);
        
        let filesToTry: string[] = [];
        
        if (hasExtension) {
            // If it already has an extension, try it as-is first
            filesToTry = [documentName];
            // Then try with markdown extensions as fallback (in case it's something like "document.v1" that should be "document.v1.md")
            filesToTry.push(documentName + '.md', documentName + '.markdown', documentName + '.txt');
        } else {
            // If no extension, try markdown extensions and then no extension
            filesToTry = [documentName + '.md', documentName + '.markdown', documentName + '.txt', documentName];
        }
        
        for (const filename of filesToTry) {
            triedFilenames.push(filename);
            const resolution = await this._fileManager.resolveFilePath(filename);
            
            if (resolution) {
                allAttemptedPaths.push(...resolution.attemptedPaths);
                
                if (resolution.exists) {
                    try {
                        // For text files, try to open in VS Code
                        const textExtensions = ['.md', '.markdown', '.txt', '.rtf', '.json', '.xml', '.html', '.css', '.js', '.ts', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.php', '.rb', '.go', '.rs', '.sh', '.bat', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf'];
                        const ext = path.extname(filename).toLowerCase();
                        
                        if (!ext || textExtensions.includes(ext)) {
                            // Try to open as text document
                            const document = await vscode.workspace.openTextDocument(resolution.resolvedPath);
                            await vscode.window.showTextDocument(document, {
                                preview: false,
                                preserveFocus: false
                            });
                            
                            vscode.window.showInformationMessage(
                                `Opened wiki link: ${documentName} → ${path.basename(resolution.resolvedPath)}`
                            );
                        } else {
                            // For binary files (images, videos, etc.), reveal in file explorer or open with default application
                            try {
                                await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(resolution.resolvedPath));
                                vscode.window.showInformationMessage(
                                    `Opened wiki link: ${documentName} → ${path.basename(resolution.resolvedPath)} (in default application)`
                                );
                            } catch (osError) {
                                // Fallback: try to open with VS Code anyway
                                await vscode.env.openExternal(vscode.Uri.file(resolution.resolvedPath));
                                vscode.window.showInformationMessage(
                                    `Opened wiki link: ${documentName} → ${path.basename(resolution.resolvedPath)}`
                                );
                            }
                        }
                        return;
                    } catch (error) {
                        console.warn(`Failed to open ${filename}:`, error);
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
            if (hasExtension) {
                contextInfo = `\n\nTip: For files in specific workspace folders, try: [[${folderNames[0]}/${documentName}]]`;
            } else {
                contextInfo = `\n\nTip: For files in specific workspace folders, try: [[${folderNames[0]}/${documentName}]] or [[${folderNames[0]}/${documentName}.ext]]`;
            }
        }
        
        const pathsList = allAttemptedPaths.map((p, i) => `  ${i + 1}. ${p}`).join('\n');
        const extensionsList = triedFilenames.join(', ');
        
        const hasExtensionNote = hasExtension 
            ? `\n\nNote: "${documentName}" already has an extension, so it was tried as-is first.`
            : `\n\nNote: "${documentName}" has no extension, so markdown extensions (.md, .markdown, .txt) were tried first.`;
        
        vscode.window.showWarningMessage(
            `Wiki link not found: [[${documentName}]]\n\nTried filenames: ${extensionsList}\n\nSearched in the following locations:\n${pathsList}${hasExtensionNote}${contextInfo}`,
            { modal: false }
        );
        
        // Enhanced console logging
        console.warn(`Wiki link not found: [[${documentName}]]`);
        console.warn('Tried filenames:', triedFilenames);
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