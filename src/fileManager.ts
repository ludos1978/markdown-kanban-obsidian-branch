import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export interface FileInfo {
    fileName: string;
    filePath: string;
    documentPath: string;
    isLocked: boolean;
}

export interface FileDropInfo {
    fileName: string;
    relativePath: string;
    isImage: boolean;
    activeEditor?: any;
    dropPosition?: { x: number; y: number };
}

export interface ImagePathMapping {
    [originalPath: string]: string;
}

export interface FileResolutionResult {
    resolvedPath: string;
    exists: boolean;
    isAbsolute: boolean;
    attemptedPaths: string[]; // Track all attempted paths for debugging
}

export class FileManager {
    private _document?: vscode.TextDocument;
    private _isFileLocked: boolean = false;
    private _webview: vscode.Webview;
    private _extensionUri: vscode.Uri;

    constructor(webview: vscode.Webview, extensionUri: vscode.Uri) {
        this._webview = webview;
        this._extensionUri = extensionUri;
    }

    public setDocument(document: vscode.TextDocument | undefined) {
        this._document = document;
    }

    public getDocument(): vscode.TextDocument | undefined {
        return this._document;
    }

    public isFileLocked(): boolean {
        return this._isFileLocked;
    }

    public toggleFileLock(): void {
        this._isFileLocked = !this._isFileLocked;
        this.sendFileInfo();
        const status = this._isFileLocked ? 'locked' : 'unlocked';
        vscode.window.showInformationMessage(`Kanban file ${status}`);
    }

    public getCurrentDocumentUri(): vscode.Uri | undefined {
        return this._document?.uri;
    }

    public sendFileInfo() {
        const fileInfo: FileInfo = {
            fileName: this._document ? path.basename(this._document.fileName) : 'No file loaded',
            filePath: this._document ? this._document.fileName : '',
            documentPath: this._document ? this._document.uri.fsPath : '',
            isLocked: this._isFileLocked
        };

        setTimeout(() => {
            this._webview.postMessage({
                type: 'updateFileInfo',
                fileInfo: fileInfo
            });
        }, 10);
    }

