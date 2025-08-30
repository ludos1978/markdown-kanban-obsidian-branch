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
    
    // Handle dropped files
    boardContainer.addEventListener('drop', handleFileDrop, false);
    document.addEventListener('drop', handleFileDrop, false);
    
    function handleFileDrop(e) {
        hideDropFeedback(e);
        hideExternalDropIndicator();
        
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
    
    // Find the nearest column
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

// dragHandle.addEventListener('dragend', e => {
//     dragState.isDragging = false;
    
//     // Remove all visual feedback
//     column.classList.remove('dragging', 'drag-preview');
//     document.querySelectorAll('.kanban-column').forEach(col => {
//         col.classList.remove('drag-over', 'drag-transitioning');
//     });
//     document.querySelectorAll('.kanban-row').forEach(row => {
//         row.classList.remove('drag-over');
//     });
    
//     // Check if we moved to a different row
//     const newRowContainer = column.closest('.kanban-row');
    
//     if (newRowContainer) {
//         const newRowNumber = parseInt(newRowContainer.getAttribute('data-row-number') || '1');
//         const columnId = column.getAttribute('data-column-id');
        
//         // Find the column in the board data
//         if (currentBoard && currentBoard.columns) {
//             const boardColumn = currentBoard.columns.find(c => c.id === columnId);
//             if (boardColumn) {
//                 const currentRowTag = getColumnRow(boardColumn.title);
                
//                 // Always update if moving to/from row 1, or if row changed
//                 if (newRowNumber === 1 || currentRowTag !== newRowNumber) {
//                     console.log(`Moving column ${columnId} from row ${currentRowTag} to row ${newRowNumber}`);
//                     updateColumnRowTag(columnId, newRowNumber);
//                 }
//             }
//         }
//     } else {
//         // Single row layout - ensure we're in row 1
//         const columnId = column.getAttribute('data-column-id');
//         updateColumnRowTag(columnId, 1);
//     }
    
//     // Calculate new position for reordering
//     const fromIndex = getOriginalColumnIndex(column.getAttribute('data-column-id'));
//     const toIndex = calculateColumnDropIndexInRow(column);
    
//     if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
//         vscode.postMessage({
//             type: 'moveColumn',
//             fromIndex: fromIndex,
//             toIndex: toIndex
//         });
//     }
    
//     // Reset drag state
//     dragState.draggedColumn = null;
//     dragState.originalColumnParent = null;
//     dragState.originalColumnIndex = -1;
//     dragState.originalColumnNextSibling = null;
// });

function setupRowDragAndDrop() {
    const boardElement = document.getElementById('kanban-board');
    const rows = boardElement.querySelectorAll('.kanban-row');
    
    rows.forEach(row => {
        // Make the entire row a drop zone
        row.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            
            // Only handle column drags, not tasks
            if (!dragState.draggedColumn) return;
            
            // Add visual feedback
            row.classList.add('drag-over');
            
            // Get mouse position relative to row
            const rect = row.getBoundingClientRect();
            const x = e.clientX - rect.left;
            
            // Check if the dragged column is currently in this row
            const draggedColumnCurrentlyInRow = row.contains(dragState.draggedColumn);
            
            // Find all columns in this row (excluding the one being dragged)
            const columnsInRow = Array.from(row.querySelectorAll('.kanban-column:not(.dragging)'));
            
            // If the dragged column is the only one in this row and we're still in the same row, don't manipulate DOM
            if (draggedColumnCurrentlyInRow && columnsInRow.length === 0) {
                // Column is alone in this row and still dragging within it - don't touch the DOM
                return;
            }
            
            // Find insertion point based on mouse X position
            let insertBefore = null;
            let shouldInsert = false;
            
            for (let i = 0; i < columnsInRow.length; i++) {
                const col = columnsInRow[i];
                const colRect = col.getBoundingClientRect();
                const colCenter = colRect.left + colRect.width / 2 - rect.left;
                
                if (x < colCenter) {
                    insertBefore = col;
                    shouldInsert = true;
                    break;
                }
            }
            
            // Only manipulate DOM if we're actually changing position
            if (!shouldInsert && columnsInRow.length > 0) {
                // Insert at the end (after last column)
                const lastColumn = columnsInRow[columnsInRow.length - 1];
                if (dragState.draggedColumn.nextSibling !== lastColumn.nextSibling) {
                    shouldInsert = true;
                    insertBefore = lastColumn.nextSibling;
                }
            } else if (!shouldInsert && columnsInRow.length === 0 && !draggedColumnCurrentlyInRow) {
                // Moving to an empty row from another row
                shouldInsert = true;
            }
            
            // Only manipulate DOM if position actually changes
            if (shouldInsert) {
                if (insertBefore) {
                    if (dragState.draggedColumn.nextSibling !== insertBefore) {
                        row.insertBefore(dragState.draggedColumn, insertBefore);
                    }
                } else {
                    // Insert at the end (before add button if it exists)
                    const addBtn = row.querySelector('.add-column-btn');
                    const rowHeader = row.querySelector('.kanban-row-header');
                    
                    if (addBtn) {
                        if (dragState.draggedColumn.nextSibling !== addBtn) {
                            row.insertBefore(dragState.draggedColumn, addBtn);
                        }
                    } else if (columnsInRow.length > 0) {
                        // Insert after last column
                        const lastColumn = columnsInRow[columnsInRow.length - 1];
                        if (dragState.draggedColumn !== lastColumn.nextSibling) {
                            row.insertBefore(dragState.draggedColumn, lastColumn.nextSibling);
                        }
                    } else if (rowHeader && !draggedColumnCurrentlyInRow) {
                        // Empty row - insert after header only if coming from another row
                        row.insertBefore(dragState.draggedColumn, rowHeader.nextSibling);
                    } else if (!draggedColumnCurrentlyInRow) {
                        row.appendChild(dragState.draggedColumn);
                    }
                }
            }
        });
        
        row.addEventListener('dragleave', e => {
            // Check if we're really leaving the row (not just moving to a child element)
            const rect = row.getBoundingClientRect();
            const x = e.clientX;
            const y = e.clientY;
            
            // Only remove drag-over if cursor is outside row bounds
            if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
                row.classList.remove('drag-over');
            }
        });
        
        row.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.remove('drag-over');
            
            // Update the row tag for the dropped column
            if (dragState.draggedColumn) {
                const newRowNumber = parseInt(row.getAttribute('data-row-number') || '1');
                const columnId = dragState.draggedColumn.getAttribute('data-column-id');
                
                // Update the data-row attribute immediately
                dragState.draggedColumn.setAttribute('data-row', newRowNumber);
                
                console.log(`Column ${columnId} dropped in row ${newRowNumber}`);
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
            dragState.isDragging = true;
            
            e.dataTransfer.setData('text/plain', taskId);
            e.dataTransfer.setData('application/column-id', columnId);
            e.dataTransfer.setData('application/kanban-task', taskId);
            e.dataTransfer.effectAllowed = 'move';
            
            // Make the task semi-transparent
            taskItem.classList.add('dragging', 'drag-preview');
        }
    });

    handle.addEventListener('dragend', e => {
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
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
            
            // Reset drag state
            dragState.draggedTask = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
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
        isDragging: false,
        lastValidDropTarget: null
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
            dragState.isDragging = true;
            
            e.dataTransfer.setData('text/plain', columnId);
            e.dataTransfer.setData('application/column-id', columnId);
            e.dataTransfer.setData('application/kanban-column', columnId);
            e.dataTransfer.effectAllowed = 'move';
            
            // Make the column semi-transparent
            column.classList.add('dragging', 'drag-preview');

            console.log(`dragstart ${e}`);
        });

        // dragHandle.addEventListener('dragend', e => {
        //     dragState.isDragging = false;
            
        //     // Remove all visual feedback
        //     column.classList.remove('dragging', 'drag-preview');
        //     columns.forEach(col => {
        //         col.classList.remove('drag-over', 'drag-transitioning');
        //     });
            
        //     // Check if we need to update row tag
        //     const newRow = column.closest('.kanban-row');
        //     let newRowNumber = parseInt(newRow.getAttribute('data-row-number') || '1');
        //     let currentRowNumber = newRowNumber;
        //     if (newRow) {
        //         currentRowNumber = getColumnRow(column.querySelector('.column-title')?.textContent || '1');
        //     }
            
        //     // Get the current position in the DOM
        //     const currentParent = column.parentNode;
        //     const currentIndex = Array.from(currentParent.children).filter(el => el.classList.contains('kanban-column')).indexOf(column);
            
        //     // Check if position actually changed
        //     const positionChanged = currentIndex !== dragState.originalColumnIndex 
        //         || currentParent !== dragState.originalColumnParent 
        //         || (newRowNumber !== currentRow);
            
        //     if (positionChanged && currentIndex >= 0) {
        //         // Calculate the actual indices for the data model
        //         const fromIndex = getOriginalColumnIndex(column.getAttribute('data-column-id'));
        //         const toIndex = calculateColumnDropIndex(boardElement, column);

                
                
        //         if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        //             vscode.postMessage({
        //                 type: 'moveColumn',
        //                 fromIndex: fromIndex,
        //                 toIndex: toIndex,
        //                 fromRow: currentRowNumber,
        //                 toRow: newRowNumber
        //             });
        //         }
        //     }
            
        //     // Reset drag state
        //     dragState.draggedColumn = null;
        //     dragState.originalColumnIndex = -1;
        //     dragState.originalColumnNextSibling = null;
        // });

        dragHandle.addEventListener('dragend', e => {
            console.log(`dragend ${e}`);

            dragState.isDragging = false;
            
            // Remove all visual feedback
            column.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.remove('drag-over', 'drag-transitioning');
            });
            document.querySelectorAll('.kanban-row').forEach(row => {
                row.classList.remove('drag-over');
            });
            
            // Determine the new row number
            let newRowNumber = 1; // Default to row 1
            const newRowContainer = column.closest('.kanban-row');
            
            if (newRowContainer) {
                newRowNumber = parseInt(newRowContainer.getAttribute('data-row-number') || '1');
            }
            
            // Calculate the new position in the column array
            const columnId = column.getAttribute('data-column-id');
            const newPosition = calculateColumnNewPosition(column);
            
            console.log(`dragend ${columnId} ${newPosition} ${newRowNumber}`);
            // Send combined move and row update to backend
            vscode.postMessage({
                type: 'moveColumnWithRowUpdate',
                columnId: columnId,
                newPosition: newPosition,
                newRow: newRowNumber
            });
            
            // Reset drag state
            dragState.draggedColumn = null;
            dragState.originalColumnParent = null;
            dragState.originalColumnIndex = -1;
            dragState.originalColumnNextSibling = null;
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
    console.log(`calculateColumnNewPosition`);

    if (!currentBoard || !currentBoard.columns) return 0;
    
    const boardElement = document.getElementById('kanban-board');
    const columnId = draggedColumn.getAttribute('data-column-id');
    
    // Get all columns in their visual order
    let allColumnsInOrder = [];
    
    // Check if we have multi-row layout
    const rows = boardElement.querySelectorAll('.kanban-row');
    if (rows.length > 0) {
        // Multi-row layout - collect columns from all rows in order
        rows.forEach(row => {
            const columnsInRow = row.querySelectorAll('.kanban-column');
            columnsInRow.forEach(col => {
                const colId = col.getAttribute('data-column-id');
                if (colId) {
                    allColumnsInOrder.push(colId);
                }
            });
        });
    } else {
        // Single row layout
        const columns = boardElement.querySelectorAll('.kanban-column');
        columns.forEach(col => {
            const colId = col.getAttribute('data-column-id');
            if (colId) {
                allColumnsInOrder.push(colId);
            }
        });
    }
    
    // Find the position of our column in the visual order
    const visualPosition = allColumnsInOrder.indexOf(columnId);
    
    // Return the position (or 0 if not found)
    return visualPosition >= 0 ? visualPosition : 0;
}

