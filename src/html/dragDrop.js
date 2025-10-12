
// Add debugging flag
let lastIndicatorUpdate = 0;
const INDICATOR_UPDATE_THROTTLE = 100; // milliseconds
const DEBUG_DROP = false;

// Create smart logger for drag and drop
const dragLogger = window.createSmartLogger ? window.createSmartLogger('DragDrop') : {
    log: () => {},
    always: console.log.bind(console, '[DragDrop]'),
    clear: () => {},
    once: () => {}
};

// Track if drag/drop is already set up to prevent multiple listeners
let dragDropInitialized = false;
let isProcessingDrop = false; // Prevent multiple simultaneous drops
let currentExternalDropColumn = null;
let externalDropIndicator = null;

// Track recently created tasks to prevent duplicates
let recentlyCreatedTasks = new Set();

// Use centralized DragStateManager instead of local state
// The dragStateManager is already available globally as window.dragState
// for backward compatibility

// Create local references for frequently accessed properties
// Wait for dragStateManager to be available via window.dragState
let dragState = window.dragState;

// Add custom properties that aren't in base DragStateManager
// Initialize dragState if not available yet
if (!dragState) {
    dragState = {
        isDragging: false,
        draggedTask: null,
        draggedColumn: null,
        draggedClipboardCard: null,
        draggedEmptyCard: null,
        // Column-specific
        draggedColumnId: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        originalDataIndex: -1,

        // Task-specific
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,

        // Drop tracking
        lastValidDropTarget: null,
        lastDropTarget: null,
        lastRowDropTarget: null,
        lastRow: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null,

        // Modifier keys
        altKeyPressed: false,

        // View tracking
        leftView: false,
        leftViewTimestamp: null
    };
    window.dragState = dragState;
} else if (!dragState.originalColumnIndex) {
    Object.assign(dragState, {
        // Column-specific
        draggedColumnId: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        originalDataIndex: -1,

        // Task-specific
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,

        // Drop tracking
        lastValidDropTarget: null,
        lastDropTarget: null,
        lastRowDropTarget: null,
        lastRow: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null,

        // Modifier keys
        altKeyPressed: false,

        // View tracking
        leftView: false,
        leftViewTimestamp: null
    });
}

