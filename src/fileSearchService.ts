import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export class FileSearchService {
    async searchForFile(fileName: string): Promise<vscode.Uri[]> {
        const searchPattern = `**/${fileName}`;
        const excludePattern = '**/node_modules/**';
        
        try {
            const files = await vscode.workspace.findFiles(searchPattern, excludePattern, 100);
            return files;
        } catch (error) {
            console.error('Error searching for files:', error);
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

        // Declare previewEditor outside the promise
        let previewEditor: vscode.TextEditor | undefined;
        
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
                    // Silently fail if can't preview (e.g., binary file)
                }
            }
        });

        return new Promise((resolve) => {
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
                // Close preview if it was opened
                if (previewEditor) {
                    try {
                        const tabToClose = vscode.window.tabGroups.activeTabGroup.tabs.find(
                            tab => (tab.input as any)?.uri?.toString() === previewEditor!.document.uri.toString()
                        );
                        if (tabToClose && tabToClose.isPreview) {
                            vscode.window.tabGroups.close(tabToClose);
                        }
                    } catch (error) {
                        // Silently fail if we can't close the preview
                    }
                }
                quickPick.dispose();
                resolve(undefined);
            });

            quickPick.show();
        });
    }
}