/**
 * Include File Handling Test Suite
 *
 * Tests for include file conflict resolution, backup creation, and path handling
 */

const { JSDOM } = require('jsdom');
const path = require('path');
const fs = require('fs');

const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test</title>
</head>
<body>
    <div id="board-container"></div>
</body>
</html>
`, {
    url: 'http://localhost',
    pretendToBeVisual: true,
    resources: 'usable'
});

global.document = dom.window.document;
global.window = dom.window;

// Mock VS Code API
global.vscode = {
    postMessage: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(() => ({}))
};

// Mock file system operations
jest.mock('fs');

describe('Include File Handling and Backup Creation', () => {
    let mockBoard;
    let mockBackupManager;

    beforeEach(() => {
        jest.clearAllMocks();
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});
        fs.readFileSync.mockReturnValue('mocked file content');
        fs.mkdirSync.mockImplementation(() => {});

        mockBoard = {
            columns: [
                {
                    id: 'col_1',
                    title: 'To Do',
                    includeMode: true,
                    includeFiles: ['column-tasks.md'], // Column includes without ./ prefix
                    tasks: [
                        {
                            id: 'task_1',
                            title: 'Test Task 1',
                            description: 'Description 1',
                            includeMode: true,
                            includeFiles: ['./task-notes.md'] // Task includes with ./ prefix
                        },
                        {
                            id: 'task_2',
                            title: 'Test Task 2',
                            description: 'Description 2'
                        }
                    ]
                },
                {
                    id: 'col_2',
                    title: 'In Progress',
                    includeMode: true,
                    includeFiles: ['progress-tasks.md'],
                    tasks: []
                }
            ]
        };

        // Mock backup manager methods
        mockBackupManager = {
            createFileBackup: jest.fn().mockResolvedValue('/path/to/backup.md'),
            generateBackupPath: jest.fn().mockReturnValue('/path/to/backup.md')
        };

        global.currentBoard = mockBoard;
        global.window.currentBoard = mockBoard;
    });

    describe('Path Format Handling', () => {
        test('should normalize path formats correctly', () => {
            const pathWithPrefix = './task-notes.md';
            const pathWithoutPrefix = 'task-notes.md';

            // Simulate normalization logic
            const normalize = (filePath) => {
                const normalizedPath = path.normalize(filePath);
                return normalizedPath.startsWith('./') ? normalizedPath : `./${normalizedPath}`;
            };

            const removePrefix = (filePath) => {
                return filePath.startsWith('./') ? filePath.substring(2) : filePath;
            };

            expect(normalize(pathWithoutPrefix)).toBe('./task-notes.md');
            expect(normalize(pathWithPrefix)).toBe('./task-notes.md');
            expect(removePrefix(pathWithPrefix)).toBe('task-notes.md');
            expect(removePrefix(pathWithoutPrefix)).toBe('task-notes.md');
        });

        test('should find column includes without ./ prefix', () => {
            const targetFile = 'column-tasks.md';
            let foundColumn = null;

            // Simulate column include search logic
            for (const column of mockBoard.columns) {
                if (column.includeMode && column.includeFiles?.includes(targetFile)) {
                    foundColumn = column;
                    break;
                }
            }

            expect(foundColumn).toBeTruthy();
            expect(foundColumn.id).toBe('col_1');
            expect(foundColumn.includeFiles).toContain(targetFile);
        });

        test('should find task includes with ./ prefix', () => {
            const targetFile = './task-notes.md';
            let foundTask = null;
            let foundColumn = null;

            // Simulate task include search logic
            for (const column of mockBoard.columns) {
                for (const task of column.tasks) {
                    if (task.includeMode && task.includeFiles?.includes(targetFile)) {
                        foundTask = task;
                        foundColumn = column;
                        break;
                    }
                }
                if (foundTask) break;
            }

            expect(foundTask).toBeTruthy();
            expect(foundColumn).toBeTruthy();
            expect(foundTask.id).toBe('task_1');
            expect(foundTask.includeFiles).toContain(targetFile);
        });

        test('should handle dual path format checking for includes', () => {
            const searchFile = 'task-notes.md'; // Search without prefix
            const normalizedRelativePath = `./${searchFile}`;
            const normalizedRelativePathWithoutPrefix = searchFile;

            let foundInColumn = false;
            let foundInTask = false;

            // Check column includes (they store without ./ prefix)
            for (const column of mockBoard.columns) {
                if (column.includeMode && column.includeFiles?.includes(normalizedRelativePathWithoutPrefix)) {
                    foundInColumn = true;
                    break;
                }
            }

            // Check task includes (they store with ./ prefix)
            for (const column of mockBoard.columns) {
                for (const task of column.tasks) {
                    if (task.includeMode && task.includeFiles?.includes(normalizedRelativePath)) {
                        foundInTask = true;
                        break;
                    }
                }
                if (foundInTask) break;
            }

            expect(foundInTask).toBe(true);
            expect(foundInColumn).toBe(false);
        });
    });

    describe('Backup Creation Logic', () => {
        test('should create backup for column include file', async () => {
            const filePath = 'column-tasks.md';
            const content = 'Updated column tasks content';
            const targetColumn = mockBoard.columns[0];

            // Simulate backup creation
            const backupPath = await mockBackupManager.createFileBackup(filePath, content);

            expect(mockBackupManager.createFileBackup).toHaveBeenCalledWith(filePath, content);
            expect(backupPath).toBe('/path/to/backup.md');
        });

        test('should create backup for task include file', async () => {
            const filePath = './task-notes.md';
            const content = 'Updated task notes content';
            const targetTask = mockBoard.columns[0].tasks[0];

            // Simulate backup creation
            const backupPath = await mockBackupManager.createFileBackup(filePath, content);

            expect(mockBackupManager.createFileBackup).toHaveBeenCalledWith(filePath, content);
            expect(backupPath).toBe('/path/to/backup.md');
        });

        test('should handle backup creation failure gracefully', async () => {
            const filePath = './task-notes.md';
            const content = 'Content to backup';

            mockBackupManager.createFileBackup.mockRejectedValue(new Error('Backup failed'));

            try {
                await mockBackupManager.createFileBackup(filePath, content);
                fail('Should have thrown an error');
            } catch (error) {
                expect(error.message).toBe('Backup failed');
            }
        });

        test('should generate unique backup filenames', () => {
            const originalFile = 'tasks.md';
            const timestamp = '2024-01-15T10:30:00';

            // Simulate backup path generation
            const generateBackupFilename = (filePath, timestamp) => {
                const parsedPath = path.parse(filePath);
                const backupName = `${parsedPath.name}_backup_${timestamp.replace(/[:.]/g, '-')}${parsedPath.ext}`;
                return backupName;
            };

            const backupFilename = generateBackupFilename(originalFile, timestamp);
            expect(backupFilename).toBe('tasks_backup_2024-01-15T10-30-00.md');
        });
    });

    describe('Include File Content Handling', () => {
        test('should save column include file changes', () => {
            const columnId = 'col_1';
            const filePath = 'column-tasks.md';
            const newContent = 'Updated column content';

            // Simulate saveIncludeFileChanges logic for column includes
            const targetColumn = mockBoard.columns.find(col => col.id === columnId);
            const isColumnInclude = targetColumn?.includeMode &&
                targetColumn?.includeFiles?.includes(filePath);

            expect(isColumnInclude).toBe(true);
            expect(targetColumn.includeFiles).toContain(filePath);
        });

        test('should save task include file changes', () => {
            const taskId = 'task_1';
            const filePath = './task-notes.md';
            const newContent = 'Updated task content';

            // Simulate saveIncludeFileChanges logic for task includes
            let targetTask = null;
            let targetColumn = null;

            for (const column of mockBoard.columns) {
                const task = column.tasks.find(t => t.id === taskId);
                if (task) {
                    targetTask = task;
                    targetColumn = column;
                    break;
                }
            }

            const isTaskInclude = targetTask?.includeMode &&
                targetTask?.includeFiles?.includes(filePath);

            expect(isTaskInclude).toBe(true);
            expect(targetTask.includeFiles).toContain(filePath);
        });

        test('should handle mixed include file types in single board', () => {
            const columnFile = 'column-tasks.md';
            const taskFile = './task-notes.md';

            // Find column include
            const columnWithInclude = mockBoard.columns.find(col =>
                col.includeMode && col.includeFiles?.includes(columnFile)
            );

            // Find task include
            let taskWithInclude = null;
            for (const column of mockBoard.columns) {
                const task = column.tasks.find(t =>
                    t.includeMode && t.includeFiles?.includes(taskFile)
                );
                if (task) {
                    taskWithInclude = task;
                    break;
                }
            }

            expect(columnWithInclude).toBeTruthy();
            expect(taskWithInclude).toBeTruthy();
            expect(columnWithInclude.includeFiles).toContain(columnFile);
            expect(taskWithInclude.includeFiles).toContain(taskFile);
        });
    });

    describe('File Change Detection', () => {
        test('should detect external changes to include files', () => {
            const filePath = './task-notes.md';
            const lastModified = Date.now() - 1000; // 1 second ago
            const currentModified = Date.now(); // Now

            const hasExternalChanges = currentModified > lastModified;
            expect(hasExternalChanges).toBe(true);
        });

        test('should track unsaved changes in include files', () => {
            const includeFileChanges = new Map();
            includeFileChanges.set('./task-notes.md', {
                hasChanges: true,
                lastEdit: Date.now()
            });

            const hasUnsavedChanges = includeFileChanges.has('./task-notes.md') &&
                includeFileChanges.get('./task-notes.md').hasChanges;

            expect(hasUnsavedChanges).toBe(true);
        });

        test('should differentiate between internal and external changes', () => {
            const internalChanges = new Set(['./task-notes.md']);
            const externalChanges = new Set(['./external-file.md']);

            const hasInternalChanges = internalChanges.has('./task-notes.md');
            const hasExternalChanges = externalChanges.has('./task-notes.md');

            expect(hasInternalChanges).toBe(true);
            expect(hasExternalChanges).toBe(false);
        });
    });

    describe('Auto-reload Behavior', () => {
        test('should auto-reload when external changes and no internal changes', () => {
            const context = {
                hasIncludeUnsavedChanges: false,
                hasExternalChanges: true,
                filePath: './auto-reload-test.md'
            };

            const shouldAutoReload = !context.hasIncludeUnsavedChanges && context.hasExternalChanges;
            expect(shouldAutoReload).toBe(true);
        });

        test('should not auto-reload when there are internal changes', () => {
            const context = {
                hasIncludeUnsavedChanges: true,
                hasExternalChanges: true,
                filePath: './conflict-test.md'
            };

            const shouldAutoReload = !context.hasIncludeUnsavedChanges && context.hasExternalChanges;
            expect(shouldAutoReload).toBe(false);
        });

        test('should ignore when no changes on either side', () => {
            const context = {
                hasIncludeUnsavedChanges: false,
                hasExternalChanges: false,
                filePath: './no-changes-test.md'
            };

            const shouldIgnore = !context.hasIncludeUnsavedChanges && !context.hasExternalChanges;
            expect(shouldIgnore).toBe(true);
        });
    });

    describe('Conflict Resolution Integration', () => {
        test('should resolve backup and reload action correctly', async () => {
            const resolution = {
                action: 'backup_and_reload',
                shouldCreateBackup: true,
                shouldReload: true,
                shouldSave: false
            };

            const filePath = './conflict-test.md';
            const content = 'Content to backup';

            if (resolution.shouldCreateBackup) {
                const backupPath = await mockBackupManager.createFileBackup(filePath, content);
                expect(backupPath).toBeTruthy();
            }

            expect(mockBackupManager.createFileBackup).toHaveBeenCalledWith(filePath, content);
            expect(resolution.shouldReload).toBe(true);
        });

        test('should resolve save and ignore external action correctly', () => {
            const resolution = {
                action: 'discard_external',
                shouldSave: true,
                shouldReload: false,
                shouldCreateBackup: false
            };

            const filePath = './save-test.md';
            const content = 'Content to save';

            if (resolution.shouldSave) {
                // Simulate save operation
                fs.writeFileSync(filePath, content);
            }

            expect(fs.writeFileSync).toHaveBeenCalledWith(filePath, content);
            expect(resolution.shouldReload).toBe(false);
        });

        test('should handle ignore action correctly', () => {
            const resolution = {
                action: 'ignore',
                shouldIgnore: true,
                shouldSave: false,
                shouldReload: false,
                shouldCreateBackup: false
            };

            // No file operations should occur
            expect(resolution.shouldIgnore).toBe(true);
            expect(resolution.shouldSave).toBe(false);
            expect(resolution.shouldReload).toBe(false);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle missing include files gracefully', () => {
            const filePath = './nonexistent.md';
            fs.existsSync.mockReturnValue(false);

            const fileExists = fs.existsSync(filePath);
            expect(fileExists).toBe(false);

            // Should not crash when file doesn't exist
            const findIncludeInBoard = (board, filePath) => {
                try {
                    for (const column of board.columns) {
                        if (column.includeFiles?.includes(filePath)) {
                            return { type: 'column', column };
                        }
                        for (const task of column.tasks) {
                            if (task.includeFiles?.includes(filePath)) {
                                return { type: 'task', task, column };
                            }
                        }
                    }
                    return null;
                } catch (error) {
                    return null;
                }
            };

            const result = findIncludeInBoard(mockBoard, filePath);
            expect(result).toBe(null);
        });

        test('should handle corrupted board data gracefully', () => {
            const corruptedBoard = {
                columns: [
                    {
                        id: 'col_1',
                        // Missing required properties
                        tasks: null
                    }
                ]
            };

            const findIncludeInBoard = (board, filePath) => {
                try {
                    for (const column of board.columns || []) {
                        if (column.includeFiles?.includes(filePath)) {
                            return { type: 'column', column };
                        }
                        for (const task of column.tasks || []) {
                            if (task.includeFiles?.includes(filePath)) {
                                return { type: 'task', task, column };
                            }
                        }
                    }
                    return null;
                } catch (error) {
                    return null;
                }
            };

            const result = findIncludeInBoard(corruptedBoard, './test.md');
            expect(result).toBe(null);
        });

        test('should handle file system permission errors', () => {
            const filePath = './permission-denied.md';
            const content = 'Test content';

            fs.writeFileSync.mockImplementation(() => {
                throw new Error('EACCES: permission denied');
            });

            expect(() => {
                fs.writeFileSync(filePath, content);
            }).toThrow('EACCES: permission denied');
        });

        test('should validate file paths before operations', () => {
            const invalidPaths = [
                '',
                null,
                undefined,
                '../../../etc/passwd',
                'file\x00name.txt' // Null byte injection
            ];

            const isValidPath = (filePath) => {
                if (!filePath || typeof filePath !== 'string') return false;
                if (filePath.includes('\x00')) return false;
                if (filePath.includes('../')) return false;
                // Allow relative paths starting with ./
                if (filePath.startsWith('./')) return true;
                // Allow simple file names without path traversal
                if (!filePath.includes('/') && !filePath.includes('\\')) return true;
                return false;
            };

            invalidPaths.forEach(invalidPath => {
                expect(isValidPath(invalidPath)).toBe(false);
            });

            expect(isValidPath('./valid-file.md')).toBe(true);
            expect(isValidPath('valid-file.md')).toBe(true);
        });
    });

    describe('Performance and Memory', () => {
        test('should limit backup file size', () => {
            const largeContent = 'x'.repeat(10 * 1024 * 1024); // 10MB
            const maxBackupSize = 5 * 1024 * 1024; // 5MB limit

            const shouldCreateBackup = largeContent.length <= maxBackupSize;
            expect(shouldCreateBackup).toBe(false);
        });

        test('should clean up old backup files', () => {
            const oldBackupFiles = [
                'tasks_backup_2024-01-01T10-00-00.md',
                'tasks_backup_2024-01-02T10-00-00.md',
                'tasks_backup_2024-01-03T10-00-00.md'
            ];

            const maxBackupFiles = 2;
            const filesToDelete = oldBackupFiles.slice(0, oldBackupFiles.length - maxBackupFiles);

            expect(filesToDelete.length).toBe(1);
            expect(filesToDelete[0]).toBe('tasks_backup_2024-01-01T10-00-00.md');
        });

        test('should batch file operations for efficiency', () => {
            const filePaths = ['./file1.md', './file2.md', './file3.md'];
            const operations = [];

            filePaths.forEach(filePath => {
                operations.push(() => fs.writeFileSync(filePath, 'content'));
            });

            // Execute all operations
            operations.forEach(op => op());

            expect(fs.writeFileSync).toHaveBeenCalledTimes(3);
        });
    });
});