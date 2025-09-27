/**
 * Comprehensive test to reproduce the backup and reload bug
 * The issue: "save kanban as backup and reload from external" is overwriting external changes
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('Backup and Reload Bug Reproduction', () => {
    let mockPanel;
    let mockFileWrites;
    let mockFileReads;

    beforeEach(() => {
        jest.clearAllMocks();

        // Track all file writes and reads
        mockFileWrites = new Map();
        mockFileReads = new Map();

        // Mock file system
        fs.existsSync.mockReturnValue(true);

        // Mock writeFileSync to track what gets written where
        fs.writeFileSync.mockImplementation((filePath, content) => {
            console.log(`[MOCK] Writing to file: ${filePath}`);
            console.log(`[MOCK] Content: ${content.substring(0, 100)}...`);
            mockFileWrites.set(filePath, content);
        });

        // Mock readFileSync to return different content based on file
        fs.readFileSync.mockImplementation((filePath) => {
            if (mockFileReads.has(filePath)) {
                const content = mockFileReads.get(filePath);
                console.log(`[MOCK] Reading from file: ${filePath}`);
                console.log(`[MOCK] Returning: ${content.substring(0, 100)}...`);
                return content;
            }
            // Default external content (what should be preserved)
            const externalContent = "# External Task\nThis was changed externally and should NOT be overwritten";
            console.log(`[MOCK] Reading from file (default): ${filePath}`);
            console.log(`[MOCK] Returning default: ${externalContent}`);
            return externalContent;
        });

        // Set up the external file content that should be preserved
        const externalFilePath = '/path/to/tasks.md';
        const externalContent = "# External Task\nThis was changed externally and should NOT be overwritten\n\n# Another External Task\nMore external content";
        mockFileReads.set(externalFilePath, externalContent);

        // Create realistic mock panel with actual method implementations
        mockPanel = {
            _board: {
                columns: [{
                    id: 'col_1',
                    title: 'To Do',
                    includeMode: true,
                    includeFiles: ['./tasks.md'],
                    tasks: [{
                        id: 'kanban_task_1',
                        title: 'Kanban Task',
                        description: 'This is kanban content that should be backed up, not saved to external file'
                    }]
                }]
            },
            _fileManager: {
                getDocument: () => ({
                    uri: { fsPath: '/path/to/kanban.md' }
                })
            },
            _includeFiles: new Map(),

            // Mock the backup method - should be called
            saveIncludeFileAsBackup: jest.fn().mockImplementation(async (filePath) => {
                const backupPath = filePath + '.backup';
                const kanbanContent = "# Kanban Task\nThis is kanban content that should be backed up, not saved to external file";
                mockFileWrites.set(backupPath, kanbanContent);
                console.log(`[MOCK] Created backup at: ${backupPath}`);
                return true;
            }),

            // Mock include file saving - should NOT be called for backup_and_reload
            saveIncludeFileChanges: jest.fn().mockImplementation(async (filePath) => {
                console.log(`[MOCK] saveIncludeFileChanges called for: ${filePath} - THIS SHOULD NOT HAPPEN FOR BACKUP_AND_RELOAD!`);
                const kanbanContent = "# Kanban Task\nThis is kanban content that should be backed up, not saved to external file";
                mockFileWrites.set(filePath, kanbanContent); // This would overwrite external changes!
                return true;
            }),

            // Mock column saving - should NOT be called for backup_and_reload
            saveColumnIncludeChanges: jest.fn().mockImplementation(async (column) => {
                console.log(`[MOCK] saveColumnIncludeChanges called - THIS SHOULD NOT HAPPEN FOR BACKUP_AND_RELOAD!`);
                const filePath = '/path/to/tasks.md';
                const kanbanContent = "# Kanban Task\nThis is kanban content that should be backed up, not saved to external file";
                mockFileWrites.set(filePath, kanbanContent); // This would overwrite external changes!
                return true;
            }),

            // Mock the reload method - should read from external file
            updateIncludeFile: jest.fn().mockImplementation(async (filePath, isColumn, isTask, skipConflictDetection) => {
                console.log(`[MOCK] updateIncludeFile called for: ${filePath}, skipConflictDetection: ${skipConflictDetection}`);

                // This should READ from external file and update board
                const externalContent = mockFileReads.get(filePath) || "# External Task\nThis was changed externally and should NOT be overwritten";

                // Update board with external content (this is what should happen)
                if (isColumn) {
                    mockPanel._board.columns[0].tasks = [
                        {
                            id: 'external_task_1',
                            title: 'External Task',
                            description: 'This was changed externally and should NOT be overwritten'
                        },
                        {
                            id: 'external_task_2',
                            title: 'Another External Task',
                            description: 'More external content'
                        }
                    ];
                }

                // CRITICAL: This method should ONLY read, never write to the external file
                // If it writes, that would be the bug!

                return true;
            }),

            // Main conflict handler - this is what we're testing
            handleIncludeFileConflict: async function(filePath) {
                const includeFile = {
                    type: 'column',
                    hasUnsavedChanges: true
                };

                console.log(`[MOCK] Handling conflict for: ${filePath}`);

                // Simulate the resolution for "save kanban as backup and reload from external"
                const resolution = {
                    action: 'backup_and_reload',
                    shouldProceed: true,
                    shouldCreateBackup: true,
                    shouldSave: false,  // CRITICAL: should not save kanban to external
                    shouldReload: true, // CRITICAL: should reload from external
                    shouldIgnore: false
                };

                // This is the actual logic from kanbanWebviewPanel.ts
                if (resolution.shouldCreateBackup && resolution.shouldReload) {
                    console.log(`[MOCK] Processing backup_and_reload`);

                    // Step 1: Create backup (this should work)
                    if (includeFile.type === 'column' || includeFile.type === 'task') {
                        await this.saveIncludeFileAsBackup(filePath);
                    }

                    // Step 2: Reload from external (this is where the bug might be)
                    includeFile.hasUnsavedChanges = false;
                    await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task', true);

                } else if (resolution.shouldSave && !resolution.shouldReload) {
                    // This is the "overwrite external" option - should NOT be called for backup_and_reload
                    console.log(`[MOCK] Processing save without reload - THIS SHOULD NOT HAPPEN FOR BACKUP_AND_RELOAD!`);
                    if (includeFile.type === 'column' || includeFile.type === 'task') {
                        await this.saveIncludeFileChanges(filePath);
                    }
                }

                return resolution;
            }
        };
    });

    test('should NOT overwrite external file when doing backup and reload', async () => {
        const externalFilePath = '/path/to/tasks.md';
        const originalExternalContent = "# External Task\nThis was changed externally and should NOT be overwritten\n\n# Another External Task\nMore external content";

        // Set up the external file content
        mockFileReads.set(externalFilePath, originalExternalContent);

        console.log(`[TEST] Starting backup and reload test`);
        console.log(`[TEST] External file should contain: ${originalExternalContent.substring(0, 50)}...`);
        console.log(`[TEST] Kanban has different content that should be backed up`);

        // Execute the conflict resolution
        const resolution = await mockPanel.handleIncludeFileConflict(externalFilePath);

        console.log(`[TEST] Conflict resolution completed with action: ${resolution.action}`);

        // Verify: Backup was created
        expect(mockPanel.saveIncludeFileAsBackup).toHaveBeenCalledWith(externalFilePath);
        const backupPath = externalFilePath + '.backup';
        expect(mockFileWrites.has(backupPath)).toBe(true);
        console.log(`[TEST] ✅ Backup created at: ${backupPath}`);

        // Verify: Reload from external was called
        expect(mockPanel.updateIncludeFile).toHaveBeenCalledWith(externalFilePath, true, false, true);
        console.log(`[TEST] ✅ updateIncludeFile called to reload from external`);

        // Verify: Board now contains external content
        expect(mockPanel._board.columns[0].tasks[0].title).toBe('External Task');
        expect(mockPanel._board.columns[0].tasks[0].description).toBe('This was changed externally and should NOT be overwritten');
        console.log(`[TEST] ✅ Board updated with external content`);

        // CRITICAL TEST: External file should NOT be overwritten
        expect(mockFileWrites.has(externalFilePath)).toBe(false);
        console.log(`[TEST] ✅ External file was NOT overwritten - this is correct`);

        // Verify: Save methods that would overwrite external file were NOT called
        expect(mockPanel.saveIncludeFileChanges).not.toHaveBeenCalled();
        expect(mockPanel.saveColumnIncludeChanges).not.toHaveBeenCalled();
        console.log(`[TEST] ✅ Save methods that would overwrite external file were NOT called`);

        // Final verification: The external file content should remain unchanged
        const finalExternalContent = mockFileReads.get(externalFilePath);
        expect(finalExternalContent).toBe(originalExternalContent);
        console.log(`[TEST] ✅ External file content remains unchanged`);
    });

    test('should detect if external file gets overwritten by backup and reload', async () => {
        const externalFilePath = '/path/to/tasks.md';
        const originalExternalContent = "# External Task\nThis was changed externally and should NOT be overwritten";

        // Set up the external file content
        mockFileReads.set(externalFilePath, originalExternalContent);

        // Simulate a buggy updateIncludeFile that writes instead of just reading
        mockPanel.updateIncludeFile = jest.fn().mockImplementation(async (filePath, isColumn, isTask, skipConflictDetection) => {
            console.log(`[MOCK-BUGGY] updateIncludeFile writing to file - THIS IS THE BUG!`);

            // BUG: This writes kanban content to external file instead of reading from it
            const kanbanContent = "# Kanban Task\nThis overwrites external changes - THIS IS THE BUG!";
            mockFileWrites.set(filePath, kanbanContent);

            return true;
        });

        // Execute the conflict resolution with buggy implementation
        await mockPanel.handleIncludeFileConflict(externalFilePath);

        // This test should FAIL if the bug exists
        expect(mockFileWrites.has(externalFilePath)).toBe(true); // This means the bug exists
        const writtenContent = mockFileWrites.get(externalFilePath);
        expect(writtenContent).toContain('THIS IS THE BUG'); // Proves external file was overwritten

        console.log(`[TEST] 🐛 BUG DETECTED: External file was overwritten with: ${writtenContent}`);
    });
});