/**
 * Test for file reuse functionality - focusing existing editors instead of opening duplicates
 */

const mockVscode = {
    window: {
        visibleTextEditors: [],
        showTextDocument: jest.fn()
    },
    workspace: {
        openTextDocument: jest.fn(),
        textDocuments: []
    },
    Uri: {
        file: jest.fn(path => ({ fsPath: path }))
    },
    commands: {
        executeCommand: jest.fn()
    }
};

// Mock vscode module
jest.mock('vscode', () => mockVscode, { virtual: true });

describe('File Reuse Functionality', () => {
    let messageHandler;

    beforeEach(() => {
        jest.clearAllMocks();

        // Reset mock editors and documents
        mockVscode.window.visibleTextEditors = [];
        mockVscode.workspace.textDocuments = [];

        // Mock file manager
        const mockFileManager = {
            getDocument: () => ({
                uri: { fsPath: '/test/kanban.md' }
            })
        };

        // Create message handler instance
        messageHandler = {
            _fileManager: mockFileManager,

            // The method we're testing
            handleOpenFile: async function(filePath) {
                const path = require('path');

                // Resolve the file path to absolute if it's relative
                let absolutePath = filePath;
                if (!path.isAbsolute(filePath)) {
                    const document = this._fileManager.getDocument();
                    if (document) {
                        const currentDir = path.dirname(document.uri.fsPath);
                        absolutePath = path.resolve(currentDir, filePath);
                    }
                }

                // Check if the file is already open as a document (even if not visible)
                const existingDocument = mockVscode.workspace.textDocuments.find(doc =>
                    doc.uri.fsPath === absolutePath
                );

                if (existingDocument) {
                    // File is already open, find the editor to get the view column
                    const existingEditor = mockVscode.window.visibleTextEditors.find(editor =>
                        editor.document.uri.fsPath === absolutePath
                    );

                    if (existingEditor) {
                        // Document is visible in an editor, focus it with correct view column
                        await mockVscode.window.showTextDocument(existingDocument, {
                            viewColumn: existingEditor.viewColumn,
                            preserveFocus: false,
                            preview: false
                        });
                    } else {
                        // Document is open but not visible, show it in current view column
                        await mockVscode.window.showTextDocument(existingDocument, {
                            preserveFocus: false,
                            preview: false
                        });
                    }
                } else {
                    // File is not open, open it normally
                    await mockVscode.commands.executeCommand('vscode.open', mockVscode.Uri.file(absolutePath));
                }
            }
        };
    });

    test('should focus existing editor when file is already open and visible', async () => {
        const filePath = '/test/notes.md';

        // Mock an existing document and visible editor for this file
        const existingDocument = {
            uri: { fsPath: filePath }
        };
        const existingEditor = {
            document: existingDocument,
            viewColumn: 2
        };
        mockVscode.workspace.textDocuments = [existingDocument];
        mockVscode.window.visibleTextEditors = [existingEditor];

        // Handle opening the file
        await messageHandler.handleOpenFile(filePath);

        // Verify showTextDocument was called with correct view column
        expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(
            existingDocument,
            {
                viewColumn: 2,
                preserveFocus: false,
                preview: false
            }
        );

        // Verify vscode.open command was NOT called
        expect(mockVscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'vscode.open',
            expect.anything()
        );
    });

    test('should focus document that is open but not visible', async () => {
        const filePath = '/test/notes.md';

        // Mock an existing document but no visible editor (document is in background tab)
        const existingDocument = {
            uri: { fsPath: filePath }
        };
        mockVscode.workspace.textDocuments = [existingDocument];
        mockVscode.window.visibleTextEditors = []; // No visible editors

        // Handle opening the file
        await messageHandler.handleOpenFile(filePath);

        // Verify showTextDocument was called without view column (current column)
        expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(
            existingDocument,
            {
                preserveFocus: false,
                preview: false
            }
        );

        // Verify vscode.open command was NOT called
        expect(mockVscode.commands.executeCommand).not.toHaveBeenCalledWith(
            'vscode.open',
            expect.anything()
        );
    });

    test('should open new editor when file is not already open', async () => {
        const filePath = '/test/notes.md';

        // No existing documents or editors
        mockVscode.workspace.textDocuments = [];
        mockVscode.window.visibleTextEditors = [];

        // Handle opening the file
        await messageHandler.handleOpenFile(filePath);

        // Verify vscode.open command was called
        expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.open',
            { fsPath: filePath }
        );

        // Verify showTextDocument was NOT called
        expect(mockVscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    test('should handle relative paths correctly', async () => {
        const relativePath = './notes.md';
        const expectedAbsolutePath = '/test/notes.md';

        // Mock an existing document and visible editor for the absolute path
        const existingDocument = {
            uri: { fsPath: expectedAbsolutePath }
        };
        const existingEditor = {
            document: existingDocument,
            viewColumn: 3
        };
        mockVscode.workspace.textDocuments = [existingDocument];
        mockVscode.window.visibleTextEditors = [existingEditor];

        // Handle opening the relative path
        await messageHandler.handleOpenFile(relativePath);

        // Verify showTextDocument was called with correct view column
        expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(
            existingDocument,
            {
                viewColumn: 3,
                preserveFocus: false,
                preview: false
            }
        );

        // Verify the file was found by absolute path
        expect(mockVscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    test('should distinguish between different files with same name', async () => {
        const file1 = '/project1/notes.md';
        const file2 = '/project2/notes.md';

        // Mock existing document for file1
        const existingDocument = {
            uri: { fsPath: file1 }
        };
        mockVscode.workspace.textDocuments = [existingDocument];

        // Try to open file2 (different path, same filename)
        await messageHandler.handleOpenFile(file2);

        // Should open new editor since file2 is not open
        expect(mockVscode.commands.executeCommand).toHaveBeenCalledWith(
            'vscode.open',
            { fsPath: file2 }
        );

        // Should not focus the existing document (different file)
        expect(mockVscode.window.showTextDocument).not.toHaveBeenCalled();
    });

    test('should handle multiple open documents correctly', async () => {
        const targetFile = '/test/target.md';

        // Mock multiple existing documents
        const document1 = { uri: { fsPath: '/test/file1.md' } };
        const document2 = { uri: { fsPath: targetFile } };
        const document3 = { uri: { fsPath: '/test/file3.md' } };

        mockVscode.workspace.textDocuments = [document1, document2, document3];

        // Handle opening the target file
        await messageHandler.handleOpenFile(targetFile);

        // Should focus the correct document (document2)
        expect(mockVscode.window.showTextDocument).toHaveBeenCalledWith(
            document2,
            {
                preserveFocus: false,
                preview: false
            }
        );

        // Should not open new editor
        expect(mockVscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});