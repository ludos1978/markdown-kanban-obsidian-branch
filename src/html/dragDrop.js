// Track drag/drop state
let dragDropInitialized = false;
let isProcessingDrop = false;
let currentExternalDropColumn = null;
let externalDropIndicator = null;
let recentlyCreatedTasks = new Set();

// Drag state management for real-time preview
let dragState = {
    draggedColumn: null,
    originalColumnIndex: -1,
    originalColumnNextSibling: null,
    originalColumnParent: null,
    
    draggedTask: null,
    originalTaskIndex: -1,
    originalTaskParent: null,
    originalTaskNextSibling: null,
    
    isDragging: false,
    lastValidDropTarget: null,
    lastRowDropTarget: null,
    lastRow: null
};

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
    
    const containerRect = tasksContainer.getBoundingClientRect();
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
    
    const columnRect = column.getBoundingClientRect();
    indicator.style.position = 'fixed';
    indicator.style.left = (columnRect.left + columnRect.width * 0.1) + 'px';
    indicator.style.right = 'auto';
    indicator.style.width = (columnRect.width * 0.8) + 'px';
    indicator.style.top = insertionY + 'px';
    indicator.style.display = 'block';
    indicator.classList.add('active');
    
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
    
    if (!boardContainer) {
        console.error('No kanban-container found!');
        return;
    }
    
    let lastIndicatorUpdate = 0;
    const INDICATOR_UPDATE_THROTTLE = 100;
    
    function isExternalFileDrag(e) {
        const dt = e.dataTransfer;
        if (!dt) return false;
        
        const hasFiles = Array.from(dt.types).some(t => t === 'Files' || t === 'files');
        if (hasFiles) return true;
        
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return false;
        }
        
        const hasUriList = Array.from(dt.types).some(t => t.toLowerCase() === 'text/uri-list');
        return hasUriList;
    }
    
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
    
    function handleExternalDrop(e) {
        if (!isExternalFileDrag(e)) {
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        hideDropFeedback(e);
        hideExternalDropIndicator();
        
        if (isProcessingDrop) {
            return;
        }
        
        isProcessingDrop = true;
        setTimeout(() => {
            isProcessingDrop = false;
        }, 1000);
        
        const dt = e.dataTransfer;
        if (!dt) {
            return;
        }
        
        if (dt.files && dt.files.length > 0) {
            handleVSCodeFileDrop(e, dt.files);
        } else {
            const uriList = dt.getData('text/uri-list');
            const textPlain = dt.getData('text/plain');
            
            if (uriList) {
                handleVSCodeUriDrop(e, uriList);
            } else if (textPlain && textPlain.includes('/')) {
                handleVSCodeUriDrop(e, textPlain);
            }
        }
    }
    
    boardContainer.addEventListener('dragover', function(e) {
        if (!isExternalFileDrag(e)) return;
        
        e.preventDefault();
        
        const now = Date.now();
        if (now - lastIndicatorUpdate >= INDICATOR_UPDATE_THROTTLE) {
            lastIndicatorUpdate = now;
            
            const column = e.target.closest('.kanban-column');
            if (column && !column.classList.contains('collapsed')) {
                showExternalDropIndicator(column, e.clientY);
            } else {
                hideExternalDropIndicator();
            }
            showDropFeedback(e);
        }
    }, false);
    
    boardContainer.addEventListener('drop', handleExternalDrop, false);
    
    boardContainer.addEventListener('dragenter', function(e) {
        if (isExternalFileDrag(e)) {
            e.preventDefault();
            showDropFeedback(e);
        }
    }, false);
    
    boardContainer.addEventListener('dragleave', function(e) {
        if (!boardContainer.contains(e.relatedTarget)) {
            hideDropFeedback(e);
            hideExternalDropIndicator();
        }
    }, false);
    
    // Handle multi-row layout drag events
    boardContainer.addEventListener('dragover', function(e) {
        const row = e.target.closest('.kanban-row');
        const spacer = e.target.closest('.row-drop-zone-spacer');
        
        if ((row || spacer) && isExternalFileDrag(e)) {
            e.preventDefault();
        }
    }, true);
    
    boardContainer.addEventListener('drop', function(e) {
        const row = e.target.closest('.kanban-row');
        const spacer = e.target.closest('.row-drop-zone-spacer');
        
        if ((row || spacer) && isExternalFileDrag(e)) {
            handleExternalDrop(e);
        }
    }, true);
    
    document.addEventListener('dragover', function(e) {
        if (!boardContainer.contains(e.target) && isExternalFileDrag(e)) {
            e.preventDefault();
        }
    }, false);
    
    document.addEventListener('drop', function(e) {
        if (!boardContainer.contains(e.target)) {
            e.preventDefault();
        }
    }, false);
}