// Enhanced column drop handler for multi-row support
// function handleColumnDropWithRows(draggedColumn, targetColumn, boardElement) {
//     const draggedRow = parseInt(draggedColumn.getAttribute('data-row') || '1');
//     const targetRow = parseInt(targetColumn.getAttribute('data-row') || '1');
    
//     // If dropping in a different row, update the row tag
//     if (draggedRow !== targetRow) {
//         const columnId = draggedColumn.getAttribute('data-column-id');
//         updateColumnRowTag(columnId, targetRow);
//         draggedColumn.setAttribute('data-row', targetRow);
//     }
    
//     // Continue with normal column reordering within the row
//     const allColumns = Array.from(boardElement.querySelectorAll(`.kanban-column[data-row="${targetRow}"]`));
//     const draggedIndex = allColumns.indexOf(draggedColumn);
//     const targetIndex = allColumns.indexOf(targetColumn);
    
//     if (draggedIndex < targetIndex) {
//         // Moving right - insert after target
//         if (targetColumn.nextSibling) {
//             boardElement.insertBefore(draggedColumn, targetColumn.nextSibling);
//         } else {
//             const addBtn = boardElement.querySelector('.add-column-btn');
//             if (addBtn) {
//                 boardElement.insertBefore(draggedColumn, addBtn);
//             } else {
//                 boardElement.appendChild(draggedColumn);
//             }
//         }
//     } else {
//         // Moving left - insert before target
//         boardElement.insertBefore(draggedColumn, targetColumn);
//     }
// }