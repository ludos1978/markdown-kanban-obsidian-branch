import * as vscode from 'vscode';
import * as path from 'path';

export class FileSearchService {
    async searchForFile(fileName: string, baseDir?: string): Promise<vscode.Uri[]> {
        const nameRoot = path.parse(fileName).name; // filename without extension
        const excludePattern = '**/node_modules/**';

        const results = new Map<string, vscode.Uri>();

        // Helper: add uri if not seen
        const addResult = (uri: vscode.Uri) => {
            const key = uri.fsPath;
            if (!results.has(key)) {
                results.set(key, uri);
            }
        };

        try {
            // Workspace-wide search focusing on basename matches, with or without extension
            const patterns = [`**/${nameRoot}`, `**/${nameRoot}.*`];
            let total = 0;
            for (const pattern of patterns) {
                console.log(`[FileSearchService] Searching for: ${pattern}`);
                const workspaceResults = await vscode.workspace.findFiles(pattern, excludePattern, 100);
                workspaceResults.forEach(addResult);
                total += workspaceResults.length;
            }
            console.log(`[FileSearchService] Workspace found ${total} files (unique: ${results.size})`);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn('[FileSearchService] Workspace search failed:', errorMessage);
        }

        // Consistent behavior: also search from the current document directory when provided
        if (baseDir) {
            try {
                const visited = new Set<string>();
                let foundCount = 0;
                const maxResults = 100;

                const scan = async (dirFsPath: string) => {
                    if (foundCount >= maxResults) return;
                    if (visited.has(dirFsPath)) return;
                    visited.add(dirFsPath);

                    // Skip common large or irrelevant folders
                    const baseName = path.basename(dirFsPath);
                    if (baseName === 'node_modules' || baseName === '.git' || baseName === 'dist' || baseName === 'out') {
                        return;
                    }

                    let entries: [string, vscode.FileType][];
                    try {
                        entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirFsPath));
                    } catch {
                        return;
                    }

                    for (const [name, type] of entries) {
                        if (foundCount >= maxResults) break;
                        const childPath = path.join(dirFsPath, name);
                        if (type === vscode.FileType.Directory) {
                            await scan(childPath);
                        } else if (type === vscode.FileType.File) {
                            const parsed = path.parse(name);
                            if (parsed.name === nameRoot || name === nameRoot) {
                                addResult(vscode.Uri.file(childPath));
                                foundCount++;
                            }
                        }
                    }
                };

                // Start scanning from the provided base directory
                await scan(baseDir);
                console.log(`[FileSearchService] BaseDir scan completed. Total unique results: ${results.size}`);
            } catch (error) {
                console.warn('[FileSearchService] BaseDir scan failed:', error);
            }
        }

        return Array.from(results.values());
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

    /**
     * Open a QuickPick immediately and stream in results as they are found.
     * Provides the same UX in dev and production: preview on hover, Enter to accept.
     */
    async pickReplacementForBrokenLink(originalPath: string, baseDir?: string): Promise<vscode.Uri | undefined> {
        const nameRoot = path.parse(path.basename(originalPath)).name;

        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `File not found: ${originalPath}`;
        quickPick.placeholder = `Searching for "${nameRoot}"… Select a replacement`; 
        quickPick.canSelectMany = false;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        quickPick.items = [];
        quickPick.busy = true;

        const itemsMap = new Map<string, vscode.QuickPickItem>();
        const addUri = (uri: vscode.Uri) => {
            const key = uri.fsPath;
            if (itemsMap.has(key)) return;
            const item: vscode.QuickPickItem = {
                label: path.basename(uri.fsPath),
                description: vscode.workspace.asRelativePath(uri.fsPath),
                detail: uri.fsPath,
            };
            itemsMap.set(key, item);
            // Update items list
            quickPick.items = Array.from(itemsMap.values());
        };

        let previewEditor: vscode.TextEditor | undefined;
        const cleanup = async () => {
            if (!previewEditor) return;
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
                    await vscode.window.tabGroups.close(tabsToClose);
                }
            } catch {}
        };

        const disposables: vscode.Disposable[] = [];
        try {
            // Preview on hover/active change
            disposables.push(quickPick.onDidChangeActive(async (items) => {
                if (items.length > 0 && items[0].detail) {
                    try {
                        const doc = await vscode.workspace.openTextDocument(items[0].detail);
                        previewEditor = await vscode.window.showTextDocument(doc, {
                            preview: true,
                            preserveFocus: true,
                            viewColumn: vscode.ViewColumn.Beside
                        });
                    } catch (error) {
                        console.warn('[FileSearchService] Cannot preview file:', error);
                    }
                }
            }));

            const acceptPromise = new Promise<vscode.Uri | undefined>((resolve) => {
                disposables.push(quickPick.onDidAccept(() => {
                    const selected = quickPick.selectedItems[0];
                    if (selected?.detail) {
                        resolve(vscode.Uri.file(selected.detail));
                    } else {
                        resolve(undefined);
                    }
                    quickPick.hide();
                }));

                disposables.push(quickPick.onDidHide(() => {
                    cleanup();
                    resolve(undefined);
                }));
            });

            // Show UI immediately
            quickPick.show();

            // Start searches in the background and stream results in
            const excludePattern = '**/node_modules/**';
            const patterns = [`**/${nameRoot}`, `**/${nameRoot}.*`];

            const workspaceSearch = (async () => {
                try {
                    const findOps = patterns.map(p => vscode.workspace.findFiles(p, excludePattern, 200));
                    const batches = await Promise.all(findOps);
                    for (const batch of batches) {
                        for (const uri of batch) addUri(uri);
                    }
                } catch (error) {
                    console.warn('[FileSearchService] Workspace search failed:', error);
                }
            })();

            const baseDirScan = (async () => {
                if (!baseDir) return;
                try {
                    const visited = new Set<string>();
                    let foundCount = 0;
                    const maxResults = 200;
                    const scan = async (dirFsPath: string) => {
                        if (foundCount >= maxResults) return;
                        if (visited.has(dirFsPath)) return;
                        visited.add(dirFsPath);
                        const baseName = path.basename(dirFsPath);
                        if (baseName === 'node_modules' || baseName === '.git' || baseName === 'dist' || baseName === 'out') return;
                        let entries: [string, vscode.FileType][];
                        try {
                            entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirFsPath));
                        } catch { return; }
                        for (const [name, type] of entries) {
                            if (foundCount >= maxResults) break;
                            const childPath = path.join(dirFsPath, name);
                            if (type === vscode.FileType.Directory) {
                                await scan(childPath);
                            } else if (type === vscode.FileType.File) {
                                const parsed = path.parse(name);
                                if (parsed.name === nameRoot || name === nameRoot) {
                                    addUri(vscode.Uri.file(childPath));
                                    foundCount++;
                                }
                            }
                        }
                    };
                    await scan(baseDir);
                } catch (error) {
                    console.warn('[FileSearchService] BaseDir scan failed:', error);
                }
            })();

            // When both searches complete, clear busy indicator
            Promise.all([workspaceSearch, baseDirScan]).finally(() => {
                quickPick.busy = false;
                if (itemsMap.size === 0) {
                    quickPick.placeholder = `No matches for "${nameRoot}". Press Esc to cancel.`;
                }
            });

            return await acceptPromise;
        } finally {
            disposables.forEach(d => d.dispose());
        }
    }
}
