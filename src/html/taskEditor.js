/**
 * TaskEditor Class - Manages inline editing of titles and descriptions
 * Purpose: Provides in-place editing functionality for all text fields
 * Used by: Column titles, task titles, task descriptions
 * Features: Tab transitions, auto-resize, save/cancel with keyboard
 */
class TaskEditor {
    constructor() {
        this.currentEditor = null;
        this.isTransitioning = false;
        this.keystrokeTimeout = null;
        this.lastEditContext = null; // Track what was last being edited
        this.setupGlobalHandlers();
    }

    /**
     * Sets up global keyboard and mouse event handlers
     * Purpose: Handle editing interactions across the entire document
     * Used by: Constructor on initialization
     * Handles: Tab, Enter, Escape keys, click outside to save
     */
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

    /**
     * Starts editing mode for an element
     * Purpose: Switch from display to edit mode
     * Used by: Click handlers on editable elements
     * @param {HTMLElement} element - Element to edit
     * @param {string} type - 'task-title', 'task-description', 'column-title'
     * @param {string} taskId - Task ID if editing task
     * @param {string} columnId - Column ID
     */
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
            containerElement = element.closest('.kanban-full-height-column') || element;
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
        
        
        // Reset edit context when starting a new edit session on a different field
        const newEditContext = type === 'column-title' 
            ? `column-title-${columnId}` 
            : `${type}-${taskId || editElement.dataset.taskId}-${columnId}`;
            
        
        // Don't reset context here - let saveCurrentField determine if it's different
        // This was the bug: resetting to null made every save think it was a new field

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

