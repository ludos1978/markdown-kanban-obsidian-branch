import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';

export function activate(context: vscode.ExtensionContext) {
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

			// Create or show kanban panel
			KanbanWebviewPanel.createOrShow(context.extensionUri, context, document);

			vscode.window.showInformationMessage(`Kanban loaded from: ${document.fileName}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open kanban: ${error}`);
		}
	});

	// Listen for document changes to automatically update kanban
	const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
		// Only update if the kanban panel is showing this document
		if (event.document.languageId === 'markdown' && KanbanWebviewPanel.currentPanel) {
			// Delay update slightly to avoid too frequent refreshes
			setTimeout(() => {
				if (KanbanWebviewPanel.currentPanel) {
					KanbanWebviewPanel.currentPanel.loadMarkdownFile(event.document);
				}
			}, 300);
		}
	});

	// Listen for active editor changes
	const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.languageId === 'markdown') {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
			// If panel is open, automatically load current document (force update for editor switch)
			if (KanbanWebviewPanel.currentPanel) {
				KanbanWebviewPanel.currentPanel.loadMarkdownFile(editor.document, true);
			}
		} else {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);
		}
	});

	// Add to subscriptions list
	context.subscriptions.push(
		openKanbanCommand,
		documentChangeListener,
		activeEditorChangeListener
	);

	// If current active editor is markdown, set context
	if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
		vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
	}
}

export function deactivate() {
	// Clean up context
	vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);
}