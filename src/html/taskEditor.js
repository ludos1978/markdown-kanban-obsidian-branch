class TaskEditor {
    constructor() {
        this.currentEditor = null;
        this.isTransitioning = false;
        this.setupGlobalHandlers();
    }

    setupGlobalHandlers() {
        console.log(`TaskEditor.setupGlobalHandlers`);

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

        // Improved global click handler that doesn't interfere with text selection
        document.addEventListener('click', (e) => {
            // Don't close menus or interfere if we're clicking inside an editor
            if (this.currentEditor && this.currentEditor.element && 
                this.currentEditor.element.contains(e.target)) {
                return; // Allow normal text selection and editing behavior
            }
            
            // Only close menus if clicking outside both menu and editor
            if (!e.target.closest('.donut-menu')) {
                document.querySelectorAll('.donut-menu.active').forEach(menu => {
                    menu.classList.remove('active');
                });
            }
        });

        // Prevent interference with text selection during editing
        document.addEventListener('mousedown', (e) => {
            // If we're in editing mode and clicking within the editor, don't interfere
            if (this.currentEditor && this.currentEditor.element && 
                this.currentEditor.element.contains(e.target)) {
                return; // Allow normal text selection behavior
            }
        });

        document.addEventListener('mouseup', (e) => {
            // If we're in editing mode and within the editor, don't interfere
            if (this.currentEditor && this.currentEditor.element && 
                this.currentEditor.element.contains(e.target)) {
                return; // Allow normal text selection behavior
            }
        });
    }

    startEdit(element, type, taskId = null, columnId = null) {
        // If transitioning, don't interfere
        if (this.isTransitioning) return;
        
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

        // Check if we're already editing this exact element
        const isAlreadyEditing = this.currentEditor && 
                                this.currentEditor.element === editElement &&
                                editElement.style.display !== 'none';

        // If we're already editing this element, don't interfere - let the user continue
        if (isAlreadyEditing) {
            return;
        }

        // Save any current editor first (different element)
        if (this.currentEditor && !this.isTransitioning) {
            this.save();
        }

        // Show edit element, hide display
        if (displayElement) displayElement.style.display = 'none';
        editElement.style.display = 'block';
        
        // Auto-resize if textarea
        this.autoResize(editElement);
        
        // Focus and position cursor at end (only for new edit sessions)
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
        editElement.onblur = (e) => {
            // Don't save on blur if the user is just selecting text or if we're transitioning
            if (!this.isTransitioning) {
                // Give a small delay to allow for double-clicks and text selection
                setTimeout(() => {
                    // Only save if we're still not focused and not transitioning
                    if (document.activeElement !== editElement && !this.isTransitioning) {
                        this.save();
                    }
                }, 50);
            }
        };

        // Improved selection handling for better text editing experience
        editElement.addEventListener('mousedown', (e) => {
            e.stopPropagation(); // Prevent other handlers from interfering
        });

        editElement.addEventListener('dblclick', (e) => {
            e.stopPropagation(); // Prevent other handlers from interfering with double-click selection
        });
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
        
        // Clean up event listeners
        element.onblur = null;
        element.oninput = null;
        element.removeEventListener('mousedown', this._handleMouseDown);
        element.removeEventListener('dblclick', this._handleDblClick);
        
        // Hide edit element
        element.style.display = 'none';
        
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
window.taskEditor = taskEditor;

// Simplified edit trigger functions
function editTitle(element, taskId, columnId) {
    console.log(`editDescription ${element} ${taskId} ${columnId}`);

    // Don't start editing if we're already editing this field
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'task-title' &&
        taskEditor.currentEditor.taskId === taskId &&
        taskEditor.currentEditor.columnId === columnId) {
        return; // Already editing this title
    }
    taskEditor.startEdit(element, 'task-title', taskId, columnId);
}

function editDescription(element, taskId, columnId) {
    console.log(`editDescription ${element} ${taskId} ${columnId}`);

    // Don't start editing if we're already editing this field
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'task-description' &&
        taskEditor.currentEditor.taskId === taskId &&
        taskEditor.currentEditor.columnId === columnId) {
        return; // Already editing this description
    }
    // Find the actual container if needed
    const container = element.closest('.task-description-container') || element;
    taskEditor.startEdit(container, 'task-description', taskId, columnId);
}

function editColumnTitle(columnId) {
    console.log(`editColumnTitle ${columnId}`);

    // Don't start editing if we're already editing this column
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'column-title' &&
        taskEditor.currentEditor.columnId === columnId) {
        return; // Already editing this column title
    }
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column && !column.classList.contains('collapsed')) {
        taskEditor.startEdit(column, 'column-title', null, columnId);
    }
}