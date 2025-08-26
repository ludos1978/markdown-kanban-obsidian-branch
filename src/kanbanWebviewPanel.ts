import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

import { MarkdownKanbanParser, KanbanBoard } from './markdownParser';
import { FileManager, ImagePathMapping } from './fileManager';
import { UndoRedoManager } from './undoRedoManager';
import { BoardOperations } from './boardOperations';
import { LinkHandler } from './linkHandler';
import { MessageHandler } from './messageHandler';

export class KanbanWebviewPanel {
    public static currentPanel: KanbanWebviewPanel | undefined;
    public static readonly viewType = 'markdownKanbanPanel';

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _context: vscode.ExtensionContext;
    private _disposables: vscode.Disposable[] = [];
    
    // Main components
    private _fileManager: FileManager;
    private _undoRedoManager: UndoRedoManager;
    private _boardOperations: BoardOperations;
    private _linkHandler: LinkHandler;
    private _messageHandler: MessageHandler;
    
    // State
    private _board?: KanbanBoard;
    private _isInitialized: boolean = false;
    private _isUpdatingFromPanel: boolean = false;

    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document?: vscode.TextDocument) {
        const column = vscode.window.activeTextEditor?.viewColumn;

        if (KanbanWebviewPanel.currentPanel) {
            KanbanWebviewPanel.currentPanel._panel.reveal(column);
            if (document) {
                KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
            }
            return;
        }

        const workspaceFolders = vscode.workspace.workspaceFolders?.map(folder => folder.uri) || [];
        
        const panel = vscode.window.createWebviewPanel(
            KanbanWebviewPanel.viewType,
            'Markdown Kanban',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                localResourceRoots: [
                    extensionUri,
                    ...workspaceFolders,
                    ...(document ? [vscode.Uri.file(path.dirname(document.uri.fsPath))] : [])
                ],
                retainContextWhenHidden: true,
                enableCommandUris: true
            }
        );

        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);

        if (document) {
            KanbanWebviewPanel.currentPanel.loadMarkdownFile(document);
        }
    }

    public static revive(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        panel.webview.options = {
            enableScripts: true,
            localResourceRoots: [extensionUri],
        };
        KanbanWebviewPanel.currentPanel = new KanbanWebviewPanel(panel, extensionUri, context);
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, context: vscode.ExtensionContext) {
        this._panel = panel;
        this._extensionUri = extensionUri;
        this._context = context;

        // Initialize components
        this._fileManager = new FileManager(this._panel.webview, extensionUri);
        this._undoRedoManager = new UndoRedoManager(this._panel.webview);
        this._boardOperations = new BoardOperations();
        this._linkHandler = new LinkHandler(this._fileManager);
        
        // Initialize message handler with callbacks
        this._messageHandler = new MessageHandler(
            this._fileManager,
            this._undoRedoManager,
            this._boardOperations,
            this._linkHandler,
            {
                onBoardUpdate: this.sendBoardUpdate.bind(this),
                onSaveToMarkdown: this.saveToMarkdown.bind(this),
                onInitializeFile: this.initializeFile.bind(this),
                getCurrentBoard: () => this._board,
                setBoard: (board: KanbanBoard) => {
                    this._board = board;
                }
            }
        );

        this._initialize();
        this._setupEventListeners();
        
        if (this._fileManager.getDocument()) {
            this.loadMarkdownFile(this._fileManager.getDocument()!);
        }
    }

    // Public methods for external access
    public isFileLocked(): boolean {
        return this._fileManager.isFileLocked();
    }

    public toggleFileLock(): void {
        this._fileManager.toggleFileLock();
    }

    public getCurrentDocumentUri(): vscode.Uri | undefined {
        return this._fileManager.getCurrentDocumentUri();
    }

    private _initialize() {
        if (!this._isInitialized) {
            this._panel.webview.html = this._getHtmlForWebview();
            this._isInitialized = true;
        }
    }

    private _setupEventListeners() {
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        this._panel.onDidChangeViewState(
            e => {
                if (e.webviewPanel.visible) {
                    this._ensureBoardAndSendUpdate();
                    this._fileManager.sendFileInfo();
                }
            },
            null,
            this._disposables
        );

        this._panel.webview.onDidReceiveMessage(
            message => this._messageHandler.handleMessage(message),
            null,
            this._disposables
        );
    }

    private async _ensureBoardAndSendUpdate() {
        if (!this._board && this._fileManager.getDocument()) {
            try {
                this._board = MarkdownKanbanParser.parseMarkdown(this._fileManager.getDocument()!.getText());
                this._boardOperations.setOriginalTaskOrder(this._board);
            } catch (error) {
                this._board = { 
                    valid: false, 
                    title: 'Error Loading Board', 
                    columns: [], 
                    yamlHeader: null, 
                    kanbanFooter: null 
                };
            }
        }
        
        await this.sendBoardUpdate();
    }

    public async loadMarkdownFile(document: vscode.TextDocument) {
        if (this._isUpdatingFromPanel) {
            return;
        }
        
        const documentChanged = this._fileManager.getDocument()?.uri.toString() !== document.uri.toString();
        this._fileManager.setDocument(document);
        
        if (documentChanged) {
            this._panel.webview.html = this._getHtmlForWebview();
        }
        
        try {
            this._board = MarkdownKanbanParser.parseMarkdown(document.getText());
            this._boardOperations.setOriginalTaskOrder(this._board);
            this._undoRedoManager.clear();
        } catch (error) {
            vscode.window.showErrorMessage(`Kanban parsing error: ${error instanceof Error ? error.message : String(error)}`);
            this._board = { 
                valid: false, 
                title: 'Error Loading Board', 
                columns: [], 
                yamlHeader: null, 
                kanbanFooter: null 
            };
        }
        
        await this.sendBoardUpdate();
        this._fileManager.sendFileInfo();
    }

    private async sendBoardUpdate() {
        if (!this._panel.webview) return;

        let board = this._board || { 
            valid: false, 
            title: 'Please open a Markdown Kanban file', 
            columns: [], 
            yamlHeader: null, 
            kanbanFooter: null 
        };
        
        // Generate image path mappings without modifying the board content
        const imageMappings = await this._generateImageMappings(board);
        
        setTimeout(() => {
            this._panel.webview.postMessage({
                type: 'updateBoard',
                board: board, // Send original board without modifications
                imageMappings: imageMappings
            });
        }, 10);
    }

    private async _generateImageMappings(board: KanbanBoard): Promise<ImagePathMapping> {
        const mappings: ImagePathMapping = {};
        
        if (!board.valid || !this._fileManager.getDocument()) {
            return mappings;
        }

        // Collect all content that might contain images
        for (const column of board.columns) {
            if (column.title) {
                const titleMappings = await this._fileManager.generateImagePathMappings(column.title);
                Object.assign(mappings, titleMappings);
            }
            
            for (const task of column.tasks) {
                if (task.title) {
                    const titleMappings = await this._fileManager.generateImagePathMappings(task.title);
                    Object.assign(mappings, titleMappings);
                }
                if (task.description) {
                    const descMappings = await this._fileManager.generateImagePathMappings(task.description);
                    Object.assign(mappings, descMappings);
                }
            }
        }

        return mappings;
    }

    private async saveToMarkdown() {
        const document = this._fileManager.getDocument();
        if (!document || !this._board || !this._board.valid) return;

        this._isUpdatingFromPanel = true;
        
        const markdown = MarkdownKanbanParser.generateMarkdown(this._board);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            markdown
        );
        await vscode.workspace.applyEdit(edit);
        await document.save();
        
        setTimeout(() => {
            this._isUpdatingFromPanel = false;
        }, 1000);
    }

    private async initializeFile() {
        const document = this._fileManager.getDocument();
        if (!document) {
            vscode.window.showErrorMessage('No document loaded');
            return;
        }

        this._isUpdatingFromPanel = true;

        const kanbanHeader = "---\n\nkanban-plugin: board\n\n---\n\n";
        const currentContent = document.getText();
        const newContent = kanbanHeader + currentContent;

        const edit = new vscode.WorkspaceEdit();
        edit.replace(
            document.uri,
            new vscode.Range(0, 0, document.lineCount, 0),
            newContent
        );
        
        try {
            await vscode.workspace.applyEdit(edit);
            await document.save();
            
            setTimeout(() => {
                this.loadMarkdownFile(document);
                this._isUpdatingFromPanel = false;
            }, 100);
            
            vscode.window.showInformationMessage('Kanban board initialized successfully');
        } catch (error) {
            this._isUpdatingFromPanel = false;
            vscode.window.showErrorMessage(`Failed to initialize file: ${error}`);
        }
    }

    private _getHtmlForWebview() {
        const filePath = vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html', 'webview.html'));
        let html = fs.readFileSync(filePath.fsPath, 'utf8');

        const nonce = this._getNonce();
        const cspSource = this._panel.webview.cspSource;
        
        const cspMeta = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} https: data: blob:; script-src ${cspSource} 'unsafe-inline' https://cdnjs.cloudflare.com; style-src ${cspSource} 'unsafe-inline'; font-src ${cspSource};">`;
        
        if (!html.includes('Content-Security-Policy')) {
            html = html.replace('<head>', `<head>\n    ${cspMeta}`);
        }
        
        const localResourceRoots = [this._extensionUri];
        if (this._fileManager.getDocument()) {
            const document = this._fileManager.getDocument()!;
            const documentDir = vscode.Uri.file(path.dirname(document.uri.fsPath));
            const baseHref = this._panel.webview.asWebviewUri(documentDir).toString() + '/';
            html = html.replace(/<head>/, `<head><base href="${baseHref}">`);

            try {
                const markdownItPath = vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js');
                if (fs.existsSync(markdownItPath.fsPath)) {
                    const markdownItUri = this._panel.webview.asWebviewUri(markdownItPath);
                    html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/markdown-it\/13\.0\.2\/markdown-it\.min\.js"><\/script>/, `<script src="${markdownItUri}"></script>`);
                }
                // If local file doesn't exist, keep the CDN version in HTML
            } catch (error) {
                // If there's any error, keep the CDN version in HTML
                console.warn('Failed to load local markdown-it, using CDN version:', error);
            }

            // const markdownItUri = this._panel.webview.asWebviewUri(
            //     vscode.Uri.joinPath(this._extensionUri, 'node_modules', 'markdown-it', 'dist', 'markdown-it.min.js')
            // );
            // html = html.replace(/<script src="https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/markdown-it\/13\.0\.2\/markdown-it\.min\.js"><\/script>/, `<script src="${markdownItUri}"></script>`);

            localResourceRoots.push(vscode.Uri.file(path.dirname(document.uri.fsPath)));
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
            if (workspaceFolder) {
                localResourceRoots.push(workspaceFolder.uri);
            }
        }
        
        this._panel.webview.options = {
            enableScripts: true,
            localResourceRoots: localResourceRoots
        };
        
        const webviewDir = this._panel.webview.asWebviewUri(
            vscode.Uri.file(path.join(this._context.extensionPath, 'src', 'html'))
        );
        
        html = html.replace(/href="webview\.css"/, `href="${webviewDir}/webview.css"`);
        
        // Replace all JavaScript file references
        const jsFiles = [
            'markdownRenderer.js',
            'taskEditor.js', 
            'boardRenderer.js',
            'dragDrop.js',
            'menuOperations.js',
            'webview.js'
        ];
        
        jsFiles.forEach(jsFile => {
            html = html.replace(
                new RegExp(`src="${jsFile}"`, 'g'), 
                `src="${webviewDir}/${jsFile}"`
            );
        });

        return html;
    }

    private _getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    public dispose() {
        KanbanWebviewPanel.currentPanel = undefined;
        this._panel.dispose();

        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            disposable?.dispose();
        }
    }
}