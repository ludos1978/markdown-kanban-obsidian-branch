// VS Code API mock for testing
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : {
    postMessage: (msg) => console.log('Message to extension:', msg)
};

let isActivelyEditing = false;
let focusedElement = null;
let focusPosition = { start: 0, end: 0 };
let currentBoard = null;
let editingTask = null;
let scrollPositions = new Map();
let collapsedColumns = new Set();
let collapsedTasks = new Set();
let currentFileInfo = null;
let canUndo = false;
let canRedo = false;
let currentExternalDropColumn = null;
let externalDropIndicator = null;

// Track if drag/drop is already set up to prevent multiple listeners
let dragDropInitialized = false;
let isProcessingDrop = false; // Prevent multiple simultaneous drops

let currentImageMappings = {};

document.addEventListener('DOMContentLoaded', () => {
    // Set up link click handling using event delegation
    document.body.addEventListener('click', (e) => {
        // Check if the clicked element is a markdown link
        const link = e.target.closest('a.markdown-link');
        if (!link) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        const href = link.getAttribute('data-original-href');
        if (!href) {
            return;
        }
        
        // Check if it's an external URL
        if (href.startsWith('http://') || href.startsWith('https://')) {
            // Open external URLs in default browser via VS Code
            vscode.postMessage({
                type: 'openExternalLink',
                href: href
            });
        } else {
            // It's a file link - send to extension to open in VS Code
            vscode.postMessage({
                type: 'openFileLink',
                href: href
            });
        }
        
        return false;
    });
});

// Initialize with sample data for testing
if (typeof acquireVsCodeApi === 'undefined') {
    currentBoard = {
        title: 'Sample Kanban Board',
        columns: [
            {
                id: 'col1',
                title: 'To Do',
                tasks: [
                    { id: 'task1', title: '**Important** Task', description: 'This is a sample task with *markdown* support' },
                    { id: 'task2', title: 'Another Task', description: 'More description here\n\nWith multiple lines' }
                ]
            },
            {
                id: 'col2',
                title: 'In Progress',
                tasks: [
                    { id: 'task3', title: 'Working on this', description: '' }
                ]
            },
            {
                id: 'col3',
                title: 'Done',
                tasks: []
            }
        ]
    };
    setTimeout(() => renderBoard(), 100);
}

// Listen for messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    console.log('Received message:', message); // Debug log
    switch (message.type) {
        case 'updateBoard':
            console.log('Updating board with:', message.board); // Debug log
            currentBoard = message.board;
            // Store image mappings if provided
            if (message.imageMappings) {
                currentImageMappings = message.imageMappings;
                console.log('Received image mappings:', currentImageMappings);
            }
            debouncedRenderBoard(); // Use debounced render
            break;
        case 'updateFileInfo':
            console.log('Updating file info with:', message.fileInfo);
            currentFileInfo = message.fileInfo;
            updateFileInfoBar();
            break;
        case 'undoRedoStatus':
            console.log('Undo/Redo status:', message); // Debug log
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            updateUndoRedoButtons();
            break;
        case 'insertFileLink':
            console.log('Insert file link:', message.fileInfo); // Debug log
            insertFileLink(message.fileInfo);
            break;
        case 'imagePathsConverted':
            console.log('Image paths converted:', message.pathMappings);
            currentImageMappings = { ...currentImageMappings, ...message.pathMappings };
            updateImageSources();
            break;
        case 'updateImagePaths':
            updateImagePaths(message.pathMappings);
            break;

    }
});

function updateImageSources() {
    // Update all images in the rendered content
    document.querySelectorAll('img').forEach(img => {
        const originalSrc = img.getAttribute('data-original-src') || img.src;
        
        // Extract path from src (remove any base URL)
        let imagePath = originalSrc;
        try {
            const url = new URL(originalSrc);
            imagePath = url.pathname;
        } catch (e) {
            // If it's not a full URL, use as-is
        }
        
        // Try to find a mapping for this image
        const mappedSrc = findImageMapping(imagePath);
        if (mappedSrc && mappedSrc !== originalSrc) {
            img.src = mappedSrc;
            img.setAttribute('data-original-src', originalSrc);
        }
    });
}

function updateImagePaths(pathMappings) {
    // Update all image sources in the rendered markdown
    document.querySelectorAll('.markdown-content img').forEach(img => {
        const currentSrc = img.getAttribute('src');
        if (pathMappings[currentSrc]) {
            img.src = pathMappings[currentSrc];
        }
    });
    
    // Also update links that might be images
    document.querySelectorAll('.markdown-content a').forEach(link => {
        const href = link.getAttribute('data-original-href') || link.getAttribute('href');
        if (pathMappings[href] && isImageLink(href)) {
            // Convert link to image
            const img = document.createElement('img');
            img.src = pathMappings[href];
            img.alt = link.textContent;
            link.parentNode.replaceChild(img, link);
        }
    });
}

function isImageLink(href) {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.bmp', '.webp'];
    const lower = href.toLowerCase();
    return imageExtensions.some(ext => lower.endsWith(ext));
}

function findImageMapping(imagePath) {
    // Direct match
    if (currentImageMappings[imagePath]) {
        return currentImageMappings[imagePath];
    }
    
    // Try without leading ./
    const cleanPath = imagePath.replace(/^\.\//, '');
    if (currentImageMappings[cleanPath]) {
        return currentImageMappings[cleanPath];
    }
    
    // Try with leading ./
    const withDot = './' + cleanPath;
    if (currentImageMappings[withDot]) {
        return currentImageMappings[withDot];
    }
    
    // Try just the filename
    const filename = imagePath.split('/').pop();
    if (filename && currentImageMappings[filename]) {
        return currentImageMappings[filename];
    }
    
    // Try to find by partial match
    for (const [key, value] of Object.entries(currentImageMappings)) {
        if (key.endsWith(imagePath) || imagePath.endsWith(key)) {
            return value;
        }
    }
    
    return null;
}

// Request board update when the webview loads/becomes visible
window.addEventListener('DOMContentLoaded', () => {
    // Request initial board data and file info
    setTimeout(() => {
        if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
            vscode.postMessage({ type: 'requestBoardUpdate' });
        }
        if (!currentFileInfo) {
            vscode.postMessage({ type: 'requestFileInfo' });
        }
    }, 100);
    
    // Setup drag and drop
    setupDragAndDrop();
});

// Also request update when window becomes visible again
window.addEventListener('focus', () => {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        vscode.postMessage({ type: 'requestBoardUpdate' });
    }
});

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
    // Check if we're not in an input/textarea element
    const activeElement = document.activeElement;
    const isEditing = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.classList.contains('column-title-edit') ||
        activeElement.classList.contains('task-title-edit') ||
        activeElement.classList.contains('task-description-edit')
    );
    
    if (!isEditing) {
        // Ctrl+Z or Cmd+Z for undo
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
        // Ctrl+Y or Cmd+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
        else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
            e.preventDefault();
            redo();
        }
    }
});