function handleVSCodeFileDrop(e, files) {
    const file = files[0];
    const fileName = file.name;
    
    const activeEditor = getActiveTextEditor();
    
    const message = {
        type: 'handleFileDrop',
        fileName: fileName,
        dropPosition: {
            x: e.clientX,
            y: e.clientY
        },
        activeEditor: activeEditor
    };
    
    vscode.postMessage(message);
}

function handleVSCodeUriDrop(e, uriData) {
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
    if (!window.currentBoard) {
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No board loaded' 
        });
        return;
    }
    
    if (!window.currentBoard.columns || window.currentBoard.columns.length === 0) {
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No columns available' 
        });
        return;
    }
    
    // Prevent duplicate task creation
    if (recentlyCreatedTasks.has(content)) {
        return;
    }
    
    recentlyCreatedTasks.add(content);
    setTimeout(() => recentlyCreatedTasks.delete(content), 2000);
    
    let targetColumnId = null;
    let insertionIndex = -1;
    
    const elementAtPoint = document.elementFromPoint(dropPosition.x, dropPosition.y);
    const columnElement = elementAtPoint?.closest('.kanban-column');
    
    if (columnElement && !columnElement.classList.contains('collapsed')) {
        targetColumnId = columnElement.dataset.columnId;
        insertionIndex = calculateInsertionIndex(columnElement, dropPosition.y);
    } else {
        // Find nearest non-collapsed column
        const columns = document.querySelectorAll('.kanban-column:not(.collapsed)');
        let minDistance = Infinity;
        
        columns.forEach(column => {
            const rect = column.getBoundingClientRect();
            const distX = Math.abs((rect.left + rect.right) / 2 - dropPosition.x);
            const distY = Math.abs((rect.top + rect.bottom) / 2 - dropPosition.y);
            const distance = Math.sqrt(distX * distX + distY * distY);
            
            if (distance < minDistance) {
                minDistance = distance;
                targetColumnId = column.dataset.columnId;
                insertionIndex = calculateInsertionIndex(column, dropPosition.y);
            }
        });
    }
    
    if (!targetColumnId && window.currentBoard.columns.length > 0) {
        const firstNonCollapsed = window.currentBoard.columns.find(col => 
            !window.collapsedColumns || !window.collapsedColumns.has(col.id)
        );
        if (firstNonCollapsed) {
            targetColumnId = firstNonCollapsed.id;
            insertionIndex = -1;
        }
    }
    
    if (targetColumnId) {
        const taskData = {
            title: content,
            description: description
        };
        
        const message = {
            type: 'addTaskAtPosition',
            columnId: targetColumnId,
            taskData: taskData,
            insertionIndex: insertionIndex
        };
        
        vscode.postMessage(message);
    } else {
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

function restoreColumnPosition() {
    if (dragState.draggedColumn && dragState.originalColumnIndex >= 0) {
        const board = document.getElementById('kanban-board');
        const columns = Array.from(board.querySelectorAll('.kanban-column'));
        
        if (dragState.draggedColumn.parentNode === board) {
            board.removeChild(dragState.draggedColumn);
        }
        
        if (dragState.originalColumnNextSibling) {
            board.insertBefore(dragState.draggedColumn, dragState.originalColumnNextSibling);
        } else if (dragState.originalColumnIndex >= columns.length) {
            const addColumnBtn = board.querySelector('.add-column-btn');
            if (addColumnBtn) {
                board.insertBefore(dragState.draggedColumn, addColumnBtn);
            } else {
                board.appendChild(dragState.draggedColumn);
            }
        } else {
            const targetColumn = columns[dragState.originalColumnIndex];
            if (targetColumn && targetColumn !== dragState.draggedColumn) {
                board.insertBefore(dragState.draggedColumn, targetColumn);
            }
        }
        
        dragState.draggedColumn.classList.remove('drag-source-hidden');
    }
}

function restoreTaskPosition() {
    if (dragState.draggedTask && dragState.originalTaskParent) {
        if (dragState.draggedTask.parentNode) {
            dragState.draggedTask.parentNode.removeChild(dragState.draggedTask);
        }
        
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
        row.addEventListener('dragover', e => {
            if (!dragState.draggedColumn) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            if (!row.classList.contains('drag-over')) {
                row.classList.add('drag-over');
            }
            
            const columnsInRow = Array.from(row.querySelectorAll('.kanban-column:not(.dragging)'));
            const mouseX = e.clientX;
            
            let targetPosition = null;
            for (const col of columnsInRow) {
                const rect = col.getBoundingClientRect();
                if (mouseX < rect.left + rect.width / 2) {
                    targetPosition = col;
                    break;
                }
            }
            
            if (!targetPosition) {
                const addBtn = row.querySelector('.add-column-btn');
                targetPosition = addBtn || null;
            }
            
            if (dragState.lastRowDropTarget !== targetPosition || dragState.lastRow !== row) {
                dragState.lastRowDropTarget = targetPosition;
                dragState.lastRow = row;
                
                if (targetPosition) {
                    if (dragState.draggedColumn.nextSibling !== targetPosition) {
                        row.insertBefore(dragState.draggedColumn, targetPosition);
                    }
                } else {
                    if (dragState.draggedColumn.parentNode !== row || 
                        dragState.draggedColumn !== row.lastElementChild) {
                        row.appendChild(dragState.draggedColumn);
                    }
                }
                
                const rowNumber = parseInt(row.getAttribute('data-row-number') || '1');
                dragState.draggedColumn.setAttribute('data-row', rowNumber);
            }
        });
        
        row.addEventListener('dragleave', e => {
            if (!row.contains(e.relatedTarget)) {
                row.classList.remove('drag-over');
            }
        });
        
        row.addEventListener('drop', e => {
            e.preventDefault();
            e.stopPropagation();
            row.classList.remove('drag-over');
            
            dragState.lastRowDropTarget = null;
            dragState.lastRow = null;
        });
    });
}

