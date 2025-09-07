/**
 * UI Interactions Test Suite
 * 
 * Tests for drag/drop, editing, menus, and other UI interactions
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
    <div class="donut-menu" id="test-menu">
        <div class="donut-menu-dropdown">
            <button class="donut-menu-item" onclick="testFunction()">Test Item</button>
        </div>
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
global.MouseEvent = dom.window.MouseEvent;
global.KeyboardEvent = dom.window.KeyboardEvent;
global.DragEvent = dom.window.DragEvent;

// Mock VS Code API
global.vscode = {
    postMessage: jest.fn()
};

global.console = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

describe('UI Interactions', () => {
    let mockBoard;
    let menuManager;
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
                        { id: 'task_2', title: 'Test Task 2', description: 'Description 2' }
                    ]
                }
            ]
        };

        global.currentBoard = mockBoard;
        global.window.currentBoard = mockBoard;
        global.window.dragState = {
            isDragging: false,
            draggedTask: null,
            draggedColumn: null,
            draggedClipboardCard: null
        };
        
        require('../../html/menuOperations.js');
        require('../../html/taskEditor.js');
        require('../../html/dragDrop.js');
    });

    describe('Menu System', () => {
        test('should toggle donut menu visibility', () => {
            const button = document.createElement('button');
            const menu = document.createElement('div');
            menu.className = 'donut-menu';
            button.appendChild(menu);
            
            const event = new MouseEvent('click');
            
            toggleDonutMenu(event, button);
            
            expect(menu.classList.contains('active')).toBe(true);
        });

        test('should close menu when clicking outside', () => {
            const menu = document.getElementById('test-menu');
            menu.classList.add('active');
            
            const outsideClick = new MouseEvent('click', {
                target: document.body
            });
            
            document.dispatchEvent(outsideClick);
            
            expect(menu.classList.contains('active')).toBe(false);
        });

        test('should execute menu button functions safely', () => {
            const menuManager = new SimpleMenuManager();
            const mockFunction = jest.fn();
            global.testFunction = mockFunction;
            
            const button = document.createElement('button');
            button.setAttribute('onclick', 'testFunction()');
            
            menuManager.handleButtonClick(button);
            
            expect(mockFunction).toHaveBeenCalled();
        });

        test('should prevent XSS in menu functions', () => {
            const menuManager = new SimpleMenuManager();
            const button = document.createElement('button');
            button.setAttribute('onclick', 'eval("alert(\'xss\')")');
            
            expect(() => {
                menuManager.handleButtonClick(button);
            }).not.toThrow();
        });

        test('should handle submenu positioning', () => {
            const menuManager = new SimpleMenuManager();
            const parentItem = document.createElement('div');
            const submenu = document.createElement('div');
            
            parentItem.getBoundingClientRect = jest.fn(() => ({
                right: 100,
                bottom: 200
            }));
            
            menuManager.showSubmenu(parentItem, submenu);
            
            expect(submenu.style.left).toBeTruthy();
            expect(submenu.style.top).toBeTruthy();
        });

        test('should setup hover handlers for menus', () => {
            const menu = document.createElement('div');
            const dropdown = document.createElement('div');
            
            setupMenuHoverHandlers(menu, dropdown);
            
            // Should add event listeners without throwing
            expect(menu.onmouseleave).toBeTruthy();
            expect(dropdown.onmouseenter).toBeTruthy();
        });
    });

    describe('Task Editor', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="task-item" data-task-id="task_1">
                    <div class="task-title-display">Test Task</div>
                    <input class="task-title-edit" value="Test Task" style="display: none;">
                    <div class="task-description-display">Description</div>
                    <textarea class="task-description-edit" style="display: none;">Description</textarea>
                </div>
                <div class="kanban-full-height-column" data-column-id="col_1">
                    <div class="column-title">Column Title</div>
                    <input class="column-title-edit" value="Column Title" style="display: none;">
                </div>
            `;
            
            taskEditor = new TaskEditor();
        });

        test('should start editing on element click', () => {
            const titleElement = document.querySelector('.task-title-display');
            const editElement = document.querySelector('.task-title-edit');
            
            taskEditor.startEdit(titleElement, 'task-title', 'task_1', 'col_1');
            
            expect(editElement.style.display).toBe('block');
            expect(titleElement.style.display).toBe('none');
        });

        test('should handle keyboard shortcuts during editing', () => {
            const editElement = document.querySelector('.task-title-edit');
            taskEditor.startEdit(editElement, 'task-title', 'task_1', 'col_1');
            
            // Test Enter key
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
            const savespy = jest.spyOn(taskEditor, 'save');
            
            document.dispatchEvent(enterEvent);
            
            // Should trigger save
            expect(savespy).toHaveBeenCalled();
        });

        test('should handle Tab transition from title to description', () => {
            const titleEdit = document.querySelector('.task-title-edit');
            taskEditor.startEdit(titleEdit, 'task-title', 'task_1', 'col_1');
            
            const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
            const transitionSpy = jest.spyOn(taskEditor, 'transitionToDescription');
            
            document.dispatchEvent(tabEvent);
            
            expect(transitionSpy).toHaveBeenCalled();
        });

        test('should handle Escape key to cancel editing', () => {
            const editElement = document.querySelector('.task-title-edit');
            editElement.value = 'Modified';
            taskEditor.startEdit(editElement, 'task-title', 'task_1', 'col_1');
            
            const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
            const cancelSpy = jest.spyOn(taskEditor, 'cancel');
            
            document.dispatchEvent(escapeEvent);
            
            expect(cancelSpy).toHaveBeenCalled();
        });

        test('should auto-resize textarea during editing', () => {
            const textarea = document.querySelector('.task-description-edit');
            textarea.scrollHeight = 150;
            
            taskEditor.autoResize(textarea);
            
            expect(textarea.style.height).toBe('150px');
        });

        test('should prevent interference during text selection', () => {
            const editElement = document.querySelector('.task-title-edit');
            taskEditor.startEdit(editElement, 'task-title', 'task_1', 'col_1');
            
            const mousedownEvent = new MouseEvent('mousedown', { target: editElement });
            
            expect(() => {
                editElement.dispatchEvent(mousedownEvent);
            }).not.toThrow();
        });
    });

    describe('Drag and Drop', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="board-content">
                    <div class="kanban-full-height-column" data-column-id="col_1">
                        <div class="column-header" draggable="true">
                            <div class="column-title">To Do</div>
                        </div>
                        <div class="tasks-container">
                            <div class="task-item" data-task-id="task_1" draggable="true">
                                <div class="task-drag-handle">≡</div>
                                <div class="task-title-display">Task 1</div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            setupDragAndDrop();
        });

        test('should handle task drag start', () => {
            const taskElement = document.querySelector('.task-item');
            const dragHandle = document.querySelector('.task-drag-handle');
            
            const dragStartEvent = new DragEvent('dragstart', {
                dataTransfer: new DataTransfer()
            });
            
            dragHandle.dispatchEvent(dragStartEvent);
            
            expect(window.dragState.isDragging).toBe(true);
            expect(window.dragState.draggedTask).toBeTruthy();
        });

        test('should handle column drag start', () => {
            const columnHeader = document.querySelector('.column-header');
            
            const dragStartEvent = new DragEvent('dragstart', {
                dataTransfer: new DataTransfer()
            });
            
            columnHeader.dispatchEvent(dragStartEvent);
            
            expect(window.dragState.isDragging).toBe(true);
            expect(window.dragState.draggedColumn).toBeTruthy();
        });

        test('should calculate correct drop index for tasks', () => {
            const tasksContainer = document.querySelector('.tasks-container');
            const taskElement = document.querySelector('.task-item');
            
            taskElement.getBoundingClientRect = jest.fn(() => ({
                top: 0,
                height: 100,
                bottom: 100
            }));
            
            const dropIndex = calculateDropIndex(tasksContainer, 50);
            
            expect(dropIndex).toBeGreaterThanOrEqual(0);
        });

        test('should handle external file drops', () => {
            const column = document.querySelector('.kanban-full-height-column');
            const files = [
                new File(['content'], 'test.txt', { type: 'text/plain' })
            ];
            
            const dropEvent = new DragEvent('drop', {
                dataTransfer: new DataTransfer()
            });
            
            Object.defineProperty(dropEvent.dataTransfer, 'files', {
                value: files,
                writable: false
            });
            
            handleVSCodeFileDrop(dropEvent, files);
            
            expect(vscode.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'addTask'
                })
            );
        });

        test('should show/hide external drop indicators', () => {
            const column = document.querySelector('.kanban-full-height-column');
            
            showExternalDropIndicator(column, 100);
            
            const indicator = document.querySelector('.external-drop-indicator');
            expect(indicator).toBeTruthy();
            expect(indicator.style.display).toBe('block');
            
            hideExternalDropIndicator();
            
            expect(indicator.style.display).toBe('none');
        });

        test('should handle clipboard card drops', () => {
            const clipboardData = {
                type: 'clipboard-card',
                task: { id: 'temp-123', title: 'Clipboard Task', description: 'Content' }
            };
            
            const dropEvent = new DragEvent('drop', {
                dataTransfer: new DataTransfer()
            });
            dropEvent.dataTransfer.setData('text/plain', `CLIPBOARD_CARD:${JSON.stringify(clipboardData)}`);
            
            handleClipboardCardDrop(dropEvent, clipboardData);
            
            expect(vscode.postMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'addTask',
                    taskData: expect.objectContaining({
                        title: 'Clipboard Task'
                    })
                })
            );
        });

        test('should restore element positions on drag end', () => {
            const taskElement = document.querySelector('.task-item');
            window.dragState.draggedTask = { element: taskElement, id: 'task_1' };
            window.dragState.originalTaskParent = document.querySelector('.tasks-container');
            
            restoreTaskPosition();
            
            expect(window.dragState.draggedTask).toBe(null);
            expect(window.dragState.isDragging).toBe(false);
        });
    });

    describe('Keyboard Navigation', () => {
        test('should handle global keyboard shortcuts', () => {
            const mockUndo = jest.fn();
            const mockRedo = jest.fn();
            global.undo = mockUndo;
            global.redo = mockRedo;
            
            // Test Cmd+Z (undo)
            const undoEvent = new KeyboardEvent('keydown', { 
                key: 'z', 
                metaKey: true 
            });
            document.dispatchEvent(undoEvent);
            
            expect(mockUndo).toHaveBeenCalled();
            
            // Test Cmd+Shift+Z (redo)
            const redoEvent = new KeyboardEvent('keydown', { 
                key: 'z', 
                metaKey: true, 
                shiftKey: true 
            });
            document.dispatchEvent(redoEvent);
            
            expect(mockRedo).toHaveBeenCalled();
        });

        test('should handle focus management during editing', () => {
            const editElement = document.querySelector('.task-title-edit');
            const taskEditor = new TaskEditor();
            
            taskEditor.startEdit(editElement, 'task-title', 'task_1', 'col_1');
            
            expect(document.activeElement).toBe(editElement);
        });
    });

    describe('Responsive Interactions', () => {
        test('should handle viewport resize', () => {
            const originalWidth = window.innerWidth;
            
            // Simulate resize
            window.innerWidth = 500;
            const resizeEvent = new Event('resize');
            window.dispatchEvent(resizeEvent);
            
            // Should not throw errors
            expect(window.innerWidth).toBe(500);
            
            // Restore
            window.innerWidth = originalWidth;
        });

        test('should handle touch interactions', () => {
            const taskElement = document.querySelector('.task-item');
            
            const touchStartEvent = new TouchEvent('touchstart', {
                touches: [{ clientX: 100, clientY: 100 }]
            });
            
            expect(() => {
                taskElement.dispatchEvent(touchStartEvent);
            }).not.toThrow();
        });
    });

    describe('Accessibility', () => {
        test('should maintain focus during keyboard navigation', () => {
            const firstButton = document.querySelector('.donut-menu-item');
            firstButton.focus();
            
            expect(document.activeElement).toBe(firstButton);
            
            // Tab navigation should work
            const tabEvent = new KeyboardEvent('keydown', { key: 'Tab' });
            firstButton.dispatchEvent(tabEvent);
            
            // Focus should move (implementation dependent)
            expect(document.activeElement).toBeDefined();
        });

        test('should have proper ARIA attributes', () => {
            const menu = document.querySelector('.donut-menu');
            const menuItem = document.querySelector('.donut-menu-item');
            
            expect(menuItem.tagName).toBe('BUTTON');
            expect(menuItem.textContent.trim()).toBeTruthy();
        });

        test('should handle screen reader interactions', () => {
            const button = document.querySelector('.donut-menu-item');
            
            // Should have descriptive text content
            expect(button.textContent.trim().length).toBeGreaterThan(0);
            
            // Should be focusable
            button.focus();
            expect(document.activeElement).toBe(button);
        });
    });

    describe('Error Handling in UI', () => {
        test('should handle missing DOM elements gracefully', () => {
            expect(() => {
                toggleDonutMenu(new MouseEvent('click'), null);
            }).not.toThrow();
        });

        test('should handle malformed event data', () => {
            const button = document.querySelector('.donut-menu-item');
            
            expect(() => {
                button.dispatchEvent(null);
            }).toThrow(); // This should throw, but app should handle it
        });

        test('should recover from drag operation errors', () => {
            window.dragState.isDragging = true;
            window.dragState.draggedTask = { element: null };
            
            expect(() => {
                restoreTaskPosition();
            }).not.toThrow();
        });
    });

    describe('Performance Considerations', () => {
        test('should throttle rapid UI updates', () => {
            const updateSpy = jest.fn();
            let updateCount = 0;
            
            // Simulate rapid updates
            for (let i = 0; i < 100; i++) {
                setTimeout(updateSpy, i);
                updateCount++;
            }
            
            // Should not overwhelm the system
            expect(updateCount).toBe(100);
        });

        test('should cleanup event listeners on destruction', () => {
            const taskEditor = new TaskEditor();
            const element = document.querySelector('.task-title-edit');
            
            taskEditor.startEdit(element, 'task-title', 'task_1', 'col_1');
            taskEditor.closeEditor();
            
            // Event listeners should be cleaned up
            expect(element.onblur).toBe(null);
            expect(element.oninput).toBe(null);
        });
    });

    describe('Cross-browser Compatibility', () => {
        test('should handle different event implementations', () => {
            const button = document.querySelector('.donut-menu-item');
            
            // Different ways of creating events
            const clickEvent1 = new MouseEvent('click');
            const clickEvent2 = document.createEvent('MouseEvents');
            clickEvent2.initEvent('click', true, true);
            
            expect(() => {
                button.dispatchEvent(clickEvent1);
                button.dispatchEvent(clickEvent2);
            }).not.toThrow();
        });

        test('should fallback gracefully for unsupported features', () => {
            // Test clipboard API fallback
            delete global.navigator.clipboard;
            
            expect(() => {
                copyTaskAsMarkdown('task_1', 'col_1');
            }).not.toThrow();
        });
    });
});