// Also update the click handler for images that are actually file links
document.addEventListener('click', (e) => {
    // Check if clicked element is an image with a webview URI (for opening in editor)
    const img = e.target.closest('img');
    if (img && img.src && img.src.startsWith('vscode-webview://')) {
        // Don't do anything for images - they should just display
        return;
    }
    
    // Existing link handling code...
    const link = e.target.closest('a[data-original-href]');
    if (!link) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const href = link.getAttribute('data-original-href');
    if (!href) return;
    
    // Skip webview URIs - they're for display only
    if (href.startsWith('vscode-webview://')) {
        return;
    }
    
    // Check if it's an external URL
    if (href.startsWith('http://') || href.startsWith('https://')) {
        vscode.postMessage({
            type: 'openExternalLink',
            href: href
        });
    } else {
        // It's a file link
        vscode.postMessage({
            type: 'openFileLink',
            href: href
        });
    }
}, true);

class TaskEditor {
    constructor() {
        this.currentEditor = null;
        this.isTransitioning = false;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        // Single global keydown handler
        document.addEventListener('keydown', (e) => {
            if (!this.currentEditor) return;
            
            const element = this.currentEditor.element;
            
            if (e.key === 'Tab' && element.classList.contains('task-title-edit')) {
                e.preventDefault();
                this.transitionToDescription();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                if (element.classList.contains('task-title-edit') || 
                    element.classList.contains('column-title-edit')) {
                    e.preventDefault();
                    this.save();
                }
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.cancel();
            }
        });

        // Single global click handler for closing menus
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.donut-menu')) {
                document.querySelectorAll('.donut-menu.active').forEach(menu => {
                    menu.classList.remove('active');
                });
            }
        });
    }

    startEdit(element, type, taskId = null, columnId = null) {
        // If transitioning, don't interfere
        if (this.isTransitioning) return;
        
        // Save any current editor first
        if (this.currentEditor && !this.isTransitioning) {
            this.save();
        }

        // Get the appropriate elements based on type
        let displayElement, editElement, containerElement;
        
        if (type === 'task-title') {
            containerElement = element.closest('.task-item') || element;
            displayElement = containerElement.querySelector('.task-title-display');
            editElement = containerElement.querySelector('.task-title-edit');
        } else if (type === 'task-description') {
            containerElement = element.closest('.task-item') || element;
            displayElement = containerElement.querySelector('.task-description-display');
            editElement = containerElement.querySelector('.task-description-edit');
            const placeholder = containerElement.querySelector('.task-description-placeholder');
            if (placeholder) placeholder.style.display = 'none';
        } else if (type === 'column-title') {
            containerElement = element.closest('.kanban-column') || element;
            displayElement = containerElement.querySelector('.column-title');
            editElement = containerElement.querySelector('.column-title-edit');
        }

        if (!editElement) return;

        // Show edit element, hide display
        if (displayElement) displayElement.style.display = 'none';
        editElement.style.display = 'block';
        
        // Auto-resize if textarea
        this.autoResize(editElement);
        
        // Focus and position cursor at end
        editElement.focus();
        editElement.setSelectionRange(editElement.value.length, editElement.value.length);

        // Store current editor info
        this.currentEditor = {
            element: editElement,
            displayElement: displayElement,
            type: type,
            taskId: taskId || editElement.dataset.taskId,
            columnId: columnId || editElement.dataset.columnId,
            originalValue: editElement.value
        };

        // Set up input handler for auto-resize
        editElement.oninput = () => this.autoResize(editElement);
        
        // Set up blur handler (but it won't fire during transitions)
        editElement.onblur = () => {
            if (!this.isTransitioning) {
                this.save();
            }
        };
    }

    transitionToDescription() {
        if (!this.currentEditor || this.currentEditor.type !== 'task-title') return;
        
        this.isTransitioning = true;
        
        const taskId = this.currentEditor.taskId;
        const columnId = this.currentEditor.columnId;
        const taskItem = this.currentEditor.element.closest('.task-item');
        
        // DON'T SAVE YET - just update local state
        const value = this.currentEditor.element.value;
        if (currentBoard && currentBoard.columns) {
            const column = currentBoard.columns.find(c => c.id === columnId);
            const task = column?.tasks.find(t => t.id === taskId);
            if (task) {
                task.title = value;
                if (this.currentEditor.displayElement) {
                    this.currentEditor.displayElement.innerHTML = renderMarkdown(value);
                }
            }
        }
        
        // Remove blur handler
        this.currentEditor.element.onblur = null;
        
        // Hide title editor
        this.currentEditor.element.style.display = 'none';
        if (this.currentEditor.displayElement) {
            this.currentEditor.displayElement.style.display = 'block';
        }
        
        // Clear current editor
        this.currentEditor = null;
        
        // Immediately start editing description (no async needed)
        this.isTransitioning = false;
        const descContainer = taskItem.querySelector('.task-description-container');
        if (descContainer) {
            this.startEdit(descContainer, 'task-description', taskId, columnId);
        }
    }

    save() {
        if (!this.currentEditor || this.isTransitioning) return;
        
        this.saveCurrentField();
        this.closeEditor();
    }

    cancel() {
        if (!this.currentEditor || this.isTransitioning) return;
        
        // Restore original value
        this.currentEditor.element.value = this.currentEditor.originalValue;
        this.closeEditor();
    }

    saveCurrentField() {
        if (!this.currentEditor) return;
        
        const { element, type, taskId, columnId } = this.currentEditor;
        const value = element.value;

        // Update local state for immediate feedback
        if (currentBoard && currentBoard.columns) {
            if (type === 'column-title') {
                const column = currentBoard.columns.find(c => c.id === columnId);
                if (column) {
                    column.title = value;
                    if (this.currentEditor.displayElement) {
                        this.currentEditor.displayElement.innerHTML = renderMarkdown(value);
                    }
                }
                
                // Send to extension
                vscode.postMessage({
                    type: 'editColumnTitle',
                    columnId: columnId,
                    title: value
                });
            } else if (type === 'task-title' || type === 'task-description') {
                const column = currentBoard.columns.find(c => c.id === columnId);
                const task = column?.tasks.find(t => t.id === taskId);
                
                if (task) {
                    const field = type === 'task-title' ? 'title' : 'description';
                    task[field] = value;
                    
                    if (this.currentEditor.displayElement) {
                        if (value.trim()) {
                            this.currentEditor.displayElement.innerHTML = renderMarkdown(value);
                            this.currentEditor.displayElement.style.display = 'block';
                        } else if (type === 'task-description') {
                            this.currentEditor.displayElement.style.display = 'none';
                            const placeholder = element.closest('.task-description-container')
                                ?.querySelector('.task-description-placeholder');
                            if (placeholder) placeholder.style.display = 'block';
                        }
                    }
                }
                
                // Only send to extension if not transitioning
                if (!this.isTransitioning) {
                    if (type === 'column-title') {
                        vscode.postMessage({
                            type: 'editColumnTitle',
                            columnId: columnId,
                            title: value
                        });
                    } else if (type === 'task-title' || type === 'task-description') {
                        // Send to extension
                        vscode.postMessage({
                            type: 'editTask',
                            taskId: taskId,
                            columnId: columnId,
                            taskData: task
                        });
                    }
                }
            }
        }
    }

    closeEditor() {
        if (!this.currentEditor) return;
        
        const { element, displayElement, type } = this.currentEditor;
        
        // Hide edit element
        element.style.display = 'none';
        element.onblur = null;
        element.oninput = null;
        
        // Show display element
        if (displayElement) {
            displayElement.style.display = 'block';
        } else if (type === 'task-description') {
            // Show placeholder if description is empty
            const container = element.closest('.task-description-container');
            const placeholder = container?.querySelector('.task-description-placeholder');
            if (placeholder && !element.value.trim()) {
                placeholder.style.display = 'block';
            }
        }
        
        this.currentEditor = null;
    }

    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
}