function setupTaskDragAndDrop() {
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
                tasksContainer.appendChild(dragState.draggedTask);
            } else if (afterElement !== dragState.draggedTask) {
                tasksContainer.insertBefore(dragState.draggedTask, afterElement);
            }
            
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
            
            dragState.draggedTask = taskItem;
            dragState.originalTaskParent = taskItem.parentNode;
            dragState.originalTaskNextSibling = taskItem.nextSibling;
            dragState.originalTaskIndex = Array.from(dragState.originalTaskParent.children).indexOf(taskItem);
            dragState.isDragging = true;
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-task:${taskId}`);
            e.dataTransfer.setData('application/kanban-task', taskId);
            e.dataTransfer.setData('application/x-kanban-task', taskId);
            
            taskItem.classList.add('dragging', 'drag-preview');
        }
    });

    handle.addEventListener('dragend', e => {
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            dragState.isDragging = false;
            
            taskItem.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.task-item').forEach(task => {
                task.classList.remove('drag-transitioning');
            });
            
            const finalParent = taskItem.parentNode;
            const finalColumnElement = finalParent?.closest('.kanban-column');
            const finalColumnId = finalColumnElement?.dataset.columnId;
            
            if (finalParent && finalColumnId) {
                const originalColumnElement = dragState.originalTaskParent?.closest('.kanban-column');
                const originalColumnId = originalColumnElement?.dataset.columnId;
                
                const finalIndex = Array.from(finalParent.children).indexOf(taskItem);
                
                const positionChanged = finalParent !== dragState.originalTaskParent || 
                                       finalIndex !== dragState.originalTaskIndex;
                
                if (positionChanged && originalColumnId) {
                    const dropIndex = finalIndex >= 0 ? finalIndex : 0;
                    
                    vscode.postMessage({
                        type: 'moveTask',
                        taskId: taskItem.dataset.taskId,
                        fromColumnId: originalColumnId,
                        toColumnId: finalColumnId,
                        newIndex: dropIndex
                    });
                }
            }
            
            dragState.draggedTask = null;
            dragState.originalTaskParent = null;
            dragState.originalTaskNextSibling = null;
            dragState.originalTaskIndex = -1;
            dragState.isDragging = false;
        }
    });
    
    // Handle ESC key to cancel drag
    if (!handle.hasEscListener) {
        handle.hasEscListener = true;
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && dragState.isDragging && dragState.draggedTask) {
                restoreTaskPosition();
                dragState.draggedTask.classList.remove('dragging', 'drag-preview');
                
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

function setupColumnDragAndDrop() {
    const boardElement = document.getElementById('kanban-board');
    const columns = boardElement.querySelectorAll('.kanban-column');

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) return;

        dragHandle.addEventListener('dragstart', e => {
            const columnElement = column;
            const columnId = columnElement.getAttribute('data-column-id');
            
            const originalIndex = currentBoard.columns.findIndex(c => c.id === columnId);
            
            dragState.draggedColumn = columnElement;
            dragState.draggedColumnId = columnId;
            dragState.originalDataIndex = originalIndex;
            dragState.isDragging = true;
            dragState.lastDropTarget = null;
            
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-column:${columnId}`);
            
            columnElement.classList.add('dragging', 'drag-preview');
        });

        dragHandle.addEventListener('dragend', e => {
            const columnElement = column;
            const columnId = dragState.draggedColumnId;
            
            columnElement.classList.remove('dragging', 'drag-preview');
            document.querySelectorAll('.kanban-column').forEach(col => {
                col.classList.remove('drag-over', 'drag-transitioning');
            });
            document.querySelectorAll('.kanban-row').forEach(row => {
                row.classList.remove('drag-over');
            });
            
            const allColumns = Array.from(boardElement.querySelectorAll('.kanban-column'));
            const targetDOMIndex = allColumns.indexOf(columnElement);
            
            const newOrder = allColumns.map(col => col.getAttribute('data-column-id'));
            const targetDataIndex = newOrder.indexOf(columnId);
            
            const parentRow = columnElement.closest('.kanban-row');
            const newRow = parentRow ? parseInt(parentRow.getAttribute('data-row-number') || '1') : 1;
            
            vscode.postMessage({
                type: 'reorderColumns',
                newOrder: newOrder,
                movedColumnId: columnId,
                targetRow: newRow
            });
            
            dragState.draggedColumn = null;
            dragState.draggedColumnId = null;
            dragState.originalDataIndex = -1;
            dragState.isDragging = false;
            dragState.lastDropTarget = null;
        });

        column.addEventListener('dragover', e => {
            if (!dragState.draggedColumn || dragState.draggedColumn === column) return;
            
            e.preventDefault();
            
            const rect = column.getBoundingClientRect();
            const midpoint = rect.left + rect.width / 2;
            
            let targetElement;
            let insertBefore = false;
            
            if (e.clientX < midpoint) {
                targetElement = column;
                insertBefore = true;
            } else {
                targetElement = column.nextSibling;
                insertBefore = false;
            }
            
            if (dragState.lastDropTarget !== targetElement) {
                dragState.lastDropTarget = targetElement;
                
                if (insertBefore) {
                    if (dragState.draggedColumn.nextSibling !== column) {
                        column.parentNode.insertBefore(dragState.draggedColumn, column);
                    }
                } else {
                    if (targetElement && dragState.draggedColumn.nextSibling !== targetElement) {
                        column.parentNode.insertBefore(dragState.draggedColumn, targetElement);
                    } else if (!targetElement && dragState.draggedColumn !== column.parentNode.lastElementChild) {
                        column.parentNode.appendChild(dragState.draggedColumn);
                    }
                }
            }
        });
    });
}

function setupDragAndDrop() {
    // Reset drag state
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
        lastValidDropTarget: null,
        targetRowNumber: null,
        targetPosition: null,
        finalRowNumber: null
    };
    
    if (!dragDropInitialized) {
        setupGlobalDragAndDrop();
        dragDropInitialized = true;
    }
    
    setupRowDragAndDrop();
    setupColumnDragAndDrop();
    setupTaskDragAndDrop();
}