// External file drop location indicators
function createExternalDropIndicator() {
    if (externalDropIndicator) {
        return externalDropIndicator;
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'external-drop-indicator';
    indicator.style.display = 'none';
    indicator.style.pointerEvents = 'none'; // Ensure it doesn't interfere with drops
    document.body.appendChild(indicator);
    externalDropIndicator = indicator;
    
    if (DEBUG_DROP) {
    }
    
    return indicator;
}

function showExternalDropIndicator(column, clientY) {
    if (DEBUG_DROP && currentExternalDropColumn !== column) {
    }
    const indicator = createExternalDropIndicator();
    const tasksContainer = column.querySelector('.tasks-container');
    
    if (!tasksContainer) {return;}
    
    // Calculate insertion position
    const containerRect = tasksContainer.getBoundingClientRect();
    
    // Find insertion point between tasks
    const tasks = Array.from(tasksContainer.children);
    let insertionY = containerRect.top;
    
    if (tasks.length === 0) {
        insertionY = containerRect.top + 10;
    } else {
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
    document.querySelectorAll('.kanban-full-height-column').forEach(col => {
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

/**
 * Sets up global drag and drop event listeners
 * Purpose: Handle external file drops and clipboard operations
 * Used by: Board initialization
 * Side effects: Adds document-level event listeners
 */
function setupGlobalDragAndDrop() {

    const boardContainer = document.getElementById('kanban-container');
    const dropFeedback = document.getElementById('drop-zone-feedback');
    
    if (!boardContainer) {
        // Board container not found
        return;
    }
    
    // Variables for throttling
    let lastIndicatorUpdate = 0;
    const INDICATOR_UPDATE_THROTTLE = 100;
    
    // Helper functions
    function isExternalFileDrag(e) {
        const dt = e.dataTransfer;
        if (!dt) {
            return false;
        }
        
        // Only log on drop events to reduce spam
        const isDropEvent = e.type === 'drop';
        if (isDropEvent) {
            }
        
        const hasFiles = Array.from(dt.types).some(t => t === 'Files' || t === 'files');
        if (hasFiles) {
            return true;
        }
        
        // Check for clipboard card type using drag state
        // We can't reliably read data during dragover due to browser security
        const hasClipboardCard = dragState.draggedClipboardCard !== null;
        const hasEmptyCard = dragState.draggedEmptyCard !== null;
        
        if (hasClipboardCard || hasEmptyCard) {
            return true;
        }
        
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask) && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
            return false;
        }
        
        const hasUriList = Array.from(dt.types).some(t => t.toLowerCase() === 'text/uri-list');
        return hasUriList;
    }
    
    function showDropFeedback() {
        if (dropFeedback) {
            dropFeedback.classList.add('active');
        }
    }
    
    function hideDropFeedback() {
        if (dropFeedback) {
            dropFeedback.classList.remove('active');
        }
        boardContainer.classList.remove('drag-highlight');
    }
    
    // Main drop handler function  
    function handleExternalDrop(e) {
        // Handle external drop event

        // Prevent default browser behavior
        e.preventDefault();
        
        // Check if this is an internal column/task drag (not clipboard/empty cards)
        const isInternalDrag = dragState.isDragging && 
            (dragState.draggedColumn || dragState.draggedTask) && 
            !dragState.draggedClipboardCard && 
            !dragState.draggedEmptyCard;
            
        if (isInternalDrag) {
                return;
        }
        
        // Stop event propagation to prevent duplicate handling
        e.stopPropagation();
        
        // Always clean up visual indicators
        hideDropFeedback();
        hideExternalDropIndicator();
        document.querySelectorAll('.kanban-full-height-column').forEach(col => {
            col.classList.remove('external-drag-over');
        });
        
        const dt = e.dataTransfer;
        if (!dt) {
            // No dataTransfer available
            return;
        }
        
        
        // Priority 1: Check for clipboard images via dataTransfer (most reliable for images)
        const textData = dt.getData('text/plain');
        if (textData && textData.startsWith('CLIPBOARD_IMAGE:')) {
            const imageData = textData.substring('CLIPBOARD_IMAGE:'.length);
            handleClipboardImageDrop(e, imageData);
            if (dragState.draggedClipboardCard) {
                dragState.draggedClipboardCard = null;
                dragState.isDragging = false;
            }
            return;
        }

        // Priority 2: Check dragState for text clipboard/empty cards
        if (dragState.draggedClipboardCard) {
            // Regular clipboard card (text only)
            const clipboardData = JSON.stringify({
                type: 'clipboard-card',
                task: dragState.draggedClipboardCard
            });
            handleClipboardCardDrop(e, clipboardData);
            dragState.draggedClipboardCard = null;
            dragState.isDragging = false;
            return;
        }
        
        if (dragState.draggedEmptyCard) {
            const emptyCardData = JSON.stringify({
                type: 'empty-card',
                task: dragState.draggedEmptyCard
            });
            handleEmptyCardDrop(e, emptyCardData);
            dragState.draggedEmptyCard = null;
            dragState.isDragging = false;
            return;
        }
        
        // Priority 2: Check for files
        if (dt.files && dt.files.length > 0) {
            handleVSCodeFileDrop(e, dt.files);
            return;
        }
        
        // Priority 3: Check text data for special formats
        const textData2 = dt.getData('text/plain');
        
        if (textData2) {
            if (textData2.startsWith('CLIPBOARD_CARD:')) {
                const clipboardData = textData2.substring('CLIPBOARD_CARD:'.length);
                handleClipboardCardDrop(e, clipboardData);
            } else if (textData2.startsWith('EMPTY_CARD:')) {
                const emptyCardData = textData2.substring('EMPTY_CARD:'.length);
                handleEmptyCardDrop(e, emptyCardData);
            } else if (textData2.startsWith('MULTIPLE_FILES:')) {
                const filesContent = textData2.substring('MULTIPLE_FILES:'.length);
                handleMultipleFilesDrop(e, filesContent);
            } else if (textData2.startsWith('CLIPBOARD_IMAGE:')) {
                const imageData = textData2.substring('CLIPBOARD_IMAGE:'.length);
                handleClipboardImageDrop(e, imageData);
            } else if (textData2.includes('/')) {
                // Looks like a file path
                handleVSCodeUriDrop(e, textData2);
            } else {
                // Plain text - create a new card
                createNewTaskWithContent(
                    textData2,
                    { x: e.clientX, y: e.clientY },
                    ''
                );
            }
            return;
        }
        
        // Priority 4: Check for URI list
        const uriList = dt.getData('text/uri-list');
        if (uriList) {
            handleVSCodeUriDrop(e, uriList);
            return;
        }
        
    }
    
    // Register handlers on the container (works for both single row and multi-row)
    boardContainer.addEventListener('dragover', function(e) {
        // Always prevent default to allow drops
        e.preventDefault();
        
        // Skip visual indicators for internal column/task drags
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask) && 
            !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
            return; // Don't show external drop indicators during internal drags
        }
        
        // Show drop indicators for external drags
        const now = Date.now();
        if (now - lastIndicatorUpdate >= INDICATOR_UPDATE_THROTTLE) {
            lastIndicatorUpdate = now;
            
            // Check if we're over a column (works for both single and multi-row layouts)
            const column = e.target && e.target.closest ? e.target.closest('.kanban-full-height-column') : null;
            if (column) {
                // Allow drops on collapsed columns - they will be unfolded on drop
                showExternalDropIndicator(column, e.clientY);
            } else {
                // Check if we're over a row or spacer in multi-row mode
                const row = e.target && e.target.closest ? e.target.closest('.kanban-row') : null;
                const spacer = e.target && e.target.closest ? e.target.closest('.row-drop-zone-spacer') : null;
                if (row || spacer) {
                    // Try to find the nearest column (include collapsed columns)
                    const columns = boardContainer.querySelectorAll('.kanban-full-height-column');
                    let nearestColumn = null;
                    let minDistance = Infinity;
                    
                    columns.forEach(col => {
                        const rect = col.getBoundingClientRect();
                        const distance = Math.abs(rect.left + rect.width / 2 - e.clientX);
                        if (distance < minDistance) {
                            minDistance = distance;
                            nearestColumn = col;
                        }
                    });
                    
                    if (nearestColumn) {
                        showExternalDropIndicator(nearestColumn, e.clientY);
                    } else {
                        hideExternalDropIndicator();
                    }
                } else {
                    hideExternalDropIndicator();
                }
            }
            showDropFeedback();
        }
    }, false);
    
    boardContainer.addEventListener('drop', handleExternalDrop, false);
    
    boardContainer.addEventListener('dragenter', function(e) {
        // Skip external file drag handling if we're dragging internal elements
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return; // Don't show external drop feedback during internal drags
        }
        
        if (isExternalFileDrag(e)) {
            e.preventDefault();
            showDropFeedback();
        }
    }, false);
    
    boardContainer.addEventListener('dragleave', function(e) {
        // More robust check for actually leaving the board
        const rect = boardContainer.getBoundingClientRect();
        const isReallyLeaving = e.clientX < rect.left || e.clientX > rect.right || 
                               e.clientY < rect.top || e.clientY > rect.bottom;
        
        if (isReallyLeaving || (!boardContainer.contains(e.relatedTarget) && e.relatedTarget !== null)) {
            hideDropFeedback();
            hideExternalDropIndicator();
        }
    }, false);
    
    // Removed duplicate drop handler that was causing double card creation
    // The main handler at line 305 already handles all external drops
    
    // Document level handlers
    document.addEventListener('dragover', function(e) {
        // If we left the view and now dragover is firing, we're back!
        if (dragState.isDragging && dragState.leftView) {
            console.log('[DragDrop] *** DRAGOVER DETECTED AFTER LEAVING *** clearing leftView');
            dragState.leftView = false;
        }

        if (!boardContainer.contains(e.target) && isExternalFileDrag(e)) {
            e.preventDefault();
        }
    }, false);

    // Use mousemove as a fallback to detect re-entry since dragenter/dragover might not fire
    document.addEventListener('mousemove', function(e) {
        if (dragState.isDragging && dragState.leftView) {
            console.log('[DragDrop] *** MOUSEMOVE DETECTED AFTER LEAVING *** clearing leftView');
            dragState.leftView = false;
        }
    }, false);

    // Try mouseenter on body as another detection method
    document.body.addEventListener('mouseenter', function(e) {
        if (dragState.isDragging && dragState.leftView) {
            console.log('[DragDrop] *** MOUSEENTER ON BODY DETECTED *** clearing leftView');
            dragState.leftView = false;
        }
    }, false);

    // Try pointerenter which works during drag in some browsers
    document.addEventListener('pointerenter', function(e) {
        if (dragState.isDragging && dragState.leftView) {
            console.log('[DragDrop] *** POINTERENTER DETECTED *** clearing leftView');
            dragState.leftView = false;
        }
    }, { capture: true });

    document.addEventListener('drop', function(e) {
        if (!boardContainer.contains(e.target)) {
            e.preventDefault();
            // Clean up indicators if drop happens outside board
            hideDropFeedback();
            hideExternalDropIndicator();
        }
    }, false);

    // ============================================================================
    // UNIFIED DRAGEND HELPER FUNCTIONS
    // ============================================================================

    function restoreTaskToOriginalPosition() {
        if (!dragState.draggedTask || !dragState.originalTaskParent) {
            return;
        }

        dragLogger.always('Restoring task to original position');

        // Check if originalTaskNextSibling is still valid
        const nextSiblingStillValid = dragState.originalTaskNextSibling &&
            dragState.originalTaskNextSibling.parentNode === dragState.originalTaskParent;

        // Remove from current position
        if (dragState.draggedTask.parentNode) {
            dragState.draggedTask.parentNode.removeChild(dragState.draggedTask);
        }

        // Restore to original position
        if (nextSiblingStillValid) {
            dragState.originalTaskParent.insertBefore(dragState.draggedTask, dragState.originalTaskNextSibling);
        } else if (dragState.originalTaskIndex >= 0) {
            // Use index as fallback
            const children = Array.from(dragState.originalTaskParent.children);
            const taskItems = children.filter(c => c.classList.contains('task-item'));
            if (dragState.originalTaskIndex < taskItems.length) {
                dragState.originalTaskParent.insertBefore(dragState.draggedTask, taskItems[dragState.originalTaskIndex]);
            } else {
                dragState.originalTaskParent.appendChild(dragState.draggedTask);
            }
        } else {
            dragState.originalTaskParent.appendChild(dragState.draggedTask);
        }
    }

    function restoreColumnToOriginalPosition() {
        dragLogger.always('restoreColumnToOriginalPosition called', {
            hasColumn: !!dragState.draggedColumn,
            hasParent: !!dragState.originalColumnParent,
            hasSibling: !!dragState.originalColumnNextSibling,
            columnId: dragState.draggedColumn?.dataset?.columnId,
            currentParent: dragState.draggedColumn?.parentNode?.className
        });

        if (!dragState.draggedColumn || !dragState.originalColumnParent) {
            dragLogger.always('restoreColumnToOriginalPosition ABORTED - missing column or parent');
            return;
        }

        // Store current position before restoration
        const currentParent = dragState.draggedColumn.parentNode;
        const currentIndex = currentParent ? Array.from(currentParent.children).indexOf(dragState.draggedColumn) : -1;
        const originalIndex = dragState.originalColumnIndex;

        dragLogger.always('Restoring column to original position', {
            currentParentClass: currentParent?.className,
            currentIndex: currentIndex,
            originalParentClass: dragState.originalColumnParent?.className,
            originalIndex: originalIndex
        });

        // Check if restoration is actually needed
        const sameParent = currentParent === dragState.originalColumnParent;
        const needsRestore = !sameParent || currentIndex !== originalIndex;

        dragLogger.always('Column restoration check', {
            sameParent,
            needsRestore,
            originalIndex,
            currentIndex
        });

        if (!needsRestore) {
            dragLogger.always('Column already at original position - no restoration needed');
            return;
        }

        // Remove from current position
        if (dragState.draggedColumn.parentNode) {
            dragState.draggedColumn.parentNode.removeChild(dragState.draggedColumn);
            dragLogger.always('Removed column from current position');
        }

        // Restore to original position using the stored index
        const parentChildren = Array.from(dragState.originalColumnParent.children);
        if (originalIndex >= parentChildren.length) {
            // Restore at end
            dragState.originalColumnParent.appendChild(dragState.draggedColumn);
            dragLogger.always('Column restored using appendChild (at end)', {
                finalIndex: Array.from(dragState.originalColumnParent.children).indexOf(dragState.draggedColumn)
            });
        } else {
            // Insert at original index
            const referenceNode = parentChildren[originalIndex];
            dragState.originalColumnParent.insertBefore(dragState.draggedColumn, referenceNode);
            dragLogger.always('Column restored using insertBefore', {
                finalIndex: Array.from(dragState.originalColumnParent.children).indexOf(dragState.draggedColumn),
                targetIndex: originalIndex
            });
        }

        // ALSO restore in the data model (cachedBoard) to prevent re-renders from moving it back
        const columnId = dragState.draggedColumnId;

        dragLogger.always('Checking data model restoration', {
            hasCachedBoard: !!window.cachedBoard,
            hasColumnId: !!columnId,
            originalDataIndex: dragState.originalDataIndex
        });

        if (window.cachedBoard && columnId && dragState.originalDataIndex >= 0) {
            const currentColumnIndex = window.cachedBoard.columns.findIndex(c => c.id === columnId);

            dragLogger.always('Data model column position', {
                currentColumnIndex,
                originalDataIndex: dragState.originalDataIndex,
                needsRestore: currentColumnIndex !== dragState.originalDataIndex
            });

            if (currentColumnIndex >= 0 && currentColumnIndex !== dragState.originalDataIndex) {
                // Remove from current position
                const [column] = window.cachedBoard.columns.splice(currentColumnIndex, 1);

                // Insert at original position
                const insertIndex = Math.min(dragState.originalDataIndex, window.cachedBoard.columns.length);
                window.cachedBoard.columns.splice(insertIndex, 0, column);

                dragLogger.always('Column restored in data model', {
                    from: currentColumnIndex,
                    to: insertIndex,
                    originalDataIndex: dragState.originalDataIndex
                });
            } else {
                dragLogger.always('Data model restoration SKIPPED', {
                    reason: currentColumnIndex < 0 ? 'column not found' : 'already at correct position'
                });
            }
        } else {
            dragLogger.always('Data model restoration ABORTED', {
                reason: !window.cachedBoard ? 'no cachedBoard' : !columnId ? 'no columnId' : 'invalid originalDataIndex'
            });
        }
    }

    function processTaskDrop() {
        const taskItem = dragState.draggedTask;
        if (!taskItem) {
            return;
        }

        // Get the final position
        const finalParent = taskItem.parentNode;
        const finalColumnElement = finalParent?.closest('.kanban-full-height-column');
        const finalColumnId = finalColumnElement?.dataset.columnId;

        if (!finalParent || !finalColumnId) {
            return;
        }

        const originalColumnElement = dragState.originalTaskParent?.closest('.kanban-full-height-column');
        const originalColumnId = originalColumnElement?.dataset.columnId;

        const finalIndex = Array.from(finalParent.children).indexOf(taskItem);

        // Check if position actually changed
        const positionChanged = finalParent !== dragState.originalTaskParent ||
                               finalIndex !== dragState.originalTaskIndex;

        if (!positionChanged || !originalColumnId) {
            return;
        }

        // Calculate the proper index for the data model
        const dropIndex = finalIndex >= 0 ? finalIndex : 0;

        // Unfold the destination column if it's collapsed (unless Alt key was pressed during drag)
        if (typeof unfoldColumnIfCollapsed === 'function') {
            const skipUnfold = dragState.altKeyPressed;
            unfoldColumnIfCollapsed(finalColumnId, skipUnfold);
        }

        // Update cached board
        if (window.cachedBoard) {
            const taskId = taskItem.dataset.taskId;

            // Save undo state
            vscode.postMessage({
                type: 'saveUndoState',
                operation: originalColumnId !== finalColumnId ? 'moveTaskViaDrag' : 'reorderTaskViaDrag',
                taskId: taskId,
                fromColumnId: originalColumnId,
                toColumnId: finalColumnId,
                currentBoard: window.cachedBoard
            });

            // Find and remove task from original column
            const originalColumn = window.cachedBoard.columns.find(col => col.id === originalColumnId);
            const finalColumn = window.cachedBoard.columns.find(col => col.id === finalColumnId);

            if (originalColumn && finalColumn) {
                const taskIndex = originalColumn.tasks.findIndex(t => t.id === taskId);
                if (taskIndex >= 0) {
                    const [task] = originalColumn.tasks.splice(taskIndex, 1);

                    // Add task to new column at correct position
                    const insertIndex = Math.min(dropIndex, finalColumn.tasks.length);
                    finalColumn.tasks.splice(insertIndex, 0, task);

                    // Update column displays after task move
                    if (typeof window.updateColumnDisplay === 'function') {
                        window.updateColumnDisplay(originalColumnId);
                        if (originalColumnId !== finalColumnId) {
                            window.updateColumnDisplay(finalColumnId);
                        }
                    }

                    // Check empty state for both columns
                    if (typeof updateColumnEmptyState === 'function') {
                        updateColumnEmptyState(originalColumnId);
                        if (originalColumnId !== finalColumnId) {
                            updateColumnEmptyState(finalColumnId);
                        }
                    }

                    // Update the task element's onclick handlers to reference the new columnId
                    if (originalColumnId !== finalColumnId) {
                        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
                        if (taskElement) {
                            const taskItemEl = taskElement.closest('.task-item');
                            if (taskItemEl) {
                                // Update task-title-container onclick
                                const titleContainer = taskItemEl.querySelector('.task-title-container');
                                if (titleContainer) {
                                    const oldOnclick = titleContainer.getAttribute('onclick');
                                    if (oldOnclick) {
                                        const newOnclick = oldOnclick.replace(
                                            `'${originalColumnId}'`,
                                            `'${finalColumnId}'`
                                        );
                                        titleContainer.setAttribute('onclick', newOnclick);
                                    }
                                }

                                // Update task-description onclick
                                const descContainer = taskItemEl.querySelector('.task-description');
                                if (descContainer) {
                                    const oldOnclick = descContainer.getAttribute('onclick');
                                    if (oldOnclick) {
                                        const newOnclick = oldOnclick.replace(
                                            `'${originalColumnId}'`,
                                            `'${finalColumnId}'`
                                        );
                                        descContainer.setAttribute('onclick', newOnclick);
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }

        // Mark as unsaved
        if (typeof markUnsavedChanges === 'function') {
            markUnsavedChanges();
        }

        // Recalculate stack heights if needed
        if (originalColumnId !== finalColumnId && typeof window.recalculateStackHeights === 'function') {
            requestAnimationFrame(() => {
                const originalCol = originalColumnElement;
                const finalCol = finalColumnElement;

                const originalStack = originalCol?.closest('.kanban-column-stack');
                const finalStack = finalCol?.closest('.kanban-column-stack');

                if (originalStack) {
                    window.recalculateStackHeights(originalStack);
                }
                if (finalStack && finalStack !== originalStack) {
                    window.recalculateStackHeights(finalStack);
                }
            });
        }
    }

    function processColumnDrop() {
        dragLogger.always('[processColumnDrop] Called', {
            hasColumn: !!dragState.draggedColumn,
            columnId: dragState.draggedColumnId
        });

        const columnElement = dragState.draggedColumn;
        const columnId = dragState.draggedColumnId;

        if (!columnElement || !columnId) {
            dragLogger.always('[processColumnDrop] ABORTED - missing column or columnId');
            return;
        }

        const boardElement = document.getElementById('kanban-board');
        if (!boardElement) {
            dragLogger.always('[processColumnDrop] ABORTED - no board element');
            return;
        }

        dragLogger.always('[processColumnDrop] Processing column drop');

        // Process pending drop zone if hovering over one
        if (dragState.pendingDropZone) {
            const dropZone = dragState.pendingDropZone;
            const dropZoneStack = dropZone.parentNode;

            if (dropZoneStack && dropZoneStack.parentNode) {
                const rowOrBoard = dropZoneStack.parentNode;
                const currentStack = dragState.draggedColumn.parentNode;

                if (currentStack && currentStack.classList.contains('kanban-column-stack')) {
                    // Extract column from current stack
                    currentStack.removeChild(dragState.draggedColumn);
                    cleanupEmptyStack(currentStack);

                    // Remove drop zone element
                    if (dropZone.parentNode === dropZoneStack) {
                        dropZoneStack.removeChild(dropZone);
                    }

                    // Convert drop zone stack to regular stack
                    dropZoneStack.classList.remove('column-drop-zone-stack');
                    dropZoneStack.appendChild(dragState.draggedColumn);

                    // Recreate drop zones
                    cleanupAndRecreateDropZones(rowOrBoard);
                }
            }

            dragState.pendingDropZone = null;
        }

        // Clean up any duplicate or orphaned elements in the DOM
        const allColumnsForCleanup = document.querySelectorAll('.kanban-full-height-column');
        const seenColumnIds = new Set();
        allColumnsForCleanup.forEach(col => {
            const colId = col.getAttribute('data-column-id');
            if (seenColumnIds.has(colId)) {
                col.remove();
            } else {
                seenColumnIds.add(colId);
            }
        });

        // Calculate target position based on where the column is in the DOM now
        const allColumns = Array.from(boardElement.querySelectorAll('.kanban-full-height-column'));
        const newOrder = allColumns.map(col => col.getAttribute('data-column-id'));

        // Get row number
        const parentRow = columnElement.closest('.kanban-row');
        const newRow = parentRow ? parseInt(parentRow.getAttribute('data-row-number') || '1') : 1;

        // Update the column's row tag in the data
        if (window.cachedBoard) {
            const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
            if (cachedColumn) {
                let cleanTitle = cachedColumn.title
                    .replace(/#row\d+\b/gi, '')
                    .replace(/\s+#row\d+/gi, '')
                    .replace(/#row\d+\s+/gi, '')
                    .replace(/\s+#row\d+\s+/gi, '')
                    .trim();

                if (newRow > 1) {
                    cachedColumn.title = cleanTitle ? cleanTitle + ` #row${newRow}` : ` #row${newRow}`;
                } else {
                    cachedColumn.title = cleanTitle;
                }
            }
        }

        // Update stack tags in destination stack
        const destinationStack = columnElement.closest('.kanban-column-stack');
        if (destinationStack) {
            const allColumnsInStack = Array.from(destinationStack.querySelectorAll('.kanban-full-height-column'));
            const columnsInDestStack = allColumnsInStack.filter(col => {
                return col.closest('.kanban-column-stack') === destinationStack;
            });

            columnsInDestStack.forEach((col, idx) => {
                const colId = col.getAttribute('data-column-id');

                if (idx === 0) {
                    // First column - remove #stack tag
                    if (window.cachedBoard) {
                        const cachedCol = window.cachedBoard.columns.find(c => c.id === colId);
                        if (cachedCol) {
                            cachedCol.title = cachedCol.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                        }
                    }
                    updateColumnTitleDisplay(colId);
                } else {
                    // Other columns - ensure they have #stack tag
                    if (window.cachedBoard) {
                        const cachedCol = window.cachedBoard.columns.find(c => c.id === colId);
                        if (cachedCol && !/#stack\b/i.test(cachedCol.title)) {
                            const trimmedTitle = cachedCol.title.trim();
                            cachedCol.title = trimmedTitle ? trimmedTitle + ' #stack' : ' #stack';
                        }
                    }
                    updateColumnTitleDisplay(colId);
                }
            });
        }

        // Handle the edge case where column is not in any stack
        const stackContainer = columnElement.closest('.kanban-column-stack');
        if (!stackContainer) {
            if (window.cachedBoard) {
                const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                if (cachedColumn) {
                    cachedColumn.title = cachedColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                }
            }
        }

        // Update the visual display
        const titleElement = columnElement.querySelector('.column-title-text');
        if (titleElement && window.cachedBoard) {
            const columnData = window.cachedBoard.columns.find(col => col.id === columnId);
            if (columnData) {
                const renderedTitle = window.tagUtils ? window.tagUtils.getColumnDisplayTitle(columnData, window.filterTagsFromText) : (columnData.title || '');
                titleElement.innerHTML = renderedTitle;
            }
        }

        // Reorder columns in cached board to match DOM order
        if (window.cachedBoard) {
            const reorderedColumns = newOrder.map(colId =>
                window.cachedBoard.columns.find(col => col.id === colId)
            ).filter(Boolean);

            window.cachedBoard.columns = reorderedColumns;
        }

        // Mark as unsaved
        if (typeof markUnsavedChanges === 'function') {
            markUnsavedChanges();
        }

        // Recalculate stacked column styles after drag
        if (typeof window.applyStackedColumnStyles === 'function') {
            window.applyStackedColumnStyles();
        }
    }

    function cleanupDragVisuals() {
        // Remove visual feedback from tasks
        if (dragState.draggedTask) {
            dragState.draggedTask.classList.remove('dragging', 'drag-preview');
        }

        // Remove visual feedback from columns
        if (dragState.draggedColumn) {
            dragState.draggedColumn.classList.remove('dragging', 'drag-preview');
        }

        const boardElement = document.getElementById('kanban-board');
        if (boardElement) {
            // Clean up task styles
            boardElement.querySelectorAll('.task-item').forEach(task => {
                task.classList.remove('drag-transitioning');
            });

            // Clean up column styles
            boardElement.querySelectorAll('.kanban-full-height-column').forEach(col => {
                col.classList.remove('drag-over-append', 'drag-over', 'drag-transitioning', 'external-drag-over');
            });

            // Clean up row styles
            boardElement.querySelectorAll('.kanban-row').forEach(row => {
                row.classList.remove('drag-over');
            });
        }

        // Clean up drop zone styles
        document.querySelectorAll('.column-drop-zone.drag-over').forEach(dz => {
            dz.classList.remove('drag-over');
        });

        // Hide drop feedback and indicators
        hideDropFeedback();
        hideExternalDropIndicator();
    }

    function resetDragState() {
        // Reset all drag state properties
        dragState.draggedClipboardCard = null;
        dragState.draggedEmptyCard = null;
        dragState.draggedTask = null;
        dragState.originalTaskParent = null;
        dragState.originalTaskNextSibling = null;
        dragState.originalTaskIndex = -1;
        dragState.draggedColumn = null;
        dragState.draggedColumnId = null;
        dragState.originalDataIndex = -1;
        dragState.originalColumnParent = null;
        dragState.originalColumnNextSibling = null;
        dragState.originalColumnIndex = -1;
        dragState.isDragging = false;
        dragState.lastDropTarget = null;
        dragState.leftView = false;
        dragState.leftViewTimestamp = null;
    }

    // ============================================================================
    // UNIFIED GLOBAL DRAGEND HANDLER
    // ============================================================================

    // Global dragend handler - UNIFIED APPROACH
    document.addEventListener('dragend', function(e) {
        dragLogger.always('[dragend] Event fired', {
            hasTask: !!dragState.draggedTask,
            hasColumn: !!dragState.draggedColumn,
            isDragging: dragState.isDragging,
            dropEffect: e.dataTransfer?.dropEffect
        });

        // 1. CAPTURE STATE BEFORE ANY CLEANUP
        const wasTask = !!dragState.draggedTask;
        const wasColumn = !!dragState.draggedColumn;
        const wasDragging = dragState.isDragging;
        const droppedOutside = e.dataTransfer?.dropEffect === 'none';
        const leftView = dragState.leftView;

        // Get current position for debugging
        const currentTaskParent = wasTask ? dragState.draggedTask?.parentNode : null;
        const currentColumnParent = wasColumn ? dragState.draggedColumn?.parentNode : null;

        // Log for debugging (only if state changed)
        const timeSinceLeftView = dragState.leftViewTimestamp ? Date.now() - dragState.leftViewTimestamp : null;
        const logData = {
            dropEffect: e.dataTransfer?.dropEffect,
            wasDragging: wasDragging,
            wasTask: wasTask,
            wasColumn: wasColumn,
            leftView: leftView,
            timeSinceLeftView: timeSinceLeftView,
            taskMovedFromOriginal: wasTask && currentTaskParent !== dragState.originalTaskParent,
            columnMovedFromOriginal: wasColumn && currentColumnParent !== dragState.originalColumnParent
        };

        dragLogger.always('[dragend] State captured', logData);

        // 2. DECIDE: RESTORE OR PROCESS
        let shouldRestore = false;

        if (wasDragging) {
            // Only restore if explicitly dropped outside window (dropEffect === 'none')
            // Do NOT restore based on leftView since we can't detect re-entry in VS Code webviews
            shouldRestore = droppedOutside;

            dragLogger.always('[dragend] Decision', {
                shouldRestore,
                reason: shouldRestore ? 'dropped outside window' : 'process drop'
            });
        } else {
            dragLogger.always('[dragend] SKIPPING - wasDragging is false (already cleaned up by dragleave?)');
        }

        // 3. EXECUTE RESTORATION OR PROCESSING
        if (shouldRestore) {
            // RESTORE - user dragged outside or cancelled
            dragLogger.always('[dragend] Executing RESTORE path');
            if (wasTask) {
                restoreTaskToOriginalPosition();
            }
            if (wasColumn) {
                restoreColumnToOriginalPosition();
            }
        } else if (wasDragging) {
            // PROCESS - valid drop, process the changes
            dragLogger.always('[dragend] Executing PROCESS path');
            if (wasTask) {
                processTaskDrop();
            }
            if (wasColumn) {
                processColumnDrop();
            }
        }

        // 4. VISUAL CLEANUP (always, regardless of restore or process)
        cleanupDragVisuals();

        // 5. STATE CLEANUP (always, at the very end)
        resetDragState();

    }, false);

    // Handle cursor leaving the window during drag
    // This helps detect when the drag operation is lost
    document.addEventListener('dragleave', function(e) {
        if (dragState.isDragging) {
            // Use smart logger to avoid spam - only log when relatedTarget changes
            const logKey = 'dragleave-' + (e.relatedTarget ? 'element' : 'null');
            dragLogger.log(logKey, {
                targetTag: e.target?.tagName,
                relatedTarget: e.relatedTarget,
                clientX: e.clientX,
                clientY: e.clientY
            }, 'dragleave event');

            // Check if we're leaving the document entirely
            // relatedTarget is null when leaving the window
            if (e.relatedTarget === null) {
                dragLogger.always('[DragDrop] *** CURSOR LEFT VIEW - RESTORING TO ORIGINAL POSITION ***');

                // Store references before cleanup
                const droppedTask = dragState.draggedTask;
                const droppedColumn = dragState.draggedColumn;

                dragLogger.always('Cursor left view - restoration state', {
                    hasTask: !!droppedTask,
                    hasColumn: !!droppedColumn,
                    isDragging: dragState.isDragging
                });

                // Restore to original position
                if (droppedTask) {
                    dragLogger.always('Calling restoreTaskToOriginalPosition');
                    restoreTaskToOriginalPosition();
                }
                if (droppedColumn) {
                    dragLogger.always('Calling restoreColumnToOriginalPosition');
                    restoreColumnToOriginalPosition();

                    // Update stacked column styles after DOM restoration
                    if (typeof window.applyStackedColumnStyles === 'function') {
                        window.applyStackedColumnStyles();
                        dragLogger.always('Applied stacked column styles after restoration');
                    }
                }

                // Clean up visuals and state
                cleanupDragVisuals();
                resetDragState();

                // Scroll to the restored element if it's outside the viewport
                if (droppedTask && typeof scrollToElementIfNeeded === 'function') {
                    setTimeout(() => {
                        scrollToElementIfNeeded(droppedTask, 'task');
                    }, 100);
                }
                if (droppedColumn && typeof scrollToElementIfNeeded === 'function') {
                    // Verify column position after a delay to see if something moved it
                    setTimeout(() => {
                        const parent = droppedColumn.parentNode;
                        const currentIdx = parent ? Array.from(parent.children).indexOf(droppedColumn) : -1;
                        dragLogger.always('Column position check BEFORE highlight', {
                            isConnected: droppedColumn.isConnected,
                            currentIndex: currentIdx,
                            parentClass: parent?.className
                        });

                        scrollToElementIfNeeded(droppedColumn, 'column');

                        // Check again after highlight
                        setTimeout(() => {
                            const parent2 = droppedColumn.parentNode;
                            const idx2 = parent2 ? Array.from(parent2.children).indexOf(droppedColumn) : -1;
                            dragLogger.always('Column position check AFTER highlight', {
                                isConnected: droppedColumn.isConnected,
                                currentIndex: idx2,
                                parentClass: parent2?.className
                            });
                        }, 200);
                    }, 100);
                }
            }
        }
    }, false);

    // Handle cursor re-entering the window during drag
    // Resume drag preview when cursor comes back
    document.addEventListener('dragenter', function(e) {
        if (dragState.isDragging) {
            // Use smart logger
            const logKey = 'dragenter-leftView-' + dragState.leftView;
            dragLogger.log(logKey, {
                targetTag: e.target?.tagName,
                leftView: dragState.leftView,
                relatedTarget: e.relatedTarget
            }, 'dragenter event');

            if (dragState.leftView) {
                dragLogger.always('[DragDrop] *** CURSOR RE-ENTERED VIEW *** resuming drag - clearing leftView');

                // Clear leftView - allow dragging to continue normally
                // Will only restore if user leaves AGAIN or drops outside
                dragState.leftView = false;

                // Re-add dragging classes if they were removed
                if (dragState.draggedTask && !dragState.draggedTask.classList.contains('dragging')) {
                    dragState.draggedTask.classList.add('dragging', 'drag-preview');
                }
                if (dragState.draggedColumn && !dragState.draggedColumn.classList.contains('dragging')) {
                    dragState.draggedColumn.classList.add('dragging', 'drag-preview');
                }
            }
        }
    }, false);

    // Handle mouseup outside the webview
    // This catches cases where the drag ends outside the window
    document.addEventListener('mouseup', function(e) {
        // If we were dragging and mouseup fires, clean up
        if (dragState.isDragging) {
            dragLogger.always('Mouse released during drag - cleaning up');

            // Restore the task to its original position if it was moved
            if (dragState.draggedTask && dragState.originalTaskParent) {

                // Check if originalTaskNextSibling is still in the DOM
                const nextSiblingStillValid = dragState.originalTaskNextSibling &&
                    dragState.originalTaskNextSibling.parentNode === dragState.originalTaskParent;

                // Remove from current position
                if (dragState.draggedTask.parentNode) {
                    dragState.draggedTask.parentNode.removeChild(dragState.draggedTask);
                }

                // Restore to original position
                if (nextSiblingStillValid) {
                    dragState.originalTaskParent.insertBefore(dragState.draggedTask, dragState.originalTaskNextSibling);
                } else {
                    // Next sibling might have been moved/deleted, use index instead
                    const children = Array.from(dragState.originalTaskParent.children);
                    const taskItems = children.filter(c => c.classList.contains('task-item'));

                    if (dragState.originalTaskIndex >= 0 && dragState.originalTaskIndex < taskItems.length) {
                        dragState.originalTaskParent.insertBefore(dragState.draggedTask, taskItems[dragState.originalTaskIndex]);
                    } else {
                        dragState.originalTaskParent.appendChild(dragState.draggedTask);
                    }
                }

                // Remove drag classes
                dragState.draggedTask.classList.remove('dragging', 'drag-preview');
            }

            // Restore the column to its original position if it was moved
            if (dragState.draggedColumn && dragState.originalColumnParent) {
                // Check if originalColumnNextSibling is still in the DOM
                const nextSiblingStillValid = dragState.originalColumnNextSibling &&
                    dragState.originalColumnNextSibling.parentNode === dragState.originalColumnParent;

                // Remove from current position
                if (dragState.draggedColumn.parentNode) {
                    dragState.draggedColumn.parentNode.removeChild(dragState.draggedColumn);
                }

                // Restore to original position
                if (nextSiblingStillValid) {
                    dragState.originalColumnParent.insertBefore(dragState.draggedColumn, dragState.originalColumnNextSibling);
                } else {
                    // Next sibling might have been moved, append to original parent
                    dragState.originalColumnParent.appendChild(dragState.draggedColumn);
                }

                // Remove drag classes
                dragState.draggedColumn.classList.remove('dragging', 'drag-preview');
            }

            // Clean up all visual feedback
            hideDropFeedback();
            hideExternalDropIndicator();

            // Reset drag state
            dragState.draggedTask = null;
            dragState.draggedColumn = null;
            dragState.draggedColumnId = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
            dragState.originalColumnParent = null;
            dragState.originalColumnNextSibling = null;
            dragState.originalDataIndex = -1;
            dragState.isDragging = false;
        }
    }, false);

    // Handle visibility change (when tab loses focus or window is minimized)
    document.addEventListener('visibilitychange', function() {
        if (document.hidden && dragState.isDragging) {
            dragLogger.always('Document hidden during drag - cleaning up');

            // Clean up drag state when document becomes hidden
            if (dragState.draggedTask) {
                dragState.draggedTask.classList.remove('dragging', 'drag-preview');
            }
            if (dragState.draggedColumn) {
                dragState.draggedColumn.classList.remove('dragging', 'drag-preview');
            }

            hideDropFeedback();
            hideExternalDropIndicator();

            // Reset state
            dragState.isDragging = false;
            dragState.draggedTask = null;
            dragState.draggedColumn = null;
            dragState.draggedColumnId = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
            dragState.originalColumnParent = null;
            dragState.originalColumnNextSibling = null;
            dragState.originalDataIndex = -1;
        }
    }, false);

}


function handleClipboardCardDrop(e, clipboardData) {

    try {
        const parsedData = JSON.parse(clipboardData);

        // Extract the task data
        const taskData = parsedData.task || parsedData;

        const title = taskData.title || taskData.content || parsedData.content || 'New Card';

        // Ensure description is always a string, never a blob object
        let description = taskData.description || '';
        if (typeof description !== 'string') {
            description = taskData.content || '';
            if (typeof description !== 'string') {
                description = 'Clipboard content';
            }
        }

        createNewTaskWithContent(
            title,
            { x: e.clientX, y: e.clientY },
            description
        );
    } catch (error) {
        // Failed to parse clipboard data
        // Fallback: treat as plain text
        createNewTaskWithContent(
            'Clipboard Content',
            { x: e.clientX, y: e.clientY },
            typeof clipboardData === 'string' ? clipboardData : 'Clipboard content'
        );
    }
}

function handleEmptyCardDrop(e, emptyCardData) {

    try {
        const parsedData = JSON.parse(emptyCardData);

        // Create empty task

        createNewTaskWithContent(
            '',
            { x: e.clientX, y: e.clientY },
            ''
        );
    } catch (error) {
        // Failed to parse empty card data
        // Fallback: create empty task anyway
        createNewTaskWithContent(
            '',
            { x: e.clientX, y: e.clientY },
            ''
        );
    }
}

function handleMultipleFilesDrop(e, filesContent) {
    // Split the pre-formatted markdown links by lines
    const links = filesContent.split(/\r\n|\r|\n/).filter(line => line.trim().length > 0);

    links.forEach((link, index) => {
        // Extract title from the markdown link format
        let title = 'File';

        // Try to extract filename from different link formats
        if (link.startsWith('![](')) {
            // Image: ![](path) - extract filename from path
            const pathMatch = link.match(/!\[\]\(([^)]+)\)/);
            if (pathMatch) {
                const path = decodeURIComponent(pathMatch[1]);
                title = path.split(/[\/\\]/).pop() || 'Image';
            }
        } else if (link.startsWith('[[')) {
            // Wiki link: [[filename]] - extract filename
            const fileMatch = link.match(/\[\[([^\]]+)\]\]/);
            if (fileMatch) {
                title = fileMatch[1];
            }
        } else if (link.startsWith('[') && link.includes('](')) {
            // Standard link: [title](path) - extract title
            const titleMatch = link.match(/\[([^\]]+)\]/);
            if (titleMatch) {
                title = titleMatch[1];
            }
        } else if (link.startsWith('<') && link.endsWith('>')) {
            // URL: <url> - extract domain
            const urlMatch = link.match(/<([^>]+)>/);
            if (urlMatch) {
                try {
                    const url = new URL(urlMatch[1]);
                    title = url.hostname.replace('www.', '');
                } catch {
                    title = 'URL';
                }
            }
        }

        // Stagger creation slightly if multiple files
        setTimeout(() => {
            createNewTaskWithContent(
                title,
                { x: e.clientX, y: e.clientY },
                link
            );
        }, index * 10);
    });
}

function handleClipboardImageDrop(e, imageData) {
    try {
        // Parse the image data
        const parsedData = JSON.parse(imageData);

        const base64Data = parsedData.data;
        const imageType = parsedData.imageType || 'image/png';

        if (!base64Data) {
            console.error('No image data found in parsed data');
            createNewTaskWithContent(
                'Clipboard Image',
                { x: e.clientX, y: e.clientY },
                'Failed to save image: No image data found'
            );
            return;
        }

        // Extract the base64 part (remove data:image/png;base64, prefix if present)
        const base64Only = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;

        processImageSave(e, base64Only, imageType, parsedData.md5Hash);

    } catch (error) {
        console.error('Failed to handle clipboard image drop:', error);
        createNewTaskWithContent(
            'Clipboard Image',
            { x: e.clientX, y: e.clientY },
            'Failed to process clipboard image'
        );
    }
}

function processImageSave(e, base64Data, imageType, md5Hash) {
    try {

        // Get the current markdown file information
        let currentFilePath = window.currentFileInfo?.filePath;

        // Fallback: Request file path from backend if not available
        if (!currentFilePath) {
            // Send message to backend to get current file path and save image
            vscode.postMessage({
                type: 'saveClipboardImageWithPath',
                imageData: base64Data,
                imageType: imageType,
                dropPosition: { x: e.clientX, y: e.clientY },
                md5Hash: md5Hash // Pass MD5 hash for filename
            });
            return;
        }

        // Extract base filename without extension
        const pathParts = currentFilePath.split(/[\/\\]/);
        const fileName = pathParts.pop() || 'kanban';
        const baseFileName = fileName.replace(/\.[^/.]+$/, '');
        const directory = pathParts.join('/'); // Always use forward slash for consistency

        // Generate unique filename for the image
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + 'T' +
                         new Date().toISOString().replace(/[:.]/g, '-').split('T')[1].split('-')[0];
        const extension = imageType.split('/')[1] || 'png';
        const imageFileName = `clipboard-image-${timestamp}.${extension}`;

        // Create the media folder path
        const mediaFolderName = `${baseFileName}-MEDIA`;
        const mediaFolderPath = `${directory}/${mediaFolderName}`;
        const imagePath = `${mediaFolderPath}/${imageFileName}`;


        // Send message to VS Code to save the image
        // The task card will be created by the 'clipboardImageSaved' message handler
        // after the backend confirms the file was saved successfully
        vscode.postMessage({
            type: 'saveClipboardImage',
            imageData: base64Data,
            imagePath: imagePath,
            mediaFolderPath: mediaFolderPath,
            dropPosition: { x: e.clientX, y: e.clientY },
            imageFileName: imageFileName,
            mediaFolderName: mediaFolderName
        });

    } catch (error) {
        console.error('Failed to process clipboard image save:', error);

        // Fallback: create a text card indicating the error
        createNewTaskWithContent(
            'Clipboard Image',
            { x: e.clientX, y: e.clientY },
            'Failed to process clipboard image'
        );
    }
}

function handleVSCodeFileDrop(e, files) {
    const file = files[0];
    const fileName = file.name;

    // Create appropriate link format based on file type
    const fileLink = createFileMarkdownLink(fileName); // For direct file drops, use filename as path

    createNewTaskWithContent(
        fileName,  // Title: actual filename
        { x: e.clientX, y: e.clientY },
        fileLink   // Description: formatted link
    );
}


function handleVSCodeUriDrop(e, uriData) {
    const uris = uriData.split('\n').filter(uri => uri.trim()).filter(uri => {
        const isFile = uri.startsWith('file://') || (uri.includes('/') && !uri.includes('task_') && !uri.includes('col_'));
        return isFile;
    });

    if (uris.length > 0) {
        // Create tasks for each URI using cache-first approach
        uris.forEach((uri, index) => {
            let filename = uri;
            let fullPath = uri;

            if (uri.startsWith('file://')) {
                // Extract filename from file:// URIs
                filename = decodeURIComponent(uri).split('/').pop() || uri;
                fullPath = decodeURIComponent(uri); // Keep full path for link creation
            } else {
                // For non-file URIs, try to get the filename
                filename = uri.split('/').pop() || uri;
                fullPath = uri;
            }

            // Create appropriate link format based on file type
            const fileLink = createFileMarkdownLink(fullPath);

            // Stagger the creation slightly if multiple files
            setTimeout(() => {
                createNewTaskWithContent(
                    filename,  // Title: actual filename
                    { x: e.clientX, y: e.clientY },
                    fileLink   // Description: formatted link
                );
            }, index * 10);
        });
    } else {
        // Could not process dropped file URIs
    }
}


function getActiveTextEditor() {

    if (taskEditor.currentEditor) {
        const editor = taskEditor.currentEditor;
        return {
            type: editor.type.replace('task-', '').replace('-', '-'),
            taskId: editor.taskId,
            columnId: editor.columnId,
            cursorPosition: editor.element.selectionStart || 0,
            element: editor.element
        };
    }
    
    return null;
}

/**
 * Creates new task from dropped content
 * Purpose: Convert external drops to tasks
 * Used by: File drops, clipboard drops, empty card drops
 * @param {string} content - Task title content
 * @param {Object} dropPosition - Column and index info
 * @param {string} description - Optional description
 * Side effects: Sends create task message to VS Code
 */
function createNewTaskWithContent(content, dropPosition, description = '') {
    
    // Check board availability - NEW CACHE SYSTEM
    
    if (!window.cachedBoard) {
        // No cached board available
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No board loaded' 
        });
        return;
    }
    
    if (!window.cachedBoard.columns || window.cachedBoard.columns.length === 0) {
        // Board has no columns
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No columns available' 
        });
        return;
    }
    
    // Find target column
    let targetColumnId = null;
    let insertionIndex = -1;
    
    const elementAtPoint = document.elementFromPoint(dropPosition.x, dropPosition.y);
    
    // Try multiple strategies to find the column
    let columnElement = elementAtPoint?.closest('.kanban-full-height-column');
    
    // If we didn't find a column, try the parent elements
    if (!columnElement) {
        // Check if we're on a row
        const row = elementAtPoint?.closest('.kanban-row');
        if (row) {
            // Find the column that contains this x position
            const columns = row.querySelectorAll('.kanban-full-height-column');
            for (const col of columns) {
                const rect = col.getBoundingClientRect();
                if (dropPosition.x >= rect.left && dropPosition.x <= rect.right) {
                    columnElement = col;
                    break;
                }
            }
        }
    }
    
    
    if (columnElement) {
        targetColumnId = columnElement.dataset.columnId;
        
        // Unfold the column if it's collapsed
        if (columnElement.classList.contains('collapsed')) {
            if (typeof unfoldColumnIfCollapsed === 'function') {
                unfoldColumnIfCollapsed(targetColumnId);
            }
        }
        
        insertionIndex = calculateInsertionIndex(columnElement, dropPosition.y);
    } else {
        const columns = document.querySelectorAll('.kanban-full-height-column'); // Allow collapsed columns
        let minDistance = Infinity;
        
        columns.forEach(column => {
            const rect = column.getBoundingClientRect();
            const distX = Math.abs((rect.left + rect.right) / 2 - dropPosition.x);
            const distY = Math.abs((rect.top + rect.bottom) / 2 - dropPosition.y);
            const distance = Math.sqrt(distX * distX + distY * distY);
            
            if (distance < minDistance) {
                minDistance = distance;
                targetColumnId = column.dataset.columnId;
                
                // Unfold the nearest column if it's collapsed
                if (column.classList.contains('collapsed')) {
                    if (typeof unfoldColumnIfCollapsed === 'function') {
                        unfoldColumnIfCollapsed(targetColumnId);
                    }
                }
                
                insertionIndex = calculateInsertionIndex(column, dropPosition.y);
            }
        });
        
        if (targetColumnId) {
        }
    }
    
    if (!targetColumnId && window.cachedBoard.columns.length > 0) {
        // Try non-collapsed first, then any column
        let fallbackColumn = window.cachedBoard.columns.find(col => 
            !window.collapsedColumns || !window.collapsedColumns.has(col.id)
        );
        
        if (!fallbackColumn) {
            // If all columns are collapsed, use the first one and unfold it
            fallbackColumn = window.cachedBoard.columns[0];
        }
        
        if (fallbackColumn) {
            targetColumnId = fallbackColumn.id;
            
            // Unfold if collapsed
            if (typeof unfoldColumnIfCollapsed === 'function') {
                unfoldColumnIfCollapsed(targetColumnId);
            }
            
            insertionIndex = -1;
        }
    }
    
    if (targetColumnId) {
        // Create new task with cache-first approach (no VS Code message)
        // Ensure all task fields are strings, not blobs or other objects
        const newTask = {
            id: `temp-drop-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: typeof content === 'string' ? content : 'New Task',
            description: typeof description === 'string' ? description : ''
        };

        // Update cached board directly
        if (typeof updateCacheForNewTask === 'function') {
            updateCacheForNewTask(targetColumnId, newTask, insertionIndex);
        }

        // Mark as unsaved changes
        if (typeof markUnsavedChanges === 'function') {
            markUnsavedChanges();
        }

        // Update refresh button to show unsaved state
        if (typeof updateRefreshButtonState === 'function') {
            updateRefreshButtonState('unsaved', 1);
        }

        // Re-render board to show the new task
        if (typeof renderBoard === 'function') {
            renderBoard();
        }
    } else {
        // Could not find suitable column
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Could not find a suitable column. Please ensure at least one column is not collapsed.' 
        });
    }
}


function calculateInsertionIndex(column, clientY) {

    const tasksContainer = column.querySelector('.tasks-container');
    if (!tasksContainer) {
        return -1;
    }
    
    const tasks = Array.from(tasksContainer.children);
    
    if (tasks.length === 0) {
        return 0;
    }
    
    for (let i = 0; i < tasks.length; i++) {
        const taskRect = tasks[i].getBoundingClientRect();
        const taskCenter = taskRect.top + taskRect.height / 2;
        
        if (clientY < taskCenter) {
            return i;
        }
    }
    
    return -1;
}


// Helper function to restore original task position
function restoreTaskPosition() {

    if (dragState.draggedTask && dragState.originalTaskParent) {
        // Remove from current position
        if (dragState.draggedTask.parentNode) {
            dragState.draggedTask.parentNode.removeChild(dragState.draggedTask);
        }
        
        // Insert back to original position
        if (dragState.originalTaskNextSibling) {
            dragState.originalTaskParent.insertBefore(dragState.draggedTask, dragState.originalTaskNextSibling);
        } else {
            dragState.originalTaskParent.appendChild(dragState.draggedTask);
        }
        
        dragState.draggedTask.classList.remove('drag-source-hidden');
    }
}

function setupRowDragAndDrop() {
    const boardElement = document.getElementById('kanban-board');
    const rows = boardElement.querySelectorAll('.kanban-row');

    rows.forEach(row => {
        // Row dragover is now handled by drop zones only
        // This prevents columns from being inserted directly into rows

        row.addEventListener('dragleave', e => {
            if (!row.contains(e.relatedTarget)) {
                row.classList.remove('drag-over');
            }
        });

        row.addEventListener('drop', e => {
            // Only handle drops for column dragging, let external drops bubble up
            if (dragState.draggedColumn && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
                e.preventDefault();
                e.stopPropagation();
                row.classList.remove('drag-over');

                // Clear the row tracking
                dragState.lastRowDropTarget = null;
                dragState.lastRow = null;
            }
        });
    });
}

function calculateColumnDropIndexInRow(draggedColumn) {

    if (!currentBoard || !currentBoard.columns) {return -1;}
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Get all columns in their visual order
    let allColumnsInOrder = [];
    
    // If multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-full-height-column');
            columnsInRow.forEach(col => {
                allColumnsInOrder.push(col.getAttribute('data-column-id'));
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-full-height-column');
        columns.forEach(col => {
            allColumnsInOrder.push(col.getAttribute('data-column-id'));
        });
    }
    
    // Find the target index in the data model
    const visualIndex = allColumnsInOrder.indexOf(columnId);
    
    // Map visual order to data model order
    let targetIndex = 0;
    for (let i = 0; i < visualIndex; i++) {
        const colId = allColumnsInOrder[i];
        if (currentBoard.columns.findIndex(c => c.id === colId) !== -1) {
            targetIndex++;
        }
    }
    
    return targetIndex;
}

function calculateColumnDropIndex(boardElement, draggedColumn) {

    const columns = Array.from(boardElement.querySelectorAll('.kanban-full-height-column'));
    const currentIndex = columns.indexOf(draggedColumn);
    
    if (!currentBoard || !currentBoard.columns) {return -1;}
    
    // Map DOM position to data model position
    const columnId = draggedColumn.getAttribute('data-column-id');
    let targetIndex = 0;
    
    for (let i = 0; i < currentIndex; i++) {
        const col = columns[i];
        const colId = col.getAttribute('data-column-id');
        const dataIndex = currentBoard.columns.findIndex(c => c.id === colId);
        if (dataIndex !== -1) {
            targetIndex++;
        }
    }
    
    return targetIndex;
}

/**
 * Sets up drag and drop for task elements
 * Purpose: Enable dragging tasks between columns
 * Used by: setupDragAndDrop() after board render
 * Side effects: Makes tasks draggable, adds drop zones
 */
function setupTaskDragAndDrop() {

    // Get all columns across all rows
    const boardElement = document.getElementById('kanban-board');
    const allColumns = boardElement.querySelectorAll('.kanban-full-height-column');
    
    allColumns.forEach(columnElement => {
        const columnId = columnElement.dataset.columnId;
        const tasksContainer = columnElement.querySelector('.tasks-container');

        if (!tasksContainer) {return;}

        // Add dragover handler to the entire column for appending to end
        columnElement.addEventListener('dragover', e => {
            // Update Alt key state during drag (user might press/release Alt mid-drag)
            if (dragState.isDragging) {
                dragState.altKeyPressed = e.altKey;
            }

            // Only process if we have a dragged task
            if (!dragState.draggedTask) {return;}

            // Check if we're over the tasks container specifically
            const isOverTasksContainer = tasksContainer.contains(e.target);
            
            if (!isOverTasksContainer) {
                // We're over the column but not the tasks container (e.g., header area)
                e.preventDefault();
                
                // Move task to the end of this column
                const addButton = tasksContainer.querySelector('.add-task-btn');
                if (addButton) {
                    tasksContainer.insertBefore(dragState.draggedTask, addButton);
                } else {
                    tasksContainer.appendChild(dragState.draggedTask);
                }
                
                // Add visual feedback
                columnElement.classList.add('drag-over-append');
            }
        });

        // Add drop handler to entire column
        columnElement.addEventListener('drop', e => {
            if (!dragState.draggedTask) {return;}
            
            const isOverTasksContainer = tasksContainer.contains(e.target);
            if (!isOverTasksContainer) {
                e.preventDefault();
                columnElement.classList.remove('drag-over-append');
            }
        });

        // Clean up visual feedback when leaving column
        columnElement.addEventListener('dragleave', e => {
            if (!columnElement.contains(e.relatedTarget)) {
                columnElement.classList.remove('drag-over-append');
            }
        });

        // Keep the existing tasks container specific handling for precise placement
        // Throttle transition class updates using requestAnimationFrame
        let transitionUpdatePending = false;

        tasksContainer.addEventListener('dragover', e => {
            e.preventDefault();

            // Update Alt key state during drag (user might press/release Alt mid-drag)
            if (dragState.isDragging) {
                dragState.altKeyPressed = e.altKey;
            }

            // Only stop propagation for internal task drags, not external drops
            if (dragState.draggedTask && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
                e.stopPropagation(); // Prevent column-level handler from interfering
            }

            if (!dragState.draggedTask) {
                return;
            }

            // Add dragging class now (delayed from dragstart to avoid layout shift)
            if (!dragState.draggedTask.classList.contains('dragging')) {
                dragState.draggedTask.classList.add('dragging', 'drag-preview');
            }

            // Remove any column-level visual feedback when over tasks
            columnElement.classList.remove('drag-over-append');

            const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY);

            if (afterElement === null) {
                // Insert at the end, but before the add button if it exists
                const addButton = tasksContainer.querySelector('.add-task-btn');
                if (addButton) {
                    tasksContainer.insertBefore(dragState.draggedTask, addButton);
                } else {
                    tasksContainer.appendChild(dragState.draggedTask);
                }
            } else if (afterElement !== dragState.draggedTask) {
                // Insert before the after element
                tasksContainer.insertBefore(dragState.draggedTask, afterElement);
            }

            // Throttle transition class updates to max 60fps
            if (!transitionUpdatePending) {
                transitionUpdatePending = true;
                requestAnimationFrame(() => {
                    tasksContainer.querySelectorAll('.task-item').forEach(task => {
                        if (task !== dragState.draggedTask) {
                            task.classList.add('drag-transitioning');
                        }
                    });
                    transitionUpdatePending = false;
                });
            }
        });

        tasksContainer.addEventListener('drop', e => {
            e.preventDefault();
            
            // Only stop propagation for internal task drags, let external drops bubble up
            if (dragState.draggedTask && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
                e.stopPropagation(); // Prevent column-level handler for internal drags only
            }
            
            columnElement.classList.remove('drag-over');
            columnElement.classList.remove('drag-over-append');
            
            // The actual position change is handled in dragend
        });

        // Setup drag handles for all tasks in this column
        columnElement.querySelectorAll('.task-drag-handle').forEach(handle => {
            setupTaskDragHandle(handle);
        });
    });
}

function setupTaskDragHandle(handle) {
    // Prevent duplicate event listeners
    if (handle.dataset.dragSetup === 'true') {
        return;
    }
    handle.dataset.dragSetup = 'true';

    handle.draggable = true;

    handle.addEventListener('dragstart', e => {
        const taskItem = e.target && e.target.closest ? e.target.closest('.task-item') : null;

        if (taskItem) {
            e.stopPropagation();
            const taskId = taskItem.dataset.taskId;
            const columnId = window.getColumnIdFromElement(taskItem);

            // Store original position
            dragState.draggedTask = taskItem;
            dragState.originalTaskParent = taskItem.parentNode;
            dragState.originalTaskNextSibling = taskItem.nextSibling;
            dragState.originalTaskIndex = Array.from(dragState.originalTaskParent.children).indexOf(taskItem);
            dragState.isDragging = true; // IMPORTANT: Set this BEFORE setting data
            dragState.altKeyPressed = e.altKey; // Track Alt key state from the start

            // Set multiple data formats
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-task:${taskId}`); // Add prefix
            e.dataTransfer.setData('application/kanban-task', taskId);
            e.dataTransfer.setData('application/x-kanban-task', taskId); // Fallback

            // DON'T add dragging class here - causes layout shift that cancels drag
            // Will be added on first dragover event instead
        }
    });

    // NOTE: Task dragend handler removed - now handled by unified global dragend handler

    // Add ESC key handler to cancel task drag
    if (!handle.hasEscListener) {
        handle.hasEscListener = true;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && dragState.isDragging && dragState.draggedTask) {
                restoreTaskPosition();
                dragState.draggedTask.classList.remove('dragging', 'drag-preview');
                
                // Reset drag state
                dragState.draggedTask = null;
                dragState.originalTaskParent = null;
                dragState.originalTaskNextSibling = null;
                dragState.originalTaskIndex = -1;
                dragState.isDragging = false;
                dragState.altKeyPressed = false;
            }
        });
    }
}

