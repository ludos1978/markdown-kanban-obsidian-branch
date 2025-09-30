import * as vscode from 'vscode';
import * as path from 'path';

export class FileSearchService {
    private _extensionUri?: vscode.Uri;

    constructor(extensionUri?: vscode.Uri) {
        this._extensionUri = extensionUri;
    }
    async searchForFile(fileName: string, baseDir?: string): Promise<vscode.Uri[]> {
        // Try URL decoding if path contains % (only if it's valid decoding)
        let decodedFileName = fileName;
        if (fileName.includes('%')) {
            try {
                const decoded = decodeURIComponent(fileName);
                // Only use decoded path if it's actually different (valid decoding occurred)
                if (decoded !== fileName) {
                    decodedFileName = decoded;
                }
            } catch {
                // If decoding fails, use original filename
                decodedFileName = fileName;
            }
        }

        const nameRoot = path.parse(decodedFileName).name; // filename without extension
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
                const workspaceResults = await vscode.workspace.findFiles(pattern, excludePattern, 100);
                workspaceResults.forEach(addResult);
                total += workspaceResults.length;
            }
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
                    if (foundCount >= maxResults) {return;}
                    if (visited.has(dirFsPath)) {return;}
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
                        if (foundCount >= maxResults) {break;}
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
        // Try URL decoding if path contains % (only if it's valid decoding)
        let decodedPath = originalPath;
        if (originalPath.includes('%')) {
            try {
                const decoded = decodeURIComponent(originalPath);
                // Only use decoded path if it's actually different (valid decoding occurred)
                if (decoded !== originalPath) {
                    decodedPath = decoded;
                }
            } catch {
                // If decoding fails, use original path
                decodedPath = originalPath;
            }
        }

        const nameRoot = path.parse(path.basename(decodedPath)).name;

        const quickPick = vscode.window.createQuickPick();
        quickPick.title = `File not found: ${originalPath}`;
        quickPick.placeholder = `Searching for "${nameRoot}"… Select a replacement`;
        quickPick.canSelectMany = false;
        quickPick.matchOnDescription = true;
        quickPick.matchOnDetail = true;
        quickPick.items = [];
        quickPick.busy = true;
        quickPick.value = nameRoot;

        // Toggle state and buttons (similar to board search)
        let caseSensitive = false;
        let wholeWord = false;
        let useRegex = false;

        const makeCaseBtn = (): vscode.QuickInputButton => {
            const icon = this._extensionUri
                ? (caseSensitive
                    ? vscode.Uri.joinPath(this._extensionUri, 'imgs', 'case-on.svg')
                    : vscode.Uri.joinPath(this._extensionUri, 'imgs', 'case-off.svg'))
                : new vscode.ThemeIcon('case-sensitive');
            return {
                iconPath: icon as any,
                tooltip: `Match Case: ${caseSensitive ? 'On' : 'Off'} (click to toggle)`
            };
        };
        const makeWordBtn = (): vscode.QuickInputButton => {
            const icon = this._extensionUri
                ? (wholeWord
                    ? vscode.Uri.joinPath(this._extensionUri, 'imgs', 'word-on.svg')
                    : vscode.Uri.joinPath(this._extensionUri, 'imgs', 'word-off.svg'))
                : new vscode.ThemeIcon('whole-word');
            return {
                iconPath: icon as any,
                tooltip: `Whole Word: ${wholeWord ? 'On' : 'Off'} (click to toggle)`
            };
        };
        const makeRegexBtn = (): vscode.QuickInputButton => {
            const icon = this._extensionUri
                ? (useRegex
                    ? vscode.Uri.joinPath(this._extensionUri, 'imgs', 'regex-on.svg')
                    : vscode.Uri.joinPath(this._extensionUri, 'imgs', 'regex-off.svg'))
                : new vscode.ThemeIcon('regex');
            return {
                iconPath: icon as any,
                tooltip: `Regular Expression: ${useRegex ? 'On' : 'Off'} (click to toggle)`
            };
        };

