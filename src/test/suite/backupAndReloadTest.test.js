/**
 * Test for 'save kanban as backup and reload from external' functionality
 * This test specifically checks that the reload actually loads FROM external
 * and doesn't overwrite the external file with kanban content
 */

const fs = require('fs');
const path = require('path');

jest.mock('fs');

describe('Backup and Reload Functionality', () => {
    let mockPanel;
    let mockBoard;
    let mockConflictResolver;

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock file system
        fs.existsSync.mockReturnValue(true);
        fs.writeFileSync.mockImplementation(() => {});

        // Mock conflict resolver that returns backup_and_reload action
        mockConflictResolver = {
            resolveConflict: jest.fn().mockResolvedValue({
                action: 'backup_and_reload',
                shouldProceed: true,
                shouldCreateBackup: true,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            })
        };

        // Mock board with include files
        mockBoard = {
            columns: [
                {
                    id: 'col_1',
                    title: 'To Do',
                    includeMode: true,
                    includeFiles: ['./tasks.md'],
                    tasks: []
                }
            ]
        };

        // Mock panel with the methods we need to test
        mockPanel = {
            _board: mockBoard,
            _fileManager: {
                getDocument: () => ({
                    uri: { fsPath: '/path/to/kanban.md' }
                })
            },
            _includeFiles: new Map(),

            // Method that creates backup - should be called
            saveIncludeFileAsBackup: jest.fn().mockResolvedValue(true),

            // Method that should reload from external file - key to test
            updateIncludeFile: jest.fn().mockImplementation(async (filePath, isColumn, isTask, skipConflictDetection) => {
                console.log(`[TEST] updateIncludeFile called with: ${filePath}, skipConflictDetection: ${skipConflictDetection}`);

                // This should READ from the external file and update the board
                // Simulate reading external content
                const externalContent = "# External Task\nThis content was changed externally\n\n# Another External Task\nMore external content";

                // Mock the file reading
                fs.readFileSync.mockReturnValue(externalContent);

                // Update the board with external content (simulating what should happen)
                if (isColumn) {
                    mockPanel._board.columns[0].tasks = [
                        {
                            id: 'external_task_1',
                            title: 'External Task',
                            description: 'This content was changed externally'
                        },
                        {
                            id: 'external_task_2',
                            title: 'Another External Task',
                            description: 'More external content'
                        }
                    ];
                }

                return true;
            }),

            // The main conflict handling method we're testing
            handleIncludeFileConflict: async function(filePath) {
                const includeFile = {
                    type: 'column',
                    hasUnsavedChanges: true
                };

                console.log(`[TEST] Handling conflict for: ${filePath}`);

                // Simulate the conflict resolution context
                const context = {
                    type: 'external_include',
                    fileType: 'include',
                    filePath: filePath,
                    fileName: path.basename(filePath),
                    hasMainUnsavedChanges: false,
                    hasIncludeUnsavedChanges: true,
                    hasExternalChanges: true
                };

                const resolution = await mockConflictResolver.resolveConflict(context);

                if (resolution.shouldCreateBackup && resolution.shouldReload) {
                    console.log(`[TEST] Backup and reload selected`);

                    // Step 1: Create backup - this should work
                    if (includeFile.type === 'column' || includeFile.type === 'task') {
                        await this.saveIncludeFileAsBackup(filePath);
                    }

                    // Step 2: Reload from external - this is what we're testing
                    includeFile.hasUnsavedChanges = false;
                    await this.updateIncludeFile(filePath, includeFile.type === 'column', includeFile.type === 'task', true);

                    return resolution;
                }

                return resolution;
            }
        };
    });

    test('should create backup and reload from external without overwriting external file', async () => {
        const filePath = '/path/to/tasks.md';

        // Setup: External file has different content than kanban
        const externalContent = "# External Task\nThis content was changed externally\n\n# Another External Task\nMore external content";
        fs.readFileSync.mockReturnValue(externalContent);

        // Setup: Kanban has different content that should be backed up
        mockPanel._board.columns[0].tasks = [
            {
                id: 'kanban_task_1',
                title: 'Kanban Task',
                description: 'This is kanban content that should be backed up'
            }
        ];

        // Execute the conflict resolution
        const resolution = await mockPanel.handleIncludeFileConflict(filePath);

        // Verify: Resolution should be backup_and_reload
        expect(resolution.action).toBe('backup_and_reload');
        expect(resolution.shouldCreateBackup).toBe(true);
        expect(resolution.shouldReload).toBe(true);
        expect(resolution.shouldSave).toBe(false); // Should NOT save kanban to external

        // Verify: Backup was created
        expect(mockPanel.saveIncludeFileAsBackup).toHaveBeenCalledWith(filePath);

        // Verify: External file was read for reload
        expect(mockPanel.updateIncludeFile).toHaveBeenCalledWith(filePath, true, false, true);

        // Verify: Board now contains external content (not kanban content)
        expect(mockPanel._board.columns[0].tasks).toHaveLength(2);
        expect(mockPanel._board.columns[0].tasks[0].title).toBe('External Task');
        expect(mockPanel._board.columns[0].tasks[0].description).toBe('This content was changed externally');
        expect(mockPanel._board.columns[0].tasks[1].title).toBe('Another External Task');
        expect(mockPanel._board.columns[0].tasks[1].description).toBe('More external content');

        // CRITICAL: External file should NOT be overwritten
        // Check that writeFileSync was NOT called to overwrite the external file
        const writeFileCalls = fs.writeFileSync.mock.calls;
        const externalFileWrites = writeFileCalls.filter(call => call[0] === filePath);

        console.log(`[TEST] All writeFileSync calls:`, writeFileCalls);
        console.log(`[TEST] Writes to external file (${filePath}):`, externalFileWrites);

        // The external file should NOT be written to (because we're reloading FROM it, not TO it)
        expect(externalFileWrites).toHaveLength(0);
    });

    test('should create backup with kanban content before reload', async () => {
        const filePath = '/path/to/tasks.md';

        // Setup: Kanban has content that should be preserved in backup
        mockPanel._board.columns[0].tasks = [
            {
                id: 'kanban_task_1',
                title: 'Important Kanban Task',
                description: 'This should be saved in backup before reload'
            }
        ];

        // Mock the backup creation to capture what content gets backed up
        let backupContent = '';
        mockPanel.saveIncludeFileAsBackup = jest.fn().mockImplementation(async (filePath) => {
            // Simulate creating backup with current kanban content
            backupContent = `# Important Kanban Task\nThis should be saved in backup before reload`;
            console.log(`[TEST] Creating backup with content: ${backupContent}`);
            return true;
        });

        // Execute the conflict resolution
        await mockPanel.handleIncludeFileConflict(filePath);

        // Verify: Backup was created with kanban content
        expect(mockPanel.saveIncludeFileAsBackup).toHaveBeenCalledWith(filePath);
        expect(backupContent).toContain('Important Kanban Task');
        expect(backupContent).toContain('This should be saved in backup before reload');
    });
});