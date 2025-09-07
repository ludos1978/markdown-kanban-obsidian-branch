/**
 * Save Operations and State Management Test Suite
 * 
 * Tests for saving, state persistence, and data management
 */

const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test</title>
</head>
<body>
    <div id="board-container"></div>
    <div id="refresh-btn">
        <span class="refresh-icon">↻</span>
        <span class="refresh-text">Refresh</span>
    </div>
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

global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('Save Operations and State Management', () => {
    let mockBoard;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockBoard = {
            columns: [
                {
                    id: 'col_1',
                    title: 'To Do',
                    tasks: [
                        { id: 'task_1', title: 'Test Task 1', description: 'Description 1' },
                        { id: 'task_2', title: 'Test Task 2', description: 'Description 2' }
                    ]
                }
            ]
        };

        global.currentBoard = mockBoard;
        global.window.currentBoard = mockBoard;
        global.window.pendingColumnChanges = new Map();
        global.window.pendingTaskChanges = new Map();
        global.window._lastFlushedChanges = null;
        
        require('../../html/menuOperations.js');
        require('../../html/webview.js');
    });

    describe('Pending Changes Management', () => {
        test('should track column changes in pending state', () => {
            const change = { title: 'Updated Title', columnId: 'col_1' };
            window.pendingColumnChanges.set('col_1', change);
            
            expect(window.pendingColumnChanges.size).toBe(1);
            expect(window.pendingColumnChanges.get('col_1')).toEqual(change);
        });

        test('should track task changes in pending state', () => {
            const change = { 
                taskId: 'task_1', 
                columnId: 'col_1', 
                taskData: { title: 'Updated Task', description: 'New desc' }
            };
            window.pendingTaskChanges.set('task_1', change);
            
            expect(window.pendingTaskChanges.size).toBe(1);
            expect(window.pendingTaskChanges.get('task_1')).toEqual(change);
        });

        test('should accumulate multiple changes', () => {
            window.pendingColumnChanges.set('col_1', { title: 'Title 1', columnId: 'col_1' });
            window.pendingColumnChanges.set('col_2', { title: 'Title 2', columnId: 'col_2' });
            window.pendingTaskChanges.set('task_1', { 
                taskId: 'task_1', 
                columnId: 'col_1', 
                taskData: { title: 'Task 1' }
            });
            
            expect(window.pendingColumnChanges.size).toBe(2);
            expect(window.pendingTaskChanges.size).toBe(1);
        });
    });

    describe('Flush Operations', () => {
        test('should flush pending column changes', () => {
            window.pendingColumnChanges.set('col_1', { title: 'New Title', columnId: 'col_1' });
            
            flushPendingTagChanges();
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'editColumnTitle',
                columnId: 'col_1',
                title: 'New Title',
                _flushId: expect.any(Number)
            });
        });

        test('should flush pending task changes', () => {
            const taskData = { title: 'New Task Title', description: 'New Description' };
            window.pendingTaskChanges.set('task_1', { 
                taskId: 'task_1', 
                columnId: 'col_1', 
                taskData 
            });
            
            flushPendingTagChanges();
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'editTask',
                taskId: 'task_1',
                columnId: 'col_1',
                taskData,
                _flushId: expect.any(Number)
            });
        });

        test('should clear pending changes after flush', () => {
            window.pendingColumnChanges.set('col_1', { title: 'Title', columnId: 'col_1' });
            window.pendingTaskChanges.set('task_1', { 
                taskId: 'task_1', 
                columnId: 'col_1', 
                taskData: {}
            });
            
            flushPendingTagChanges();
            
            expect(window.pendingColumnChanges.size).toBe(0);
            expect(window.pendingTaskChanges.size).toBe(0);
        });

        test('should handle empty pending changes gracefully', () => {
            window.pendingColumnChanges.clear();
            window.pendingTaskChanges.clear();
            
            const messageCount = vscode.postMessage.mock.calls.length;
            flushPendingTagChanges();
            
            expect(vscode.postMessage.mock.calls.length).toBe(messageCount);
        });

        test('should store flushed changes for retry capability', () => {
            window.pendingColumnChanges.set('col_1', { title: 'Title', columnId: 'col_1' });
            
            flushPendingTagChanges();
            
            expect(window._lastFlushedChanges).toBeTruthy();
            expect(window._lastFlushedChanges.columns.size).toBe(1);
        });
    });

    describe('Apply Pending Changes Locally', () => {
        test('should apply column changes to local board without sending to backend', () => {
            window.pendingColumnChanges.set('col_1', { 
                title: 'Updated Column #urgent', 
                columnId: 'col_1' 
            });
            
            const messageCountBefore = vscode.postMessage.mock.calls.length;
            const result = applyPendingChangesLocally();
            
            // Should update local board
            expect(window.currentBoard.columns[0].title).toBe('Updated Column #urgent');
            
            // Should NOT send messages to VS Code
            expect(vscode.postMessage.mock.calls.length).toBe(messageCountBefore);
            
            // Should preserve pending changes
            expect(window.pendingColumnChanges.size).toBe(1);
            expect(result).toBe(1); // One change applied
        });

        test('should apply task changes to local board without clearing pending', () => {
            window.pendingTaskChanges.set('task_1', {
                taskId: 'task_1',
                columnId: 'col_1',
                taskData: {
                    title: 'Updated Task #bug',
                    description: 'New description'
                }
            });
            
            const result = applyPendingChangesLocally();
            
            // Should update local board
            const task = window.currentBoard.columns[0].tasks[0];
            expect(task.title).toBe('Updated Task #bug');
            expect(task.description).toBe('New description');
            
            // Should preserve pending changes
            expect(window.pendingTaskChanges.size).toBe(1);
            expect(result).toBe(2); // Title and description changes
        });

        test('should handle missing board gracefully', () => {
            window.currentBoard = null;
            window.pendingColumnChanges.set('col_1', { title: 'Test', columnId: 'col_1' });
            
            const result = applyPendingChangesLocally();
            
            expect(result).toBeUndefined();
            expect(window.pendingColumnChanges.size).toBe(1); // Still preserved
        });

        test('should skip changes if already applied', () => {
            window.currentBoard.columns[0].title = 'Already Updated';
            window.pendingColumnChanges.set('col_1', { 
                title: 'Already Updated', 
                columnId: 'col_1' 
            });
            
            const result = applyPendingChangesLocally();
            
            expect(result).toBe(0); // No changes needed
        });

        test('should apply multiple pending changes at once', () => {
            window.pendingColumnChanges.set('col_1', { 
                title: 'Column 1 #urgent', 
                columnId: 'col_1' 
            });
            window.pendingColumnChanges.set('col_2', { 
                title: 'Column 2 #feature', 
                columnId: 'col_2' 
            });
            window.pendingTaskChanges.set('task_1', {
                taskId: 'task_1',
                columnId: 'col_1',
                taskData: { title: 'Task Update' }
            });
            
            const result = applyPendingChangesLocally();
            
            expect(result).toBe(3); // Three changes applied
            expect(window.currentBoard.columns[0].title).toBe('Column 1 #urgent');
            expect(window.currentBoard.columns[1].title).toBe('Column 2 #feature');
            expect(window.currentBoard.columns[0].tasks[0].title).toBe('Task Update');
            
            // All pending changes preserved
            expect(window.pendingColumnChanges.size).toBe(2);
            expect(window.pendingTaskChanges.size).toBe(1);
        });

        test('should find and apply task changes even after task moves between columns', () => {
            // Setup: task has pending changes in col_1
            window.pendingTaskChanges.set('task_1', {
                taskId: 'task_1',
                columnId: 'col_1', // Original column
                taskData: { title: 'Task with #newtag' }
            });
            
            // Simulate: task was moved to col_2 (like after drag & drop)
            const task = window.currentBoard.columns[0].tasks[0];
            window.currentBoard.columns[0].tasks = []; // Remove from col_1
            window.currentBoard.columns[1].tasks.push(task); // Add to col_2
            
            // Apply pending changes
            const result = applyPendingChangesLocally();
            
            // Should find task in new location and apply changes
            expect(result).toBe(1);
            expect(window.currentBoard.columns[1].tasks[0].title).toBe('Task with #newtag');
            
            // Pending changes still preserved
            expect(window.pendingTaskChanges.size).toBe(1);
        });

        test('should warn when task cannot be found in any column', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            window.pendingTaskChanges.set('nonexistent_task', {
                taskId: 'nonexistent_task',
                columnId: 'col_1',
                taskData: { title: 'Missing Task' }
            });
            
            const result = applyPendingChangesLocally();
            
            expect(result).toBe(0);
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Could not find task nonexistent_task')
            );
            
            consoleSpy.mockRestore();
        });
    });

    describe('Refresh Button State Management', () => {
        test('should update refresh button to pending state', () => {
            updateRefreshButtonState('pending', 3);
            
            const refreshBtn = document.getElementById('refresh-btn');
            const refreshIcon = document.querySelector('.refresh-icon');
            const refreshText = document.querySelector('.refresh-text');
            
            expect(refreshBtn.classList.contains('pending')).toBe(true);
            expect(refreshIcon.textContent).toBe('3');
            expect(refreshText.textContent).toBe('Pending (3)');
        });

        test('should update refresh button to saved state', () => {
            updateRefreshButtonState('saved');
            
            const refreshBtn = document.getElementById('refresh-btn');
            const refreshIcon = document.querySelector('.refresh-icon');
            const refreshText = document.querySelector('.refresh-text');
            
            expect(refreshBtn.classList.contains('saved')).toBe(true);
            expect(refreshIcon.textContent).toBe('✓');
            expect(refreshText.textContent).toBe('Saved');
        });

        test('should update refresh button to error state', () => {
            updateRefreshButtonState('error');
            
            const refreshBtn = document.getElementById('refresh-btn');
            const refreshIcon = document.querySelector('.refresh-icon');
            
            expect(refreshBtn.classList.contains('error')).toBe(true);
            expect(refreshIcon.textContent).toBe('⚠');
        });

        test('should auto-reset saved state after timeout', (done) => {
            updateRefreshButtonState('saved');
            
            setTimeout(() => {
                const refreshBtn = document.getElementById('refresh-btn');
                const refreshIcon = document.querySelector('.refresh-icon');
                
                expect(refreshBtn.classList.contains('saved')).toBe(false);
                expect(refreshIcon.textContent).toBe('↻');
                done();
            }, 2100);
        });
    });

    describe('Manual Refresh Operations', () => {
        test('should flush changes on manual refresh', () => {
            window.pendingColumnChanges.set('col_1', { title: 'Title', columnId: 'col_1' });
            
            manualRefresh();
            
            expect(window.pendingColumnChanges.size).toBe(0);
            expect(vscode.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'editColumnTitle',
                    columnId: 'col_1'
                })
            );
        });

        test('should send refresh request to backend', () => {
            manualRefresh();
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'refreshBoard'
            });
        });

        test('should handle refresh with no pending changes', () => {
            window.pendingColumnChanges.clear();
            window.pendingTaskChanges.clear();
            
            const messageCount = vscode.postMessage.mock.calls.length;
            manualRefresh();
            
            // Should still send refresh request
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'refreshBoard'
            });
        });
    });

    describe('Error Handling', () => {
        test('should handle save errors gracefully', () => {
            const errorMessage = 'Failed to save document';
            
            handleSaveError(errorMessage);
            
            expect(console.error).toHaveBeenCalledWith(
                expect.stringContaining('Save error'),
                expect.stringContaining(errorMessage)
            );
        });

        test('should update UI on save error', () => {
            handleSaveError('Test error');
            
            const refreshBtn = document.getElementById('refresh-btn');
            expect(refreshBtn.classList.contains('error')).toBe(true);
        });

        test('should retry failed changes', () => {
            // Simulate failed changes
            window._lastFlushedChanges = {
                columns: new Map([['col_1', { title: 'Title', columnId: 'col_1' }]]),
                tasks: new Map()
            };
            
            retryLastFlushedChanges();
            
            expect(window.pendingColumnChanges.size).toBe(1);
            expect(vscode.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'editColumnTitle'
                })
            );
        });
    });

    describe('Document State Persistence', () => {
        test('should save current folding state', () => {
            window.collapsedColumns = new Set(['col_1']);
            window.collapsedTasks = new Set(['task_1']);
            
            saveCurrentFoldingState();
            
            expect(vscode.setState).toHaveBeenCalledWith(
                expect.objectContaining({
                    foldingStates: expect.any(Object)
                })
            );
        });

        test('should restore folding state', () => {
            const mockState = {
                foldingStates: {
                    'test-uri': {
                        collapsedColumns: ['col_1'],
                        collapsedTasks: ['task_1']
                    }
                }
            };
            
            vscode.getState.mockReturnValue(mockState);
            global.currentDocumentUri = 'test-uri';
            
            restoreFoldingState();
            
            expect(window.collapsedColumns.has('col_1')).toBe(true);
            expect(window.collapsedTasks.has('task_1')).toBe(true);
        });

        test('should update document URI', () => {
            const newUri = 'new-document-uri';
            
            updateDocumentUri(newUri);
            
            expect(global.currentDocumentUri).toBe(newUri);
        });

        test('should apply default folding to new document', () => {
            window.collapsedColumns = new Set(['col_1']);
            
            applyDefaultFoldingToNewDocument();
            
            expect(window.collapsedColumns.size).toBe(0);
        });
    });

    describe('Board State Validation', () => {
        test('should validate board structure', () => {
            const validBoard = {
                columns: [
                    {
                        id: 'col_1',
                        title: 'Column',
                        tasks: []
                    }
                ]
            };
            
            expect(validBoard).toHaveProperty('columns');
            expect(Array.isArray(validBoard.columns)).toBe(true);
            expect(validBoard.columns[0]).toHaveProperty('id');
            expect(validBoard.columns[0]).toHaveProperty('title');
            expect(validBoard.columns[0]).toHaveProperty('tasks');
        });

        test('should handle corrupted board data', () => {
            const corruptedBoard = {
                columns: null
            };
            
            global.currentBoard = corruptedBoard;
            
            expect(() => {
                renderBoard();
            }).not.toThrow();
        });

        test('should detect editing state correctly', () => {
            // Mock task editor
            global.window.taskEditor = {
                currentEditor: null
            };
            
            expect(isCurrentlyEditing()).toBe(false);
            
            global.window.taskEditor.currentEditor = { type: 'task-title' };
            expect(isCurrentlyEditing()).toBe(true);
        });
    });

    describe('Data Integrity', () => {
        test('should maintain data consistency during operations', () => {
            const originalTaskCount = mockBoard.columns[0].tasks.length;
            
            // Simulate tag operation that shouldn't change task count
            toggleTaskTag('task_1', 'col_1', 'urgent', null);
            
            expect(mockBoard.columns[0].tasks.length).toBe(originalTaskCount);
        });

        test('should preserve task order during modifications', () => {
            const originalOrder = mockBoard.columns[0].tasks.map(t => t.id);
            
            // Simulate title edit
            toggleTaskTag('task_1', 'col_1', 'urgent', null);
            
            const newOrder = mockBoard.columns[0].tasks.map(t => t.id);
            expect(newOrder).toEqual(originalOrder);
        });

        test('should handle concurrent modifications safely', () => {
            // Simulate multiple rapid changes
            toggleColumnTag('col_1', 'urgent', null);
            toggleTaskTag('task_1', 'col_1', 'feature', null);
            toggleTaskTag('task_2', 'col_1', 'bug', null);
            
            expect(window.pendingColumnChanges.size).toBe(1);
            expect(window.pendingTaskChanges.size).toBe(2);
        });
    });

    describe('Performance and Memory Management', () => {
        test('should clean up old state references', () => {
            // Fill with old data
            for (let i = 0; i < 100; i++) {
                window.pendingTaskChanges.set(`task_${i}`, { taskId: `task_${i}` });
            }
            
            flushPendingTagChanges();
            
            expect(window.pendingTaskChanges.size).toBe(0);
        });

        test('should limit retry data size', () => {
            // Large change set
            for (let i = 0; i < 50; i++) {
                window.pendingColumnChanges.set(`col_${i}`, { columnId: `col_${i}` });
            }
            
            flushPendingTagChanges();
            
            expect(window._lastFlushedChanges.columns.size).toBeLessThanOrEqual(50);
        });
    });
});