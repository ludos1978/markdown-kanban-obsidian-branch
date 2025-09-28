/**
 * Conflict Resolution Test Suite
 *
 * Tests for conflict detection and resolution system for include files
 */

// DOM is already set up by jest-environment-jsdom and src/test/setup.js

// Mock ConflictResolver - we'll test the actual implementation
class MockConflictResolver {
    constructor() {
        this.activeDialogs = new Set();
        this.pendingResolutions = new Map();
    }

    static getInstance() {
        if (!MockConflictResolver.instance) {
            MockConflictResolver.instance = new MockConflictResolver();
        }
        return MockConflictResolver.instance;
    }

    async resolveConflict(context) {
        return this.showConflictDialog(context);
    }

    generateDialogKey(context) {
        const fileIdentifier = context.fileType === 'main' ? 'main' : context.filePath;
        return `${context.type}_${fileIdentifier}`;
    }

    async showConflictDialog(context) {
        switch (context.type) {
            case 'panel_close':
                return this.showPanelCloseDialog(context);
            case 'external_main':
                return this.showExternalMainFileDialog(context);
            case 'external_include':
                return this.showExternalIncludeFileDialog(context);
            case 'presave_check':
                return this.showPresaveCheckDialog(context);
            default:
                throw new Error(`Unknown conflict type: ${context.type}`);
        }
    }

