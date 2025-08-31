// Track if drag/drop is already set up to prevent multiple listeners
let dragDropInitialized = false;
let isProcessingDrop = false; // Prevent multiple simultaneous drops
let currentExternalDropColumn = null;
let externalDropIndicator = null;

// Track recently created tasks to prevent duplicates
let recentlyCreatedTasks = new Set();

// Real-time drag preview tracking
let dragState = {
    // For columns
    draggedColumn: null,
    originalColumnIndex: -1,
    originalColumnNextSibling: null,
    originalColumnParent: null,  // Add this line
    
    // For tasks
    draggedTask: null,
    originalTaskIndex: -1,
    originalTaskParent: null,
    originalTaskNextSibling: null,
    
    // Common
    isDragging: false,
    lastValidDropTarget: null
};

// External file drop location indicators
function createExternalDropIndicator() {
    console.log(`createExternalDropIndicator`);

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
    console.log(`showExternalDropIndicator`);

    const indicator = createExternalDropIndicator();
    const tasksContainer = column.querySelector('.tasks-container');
    
    if (!tasksContainer) return;
    
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
    console.log(`hideExternalDropIndicator`);

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
    console.log(`cleanupExternalDropIndicators`);

    hideExternalDropIndicator();
    if (externalDropIndicator) {
        externalDropIndicator.remove();
        externalDropIndicator = null;
    }
}

function setupGlobalDragAndDrop() {
    console.log(`setupGlobalDragAndDrop`);

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
    // function isExternalFileDrag(e) {
    //     const dt = e.dataTransfer;
    //     if (!dt) return false;
        
    //     // First check if we have an active internal drag state
    //     if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
    //         return false; // This is definitely an internal drag
    //     }
        
    //     // Check the types array for our custom MIME types
    //     // Note: Some browsers lowercase MIME types, so check both cases
    //     const typesArray = Array.from(dt.types);
    //     const typesString = typesArray.join(',').toLowerCase();
        
    //     // Check for our specific internal kanban drag identifiers
    //     if (typesString.includes('application/kanban-task') || 
    //         typesString.includes('application/kanban-column') ||
    //         typesString.includes('application/column-id')) {
    //         return false; // Internal kanban drag
    //     }
        
    //     // If we only have text/plain and no Files, it's likely internal
    //     // External file drags always have 'Files' type
    //     const hasFiles = typesArray.some(t => t === 'Files' || t === 'files');
    //     const hasUriList = typesArray.some(t => t.toLowerCase() === 'text/uri-list');
        
    //     // Only consider it external if it has Files or uri-list
    //     // AND doesn't have our internal markers
    //     return hasFiles || hasUriList;
    // }

    function isExternalFileDrag(e) {
        const dt = e.dataTransfer;
        if (!dt) return false;
        
        // Check for Files type FIRST (most reliable indicator)
        const hasFiles = Array.from(dt.types).some(t => t === 'Files' || t === 'files');
        if (hasFiles) return true;
        
        // Then check if we have an active internal drag
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return false;
        }
        
        // Check for uri-list (another indicator of external files)
        const hasUriList = Array.from(dt.types).some(t => t.toLowerCase() === 'text/uri-list');
        return hasUriList;
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
    
    // Handle dropped files
    boardContainer.addEventListener('drop', handleFileDrop, false);
    document.addEventListener('drop', handleFileDrop, false);
    
    function handleFileDrop(e) {
        // Always hide feedback first
        hideDropFeedback(e);
        hideExternalDropIndicator();
        
        // Check if this is an internal drag - if so, ignore
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            console.log('Ignoring file drop - internal drag in progress');
            return;
        }
        
        if (isProcessingDrop) {
            return;
        }
        
        const dt = e.dataTransfer;
        
        // Double-check this isn't an internal drag
        const textData = dt.getData('text/plain');
        if (textData && (textData.startsWith('kanban-task:') || textData.startsWith('kanban-column:'))) {
            console.log('Ignoring file drop - detected internal kanban data');
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
            } else if (textPlain && !textPlain.startsWith('kanban-') && 
                    (textPlain.startsWith('file://') || textPlain.includes('/'))) {
                handleVSCodeUriDrop(e, textPlain);
            } else {
                isProcessingDrop = false;
            }
        }
    }
}

