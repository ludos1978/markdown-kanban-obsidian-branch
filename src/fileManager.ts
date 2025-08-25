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

export class FileManager {
    private _document?: vscode.TextDocument;
    private _isFileLocked: boolean = false;
    private _webview: vscode.Webview;
    private _extensionUri: vscode.Uri;

    constructor(webview: vscode.Webview, extensionUri: vscode.Uri) {
        this._webview = webview;
        this._extensionUri = extensionUri;
    }

    public setDocument(document: vscode.TextDocument) {
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

    private getRelativePath(filePath: string): string {
        if (!this._document) {
            return filePath;
        }
        
        const documentDir = path.dirname(this._document.uri.fsPath);
        const relativePath = path.relative(documentDir, filePath);
        
        // Convert backslashes to forward slashes for markdown compatibility
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
     * Enhanced file path resolution with multiple fallback strategies
     */
    public async resolveFilePath(href: string): Promise<{ resolvedPath: string; exists: boolean; isAbsolute: boolean } | null> {
        const isAbsolute = path.isAbsolute(href) || 
                        href.match(/^[a-zA-Z]:/) || 
                        href.startsWith('/') ||     
                        href.startsWith('\\');     

        if (isAbsolute) {
            try {
                const exists = fs.existsSync(href);
                return { resolvedPath: href, exists, isAbsolute: true };
            } catch (error) {
                return { resolvedPath: href, exists: false, isAbsolute: true };
            }
        }

        const candidates: string[] = [];

        if (this._document) {
            const currentDir = path.dirname(this._document.uri.fsPath);
            candidates.push(path.resolve(currentDir, href));
        }

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders) {
            for (const folder of workspaceFolders) {
                candidates.push(path.resolve(folder.uri.fsPath, href));
            }
        }

        for (const candidatePath of candidates) {
            try {
                if (fs.existsSync(candidatePath)) {
                    return { resolvedPath: candidatePath, exists: true, isAbsolute: false };
                }
            } catch (error) {
                continue;
            }
        }

        return candidates.length > 0 
            ? { resolvedPath: candidates[0], exists: false, isAbsolute: false }
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
            }
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