function getDragAfterTaskElement(container, y) {

    const draggableElements = [...container.querySelectorAll('.task-item')].filter(el => el !== dragState.draggedTask);
    const addButton = container.querySelector('.add-task-btn');

    // If column is empty (only has add button), always drop at the beginning (before add button)
    if (draggableElements.length === 0) {
        return null; // This means insert at the end (before add button if it exists)
    }

    // If dragging over or near the add button area, treat it as dropping at the end
    if (addButton) {
        const addButtonBox = addButton.getBoundingClientRect();
        if (y >= addButtonBox.top - 10) { // Add 10px buffer above the button
            // Return null to indicate dropping at the end (but before the add button)
            return null;
        }
    }

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

function calculateTaskDropIndex(tasksContainer, draggedTask, event) {

    const tasks = Array.from(tasksContainer.children);
    const currentIndex = tasks.indexOf(draggedTask);
    
    // Return the current index in the DOM
    return currentIndex >= 0 ? currentIndex : 0;
}

/**
 * Calculates insertion index based on mouse position
 * Purpose: Determine where to insert dropped task
 * Used by: Task drop operations
 * @param {HTMLElement} tasksContainer - Target container
 * @param {number} clientY - Mouse Y position
 * @returns {number} Insertion index
 */
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
    if (!currentBoard || !currentBoard.columns) {return -1;}
    return currentBoard.columns.findIndex(col => col.id === columnId);
}

