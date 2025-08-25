// Track if drag/drop is already set up to prevent multiple listeners
let dragDropInitialized = false;
let isProcessingDrop = false; // Prevent multiple simultaneous drops
let currentExternalDropColumn = null;
let externalDropIndicator = null;

// Track recently created tasks to prevent duplicates
let recentlyCreatedTasks = new Set();

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
            
            e.dataTransfer.setData('text/plain', columnId);
            e.dataTransfer.setData('application/column-id', columnId);
            e.dataTransfer.setData('application/kanban-column', columnId);
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
            
            e.dataTransfer.setData('text/plain', taskId);
            e.dataTransfer.setData('application/column-id', columnId);
            e.dataTransfer.setData('application/kanban-task', taskId);
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