// Initialize the editor system
const taskEditor = new TaskEditor();
// Optionally, make it globally accessible
window.taskEditor = taskEditor;

// Simplified edit trigger functions
function editTitle(element, taskId, columnId) {
    taskEditor.startEdit(element, 'task-title', taskId, columnId);
}

function editDescription(element, taskId, columnId) {
    // Find the actual container if needed
    const container = element.closest('.task-description-container') || element;
    taskEditor.startEdit(container, 'task-description', taskId, columnId);
}

function editColumnTitle(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column && !column.classList.contains('collapsed')) {
        taskEditor.startEdit(column, 'column-title', null, columnId);
    }
}

// Simplified toggle functions
function toggleColumnCollapse(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    const toggle = column.querySelector('.collapse-toggle');
    
    column.classList.toggle('collapsed');
    toggle.classList.toggle('rotated');
    
    // Store state if needed
    if (column.classList.contains('collapsed')) {
        collapsedColumns.add(columnId);
    } else {
        collapsedColumns.delete(columnId);
    }
}

function toggleTaskCollapse(taskId) {
    const task = document.querySelector(`[data-task-id="${taskId}"]`);
    const toggle = task.querySelector('.task-collapse-toggle');
    
    task.classList.toggle('collapsed');
    toggle.classList.toggle('rotated');
    
    // Store state if needed
    if (task.classList.contains('collapsed')) {
        collapsedTasks.add(taskId);
    } else {
        collapsedTasks.delete(taskId);
    }
}

function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    
    // Close all other menus
    document.querySelectorAll('.donut-menu.active').forEach(m => {
        if (m !== menu) m.classList.remove('active');
    });
    
    // Toggle this menu
    menu.classList.toggle('active');
}

// Undo/Redo functions
function undo() {
    if (canUndo) {
        vscode.postMessage({ type: 'undo' });
    }
}

function redo() {
    if (canRedo) {
        vscode.postMessage({ type: 'redo' });
    }
}

function updateUndoRedoButtons() {
    const undoBtn = document.getElementById('undo-btn');
    const redoBtn = document.getElementById('redo-btn');
    
    if (undoBtn) {
        undoBtn.disabled = !canUndo;
        undoBtn.style.opacity = canUndo ? '1' : '0.5';
    }
    
    if (redoBtn) {
        redoBtn.disabled = !canRedo;
        redoBtn.style.opacity = canRedo ? '1' : '0.5';
    }
}

