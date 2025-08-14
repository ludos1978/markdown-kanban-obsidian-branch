// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	let fileListenerEnabled = true;
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Markdown Kanban extension is now active!');

	// Register webview panel serializer (for restoring panel state)
	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(KanbanWebviewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				KanbanWebviewPanel.revive(webviewPanel, context.extensionUri, context);
			}
		});
	}

	// Register command to open kanban panel
	const openKanbanCommand = vscode.commands.registerCommand('markdown-kanban.openKanban', async (uri?: vscode.Uri) => {
		let targetUri = uri;

		// If no URI provided, try to get from active editor
		if (!targetUri && vscode.window.activeTextEditor) {
			targetUri = vscode.window.activeTextEditor.document.uri;
		}

		// If still no URI, let user select file
		if (!targetUri) {
			const fileUris = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				canSelectFolders: false,
				canSelectMany: false,
				filters: {
					'Markdown files': ['md']
				}
			});

			if (fileUris && fileUris.length > 0) {
				targetUri = fileUris[0];
			} else {
				return;
			}
		}

		// Check if file is markdown
		if (!targetUri.fsPath.endsWith('.md')) {
			vscode.window.showErrorMessage('Please select a markdown file.');
			return;
		}

		try {
			// Open document
			const document = await vscode.workspace.openTextDocument(targetUri);

			// Create or show kanban panel in center area
			KanbanWebviewPanel.createOrShow(context.extensionUri, context, document);

			vscode.window.showInformationMessage(`Kanban loaded from: ${document.fileName}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open kanban: ${error}`);
		}
	});

	const disableFileListenerCommand = vscode.commands.registerCommand('markdown-kanban.disableFileListener', async () => {
		fileListenerEnabled = !fileListenerEnabled;
	});

	// Listen for document changes to automatically update kanban (real-time sync)
	const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document.languageId === 'markdown' && fileListenerEnabled) {
			// Delay update to avoid frequent refresh
			setTimeout(() => {
				// Update kanban panel
				if (KanbanWebviewPanel.currentPanel) {
					KanbanWebviewPanel.currentPanel.loadMarkdownFile(event.document);
				}
			}, 500);
		}
	});

	// Listen for active editor changes
	const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.languageId === 'markdown' && fileListenerEnabled) {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
			// If panel is open, automatically load current document
			if (KanbanWebviewPanel.currentPanel) {
				KanbanWebviewPanel.currentPanel.loadMarkdownFile(editor.document);
			}
		} else {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);
		}
	});

	// Add to subscriptions list
	context.subscriptions.push(
		openKanbanCommand,
		disableFileListenerCommand,
		documentChangeListener,
		activeEditorChangeListener,
	);

	// If current active editor is markdown, auto-activate kanban
	if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
		vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
	}
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Clean up context
	vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);
}