// Drag and drop setup
function setupDragAndDrop() {

    // Clear any existing drag state when setting up
    dragState = {
        draggedColumn: null,
        draggedColumnId: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        originalDataIndex: -1,
        draggedTask: null,
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,
        isDragging: false,  // This is the key flag
        lastValidDropTarget: null,
        lastDropTarget: null,
        lastRowDropTarget: null,
        lastRow: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null,
        draggedClipboardCard: null,
        draggedEmptyCard: null
    };
    
    // Only set up global drag/drop once to prevent multiple listeners
    if (!dragDropInitialized) {
        setupGlobalDragAndDrop();
        dragDropInitialized = true;
    } else {
    }
    
    // Always refresh column, task, and row drag/drop since DOM changes
    setupRowDragAndDrop(); // Setup rows first
    setupColumnDragAndDrop(); // Then columns
    setupTaskDragAndDrop(); // Then tasks
}

/**
 * Cleans up an empty stack and its adjacent drop zone during drag
 * @param {HTMLElement} stack - The stack that might be empty
 */
function cleanupEmptyStack(stack) {
    if (!stack || !stack.classList.contains('kanban-column-stack')) {
        return;
    }

    // Check if stack is empty (no columns)
    const hasColumns = stack.querySelectorAll('.kanban-full-height-column').length > 0;
    if (hasColumns || stack.classList.contains('column-drop-zone-stack')) {
        return; // Stack still has columns or is a drop zone, don't remove
    }

    // Find the drop zone to the right of this stack
    const nextSibling = stack.nextSibling;

    // Remove the empty stack
    stack.remove();

    // Remove the adjacent drop zone if it exists
    if (nextSibling && nextSibling.classList &&
        nextSibling.classList.contains('column-drop-zone-stack')) {
        nextSibling.remove();
    }
}