// External file drop location indicators
function createExternalDropIndicator() {
    if (externalDropIndicator) {
        return externalDropIndicator;
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'external-drop-indicator';
    indicator.style.display = 'none';
    document.body.appendChild(indicator);
    externalDropIndicator = indicator;
    return indicator;
}

function showExternalDropIndicator(column, clientY) {
    const indicator = createExternalDropIndicator();
    const tasksContainer = column.querySelector('.tasks-container');
    
    if (!tasksContainer) return;
    
    // Calculate insertion position
    const containerRect = tasksContainer.getBoundingClientRect();
    const relativeY = clientY - containerRect.top;
    
    // Find insertion point between tasks
    const tasks = Array.from(tasksContainer.children);
    let insertionY = containerRect.top;
    
    if (tasks.length === 0) {
        // Empty column - show at top of tasks container
        insertionY = containerRect.top + 10;
    } else {
        // Find the task that the cursor is above
        let foundPosition = false;
        for (let i = 0; i < tasks.length; i++) {
            const taskRect = tasks[i].getBoundingClientRect();
            const taskCenter = taskRect.top + taskRect.height / 2;
            
            if (clientY < taskCenter) {
                insertionY = taskRect.top - 2;
                foundPosition = true;
                break;
            }
        }
        
        // If not above any task, position after the last task
        if (!foundPosition && tasks.length > 0) {
            const lastTaskRect = tasks[tasks.length - 1].getBoundingClientRect();
            insertionY = lastTaskRect.bottom + 2;
        }
    }
    
    // Position the indicator
    const columnRect = column.getBoundingClientRect();
    indicator.style.position = 'fixed';
    indicator.style.left = (columnRect.left + columnRect.width * 0.1) + 'px';
    indicator.style.right = 'auto';
    indicator.style.width = (columnRect.width * 0.8) + 'px';
    indicator.style.top = insertionY + 'px';
    indicator.style.display = 'block';
    indicator.classList.add('active');
    
    // Add highlight to column
    column.classList.add('external-drag-over');
    currentExternalDropColumn = column;
}

function hideExternalDropIndicator() {
    if (externalDropIndicator) {
        externalDropIndicator.classList.remove('active');
        externalDropIndicator.style.display = 'none';
    }
    
    if (currentExternalDropColumn) {
        currentExternalDropColumn.classList.remove('external-drag-over');
        currentExternalDropColumn = null;
    }
    
    // Remove highlight from all columns
    document.querySelectorAll('.kanban-column').forEach(col => {
        col.classList.remove('external-drag-over');
    });
}

function cleanupExternalDropIndicators() {
    hideExternalDropIndicator();
    if (externalDropIndicator) {
        externalDropIndicator.remove();
        externalDropIndicator = null;
    }
}

function setupGlobalDragAndDrop() {
    const boardContainer = document.getElementById('kanban-container');
    const dropFeedback = document.getElementById('drop-zone-feedback');
    
    // Prevent default drag behaviors on the entire board
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        boardContainer.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    // Enhanced dragover handling with column-specific indicators
    boardContainer.addEventListener('dragover', (e) => {
        if (isExternalFileDrag(e)) {
            const column = e.target.closest('.kanban-column');
            if (column && !column.classList.contains('collapsed')) {
                showExternalDropIndicator(column, e.clientY);
            } else {
                hideExternalDropIndicator();
            }
            showDropFeedback(e);
        }
    }, false);
    
    // Show drop zone feedback - only for external file drags
    ['dragenter'].forEach(eventName => {
        boardContainer.addEventListener(eventName, (e) => {
            if (isExternalFileDrag(e)) {
                showDropFeedback(e);
            }
        }, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        boardContainer.addEventListener(eventName, (e) => {
            // Only hide if we're actually leaving the board area
            if (!boardContainer.contains(e.relatedTarget)) {
                hideDropFeedback(e);
                hideExternalDropIndicator();
            }
        }, false);
    });
    
    // Check if this is an external file drag (not internal task/column drag)
    function isExternalFileDrag(e) {
        const dt = e.dataTransfer;
        if (!dt) return false;
        
        // Check for our specific internal kanban drag identifiers
        const hasKanbanTask = dt.types.includes('application/kanban-task');
        const hasKanbanColumn = dt.types.includes('application/kanban-column');
        if (hasKanbanTask || hasKanbanColumn) {
            return false;
        }
        
        // Check if it's an internal kanban drag by examining data
        const hasInternalData = dt.types.includes('text/plain') || dt.types.includes('application/column-id');
        if (hasInternalData) {
            try {
                const textData = dt.getData('text/plain');
                const columnData = dt.getData('application/column-id');
                if ((textData && (textData.includes('task_') || textData.includes('col_'))) || 
                    (columnData && columnData.includes('col_'))) {
                    return false;
                }
            } catch (e) {
                // getData might fail during dragenter, that's ok
            }
        }
        
        // Check for external file indicators
        const hasFiles = dt.types.includes('Files');
        const hasUriList = dt.types.includes('text/uri-list');
        
        const isExternal = hasFiles || hasUriList;
        
        return isExternal;
    }
    
    // Enhanced document-level handling
    document.addEventListener('dragenter', (e) => {
        if (isExternalFileDrag(e)) {
            showDropFeedback(e);
        }
    });
    
    document.addEventListener('dragleave', (e) => {
        if (!document.body.contains(e.relatedTarget)) {
            hideDropFeedback(e);
            hideExternalDropIndicator();
        }
    });
    
    function showDropFeedback(e) {
        if (dropFeedback) {
            dropFeedback.classList.add('active');
        }
    }
    
    function hideDropFeedback(e) {
        if (dropFeedback) {
            dropFeedback.classList.remove('active');
        }
        boardContainer.classList.remove('drag-highlight');
    }
    
    // Handle dropped files (existing logic)
    boardContainer.addEventListener('drop', handleFileDrop, false);
    document.addEventListener('drop', handleFileDrop, false);
    
    function handleFileDrop(e) {
        hideDropFeedback(e);
        hideExternalDropIndicator(); // Hide the drop indicator
        
        // ... rest of existing handleFileDrop logic remains the same
        if (isProcessingDrop) {
            return;
        }
        
        const dt = e.dataTransfer;
        
        const hasKanbanTask = dt.types.includes('application/kanban-task');
        const hasKanbanColumn = dt.types.includes('application/kanban-column');
        
        if (hasKanbanTask || hasKanbanColumn) {
            return;
        }
        
        const taskId = dt.getData('text/plain');
        const columnId = dt.getData('application/column-id');
        
        if ((taskId && (taskId.includes('task_') || taskId.includes('col_'))) || 
            (columnId && columnId.includes('col_'))) {
            return;
        }
        
        const files = dt.files;
        
        isProcessingDrop = true;
        setTimeout(() => {
            isProcessingDrop = false;
        }, 1000);
        
        if (files && files.length > 0) {
            handleVSCodeFileDrop(e, files);
        } else {
            const uriList = dt.getData('text/uri-list');
            const textPlain = dt.getData('text/plain');
            
            if (uriList) {
                handleVSCodeUriDrop(e, uriList);
            } else if (textPlain && (textPlain.startsWith('file://') || (textPlain.includes('/') && !textPlain.includes('task_') && !textPlain.includes('col_')))) {
                handleVSCodeUriDrop(e, textPlain);
            } else {
                isProcessingDrop = false;
            }
        }
    }
}

function handleVSCodeFileDrop(e, files) {
    const file = files[0];
    const fileName = file.name;
    
    // Send to extension to get proper VS Code URI and handle the drop
    vscode.postMessage({
        type: 'handleFileDrop',
        fileName: fileName,
        dropPosition: {
            x: e.clientX,
            y: e.clientY
        },
        activeEditor: getActiveTextEditor()
    });
}

function handleVSCodeUriDrop(e, uriData) {
    // Parse URI data from VS Code
    const uris = uriData.split('\n').filter(uri => uri.trim()).filter(uri => {
        // Filter out non-file URIs and internal drag data
        const isFile = uri.startsWith('file://') || (uri.includes('/') && !uri.includes('task_') && !uri.includes('col_'));
        return isFile;
    });
    
    if (uris.length > 0) {
        vscode.postMessage({
            type: 'handleUriDrop',
            uris: uris,
            dropPosition: {
                x: e.clientX,
                y: e.clientY
            },
            activeEditor: getActiveTextEditor()
        });
    } else {
        vscode.postMessage({
            type: 'showMessage',
            text: 'Could not process the dropped file. Please try dragging from the Explorer panel.'
        });
    }
}

function getActiveTextEditor() {
    // Check if TaskEditor has an active editor
    if (taskEditor.currentEditor) {
        const editor = taskEditor.currentEditor;
        return {
            type: editor.type.replace('task-', '').replace('-', '-'), // Convert back to original format
            taskId: editor.taskId,
            columnId: editor.columnId,
            cursorPosition: editor.element.selectionStart || 0,
            element: editor.element
        };
    }
    
    return null;
}

function insertFileLink(fileInfo) {
    const { fileName, relativePath, isImage } = fileInfo;
    let activeEditor = fileInfo.activeEditor || getActiveTextEditor();
    
    // Create appropriate markdown link
    let markdownLink;
    if (isImage) {
        // For images, use image syntax
        const altText = fileName.split('.')[0]; // filename without extension
        markdownLink = `![${altText}](${relativePath})`;
    } else {
        // For other files, use link syntax
        markdownLink = `[${fileName}](${relativePath})`;
    }
    
    if (activeEditor && activeEditor.element && 
        document.contains(activeEditor.element) && 
        activeEditor.element.style.display !== 'none') {
        
        // Insert at current cursor position
        const element = activeEditor.element;
        const cursorPos = element.selectionStart || activeEditor.cursorPosition || 0;
        const currentValue = element.value;
        
        const newValue = currentValue.slice(0, cursorPos) + markdownLink + currentValue.slice(cursorPos);
        element.value = newValue;
        
        // Update cursor position
        const newCursorPos = cursorPos + markdownLink.length;
        element.setSelectionRange(newCursorPos, newCursorPos);
        
        // Trigger input event to auto-resize if needed
        element.dispatchEvent(new Event('input'));
        if (typeof autoResize === 'function') {
            autoResize(element);
        }
        
        // FOR IMAGES: Also add to the other field
        if (isImage && (activeEditor.type === 'task-title' || activeEditor.type === 'task-description')) {
            const taskItem = element.closest('.task-item');
            const otherField = activeEditor.type === 'task-title' ? 
                taskItem.querySelector('.task-description-edit') : 
                taskItem.querySelector('.task-title-edit');
            
            if (otherField) {
                const otherValue = otherField.value;
                otherField.value = otherValue ? `${otherValue}\n${markdownLink}` : markdownLink;
                otherField.dispatchEvent(new Event('input'));
                if (typeof autoResize === 'function') {
                    autoResize(otherField);
                }
                // Save the other field too
                setTimeout(() => {
                    // Save through the TaskEditor if it's active
                    if (taskEditor.currentEditor && taskEditor.currentEditor.element === otherField) {
                        taskEditor.saveCurrentField();
                    }
                }, 100);
            }
        }
        
        // Focus back on the element
        element.focus();
        
        // Save the changes immediately
        setTimeout(() => {
            if (element.classList.contains('task-title-edit') || element.classList.contains('task-description-edit')) {
                // If TaskEditor is active, use its save method
                if (taskEditor.currentEditor && taskEditor.currentEditor.element === element) {
                    taskEditor.save();
                }
            } else if (element.classList.contains('column-title-edit')) {
                element.blur();
            }
        }, 50);
        
        vscode.postMessage({ type: 'showMessage', text: `Inserted ${isImage ? 'image' : 'file'} link: ${fileName}` });
    } else {
        // Create new task with the file link
        createNewTaskWithContent(markdownLink, fileInfo.dropPosition, isImage ? markdownLink : '');
        vscode.postMessage({ type: 'showMessage', text: `Created new task with ${isImage ? 'image' : 'file'} link: ${fileName}` });
    }
}

// Track recently created tasks to prevent duplicates
let recentlyCreatedTasks = new Set();
// Track board rendering to prevent rapid re-renders
let renderTimeout = null;

function createNewTaskWithContent(content, dropPosition, description = '') {
    // Check for recent duplicates to prevent spam creation
    if (recentlyCreatedTasks.has(content)) {
        return;
    }
    
    // Add to recent tasks set
    recentlyCreatedTasks.add(content);
    setTimeout(() => recentlyCreatedTasks.delete(content), 2000);
    
    // Find the nearest column (existing logic)...
    const columns = document.querySelectorAll('.kanban-column');
    let targetColumnId = null;
    let insertionIndex = -1;
    let minDistance = Infinity;
    
    columns.forEach(column => {
        const rect = column.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const distance = Math.abs(centerX - dropPosition.x);
        
        if (distance < minDistance) {
            minDistance = distance;
            targetColumnId = column.dataset.columnId;
            insertionIndex = calculateInsertionIndex(column, dropPosition.y);
        }
    });
    
    if (!targetColumnId && currentBoard && currentBoard.columns.length > 0) {
        targetColumnId = currentBoard.columns[0].id;
        insertionIndex = -1;
    }
    
    if (targetColumnId) {
        // Create task data - use description parameter for images
        const taskData = {
            title: content,
            description: description  // Will be the same image link for images, empty for files
        };
        
        vscode.postMessage({
            type: 'addTaskAtPosition',
            columnId: targetColumnId,
            taskData: taskData,
            insertionIndex: insertionIndex
        });
    }
}

function calculateInsertionIndex(column, clientY) {
    const tasksContainer = column.querySelector('.tasks-container');
    if (!tasksContainer) {
        return -1; // Append to end if no tasks container
    }
    
    const tasks = Array.from(tasksContainer.children);
    
    if (tasks.length === 0) {
        return 0; // Insert as first task in empty column
    }
    
    // Find insertion point based on Y position
    for (let i = 0; i < tasks.length; i++) {
        const taskRect = tasks[i].getBoundingClientRect();
        const taskCenter = taskRect.top + taskRect.height / 2;
        
        if (clientY < taskCenter) {
            return i; // Insert before this task
        }
    }
    
    // If not above any task, insert at the end
    return -1; // -1 means append to end
}

// Debounced render function to prevent rapid re-renders
function debouncedRenderBoard() {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
    }
    
    renderTimeout = setTimeout(() => {
        renderBoard();
        renderTimeout = null;
    }, 50); // Small delay to batch updates
}

// Render Kanban board
function renderBoard() {
    console.log('Rendering board:', currentBoard);
    
    const boardElement = document.getElementById('kanban-board');
    if (!boardElement) {
        console.error('Board element not found');
        return;
    }

    // Defensive check for currentBoard
    if (!currentBoard) {
        console.log('No current board, showing empty state');
        boardElement.innerHTML = `
            <div class="empty-board" style="
                text-align: center; 
                padding: 40px; 
                color: var(--vscode-descriptionForeground);
                font-style: italic;
            ">
                No board data available. Please open a Markdown file.
            </div>`;
        return;
    }

    // Ensure columns array exists
    if (!currentBoard.columns) {
        console.log('No columns in board, initializing empty array');
        currentBoard.columns = [];
    }
    
    // Save current scroll positions
    document.querySelectorAll('.tasks-container').forEach(container => {
        const columnId = container.id.replace('tasks-', '');
        scrollPositions.set(columnId, container.scrollTop);
    });

    boardElement.innerHTML = '';

    // Check if board is valid (has proper kanban header)
    if (currentBoard.valid === false) {
        // Show initialize button instead of columns
        const initializeContainer = document.createElement('div');
        initializeContainer.style.cssText = `
            text-align: center; 
            padding: 40px; 
            color: var(--vscode-descriptionForeground);
        `;
        
        initializeContainer.innerHTML = `
            <div style="margin-bottom: 20px; font-size: 16px; text-align: left;">
                This file is not initialized as a Kanban board.<br><br>
                Click the button below to add the required header.<br><br>
                This might overwrite content of the file if not structured correctly!
            </div>
        `;
        
        const initializeBtn = document.createElement('button');
        initializeBtn.className = 'initialise-btn';
        initializeBtn.textContent = 'Initialize File';
        initializeBtn.onclick = () => initializeFile();
        
        initializeContainer.appendChild(initializeBtn);
        boardElement.appendChild(initializeContainer);
        return;
    }

    // Render columns (existing code)
    currentBoard.columns.forEach((column, index) => {
        const columnElement = createColumnElement(column, index);
        boardElement.appendChild(columnElement);
    });

    const addColumnBtn = document.createElement('button');
    addColumnBtn.className = 'add-column-btn';
    addColumnBtn.textContent = '+ Add Column';
    addColumnBtn.onclick = () => addColumn();
    boardElement.appendChild(addColumnBtn);

    // Restore scroll positions
    setTimeout(() => {
        scrollPositions.forEach((scrollTop, columnId) => {
            const container = document.getElementById(`tasks-${columnId}`);
            if (container) {
                container.scrollTop = scrollTop;
            }
        });
    }, 0);

    // Update image sources after rendering
    setTimeout(() => {
        updateImageSources();
    }, 100);
    
    setupDragAndDrop();
}

function initializeFile() {
    vscode.postMessage({
        type: 'initializeFile'
    });
}

function createColumnElement(column, columnIndex) {
    // Defensive checks for column data
    if (!column) {
        return document.createElement('div');
    }

    if (!column.tasks) {
        column.tasks = [];
    }

    const columnDiv = document.createElement('div');
    const isCollapsed = collapsedColumns.has(column.id);
    columnDiv.className = `kanban-column ${isCollapsed ? 'collapsed' : ''}`;
    columnDiv.setAttribute('data-column-id', column.id);
    columnDiv.setAttribute('data-column-index', columnIndex);

    const renderedTitle = column.title ? renderMarkdown(column.title) : '<span class="task-title-placeholder">Add title...</span>';

    columnDiv.innerHTML = `
        <div class="column-header">
            <div class="column-title-section">
                <span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
                <span class="collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleColumnCollapse('${column.id}')">▶</span>
                <div style="display: inline-block;">
                    <div class="column-title" onclick="editColumnTitle('${column.id}')">${renderedTitle}</div>
                    <textarea class="column-title-edit" 
                                data-column-id="${column.id}"
                                style="display: none;">${escapeHtml(column.title || '')}</textarea>
                </div>
            </div>
            <div class="column-controls">
                <span class="task-count">${column.tasks.length}</span>
                <div class="donut-menu">
                    <button class="donut-menu-btn" onclick="toggleDonutMenu(event, this)">⋯</button>
                    <div class="donut-menu-dropdown">
                        <button class="donut-menu-item" onclick="insertColumnBefore('${column.id}')">Insert list before</button>
                        <button class="donut-menu-item" onclick="insertColumnAfter('${column.id}')">Insert list after</button>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item" onclick="copyColumnAsMarkdown('${column.id}')">Copy as markdown</button>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item" onclick="moveColumnLeft('${column.id}')">Move list left</button>
                        <button class="donut-menu-item" onclick="moveColumnRight('${column.id}')">Move list right</button>
                        <div class="donut-menu-divider"></div>
                        <div class="donut-menu-item has-submenu">
                            Sort by
                            <div class="donut-menu-submenu">
                                <button class="donut-menu-item" onclick="sortColumn('${column.id}', 'unsorted')">Unsorted</button>
                                <button class="donut-menu-item" onclick="sortColumn('${column.id}', 'title')">Sort by title</button>
                            </div>
                        </div>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item danger" onclick="deleteColumn('${column.id}')">Delete list</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="tasks-container" id="tasks-${column.id}">
            ${column.tasks.map((task, index) => createTaskElement(task, column.id, index)).join('')}
        </div>
        <button class="add-task-btn" onclick="addTask('${column.id}')">
            + Add Task
        </button>
    `;

    return columnDiv;
}

function createTaskElement(task, columnId, taskIndex) {
    // Defensive checks for task data
    if (!task) {
        return '';
    }

    const renderedDescription = task.description ? renderMarkdown(task.description) : '';
    const renderedTitle = task.title ? renderMarkdown(task.title) : '';
    const isCollapsed = collapsedTasks.has(task.id);
    
    return `
        <div class="task-item ${isCollapsed ? 'collapsed' : ''}" data-task-id="${task.id}" data-column-id="${columnId}" data-task-index="${taskIndex}">
            <div class="task-menu-container">
                <div class="donut-menu">
                    <button class="donut-menu-btn" onclick="toggleDonutMenu(event, this)">⋯</button>
                    <div class="donut-menu-dropdown">
                        <button class="donut-menu-item" onclick="insertTaskBefore('${task.id}', '${columnId}')">Insert card before</button>
                        <button class="donut-menu-item" onclick="insertTaskAfter('${task.id}', '${columnId}')">Insert card after</button>
                        <button class="donut-menu-item" onclick="duplicateTask('${task.id}', '${columnId}')">Duplicate card</button>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item" onclick="copyTaskAsMarkdown('${task.id}', '${columnId}')">Copy as markdown</button>
                        <div class="donut-menu-divider"></div>
                        <div class="donut-menu-item has-submenu">
                            Move
                            <div class="donut-menu-submenu">
                                <button class="donut-menu-item" onclick="moveTaskToTop('${task.id}', '${columnId}')">Top</button>
                                <button class="donut-menu-item" onclick="moveTaskUp('${task.id}', '${columnId}')">Up</button>
                                <button class="donut-menu-item" onclick="moveTaskDown('${task.id}', '${columnId}')">Down</button>
                                <button class="donut-menu-item" onclick="moveTaskToBottom('${task.id}', '${columnId}')">Bottom</button>
                            </div>
                        </div>
                        <div class="donut-menu-item has-submenu">
                            Move to list
                            <div class="donut-menu-submenu">
                                ${currentBoard && currentBoard.columns ? currentBoard.columns.map(col => 
                                    col.id !== columnId ? 
                                    `<button class="donut-menu-item" onclick="moveTaskToColumn('${task.id}', '${columnId}', '${col.id}')">${escapeHtml(col.title || 'Untitled')}</button>` : ''
                                ).join('') : ''}
                            </div>
                        </div>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item danger" onclick="deleteTask('${task.id}', '${columnId}')">Delete card</button>
                    </div>
                </div>
            </div>
            
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <span class="task-collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleTaskCollapse('${task.id}')">▶</span>
                <div class="task-title-container" onclick="editTitle(this, '${task.id}', '${columnId}')">
                    <div class="task-title-display markdown-content" 
                            data-task-id="${task.id}" 
                            data-column-id="${columnId}">${renderedTitle || '<span class="task-title-placeholder">Add title...</span>'}</div>
                    <textarea class="task-title-edit" 
                                data-task-id="${task.id}" 
                                data-column-id="${columnId}"
                                data-field="title"
                                placeholder="Task title (Markdown supported)..."
                                style="display: none;">${escapeHtml(task.title || '')}</textarea>
                </div>
            </div>

            <div class="task-description-container">
                <div class="task-description-display markdown-content" 
                        data-task-id="${task.id}" 
                        data-column-id="${columnId}"
                        onclick="editDescription(this)"
                        style="${task.description ? '' : 'display: none;'}">${renderedDescription}</div>
                <textarea class="task-description-edit" 
                            data-task-id="${task.id}" 
                            data-column-id="${columnId}"
                            data-field="description"
                            placeholder="Add description (Markdown supported)..."
                            style="display: none;">${escapeHtml(task.description || '')}</textarea>
                ${!task.description ? `<div class="task-description-placeholder" onclick="editDescription(this, '${task.id}', '${columnId}')">Add description...</div>` : ''}
            </div>
        </div>
    `;
}

// Toggle functions
function toggleColumnCollapse(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    const toggle = column.querySelector('.collapse-toggle');
    
    if (collapsedColumns.has(columnId)) {
        collapsedColumns.delete(columnId);
        column.classList.remove('collapsed');
        toggle.classList.remove('rotated');
    } else {
        collapsedColumns.add(columnId);
        column.classList.add('collapsed');
        toggle.classList.add('rotated');
    }
}

function toggleTaskCollapse(taskId) {
    const task = document.querySelector(`[data-task-id="${taskId}"]`);
    const toggle = task.querySelector('.task-collapse-toggle');
    
    if (collapsedTasks.has(taskId)) {
        collapsedTasks.delete(taskId);
        task.classList.remove('collapsed');
        toggle.classList.remove('rotated');
    } else {
        collapsedTasks.add(taskId);
        task.classList.add('collapsed');
        toggle.classList.add('rotated');
    }
}

// Donut menu functions
function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // Close all other menus
    document.querySelectorAll('.donut-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    // Toggle this menu
    if (!wasActive) {
        menu.classList.add('active');
    }
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.donut-menu') || e.target.matches('button.donut-menu-item')) {
        document.querySelectorAll('.donut-menu').forEach(menu => {
            menu.classList.remove('active');
        });
    }
});

