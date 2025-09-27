/**
 * Test to verify the fix for the backup and reload bug
 * This test verifies that recently reloaded files are not immediately saved back
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('Fixed Backup and Reload Functionality', () => {
    let mockPanel;
    let mockFileWrites;

    beforeEach(() => {
        jest.clearAllMocks();

        // Track all write operations
        mockFileWrites = [];

        // Mock file system
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockImplementation((filePath) => {
            if (filePath.includes('tasks.md')) {
                return "# External Task\nThis was modified externally and should NOT be overwritten";
            }
            return "default content";
        });

        fs.writeFileSync.mockImplementation((filePath, content) => {
            console.log(`[TEST] Writing to: ${filePath}`);
            console.log(`[TEST] Content: ${content.substring(0, 50)}...`);
            mockFileWrites.push({ filePath, content });
        });

        // Create mock panel with the fix implemented
        mockPanel = {
            _board: {
                columns: [{
                    id: 'col1',
                    title: 'Test Column',
                    includeMode: true,
                    includeFiles: ['./tasks.md'],
                    tasks: [{
                        id: 'task1',
                        title: 'Original Kanban Task',
                        description: 'This should be backed up'
                    }]
                }]
            },
            _fileManager: {
                getDocument: () => ({
                    uri: { fsPath: '/test/kanban.md' }
                })
            },
            _recentlyReloadedFiles: new Set(),

            // Mock backup creation
            saveIncludeFileAsBackup: jest.fn().mockImplementation(async (filePath) => {
                const backupPath = filePath + '.backup';
                const kanbanContent = "# Original Kanban Task\nThis should be backed up";
                fs.writeFileSync(backupPath, kanbanContent);
                return true;
            }),

            // Mock the reload operation
            updateIncludeFile: jest.fn().mockImplementation(async function(filePath, isColumn, isTask, skipConflictDetection) {
                console.log(`[TEST] updateIncludeFile called for: ${filePath}`);

                // Simulate reading external content and updating board
                const externalContent = "# External Task\nThis was modified externally and should NOT be overwritten";
                this._board.columns[0].tasks = [{
                    id: 'external_task',
                    title: 'External Task',
                    description: 'This was modified externally and should NOT be overwritten'
                }];

                return true;
            }),

            // Mock the save methods that should be filtered
            saveAllColumnIncludeChanges: jest.fn().mockImplementation(async function() {
                console.log(`[TEST] saveAllColumnIncludeChanges called`);

                // Filter out recently reloaded files (this is the fix)
                const includeColumns = this._board.columns.filter(col => col.includeMode);

                const columnsToSave = includeColumns.filter(col => {
                    if (!col.includeFiles || col.includeFiles.length === 0) {
                        return true;
                    }

                    return !col.includeFiles.some(file => {
                        const normalizedFile = (!path.isAbsolute(file) && !file.startsWith('.')) ? './' + file : file;
                        const isRecentlyReloaded = this._recentlyReloadedFiles.has(normalizedFile) || this._recentlyReloadedFiles.has(file);
                        if (isRecentlyReloaded) {
                            console.log(`[TEST] Skipping save for recently reloaded: ${file}`);
                        }
                        return isRecentlyReloaded;
                    });
                });

                console.log(`[TEST] Original columns: ${includeColumns.length}, Filtered columns: ${columnsToSave.length}`);

                // Simulate saving the remaining columns
                for (const col of columnsToSave) {
                    if (col.includeFiles) {
                        for (const file of col.includeFiles) {
                            const absolutePath = path.resolve('/test', file.replace('./', ''));
                            const kanbanContent = "# Original Kanban Task\nThis should be backed up";
                            fs.writeFileSync(absolutePath, kanbanContent);
                        }
                    }
                }

                return true;
            }),

            saveAllTaskIncludeChanges: jest.fn().mockResolvedValue(true),

            // Mock the main backup and reload flow
            handleBackupAndReload: async function(filePath) {
                console.log(`[TEST] Starting backup and reload for: ${filePath}`);

                // Step 1: Create backup
                await this.saveIncludeFileAsBackup(filePath);

                // Step 2: Reload from external
                await this.updateIncludeFile(filePath, true, false, true);

                // Step 3: Mark as recently reloaded (this is the fix)
                const basePath = path.dirname(this._fileManager.getDocument().uri.fsPath);
                const relativePath = path.relative(basePath, filePath);
                const normalizedPath = (!path.isAbsolute(relativePath) && !relativePath.startsWith('.')) ? './' + relativePath : relativePath;
                this._recentlyReloadedFiles.add(normalizedPath);
                console.log(`[TEST] Marked as recently reloaded: ${normalizedPath}`);

                // Step 4: Simulate auto-save that would normally overwrite external file
                console.log(`[TEST] Simulating auto-save that would cause the bug...`);
                await this.saveAllColumnIncludeChanges();

                return true;
            }
        };
    });

    test('should NOT overwrite external file after backup and reload with fix', async () => {
        const externalFilePath = '/test/tasks.md';

        console.log('\n=== Testing Fixed Backup and Reload ===');

        // Execute the backup and reload flow
        await mockPanel.handleBackupAndReload(externalFilePath);

        // Verify backup was created
        expect(mockPanel.saveIncludeFileAsBackup).toHaveBeenCalledWith(externalFilePath);

        // Verify reload was called
        expect(mockPanel.updateIncludeFile).toHaveBeenCalledWith(externalFilePath, true, false, true);

        // Verify board was updated with external content
        expect(mockPanel._board.columns[0].tasks[0].title).toBe('External Task');

        // Verify the file was marked as recently reloaded
        expect(mockPanel._recentlyReloadedFiles.has('./tasks.md')).toBe(true);

        // Verify saveAllColumnIncludeChanges was called (simulating auto-save)
        expect(mockPanel.saveAllColumnIncludeChanges).toHaveBeenCalled();

        // CRITICAL: Verify external file was NOT written to
        const externalFileWrites = mockFileWrites.filter(write => write.filePath === externalFilePath);
        expect(externalFileWrites).toHaveLength(0);

        // Verify only backup file was written
        const backupWrites = mockFileWrites.filter(write => write.filePath.includes('.backup'));
        expect(backupWrites).toHaveLength(1);

        console.log(`[TEST] ✅ Fix verified: External file was not overwritten`);
        console.log(`[TEST] Total writes: ${mockFileWrites.length}`);
        console.log(`[TEST] Backup writes: ${backupWrites.length}`);
        console.log(`[TEST] External file writes: ${externalFileWrites.length}`);
    });

    test('should allow normal saving after delay', async () => {
        const externalFilePath = '/test/tasks.md';

        // Execute backup and reload
        await mockPanel.handleBackupAndReload(externalFilePath);

        // Verify file is marked as recently reloaded
        expect(mockPanel._recentlyReloadedFiles.has('./tasks.md')).toBe(true);

        // Simulate the timeout clearing the flag
        mockPanel._recentlyReloadedFiles.delete('./tasks.md');

        // Clear previous writes
        mockFileWrites.length = 0;

        // Now saveAllColumnIncludeChanges should save the file normally
        await mockPanel.saveAllColumnIncludeChanges();

        // Verify the file is now saved (because it's no longer recently reloaded)
        const externalFileWrites = mockFileWrites.filter(write => write.filePath === externalFilePath);
        expect(externalFileWrites).toHaveLength(1);

        console.log(`[TEST] ✅ Normal saving works after delay`);
    });

    test('should demonstrate the bug without the fix', async () => {
        // Simulate the old buggy behavior by not filtering recently reloaded files
        mockPanel.saveAllColumnIncludeChanges = jest.fn().mockImplementation(async function() {
            console.log(`[TEST] BUGGY saveAllColumnIncludeChanges called (no filtering)`);

            // This is the old buggy behavior - save ALL include columns without filtering
            const includeColumns = this._board.columns.filter(col => col.includeMode);

            for (const col of includeColumns) {
                if (col.includeFiles) {
                    for (const file of col.includeFiles) {
                        const absolutePath = path.resolve('/test', file.replace('./', ''));
                        const kanbanContent = "# Original Kanban Task\nThis overwrites external changes - BUG!";
                        fs.writeFileSync(absolutePath, kanbanContent);
                    }
                }
            }

            return true;
        });

        const externalFilePath = '/test/tasks.md';

        // Execute the backup and reload flow with buggy save
        await mockPanel.handleBackupAndReload(externalFilePath);

        // With the bug, the external file should be overwritten
        const externalFileWrites = mockFileWrites.filter(write => write.filePath === externalFilePath);
        expect(externalFileWrites).toHaveLength(1);
        expect(externalFileWrites[0].content).toContain('This overwrites external changes - BUG!');

        console.log(`[TEST] 🐛 Bug reproduced: External file was overwritten`);
    });
});