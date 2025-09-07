
// Add debugging flag
let lastIndicatorUpdate = 0;
const INDICATOR_UPDATE_THROTTLE = 100; // milliseconds
const DEBUG_DROP = true;

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
    lastValidDropTarget: null,
    
    // Clipboard card
    draggedClipboardCard: null,
    
    // Empty card
    draggedEmptyCard: null
};

// Expose dragState globally for clipboard card coordination
window.dragState = dragState;

// External file drop location indicators
function createExternalDropIndicator() {
    // Remove console.log from here since it's called frequently
    if (externalDropIndicator) {
        return externalDropIndicator;
    }
    
    const indicator = document.createElement('div');
    indicator.className = 'external-drop-indicator';
    indicator.style.display = 'none';
    document.body.appendChild(indicator);
    externalDropIndicator = indicator;
    
    if (DEBUG_DROP) {
        console.log('[DROP DEBUG] External drop indicator created');
    }
    
    return indicator;
}

function showExternalDropIndicator(column, clientY) {
    if (DEBUG_DROP && currentExternalDropColumn !== column) {
        console.log('[DROP DEBUG] Showing indicator for column:', column.dataset.columnId);
    }
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
    document.querySelectorAll('.kanban-full-height-column').forEach(col => {
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
    console.log(`[DROP DEBUG] setupGlobalDragAndDrop initialized`);

    const boardContainer = document.getElementById('kanban-container');
    const dropFeedback = document.getElementById('drop-zone-feedback');
    
    if (!boardContainer) {
        console.error('[DROP DEBUG] No kanban-container found!');
        return;
    }
    
    // Variables for throttling
    let lastIndicatorUpdate = 0;
    const INDICATOR_UPDATE_THROTTLE = 100;
    
    // Helper functions
    function isExternalFileDrag(e) {
        const dt = e.dataTransfer;
        if (!dt) return false;
        
        const hasFiles = Array.from(dt.types).some(t => t === 'Files' || t === 'files');
        if (hasFiles) return true;
        
        // Check for clipboard card type using drag state
        // We can't reliably read data during dragover due to browser security
        const hasClipboardCard = dragState.draggedClipboardCard !== null;
        const hasEmptyCard = dragState.draggedEmptyCard !== null;
        // Only log once per second to reduce spam
        const now = Date.now();
        if (!window.lastClipboardDebugLog || now - window.lastClipboardDebugLog > 1000) {
            console.log('[DROP DEBUG] Has clipboard card:', hasClipboardCard, 'Has empty card:', hasEmptyCard, 'dragState:', dragState);
            window.lastClipboardDebugLog = now;
        }
        if (hasClipboardCard || hasEmptyCard) return true;
        
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask) && !dragState.draggedClipboardCard && !dragState.draggedEmptyCard) {
            console.log('[DROP DEBUG] Internal drag detected, ignoring external');
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
    
    // Main drop handler function
    function handleExternalDrop(e) {
        console.log('[DROP DEBUG] ============ DROP EVENT FIRED ============');
        console.log('[DROP DEBUG] Target:', e.target.className);
        
        if (!isExternalFileDrag(e)) {
            console.log('[DROP DEBUG] Not an external file drag, ignoring');
            return;
        }
        
        e.preventDefault();
        e.stopPropagation();
        
        console.log('[DROP DEBUG] Processing external file drop');
        
        hideDropFeedback(e);
        hideExternalDropIndicator();
        
        if (isProcessingDrop) {
            console.log('[DROP DEBUG] Already processing a drop');
            return;
        }
        
        isProcessingDrop = true;
        setTimeout(() => {
            isProcessingDrop = false;
        }, 1000);
        
        const dt = e.dataTransfer;
        if (!dt) {
            console.error('[DROP DEBUG] No dataTransfer');
            return;
        }
        
        // Debug all available data transfer types
        console.log('[DROP DEBUG] Available data transfer types:', Array.from(dt.types));
        
        // Check for clipboard card using dragState first (since dataTransfer might be empty)
        console.log('[DROP DEBUG] Checking dragState.draggedClipboardCard:', dragState.draggedClipboardCard);
        if (dragState.draggedClipboardCard) {
            console.log('[DROP DEBUG] Handling clipboard card drop from dragState');
            const clipboardData = JSON.stringify({
                type: 'clipboard-card',
                task: dragState.draggedClipboardCard
            });
            handleClipboardCardDrop(e, clipboardData);
            // Clear the clipboard card from dragState after handling
            dragState.draggedClipboardCard = null;
            dragState.isDragging = false;
            return; // Exit early since we handled it
        }
        
        // Check for empty card using dragState
        console.log('[DROP DEBUG] Checking dragState.draggedEmptyCard:', dragState.draggedEmptyCard);
        if (dragState.draggedEmptyCard) {
            console.log('[DROP DEBUG] Handling empty card drop from dragState');
            const emptyCardData = JSON.stringify({
                type: 'empty-card',
                task: dragState.draggedEmptyCard
            });
            handleEmptyCardDrop(e, emptyCardData);
            // Clear the empty card from dragState after handling
            dragState.draggedEmptyCard = null;
            dragState.isDragging = false;
            return; // Exit early since we handled it
        }
        
        // Fallback: Check for clipboard card in text/plain
        const textData = dt.getData('text/plain');
        console.log('[DROP DEBUG] text/plain data:', textData);
        
        if (textData && textData.startsWith('CLIPBOARD_CARD:')) {
            console.log('[DROP DEBUG] Handling clipboard card drop from text data');
            const clipboardData = textData.substring('CLIPBOARD_CARD:'.length);
            handleClipboardCardDrop(e, clipboardData);
        } else if (textData && textData.startsWith('EMPTY_CARD:')) {
            console.log('[DROP DEBUG] Handling empty card drop from text data');
            const emptyCardData = textData.substring('EMPTY_CARD:'.length);
            handleEmptyCardDrop(e, emptyCardData);
        } else if (dt.files && dt.files.length > 0) {
            console.log('[DROP DEBUG] Handling file drop:', dt.files[0].name);
            handleVSCodeFileDrop(e, dt.files);
        } else {
            const uriList = dt.getData('text/uri-list');
            const textPlain = dt.getData('text/plain');
            
            if (uriList) {
                console.log('[DROP DEBUG] Handling URI list');
                handleVSCodeUriDrop(e, uriList);
            } else if (textPlain && textPlain.includes('/')) {
                console.log('[DROP DEBUG] Handling text as path');
                handleVSCodeUriDrop(e, textPlain);
            }
        }
    }
    
    // Register handlers on the container (works for single row)
    boardContainer.addEventListener('dragover', function(e) {
        // Skip external file drag handling if we're dragging internal elements
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return; // Don't show external drop indicators during internal drags
        }
        
        if (!isExternalFileDrag(e)) return;
        
        e.preventDefault();
        
        const now = Date.now();
        if (now - lastIndicatorUpdate >= INDICATOR_UPDATE_THROTTLE) {
            lastIndicatorUpdate = now;
            
            const column = e.target.closest('.kanban-full-height-column');
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
        // Skip external file drag handling if we're dragging internal elements
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return; // Don't show external drop feedback during internal drags
        }
        
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
    
    // CRITICAL: Also register on row elements for multi-row layout
    // Use event delegation to handle dynamically created rows
    boardContainer.addEventListener('dragover', function(e) {
        // Skip external file drag handling if we're dragging internal elements
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return; // Don't handle external drops during internal drags
        }
        
        // Check if we're over a row or row-drop-zone-spacer
        const row = e.target.closest('.kanban-row');
        const spacer = e.target.closest('.row-drop-zone-spacer');
        
        if ((row || spacer) && isExternalFileDrag(e)) {
            e.preventDefault(); // Enable drop on rows and spacers
        }
    }, true); // Use capture phase
    
    boardContainer.addEventListener('drop', function(e) {
        // Skip external file drop handling if we're dragging internal elements
        if (dragState.isDragging && (dragState.draggedColumn || dragState.draggedTask)) {
            return; // Don't handle external drops during internal drags
        }
        
        // Check if drop is on a row or spacer
        const row = e.target.closest('.kanban-row');
        const spacer = e.target.closest('.row-drop-zone-spacer');
        
        if ((row || spacer) && isExternalFileDrag(e)) {
            console.log('[DROP DEBUG] Drop on row/spacer, handling...');
            handleExternalDrop(e);
        }
    }, true); // Use capture phase
    
    // Document level handlers
    document.addEventListener('dragover', function(e) {
        if (!boardContainer.contains(e.target) && isExternalFileDrag(e)) {
            e.preventDefault();
        }
    }, false);
    
    document.addEventListener('drop', function(e) {
        if (!boardContainer.contains(e.target)) {
            e.preventDefault();
            console.log('[DROP DEBUG] Drop outside board, prevented');
        }
    }, false);
    
    console.log('[DROP DEBUG] All handlers registered (including multi-row support)');
}


function handleClipboardCardDrop(e, clipboardData) {
    console.log(`[DROP DEBUG] handleClipboardCardDrop called with data:`, clipboardData);
    
    try {
        const parsedData = JSON.parse(clipboardData);
        console.log('[DROP DEBUG] Parsed clipboard card data:', parsedData);
        
        // Extract the task data
        const taskData = parsedData.task || parsedData;
        console.log('[DROP DEBUG] Task data:', taskData);
        
        const title = taskData.title || taskData.content || parsedData.content || 'New Card';
        const description = taskData.description || taskData.content || '';
        
        console.log('[DROP DEBUG] Creating task with title:', title, 'description:', description);
        
        createNewTaskWithContent(
            title,
            { x: e.clientX, y: e.clientY },
            description
        );
    } catch (error) {
        console.error('[DROP DEBUG] Failed to parse clipboard card data:', error);
        console.error('[DROP DEBUG] Raw data was:', clipboardData);
        // Fallback: treat as plain text
        console.log('[DROP DEBUG] Using fallback - creating with raw data as title');
        createNewTaskWithContent(
            'Clipboard Content',
            { x: e.clientX, y: e.clientY },
            clipboardData
        );
    }
}

function handleEmptyCardDrop(e, emptyCardData) {
    console.log(`[DROP DEBUG] handleEmptyCardDrop called with data:`, emptyCardData);
    
    try {
        const parsedData = JSON.parse(emptyCardData);
        console.log('[DROP DEBUG] Parsed empty card data:', parsedData);
        
        // Create empty task
        console.log('[DROP DEBUG] Creating empty task');
        
        createNewTaskWithContent(
            '',
            { x: e.clientX, y: e.clientY },
            ''
        );
    } catch (error) {
        console.error('[DROP DEBUG] Failed to parse empty card data:', error);
        console.error('[DROP DEBUG] Raw data was:', emptyCardData);
        // Fallback: create empty task anyway
        console.log('[DROP DEBUG] Using fallback - creating empty task');
        createNewTaskWithContent(
            '',
            { x: e.clientX, y: e.clientY },
            ''
        );
    }
}

function handleVSCodeFileDrop(e, files) {
    console.log(`[DROP DEBUG] handleVSCodeFileDrop called with ${files.length} files`);
    
    const file = files[0];
    const fileName = file.name;
    
    console.log(`[DROP DEBUG] File details:`, {
        name: fileName,
        type: file.type,
        size: file.size,
        clientX: e.clientX,
        clientY: e.clientY
    });
    
    const activeEditor = getActiveTextEditor();
    console.log('[DROP DEBUG] Active editor:', activeEditor);
    
    const message = {
        type: 'handleFileDrop',
        fileName: fileName,
        dropPosition: {
            x: e.clientX,
            y: e.clientY
        },
        activeEditor: activeEditor
    };
    
    console.log('[DROP DEBUG] Sending message to VSCode:', message);
    vscode.postMessage(message);
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
    console.log(`[DROP DEBUG] createNewTaskWithContent called`);
    console.log(`[DROP DEBUG] Content:`, content);
    console.log(`[DROP DEBUG] Drop position:`, dropPosition);
    
    // Check board availability
    console.log('[DROP DEBUG] window.currentBoard:', window.currentBoard);
    
    if (!window.currentBoard) {
        console.error('[DROP DEBUG] No board on window.currentBoard');
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No board loaded' 
        });
        return;
    }
    
    if (!window.currentBoard.columns || window.currentBoard.columns.length === 0) {
        console.error('[DROP DEBUG] Board has no columns');
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Cannot create task: No columns available' 
        });
        return;
    }
    
    console.log(`[DROP DEBUG] Board has ${window.currentBoard.columns.length} columns`);
    
    if (recentlyCreatedTasks.has(content)) {
        console.log('[DROP DEBUG] Duplicate prevention - task already created');
        return;
    }
    
    recentlyCreatedTasks.add(content);
    setTimeout(() => recentlyCreatedTasks.delete(content), 2000);
    
    // Find target column
    let targetColumnId = null;
    let insertionIndex = -1;
    
    const elementAtPoint = document.elementFromPoint(dropPosition.x, dropPosition.y);
    console.log('[DROP DEBUG] Element at drop point:', elementAtPoint);
    
    const columnElement = elementAtPoint?.closest('.kanban-full-height-column');
    
    if (columnElement && !columnElement.classList.contains('collapsed')) {
        targetColumnId = columnElement.dataset.columnId;
        insertionIndex = calculateInsertionIndex(columnElement, dropPosition.y);
        console.log(`[DROP DEBUG] Found column at drop point: ${targetColumnId}, insertion index: ${insertionIndex}`);
    } else {
        console.log('[DROP DEBUG] No column at drop point, finding nearest...');
        
        const columns = document.querySelectorAll('.kanban-full-height-column:not(.collapsed)');
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
        
        if (targetColumnId) {
            console.log(`[DROP DEBUG] Found nearest column: ${targetColumnId} at distance ${minDistance}`);
        }
    }
    
    if (!targetColumnId && window.currentBoard.columns.length > 0) {
        const firstNonCollapsed = window.currentBoard.columns.find(col => 
            !window.collapsedColumns || !window.collapsedColumns.has(col.id)
        );
        if (firstNonCollapsed) {
            targetColumnId = firstNonCollapsed.id;
            insertionIndex = -1;
            console.log(`[DROP DEBUG] Using first non-collapsed column: ${targetColumnId}`);
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
        
        console.log('[DROP DEBUG] Sending addTaskAtPosition message:', message);
        vscode.postMessage(message);
    } else {
        console.error('[DROP DEBUG] Could not find any suitable column');
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
        const columns = Array.from(board.querySelectorAll('.kanban-full-height-column'));
        
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
        row.addEventListener('dragover', e => {
            if (!dragState.draggedColumn) return;
            
            e.preventDefault();
            e.stopPropagation();
            
            // Visual feedback (this is cheap, just adding a class)
            if (!row.classList.contains('drag-over')) {
                row.classList.add('drag-over');
            }
            
            // Find insertion point in this row
            const columnsInRow = Array.from(row.querySelectorAll('.kanban-full-height-column:not(.dragging)'));
            const mouseX = e.clientX;
            
            let targetPosition = null;
            for (const col of columnsInRow) {
                const rect = col.getBoundingClientRect();
                if (mouseX < rect.left + rect.width / 2) {
                    targetPosition = col;
                    break;
                }
            }
            
            // Default to end position if not found
            if (!targetPosition) {
                const addBtn = row.querySelector('.add-column-btn');
                targetPosition = addBtn || null;
            }
            
            // Only move if position changed
            if (dragState.lastRowDropTarget !== targetPosition || dragState.lastRow !== row) {
                dragState.lastRowDropTarget = targetPosition;
                dragState.lastRow = row;
                
                // Move the dragged column to this position
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
                
                // Update the row attribute
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
            
            // Clear the row tracking
            dragState.lastRowDropTarget = null;
            dragState.lastRow = null;
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
    console.log(`calculateColumnDropIndex`);

    const columns = Array.from(boardElement.querySelectorAll('.kanban-full-height-column'));
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
    const allColumns = boardElement.querySelectorAll('.kanban-full-height-column');
    
    allColumns.forEach(columnElement => {
        const columnId = columnElement.dataset.columnId;
        const tasksContainer = columnElement.querySelector('.tasks-container');

        if (!tasksContainer) return;

        tasksContainer.addEventListener('dragover', e => {
            e.preventDefault();
            
            if (!dragState.draggedTask) return;
            
            const afterElement = getDragAfterTaskElement(tasksContainer, e.clientY);
            
            if (afterElement == null) {
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
            const finalColumnElement = finalParent?.closest('.kanban-full-height-column');
            const finalColumnId = finalColumnElement?.dataset.columnId;
            
            if (finalParent && finalColumnId) {
                const originalColumnElement = dragState.originalTaskParent?.closest('.kanban-full-height-column');
                const originalColumnId = originalColumnElement?.dataset.columnId;
                
                const finalIndex = Array.from(finalParent.children).indexOf(taskItem);
                
                // Check if position actually changed
                const positionChanged = finalParent !== dragState.originalTaskParent || 
                                       finalIndex !== dragState.originalTaskIndex;
                
                if (positionChanged && originalColumnId) {
                    // DON'T restore position - keep the preview position
                    // Calculate the proper index for the data model
                    const dropIndex = finalIndex >= 0 ? finalIndex : 0;
                    
                    // Flush pending tag changes before moving the task
                    if (typeof flushPendingTagChanges === 'function' && 
                        window.pendingTaskChanges && 
                        window.pendingTaskChanges.size > 0) {
                        console.log('🔄 Flushing pending tag changes before task move');
                        flushPendingTagChanges();
                    }
                    
                    // Unfold the destination column if it's collapsed
                    if (typeof unfoldColumnIfCollapsed === 'function') {
                        unfoldColumnIfCollapsed(finalColumnId);
                    }
                    
                    // Send the command to update the model
                    vscode.postMessage({
                        type: 'moveTask',
                        taskId: taskItem.dataset.taskId,
                        fromColumnId: originalColumnId,
                        toColumnId: finalColumnId,
                        newIndex: dropIndex
                    });
                    
                    // Update button state to show unsaved changes
                    if (typeof updateRefreshButtonState === 'function') {
                        updateRefreshButtonState('unsaved', 1);
                        console.log('📦 Task moved via drag - showing unsaved state');
                    }
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
    const addButton = container.querySelector('.add-task-btn');
    
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
    const columns = boardElement.querySelectorAll('.kanban-full-height-column');

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) return;

        dragHandle.addEventListener('dragstart', e => {
            const columnElement = column;
            const columnId = columnElement.getAttribute('data-column-id');
            
            // Find the original position in the data model
            const originalIndex = currentBoard.columns.findIndex(c => c.id === columnId);
            
            // Store drag state
            dragState.draggedColumn = columnElement;
            dragState.draggedColumnId = columnId;
            dragState.originalDataIndex = originalIndex;
            dragState.isDragging = true;
            dragState.lastDropTarget = null;  // Track last drop position
            
            // Set drag data
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `kanban-full-height-column:${columnId}`);
            
            // Visual feedback
            columnElement.classList.add('dragging', 'drag-preview');
            
            console.log(`Started dragging column ${columnId} from data position ${originalIndex}`);
        });

        dragHandle.addEventListener('dragend', e => {
            console.log(`dragend for column`);
            
            const columnElement = column;
            const columnId = dragState.draggedColumnId;
            
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
            
            console.log(`Column ${columnId}: DOM index ${targetDOMIndex}, target data index ${targetDataIndex}, row ${newRow}`);
            console.log('New order would be:', newOrder);
            
            // Flush pending tag changes before moving columns
            if ((window.pendingTaskChanges && window.pendingTaskChanges.size > 0) ||
                (window.pendingColumnChanges && window.pendingColumnChanges.size > 0)) {
                console.log('🔄 Flushing pending tag changes before reorderColumns');
                if (typeof flushPendingTagChanges === 'function') {
                    flushPendingTagChanges();
                }
            }
            
            // Send the new order to backend
            vscode.postMessage({
                type: 'reorderColumns',
                newOrder: newOrder,
                movedColumnId: columnId,
                targetRow: newRow
            });
            
            // Update button state to show unsaved changes
            if (typeof updateRefreshButtonState === 'function') {
                updateRefreshButtonState('unsaved', 1);
                console.log('📦 Columns reordered via drag - showing unsaved state');
            }
            
            // Reset drag state
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
            
            // Determine target position
            let targetElement;
            let insertBefore = false;
            
            if (e.clientX < midpoint) {
                targetElement = column;
                insertBefore = true;
            } else {
                targetElement = column.nextSibling;
                insertBefore = false;
            }
            
            // Only move if it's a different position than last time
            if (dragState.lastDropTarget !== targetElement) {
                dragState.lastDropTarget = targetElement;
                
                if (insertBefore) {
                    // Only move if not already there
                    if (dragState.draggedColumn.nextSibling !== column) {
                        column.parentNode.insertBefore(dragState.draggedColumn, column);
                    }
                } else {
                    // Only move if not already there
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
    
    console.log(`Column ${columnId} should be at position ${targetPosition}`);
    console.log('Desired final order:', desiredOrder);
    console.log('Current data model order:', currentBoard.columns.map(c => c.id));
    
    return targetPosition >= 0 ? targetPosition : 0;
}