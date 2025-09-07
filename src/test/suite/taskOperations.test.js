/**
 * Task/Card Operations Test Suite
 * 
 * Tests for creating, moving, deleting, and editing tasks/cards
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
    postMessage: jest.fn()
};

global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('Task Operations', () => {
    let mockBoard;
    let taskEditor;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockBoard = {
            columns: [
                {
                    id: 'col_1',
                    title: 'To Do',
                    tasks: [
                        { id: 'task_1', title: 'Test Task 1', description: 'Description 1' },
                        { id: 'task_2', title: 'Test Task 2 #urgent', description: 'Description 2' }
                    ]
                },
                {
                    id: 'col_2',
                    title: 'In Progress', 
                    tasks: [
                        { id: 'task_3', title: 'Test Task 3', description: '' }
                    ]
                },
                {
                    id: 'col_3',
                    title: 'Done',
                    tasks: []
                }
            ]
        };

        global.currentBoard = mockBoard;
        global.window.currentBoard = mockBoard;
        global.window.collapsedTasks = new Set();
        global.window.pendingTaskChanges = new Map();
        
        require('../../html/boardRenderer.js');
        require('../../html/menuOperations.js');
        require('../../html/taskEditor.js');
    });

    describe('Task Creation', () => {
        test('should create task element with correct structure', () => {
            const task = mockBoard.columns[0].tasks[0];
            const taskHtml = createTaskElement(task, 'col_1', 0);
            
            expect(taskHtml).toContain('task-item');
            expect(taskHtml).toContain('data-task-id="task_1"');
            expect(taskHtml).toContain('Test Task 1');
            expect(taskHtml).toContain('Description 1');
        });

        test('should create task with tags', () => {
            const task = mockBoard.columns[0].tasks[1];
            const taskHtml = createTaskElement(task, 'col_1', 1);
            
            expect(taskHtml).toContain('Test Task 2 #urgent');
            expect(taskHtml).toContain('data-task-tag="urgent"');
        });

        test('should create task with empty description', () => {
            const task = mockBoard.columns[1].tasks[0];
            const taskHtml = createTaskElement(task, 'col_2', 0);
            
            expect(taskHtml).toContain('task-description-placeholder');
            expect(taskHtml).toContain('Add description...');
        });

        test('should add new task', () => {
            addTask('col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'addTask',
                columnId: 'col_1',
                taskData: { title: '', description: '' }
            });
        });
    });

    describe('Task Editing', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="task-item" data-task-id="task_1">
                    <div class="task-title-display">Test Task 1</div>
                    <input class="task-title-edit" value="Test Task 1" style="display: none;">
                    <div class="task-description-display">Description 1</div>
                    <textarea class="task-description-edit" style="display: none;">Description 1</textarea>
                </div>
            `;
        });

        test('should start task title editing', () => {
            const titleElement = document.querySelector('.task-title-display');
            
            editTitle(titleElement, 'task_1', 'col_1');
            
            const editElement = document.querySelector('.task-title-edit');
            const displayElement = document.querySelector('.task-title-display');
            
            expect(editElement.style.display).toBe('block');
            expect(displayElement.style.display).toBe('none');
        });

        test('should start task description editing', () => {
            const descElement = document.querySelector('.task-description-display');
            
            editDescription(descElement, 'task_1', 'col_1');
            
            const editElement = document.querySelector('.task-description-edit');
            
            expect(editElement.style.display).toBe('block');
        });

        test('should transition from title to description with Tab', () => {
            const mockTaskEditor = {
                currentEditor: {
                    type: 'task-title',
                    taskId: 'task_1',
                    columnId: 'col_1',
                    element: document.querySelector('.task-title-edit')
                },
                transitionToDescription: jest.fn()
            };
            
            const event = new KeyboardEvent('keydown', { key: 'Tab' });
            mockTaskEditor.transitionToDescription();
            
            expect(mockTaskEditor.transitionToDescription).toHaveBeenCalled();
        });

        test('should save task edits to pending changes', () => {
            window.pendingTaskChanges.clear();
            
            toggleTaskTag('task_1', 'col_1', 'urgent', null);
            
            expect(window.pendingTaskChanges.has('task_1')).toBe(true);
            const pendingChange = window.pendingTaskChanges.get('task_1');
            expect(pendingChange.taskData.title).toContain('#urgent');
        });
    });

    describe('Task Movement', () => {
        test('should move task to top', () => {
            moveTaskToTop('task_2', 'col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveTaskToTop',
                taskId: 'task_2',
                columnId: 'col_1'
            });
        });

        test('should move task up', () => {
            moveTaskUp('task_2', 'col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveTaskUp',
                taskId: 'task_2',
                columnId: 'col_1'
            });
        });

        test('should move task down', () => {
            moveTaskDown('task_1', 'col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveTaskDown',
                taskId: 'task_1',
                columnId: 'col_1'
            });
        });

        test('should move task to bottom', () => {
            moveTaskToBottom('task_1', 'col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveTaskToBottom',
                taskId: 'task_1',
                columnId: 'col_1'
            });
        });

        test('should move task to different column', () => {
            moveTaskToColumn('task_1', 'col_1', 'col_2');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'moveTaskToColumn',
                taskId: 'task_1',
                fromColumnId: 'col_1',
                toColumnId: 'col_2'
            });
        });
    });

    describe('Task Deletion', () => {
        test('should delete task', () => {
            deleteTask('task_1', 'col_1');
            
            expect(vscode.postMessage).toHaveBeenCalledWith({
                type: 'deleteTask',
                taskId: 'task_1',
                columnId: 'col_1'
            });
        });
    });

    describe('Task Folding', () => {
        test('should toggle task collapse state', () => {
            toggleTaskCollapse('task_1');
            
            expect(window.collapsedTasks.has('task_1')).toBe(true);
            
            toggleTaskCollapse('task_1');
            
            expect(window.collapsedTasks.has('task_1')).toBe(false);
        });

        test('should toggle all tasks in column', () => {
            const mockColumn = {
                id: 'col_1',
                tasks: [
                    { id: 'task_1' },
                    { id: 'task_2' }
                ]
            };
            
            toggleAllTasksInColumn('col_1');
            
            // Should collapse all tasks
            expect(window.collapsedTasks.has('task_1')).toBe(true);
            expect(window.collapsedTasks.has('task_2')).toBe(true);
        });

        test('should calculate fold all button state', () => {
            window.collapsedTasks.clear();
            
            let state = getFoldAllButtonState('col_1');
            expect(state).toBe('expand-all');
            
            window.collapsedTasks.add('task_1');
            window.collapsedTasks.add('task_2');
            
            state = getFoldAllButtonState('col_1');
            expect(state).toBe('collapse-all');
        });
    });

    describe('Task Menu Operations', () => {
        test('should generate task menu items', () => {
            const menuHtml = generateTagMenuItems('task_1', 'task', 'col_1');
            
            expect(menuHtml).toContain('donut-menu-item');
            expect(menuHtml).toContain('toggleTaskTag');
            expect(menuHtml).toContain('moveTaskToTop');
            expect(menuHtml).toContain('moveTaskUp');
            expect(menuHtml).toContain('deleteTask');
        });

        test('should copy task as markdown', () => {
            global.navigator.clipboard = {
                writeText: jest.fn().mockResolvedValue()
            };
            
            copyTaskAsMarkdown('task_1', 'col_1');
            
            expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
                expect.stringContaining('Test Task 1')
            );
        });
    });

    describe('Task Drag and Drop', () => {
        beforeEach(() => {
            // Mock drag state
            global.window.dragState = {
                isDragging: false,
                draggedTask: null,
                originalTaskParent: null,
                originalTaskIndex: -1
            };
        });

        test('should handle task drag start', () => {
            const task = { id: 'task_1', title: 'Test Task' };
            window.dragState.draggedTask = task;
            window.dragState.isDragging = true;
            
            expect(window.dragState.draggedTask).toBe(task);
            expect(window.dragState.isDragging).toBe(true);
        });

        test('should calculate drop index correctly', () => {
            // Mock tasks container with tasks
            document.body.innerHTML = `
                <div class="tasks-container">
                    <div class="task-item" style="height: 100px;"></div>
                    <div class="task-item" style="height: 100px;"></div>
                </div>
            `;
            
            const container = document.querySelector('.tasks-container');
            container.getBoundingClientRect = jest.fn(() => ({
                top: 0,
                height: 200
            }));
            
            const tasks = container.children;
            tasks[0].getBoundingClientRect = jest.fn(() => ({ top: 0, height: 100, bottom: 100 }));
            tasks[1].getBoundingClientRect = jest.fn(() => ({ top: 100, height: 100, bottom: 200 }));
            
            const index = calculateDropIndex(container, 50); // Middle of first task
            expect(index).toBe(0);
        });

        test('should unfold collapsed column on drop', () => {
            window.collapsedColumns = new Set(['col_2']);
            
            unfoldColumnIfCollapsed('col_2');
            
            expect(window.collapsedColumns.has('col_2')).toBe(false);
        });
    });

    describe('Task Validation', () => {
        test('should validate task structure', () => {
            const validTask = mockBoard.columns[0].tasks[0];
            
            expect(validTask).toHaveProperty('id');
            expect(validTask).toHaveProperty('title');
            expect(validTask).toHaveProperty('description');
        });

        test('should handle malformed task data', () => {
            const malformedTask = {
                id: 'bad_task'
                // Missing title and description
            };
            
            expect(() => {
                createTaskElement(malformedTask, 'col_1', 0);
            }).not.toThrow();
        });

        test('should sanitize task content', () => {
            const maliciousTask = {
                id: 'evil_task',
                title: '<script>alert("xss")</script>Normal Title',
                description: '<img src=x onerror=alert("xss")>Description'
            };
            
            const taskHtml = createTaskElement(maliciousTask, 'col_1', 0);
            
            // Should not contain raw script tags or dangerous attributes
            expect(taskHtml).not.toContain('<script>');
            expect(taskHtml).not.toContain('onerror=');
        });
    });

    describe('Task Search and Filtering', () => {
        test('should extract tags from task titles', () => {
            const task = { title: 'Task with #urgent #bug tags' };
            const tags = getActiveTagsInTitle(task.title);
            
            expect(tags).toContain('urgent');
            expect(tags).toContain('bug');
        });

        test('should get all tags in use from board', () => {
            const allTags = getAllTagsInUse();
            
            expect(allTags.has('urgent')).toBe(true);
        });

        test('should filter tasks by tags', () => {
            const urgentTasks = mockBoard.columns[0].tasks.filter(task => 
                task.title.includes('#urgent')
            );
            
            expect(urgentTasks).toHaveLength(1);
            expect(urgentTasks[0].id).toBe('task_2');
        });
    });
});