/**
 * Cleans up and recreates drop zones in a row or board
 * Removes consecutive empty stacks and ensures drop zones before/between/after content stacks
 */
function cleanupAndRecreateDropZones(container) {
    // Get all stacks
    const allStacks = Array.from(container.children).filter(child =>
        child.classList.contains('kanban-column-stack')
    );

    // Separate content stacks from drop-zone stacks
    const contentStacks = [];
    const dropZoneStacks = [];

    allStacks.forEach(stack => {
        const hasColumns = stack.querySelectorAll('.kanban-full-height-column').length > 0;
        if (hasColumns) {
            contentStacks.push(stack);
        } else {
            dropZoneStacks.push(stack);
        }
    });

    // Remove all existing drop-zone stacks
    dropZoneStacks.forEach(stack => {
        stack.remove();
    });

    // Insert new drop zones: before first, between each, and after last
    if (contentStacks.length > 0) {
        // Before first
        const dropZoneBefore = createDropZoneStack('column-drop-zone-before');
        container.insertBefore(dropZoneBefore, contentStacks[0]);

        // Between each
        for (let i = 0; i < contentStacks.length - 1; i++) {
            const dropZoneBetween = createDropZoneStack('column-drop-zone-between');
            container.insertBefore(dropZoneBetween, contentStacks[i].nextSibling);
        }

        // After last
        const dropZoneAfter = createDropZoneStack('column-drop-zone-after');
        const addBtn = container.querySelector('.add-column-btn');
        if (addBtn) {
            container.insertBefore(dropZoneAfter, addBtn);
        } else {
            container.appendChild(dropZoneAfter);
        }
    }
}

