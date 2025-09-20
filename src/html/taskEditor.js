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
     * Get current editing state and content for saving
     * Purpose: Allow saving board while editing is in progress
     * Returns: Object with edit details or null if nothing is being edited
     */
    getCurrentEditState() {
        if (!this.currentEditor) {
            return null;
        }

        const value = this.currentEditor.element.value || this.currentEditor.element.textContent;

        return {
            type: this.currentEditor.type,
            taskId: this.currentEditor.taskId,
            columnId: this.currentEditor.columnId,
            value: value,
            originalValue: this.currentEditor.originalValue
        };
    }

    /**
     * Apply current edit state to board before saving
     * Purpose: Include in-progress edits when saving board
     */
    applyCurrentEditToBoard(board) {
        const editState = this.getCurrentEditState();
        if (!editState) {
            return board; // No changes needed
        }

        // Make a deep copy to avoid modifying the original
        const boardCopy = JSON.parse(JSON.stringify(board));

        if (editState.type === 'task-title' || editState.type === 'task-description') {
            const column = boardCopy.columns.find(c => c.id === editState.columnId);
            if (column) {
                const task = column.tasks.find(t => t.id === editState.taskId);
                if (task) {
                    if (editState.type === 'task-title') {
                        task.title = editState.value;
                    } else if (editState.type === 'task-description') {
                        task.description = editState.value;
                    }
                }
            }
        } else if (editState.type === 'column-title') {
            const column = boardCopy.columns.find(c => c.id === editState.columnId);
            if (column) {
                column.title = editState.value;
            }
        }

        return boardCopy;
    }

    /**
     * Update editor after save to maintain consistency
     * Purpose: Keep editor in sync when content is saved while editing
     */
    handlePostSaveUpdate() {
        if (!this.currentEditor) {
            return;
        }

        // Update the original value to match what was just saved
        // This prevents the editor from thinking there are still changes
        const currentValue = this.currentEditor.element.value || this.currentEditor.element.textContent;
        this.currentEditor.originalValue = currentValue;

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
            if (!this.currentEditor) {return;}

            const element = this.currentEditor.element;


            // Check for VS Code snippet shortcuts (Cmd/Ctrl + number keys)
            const isSnippetShortcut = (e.metaKey || e.ctrlKey) && (
                e.key >= '1' && e.key <= '9' // These might be snippet shortcuts
            );

            // If it's a potential snippet shortcut, send to VS Code to handle
            if (isSnippetShortcut) {
                e.preventDefault(); // Prevent default behavior
                e.stopPropagation(); // Stop the event from bubbling up

                // Get current cursor position and text
                const cursorPos = element.selectionStart;
                const textBefore = element.value.substring(0, cursorPos);
                const textAfter = element.value.substring(element.selectionEnd);

                // Build the shortcut string
                const modifierKey = e.metaKey ? 'meta' : 'ctrl';
                const shortcut = `${modifierKey}+${e.key}`;

                // Send message to VS Code to trigger the snippet by shortcut
                if (typeof vscode !== 'undefined') {
                    vscode.postMessage({
                        type: 'triggerVSCodeSnippet',
                        shortcut: shortcut, // Send the shortcut instead of snippet name
                        cursorPosition: cursorPos,
                        textBefore: textBefore,
                        textAfter: textAfter,
                        fieldType: this.currentEditor.type,
                        taskId: this.currentEditor.taskId
                    });
                }

                // Keep focus and prevent auto-save
                this.isTransitioning = true;
                setTimeout(() => {
                    this.isTransitioning = false;
                    element.focus();
                }, 100);
                return;
            }

            // Check for other system shortcuts that might cause focus loss
            const isSystemShortcut = (e.metaKey || e.ctrlKey) && (
                e.key === 'w' || e.key === 't' || e.key === 'n' || // Window/tab shortcuts
                e.key === 'r' || e.key === 'f' || e.key === 'p' || // Reload/find/print shortcuts
                e.key === 'l' || e.key === 'd' || e.key === 'h' || // Location/bookmark shortcuts
                e.key === '+' || e.key === '-' || e.key === '0' // Zoom shortcuts
            );

            // If it's a system shortcut, temporarily prevent auto-save on blur
            if (isSystemShortcut) {
                this.isTransitioning = true;
                const currentElement = element; // Store reference to current editor

                // Reset the flag and restore focus after the shortcut completes
                setTimeout(() => {
                    this.isTransitioning = false;

                    // Restore focus if we're still editing the same element
                    if (this.currentEditor && this.currentEditor.element === currentElement) {
                        currentElement.focus();
                    }
                }, 300);
                return; // Let the system handle the shortcut
            }

            if (e.key === 'Tab' && element.classList.contains('task-title-edit')) {
                e.preventDefault();
                this.transitionToDescription();
            } else if (e.key === 'Enter' && !e.shiftKey) {
                if (element.classList.contains('task-title-edit') ||
                    element.classList.contains('column-title-edit')) {
                    e.preventDefault();
                    this.save();
                }
            } else if (e.key === 'Enter' && e.shiftKey) {
                // Shift+Enter: End editing (save changes)
                if (element.classList.contains('task-title-edit') ||
                    element.classList.contains('column-title-edit')) {
                    e.preventDefault();
                    this.save();
                }
            } else if (e.key === 'Escape') {
                // Escape: End editing (save changes, don't cancel)
                e.preventDefault();
                this.save();
            }
        });

        // Add window focus handler to restore editor focus after system shortcuts
        window.addEventListener('focus', () => {
            // If we have an active editor and the document regains focus, restore editor focus
            if (this.currentEditor && this.currentEditor.element && document.hasFocus()) {
                // Small delay to ensure the window focus event has fully processed
                setTimeout(() => {
                    if (this.currentEditor && this.currentEditor.element) {
                        this.currentEditor.element.focus();
                    }
                }, 50);
            }
        });

        // Add document visibility change handler for tab switching
        document.addEventListener('visibilitychange', () => {
            // When the document becomes visible again (user returns to this tab)
            if (!document.hidden && this.currentEditor && this.currentEditor.element) {
                setTimeout(() => {
                    if (this.currentEditor && this.currentEditor.element) {
                        this.currentEditor.element.focus();
                    }
                }, 100);
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
     * @param {boolean} preserveCursor - Whether to preserve cursor position (default: false, moves to end)
     */
    startEdit(element, type, taskId = null, columnId = null, preserveCursor = false) {
        // If transitioning, don't interfere
        if (this.isTransitioning) {return;}

        // Notify VS Code that task editing has started (only for task editing, not column editing)
        if (type === 'task-title' || type === 'task-description') {
            if (typeof vscode !== 'undefined') {
                vscode.postMessage({
                    type: 'setContext',
                    contextVariable: 'kanbanTaskEditing',
                    value: true
                });
            }
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
        } else if (type === 'column-title') {
            containerElement = element.closest('.kanban-full-height-column') || element;
            displayElement = containerElement.querySelector('.column-title');
            editElement = containerElement.querySelector('.column-title-edit');
        }

        if (!editElement) {return;}

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

        // For column title editing, show the title according to current tag visibility settings
        if (type === 'column-title' && columnId) {
            const column = window.cachedBoard?.columns.find(col => col.id === columnId);
            if (column && column.title) {
                // Show filtered title in editor if tags are hidden, full title if tags are shown
                const titleForEditing = window.filterTagsFromText ? window.filterTagsFromText(column.title) : column.title;
                editElement.value = titleForEditing;

                // Store the original full title so we can reconstruct it properly when saving
                editElement.setAttribute('data-original-title', column.title);
            }
        }

        // Show edit element, hide display
        if (displayElement) {displayElement.style.display = 'none';}
        editElement.style.display = 'block';
        
        // Auto-resize if textarea
        this.autoResize(editElement);
        
        // Focus and position cursor
        editElement.focus();

        // Position cursor based on preserveCursor flag
        if (!preserveCursor) {
            // Default behavior: move cursor to end
            editElement.setSelectionRange(editElement.value.length, editElement.value.length);
        }
        // If preserveCursor is true, don't move cursor - it will stay where the user clicked

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
                // Give a longer delay to handle system shortcuts and focus changes
                setTimeout(() => {
                    // Only save if we're still not focused, not transitioning, and the document is visible
                    if (document.activeElement !== editElement &&
                        !this.isTransitioning &&
                        !document.hidden &&
                        document.hasFocus()) {

                        // Additional check: don't close if focus moved to another editable element
                        // or if a modal/picker is open
                        const activeElement = document.activeElement;
                        const isEditingElsewhere = activeElement && (
                            activeElement.classList.contains('task-title-edit') ||
                            activeElement.classList.contains('task-description-edit') ||
                            activeElement.classList.contains('column-title-edit')
                        );
                        if (!isEditingElsewhere) {
                            this.save();
                        }
                    }
                }, 150); // Longer delay to handle system shortcuts
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
        if (!this.currentEditor || this.currentEditor.type !== 'task-title') {return;}

        this.isTransitioning = true;

        const taskId = this.currentEditor.taskId;
        const columnId = this.currentEditor.columnId;
        const taskItem = this.currentEditor.element.closest('.task-item');

        // Use the same save logic as regular saves to handle task includes correctly
        this.saveCurrentField();
        
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
        if (!this.currentEditor || this.isTransitioning) {return;}

        try {
            this.saveCurrentField();
            this.closeEditor();
        } catch (error) {
            console.error('[TaskEditor] Error during save:', error);
            // Force close the editor even if save fails
            this.closeEditor();
        }
    }

    cancel() {
        if (!this.currentEditor || this.isTransitioning) {return;}
        
        // Restore original value
        this.currentEditor.element.value = this.currentEditor.originalValue;
        this.closeEditor();
    }

    saveCurrentField() {
        if (!this.currentEditor) {return;}
        
        const { element, type, taskId, columnId } = this.currentEditor;
        const value = element.value;

        // Update local state for immediate feedback
        if (window.cachedBoard && window.cachedBoard.columns) {
            if (type === 'column-title') {
                const column = window.cachedBoard.columns.find(c => c.id === columnId);
                if (column) {
                    // Check if the title actually changed
                    if (column.title !== value) {
                        // Create context for this edit
                        const editContext = `column-title-${columnId}`;

                        // Save undo state BEFORE making the change
                        this.saveUndoStateImmediately('editColumnTitle', null, columnId);

                        this.lastEditContext = editContext;

                        // Reconstruct the full title by merging user input with preserved hidden tags
                        let newTitle;
                        try {
                            newTitle = this.reconstructColumnTitle(value.trim(), element.getAttribute('data-original-title') || column.title);
                        } catch (error) {
                            console.error('[TaskEditor] Error in reconstructColumnTitle:', error);
                            // Fallback to simple value if reconstruction fails
                            newTitle = value.trim();
                        }

                        // Check for column include syntax changes
                        const oldIncludeMatches = (column.title || '').match(/!!!columninclude\(([^)]+)\)!!!/g) || [];
                        const newIncludeMatches = newTitle.match(/!!!columninclude\(([^)]+)\)!!!/g) || [];

                        const hasIncludeChanges =
                            oldIncludeMatches.length !== newIncludeMatches.length ||
                            oldIncludeMatches.some((match, index) => match !== newIncludeMatches[index]);

                        column.title = newTitle;

                        // If include syntax changed, send editColumnTitle message immediately for backend processing
                        if (hasIncludeChanges) {
                            // Send editColumnTitle message to trigger proper include handling in backend
                            vscode.postMessage({
                                type: 'editColumnTitle',
                                columnId: columnId,
                                title: newTitle
                            });

                            // Don't update local state here - let the backend handle it and reload
                            return; // Skip the rest of the local updates for include changes
                        }

                        // Check if this edit affects layout and trigger board refresh if needed
                        const originalTitle = element.getAttribute('data-original-title') || '';
                        const layoutChanged = this.hasLayoutChanged(originalTitle, newTitle);

                        if (layoutChanged) {
                            // Layout tags changed - refresh the board layout
                            setTimeout(() => {
                                if (typeof window.renderBoard === 'function' && window.currentBoard) {
                                    window.renderBoard(window.currentBoard);
                                }
                            }, 50);
                        }

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

                        // Check for new span tag (only blocked by viewport-based widths, not pixel widths)
                        const spanMatch = column.title.match(/#span(\d+)\b/i);
                        const hasViewportWidth = window.currentColumnWidth && (window.currentColumnWidth === '50percent' || window.currentColumnWidth === '100percent');
                        if (spanMatch && !hasViewportWidth) {
                            const spanCount = parseInt(spanMatch[1]);
                            if (spanCount >= 2 && spanCount <= 4) {
                                columnElement.classList.add(`column-span-${spanCount}`);
                            }
                        }
                    }

                    // Update tag-based styling for columns (following task pattern)
                    const columnElement2 = document.querySelector(`[data-column-id="${columnId}"]`);
                    if (columnElement2) {
                        // Get tags from column title and description (like tasks do)
                        const titleTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(column.title || '') : [];
                        const descTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(column.description || '') : [];
                        const allTags = [...new Set([...titleTags, ...descTags])];

                        // Update primary tag (first non-special tag from title)
                        const primaryTag = window.extractFirstTag ? window.extractFirstTag(column.title) : null;
                        if (primaryTag && !primaryTag.startsWith('row') && !primaryTag.startsWith('gather_') && !primaryTag.startsWith('span')) {
                            columnElement2.setAttribute('data-column-tag', primaryTag);
                        } else {
                            columnElement2.removeAttribute('data-column-tag');
                        }

                        // Update all tags attribute for stacking features
                        if (allTags.length > 0) {
                            columnElement2.setAttribute('data-all-tags', allTags.join(' '));
                        } else {
                            columnElement2.removeAttribute('data-all-tags');
                        }

                        // Force style recalculation and update header/footer bars
                        if (allTags.length > 0) {
                            // Gentle style refresh: toggle a temporary class to force re-evaluation
                            columnElement2.classList.add('tag-update-trigger');
                            requestAnimationFrame(() => {
                                columnElement2.classList.remove('tag-update-trigger');

                                // Update footer/header bars after DOM updates complete
                                if (window.updateAllVisualTagElements) {
                                    window.updateAllVisualTagElements(columnElement2, allTags, 'column');
                                }
                            });
                        } else {
                            // If no tags, still update header/footer bars to remove any existing ones
                            if (window.injectStackableBars) {
                                window.injectStackableBars(columnElement2);
                            }
                        }

                        // Update corner badges without re-render (uses title+description combined like tasks)
                        if (window.updateCornerBadgesImmediate) {
                            // For columns, we need to pass a combined text that includes both title and description tags
                            const combinedText = [column.title, column.description].filter(Boolean).join(' ');
                            window.updateCornerBadgesImmediate(columnId, 'column', combinedText);
                        }

                        // Update tag counts in any open menus
                        if (window.updateTagCategoryCounts) {
                            window.updateTagCategoryCounts(columnId, 'column');
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
                const column = window.cachedBoard.columns.find(c => c.id === columnId);
                const task = column?.tasks.find(t => t.id === taskId);
                
                if (task) {
                    // Capture original values before making changes
                    const originalTitle = task.title || '';
                    const originalDisplayTitle = task.displayTitle || '';
                    const originalDescription = task.description || '';

                    if (type === 'task-title') {
                        // Handle task title - check for include syntax first
                        const newIncludeMatches = value.match(/!!!taskinclude\(([^)]+)\)!!!/g) || [];
                        const oldIncludeMatches = (task.title || '').match(/!!!taskinclude\(([^)]+)\)!!!/g) || [];

                        const hasIncludeChanges =
                            oldIncludeMatches.length !== newIncludeMatches.length ||
                            oldIncludeMatches.some((match, index) => match !== newIncludeMatches[index]);

                        if (newIncludeMatches.length > 0 || hasIncludeChanges) {
                            // This involves include syntax (new include, changed include, or removing include)
                            const editContext = `${type}-${taskId}-${columnId}`;
                            this.saveUndoStateImmediately('editTaskTitle', taskId, columnId);
                            this.lastEditContext = editContext;

                            task.title = value;

                            // Send to backend for include processing
                            vscode.postMessage({
                                type: 'editTaskTitle',
                                taskId: taskId,
                                columnId: columnId,
                                title: value
                            });

                            return; // Skip local updates, let backend handle
                        } else if (task.includeMode && oldIncludeMatches.length > 0) {
                            // This is editing the display content of an existing include task
                            // (the user is editing what appears to be the title but it's actually the display content)
                            const editContext = `${type}-${taskId}-${columnId}`;
                            this.saveUndoStateImmediately('editTaskTitle', taskId, columnId);
                            this.lastEditContext = editContext;

                            // Update displayTitle instead of title for include tasks
                            task.displayTitle = value;
                            // title stays the same (contains include syntax)
                            // No backend message - this is just local editing
                        } else {
                            // Regular task title editing
                            if (task.title !== value) {
                                const editContext = `${type}-${taskId}-${columnId}`;
                                this.saveUndoStateImmediately('editTaskTitle', taskId, columnId);
                                this.lastEditContext = editContext;

                                task.title = value;
                                // No backend message needed for regular titles
                            }
                        }
                    } else if (type === 'task-description') {
                        // Handle task description
                        if (task.includeMode) {
                            // For task includes, the description field contains the ENTIRE file content
                            // Parse it to extract the first line (new displayTitle) and rest (new description)
                            const lines = value.split('\n');
                            const newDisplayTitle = lines[0] || '';

                            // Remove the first line and any immediately following empty lines
                            let remainingLines = lines.slice(1);
                            while (remainingLines.length > 0 && remainingLines[0].trim() === '') {
                                remainingLines.shift();
                            }
                            const newDescription = remainingLines.join('\n');

                            const editContext = `${type}-${taskId}-${columnId}`;
                            this.saveUndoStateImmediately('editTaskDescription', taskId, columnId);
                            this.lastEditContext = editContext;

                            // Update both displayTitle and description
                            task.displayTitle = newDisplayTitle;
                            task.description = newDescription; // Only the content after the first line
                        } else {
                            // Regular task description handling
                            const currentRawValue = task.description || '';
                            if (currentRawValue !== value) {
                                const editContext = `${type}-${taskId}-${columnId}`;

                                // Save undo state BEFORE making the change
                                this.saveUndoStateImmediately('editTaskDescription', taskId, columnId);
                                this.lastEditContext = editContext;

                                // Update description
                                task.description = value;
                            }
                        }
                    }

                    // Mark as unsaved and send the specific change to backend if any change was made
                    let wasChanged = false;
                    if (type === 'task-title') {
                        if (task.includeMode) {
                            // For include tasks, check if displayTitle changed
                            wasChanged = (task.displayTitle || '') !== originalDisplayTitle;
                        } else {
                            // For regular tasks, check if title changed
                            wasChanged = (task.title || '') !== originalTitle;
                        }
                    } else if (type === 'task-description') {
                        wasChanged = (task.description || '') !== originalDescription;
                    }

                    if (wasChanged) {
                        // Ensure currentBoard is synced with cachedBoard for markUnsavedChanges
                        window.currentBoard = window.cachedBoard;

                        if (typeof markUnsavedChanges === 'function') {
                            markUnsavedChanges();
                        }

                        // Note: No need to send updateTaskInBackend message here
                        // The markUnsavedChanges() call above already sends the complete
                        // updated board data via the cachedBoard parameter
                    }
                    
                    if (this.currentEditor.displayElement) {
                        if (value.trim()) {
                            // For task includes, determine the correct display value
                            let displayValue = value;
                            if (type === 'task-description' && task.includeMode) {
                                // For task include descriptions, show only the description part (not the title)
                                displayValue = task.description || '';
                            } else if (type === 'task-title' && task.includeMode) {
                                // For task include titles, show the display title
                                displayValue = task.displayTitle || '';
                            }

                            this.currentEditor.displayElement.innerHTML = renderMarkdown(displayValue);
                        } else {
                            // Handle empty values - must be truly empty for CSS :empty selector
                            this.currentEditor.displayElement.innerHTML = '';
                        }
                        // Ensure display element is visible
                        this.currentEditor.displayElement.style.display = 'block';

                        // For task includes, also update the title display when description is edited
                        if (type === 'task-description' && task.includeMode) {
                            const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                            if (taskElement) {
                                const titleDisplayElement = taskElement.querySelector('.task-title-display');
                                if (titleDisplayElement && task.displayTitle) {
                                    titleDisplayElement.innerHTML = renderMarkdown(task.displayTitle);
                                }
                            }
                        }
                    }

                    // Update tag-based styling for both titles and descriptions
                    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                    if (taskElement) {
                        // Combine tags from title and description
                        const titleTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(task.title || '') : [];
                        const descTags = window.getActiveTagsInTitle ? window.getActiveTagsInTitle(task.description || '') : [];
                        const allTags = [...new Set([...titleTags, ...descTags])];

                        // Update primary tag (first non-special tag from title)
                        const primaryTag = window.extractFirstTag ? window.extractFirstTag(task.title) : null;
                        if (primaryTag && !primaryTag.startsWith('row') && !primaryTag.startsWith('gather_') && !primaryTag.startsWith('span')) {
                            taskElement.setAttribute('data-task-tag', primaryTag);
                        } else {
                            taskElement.removeAttribute('data-task-tag');
                        }

                        // Update all tags attribute for stacking features
                        if (allTags.length > 0) {
                            taskElement.setAttribute('data-all-tags', allTags.join(' '));
                        } else {
                            taskElement.removeAttribute('data-all-tags');
                        }

                        // Force style recalculation and update header/footer bars
                        if (allTags.length > 0) {
                            // Gentle style refresh: toggle a temporary class to force re-evaluation
                            taskElement.classList.add('tag-update-trigger');
                            requestAnimationFrame(() => {
                                taskElement.classList.remove('tag-update-trigger');

                                // Update footer/header bars after DOM updates complete
                                if (window.injectStackableBars) {
                                    window.injectStackableBars(taskElement);
                                }
                            });
                        } else {
                            // If no tags, still update header/footer bars to remove any existing ones
                            if (window.injectStackableBars) {
                                window.injectStackableBars(taskElement);
                            }
                        }

                        // Update corner badges without re-render (uses title+description combined)
                        if (window.updateCornerBadgesImmediate) {
                            // For tasks, we need to pass a combined text that includes both title and description tags
                            const combinedText = [task.title, task.description].filter(Boolean).join(' ');
                            window.updateCornerBadgesImmediate(taskId, 'task', combinedText);
                        }

                        // Update tag counts in any open menus
                        if (window.updateTagCategoryCounts) {
                            window.updateTagCategoryCounts(taskId, 'task', columnId);
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
        if (!this.currentEditor) {return;}

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
        }

        // Focus the card after editing ends
        if (type === 'task-title' || type === 'task-description') {
            // Find the task item to focus
            const taskItem = element.closest('.task-item');
            if (taskItem) {
                // Small delay to ensure display element is visible
                setTimeout(() => {
                    taskItem.focus();
                }, 10);
            }
        }

        // Notify VS Code that task editing has stopped (only for task editing, not column editing)
        if (type === 'task-title' || type === 'task-description') {
            if (typeof vscode !== 'undefined') {
                vscode.postMessage({
                    type: 'setContext',
                    contextVariable: 'kanbanTaskEditing',
                    value: false
                });
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

    /**
     * Reconstructs column title by merging user input with preserved hidden tags
     * Handles conflict resolution and tag visibility rules
     * @param {string} userInput - What the user typed in the editor
     * @param {string} originalTitle - The original full title with all tags
     * @returns {string} - The reconstructed title with proper tag handling
     */
    reconstructColumnTitle(userInput, originalTitle) {
        // Extract different types of tags from the original title
        const rowMatch = originalTitle.match(/#row(\d+)\b/i);
        const originalRow = rowMatch ? rowMatch[0] : null;

        const spanMatch = originalTitle.match(/#span(\d+)\b/i);
        const originalSpan = spanMatch ? spanMatch[0] : null;

        const stackMatch = originalTitle.match(/#stack\b/i);
        const originalStack = stackMatch ? stackMatch[0] : null;

        // Check what the user added in their input
        const userRowMatch = userInput.match(/#row(\d+)\b/i);
        const userRow = userRowMatch ? userRowMatch[0] : null;

        const userSpanMatch = userInput.match(/#span(\d+)\b/i);
        const userSpan = userSpanMatch ? userSpanMatch[0] : null;

        const userStackMatch = userInput.match(/#stack\b/i);
        const userStack = userStackMatch ? userStackMatch[0] : null;

        const userNoSpanMatch = userInput.match(/#nospan\b/i);
        const userNoSpan = !!userNoSpanMatch;

        const userNoStackMatch = userInput.match(/#nostack\b/i);
        const userNoStack = !!userNoStackMatch;

        // Clean the user input of all layout tags to get the base title
        let cleanTitle = userInput
            .replace(/#row\d+\b/gi, '')
            .replace(/#span\d+\b/gi, '')
            .replace(/#stack\b/gi, '')
            .replace(/#nospan\b/gi, '')
            .replace(/#nostack\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim();

        let result = cleanTitle;

        // Handle row tags (preserve original unless user specified different)
        const finalRow = userRow || originalRow;
        if (finalRow && finalRow !== '#row1') {
            result += ` ${finalRow}`;
        }

        // Handle span tags with conflict resolution
        if (userNoSpan) {
            // User explicitly disabled span - don't add any span tag
        } else if (userSpan) {
            // User specified a span tag - use it (overrides original)
            result += ` ${userSpan}`;
        } else if (originalSpan) {
            // Keep original span tag if user didn't specify one
            result += ` ${originalSpan}`;
        }

        // Handle stack tags with conflict resolution
        if (userNoStack) {
            // User explicitly disabled stack - don't add stack tag
        } else if (userStack) {
            // User specified stack tag - use it
            result += ` #stack`;
        } else if (originalStack) {
            // Keep original stack tag if user didn't specify one
            result += ` #stack`;
        }

        return result.trim();
    }

    /**
     * Checks if layout-affecting tags changed between old and new titles
     * @param {string} oldTitle - Original title
     * @param {string} newTitle - New title
     * @returns {boolean} - True if layout changed
     */
    hasLayoutChanged(oldTitle, newTitle) {
        // Extract layout tags from both titles
        const getLayoutTags = (title) => {
            const span = title.match(/#span(\d+)\b/i)?.[0] || '';
            const stack = title.match(/#stack\b/i)?.[0] || '';
            const row = title.match(/#row(\d+)\b/i)?.[0] || '';
            return `${span}|${stack}|${row}`;
        };

        return getLayoutTags(oldTitle) !== getLayoutTags(newTitle);
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
    taskEditor.startEdit(element, 'task-title', taskId, columnId, true); // preserveCursor=true for clicks
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
    taskEditor.startEdit(container, 'task-description', taskId, columnId, true); // preserveCursor=true for clicks
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