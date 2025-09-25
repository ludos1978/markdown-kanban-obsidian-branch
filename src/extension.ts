import * as vscode from 'vscode';
import { KanbanWebviewPanel } from './kanbanWebviewPanel';
import { ExternalFileWatcher } from './externalFileWatcher';
import { configService } from './configurationService';

export function activate(context: vscode.ExtensionContext) {
	let fileListenerEnabled = true;

	// Initialize the centralized file watcher
	const fileWatcher = ExternalFileWatcher.getInstance();

	// Function to get file listener status
	const getFileListenerStatus = () => {
		return fileListenerEnabled;
	};

	// Function to toggle file listener
	const setFileListenerStatus = (enabled: boolean) => {
		fileListenerEnabled = enabled;
		fileWatcher.setFileListenerEnabled(enabled);
		const status = fileListenerEnabled ? 'enabled' : 'disabled';
		vscode.window.showInformationMessage(`Kanban auto-switching ${status}`);
	};

	// Expose these functions to the KanbanWebviewPanel
	(globalThis as any).kanbanFileListener = {
		getStatus: getFileListenerStatus,
		setStatus: setFileListenerStatus
	};

	// Listen for file change events from the centralized watcher
	const fileChangeListener = fileWatcher.onFileChanged(async (event) => {
		for (const panel of event.panels) {
			if (event.fileType === 'main') {
				// Handle main file changes
				const document = vscode.workspace.textDocuments.find(doc =>
					doc.uri.toString() === vscode.Uri.file(event.path).toString()
				);
				if (document) {
					panel.loadMarkdownFile(document, false);
				}
			} else if (event.fileType === 'include') {
				// Include file changes are now handled directly by each panel's file watcher subscription
				// No need to call panel.handleIncludeFileChange() - this would cause duplicate dialogs
			}
		}
	});

	context.subscriptions.push(fileChangeListener);

	// Register webview panel serializer (for restoring panel state)
	if (vscode.window.registerWebviewPanelSerializer) {
		vscode.window.registerWebviewPanelSerializer(KanbanWebviewPanel.viewType, {
			async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
				console.log('[DEBUG] Deserializing webview panel with state:', state);
				KanbanWebviewPanel.revive(webviewPanel, context.extensionUri, context, state);
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

		// If still no URI but we have an active editor, prioritize the active editor's document
		if (!targetUri && vscode.window.activeTextEditor?.document) {
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
		const currentSetting = configService.getConfig('openLinksInNewTab');

		await configService.updateConfig('openLinksInNewTab', !currentSetting, vscode.ConfigurationTarget.Global);
		
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

	const insertSnippetCommand = vscode.commands.registerCommand('markdown-kanban.insertSnippet', async () => {
		const panels = KanbanWebviewPanel.getAllPanels();
		if (panels.length === 0) {
			vscode.window.showWarningMessage('No kanban panel is currently open.');
			return;
		}

		// Get the active panel (assuming first panel for now, could be improved)
		const activePanel = panels[0];

		// Trigger snippet insertion in the webview
		activePanel.triggerSnippetInsertion();
	});

	// Note: External file change detection is now handled by ExternalFileWatcher
	// Document save events are also handled through the file watcher system

	// Listen for active editor changes
	const activeEditorChangeListener = vscode.window.onDidChangeActiveTextEditor((editor) => {
		if (editor && editor.document.languageId === 'markdown' && fileListenerEnabled) {
			vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
			// If panel exists for this document and not locked, reload
			const panel = KanbanWebviewPanel.getPanelForDocument(editor.document.uri.toString());
			if (panel && !panel.isFileLocked()) {
				panel.loadMarkdownFile(editor.document, true); // isFromEditorFocus = true
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
		insertSnippetCommand,
		debugPermissionsCommand,
		activeEditorChangeListener,
	);

	// React to configuration changes (e.g., tag colors, whitespace, etc.)
	const configChangeListener = vscode.workspace.onDidChangeConfiguration(async (e) => {
		if (e.affectsConfiguration('markdown-kanban')) {
			// Only trigger full refresh for configuration changes that affect board rendering
			// UI preference changes (fontSize, columnWidth, etc.) are handled by the webview itself
			const needsFullRefresh = 
				e.affectsConfiguration('markdown-kanban.tagColors') ||
				e.affectsConfiguration('markdown-kanban.enableBackups') ||
				e.affectsConfiguration('markdown-kanban.backupInterval') ||
				e.affectsConfiguration('markdown-kanban.backupLocation') ||
				e.affectsConfiguration('markdown-kanban.maxBackupsPerFile') ||
				e.affectsConfiguration('markdown-kanban.openLinksInNewTab') ||
				e.affectsConfiguration('markdown-kanban.showRowTags') ||
				e.affectsConfiguration('markdown-kanban.maxRowHeight');
			
			if (needsFullRefresh) {
				const panels = KanbanWebviewPanel.getAllPanels();
				for (const panel of panels) {
					const uri = panel.getCurrentDocumentUri?.();
					if (uri) {
						try {
							const doc = await vscode.workspace.openTextDocument(uri);
							await panel.loadMarkdownFile(doc);
						} catch {
							// best-effort refresh; ignore failures
						}
					}
				}
			}
		}
	});

	context.subscriptions.push(configChangeListener);

	// Clean up file watcher on disposal
	context.subscriptions.push(fileWatcher);

	// If current active editor is markdown, auto-activate kanban
	if (vscode.window.activeTextEditor && vscode.window.activeTextEditor.document.languageId === 'markdown') {
		vscode.commands.executeCommand('setContext', 'markdownKanbanActive', true);
	}
}

export function deactivate() {
	// Clean up context
	vscode.commands.executeCommand('setContext', 'markdownKanbanActive', false);

	// Note: VS Code will automatically dispose all webview panels and their disposables
	// when the extension deactivates, which will trigger the unsaved changes handling
	// in each panel's _handlePanelClose() method via the onDidDispose event.
}