function handleVSCodeFileDrop(e, files) {
    console.log(`handleVSCodeFileDrop`);

    const file = files[0];
    const fileName = file.name;
    
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
    console.log(`handleVSCodeUriDrop`);

    const uris = uriData.split('\n').filter(uri => uri.trim()).filter(uri => {
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
    console.log(`getActiveTextEditor`);

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

function createNewTaskWithContent(content, dropPosition, description = '') {
    console.log(`createNewTaskWithContent`);

    if (recentlyCreatedTasks.has(content)) {
        return;
    }
    
    recentlyCreatedTasks.add(content);
    setTimeout(() => recentlyCreatedTasks.delete(content), 2000);
    
    // Find the column at the drop position more accurately
    let targetColumnId = null;
    let insertionIndex = -1;
    
    // First, try to find the column directly under the drop position
    const elementAtPoint = document.elementFromPoint(dropPosition.x, dropPosition.y);
    const columnElement = elementAtPoint?.closest('.kanban-column');
    
    if (columnElement && !columnElement.classList.contains('collapsed')) {
        targetColumnId = columnElement.dataset.columnId;
        insertionIndex = calculateInsertionIndex(columnElement, dropPosition.y);
        console.log(`Found column directly at drop point: ${targetColumnId}`);
    } else {
        // Fallback to finding nearest column (improved for multi-row layout)
        const columns = document.querySelectorAll('.kanban-column:not(.collapsed)');
        let minDistance = Infinity;
        
        columns.forEach(column => {
            const rect = column.getBoundingClientRect();
            // Check both X and Y distance for multi-row layout
            const distX = Math.abs((rect.left + rect.right) / 2 - dropPosition.x);
            const distY = Math.abs((rect.top + rect.bottom) / 2 - dropPosition.y);
            const distance = Math.sqrt(distX * distX + distY * distY);
            
            if (distance < minDistance) {
                minDistance = distance;
                targetColumnId = column.dataset.columnId;
                insertionIndex = calculateInsertionIndex(column, dropPosition.y);
            }
        });
        
        if (targetColumnId) {
            console.log(`Found nearest column: ${targetColumnId} at distance ${minDistance}`);
        }
    }
    
    // If still no target column found and board has columns, use first non-collapsed column
    if (!targetColumnId && currentBoard && currentBoard.columns.length > 0) {
        const firstNonCollapsed = currentBoard.columns.find(col => 
            !window.collapsedColumns || !window.collapsedColumns.has(col.id)
        );
        if (firstNonCollapsed) {
            targetColumnId = firstNonCollapsed.id;
            insertionIndex = -1;
            console.log(`Using first non-collapsed column as fallback: ${targetColumnId}`);
        }
    }
    
    if (targetColumnId) {
        const taskData = {
            title: content,
            description: description
        };
        
        vscode.postMessage({
            type: 'addTaskAtPosition',
            columnId: targetColumnId,
            taskData: taskData,
            insertionIndex: insertionIndex
        });
    } else {
        console.warn('Could not find a suitable column for the dropped file');
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Could not find a suitable column. Please ensure at least one column is not collapsed.' 
        });
    }
}

function calculateInsertionIndex(column, clientY) {
    console.log(`calculateInsertionIndex`);

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

// Helper function to restore original column position
function restoreColumnPosition() {
    console.log(`restoreColumnPosition`);

    if (dragState.draggedColumn && dragState.originalColumnIndex >= 0) {
        const board = document.getElementById('kanban-board');
        const columns = Array.from(board.querySelectorAll('.kanban-column'));
        
        // Remove from current position
        if (dragState.draggedColumn.parentNode === board) {
            board.removeChild(dragState.draggedColumn);
        }
        
        // Insert back to original position
        if (dragState.originalColumnNextSibling) {
            board.insertBefore(dragState.draggedColumn, dragState.originalColumnNextSibling);
        } else if (dragState.originalColumnIndex >= columns.length) {
            // Was last item
            const addColumnBtn = board.querySelector('.add-column-btn');
            if (addColumnBtn) {
                board.insertBefore(dragState.draggedColumn, addColumnBtn);
            } else {
                board.appendChild(dragState.draggedColumn);
            }
        } else {
            // Insert at index
            const targetColumn = columns[dragState.originalColumnIndex];
            if (targetColumn && targetColumn !== dragState.draggedColumn) {
                board.insertBefore(dragState.draggedColumn, targetColumn);
            }
        }
        
        dragState.draggedColumn.classList.remove('drag-source-hidden');
    }
}

// Helper function to restore original task position
function restoreTaskPosition() {
    console.log(`restoreTaskPosition`);

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
        // Make the entire row a drop zone
        row.addEventListener('dragover', e => {
            // If it's not a column drag, don't handle it here at all
            if (!dragState.draggedColumn) {
                // Still need to preventDefault for drop zones to work
                if (!isExternalFileDrag(e)) {
                    e.preventDefault();
                }
                return; // Let other handlers deal with it
            }
            
            // Now we know it's a column drag - handle it fully
            e.preventDefault();
            e.stopPropagation();      

            // Only handle column drags, not external files or tasks
            // if (!dragState.draggedColumn) return;
            
            // Add visual feedback
            row.classList.add('drag-over');
            
            // Get the row number for this row
            const targetRowNumber = parseInt(row.getAttribute('data-row-number') || '1');
            
            // Update the dragged column's data-row attribute for preview
            dragState.draggedColumn.setAttribute('data-row', targetRowNumber);
            
            // Check if we're over the drop zone spacer (which means drop at end)
            const spacer = e.target.closest('.row-drop-zone-spacer');
            const isOverSpacer = spacer && row.contains(spacer);
            
            // Get mouse position relative to row
            const rect = row.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            // Find all columns in this row (excluding the one being dragged)
            const columnsInRow = Array.from(row.querySelectorAll('.kanban-column:not(.dragging)'));
            
            // Find insertion point based on mouse X position
            let insertBefore = null;
            let insertPosition = columnsInRow.length; // Default to end
            
            // If we're over the spacer, always insert at the end
            if (isOverSpacer) {
                const addButton = row.querySelector('.add-column-btn');
                if (addButton && dragState.draggedColumn.nextSibling !== addButton) {
                    row.insertBefore(dragState.draggedColumn, addButton);
                }
                return;
            }

            // Find the insertion point based on mouse position
            for (let i = 0; i < columnsInRow.length; i++) {
                const col = columnsInRow[i];
                const colRect = col.getBoundingClientRect();
                const colCenter = colRect.left + colRect.width / 2 - rect.left;
                
                if (x < colCenter) {
                    insertBefore = col;
                    insertPosition = i;
                    break;
                }
            }
            
            // Insert the dragged column at the appropriate position for preview
            if (insertBefore) {
                if (dragState.draggedColumn.nextSibling !== insertBefore) {
                    row.insertBefore(dragState.draggedColumn, insertBefore);
                }
            } else {
                // Insert at the end (before the add button)
                const addButton = row.querySelector('.add-column-btn');
                if (addButton) {
                    if (dragState.draggedColumn.nextSibling !== addButton) {
                        row.insertBefore(dragState.draggedColumn, addButton);
                    }
                } else {
                    // Fallback to appending
                    if (dragState.draggedColumn.parentNode !== row) {
                        row.appendChild(dragState.draggedColumn);
                    }
                }
            }
            
            // Store the target position for use in drop event
            dragState.targetRowNumber = targetRowNumber;
            dragState.targetPosition = insertPosition;
        });
        
        row.addEventListener('dragleave', e => {
            // Check if we're really leaving the row (not just moving to a child element)
            if (!row.contains(e.relatedTarget)) {
                row.classList.remove('drag-over');
            }
        });
        
        row.addEventListener('drop', e => {
            e.preventDefault();
            
            // Only stop propagation for internal column drags
            if (!isExternalFileDrag(e) && dragState.draggedColumn) {
                e.stopPropagation();
            }
            
            row.classList.remove('drag-over');
            
            // The actual column movement is handled in the dragend event
            // We just need to ensure the row information is stored
            if (dragState.draggedColumn) {
                const newRowNumber = parseInt(row.getAttribute('data-row-number') || '1');
                dragState.finalRowNumber = newRowNumber;
                
                // Update the data-row attribute
                dragState.draggedColumn.setAttribute('data-row', newRowNumber);
            }
        });
    });
}

