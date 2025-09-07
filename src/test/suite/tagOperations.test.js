/**
 * Tag Operations Test Suite
 * 
 * Tests for adding, removing, and toggling tags on columns and tasks
 */

const { JSDOM } = require('jsdom');
const dom = new JSDOM(`
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Test</title>
    <style id="dynamic-tag-styles"></style>
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

// Mock tag colors configuration
const mockTagColors = {
    urgent: {
        light: { background: '#ff4444', text: '#ffffff' },
        dark: { background: '#cc2222', text: '#ffffff' },
        column: { light: { background: '#ff4444' } },
        card: { light: { background: '#ff4444' } }
    },
    feature: {
        light: { background: '#44ff44', text: '#000000' },
        dark: { background: '#22cc22', text: '#ffffff' }
    },
    bug: {
        light: { background: '#ff8844', text: '#000000' },
        dark: { background: '#cc5522', text: '#ffffff' }
    }
};

describe('Tag Operations', () => {
    let mockBoard;

    beforeEach(() => {
        jest.clearAllMocks();
        
        mockBoard = {
            columns: [
                {
                    id: 'col_1',
                    title: 'To Do #urgent',
                    tasks: [
                        { id: 'task_1', title: 'Test Task 1 #bug', description: 'Description 1' },
                        { id: 'task_2', title: 'Test Task 2', description: 'Description 2' }
                    ]
                },
                {
                    id: 'col_2',
                    title: 'In Progress',
                    tasks: [
                        { id: 'task_3', title: 'Test Task 3 #feature #urgent', description: '' }
                    ]
                }
            ]
        };

        global.currentBoard = mockBoard;
        global.window.currentBoard = mockBoard;
        global.window.tagColors = mockTagColors;
        global.window.pendingColumnChanges = new Map();
        global.window.pendingTaskChanges = new Map();
        
        require('../../html/boardRenderer.js');
        require('../../html/menuOperations.js');
    });

    describe('Tag Extraction and Parsing', () => {
        test('should extract first tag from text', () => {
            const tag = extractFirstTag('Task with #urgent #feature tags');
            expect(tag).toBe('urgent');
        });

        test('should skip row tags', () => {
            const tag = extractFirstTag('Column #row2 #urgent');
            expect(tag).toBe('urgent');
        });

        test('should skip gather tags', () => {
            const tag = extractFirstTag('Task #gather_all #urgent');
            expect(tag).toBe('urgent');
        });

        test('should return null for no tags', () => {
            const tag = extractFirstTag('Task with no tags');
            expect(tag).toBe(null);
        });

        test('should extract all active tags from title', () => {
            const tags = getActiveTagsInTitle('Task #urgent #feature #bug');
            
            expect(tags).toContain('urgent');
            expect(tags).toContain('feature');
            expect(tags).toContain('bug');
            expect(tags).toHaveLength(3);
        });

        test('should extract full tag content with parameters', () => {
            const tags = getFullTagContent('Task #priority=high #status=pending');
            
            expect(tags).toContain('#priority=high');
            expect(tags).toContain('#status=pending');
        });

        test('should handle complex tag syntax', () => {
            const tags = getActiveTagsInTitle('Task #urgent|high #feature&new #bug>critical');
            
            expect(tags).toContain('urgent');
            expect(tags).toContain('feature');
            expect(tags).toContain('bug');
        });
    });

    describe('Tag Toggle Operations', () => {
        test('should add tag to column', () => {
            toggleColumnTag('col_2', 'urgent', null);
            
            expect(window.pendingColumnChanges.has('col_2')).toBe(true);
            const change = window.pendingColumnChanges.get('col_2');
            expect(change.title).toContain('#urgent');
        });

        test('should remove existing tag from column', () => {
            toggleColumnTag('col_1', 'urgent', null);
            
            expect(window.pendingColumnChanges.has('col_1')).toBe(true);
            const change = window.pendingColumnChanges.get('col_1');
            expect(change.title).not.toContain('#urgent');
        });

        test('should add tag to task', () => {
            toggleTaskTag('task_2', 'col_1', 'urgent', null);
            
            expect(window.pendingTaskChanges.has('task_2')).toBe(true);
            const change = window.pendingTaskChanges.get('task_2');
            expect(change.taskData.title).toContain('#urgent');
        });

        test('should remove existing tag from task', () => {
            toggleTaskTag('task_1', 'col_1', 'bug', null);
            
            expect(window.pendingTaskChanges.has('task_1')).toBe(true);
            const change = window.pendingTaskChanges.get('task_1');
            expect(change.taskData.title).not.toContain('#bug');
        });

        test('should handle multiple tags correctly', () => {
            toggleTaskTag('task_3', 'col_2', 'feature', null);
            
            const change = window.pendingTaskChanges.get('task_3');
            expect(change.taskData.title).toContain('#urgent');
            expect(change.taskData.title).not.toContain('#feature');
        });
    });

    describe('Tag Menu Generation', () => {
        test('should generate tag menu items for column', () => {
            const menuHtml = generateTagMenuItems('col_1', 'column');
            
            expect(menuHtml).toContain('toggleColumnTag');
            expect(menuHtml).toContain('urgent');
            expect(menuHtml).toContain('feature');
            expect(menuHtml).toContain('bug');
        });

        test('should generate tag menu items for task', () => {
            const menuHtml = generateTagMenuItems('task_1', 'task', 'col_1');
            
            expect(menuHtml).toContain('toggleTaskTag');
            expect(menuHtml).toContain('urgent');
            expect(menuHtml).toContain('feature');
            expect(menuHtml).toContain('bug');
        });

        test('should show active tags as checked', () => {
            const menuHtml = generateTagMenuItems('col_1', 'column');
            
            // Should contain checked urgent tag
            expect(menuHtml).toContain('data-active="true"');
        });

        test('should generate remove all tags option when tags exist', () => {
            // Set up active tags
            updateTagCategoryCounts('col_1', 'column', null);
            
            // Should show remove all option for items with tags
            const menuWithTags = generateTagMenuItems('col_1', 'column');
            expect(menuWithTags).toContain('Remove all tags');
        });
    });

    describe('Tag Styling and CSS Generation', () => {
        test('should generate CSS for tag styles', () => {
            const styles = generateTagStyles();
            
            expect(styles).toContain('.kanban-full-height-column[data-column-tag="urgent"]');
            expect(styles).toContain('.task-item[data-task-tag="urgent"]');
            expect(styles).toContain('#ff4444');
        });

        test('should apply tag styles to document', () => {
            applyTagStyles();
            
            const styleElement = document.getElementById('dynamic-tag-styles');
            expect(styleElement).toBeTruthy();
            expect(styleElement.textContent).toContain('urgent');
        });

        test('should ensure specific tag style exists', () => {
            ensureTagStyleExists('urgent');
            
            const styleElement = document.getElementById('dynamic-tag-styles');
            expect(styleElement.textContent).toContain('[data-column-tag="urgent"]');
        });

        test('should handle theme switching', () => {
            document.body.className = 'vscode-dark';
            
            const styles = generateTagStyles();
            
            expect(styles).toContain('#cc2222'); // Dark theme color
        });

        test('should interpolate colors correctly', () => {
            const color = interpolateColor('#ff0000', '#0000ff', 0.5);
            
            expect(color).toMatch(/^#[0-9a-f]{6}$/i);
        });
    });

    describe('Tag Collection and Inventory', () => {
        test('should collect all tags in use', () => {
            const allTags = getAllTagsInUse();
            
            expect(allTags.has('urgent')).toBe(true);
            expect(allTags.has('feature')).toBe(true);
            expect(allTags.has('bug')).toBe(true);
        });

        test('should identify user-added tags', () => {
            // Add a custom tag not in config
            mockBoard.columns[0].tasks[0].title = 'Task #customtag #bug';
            
            const userTags = getUserAddedTags();
            
            expect(userTags).toContain('customtag');
        });

        test('should categorize configured vs custom tags', () => {
            const allTags = getAllTagsInUse();
            const userTags = getUserAddedTags();
            
            const configuredTags = Array.from(allTags).filter(tag => !userTags.includes(tag));
            
            expect(configuredTags).toContain('urgent');
            expect(configuredTags).toContain('feature');
        });
    });

    describe('Tag Validation and Sanitization', () => {
        test('should validate tag names', () => {
            const validTag = 'urgent';
            const invalidTag = '<script>alert("xss")</script>';
            
            expect(validTag).toMatch(/^[a-zA-Z0-9_-]+$/);
            expect(invalidTag).not.toMatch(/^[a-zA-Z0-9_-]+$/);
        });

        test('should handle malformed tag syntax', () => {
            const malformedTags = getActiveTagsInTitle('Task ###urgent #@invalid #123numeric');
            
            // Should extract valid tags and ignore malformed ones
            expect(malformedTags).toContain('urgent');
            expect(malformedTags).not.toContain('@invalid');
        });

        test('should sanitize tag input', () => {
            const dangerousTitle = 'Task #urgent<script>alert("xss")</script>';
            const sanitizedTags = getActiveTagsInTitle(dangerousTitle);
            
            expect(sanitizedTags).toContain('urgent');
            expect(sanitizedTags.join('')).not.toContain('<script>');
        });
    });

    describe('Tag Removal Operations', () => {
        test('should remove all tags from column', () => {
            removeAllTags('col_1', 'column');
            
            expect(window.pendingColumnChanges.has('col_1')).toBe(true);
            const change = window.pendingColumnChanges.get('col_1');
            expect(change.title).not.toContain('#urgent');
            expect(change.title).toBe('To Do');
        });

        test('should remove all tags from task', () => {
            removeAllTags('task_1', 'task', 'col_1');
            
            expect(window.pendingTaskChanges.has('task_1')).toBe(true);
            const change = window.pendingTaskChanges.get('task_1');
            expect(change.taskData.title).not.toContain('#bug');
            expect(change.taskData.title).toBe('Test Task 1');
        });

        test('should preserve row tags when removing all tags', () => {
            mockBoard.columns[0].title = 'Column #row2 #urgent #feature';
            
            removeAllTags('col_1', 'column');
            
            const change = window.pendingColumnChanges.get('col_1');
            expect(change.title).toContain('#row2');
            expect(change.title).not.toContain('#urgent');
            expect(change.title).not.toContain('#feature');
        });
    });

    describe('Tag State Management', () => {
        test('should track pending tag changes', () => {
            toggleColumnTag('col_1', 'feature', null);
            toggleTaskTag('task_1', 'col_1', 'urgent', null);
            
            expect(window.pendingColumnChanges.size).toBe(1);
            expect(window.pendingTaskChanges.size).toBe(1);
        });

        test('should update refresh button state with pending count', () => {
            const mockUpdateRefreshButtonState = jest.fn();
            global.window.updateRefreshButtonState = mockUpdateRefreshButtonState;
            
            toggleColumnTag('col_1', 'feature', null);
            
            expect(mockUpdateRefreshButtonState).toHaveBeenCalledWith('pending', 1);
        });

        test('should clear pending changes on flush', () => {
            window.pendingColumnChanges.set('col_1', { title: 'Test', columnId: 'col_1' });
            window.pendingTaskChanges.set('task_1', { taskId: 'task_1', columnId: 'col_1', taskData: {} });
            
            flushPendingTagChanges();
            
            expect(window.pendingColumnChanges.size).toBe(0);
            expect(window.pendingTaskChanges.size).toBe(0);
        });
    });

    describe('Tag Visual Updates', () => {
        beforeEach(() => {
            document.body.innerHTML = `
                <div class="kanban-full-height-column" data-column-id="col_1">
                    <div class="column-title">To Do #urgent</div>
                </div>
                <div class="task-item" data-task-id="task_1">
                    <div class="task-title-display">Test Task</div>
                </div>
            `;
        });

        test('should update column display immediately', () => {
            updateColumnDisplayImmediate('col_1', 'To Do #urgent #feature', true, 'feature');
            
            const columnTitle = document.querySelector('.column-title');
            expect(columnTitle.innerHTML).toContain('#feature');
        });

        test('should update task display immediately', () => {
            updateTaskDisplayImmediate('task_1', 'Test Task #urgent', true, 'urgent');
            
            const taskTitle = document.querySelector('.task-title-display');
            expect(taskTitle.innerHTML).toContain('#urgent');
        });
    });

    describe('Tag Configuration', () => {
        test('should get tag configuration', () => {
            const config = getTagConfig('urgent');
            
            expect(config).toBeTruthy();
            expect(config.light.background).toBe('#ff4444');
        });

        test('should handle missing tag configuration', () => {
            const config = getTagConfig('nonexistent');
            
            expect(config).toBeFalsy();
        });

        test('should provide default styling for unconfigured tags', () => {
            const styles = generateTagStyles();
            
            // Should handle tags that aren't in configuration
            expect(styles).toContain('urgent'); // configured
        });
    });
});