// Column operations
function insertColumnBefore(columnId) {
    showInputModal(
        'Insert Column Before',
        'Enter column title:',
        'Column title...',
        title => {
            vscode.postMessage({
                type: 'insertColumnBefore',
                columnId: columnId,
                title: title
            });
        }
    );
}

function insertColumnAfter(columnId) {
    showInputModal(
        'Insert Column After',
        'Enter column title:',
        'Column title...',
        title => {
            vscode.postMessage({
                type: 'insertColumnAfter',
                columnId: columnId,
                title: title
            });
        }
    );
}

function moveColumnLeft(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index > 0) {
        vscode.postMessage({
            type: 'moveColumn',
            fromIndex: index,
            toIndex: index - 1
        });
    }
}

function moveColumnRight(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index < currentBoard.columns.length - 1) {
        vscode.postMessage({
            type: 'moveColumn',
            fromIndex: index,
            toIndex: index + 1
        });
    }
}

function deleteColumn(columnId) {
    vscode.postMessage({
        type: 'deleteColumn',
        columnId: columnId
    });
}

function sortColumn(columnId, sortType) {
    vscode.postMessage({
        type: 'sortColumn',
        columnId: columnId,
        sortType: sortType
    });
}


// Copy as markdown functions
function copyColumnAsMarkdown(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    let markdown = `# ${column.title}\n`;
    
    column.tasks.forEach(task => {
        if (task.title.startsWith('#')) {
            markdown += `\n---\n\n${task.title || ''}\n`;
        }
        else {
            markdown += `\n---\n\n## ${task.title || ''}\n`;
        }
        if (task.description.trim()) {
            // const descLines = task.description.split('\n');
            markdown += `\n${task.description}\n`;
            // descLines.forEach(line => {
            //     markdown += `${line}\n`;
            // });
        }
    });
    
    copyToClipboard(markdown);
}

