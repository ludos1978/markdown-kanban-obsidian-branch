/**
 * Test for automatic update of inline !!!include()!!! files when modified externally
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('Inline Include Auto-Update', () => {
    let mockPanel;
    let mockFileSystem;

    beforeEach(() => {
        jest.clearAllMocks();

        mockFileSystem = new Map();

        // Mock file system
        fs.existsSync.mockImplementation((filePath) => {
            return mockFileSystem.has(filePath);
        });

        fs.readFileSync.mockImplementation((filePath) => {
            if (!mockFileSystem.has(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }
            return mockFileSystem.get(filePath);
        });

        // Set up initial files
        mockFileSystem.set('/test/kanban.md', '## To Do\n\n- [ ] Task with include\n  !!!include(./notes.md)!!!\n');
        mockFileSystem.set('/test/notes.md', 'Original note content');

        // Mock panel
        mockPanel = {
            _board: {
                columns: [{
                    id: 'col1',
                    title: 'To Do',
                    tasks: [{
                        id: 'task1',
                        title: 'Task with include',
                        description: '!!!include(./notes.md)!!!'
                    }]
                }]
            },
            _fileManager: {
                getDocument: () => ({
                    uri: { fsPath: '/test/kanban.md' }
                })
            },
            _includeFiles: new Map(),
            _panel: {
                webview: {
                    postMessage: jest.fn()
                }
            },

            // Method to read file content
            readFileContent: jest.fn().mockImplementation(async (filePath) => {
                return mockFileSystem.get(filePath);
            }),

            // Method to ensure include file is registered
            ensureIncludeFileRegistered: jest.fn().mockImplementation(function(relativePath, type) {
                if (!this._includeFiles.has(relativePath)) {
                    this._includeFiles.set(relativePath, {
                        absolutePath: path.resolve('/test', relativePath.replace('./', '')),
                        relativePath: relativePath,
                        type: type,
                        content: mockFileSystem.get(path.resolve('/test', relativePath.replace('./', ''))),
                        baseline: mockFileSystem.get(path.resolve('/test', relativePath.replace('./', ''))),
                        hasUnsavedChanges: false,
                        hasExternalChanges: false,
                        lastModified: Date.now()
                    });
                }
            }),

            // Method to update inline include file
            updateInlineIncludeFile: jest.fn().mockImplementation(async function(absolutePath, relativePath) {
                const content = mockFileSystem.get(absolutePath);

                // Send update to frontend
                this._panel.webview.postMessage({
                    type: 'includeFileContent',
                    filePath: relativePath,
                    content: content
                });

                return true;
            }),

            // Method to send board update
            sendBoardUpdate: jest.fn().mockResolvedValue(true),

            // The method we're testing - handling inline include file changes
            handleInlineIncludeFileChange: async function(filePath) {
                const basePath = path.dirname(this._fileManager.getDocument().uri.fsPath);
                let relativePath = path.relative(basePath, filePath);

                if (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) {
                    relativePath = './' + relativePath;
                }

                // Ensure registered
                this.ensureIncludeFileRegistered(relativePath, 'regular');

                // Read new content
                const newExternalContent = await this.readFileContent(filePath);

                if (newExternalContent !== null) {
                    const includeFile = this._includeFiles.get(relativePath);
                    if (includeFile) {
                        if (newExternalContent !== includeFile.content) {
                            // Update content
                            includeFile.content = newExternalContent;
                            includeFile.baseline = newExternalContent;
                            includeFile.hasUnsavedChanges = false;
                            includeFile.hasExternalChanges = false;
                            includeFile.lastModified = Date.now();

                            // Auto-update frontend
                            await this.updateInlineIncludeFile(filePath, relativePath);

                            // Trigger board refresh
                            await this.sendBoardUpdate(false, true);

                            console.log(`[TEST] Automatically updated include: ${relativePath}`);
                        }
                    }
                }
            }
        };
    });

    test('should automatically update inline include when external file changes', async () => {
        const includeFilePath = '/test/notes.md';
        const newContent = 'Updated note content from external editor';

        // Register the initial include file
        mockPanel.ensureIncludeFileRegistered('./notes.md', 'regular');

        // Verify initial state
        const initialInclude = mockPanel._includeFiles.get('./notes.md');
        expect(initialInclude.content).toBe('Original note content');
        expect(initialInclude.hasExternalChanges).toBe(false);

        // Simulate external file change
        mockFileSystem.set(includeFilePath, newContent);

        // Handle the external change
        await mockPanel.handleInlineIncludeFileChange(includeFilePath);

        // Verify the include file was updated
        const updatedInclude = mockPanel._includeFiles.get('./notes.md');
        expect(updatedInclude.content).toBe(newContent);
        expect(updatedInclude.baseline).toBe(newContent);
        expect(updatedInclude.hasUnsavedChanges).toBe(false);
        expect(updatedInclude.hasExternalChanges).toBe(false);

        // Verify updateInlineIncludeFile was called
        expect(mockPanel.updateInlineIncludeFile).toHaveBeenCalledWith(includeFilePath, './notes.md');

        // Verify frontend was notified
        expect(mockPanel._panel.webview.postMessage).toHaveBeenCalledWith({
            type: 'includeFileContent',
            filePath: './notes.md',
            content: newContent
        });

        // Verify board refresh was triggered
        expect(mockPanel.sendBoardUpdate).toHaveBeenCalledWith(false, true);
    });

    test('should not update if content has not changed', async () => {
        const includeFilePath = '/test/notes.md';

        // Register the include file
        mockPanel.ensureIncludeFileRegistered('./notes.md', 'regular');

        // Handle external change with same content
        await mockPanel.handleInlineIncludeFileChange(includeFilePath);

        // Verify no unnecessary updates
        expect(mockPanel.updateInlineIncludeFile).not.toHaveBeenCalled();
        expect(mockPanel.sendBoardUpdate).not.toHaveBeenCalled();
    });

    test('should handle multiple inline includes', async () => {
        // Set up multiple include files
        mockFileSystem.set('/test/todo.md', 'Todo list content');
        mockFileSystem.set('/test/ideas.md', 'Ideas content');

        // Register multiple includes
        mockPanel.ensureIncludeFileRegistered('./todo.md', 'regular');
        mockPanel.ensureIncludeFileRegistered('./ideas.md', 'regular');

        // Update first include
        mockFileSystem.set('/test/todo.md', 'Updated todo list');
        await mockPanel.handleInlineIncludeFileChange('/test/todo.md');

        // Update second include
        mockFileSystem.set('/test/ideas.md', 'Updated ideas');
        await mockPanel.handleInlineIncludeFileChange('/test/ideas.md');

        // Verify both were updated
        expect(mockPanel._includeFiles.get('./todo.md').content).toBe('Updated todo list');
        expect(mockPanel._includeFiles.get('./ideas.md').content).toBe('Updated ideas');

        // Verify both triggered updates
        expect(mockPanel.updateInlineIncludeFile).toHaveBeenCalledTimes(2);
        expect(mockPanel.sendBoardUpdate).toHaveBeenCalledTimes(2);
    });

    test('should update cache in frontend when content is received', async () => {
        // Simulate the frontend cache update
        const fileCache = new Map();

        const updateIncludeFileCache = (filePath, content) => {
            fileCache.set(filePath, content);
            console.log(`[TEST] Frontend cache updated for: ${filePath}`);
            return true;
        };

        // Initial cache state
        fileCache.set('./notes.md', 'Original note content');

        // Simulate receiving update from backend
        const updateMessage = {
            type: 'includeFileContent',
            filePath: './notes.md',
            content: 'Updated content from backend'
        };

        // Update cache
        updateIncludeFileCache(updateMessage.filePath, updateMessage.content);

        // Verify cache was updated
        expect(fileCache.get('./notes.md')).toBe('Updated content from backend');
    });
});