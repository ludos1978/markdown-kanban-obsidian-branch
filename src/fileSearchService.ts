import * as vscode from 'vscode';
import * as path from 'path';

export class FileSearchService {
    async searchForFile(fileName: string): Promise<vscode.Uri[]> {
        const searchPattern = `**/${fileName}`;
        const excludePattern = '**/node_modules/**';
        
        try {
            // Add more detailed logging
            console.log(`[FileSearchService] Searching for: ${searchPattern}`);
            const files = await vscode.workspace.findFiles(searchPattern, excludePattern, 100);
            console.log(`[FileSearchService] Found ${files.length} files`);
            return files;
        } catch (error) {
            // More detailed error logging
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[FileSearchService] Error searching for files:', errorMessage);
            // Show error to user in production
            vscode.window.showErrorMessage(`Failed to search for replacement files: ${errorMessage}`);
            return [];
        }
    }

    async showFileReplacementPicker(
        originalPath: string, 
        searchResults: vscode.Uri[]
    ): Promise<vscode.Uri | undefined> {
        const fileName = path.basename(originalPath);
        
        const items: vscode.QuickPickItem[] = searchResults.map(uri => ({
            label: path.basename(uri.fsPath),
            description: vscode.workspace.asRelativePath(uri.fsPath),
            detail: uri.fsPath
        }));

        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `File not found: ${originalPath}`;
        quickPick.placeholder = `Select replacement for "${fileName}"`;
        quickPick.items = items;
        quickPick.canSelectMany = false;

        return new Promise((resolve) => {
            // Track preview editor in closure scope
            let previewEditor: vscode.TextEditor | undefined;
            
            const cleanup = async () => {
                // Close preview if it was opened
                if (!previewEditor) {
                    return;
                }
                try {
                    const targetUri = previewEditor.document.uri.toString();
                    const tabsToClose: vscode.Tab[] = [];
                    for (const group of vscode.window.tabGroups.all) {
                        for (const tab of group.tabs) {
                            const tabInput = tab.input as any;
                            const tabUri = tabInput?.uri?.toString();
                            if (tabUri === targetUri && tab.isPreview) {
                                tabsToClose.push(tab);
                            }
                        }
                    }
                    if (tabsToClose.length > 0) {
                        // VS Code returns a Thenable (no .catch), rely on try/catch
                        await vscode.window.tabGroups.close(tabsToClose);
                    }
                } catch {
                    // Silently fail cleanup
                }
            };
            
            quickPick.onDidChangeActive(async (items) => {
                if (items.length > 0 && items[0].detail) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(items[0].detail);
                        previewEditor = await vscode.window.showTextDocument(doc, {
                            preview: true,
                            preserveFocus: true,
                            viewColumn: vscode.ViewColumn.Beside
                        });
                    } catch (error) {
                        // Can't preview, but don't fail the whole operation
                        console.warn('[FileSearchService] Cannot preview file:', error);
                    }
                }
            });
            
            quickPick.onDidAccept(() => {
                const selected = quickPick.selectedItems[0];
                if (selected?.detail) {
                    resolve(vscode.Uri.file(selected.detail));
                } else {
                    resolve(undefined);
                }
                quickPick.hide();
            });

            quickPick.onDidHide(() => {
                // Fire and forget cleanup
                cleanup();
                quickPick.dispose();
                resolve(undefined);
            });

            quickPick.show();
        });
    }
}
