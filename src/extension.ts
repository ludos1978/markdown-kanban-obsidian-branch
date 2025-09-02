import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';

export function activate(context: vscode.ExtensionContext) {
	let fileListenerEnabled = true;
	
	// Function to get file listener status
	const getFileListenerStatus = () => {
		return fileListenerEnabled;
	};
	
	// Function to toggle file listener
	const setFileListenerStatus = (enabled: boolean) => {
		fileListenerEnabled = enabled;
		const status = fileListenerEnabled ? 'enabled' : 'disabled';
		vscode.window.showInformationMessage(`Kanban auto-switching ${status}`);
	};
	
	// Expose these functions to the KanbanWebviewPanel
	(globalThis as any).kanbanFileListener = {
		getStatus: getFileListenerStatus,
		setStatus: setFileListenerStatus
	};

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

			// ENHANCED: Log workspace information for debugging
			const workspaceFolders = vscode.workspace.workspaceFolders;
			console.log('Opening Kanban with workspace folders:', 
				workspaceFolders?.map(f => `${f.name}: ${f.uri.fsPath}`) || 'None'
			);
			
			const documentWorkspace = vscode.workspace.getWorkspaceFolder(targetUri);
			console.log('Document workspace folder:', 
				documentWorkspace ? `${documentWorkspace.name}: ${documentWorkspace.uri.fsPath}` : 'None'
			);

			// Create or show kanban panel in center area
			KanbanWebviewPanel.createOrShow(context.extensionUri, context, document);

			vscode.window.showInformationMessage(`Kanban loaded from: ${document.fileName}`);
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open kanban: ${error}`);
		}
	});

	// Optional: Add debug command to troubleshoot webview permissions
	const debugPermissionsCommand = vscode.commands.registerCommand('markdown-kanban.debugPermissions', () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && activeEditor.document.languageId === 'markdown') {
			const panel = KanbanWebviewPanel.getPanelForDocument(activeEditor.document.uri.toString());
			if (panel) {
				(panel as any).debugWebviewPermissions();
				vscode.window.showInformationMessage('Check the console for debug output');
			} else {
				vscode.window.showWarningMessage('No kanban panel is open for this document');
			}
		} else {
			vscode.window.showWarningMessage('No active markdown document');
		}
	});

	const disableFileListenerCommand = vscode.commands.registerCommand('markdown-kanban.disableFileListener', async () => {
		fileListenerEnabled = !fileListenerEnabled;
		const status = fileListenerEnabled ? 'enabled' : 'disabled';
		vscode.window.showInformationMessage(`Kanban auto-switching ${status}`);
	});

	// Command to toggle file opening behavior
	const toggleFileOpeningCommand = vscode.commands.registerCommand('markdown-kanban.toggleFileOpening', async () => {
		const config = vscode.workspace.getConfiguration('markdownKanban');
		const currentSetting = config.get<boolean>('openLinksInNewTab', false);
		
		await config.update('openLinksInNewTab', !currentSetting, vscode.ConfigurationTarget.Global);
		
		const newBehavior = !currentSetting ? 'new tabs' : 'current tab';
		vscode.window.showInformationMessage(`Kanban file links will now open in ${newBehavior}`);
	});

	// Command to toggle file lock
	const toggleFileLockCommand = vscode.commands.registerCommand('markdown-kanban.toggleFileLock', async () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor && activeEditor.document.languageId === 'markdown') {
			const panel = KanbanWebviewPanel.getPanelForDocument(activeEditor.document.uri.toString());
			if (panel) {
				panel.toggleFileLock();
			} else {
				vscode.window.showWarningMessage('No kanban panel is open for this document.');
			}
		} else {
			// Try to find any active panel (for backward compatibility)
			const panels = KanbanWebviewPanel.getAllPanels();
			if (panels.length === 1) {
				panels[0].toggleFileLock();
			} else if (panels.length > 1) {
				vscode.window.showWarningMessage('Multiple kanban panels open. Please focus on the markdown document you want to lock/unlock.');
			} else {
				vscode.window.showWarningMessage('No kanban panel is currently open.');
			}
		}
	});

	// Command to open file from kanban panel (for title bar button)
	const openKanbanFromPanelCommand = vscode.commands.registerCommand('markdown-kanban.openKanbanFromPanel', async () => {
		const panels = KanbanWebviewPanel.getAllPanels();
		if (panels.length === 0) {
			vscode.window.showWarningMessage('No kanban panel is currently open.');
			return;
		}

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
				// This will create a new panel or reuse existing one for this document
				KanbanWebviewPanel.createOrShow(context.extensionUri, context, document);
				vscode.window.showInformationMessage(`Kanban opened for: ${document.fileName}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to open file: ${error}`);
			}
		}
	});

	// Command to manually switch file
	const switchFileCommand = vscode.commands.registerCommand('markdown-kanban.switchFile', async () => {
		const panels = KanbanWebviewPanel.getAllPanels();
		if (panels.length === 0) {
			vscode.window.showWarningMessage('No kanban panel is currently open.');
			return;
		}

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
				// This will create a new panel or reuse existing one
				KanbanWebviewPanel.createOrShow(context.extensionUri, context, document);
				vscode.window.showInformationMessage(`Kanban opened for: ${document.fileName}`);
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to open file: ${error}`);
			}
		}
	});

	// Listen for document changes to automatically update kanban (real-time sync)
	const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
		if (event.document.languageId === 'markdown' && fileListenerEnabled) {
			// Check if a Kanban panel exists for this document
			const panel = KanbanWebviewPanel.getPanelForDocument(event.document.uri.toString());
			if (panel) {
				// Check if the change is from the Kanban panel itself
				const isUpdatingFromPanel = (panel as any)._isUpdatingFromPanel;
				if (isUpdatingFromPanel) {
					console.log('Skipping auto-reload - change is from Kanban panel');
					return;
				}
				
				// Delay update to avoid frequent refresh
				setTimeout(() => {
					// Double-check the panel isn't updating now
					const isStillUpdating = (panel as any)?._isUpdatingFromPanel;
					if (!isStillUpdating) {
						panel.loadMarkdownFile(event.document);
					}
				}, 500);
			}
		}
	});

	// Listen for active editor changes
	const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.languageId === 'markdown' && fileListenerEnabled) {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
			// If panel exists for this document and not locked, reload
			const panel = KanbanWebviewPanel.getPanelForDocument(editor.document.uri.toString());
			if (panel && !panel.isFileLocked()) {
				panel.loadMarkdownFile(editor.document);
			}
		} else {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);
		}
	});

	// Add to subscriptions
	context.subscriptions.push(
		openKanbanCommand,
		disableFileListenerCommand,
		toggleFileOpeningCommand,
		toggleFileLockCommand,
		openKanbanFromPanelCommand,
		switchFileCommand,
		debugPermissionsCommand,  // Add this line
		documentChangeListener,
		activeEditorChangeListener,
	);

	// If current active editor is markdown, auto-activate kanban
	if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
		vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
	}
}

export function deactivate() {
	// Clean up context
	vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);
}