function copyTaskAsMarkdown(taskId, columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const task = column.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let markdown = ``;
    if (task.title.startsWith('#')) {
        markdown += `${task.title || ''}\n`;
    }
    else {
        markdown += `## ${task.title || ''}\n`;
    }
    // markdown = `## ${task.title || ''}\n`;
    if (task.description && task.description.trim()) {
        // const descLines = task.description.split('\n');
        // descLines.forEach(line => {
        //     markdown += `${line}\n`;
        // });
        markdown += `\n${task.description}\n`;
    }
    
    copyToClipboard(markdown);
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            vscode.postMessage({ type: 'showMessage', text: 'Copied to clipboard!' });
        }).catch(err => {
            console.error('Failed to copy:', err);
        });
    }
}

// Task operations
function duplicateTask(taskId, columnId) {
    vscode.postMessage({
        type: 'duplicateTask',
        taskId: taskId,
        columnId: columnId
    });
}

function insertTaskBefore(taskId, columnId) {
    vscode.postMessage({
        type: 'insertTaskBefore',
        taskId: taskId,
        columnId: columnId
    });
}

function insertTaskAfter(taskId, columnId) {
    vscode.postMessage({
        type: 'insertTaskAfter',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskToTop(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskToTop',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskUp(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskUp',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskDown(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskDown',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskToBottom(taskId, columnId) {
    vscode.postMessage({
        type: 'moveTaskToBottom',
        taskId: taskId,
        columnId: columnId
    });
}

function moveTaskToColumn(taskId, fromColumnId, toColumnId) {
    vscode.postMessage({
        type: 'moveTaskToColumn',
        taskId: taskId,
        fromColumnId: fromColumnId,
        toColumnId: toColumnId
    });
}

function deleteTask(taskId, columnId) {
    vscode.postMessage({
        type: 'deleteTask',
        taskId: taskId,
        columnId: columnId
    });
}

function addTask(columnId) {
    const taskData = {
        title: '',
        description: ''
    };

    vscode.postMessage({
        type: 'addTask',
        columnId: columnId,
        taskData: taskData
    });
}

function addColumn() {
    vscode.postMessage({
        type: 'addColumn',
        title: ''  // Empty title - will be editable inline
    });
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function renderMarkdown(text) {
    if (!text) return '';
    
    try {
        const renderer = new marked.Renderer();
        
        // Strict image renderer - MUST have webview URIs
        renderer.image = function(href, title, text) {
            
            // ONLY accept properly converted URIs
            if (href.startsWith('vscode-webview://')) {
                return `<img src="${href}" alt="${escapeHtml(text || '')}" title="${escapeHtml(title || '')}" />`;
            }
            
            // External URLs are OK
            if (href.startsWith('https://') || href.startsWith('http://')) {
                return `<img src="${href}" alt="${escapeHtml(text || '')}" title="${escapeHtml(title || '')}" />`;
            }
            
            // Data URIs are OK (including error placeholders)
            if (href.startsWith('data:')) {
                return `<img src="${href}" alt="${escapeHtml(text || '')}" title="${escapeHtml(title || '')}" />`;
            }
            
            // ANYTHING ELSE IS AN ERROR
            console.error(`ERROR: Unconverted image path in markdown: ${href}`);
            return `<div style="color: red; border: 2px solid red; padding: 10px;">IMAGE ERROR: Unconverted path: ${escapeHtml(href)}</div>`;
        };
        
        // Strict link renderer
        renderer.link = function(href, title, text) {
            // Webview URIs should not be clickable
            if (href.startsWith('vscode-webview://')) {
                return `<span class="webview-uri-text">${text}</span>`;
            }
            
            const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
            return `<a href="javascript:void(0)" data-original-href="${escapeHtml(href)}"${titleAttr} class="markdown-link">${text}</a>`;
        };
        
        marked.setOptions({
            breaks: true,
            gfm: true,
            renderer: renderer
        });
        
        const rendered = marked.parse(text);
        
        // Remove paragraph wrapping for single line content
        if (!text.includes('\n') && rendered.startsWith('<p>') && rendered.endsWith('</p>\n')) {
            return rendered.slice(3, -5);
        }
        
        return rendered;
    } catch (error) {
        console.error('CRITICAL: Error rendering markdown:', error);
        return `<div style="color: red;">RENDER ERROR: ${escapeHtml(text)}</div>`;
    }
}

// Drag and drop setup
function setupDragAndDrop() {
    // Only set up global drag/drop once to prevent multiple listeners
    if (!dragDropInitialized) {
        setupGlobalDragAndDrop();
        dragDropInitialized = true;
    }
    
    // Always refresh column and task drag/drop since DOM changes
    setupColumnDragAndDrop();
    setupTaskDragAndDrop();
}

function setupColumnDragAndDrop() {
    const boardElement = document.getElementById('kanban-board');
    const columns = boardElement.querySelectorAll('.kanban-column');
    let draggedColumn = null;

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) return;

        dragHandle.addEventListener('dragstart', e => {
            draggedColumn = column;
            const columnId = column.getAttribute('data-column-id');
            
            // Set specific data to identify this as internal kanban drag
            e.dataTransfer.setData('text/plain', columnId);
            e.dataTransfer.setData('application/column-id', columnId);
            e.dataTransfer.setData('application/kanban-column', columnId); // Additional identifier
            e.dataTransfer.effectAllowed = 'move';
            column.classList.add('column-dragging');
        });

        dragHandle.addEventListener('dragend', e => {
            column.classList.remove('column-dragging');
            columns.forEach(col => col.classList.remove('drag-over'));
        });

        column.addEventListener('dragover', e => {
            e.preventDefault();
            if (draggedColumn && draggedColumn !== column) {
                column.classList.add('drag-over');
            }
        });

        column.addEventListener('dragleave', e => {
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        });

        column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');

            if (draggedColumn && draggedColumn !== column) {
                const fromId = draggedColumn.getAttribute('data-column-id');
                const toId = column.getAttribute('data-column-id');
                const fromIndex = getOriginalColumnIndex(fromId);
                const toIndex = getOriginalColumnIndex(toId);
                
                if (fromIndex !== -1 && toIndex !== -1) {
                    vscode.postMessage({
                        type: 'moveColumn',
                        fromIndex: fromIndex,
                        toIndex: toIndex
                    });
                }
            }
            draggedColumn = null;
        });
    });
}