function calculateColumnDropIndexInRow(draggedColumn) {
    console.log(`calculateColumnDropIndexInRow`);

    if (!currentBoard || !currentBoard.columns) return -1;
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Get all columns in their visual order
    let allColumnsInOrder = [];
    
    // If multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-column');
            columnsInRow.forEach(col => {
                allColumnsInOrder.push(col.getAttribute('data-column-id'));
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-column');
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
    console.log(`calculateColumnDropIndex`);

    const columns = Array.from(boardElement.querySelectorAll('.kanban-column'));
    const currentIndex = columns.indexOf(draggedColumn);
    
    if (!currentBoard || !currentBoard.columns) return -1;
    
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

function setupTaskDragAndDrop() {
    console.log(`setupTaskDragAndDrop`);

    // Get all columns across all rows
    const boardElement = document.getElementById('kanban-board');
    const allColumns = boardElement.querySelectorAll('.kanban-column');
    
    allColumns.forEach(columnElement => {
        const columnId = columnElement.dataset.columnId;
        const tasksContainer = columnElement.querySelector('.tasks-container');

        if (!tasksContainer) return;

        tasksContainer.addEventListener('dragover', e => {
            e.preventDefault();
            
            if (!dragState.draggedTask) return;
            
            const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY);
            
            if (afterElement == null) {
                // Insert at the end
                tasksContainer.appendChild(dragState.draggedTask);
            } else if (afterElement !== dragState.draggedTask) {
                // Insert before the after element
                tasksContainer.insertBefore(dragState.draggedTask, afterElement);
            }
            
            // Add transition classes for smooth movement
            tasksContainer.querySelectorAll('.task-item').forEach(task => {
                if (task !== dragState.draggedTask) {
                    task.classList.add('drag-transitioning');
                }
            });
        });

        tasksContainer.addEventListener('dragleave', e => {
            if (!columnElement.contains(e.relatedTarget)) {
                columnElement.classList.remove('drag-over');
            }
        });

        tasksContainer.addEventListener('drop', e => {
            e.preventDefault();
            columnElement.classList.remove('drag-over');
            
            // The actual position change is handled in dragend
        });

        // Setup drag handles for all tasks in this column
        columnElement.querySelectorAll('.task-drag-handle').forEach(handle => {
            setupTaskDragHandle(handle);
        });
    });
}

function setupTaskDragHandle(handle) {
    console.log(`setupTaskDragHandle`);

    handle.draggable = true;
    
    handle.addEventListener('dragstart', e => {
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            e.stopPropagation();
            const taskId = taskItem.dataset.taskId;
            const columnId = taskItem.dataset.columnId;
            
            // Store original position
            dragState.draggedTask = taskItem;
            dragState.originalTaskParent = taskItem.parentNode;
            dragState.originalTaskNextSibling = taskItem.nextSibling;
            dragState.originalTaskIndex = Array.from(dragState.originalTaskParent.children).indexOf(taskItem);
            dragState.isDragging = true; // IMPORTANT: Set this BEFORE setting data
            
            // Set multiple data formats
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-task:${taskId}`); // Add prefix
            e.dataTransfer.setData('application/kanban-task', taskId);
            e.dataTransfer.setData('application/x-kanban-task', taskId); // Fallback
            
            // Make the task semi-transparent
            taskItem.classList.add('dragging', 'drag-preview');
            
            console.log(`dragstart task ${taskId}, dragState.isDragging = ${dragState.isDragging}`);
        }
    });

    handle.addEventListener('dragend', e => {
        console.log(`dragend for task, clearing drag state`);

        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            // Clean up drag state FIRST
            dragState.isDragging = false;
            
            // Remove all visual feedback
            taskItem.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.task-item').forEach(task => {
                task.classList.remove('drag-transitioning');
            });
            
            // Get the final position
            const finalParent = taskItem.parentNode;
            const finalColumnElement = finalParent?.closest('.kanban-column');
            const finalColumnId = finalColumnElement?.dataset.columnId;
            
            if (finalParent && finalColumnId) {
                const originalColumnElement = dragState.originalTaskParent?.closest('.kanban-column');
                const originalColumnId = originalColumnElement?.dataset.columnId;
                
                const finalIndex = Array.from(finalParent.children).indexOf(taskItem);
                
                // Check if position actually changed
                const positionChanged = finalParent !== dragState.originalTaskParent || 
                                       finalIndex !== dragState.originalTaskIndex;
                
                if (positionChanged && originalColumnId) {
                    // DON'T restore position - keep the preview position
                    // Calculate the proper index for the data model
                    const dropIndex = finalIndex >= 0 ? finalIndex : 0;
                    
                    // Send the command to update the model
                    vscode.postMessage({
                        type: 'moveTask',
                        taskId: taskItem.dataset.taskId,
                        fromColumnId: originalColumnId,
                        toColumnId: finalColumnId,
                        newIndex: dropIndex
                    });
                }
            }
            
            // At the very end:
            dragState.draggedTask = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
            dragState.isDragging = false; // Extra safety
        }
    });
    
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
            }
        });
    }
}

function getDragAfterTaskElement(container, y) {
    console.log(`getDragAfterTaskElement`);

    const draggableElements = [...container.querySelectorAll('.task-item')].filter(el => el !== dragState.draggedTask);
    
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
    console.log(`calculateTaskDropIndex`);

    const tasks = Array.from(tasksContainer.children);
    const currentIndex = tasks.indexOf(draggedTask);
    
    // Return the current index in the DOM
    return currentIndex >= 0 ? currentIndex : 0;
}

function calculateDropIndex(tasksContainer, clientY) {
    console.log(`calculateDropIndex`);

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

// Drag and drop setup
function setupDragAndDrop() {
    console.log(`setupDragAndDrop`);

    // Clear any existing drag state when setting up
    dragState = {
        draggedColumn: null,
        originalColumnIndex: -1,
        originalColumnNextSibling: null,
        originalColumnParent: null,
        draggedTask: null,
        originalTaskIndex: -1,
        originalTaskParent: null,
        originalTaskNextSibling: null,
        isDragging: false,  // This is the key flag
        lastValidDropTarget: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null
    };
    
    // Only set up global drag/drop once to prevent multiple listeners
    if (!dragDropInitialized) {
        setupGlobalDragAndDrop();
        dragDropInitialized = true;
    }
    
    // Always refresh column, task, and row drag/drop since DOM changes
    setupRowDragAndDrop(); // Setup rows first
    setupColumnDragAndDrop(); // Then columns
    setupTaskDragAndDrop(); // Then tasks
}

function setupColumnDragAndDrop() {
    console.log(`setupColumnDragAndDrop`);

    const boardElement = document.getElementById('kanban-board');
    
    // Get all columns across all rows
    const columns = boardElement.querySelectorAll('.kanban-column');

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) return;

            dragHandle.addEventListener('dragstart', e => {
                const columnId = column.getAttribute('data-column-id');
                
                // Store original position
                dragState.draggedColumn = column;
                dragState.originalColumnIndex = Array.from(column.parentElement.children).indexOf(column);
                dragState.originalColumnNextSibling = column.nextSibling;
                dragState.originalColumnParent = column.parentNode;
                dragState.isDragging = true; // IMPORTANT: Set this BEFORE setting data
                
                // Set multiple data formats to ensure detection works
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', `kanban-column:${columnId}`); // Add prefix
                e.dataTransfer.setData('application/kanban-column', columnId);
                e.dataTransfer.setData('application/x-kanban-column', columnId); // Fallback
                
                // Make the column semi-transparent
                column.classList.add('dragging', 'drag-preview');
                
                console.log(`dragstart column ${columnId}, dragState.isDragging = ${dragState.isDragging}`);
            });

        dragHandle.addEventListener('dragend', e => {
            console.log(`dragend for column, clearing drag state`);

            dragState.isDragging = false;
            
            // Remove all visual feedback
            column.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.remove('drag-over', 'drag-transitioning');
            });
            document.querySelectorAll('.kanban-row').forEach(row => {
                row.classList.remove('drag-over');
            });
            
            // Get the final position and row from the current DOM state
            const columnId = column.getAttribute('data-column-id');
            const parentRow = column.closest('.kanban-row');
            
            let newRowNumber = 1; // Default to row 1
            if (parentRow) {
                newRowNumber = parseInt(parentRow.getAttribute('data-row-number') || '1');
            } else if (dragState.finalRowNumber) {
                // Use the stored row number from drop event
                newRowNumber = dragState.finalRowNumber;
            }
            
            // Calculate the new position based on the current DOM state
            const newPosition = calculateColumnNewPosition(column);
            
            console.log(`Final position for column ${columnId}: position ${newPosition}, row ${newRowNumber}`);
            
            // Send combined move and row update to backend
            vscode.postMessage({
                type: 'moveColumnWithRowUpdate',
                columnId: columnId,
                newPosition: newPosition,
                newRow: newRowNumber
            });
            
            // At the very end, ensure complete reset:
            dragState.draggedColumn = null;
            dragState.originalColumnParent = null;
            dragState.originalColumnIndex = -1;
            dragState.originalColumnNextSibling = null;
            dragState.targetRowNumber = null;
            dragState.targetPosition = null;
            dragState.finalRowNumber = null;
            dragState.isDragging = false; // Extra safety
        });

        column.addEventListener('dragover', e => {
            e.preventDefault();
            // Don't stop propagation here - let it bubble to row handler
            
            if (!dragState.draggedColumn || dragState.draggedColumn === column) {
                return;
            }
            
            // Get the target row container
            const targetRow = column.closest('.kanban-row');
            
            if (!targetRow) {
                // Fallback for single row layout
                const board = column.parentElement;
                const columns = Array.from(board.querySelectorAll('.kanban-column'));
                const targetIndex = columns.indexOf(column);
                const draggedIndex = columns.indexOf(dragState.draggedColumn);
                
                if (draggedIndex < targetIndex) {
                    if (column.nextSibling && column.nextSibling.classList.contains('kanban-column')) {
                        board.insertBefore(dragState.draggedColumn, column.nextSibling);
                    } else {
                        const addBtn = board.querySelector('.add-column-btn');
                        if (addBtn) {
                            board.insertBefore(dragState.draggedColumn, addBtn);
                        } else {
                            board.appendChild(dragState.draggedColumn);
                        }
                    }
                } else {
                    board.insertBefore(dragState.draggedColumn, column);
                }
            }
            
            // Add transition classes
            document.querySelectorAll('.kanban-column').forEach(col => {
                if (col !== dragState.draggedColumn) {
                    col.classList.add('drag-transitioning');
                }
            });
        });

        column.addEventListener('dragleave', e => {
            if (!column.contains(e.relatedTarget)) {
                column.classList.remove('drag-over');
            }
        });

        column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');
        });
    });
}

function calculateColumnNewPosition(draggedColumn) {
    console.log(`calculateColumnNewPosition for column:`, draggedColumn);

    if (!currentBoard || !currentBoard.columns) return 0;
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Build the desired final order of ALL columns based on current DOM state
    let desiredOrder = [];
    
    // Check if we have multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        // Multi-row layout - collect columns row by row, left to right
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-column');
            columnsInRow.forEach(col => {
                const colId = col.getAttribute('data-column-id');
                if (colId) {
                    desiredOrder.push(colId);
                }
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-column');
        columns.forEach(col => {
            const colId = col.getAttribute('data-column-id');
            if (colId) {
                desiredOrder.push(colId);
            }
        });
    }
    
    // Find where our dragged column should be in the final order
    const targetPosition = desiredOrder.indexOf(columnId);
    
    console.log(`Column ${columnId} should be at position ${targetPosition}`);
    console.log('Desired final order:', desiredOrder);
    console.log('Current data model order:', currentBoard.columns.map(c => c.id));
    
    return targetPosition >= 0 ? targetPosition : 0;
}