        let caseBtn = makeCaseBtn();
        let wordBtn = makeWordBtn();
        let regexBtn = makeRegexBtn();

        const updateButtons = () => {
            caseBtn = makeCaseBtn();
            wordBtn = makeWordBtn();
            regexBtn = makeRegexBtn();
            quickPick.buttons = [caseBtn, wordBtn, regexBtn];
        };
        updateButtons();

        // Keep a set of items for current search term
        const itemsMap = new Map<string, vscode.QuickPickItem>();
        const toItem = (uri: vscode.Uri): vscode.QuickPickItem => ({
            label: path.basename(uri.fsPath),
            description: vscode.workspace.asRelativePath(uri.fsPath),
            detail: uri.fsPath,
        });
        const refreshItems = () => {
            quickPick.items = Array.from(itemsMap.values());
        };

        let previewEditor: vscode.TextEditor | undefined;
        const cleanup = async () => {
            if (!previewEditor) {return;}
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
                    if (!selected) {return;}
                    if (selected.detail) {
                        resolve(vscode.Uri.file(selected.detail));
                        quickPick.hide();
                    }
                }));

                disposables.push(quickPick.onDidHide(() => {
                    cleanup();
                    resolve(undefined);
                }));
            });

            // Show UI immediately
            quickPick.show();

            // Search pipeline with cancelation and debounce
            let searchSeq = 0;
            let debounceTimer: NodeJS.Timeout | undefined;

            const startSearch = (term: string) => {
                searchSeq += 1;
                const seq = searchSeq;
                const rawTerm = term.trim();
                const normalized = caseSensitive ? rawTerm : rawTerm.toLowerCase();
                itemsMap.clear();
                refreshItems();
                quickPick.busy = true;
                quickPick.placeholder = rawTerm
                    ? `Searching for "${rawTerm}"…`
                    : 'Type to search by filename';

                const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const makeRegex = (pattern: string): RegExp | undefined => {
                    try {
                        return new RegExp(pattern, caseSensitive ? '' : 'i');
                    } catch {
                        return undefined;
                    }
                };
                const nameMatches = (uri: vscode.Uri) => {
                    if (!rawTerm) {return true;}
                    const base = path.basename(uri.fsPath);
                    const parsed = path.parse(base);
                    const baseNoExt = parsed.name;
                    const candidateA = caseSensitive ? baseNoExt : baseNoExt.toLowerCase();
                    const candidateB = caseSensitive ? base : base.toLowerCase();

                    if (useRegex) {
                        const rx = makeRegex(rawTerm);
                        if (!rx) {return false;}
                        return rx.test(baseNoExt) || rx.test(base);
                    }
                    if (wholeWord) {
                        const rx = makeRegex(`\\b${escapeRegExp(rawTerm)}\\b`);
                        if (!rx) {return false;}
                        return rx.test(baseNoExt) || rx.test(base);
                    }
                    return candidateA.includes(normalized) || candidateB.includes(normalized);
                };

                const addIfActive = (uri: vscode.Uri) => {
                    if (seq !== searchSeq) {return;} // stale
                    if (!nameMatches(uri)) {return;}
                    const key = uri.fsPath;
                    if (!itemsMap.has(key)) {
                        itemsMap.set(key, toItem(uri));
                        refreshItems();
                    }
                };

                // Workspace search (two patterns) then post-filter by basename
                const excludePattern = '**/node_modules/**';
                const globTerm = rawTerm && !useRegex ? rawTerm : nameRoot;
                const patterns = (() => {
                    if (useRegex) {
                        // With regex, collect a broad candidate set, then post-filter
                        return rawTerm
                            ? ['**/*', '**/*.*']
                            : [`**/${nameRoot}`, `**/${nameRoot}.*`];
                    }
                    return globTerm
                        ? [`**/*${globTerm}*`, `**/*${globTerm}*.*`]
                        : [`**/${nameRoot}`, `**/${nameRoot}.*`];
                })();

                const workspaceSearch = (async () => {
                    try {
                        const maxPerPattern = useRegex ? 1000 : 200;
                        const ops = patterns.map(p => vscode.workspace.findFiles(p, excludePattern, maxPerPattern));
                        const batches = await Promise.all(ops);
                        for (const batch of batches) {
                            for (const uri of batch) {addIfActive(uri);}
                        }
                    } catch (error) {
                        if (seq === searchSeq) {console.warn('[FileSearchService] Workspace search failed:', error);}
                    }
                })();

                const baseDirScan = (async () => {
                    if (!baseDir) {return;}
                    try {
                        const visited = new Set<string>();
                        let foundCount = 0;
                        const maxResults = 200;
                        const scan = async (dirFsPath: string) => {
                            if (seq !== searchSeq) {return;} // cancel
                            if (foundCount >= maxResults) {return;}
                            if (visited.has(dirFsPath)) {return;}
                            visited.add(dirFsPath);
                            const baseName = path.basename(dirFsPath);
                            if (baseName === 'node_modules' || baseName === '.git' || baseName === 'dist' || baseName === 'out') {return;}
                            let entries: [string, vscode.FileType][];
                            try {
                                entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(dirFsPath));
                            } catch { return; }
                            for (const [name, type] of entries) {
                                if (seq !== searchSeq) {return;} // cancel
                                if (foundCount >= maxResults) {break;}
                                const childPath = path.join(dirFsPath, name);
                                if (type === vscode.FileType.Directory) {
                                    await scan(childPath);
                                } else if (type === vscode.FileType.File) {
                                    const parsed = path.parse(name);
                                    const baseNoExtCandidate = caseSensitive ? parsed.name : parsed.name.toLowerCase();
                                    const includeByTerm = !normalized || baseNoExtCandidate.includes(normalized);
                                    // For regex or whole-word, skip prefilter and rely on nameMatches inside addIfActive
                                    if (useRegex || wholeWord) {
                                        addIfActive(vscode.Uri.file(childPath));
                                        foundCount++;
                                    } else if (includeByTerm) {
                                        addIfActive(vscode.Uri.file(childPath));
                                        foundCount++;
                                    }
                                }
                            }
                        };
                        await scan(baseDir);
                    } catch (error) {
                        if (seq === searchSeq) {console.warn('[FileSearchService] BaseDir scan failed:', error);}
                    }
                })();

                Promise.all([workspaceSearch, baseDirScan]).finally(() => {
                    if (seq !== searchSeq) {return;} // stale completion
                    quickPick.busy = false;
                    if (itemsMap.size === 0) {
                        quickPick.placeholder = normalized
                            ? `No matches for "${term}". Try another term.`
                            : `No matches for "${nameRoot}". Try typing to search.`;
                        // Show a non-selectable info row
                        quickPick.items = [{ label: 'No results found', alwaysShow: true } as vscode.QuickPickItem];
                    }
                });
            };

            // Start initial search
            startSearch(nameRoot);

            // Debounced dynamic term handling and button toggles
            disposables.push(quickPick.onDidChangeValue((value) => {
                if (debounceTimer) {clearTimeout(debounceTimer);}
                debounceTimer = setTimeout(() => startSearch(value), 200);
            }));

            disposables.push(quickPick.onDidTriggerButton((button) => {
                if (button === caseBtn) {
                    caseSensitive = !caseSensitive;
                } else if (button === wordBtn) {
                    wholeWord = !wholeWord;
                } else if (button === regexBtn) {
                    useRegex = !useRegex;
                } else {
                    return;
                }
                updateButtons();
                // Restart search immediately with current term
                if (debounceTimer) {clearTimeout(debounceTimer);}
                startSearch(quickPick.value);
            }));

            return await acceptPromise;
        } finally {
            disposables.forEach(d => d.dispose());
        }
    }
}