    public async selectFile(): Promise<vscode.TextDocument | null> {
        const fileUris = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: {
                'Markdown files': ['md']
            }
        });

        if (fileUris && fileUris.length > 0) {
            const targetUri = fileUris[0];
            try {
                const document = await vscode.workspace.openTextDocument(targetUri);
                return document;
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${error}`);
                return null;
            }
        }
        return null;
    }

    /**
     * Enhanced relative path generation that uses workspace folder names when appropriate
     */
    private getRelativePath(filePath: string): string {
        if (!this._document) {
            return filePath;
        }
        
        const documentDir = path.dirname(this._document.uri.fsPath);
        const workspaceFolders = vscode.workspace.workspaceFolders;
        
        // First, try to find if file is in a workspace folder
        if (workspaceFolders && workspaceFolders.length > 0) {
            for (const folder of workspaceFolders) {
                const folderPath = folder.uri.fsPath;
                const folderName = path.basename(folderPath);
                
                // Check if file is within this workspace folder
                if (filePath.startsWith(folderPath + path.sep) || filePath.startsWith(folderPath + '/')) {
                    // Check if document is also in the same workspace folder
                    const documentInSameWorkspace = documentDir.startsWith(folderPath + path.sep) || 
                                                  documentDir.startsWith(folderPath + '/');
                    
                    if (documentInSameWorkspace) {
                        // Both in same workspace - use traditional relative path
                        const relativePath = path.relative(documentDir, filePath);
                        return relativePath.replace(/\\/g, '/');
                    } else {
                        // File in workspace, document elsewhere - use workspace-relative path
                        const relativeToWorkspace = path.relative(folderPath, filePath);
                        return (folderName + '/' + relativeToWorkspace).replace(/\\/g, '/');
                    }
                }
            }
            
            // Check if document is in a workspace folder and file is in a different workspace
            for (const docFolder of workspaceFolders) {
                const docFolderPath = docFolder.uri.fsPath;
                if (documentDir.startsWith(docFolderPath + path.sep) || 
                    documentDir.startsWith(docFolderPath + '/')) {
                    
                    // Document is in a workspace, check if file is in a different workspace
                    for (const fileFolder of workspaceFolders) {
                        const fileFolderPath = fileFolder.uri.fsPath;
                        const fileFolderName = path.basename(fileFolderPath);
                        
                        if (fileFolder !== docFolder && 
                            (filePath.startsWith(fileFolderPath + path.sep) || 
                             filePath.startsWith(fileFolderPath + '/'))) {
                            // File in different workspace - use workspace-relative path
                            const relativeToWorkspace = path.relative(fileFolderPath, filePath);
                            return (fileFolderName + '/' + relativeToWorkspace).replace(/\\/g, '/');
                        }
                    }
                    break;
                }
            }
        }
        
        // Fall back to traditional relative path
        const relativePath = path.relative(documentDir, filePath);
        return relativePath.replace(/\\/g, '/');
    }

    private isImageFile(fileName: string): boolean {
        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
        const ext = path.extname(fileName).toLowerCase();
        return imageExtensions.includes(ext);
    }

    public async handleFileDrop(message: any) {
        try {
            const { fileName, dropPosition, activeEditor } = message;
            const isImage = this.isImageFile(fileName);
            const relativePath = `./${fileName}`;
            
            const fileInfo: FileDropInfo = {
                fileName,
                relativePath,
                isImage,
                activeEditor,
                dropPosition
            };
            
            this._webview.postMessage({
                type: 'insertFileLink',
                fileInfo: fileInfo
            });
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to handle file drop: ${error}`);
        }
    }

    /**
     * Enhanced drag & drop handling with workspace-relative paths
     */
    public async handleUriDrop(message: any) {
        try {
            const { uris, dropPosition, activeEditor } = message;
            
            for (const uriString of uris) {
                let uri: vscode.Uri;
                try {
                    if (uriString.startsWith('file://')) {
                        uri = vscode.Uri.parse(uriString);
                    } else {
                        uri = vscode.Uri.file(uriString);
                    }
                } catch (parseError) {
                    continue;
                }
                
                const fileName = path.basename(uri.fsPath);
                const isImage = this.isImageFile(fileName);
                
                // Use enhanced relative path generation
                const relativePath = this.getRelativePath(uri.fsPath);
                
                const fileInfo: FileDropInfo = {
                    fileName,
                    relativePath,
                    isImage,
                    activeEditor,
                    dropPosition
                };
                
                this._webview.postMessage({
                    type: 'insertFileLink',
                    fileInfo: fileInfo
                });
                
                break;
            }
            
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to handle URI drop: ${error}`);
        }
    }

    /**
     * Enhanced file path resolution that handles workspace-relative paths
     */
    public async resolveFilePath(href: string): Promise<FileResolutionResult | null> {
        const attemptedPaths: string[] = [];
        
        const isAbsolute = path.isAbsolute(href) || 
                        href.match(/^[a-zA-Z]:/) || 
                        href.startsWith('/') ||     
                        href.startsWith('\\');     

        if (isAbsolute) {
            attemptedPaths.push(href);
            try {
                const exists = fs.existsSync(href);
                return { 
                    resolvedPath: href, 
                    exists, 
                    isAbsolute: true,
                    attemptedPaths 
                };
            } catch (error) {
                return { 
                    resolvedPath: href, 
                    exists: false, 
                    isAbsolute: true,
                    attemptedPaths 
                };
            }
        }

        const candidates: string[] = [];
        const workspaceFolders = vscode.workspace.workspaceFolders;

        // Check if path starts with a workspace folder name
        let isWorkspaceRelative = false;
        if (workspaceFolders && workspaceFolders.length > 0) {
            for (const folder of workspaceFolders) {
                const folderName = path.basename(folder.uri.fsPath);
                if (href.startsWith(folderName + '/') || href.startsWith(folderName + '\\')) {
                    // This is a workspace-relative path
                    isWorkspaceRelative = true;
                    const relativePath = href.substring(folderName.length + 1);
                    const candidate = path.resolve(folder.uri.fsPath, relativePath);
                    candidates.push(candidate);
                    attemptedPaths.push(candidate);
                    break;
                }
            }
        }

        // If not workspace-relative, use standard resolution strategy
        if (!isWorkspaceRelative) {
            // First: Check relative to current document directory (only if we have a document)
            if (this._document) {
                const currentDir = path.dirname(this._document.uri.fsPath);
                const candidate = path.resolve(currentDir, href);
                candidates.push(candidate);
                attemptedPaths.push(candidate);
            }

            // Second: Check in all workspace folders
            if (workspaceFolders) {
                for (const folder of workspaceFolders) {
                    const candidate = path.resolve(folder.uri.fsPath, href);
                    candidates.push(candidate);
                    attemptedPaths.push(candidate);
                }
            }
        }

        // Test each candidate
        for (const candidatePath of candidates) {
            try {
                if (fs.existsSync(candidatePath)) {
                    return { 
                        resolvedPath: candidatePath, 
                        exists: true, 
                        isAbsolute: false,
                        attemptedPaths 
                    };
                }
            } catch (error) {
                continue;
            }
        }

        // No file found
        return candidates.length > 0 
            ? { 
                resolvedPath: candidates[0], 
                exists: false, 
                isAbsolute: false,
                attemptedPaths 
            }
            : null;
    }

    /**
     * Resolve an image path to a webview URI for display
     * This does NOT modify content, just returns the display URI
     */
    public async resolveImageForDisplay(imagePath: string): Promise<string> {
        if (imagePath.startsWith('vscode-webview://') || 
            imagePath.startsWith('data:') ||
            imagePath.startsWith('http://') || 
            imagePath.startsWith('https://')) {
            return imagePath;
        }
        
        const resolution = await this.resolveFilePath(imagePath);
        
        if (resolution && resolution.exists) {
            try {
                const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
                const ext = path.extname(resolution.resolvedPath).toLowerCase();
                
                if (imageExtensions.includes(ext)) {
                    const imageUri = vscode.Uri.file(resolution.resolvedPath);
                    const webviewUri = this._webview.asWebviewUri(imageUri);
                    return webviewUri.toString();
                }
            } catch (error) {
                console.warn('Failed to resolve image for display:', imagePath, error);
                // Log attempted paths for debugging
                if (resolution.attemptedPaths) {
                    console.warn('Attempted paths:', resolution.attemptedPaths);
                }
            }
        } else if (resolution && !resolution.exists) {
            // Log failed image resolution attempts
            console.warn(`Image not found: ${imagePath}`);
            console.warn('Attempted paths:', resolution.attemptedPaths);
        }
        
        return imagePath;
    }

    /**
     * Generate image path mappings for the webview without modifying content
     * Returns a map of original paths to webview URIs
     */
    public async generateImagePathMappings(content: string): Promise<ImagePathMapping> {
        const mappings: ImagePathMapping = {};
        if (!content) return mappings;

        // Only process if we have a document to work with
        if (!this._document) {
            return mappings;
        }

        // Find all image references in the content
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        let match;
        
        while ((match = imageRegex.exec(content)) !== null) {
            const imagePath = match[2];
            
            // Skip if already processed or if it's a special URI
            if (mappings[imagePath] || 
                imagePath.startsWith('vscode-webview://') || 
                imagePath.startsWith('data:') ||
                imagePath.startsWith('http://') || 
                imagePath.startsWith('https://')) {
                continue;
            }
            
            // Resolve the image path to a webview URI
            const webviewUri = await this.resolveImageForDisplay(imagePath);
            if (webviewUri !== imagePath) {
                mappings[imagePath] = webviewUri;
            }
        }
        
        return mappings;
    }
}