/**
 * Creates a drop zone stack with the specified class
 */
function createDropZoneStack(dropZoneClass) {
    const dropZoneStack = document.createElement('div');
    dropZoneStack.className = 'kanban-column-stack column-drop-zone-stack';

    const dropZone = document.createElement('div');
    dropZone.className = `column-drop-zone ${dropZoneClass}`;

    dropZoneStack.appendChild(dropZone);
    return dropZoneStack;
}

/**
 * Creates or updates transparent drop zones below the last column in each stack
 * These zones allow dropping columns to stack them vertically
 */
function updateStackBottomDropZones() {
    const stacks = document.querySelectorAll('.kanban-column-stack:not(.column-drop-zone-stack)');

    stacks.forEach(stack => {
        // Remove existing bottom drop zone if any
        const existingZone = stack.querySelector('.stack-bottom-drop-zone');
        if (existingZone) {
            existingZone.remove();
        }

        // Check if stack has columns
        const columns = stack.querySelectorAll('.kanban-full-height-column');
        if (columns.length === 0) {return;}

        // Create transparent drop zone element that fills remaining stack height
        // Position it absolutely using same calculation as column sticky positioning
        const dropZone = document.createElement('div');
        dropZone.className = 'stack-bottom-drop-zone';

        // Calculate top position by summing up heights of all columns' elements
        // This matches the calculation in recalculateStackHeights()
        let cumulativeTop = 0;
        columns.forEach(col => {
            const columnMargin = col.querySelector('.column-margin');
            const columnHeader = col.querySelector('.column-header');
            const columnTitle = col.querySelector('.column-title');
            const columnFooter = col.querySelector('.column-footer');

            if (columnMargin) {cumulativeTop += columnMargin.offsetHeight;}
            if (columnHeader) {cumulativeTop += columnHeader.offsetHeight;}
            if (columnTitle) {cumulativeTop += columnTitle.offsetHeight;}
            if (columnFooter) {cumulativeTop += columnFooter.offsetHeight;}
        });

        dropZone.style.cssText = `
            position: absolute;
            top: ${cumulativeTop}px;
            left: 0;
            right: 0;
            bottom: 0;
            pointer-events: auto;
            z-index: 1;
        `;

        // Add dragover handler for this drop zone
        dropZone.addEventListener('dragover', e => {
            if (!dragState.draggedColumn) {return;}
            e.preventDefault();

            // Place dragged column at the end of this stack
            if (dragState.draggedColumn !== stack.lastElementChild ||
                dragState.draggedColumn.previousElementSibling !== columns[columns.length - 1]) {

                // Insert before the drop zone (which is last)
                stack.insertBefore(dragState.draggedColumn, dropZone);

                // Update styles
                if (!dragState.styleUpdatePending && typeof window.applyStackedColumnStyles === 'function') {
                    dragState.styleUpdatePending = true;
                    requestAnimationFrame(() => {
                        window.applyStackedColumnStyles();
                        updateStackBottomDropZones();
                        dragState.styleUpdatePending = false;
                    });
                }
            }
        });

        // Append to stack
        stack.appendChild(dropZone);
    });
}