function setupTaskDragAndDrop() {
    document.querySelectorAll('.kanban-column').forEach(columnElement => {
        const columnId = columnElement.dataset.columnId;
        const tasksContainer = columnElement.querySelector('.tasks-container');

        if (!tasksContainer) return;

        tasksContainer.addEventListener('dragover', e => {
            e.preventDefault();
            columnElement.classList.add('drag-over');
            
            const draggingElement = document.querySelector('.task-item.dragging');
            if (draggingElement) {
                const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY);
                
                tasksContainer.querySelectorAll('.task-item').forEach(task => {
                    task.classList.remove('drag-insert-before', 'drag-insert-after');
                });
                
                if (afterElement == null) {
                    const lastTask = tasksContainer.querySelector('.task-item:last-child');
                    if (lastTask && lastTask !== draggingElement) {
                        lastTask.classList.add('drag-insert-after');
                    }
                } else if (afterElement !== draggingElement) {
                    afterElement.classList.add('drag-insert-before');
                }
            }
        });

        tasksContainer.addEventListener('dragleave', e => {
            if (!columnElement.contains(e.relatedTarget)) {
                columnElement.classList.remove('drag-over');
                tasksContainer.querySelectorAll('.task-item').forEach(task => {
                    task.classList.remove('drag-insert-before', 'drag-insert-after');
                });
            }
        });

        tasksContainer.addEventListener('drop', e => {
            e.preventDefault();
            columnElement.classList.remove('drag-over');
            
            tasksContainer.querySelectorAll('.task-item').forEach(task => {
                task.classList.remove('drag-insert-before', 'drag-insert-after');
            });

            const taskId = e.dataTransfer.getData('text/plain');
            const fromColumnId = e.dataTransfer.getData('application/column-id');

            if (taskId && fromColumnId) {
                const dropIndex = calculateDropIndex(tasksContainer, e.clientY);
                
                vscode.postMessage({
                    type: 'moveTask',
                    taskId: taskId,
                    fromColumnId: fromColumnId,
                    toColumnId: columnId,
                    newIndex: dropIndex
                });
            }
        });

        columnElement.querySelectorAll('.task-drag-handle').forEach(handle => {
            setupTaskDragHandle(handle);
        });
    });
}

