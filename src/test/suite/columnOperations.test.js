/**
 * Column Operations Test Suite
 * 
 * Tests for creating, moving, deleting, and editing columns
 */

// Mock DOM environment for testing
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
global.navigator = dom.window.navigator;

// Mock VS Code API
global.vscode = {
    postMessage: jest.fn()
};

// Mock console for testing
global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('Column Operations', () => {
    let mockBoard;
    let boardRenderer;
    let menuOperations;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();
        
        // Mock board data
        mockBoard = {
            columns: [
                {
                    id: 'col_1',
                    title: 'To Do',
                    tasks: [
                        { id: 'task_1', title: 'Test Task 1', description: 'Description 1' },
                        { id: 'task_2', title: 'Test Task 2', description: 'Description 2' }
                    ]
                },
                {
                    id: 'col_2', 
                    title: 'In Progress',
                    tasks: [
                        { id: 'task_3', title: 'Test Task 3', description: 'Description 3' }
                    ]
                },
                {
                    id: 'col_3',
                    title: 'Done',
                    tasks: []
                }
            ]
        };

        // Set up global state
        global.currentBoard = mockBoard;
        global.window.currentBoard = mockBoard;
        global.window.collapsedColumns = new Set();
        global.window.collapsedTasks = new Set();
        global.window.columnFoldStates = new Map();
        global.window.globalColumnFoldState = 'fold-mixed';
        
        // Mock functions that would be loaded from actual files
        require('../../html/boardRenderer.js');
        require('../../html/menuOperations.js');
    });

    describe('Column Creation', () => {
        test('should create column element with correct structure', () => {
            const column = mockBoard.columns[0];
            const columnHtml = createColumnElement(column, 0);
            
            expect(columnHtml).toContain('kanban-full-height-column');
            expect(columnHtml).toContain('data-column-id="col_1"');
            expect(columnHtml).toContain('To Do');
            expect(columnHtml).toContain('task-item');
        });

        test('should create empty column correctly', () => {
            const emptyColumn = mockBoard.columns[2];
            const columnHtml = createColumnElement(emptyColumn, 2);
            
            expect(columnHtml).toContain('kanban-full-height-column');
            expect(columnHtml).toContain('data-column-id="col_3"');
            expect(columnHtml).toContain('Done');
            expect(columnHtml).not.toContain('task-item');
        });

        test('should handle column with tags', () => {
            const taggedColumn = {
                id: 'col_tagged',
                title: 'Tagged Column #urgent #feature',
                tasks: []
            };
            
            const columnHtml = createColumnElement(taggedColumn, 0);
            
            expect(columnHtml).toContain('Tagged Column #urgent #feature');
            expect(columnHtml).toContain('data-column-tag="urgent"');
        });
    });

    describe('Column Editing', () => {
        test('should start column title editing', () => {
            // Set up DOM
            document.body.innerHTML = `
                <div class="kanban-full-height-column" data-column-id="col_1">
                    <div class="column-title">To Do</div>
                    <input class="column-title-edit" value="To Do" style="display: none;">
                </div>
            `;
            
            editColumnTitle('col_1');
            
            const editElement = document.querySelector('.column-title-edit');
            const displayElement = document.querySelector('.column-title');
            
            expect(editElement.style.display).toBe('block');
            expect(displayElement.style.display).toBe('none');
        });

        test('should save column title changes', () => {
            // Mock pending changes
            global.window.pendingColumnChanges = new Map();
            
            toggleColumnTag('col_1', 'urgent', null);
            
            expect(window.pendingColumnChanges.has('col_1')).toBe(true);
            expect(window.pendingColumnChanges.get('col_1').title).toContain('#urgent');
        });
    });

    describe('Column Folding', () => {
        test('should toggle column collapse state', () => {
            toggleColumnCollapse('col_1');
            
            expect(window.collapsedColumns.has('col_1')).toBe(true);
            
            toggleColumnCollapse('col_1');
            
            expect(window.collapsedColumns.has('col_1')).toBe(false);
        });

        test('should calculate global fold state correctly', () => {
            // All columns expanded
            window.collapsedColumns.clear();
            let state = getGlobalColumnFoldState();
            expect(state).toBe('fold-expanded');
            
            // All columns collapsed
            window.collapsedColumns.add('col_1');
            window.collapsedColumns.add('col_2');
            window.collapsedColumns.add('col_3');
            state = getGlobalColumnFoldState();
            expect(state).toBe('fold-collapsed');
        });

        test('should toggle all columns correctly', () => {
            window.collapsedColumns.clear();
            
            toggleAllColumns();
            
            expect(window.collapsedColumns.has('col_1')).toBe(true);
            expect(window.collapsedColumns.has('col_2')).toBe(true);
            expect(window.collapsedColumns.has('col_3')).toBe(true);
        });
    });

    describe('Column Movement', () => {
        test('should move column left', () => {
            moveColumnLeft('col_2');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveColumnWithRowUpdate',
                columnId: 'col_2',
                newPosition: 0,
                newRow: 1
            });
        });

        test('should move column right', () => {
            moveColumnRight('col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveColumnWithRowUpdate', 
                columnId: 'col_1',
                newPosition: 1,
                newRow: 1
            });
        });

        test('should not move first column left', () => {
            const messageCount = vscode.postMessage.mock.calls.length;
            moveColumnLeft('col_1');
            
            expect(vscode.postMessage.mock.calls.length).toBe(messageCount);
        });

        test('should not move last column right', () => {
            const messageCount = vscode.postMessage.mock.calls.length;
            moveColumnRight('col_3');
            
            expect(vscode.postMessage.mock.calls.length).toBe(messageCount);
        });
    });

    describe('Column Menu Operations', () => {
        test('should generate column menu items', () => {
            const menuHtml = generateTagMenuItems('col_1', 'column');
            
            expect(menuHtml).toContain('donut-menu-item');
            expect(menuHtml).toContain('toggleColumnTag');
            expect(menuHtml).toContain('moveColumnLeft');
            expect(menuHtml).toContain('moveColumnRight');
        });

        test('should insert column before', () => {
            insertColumnBefore('col_2');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'insertColumnBefore',
                columnId: 'col_2',
                title: ''
            });
        });

        test('should insert column after', () => {
            insertColumnAfter('col_2');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'insertColumnAfter',
                columnId: 'col_2', 
                title: ''
            });
        });

        test('should copy column as markdown', () => {
            // Mock clipboard
            global.navigator.clipboard = {
                writeText: jest.fn().mockResolvedValue()
            };
            
            copyColumnAsMarkdown('col_1');
            
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                expect.stringContaining('## To Do')
            );
        });
    });

    describe('Column Validation', () => {
        test('should validate column structure', () => {
            const validColumn = mockBoard.columns[0];
            
            expect(validColumn).toHaveProperty('id');
            expect(validColumn).toHaveProperty('title');
            expect(validColumn).toHaveProperty('tasks');
            expect(Array.isArray(validColumn.tasks)).toBe(true);
        });

        test('should handle malformed column data', () => {
            const malformedColumn = {
                id: 'bad_col'
                // Missing title and tasks
            };
            
            expect(() => {
                createColumnElement(malformedColumn, 0);
            }).not.toThrow();
        });
    });
});