// Make it globally accessible for layout updates
window.updateStackBottomDropZones = updateStackBottomDropZones;

/**
 * Updates the visual column title display in the DOM after modifying the data model
 * @param {string} columnId - The ID of the column to update
 */
function updateColumnTitleDisplay(columnId) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) {
        console.warn('[dragDrop-updateTitle] Column element not found:', columnId);
        return;
    }

    // Get updated title from data model
    const column = window.cachedBoard?.columns.find(c => c.id === columnId);
    if (!column) {
        console.warn('[dragDrop-updateTitle] Column not found in data model:', columnId);
        return;
    }

    // Get display title using shared utility function
    const renderedTitle = window.tagUtils ? window.tagUtils.getColumnDisplayTitle(column, window.filterTagsFromText) : (column.title || '');

    // Update the column title DOM element
    const titleElement = columnElement.querySelector('.column-title-text.markdown-content');
    if (titleElement) {
        titleElement.innerHTML = renderedTitle;
    } else {
        console.warn('[dragDrop-updateTitle] Title element not found for:', columnId);
    }

    // Update stack toggle button state
    const stackToggleBtn = columnElement.querySelector('.stack-toggle-btn');
    if (stackToggleBtn) {
        const hasStack = /#stack\b/i.test(column.title);
        if (hasStack) {
            stackToggleBtn.classList.add('active');
            stackToggleBtn.textContent = 'On';
        } else {
            stackToggleBtn.classList.remove('active');
            stackToggleBtn.textContent = 'Off';
        }
    }
}

/**
 * Sets up drag and drop for column reordering
 * Purpose: Enable column rearrangement
 * Used by: setupDragAndDrop() after board render
 * Side effects: Makes column headers draggable
 */