    /**
     * Transitions from title editing to description editing
     * Purpose: Smooth Tab key navigation between fields
     * Used by: Tab key handler when editing title
     * Side effects: Saves title, starts description edit
     */
    transitionToDescription() {
        if (!this.currentEditor || this.currentEditor.type !== 'task-title') return;
        
        this.isTransitioning = true;
        
        const taskId = this.currentEditor.taskId;
        const columnId = this.currentEditor.columnId;
        const taskItem = this.currentEditor.element.closest('.task-item');
        
        // Update local state (undo state will be saved when editing completes)
        const value = this.currentEditor.element.value;
        if (currentBoard && currentBoard.columns) {
            const column = currentBoard.columns.find(c => c.id === columnId);
            const task = column?.tasks.find(t => t.id === taskId);
            if (task) {
                task.title = value;
                if (this.currentEditor.displayElement) {
                    this.currentEditor.displayElement.innerHTML = renderMarkdown(value);
                }
                
                // Mark as unsaved since we made a change
                if (typeof markUnsavedChanges === 'function') {
                    markUnsavedChanges();
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

    /**
     * Saves current edit and exits edit mode
     * Purpose: Commit changes to data model
     * Used by: Enter key, click outside, blur events
     * Side effects: Updates pending changes, closes editor
     */
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
                    // Get current row and span to preserve them
                    const currentRow = getColumnRow(column.title);
                    const spanMatch = column.title.match(/#span(\d+)\b/i);
                    const currentSpan = spanMatch ? spanMatch[0] : null;

                    // Clean the value of any row tags and span tags
                    let cleanValue = value
                        .replace(/#row\d+\b/gi, '')
                        .replace(/\s+#row\d+/gi, '')
                        .replace(/#row\d+\s+/gi, '')
                        .replace(/#span\d+\b/gi, '')
                        .replace(/\s+#span\d+/gi, '')
                        .replace(/#span\d+\s+/gi, '')
                        .replace(/\s{2,}/g, ' ')
                        .trim();

                    // Check if the title actually changed (excluding filtered tags)
                    const oldCleanTitle = window.filterTagsFromText(column.title);
                    if (oldCleanTitle !== cleanValue) {
                        // Create context for this edit to determine if it's the same column being edited
                        const editContext = `column-title-${columnId}`;
                        
                        
                        // CRITICAL FIX: Save undo state BEFORE making the change
                        this.saveUndoStateImmediately('editColumnTitle', null, columnId);
                        
                        this.lastEditContext = editContext;
                        
                        // Now make the change AFTER saving the undo state
                        // Reconstruct title with preserved tags
                        let newTitle = cleanValue;

                        // Re-add row tag if needed
                        if (currentRow > 1) {
                            newTitle += ` #row${currentRow}`;
                        }

                        // Re-add span tag if it existed
                        if (currentSpan) {
                            newTitle += ` ${currentSpan}`;
                        }

                        column.title = newTitle;
                        
                        // Mark as unsaved since we made a change
                        if (typeof markUnsavedChanges === 'function') {
                            markUnsavedChanges();
                        }
                    }
                    
                    if (this.currentEditor.displayElement) {
                        // Display with tag filtering based on visibility setting
                        const displayTitle = window.filterTagsFromText(column.title);
                        this.currentEditor.displayElement.innerHTML = renderMarkdown(displayTitle);

                        // Add row indicator if needed
                        if (window.showRowTags && currentRow > 1) {
                            this.currentEditor.displayElement.innerHTML += `<span class="column-row-tag">Row ${currentRow}</span>`;
                        }
                    }

                    // Update column CSS classes for span tags
                    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
                    if (columnElement) {
                        // Remove old span classes
                        columnElement.classList.remove('column-span-2', 'column-span-3', 'column-span-4');

                        // Check for new span tag (only if no global column width override)
                        const spanMatch = column.title.match(/#span(\d+)\b/i);
                        const hasGlobalColumnWidth = window.currentColumnWidth && (window.currentColumnWidth === '66' || window.currentColumnWidth === '100');
                        if (spanMatch && !hasGlobalColumnWidth) {
                            const spanCount = parseInt(spanMatch[1]);
                            if (spanCount >= 2 && spanCount <= 4) {
                                columnElement.classList.add(`column-span-${spanCount}`);
                            }
                        }

                        // Also update tag-based styling
                        const newTag = window.extractFirstTag ? window.extractFirstTag(column.title) : null;
                        if (newTag && !newTag.startsWith('row') && !newTag.startsWith('gather_') && !newTag.startsWith('span')) {
                            columnElement.setAttribute('data-column-tag', newTag);
                        } else {
                            columnElement.removeAttribute('data-column-tag');
                        }

                        // Regenerate tag styles to apply any new tag colors
                        if (typeof applyTagStyles === 'function') {
                            applyTagStyles();
                        }
                    }
                    
                    // Store pending change locally instead of sending immediately
                    if (!window.pendingColumnChanges) {
                        window.pendingColumnChanges = new Map();
                    }
                    window.pendingColumnChanges.set(columnId, { columnId, title: cleanValue });
                    
                    // Update refresh button state
                    const totalPending = (window.pendingColumnChanges?.size || 0) + (window.pendingTaskChanges?.size || 0);
                    if (window.updateRefreshButtonState) {
                        window.updateRefreshButtonState('pending', totalPending);
                    }
                    
                }
            } else if (type === 'task-title' || type === 'task-description') {
                const column = currentBoard.columns.find(c => c.id === columnId);
                const task = column?.tasks.find(t => t.id === taskId);
                
                if (task) {
                    if (type === 'task-title') {
                        // Handle task title
                        if (task.title !== value) {
                            const editContext = `${type}-${taskId}-${columnId}`;

                            // Save undo state BEFORE making the change
                            this.saveUndoStateImmediately('editTaskTitle', taskId, columnId);
                            this.lastEditContext = editContext;

                            // Update the title
                            task.title = value;
                        }
                    } else if (type === 'task-description') {
                        // Handle task description
                        const currentRawValue = task.description || '';
                        if (currentRawValue !== value) {
                            const editContext = `${type}-${taskId}-${columnId}`;

                            // Save undo state BEFORE making the change
                            this.saveUndoStateImmediately('editTaskDescription', taskId, columnId);
                            this.lastEditContext = editContext;

                            // Update description (frontend will handle include processing)
                            task.description = value;
                        }
                    }

                    // Mark as unsaved and send the specific change to backend if any change was made
                    const wasChanged = (type === 'task-title' && task.title === value) ||
                                      (type === 'task-description' && task.description === value);

                    if (wasChanged) {
                        if (typeof markUnsavedChanges === 'function') {
                            markUnsavedChanges();
                        }

                        // Send specific task update to backend
                        if (typeof vscode !== 'undefined') {
                            const field = type === 'task-title' ? 'title' : 'description';
                            const valueToSend = type === 'task-description' ? task.description : value;
                            vscode.postMessage({
                                type: 'updateTaskInBackend',
                                taskId: taskId,
                                columnId: columnId,
                                field: field,
                                value: valueToSend
                            });
                        }
                    }
                    
                    if (this.currentEditor.displayElement) {
                        if (value.trim()) {
                            // For task descriptions, render the processed description (with includes expanded)
                            // For task titles, render the value as-is
                            const displayValue = (type === 'task-description') ? task.description || value : value;
                            this.currentEditor.displayElement.innerHTML = renderMarkdown(displayValue);
                            this.currentEditor.displayElement.style.display = 'block';
                        } else {
                            // Handle empty values for both titles and descriptions
                            if (type === 'task-description') {
                                this.currentEditor.displayElement.style.display = 'none';
                                const placeholder = element.closest('.task-description-container')
                                    ?.querySelector('.task-description-placeholder');
                                if (placeholder) placeholder.style.display = 'block';
                            } else if (type === 'task-title') {
                                // For empty titles, show empty content but keep element visible
                                this.currentEditor.displayElement.innerHTML = '';
                                this.currentEditor.displayElement.style.display = 'block';
                            }
                        }
                    }

                    // Update task element styling if this is a task title edit
                    if (type === 'task-title') {
                        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                        if (taskElement) {
                            // Update tag-based styling
                            const newTag = window.extractFirstTag ? window.extractFirstTag(task.title) : null;
                            if (newTag && !newTag.startsWith('row') && !newTag.startsWith('gather_') && !newTag.startsWith('span')) {
                                taskElement.setAttribute('data-task-tag', newTag);
                            } else {
                                taskElement.removeAttribute('data-task-tag');
                            }

                            // Regenerate tag styles to apply any new tag colors
                            if (typeof applyTagStyles === 'function') {
                                applyTagStyles();
                            }
                        }
                    }
                    
                    // Store pending change locally instead of sending immediately
                    if (!window.pendingTaskChanges) {
                        window.pendingTaskChanges = new Map();
                    }
                    window.pendingTaskChanges.set(taskId, { taskId, columnId, taskData: task });
                    
                    // Update refresh button state
                    const totalPending = (window.pendingColumnChanges?.size || 0) + (window.pendingTaskChanges?.size || 0);
                    if (window.updateRefreshButtonState) {
                        window.updateRefreshButtonState('pending', totalPending);
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


    /**
     * Saves undo state immediately for different operations
     * Purpose: Immediate undo state for switching between different cards/columns
     * @param {string} operation - The operation type
     * @param {string} taskId - Task ID (null for column operations)
     * @param {string} columnId - Column ID
     */
    saveUndoStateImmediately(operation, taskId, columnId) {
        // Clear any pending keystroke timeout since this is a different operation
        if (this.keystrokeTimeout) {
            clearTimeout(this.keystrokeTimeout);
            this.keystrokeTimeout = null;
        }
        
        vscode.postMessage({ 
            type: 'saveUndoState', 
            operation: operation,
            taskId: taskId,
            columnId: columnId,
            currentBoard: window.cachedBoard
        });
    }

    /**
     * Schedules undo state saving with debouncing for same-field keystrokes
     * Purpose: Group keystrokes within the same field to avoid excessive undo states
     * @param {string} operation - The operation type
     * @param {string} taskId - Task ID (null for column operations)
     * @param {string} columnId - Column ID
     */
    scheduleKeystrokeUndoSave(operation, taskId, columnId) {
        // Clear existing timeout to debounce keystrokes
        if (this.keystrokeTimeout) {
            clearTimeout(this.keystrokeTimeout);
        }
        
        
        // Schedule undo state saving after keystroke delay
        this.keystrokeTimeout = setTimeout(() => {
            vscode.postMessage({ 
                type: 'saveUndoState', 
                operation: operation,
                taskId: taskId,
                columnId: columnId,
                currentBoard: window.cachedBoard
            });
            this.keystrokeTimeout = null;
        }, 500); // 500ms delay to group keystrokes within same field
    }

    /**
     * Auto-resizes textarea to fit content
     * Purpose: Dynamic height adjustment for better UX
     * Used by: Input events on textareas
     * @param {HTMLTextAreaElement} textarea - Textarea to resize
     */
    autoResize(textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
}

// Initialize the editor system
const taskEditor = new TaskEditor();
window.taskEditor = taskEditor;

/**
 * Triggers title editing for a task
 * Purpose: Public API for starting task title edit
 * Used by: onclick handlers in task HTML
 * @param {HTMLElement} element - Title element
 * @param {string} taskId - Task ID
 * @param {string} columnId - Parent column ID
 */
function editTitle(element, taskId, columnId) {
    // Don't start editing if we're already editing this field
    if (taskEditor.currentEditor && 
        taskEditor.currentEditor.type === 'task-title' &&
        taskEditor.currentEditor.taskId === taskId &&
        taskEditor.currentEditor.columnId === columnId) {
        return; // Already editing this title
    }
    taskEditor.startEdit(element, 'task-title', taskId, columnId);
}

/**
 * Triggers description editing for a task
 * Purpose: Public API for starting task description edit
 * Used by: onclick handlers in task HTML
 * @param {HTMLElement} element - Description element
 * @param {string} taskId - Task ID
 * @param {string} columnId - Parent column ID
 */
function editDescription(element, taskId, columnId) {
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

/**
 * Triggers title editing for a column
 * Purpose: Public API for starting column title edit
 * Used by: onclick handlers in column HTML
 * @param {string} columnId - Column ID to edit
 */
function editColumnTitle(columnId) {
    // Don't start editing if we're already editing this column
    if (taskEditor.currentEditor &&
        taskEditor.currentEditor.type === 'column-title' &&
        taskEditor.currentEditor.columnId === columnId) {
        return; // Already editing this column title
    }
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column) {
        taskEditor.startEdit(column, 'column-title', null, columnId);
    }
}