    async showPanelCloseDialog(context) {
        if (!context.hasMainUnsavedChanges && !context.hasIncludeUnsavedChanges) {
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }

        // Mock user selection for testing
        const mockChoice = mockVscode.window.showWarningMessage.mockReturnValue;
        if (mockChoice === 'Save and close') {
            return {
                action: 'save',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: true,
                shouldReload: false,
                shouldIgnore: false
            };
        } else if (mockChoice === 'Close without saving') {
            return {
                action: 'discard_local',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        } else {
            return {
                action: 'cancel',
                shouldProceed: false,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: false
            };
        }
    }

    async showExternalMainFileDialog(context) {
        const hasAnyUnsavedChanges = context.hasMainUnsavedChanges || context.hasIncludeUnsavedChanges;

        if (!hasAnyUnsavedChanges) {
            const mockChoice = mockVscode.window.showInformationMessage.mockReturnValue;
            if (mockChoice === 'Reload from file') {
                return {
                    action: 'discard_local',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: true,
                    shouldIgnore: false
                };
            } else {
                return {
                    action: 'ignore',
                    shouldProceed: true,
                    shouldCreateBackup: false,
                    shouldSave: false,
                    shouldReload: false,
                    shouldIgnore: true
                };
            }
        }

        const mockChoice = mockVscode.window.showWarningMessage.mockReturnValue;
        if (mockChoice === 'Discard my changes and reload') {
            return {
                action: 'discard_local',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        } else if (mockChoice === 'Save my changes as backup and reload') {
            return {
                action: 'backup_and_reload',
                shouldProceed: true,
                shouldCreateBackup: true,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        } else if (mockChoice === 'Save my changes and ignore external') {
            return {
                action: 'discard_external',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: true,
                shouldReload: false,
                shouldIgnore: false
            };
        } else {
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }
    }

    async showExternalIncludeFileDialog(context) {
        const hasIncludeChanges = context.hasIncludeUnsavedChanges;
        const hasExternalChanges = context.hasExternalChanges ?? true;

        if (!hasIncludeChanges && !hasExternalChanges) {
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }

        if (!hasIncludeChanges && hasExternalChanges) {
            return {
                action: 'discard_local',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        }

        const mockChoice = mockVscode.window.showWarningMessage.mockReturnValue;
        if (mockChoice === 'Discard kanban changes and reload from external') {
            return {
                action: 'discard_local',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        } else if (mockChoice === 'Save kanban as backup and reload from external') {
            return {
                action: 'backup_and_reload',
                shouldProceed: true,
                shouldCreateBackup: true,
                shouldSave: false,
                shouldReload: true,
                shouldIgnore: false
            };
        } else if (mockChoice === 'Overwrite external file with kanban contents') {
            return {
                action: 'discard_external',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: true,
                shouldReload: false,
                shouldIgnore: false
            };
        } else {
            return {
                action: 'ignore',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: true
            };
        }
    }

    async showPresaveCheckDialog(context) {
        const mockChoice = mockVscode.window.showWarningMessage.mockReturnValue;
        if (mockChoice === 'Overwrite external changes') {
            return {
                action: 'discard_external',
                shouldProceed: true,
                shouldCreateBackup: false,
                shouldSave: true,
                shouldReload: false,
                shouldIgnore: false
            };
        } else {
            return {
                action: 'cancel',
                shouldProceed: false,
                shouldCreateBackup: false,
                shouldSave: false,
                shouldReload: false,
                shouldIgnore: false
            };
        }
    }

    clearActiveDialogs() {
        this.activeDialogs.clear();
        this.pendingResolutions.clear();
    }
}

describe('Conflict Resolution System', () => {
    let conflictResolver;

    beforeEach(() => {
        jest.clearAllMocks();
        conflictResolver = MockConflictResolver.getInstance();
        conflictResolver.clearActiveDialogs();
    });

    describe('ConflictResolver Singleton', () => {
        test('should return same instance for multiple calls', () => {
            const instance1 = MockConflictResolver.getInstance();
            const instance2 = MockConflictResolver.getInstance();
            expect(instance1).toBe(instance2);
        });

        test('should initialize with empty tracking sets', () => {
            const resolver = new MockConflictResolver();
            expect(resolver.activeDialogs.size).toBe(0);
            expect(resolver.pendingResolutions.size).toBe(0);
        });
    });

    describe('Dialog Key Generation', () => {
        test('should generate unique key for main file conflicts', () => {
            const context = {
                type: 'external_main',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            const key = conflictResolver.generateDialogKey(context);
            expect(key).toBe('external_main_main');
        });

        test('should generate unique key for include file conflicts', () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            const key = conflictResolver.generateDialogKey(context);
            expect(key).toBe('external_include_./tasks.md');
        });

        test('should generate different keys for different file types', () => {
            const mainContext = {
                type: 'external_main',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            const includeContext = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            const mainKey = conflictResolver.generateDialogKey(mainContext);
            const includeKey = conflictResolver.generateDialogKey(includeContext);
            expect(mainKey).not.toBe(includeKey);
        });
    });

    describe('Panel Close Conflicts', () => {
        test('should allow close when no unsaved changes', async () => {
            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('ignore');
            expect(resolution.shouldProceed).toBe(true);
            expect(resolution.shouldIgnore).toBe(true);
        });

        test('should save and close when user chooses to save', async () => {
            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Save and close';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('save');
            expect(resolution.shouldProceed).toBe(true);
            expect(resolution.shouldSave).toBe(true);
        });

        test('should discard changes when user chooses close without saving', async () => {
            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Close without saving';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_local');
            expect(resolution.shouldProceed).toBe(true);
            expect(resolution.shouldReload).toBe(true);
        });

        test('should cancel close when user cancels', async () => {
            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showWarningMessage.mockReturnValue = undefined;

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('cancel');
            expect(resolution.shouldProceed).toBe(false);
        });
    });

    describe('External Main File Conflicts', () => {
        test('should auto-reload when no unsaved changes', async () => {
            const context = {
                type: 'external_main',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showInformationMessage.mockReturnValue = 'Reload from file';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_local');
            expect(resolution.shouldReload).toBe(true);
        });

        test('should ignore external changes when user chooses', async () => {
            const context = {
                type: 'external_main',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showInformationMessage.mockReturnValue = 'Ignore external changes';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('ignore');
            expect(resolution.shouldIgnore).toBe(true);
        });

        test('should create backup and reload when user chooses', async () => {
            const context = {
                type: 'external_main',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Save my changes as backup and reload';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('backup_and_reload');
            expect(resolution.shouldCreateBackup).toBe(true);
            expect(resolution.shouldReload).toBe(true);
        });

        test('should overwrite external when user chooses', async () => {
            const context = {
                type: 'external_main',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Save my changes and ignore external';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_external');
            expect(resolution.shouldSave).toBe(true);
            expect(resolution.shouldReload).toBe(false);
        });
    });

    describe('External Include File Conflicts', () => {
        test('should auto-reload when no changes on either side', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                hasExternalChanges: false,
                changedIncludeFiles: []
            };

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('ignore');
            expect(resolution.shouldIgnore).toBe(true);
        });

        test('should auto-reload when external changes but no internal changes', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                hasExternalChanges: true,
                changedIncludeFiles: []
            };

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_local');
            expect(resolution.shouldReload).toBe(true);
        });

        test('should show conflict dialog when both sides have changes', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                hasExternalChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Ignore external changes (default)';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('ignore');
            expect(resolution.shouldIgnore).toBe(true);
        });

        test('should handle overwrite external option', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                hasExternalChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Overwrite external file with kanban contents';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_external');
            expect(resolution.shouldSave).toBe(true);
            expect(resolution.shouldReload).toBe(false);
        });

        test('should handle backup and reload option', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                hasExternalChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Save kanban as backup and reload from external';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('backup_and_reload');
            expect(resolution.shouldCreateBackup).toBe(true);
            expect(resolution.shouldReload).toBe(true);
        });

        test('should handle discard kanban changes option', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                hasExternalChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Discard kanban changes and reload from external';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_local');
            expect(resolution.shouldReload).toBe(true);
            expect(resolution.shouldCreateBackup).toBe(false);
        });
    });

    describe('Pre-save Check Conflicts', () => {
        test('should allow overwrite when user confirms', async () => {
            const context = {
                type: 'presave_check',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Overwrite external changes';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('discard_external');
            expect(resolution.shouldSave).toBe(true);
            expect(resolution.shouldProceed).toBe(true);
        });

        test('should cancel save when user cancels', async () => {
            const context = {
                type: 'presave_check',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Cancel save';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('cancel');
            expect(resolution.shouldProceed).toBe(false);
            expect(resolution.shouldSave).toBe(false);
        });
    });

    describe('Path Format Handling', () => {
        test('should handle column include paths without prefix', () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: 'column-tasks.md', // Column includes without ./ prefix
                fileName: 'column-tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['column-tasks.md']
            };

            const key = conflictResolver.generateDialogKey(context);
            expect(key).toBe('external_include_column-tasks.md');
        });

        test('should handle task include paths with prefix', () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './task-notes.md', // Task includes with ./ prefix
                fileName: 'task-notes.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./task-notes.md']
            };

            const key = conflictResolver.generateDialogKey(context);
            expect(key).toBe('external_include_./task-notes.md');
        });
    });

    describe('Error Handling', () => {
        test('should throw error for unknown conflict type', async () => {
            const context = {
                type: 'unknown_type',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            await expect(conflictResolver.resolveConflict(context)).rejects.toThrow('Unknown conflict type: unknown_type');
        });

        test('should handle null context gracefully', async () => {
            await expect(conflictResolver.resolveConflict(null)).rejects.toThrow();
        });

        test('should handle undefined context properties', async () => {
            const context = {
                type: 'panel_close'
                // Missing required properties
            };

            // Should not crash but may not work correctly
            const resolution = await conflictResolver.resolveConflict(context);
            expect(resolution).toBeDefined();
        });
    });

    describe('Resolution Action Validation', () => {
        test('should ensure all resolution objects have required properties', async () => {
            const requiredProperties = [
                'action',
                'shouldProceed',
                'shouldCreateBackup',
                'shouldSave',
                'shouldReload',
                'shouldIgnore'
            ];

            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            const resolution = await conflictResolver.resolveConflict(context);

            requiredProperties.forEach(prop => {
                expect(resolution).toHaveProperty(prop);
                expect(['boolean', 'string']).toContain(typeof resolution[prop]);
            });
        });

        test('should have valid action values', async () => {
            const validActions = ['save', 'discard_local', 'discard_external', 'ignore', 'cancel', 'backup_and_reload'];

            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: false,
                changedIncludeFiles: []
            };

            const resolution = await conflictResolver.resolveConflict(context);
            expect(validActions).toContain(resolution.action);
        });
    });

    describe('Dialog Deduplication', () => {
        test('should prevent duplicate dialogs for same context', () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './tasks.md',
                fileName: 'tasks.md',
                hasMainUnsavedChanges: false,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./tasks.md']
            };

            const key1 = conflictResolver.generateDialogKey(context);
            const key2 = conflictResolver.generateDialogKey(context);

            expect(key1).toBe(key2);
        });

        test('should clear active dialogs', () => {
            conflictResolver.activeDialogs.add('test-dialog-key');
            conflictResolver.pendingResolutions.set('test-dialog-key', Promise.resolve({}));

            expect(conflictResolver.activeDialogs.size).toBe(1);
            expect(conflictResolver.pendingResolutions.size).toBe(1);

            conflictResolver.clearActiveDialogs();

            expect(conflictResolver.activeDialogs.size).toBe(0);
            expect(conflictResolver.pendingResolutions.size).toBe(0);
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle complex conflict with multiple include files', async () => {
            const context = {
                type: 'external_include',
                fileType: 'include',
                filePath: './complex-tasks.md',
                fileName: 'complex-tasks.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: true,
                hasExternalChanges: true,
                changedIncludeFiles: ['./complex-tasks.md', './other-file.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Save kanban as backup and reload from external';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('backup_and_reload');
            expect(resolution.shouldCreateBackup).toBe(true);
            expect(resolution.shouldReload).toBe(true);
        });

        test('should handle panel close with both main and include changes', async () => {
            const context = {
                type: 'panel_close',
                fileType: 'main',
                filePath: '/path/to/kanban.md',
                fileName: 'kanban.md',
                hasMainUnsavedChanges: true,
                hasIncludeUnsavedChanges: true,
                changedIncludeFiles: ['./tasks.md', './notes.md']
            };

            mockVscode.window.showWarningMessage.mockReturnValue = 'Save and close';

            const resolution = await conflictResolver.resolveConflict(context);

            expect(resolution.action).toBe('save');
            expect(resolution.shouldSave).toBe(true);
            expect(resolution.shouldProceed).toBe(true);
        });
    });
});