function setupColumnDragAndDrop() {

    const boardElement = document.getElementById('kanban-board');
    const columns = boardElement.querySelectorAll('.kanban-full-height-column');

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) {return;}

        // Prevent duplicate event listeners
        if (dragHandle.dataset.dragSetup === 'true') {
            return;
        }
        dragHandle.dataset.dragSetup = 'true';

        dragHandle.addEventListener('dragstart', e => {
            const columnElement = column;
            const columnId = columnElement.getAttribute('data-column-id');

            // Find the original position in the data model
            const originalIndex = currentBoard.columns.findIndex(c => c.id === columnId);

            // Store drag state including original parent stack
            dragState.draggedColumn = columnElement;
            dragState.draggedColumnId = columnId;
            dragState.originalDataIndex = originalIndex;
            dragState.originalColumnParent = columnElement.parentNode; // Store original stack
            dragState.originalColumnNextSibling = columnElement.nextSibling; // Store position in stack
            dragState.originalColumnIndex = Array.from(columnElement.parentNode.children).indexOf(columnElement); // Store DOM index
            dragState.isDragging = true;
            dragState.lastDropTarget = null;  // Track last drop position
            dragState.styleUpdatePending = false;  // Track if style update is needed

            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-full-height-column:${columnId}`);

            // Visual feedback
            columnElement.classList.add('dragging', 'drag-preview');

            // DON'T add column-drag-active here - it causes layout shift that cancels drag
            // It will be added on first dragover event instead

            // FIX SOURCE STACK TAGS: Update tags for remaining columns in source stack
            const sourceStack = columnElement.closest('.kanban-column-stack');
            if (sourceStack) {
                // Get ALL columns in this stack, but EXCLUDE columns from nested stacks
                const allColumnsInStack = Array.from(sourceStack.querySelectorAll('.kanban-full-height-column'));
                const columnsInSourceStack = allColumnsInStack.filter(col => {
                    // Keep this column only if its CLOSEST parent stack is THIS stack (not a nested one)
                    return col !== columnElement && col.closest('.kanban-column-stack') === sourceStack;
                });

                columnsInSourceStack.forEach((col, idx) => {
                    const colId = col.getAttribute('data-column-id');

                    if (idx === 0) {
                        // First remaining column - remove #stack tag
                        if (window.cachedBoard) {
                            const cachedCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (cachedCol) {
                                cachedCol.title = cachedCol.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                            }
                        }
                        if (window.cachedBoard) {
                            const currentCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (currentCol) {
                                currentCol.title = currentCol.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                            }
                        }
                        // DELAY: Update visual display after dragstart to avoid canceling drag
                        setTimeout(() => updateColumnTitleDisplay(colId), 50);
                    } else {
                        // Other columns - ensure they have #stack tag
                        if (window.cachedBoard) {
                            const cachedCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (cachedCol && !/#stack\b/i.test(cachedCol.title)) {
                                const trimmedTitle = cachedCol.title.trim();
                                // Ensure space before #stack if title is not empty
                                cachedCol.title = trimmedTitle ? trimmedTitle + ' #stack' : ' #stack';
                            }
                        }
                        if (window.cachedBoard) {
                            const currentCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (currentCol && !/#stack\b/i.test(currentCol.title)) {
                                const trimmedTitle = currentCol.title.trim();
                                // Ensure space before #stack if title is not empty
                                currentCol.title = trimmedTitle ? trimmedTitle + ' #stack' : ' #stack';
                            }
                        }
                        // DELAY: Update visual display after dragstart to avoid canceling drag
                        setTimeout(() => updateColumnTitleDisplay(colId), 50);
                    }
                });
            }


        });

        // NOTE: Column dragend handler removed - now handled by unified global dragend handler

        column.addEventListener('dragover', e => {
            if (!dragState.draggedColumn || dragState.draggedColumn === column) {return;}

            // Don't handle if we're currently over a drop zone - let the drop zone handle it
            if (dragState.pendingDropZone && dragState.draggedColumn) {
                const dropZone = dragState.pendingDropZone;
                const dropZoneStack = dropZone.parentNode;

                if (dropZoneStack && dropZoneStack.parentNode) {
                    const rowOrBoard = dropZoneStack.parentNode;
                    const currentStack = dragState.draggedColumn.parentNode;

                    if (currentStack && currentStack.classList.contains('kanban-column-stack')) {
                        // Extract column from current stack
                        currentStack.removeChild(dragState.draggedColumn);
                        cleanupEmptyStack(currentStack);

                        // Remove drop zone element
                        if (dropZone.parentNode === dropZoneStack) {
                            dropZoneStack.removeChild(dropZone);
                        }

                        // Convert drop zone stack to regular stack
                        dropZoneStack.classList.remove('column-drop-zone-stack');
                        dropZoneStack.appendChild(dragState.draggedColumn);

                        // Recreate drop zones
                        cleanupAndRecreateDropZones(rowOrBoard);
                    }
                }

                dragState.pendingDropZone = null;
            }

            // Clean up any duplicate or orphaned elements in the DOM before processing
            const allColumnsForCleanup = document.querySelectorAll('.kanban-full-height-column');
            const seenColumnIds = new Set();
            allColumnsForCleanup.forEach(col => {
                const colId = col.getAttribute('data-column-id');
                if (seenColumnIds.has(colId)) {
                    col.remove();
                } else {
                    seenColumnIds.add(colId);
                }
            });

            // Clean up visual feedback
            columnElement.classList.remove('dragging', 'drag-preview');

            document.querySelectorAll('.kanban-full-height-column').forEach(col => {
                col.classList.remove('drag-over', 'drag-transitioning');
            });
            document.querySelectorAll('.kanban-row').forEach(row => {
                row.classList.remove('drag-over');
            });

            // Calculate target position based on where the column is in the DOM now
            const allColumns = Array.from(boardElement.querySelectorAll('.kanban-full-height-column'));
            const targetDOMIndex = allColumns.indexOf(columnElement);
            
            // Map DOM position to data model position
            // Build the new order based on current DOM state
            const newOrder = allColumns.map(col => col.getAttribute('data-column-id'));
            const targetDataIndex = newOrder.indexOf(columnId);
            
            // Get row number
            const parentRow = columnElement.closest('.kanban-row');
            const newRow = parentRow ? parseInt(parentRow.getAttribute('data-row-number') || '1') : 1;

            // Update the column's row tag FIRST in the data before reordering
            // This ensures the column has the correct row tag when the board is reordered
            if (window.cachedBoard) {
                const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                if (cachedColumn) {
                    // Update row tag in cached column
                    let cleanTitle = cachedColumn.title
                        .replace(/#row\d+\b/gi, '')
                        .replace(/\s+#row\d+/gi, '')
                        .replace(/#row\d+\s+/gi, '')
                        .replace(/\s+#row\d+\s+/gi, '')
                        .trim();

                    if (newRow > 1) {
                        // Ensure space before #row tag if title is not empty
                        cachedColumn.title = cleanTitle ? cleanTitle + ` #row${newRow}` : ` #row${newRow}`;
                    } else {
                        cachedColumn.title = cleanTitle;
                    }
                }
            }

            // Also update currentBoard
            if (window.cachedBoard) {
                const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                if (currentColumn) {
                    let cleanTitle = currentColumn.title
                        .replace(/#row\d+\b/gi, '')
                        .replace(/\s+#row\d+/gi, '')
                        .replace(/#row\d+\s+/gi, '')
                        .replace(/\s+#row\d+\s+/gi, '')
                        .trim();

                    if (newRow > 1) {
                        // Ensure space before #row tag if title is not empty
                        currentColumn.title = cleanTitle ? cleanTitle + ` #row${newRow}` : ` #row${newRow}`;
                    } else {
                        currentColumn.title = cleanTitle;
                    }
                }
            }

            // FIX DESTINATION STACK TAGS: Update tags for all columns in destination stack
            const destinationStack = columnElement.closest('.kanban-column-stack');
            if (destinationStack) {
                // Get ALL columns in this stack, but EXCLUDE columns from nested stacks
                const allColumnsInStack = Array.from(destinationStack.querySelectorAll('.kanban-full-height-column'));
                const columnsInDestStack = allColumnsInStack.filter(col => {
                    // Keep this column only if its CLOSEST parent stack is THIS stack (not a nested one)
                    return col.closest('.kanban-column-stack') === destinationStack;
                });

                columnsInDestStack.forEach((col, idx) => {
                    const colId = col.getAttribute('data-column-id');

                    if (idx === 0) {
                        // First column - remove #stack tag
                        if (window.cachedBoard) {
                            const cachedCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (cachedCol) {
                                cachedCol.title = cachedCol.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                            }
                        }
                        if (window.cachedBoard) {
                            const currentCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (currentCol) {
                                currentCol.title = currentCol.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                            }
                        }
                        // Update the visual display
                        updateColumnTitleDisplay(colId);
                    } else {
                        // Other columns - ensure they have #stack tag
                        if (window.cachedBoard) {
                            const cachedCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (cachedCol && !/#stack\b/i.test(cachedCol.title)) {
                                const trimmedTitle = cachedCol.title.trim();
                                // Ensure space before #stack if title is not empty
                                cachedCol.title = trimmedTitle ? trimmedTitle + ' #stack' : ' #stack';
                            }
                        }
                        if (window.cachedBoard) {
                            const currentCol = window.cachedBoard.columns.find(c => c.id === colId);
                            if (currentCol && !/#stack\b/i.test(currentCol.title)) {
                                const trimmedTitle = currentCol.title.trim();
                                // Ensure space before #stack if title is not empty
                                currentCol.title = trimmedTitle ? trimmedTitle + ' #stack' : ' #stack';
                            }
                        }
                        // Update the visual display
                        updateColumnTitleDisplay(colId);
                    }
                });
            }

            // Handle the edge case where column is not in any stack
            const stackContainer = columnElement.closest('.kanban-column-stack');
            if (!stackContainer) {
                // Dropped OUTSIDE any stack - remove #stack tag
                if (window.cachedBoard) {
                    const cachedColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                    if (cachedColumn) {
                        cachedColumn.title = cachedColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                    }
                }
                if (window.cachedBoard) {
                    const currentColumn = window.cachedBoard.columns.find(col => col.id === columnId);
                    if (currentColumn) {
                        currentColumn.title = currentColumn.title.replace(/#stack\b/gi, '').replace(/\s+/g, ' ').trim();
                    }
                }
            }

            // Update the visual display using shared function
            const titleElement = columnElement.querySelector('.column-title-text');
            if (titleElement && window.cachedBoard) {
                const columnData = window.cachedBoard.columns.find(col => col.id === columnId);
                if (columnData) {
                    const renderedTitle = window.tagUtils ? window.tagUtils.getColumnDisplayTitle(columnData, window.filterTagsFromText) : (columnData.title || '');
                    titleElement.innerHTML = renderedTitle;
                }
            }

            // NEW CACHE SYSTEM: Update cached board directly
            if (window.cachedBoard) {
                // Reorder columns in cached board to match DOM order
                const reorderedColumns = newOrder.map(colId =>
                    window.cachedBoard.columns.find(col => col.id === colId)
                ).filter(Boolean);

                window.cachedBoard.columns = reorderedColumns;
                
                // Also update currentBoard for compatibility
                if (window.cachedBoard !== window.cachedBoard) {
                    const currentReordered = newOrder.map(colId => 
                        window.cachedBoard.columns.find(col => col.id === colId)
                    ).filter(Boolean);
                    window.cachedBoard.columns = currentReordered;
                }
            }
            
            // NEW CACHE SYSTEM: Mark as unsaved
            if (typeof markUnsavedChanges === 'function') {
                markUnsavedChanges();
            }

            // Recalculate stacked column styles after drag
            if (typeof window.applyStackedColumnStyles === 'function') {
                window.applyStackedColumnStyles();
            }

            // Reset drag state
            dragState.draggedColumn = null;
            dragState.draggedColumnId = null;
            dragState.originalDataIndex = -1;
            dragState.isDragging = false;
            dragState.lastDropTarget = null;
        });

        column.addEventListener('dragover', e => {
            if (!dragState.draggedColumn || dragState.draggedColumn === column) {return;}

            // Don't handle if we're currently over a drop zone - let the drop zone handle it
            if (dragState.pendingDropZone) {
                return;
            }

            e.preventDefault();

            const draggedStack = dragState.draggedColumn.parentNode;
            const targetStack = column.parentNode;

            if (!draggedStack || !targetStack ||
                !draggedStack.classList.contains('kanban-column-stack') ||
                !targetStack.classList.contains('kanban-column-stack')) {
                return;
            }

            const rect = column.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;

            // Determine target position (vertical)
            let targetElement;
            let insertBefore = false;

            if (e.clientY < midpoint) {
                // Insert before this column
                targetElement = column;
                insertBefore = true;
            } else {
                // Insert after this column
                targetElement = column.nextSibling;
                insertBefore = false;
            }

            // Only move if it's a different position than last time
            const targetKey = 'column-' + column.getAttribute('data-column-id') + '-' + insertBefore;
            if (dragState.lastDropTarget !== targetKey) {
                dragState.lastDropTarget = targetKey;

                if (insertBefore) {
                    // Only move if not already there
                    if (dragState.draggedColumn.nextSibling !== column) {
                        const oldStack = dragState.draggedColumn.parentNode;
                        targetStack.insertBefore(dragState.draggedColumn, column);

                        // Clean up empty stack and its drop zone
                        cleanupEmptyStack(oldStack);

                        // Schedule style update if not already pending
                        if (!dragState.styleUpdatePending && typeof window.applyStackedColumnStyles === 'function') {
                            dragState.styleUpdatePending = true;
                            requestAnimationFrame(() => {
                                window.applyStackedColumnStyles();
                                dragState.styleUpdatePending = false;
                            });
                        }
                    }
                } else {
                    // Only move if not already there
                    if (targetElement && dragState.draggedColumn.nextSibling !== targetElement) {
                        const oldStack = dragState.draggedColumn.parentNode;
                        targetStack.insertBefore(dragState.draggedColumn, targetElement);

                        // Clean up empty stack and its drop zone
                        cleanupEmptyStack(oldStack);

                        // Schedule style update if not already pending
                        if (!dragState.styleUpdatePending && typeof window.applyStackedColumnStyles === 'function') {
                            dragState.styleUpdatePending = true;
                            requestAnimationFrame(() => {
                                window.applyStackedColumnStyles();
                                dragState.styleUpdatePending = false;
                            });
                        }
                    } else if (!targetElement && dragState.draggedColumn !== targetStack.lastElementChild) {
                        const oldStack = dragState.draggedColumn.parentNode;
                        targetStack.appendChild(dragState.draggedColumn);

                        // Clean up empty stack and its drop zone
                        cleanupEmptyStack(oldStack);

                        // Schedule style update if not already pending
                        if (!dragState.styleUpdatePending && typeof window.applyStackedColumnStyles === 'function') {
                            dragState.styleUpdatePending = true;
                            requestAnimationFrame(() => {
                                window.applyStackedColumnStyles();
                                dragState.styleUpdatePending = false;
                            });
                        }
                    }
                }
            }
        });
    });

    // Add dragover handler to allow dropping below the last column in a stack
    // Use event delegation on document to handle dynamically created stacks
    document.addEventListener('dragover', e => {
        if (!dragState.draggedColumn) {return;}

        // Don't interfere if directly over a column or drop zone
        if (e.target.classList.contains('kanban-full-height-column') ||
            e.target.closest('.kanban-full-height-column') ||
            e.target.classList.contains('column-drop-zone')) {
            return;
        }

        // First try to find stack directly
        let stack = e.target.closest('.kanban-column-stack');

        // If not hovering over stack, check if hovering over row below a stack
        if (!stack) {
            const row = e.target.closest('.kanban-row');
            if (!row) {return;}

            // Find all stacks in this row and check if mouse is below any of them
            const stacks = Array.from(row.querySelectorAll('.kanban-column-stack'));

            for (const candidateStack of stacks) {
                if (candidateStack.classList.contains('column-drop-zone-stack')) {continue;}

                const columns = Array.from(candidateStack.querySelectorAll('.kanban-full-height-column'));
                if (columns.length === 0) {continue;}

                const lastColumn = columns[columns.length - 1];
                const lastRect = lastColumn.getBoundingClientRect();
                const stackRect = candidateStack.getBoundingClientRect();

                // Check if mouse is horizontally within stack bounds and vertically below last column
                if (e.clientX >= stackRect.left &&
                    e.clientX <= stackRect.right &&
                    e.clientY > lastRect.bottom) {
                    stack = candidateStack;
                    break;
                }
            }
        }

        if (!stack || stack.classList.contains('column-drop-zone-stack')) {
            return;
        }

        e.preventDefault();

        // Check if mouse is below all columns (vertical stacking)
        const columns = Array.from(stack.querySelectorAll('.kanban-full-height-column'));
        if (columns.length === 0) {return;}

        const lastColumn = columns[columns.length - 1];
        const lastRect = lastColumn.getBoundingClientRect();

        // Only handle vertical drops below the last column
        if (e.clientY > lastRect.bottom) {
            const targetKey = 'stack-bottom-' + Array.from(stack.children).indexOf(dragState.draggedColumn);
            if (dragState.lastDropTarget !== targetKey) {
                dragState.lastDropTarget = targetKey;

                if (dragState.draggedColumn !== stack.lastElementChild) {
                    stack.appendChild(dragState.draggedColumn);

                    // Schedule style update if not already pending
                    if (!dragState.styleUpdatePending && typeof window.applyStackedColumnStyles === 'function') {
                        dragState.styleUpdatePending = true;
                        requestAnimationFrame(() => {
                            window.applyStackedColumnStyles();
                            dragState.styleUpdatePending = false;
                        });
                    }
                }
            }
        }
    });

    // Add dragover handlers specifically to drop zones - visual feedback only
    document.addEventListener('dragover', (e) => {
        // ONLY handle if the direct target is a drop zone (not a child element)
        if (!e.target.classList.contains('column-drop-zone')) {
            // Clear any previous drag-over states
            document.querySelectorAll('.column-drop-zone.drag-over').forEach(dz => {
                dz.classList.remove('drag-over');
            });
            dragState.pendingDropZone = null;
            return;
        }

        // Only handle drop zones for column drags, not task drags
        if (!dragState.draggedColumn) {
            return;
        }

        const dropZone = e.target;
        e.preventDefault();

        // Add visual feedback only - don't move anything yet
        document.querySelectorAll('.column-drop-zone.drag-over').forEach(dz => {
            if (dz !== dropZone) {dz.classList.remove('drag-over');}
        });
        dropZone.classList.add('drag-over');

        // Store the drop zone for processing on dragend
        dragState.pendingDropZone = dropZone;
    });

    // NOTE: Drop zone cleanup dragend handler removed - now handled by unified global dragend handler (cleanupDragVisuals)
}

function calculateColumnNewPosition(draggedColumn) {

    if (!currentBoard || !currentBoard.columns) {return 0;}
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Build the desired final order of ALL columns based on current DOM state
    let desiredOrder = [];
    
    // Check if we have multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        // Multi-row layout - collect columns row by row, left to right
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-full-height-column');
            columnsInRow.forEach(col => {
                const colId = col.getAttribute('data-column-id');
                if (colId) {
                    desiredOrder.push(colId);
                }
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-full-height-column');
        columns.forEach(col => {
            const colId = col.getAttribute('data-column-id');
            if (colId) {
                desiredOrder.push(colId);
            }
        });
    }
    
    // Find where our dragged column should be in the final order
    const targetPosition = desiredOrder.indexOf(columnId);
    
    
    return targetPosition >= 0 ? targetPosition : 0;
}