function setupTaskDragHandle(handle) {
    handle.draggable = true;
    
    handle.addEventListener('dragstart', e => {
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            e.stopPropagation();
            const taskId = taskItem.dataset.taskId;
            const columnId = taskItem.dataset.columnId;
            
            // Set specific data to identify this as internal kanban drag
            e.dataTransfer.setData('text/plain', taskId);
            e.dataTransfer.setData('application/column-id', columnId);
            e.dataTransfer.setData('application/kanban-task', taskId); // Additional identifier
            e.dataTransfer.effectAllowed = 'move';
            taskItem.classList.add('dragging');
        }
    });

    handle.addEventListener('dragend', e => {
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            taskItem.classList.remove('dragging');
        }
    });
}

function getDragAfterTaskElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.task-item:not(.dragging)')];
    
    return draggableElements.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = y - box.top - box.height / 2;
        
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function calculateDropIndex(tasksContainer, clientY) {
    const tasks = Array.from(tasksContainer.children);
    let dropIndex = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        const taskElement = tasks[i];
        const rect = taskElement.getBoundingClientRect();
        const taskCenter = rect.top + rect.height / 2;

        if (clientY < taskCenter) {
            dropIndex = i;
            break;
        }
    }

    return dropIndex;
}

function getOriginalColumnIndex(columnId) {
    if (!currentBoard || !currentBoard.columns) return -1;
    return currentBoard.columns.findIndex(col => col.id === columnId);
}

// Modal functions
function showInputModal(title, message, placeholder, onConfirm) {
    document.getElementById('input-modal-title').textContent = title;
    document.getElementById('input-modal-message').textContent = message;
    const inputField = document.getElementById('input-modal-field');
    inputField.placeholder = placeholder;
    inputField.value = '';
    document.getElementById('input-modal').style.display = 'block';

    setTimeout(() => inputField.focus(), 100);

    const confirmAction = () => {
        const value = inputField.value.trim();
        if (value) {
            closeInputModal();
            onConfirm(value);
        }
    };

    const confirmBtn = document.getElementById('input-ok-btn');
    confirmBtn.onclick = confirmAction;

    inputField.onkeydown = e => {
        if (e.key === 'Enter') {
            confirmAction();
        }
    };
}

function closeInputModal() {
    document.getElementById('input-modal').style.display = 'none';
}

document.getElementById('input-modal').addEventListener('click', e => {
    if (e.target.id === 'input-modal') {
        closeInputModal();
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// File management functions
function updateFileInfoBar() {
    if (!currentFileInfo) return;

    const fileNameElement = document.getElementById('file-name');
    const lockStatusElement = document.getElementById('lock-status');
    const lockToggleBtnElement = document.getElementById('lock-toggle-btn');
    const lockBtnTextElement = document.getElementById('lock-btn-text');

    if (fileNameElement) {
        fileNameElement.textContent = currentFileInfo.fileName;
        fileNameElement.title = currentFileInfo.filePath || currentFileInfo.fileName;
    }

    if (lockStatusElement && lockToggleBtnElement && lockBtnTextElement) {
        if (currentFileInfo.isLocked) {
            lockStatusElement.textContent = '🔒';
            lockStatusElement.title = 'File is locked - will not auto-switch';
            lockStatusElement.classList.add('locked');
            lockBtnTextElement.textContent = 'Unlock';
            lockToggleBtnElement.classList.add('locked');
        } else {
            lockStatusElement.textContent = '🔓';
            lockStatusElement.title = 'File is unlocked - will auto-switch with active editor';
            lockStatusElement.classList.remove('locked');
            lockBtnTextElement.textContent = 'Lock';
            lockToggleBtnElement.classList.remove('locked');
        }
    }
    
    // Update undo/redo buttons when file info changes
    updateUndoRedoButtons();
}

function toggleFileLock() {
    vscode.postMessage({ type: 'toggleFileLock' });
}

function selectFile() {
    vscode.postMessage({ type: 'selectFile' });
}

