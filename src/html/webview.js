// VS Code API mock for testing
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : {
    postMessage: (msg) => console.log('Message to extension:', msg)
};

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

// Track currently active text editor for drag/drop
let activeTextEditor = null;
// Track if drag/drop is already set up to prevent multiple listeners
let dragDropInitialized = false;
let isProcessingDrop = false; // Prevent multiple simultaneous drops

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
            debouncedRenderBoard(); // Use debounced render
            break;
        case 'updateFileInfo':
            console.log('Updating file info with:', message.fileInfo); // Debug log
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
            updateImageSources(message.pathMappings);
            break;
        case 'updateFileInfo':
            console.log('Updating file info with:', message.fileInfo);
            currentFileInfo = message.fileInfo;
            updateFileInfoBar();
            break;
    }
});

// Request board update when the webview loads/becomes visible
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, requesting board update');
    // Request initial board data and file info
    setTimeout(() => {
        if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
            console.log('No board data, requesting update from extension');
            vscode.postMessage({ type: 'requestBoardUpdate' });
        }
        if (!currentFileInfo) {
            console.log('No file info, requesting update from extension');
            vscode.postMessage({ type: 'requestFileInfo' });
        }
    }, 100);
    
    // Setup drag and drop
    setupDragAndDrop();
});

// Also request update when window becomes visible again
window.addEventListener('focus', () => {
    console.log('Window focused, checking board data');
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        console.log('No board data on focus, requesting update');
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

// Drag and Drop Setup
// function setupGlobalDragAndDrop() {
//     const boardContainer = document.getElementById('kanban-container');
//     const dropFeedback = document.getElementById('drop-zone-feedback');
    
//     console.log('Setting up global drag and drop...');
    
//     // Prevent default drag behaviors on the entire board
//     ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
//         boardContainer.addEventListener(eventName, preventDefaults, false);
//         document.body.addEventListener(eventName, preventDefaults, false);
//     });
    
//     function preventDefaults(e) {
//         e.preventDefault();
//         e.stopPropagation();
//     }
    
//     // Show drop zone feedback - only for external file drags
//     ['dragenter', 'dragover'].forEach(eventName => {
//         boardContainer.addEventListener(eventName, (e) => {
//             // Only show feedback for external file drags, not internal task/column drags
//             if (isExternalFileDrag(e)) {
//                 showDropFeedback(e);
//             }
//         }, false);
//     });
    
//     ['dragleave', 'drop'].forEach(eventName => {
//         boardContainer.addEventListener(eventName, hideDropFeedback, false);
//     });
    
//     // Check if this is an external file drag (not internal task/column drag)
//     function isExternalFileDrag(e) {
//         const dt = e.dataTransfer;
//         if (!dt) return false;
        
//         // Check for our specific internal kanban drag identifiers
//         const hasKanbanTask = dt.types.includes('application/kanban-task');
//         const hasKanbanColumn = dt.types.includes('application/kanban-column');
//         if (hasKanbanTask || hasKanbanColumn) {
//             console.log('Internal kanban drag detected, not showing file drop feedback');
//             return false;
//         }
        
//         // Check if it's an internal kanban drag by examining data
//         const hasInternalData = dt.types.includes('text/plain') || dt.types.includes('application/column-id');
//         if (hasInternalData) {
//             // For internal drags, check if the data contains our task/column IDs
//             try {
//                 const textData = dt.getData('text/plain');
//                 const columnData = dt.getData('application/column-id');
//                 if ((textData && (textData.includes('task_') || textData.includes('col_'))) || 
//                     (columnData && columnData.includes('col_'))) {
//                     console.log('Internal kanban drag detected by ID format');
//                     return false; // This is internal kanban drag
//                 }
//             } catch (e) {
//                 // getData might fail during dragenter, that's ok
//                 // Fall back to checking just the types
//             }
//         }
        
//         // Check for external file indicators
//         const hasFiles = dt.types.includes('Files');
//         const hasUriList = dt.types.includes('text/uri-list');
        
//         const isExternal = hasFiles || hasUriList;
//         if (isExternal) {
//             console.log('External file drag detected');
//         }
        
//         return isExternal;
//     }
    
//     // Also handle at document level to catch drags from outside, but be more specific
//     document.addEventListener('dragenter', (e) => {
//         console.log('Document dragenter, types:', e.dataTransfer?.types);
//         // Only show feedback if it's clearly an external file drag
//         if (isExternalFileDrag(e)) {
//             showDropFeedback(e);
//         }
//     });
    
//     document.addEventListener('dragleave', (e) => {
//         // Hide when leaving the document
//         if (!document.body.contains(e.relatedTarget)) {
//             hideDropFeedback(e);
//         }
//     });
    
//     function showDropFeedback(e) {
//         console.log('Showing drop feedback for external file');
//         if (dropFeedback) {
//             dropFeedback.classList.add('active');
//         }
//         // Don't add the CSS class that creates the competing overlay
//         // boardContainer.classList.add('drag-highlight');
//     }
    
//     function hideDropFeedback(e) {
//         console.log('Hiding drop feedback');
//         if (dropFeedback) {
//             dropFeedback.classList.remove('active');
//         }
//         // Make sure to remove the CSS class too
//         boardContainer.classList.remove('drag-highlight');
//     }
    
//     // Handle dropped files
//     boardContainer.addEventListener('drop', handleFileDrop, false);
//     document.addEventListener('drop', handleFileDrop, false);
    
//     function handleFileDrop(e) {
//         console.log('File drop detected!');
//         hideDropFeedback(e);
        
//         // Prevent multiple simultaneous drops
//         if (isProcessingDrop) {
//             console.log('Already processing a drop, ignoring this one');
//             return;
//         }
        
//         const dt = e.dataTransfer;
//         console.log('DataTransfer types:', dt.types);
//         console.log('DataTransfer files length:', dt.files.length);
        
//         // Check for internal kanban drags first - be very specific
//         const hasKanbanTask = dt.types.includes('application/kanban-task');
//         const hasKanbanColumn = dt.types.includes('application/kanban-column');
        
//         if (hasKanbanTask || hasKanbanColumn) {
//             console.log('Internal kanban drag detected by type, skipping file drop handling');
//             return;
//         }
        
//         // Additional check: examine the actual data for task/column IDs
//         const taskId = dt.getData('text/plain');
//         const columnId = dt.getData('application/column-id');
        
//         if ((taskId && (taskId.includes('task_') || taskId.includes('col_'))) || 
//             (columnId && columnId.includes('col_'))) {
//             console.log('Internal kanban drag detected by data content, skipping file drop handling');
//             return;
//         }
        
//         // Check all available data for debugging
//         for (let i = 0; i < dt.types.length; i++) {
//             const type = dt.types[i];
//             const data = dt.getData(type);
//             console.log(`DataTransfer[${type}]:`, data);
//         }
        
//         const files = dt.files;
        
//         // Set processing flag
//         isProcessingDrop = true;
        
//         // Reset flag after a delay
//         setTimeout(() => {
//             isProcessingDrop = false;
//         }, 1000);
        
//         if (files && files.length > 0) {
//             console.log('Handling file drop with', files.length, 'files');
//             // Handle VS Code file drops
//             handleVSCodeFileDrop(e, files);
//         } else {
//             // Check for VS Code internal drag data
//             const uriList = dt.getData('text/uri-list');
//             const textPlain = dt.getData('text/plain');
//             console.log('URI list:', uriList);
//             console.log('Text plain:', textPlain);
            
//             if (uriList) {
//                 console.log('Handling URI list drop');
//                 handleVSCodeUriDrop(e, uriList);
//             } else if (textPlain && (textPlain.startsWith('file://') || (textPlain.includes('/') && !textPlain.includes('task_') && !textPlain.includes('col_')))) {
//                 console.log('Handling text plain as URI');
//                 handleVSCodeUriDrop(e, textPlain);
//             } else {
//                 console.log('No file data found in drop');
//                 // Reset processing flag
//                 isProcessingDrop = false;
//             }
//         }
//     }
// }

function setupGlobalDragAndDrop() {
    const boardContainer = document.getElementById('kanban-container');
    const dropFeedback = document.getElementById('drop-zone-feedback');
    
    console.log('Setting up global drag and drop...');
    
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
            console.log('Internal kanban drag detected, not showing file drop feedback');
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
                    console.log('Internal kanban drag detected by ID format');
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
        if (isExternal) {
            console.log('External file drag detected');
        }
        
        return isExternal;
    }
    
    // Enhanced document-level handling
    document.addEventListener('dragenter', (e) => {
        console.log('Document dragenter, types:', e.dataTransfer?.types);
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
        console.log('Showing drop feedback for external file');
        if (dropFeedback) {
            dropFeedback.classList.add('active');
        }
    }
    
    function hideDropFeedback(e) {
        console.log('Hiding drop feedback');
        if (dropFeedback) {
            dropFeedback.classList.remove('active');
        }
        boardContainer.classList.remove('drag-highlight');
    }
    
    // Handle dropped files (existing logic)
    boardContainer.addEventListener('drop', handleFileDrop, false);
    document.addEventListener('drop', handleFileDrop, false);
    
    function handleFileDrop(e) {
        console.log('File drop detected!');
        hideDropFeedback(e);
        hideExternalDropIndicator(); // Hide the drop indicator
        
        // ... rest of existing handleFileDrop logic remains the same
        if (isProcessingDrop) {
            console.log('Already processing a drop, ignoring this one');
            return;
        }
        
        const dt = e.dataTransfer;
        console.log('DataTransfer types:', dt.types);
        console.log('DataTransfer files length:', dt.files.length);
        
        const hasKanbanTask = dt.types.includes('application/kanban-task');
        const hasKanbanColumn = dt.types.includes('application/kanban-column');
        
        if (hasKanbanTask || hasKanbanColumn) {
            console.log('Internal kanban drag detected by type, skipping file drop handling');
            return;
        }
        
        const taskId = dt.getData('text/plain');
        const columnId = dt.getData('application/column-id');
        
        if ((taskId && (taskId.includes('task_') || taskId.includes('col_'))) || 
            (columnId && columnId.includes('col_'))) {
            console.log('Internal kanban drag detected by data content, skipping file drop handling');
            return;
        }
        
        const files = dt.files;
        
        isProcessingDrop = true;
        setTimeout(() => {
            isProcessingDrop = false;
        }, 1000);
        
        if (files && files.length > 0) {
            console.log('Handling file drop with', files.length, 'files');
            handleVSCodeFileDrop(e, files);
        } else {
            const uriList = dt.getData('text/uri-list');
            const textPlain = dt.getData('text/plain');
            console.log('URI list:', uriList);
            console.log('Text plain:', textPlain);
            
            if (uriList) {
                console.log('Handling URI list drop');
                handleVSCodeUriDrop(e, uriList);
            } else if (textPlain && (textPlain.startsWith('file://') || (textPlain.includes('/') && !textPlain.includes('task_') && !textPlain.includes('col_')))) {
                console.log('Handling text plain as URI');
                handleVSCodeUriDrop(e, textPlain);
            } else {
                console.log('No file data found in drop');
                isProcessingDrop = false;
            }
        }
    }
}

function handleVSCodeFileDrop(e, files) {
    console.log('handleVSCodeFileDrop called with', files.length, 'files');
    const file = files[0];
    const fileName = file.name;
    
    console.log('File name:', fileName);
    console.log('File type:', file.type);
    console.log('File size:', file.size);
    
    // Send to extension to get proper VS Code URI and handle the drop
    // Don't create the link directly here to avoid duplication
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
    console.log('handleVSCodeUriDrop called with:', uriData);
    
    // Parse URI data from VS Code
    const uris = uriData.split('\n').filter(uri => uri.trim()).filter(uri => {
        // Filter out non-file URIs and internal drag data
        const isFile = uri.startsWith('file://') || (uri.includes('/') && !uri.includes('task_') && !uri.includes('col_'));
        console.log('URI:', uri, 'isFile:', isFile);
        return isFile;
    });
    
    console.log('Filtered URIs:', uris);
    
    if (uris.length > 0) {
        console.log('Sending handleUriDrop message to extension');
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
        console.log('No valid URIs found');
        // Don't create fallback here to avoid duplication
        // The extension will handle showing an appropriate message
        vscode.postMessage({
            type: 'showMessage',
            text: 'Could not process the dropped file. Please try dragging from the Explorer panel.'
        });
    }
}

function getActiveTextEditor() {
    // Check if we're currently editing a text field
    const activeElement = document.activeElement;
    
    if (activeElement && (
        activeElement.classList.contains('task-title-edit') ||
        activeElement.classList.contains('task-description-edit') ||
        activeElement.classList.contains('column-title-edit')
    )) {
        return {
            type: activeElement.classList.contains('column-title-edit') ? 'column-title' : 
                  activeElement.classList.contains('task-title-edit') ? 'task-title' : 'task-description',
            taskId: activeElement.dataset.taskId,
            columnId: activeElement.dataset.columnId,
            cursorPosition: activeElement.selectionStart || 0,
            element: activeElement
        };
    }
    
    // Also check if we have a stored reference
    if (activeTextEditor && activeTextEditor.element && 
        document.contains(activeTextEditor.element) && 
        activeTextEditor.element.style.display !== 'none') {
        return {
            ...activeTextEditor,
            cursorPosition: activeTextEditor.element.selectionStart || 0
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
        
        // Focus back on the element
        element.focus();
        
        // Save the changes immediately
        setTimeout(() => {
            if (element.classList.contains('task-title-edit') || element.classList.contains('task-description-edit')) {
                saveTaskFieldAndUpdateDisplay(element);
            } else if (element.classList.contains('column-title-edit')) {
                // Trigger save for column title
                element.blur();
            }
        }, 50);
        
        vscode.postMessage({ type: 'showMessage', text: `Inserted ${isImage ? 'image' : 'file'} link: ${fileName}` });
    } else {
        // Create new task with the file link
        createNewTaskWithContent(markdownLink, fileInfo.dropPosition);
        vscode.postMessage({ type: 'showMessage', text: `Created new task with ${isImage ? 'image' : 'file'} link: ${fileName}` });
    }
}

// Track recently created tasks to prevent duplicates
let recentlyCreatedTasks = new Set();
// Track board rendering to prevent rapid re-renders
let renderTimeout = null;

function createNewTaskWithContent(content, dropPosition) {
    console.log('createNewTaskWithContent called with:', content, dropPosition);
    
    // Check for recent duplicates to prevent spam creation
    const taskKey = `${content}-${Date.now().toString().slice(-5)}`;
    if (recentlyCreatedTasks.has(content)) {
        console.log('Duplicate task creation prevented for:', content);
        return;
    }
    
    // Add to recent tasks set
    recentlyCreatedTasks.add(content);
    
    // Remove from recent tasks after 2 seconds
    setTimeout(() => {
        recentlyCreatedTasks.delete(content);
    }, 2000);
    
    // Find the nearest column to the drop position AND calculate insertion index
    const columns = document.querySelectorAll('.kanban-column');
    let targetColumnId = null;
    let insertionIndex = -1; // -1 means append to end
    let minDistance = Infinity;
    
    console.log('Found', columns.length, 'columns');
    
    columns.forEach(column => {
        const rect = column.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const distance = Math.abs(centerX - dropPosition.x);
        
        console.log('Column', column.dataset.columnId, 'distance:', distance);
        
        if (distance < minDistance) {
            minDistance = distance;
            targetColumnId = column.dataset.columnId;
            
            // Calculate where to insert within this column based on Y position
            insertionIndex = calculateInsertionIndex(column, dropPosition.y);
            console.log('Updated target column:', targetColumnId, 'insertion index:', insertionIndex);
        }
    });
    
    // Default to first column if no suitable column found
    if (!targetColumnId && currentBoard && currentBoard.columns.length > 0) {
        targetColumnId = currentBoard.columns[0].id;
        insertionIndex = -1; // Append to end as fallback
        console.log('Using first column as fallback:', targetColumnId);
    }
    
    console.log('Final target column ID:', targetColumnId, 'Final insertion index:', insertionIndex);
    
    if (targetColumnId) {
        // Create task data with the content as title
        const taskData = {
            title: content,
            description: ''
        };
        
        console.log('Sending addTaskAtPosition message:', {
            columnId: targetColumnId,
            taskData: taskData,
            insertionIndex: insertionIndex
        });
        
        // Send positioned insertion message to backend
        vscode.postMessage({
            type: 'addTaskAtPosition',
            columnId: targetColumnId,
            taskData: taskData,
            insertionIndex: insertionIndex
        });
        
        console.log('Task creation message sent successfully');
    } else {
        console.error('No target column found for task creation');
        vscode.postMessage({ 
            type: 'showMessage', 
            text: 'Error: Could not find a column to create the task in.' 
        });
    }
}

function calculateInsertionIndex(column, clientY) {
    const tasksContainer = column.querySelector('.tasks-container');
    if (!tasksContainer) {
        console.log('No tasks container found, defaulting to append');
        return -1; // Append to end if no tasks container
    }
    
    const tasks = Array.from(tasksContainer.children);
    
    if (tasks.length === 0) {
        console.log('Empty column, inserting as first task');
        return 0; // Insert as first task in empty column
    }
    
    // Find insertion point based on Y position
    for (let i = 0; i < tasks.length; i++) {
        const taskRect = tasks[i].getBoundingClientRect();
        const taskCenter = taskRect.top + taskRect.height / 2;
        
        if (clientY < taskCenter) {
            console.log('Inserting before task at index', i);
            return i; // Insert before this task
        }
    }
    
    // If not above any task, insert at the end
    console.log('Inserting at end, after', tasks.length, 'tasks');
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
    console.log('Rendering board:', currentBoard); // Debug log
    
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
        console.error('Column is null/undefined');
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
        console.error('Task is null/undefined');
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

// Column title editing
function editColumnTitle(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    
    // Don't allow editing if column is collapsed
    if (column.classList.contains('collapsed')) {
        return;
    }
    
    const titleElement = column.querySelector('.column-title');
    const editElement = column.querySelector('.column-title-edit');
    const dragHandle = column.querySelector('.column-drag-handle');
    
    titleElement.style.display = 'none';
    editElement.style.display = 'block';
    dragHandle.draggable = false;
    
    editElement.focus();
    editElement.select();
    
    // Store reference to active editor
    activeTextEditor = {
        type: 'column-title',
        columnId: columnId,
        element: editElement
    };
    
    const saveTitle = () => {
        const newTitle = editElement.value.trim();
        if (newTitle) {
            vscode.postMessage({
                type: 'editColumnTitle',
                columnId: columnId,
                title: newTitle
            });
            
            // Update local state for immediate visual feedback
            if (currentBoard && currentBoard.columns) {
                const col = currentBoard.columns.find(c => c.id === columnId);
                if (col) {
                    col.title = newTitle;
                    titleElement.innerHTML = renderMarkdown(newTitle);
                }
            }
        }
        
        titleElement.style.display = 'block';
        editElement.style.display = 'none';
        dragHandle.draggable = true;
        activeTextEditor = null;
    };
    
    const cancelEdit = () => {
        const currentTitle = currentBoard && currentBoard.columns ? 
            currentBoard.columns.find(c => c.id === columnId)?.title || '' : '';
        editElement.value = currentTitle;
        titleElement.style.display = 'block';
        editElement.style.display = 'none';
        dragHandle.draggable = true;
        activeTextEditor = null;
    };
    
    editElement.onblur = saveTitle;
    editElement.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };
}

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

// Edit functions with improved scroll stability
function editTitle(element, taskId = null, columnId = null) {
    if (!taskId) {
        taskId = element.dataset.taskId || element.closest('.task-item').dataset.taskId;
    }
    if (!columnId) {
        columnId = element.dataset.columnId || element.closest('.task-item').dataset.columnId;
    }
    
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    const displayDiv = taskItem.querySelector('.task-title-display');
    const editTextarea = taskItem.querySelector('.task-title-edit');
    
    const scrollContainer = taskItem.closest('.tasks-container');
    const beforeEditOffset = taskItem.offsetTop - scrollContainer.scrollTop;
    
    displayDiv.style.display = 'none';
    editTextarea.style.display = 'block';
    autoResize(editTextarea);
    editTextarea.focus();
    editTextarea.select();
    
    // Store reference to active editor
    activeTextEditor = {
        type: 'task-title',
        taskId: taskId,
        columnId: columnId,
        element: editTextarea
    };
    
    requestAnimationFrame(() => {
        const newScrollTop = taskItem.offsetTop - beforeEditOffset;
        scrollContainer.scrollTop = newScrollTop;
    });
    
    const saveAndHide = () => {
        const beforeSaveOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        saveTaskFieldAndUpdateDisplay(editTextarea);
        editTextarea.style.display = 'none';
        displayDiv.style.display = 'block';
        activeTextEditor = null;
        
        requestAnimationFrame(() => {
            const newScrollTop = taskItem.offsetTop - beforeSaveOffset;
            scrollContainer.scrollTop = newScrollTop;
        });
    };
    
    const cancelEdit = () => {
        const beforeCancelOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        editTextarea.style.display = 'none';
        displayDiv.style.display = 'block';
        activeTextEditor = null;
        
        requestAnimationFrame(() => {
            const newScrollTop = taskItem.offsetTop - beforeCancelOffset;
            scrollContainer.scrollTop = newScrollTop;
        });
    };
    
    editTextarea.onblur = saveAndHide;
    editTextarea.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveAndHide();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };
    
    editTextarea.oninput = () => autoResize(editTextarea);
}

function editDescription(element, taskId = null, columnId = null) {
    if (!taskId) {
        taskId = element.dataset.taskId || element.closest('.task-item').dataset.taskId;
    }
    if (!columnId) {
        columnId = element.dataset.columnId || element.closest('.task-item').dataset.columnId;
    }
    
    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    const displayDiv = taskItem.querySelector('.task-description-display');
    const editTextarea = taskItem.querySelector('.task-description-edit');
    const placeholder = taskItem.querySelector('.task-description-placeholder');
    
    const scrollContainer = taskItem.closest('.tasks-container');
    const beforeEditOffset = taskItem.offsetTop - scrollContainer.scrollTop;
    
    if (displayDiv) displayDiv.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    
    editTextarea.style.display = 'block';
    autoResize(editTextarea);
    editTextarea.focus();
    
    // Store reference to active editor
    activeTextEditor = {
        type: 'task-description',
        taskId: taskId,
        columnId: columnId,
        element: editTextarea
    };
    
    requestAnimationFrame(() => {
        const newScrollTop = taskItem.offsetTop - beforeEditOffset;
        scrollContainer.scrollTop = newScrollTop;
    });
    
    const saveAndHide = () => {
        const beforeSaveOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        saveTaskFieldAndUpdateDisplay(editTextarea);
        editTextarea.style.display = 'none';
        activeTextEditor = null;
        
        requestAnimationFrame(() => {
            const newTaskItem = document.querySelector(`[data-task-id="${taskId}"]`);
            const newScrollContainer = newTaskItem?.closest('.tasks-container');
            
            if (newTaskItem && newScrollContainer) {
                const newScrollTop = newTaskItem.offsetTop - beforeSaveOffset;
                newScrollContainer.scrollTop = newScrollTop;
            }
        });
    };
    
    const cancelEdit = () => {
        const beforeCancelOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        editTextarea.style.display = 'none';
        if (editTextarea.value.trim()) {
            displayDiv.style.display = 'block';
        } else {
            placeholder.style.display = 'block';
        }
        activeTextEditor = null;
        
        requestAnimationFrame(() => {
            const newScrollTop = taskItem.offsetTop - beforeCancelOffset;
            scrollContainer.scrollTop = newScrollTop;
        });
    };
    
    editTextarea.onblur = saveAndHide;
    editTextarea.onkeydown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            cancelEdit();
        }
    };
    
    editTextarea.oninput = () => autoResize(editTextarea);
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function saveTaskFieldAndUpdateDisplay(textarea) {
    const taskId = textarea.dataset.taskId;
    const columnId = textarea.dataset.columnId;
    const field = textarea.dataset.field;
    // Use the raw value without trim() for titles to preserve formatting
    const value = textarea.value;

    if (!taskId || !columnId || !field) return;

    // Update local state for immediate visual feedback
    if (currentBoard && currentBoard.columns) {
        const column = currentBoard.columns.find(col => col.id === columnId);
        const task = column?.tasks.find(t => t.id === taskId);
        
        if (task) {
            task[field] = value;
        }
    }

    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    
    if (field === 'title') {
        const displayDiv = taskItem.querySelector('.task-title-display');
        // Use trimmed value for display but preserve original formatting in the data
        const displayValue = value.trim();
        if (displayValue) {
            displayDiv.innerHTML = renderMarkdown(displayValue);
        } else {
            displayDiv.innerHTML = '<span class="task-title-placeholder">Add title...</span>';
        }
    } else if (field === 'description') {
        const displayDiv = taskItem.querySelector('.task-description-display');
        const placeholder = taskItem.querySelector('.task-description-placeholder');
        
        if (value.trim()) {
            displayDiv.innerHTML = renderMarkdown(value);
            displayDiv.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            displayDiv.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }
    }

    // Find the task for the request data
    const column = currentBoard?.columns?.find(col => col.id === columnId);
    const task = column?.tasks?.find(t => t.id === taskId) || { title: '', description: '' };
    
    const taskData = { ...task, [field]: value };
    vscode.postMessage({
        type: 'editTask',
        taskId: taskId,
        columnId: columnId,
        taskData: taskData
    });
}

function renderMarkdown(text) {
    if (!text) return '';
    
    try {
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false,
            renderer: new marked.Renderer()
        });
        
        // Create custom renderer to handle images
        const renderer = new marked.Renderer();
        
        // Override image rendering to convert relative paths to webview URIs
        renderer.image = function(href, title, text) {
            // Check if it's a relative path (not http/https/data URI)
            if (href && !href.startsWith('http') && !href.startsWith('data:') && !href.startsWith('vscode-webview-resource:')) {
                // Request conversion to webview URI from extension
                if (currentFileInfo && currentFileInfo.documentPath) {
                    const absolutePath = resolveRelativePath(currentFileInfo.documentPath, href);
                    // Store the original href and request conversion
                    pendingImageConversions.set(href, { absolutePath, element: null });
                    
                    // For now, use a placeholder that we'll replace later
                    const placeholder = `data-original-src="${href}"`;
                    return `<img src="" ${placeholder} alt="${text || ''}" title="${title || ''}" class="pending-image-conversion" />`;
                }
            }
            
            // Default rendering for absolute URLs
            return `<img src="${href}" alt="${text || ''}" title="${title || ''}" />`;
        };
        
        marked.setOptions({ renderer: renderer });
        
        const rendered = marked.parse(text);
        
        // Process any pending image conversions
        if (pendingImageConversions.size > 0) {
            setTimeout(() => processImageConversions(), 10);
        }
        
        if (!text.includes('\n') && rendered.startsWith('<p>') && rendered.endsWith('</p>\n')) {
            return rendered.slice(3, -5);
        }
        
        return rendered;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        return escapeHtml(text);
    }
}

// Track pending image conversions
let pendingImageConversions = new Map();

function resolveRelativePath(documentPath, relativePath) {
    // Simple path resolution - you might want to use a more robust solution
    const documentDir = documentPath.substring(0, documentPath.lastIndexOf('/'));
    if (relativePath.startsWith('./')) {
        return documentDir + '/' + relativePath.substring(2);
    } else if (relativePath.startsWith('../')) {
        // Handle parent directory navigation
        const parts = documentDir.split('/');
        const relativeParts = relativePath.split('/');
        
        for (const part of relativeParts) {
            if (part === '..') {
                parts.pop();
            } else if (part !== '.' && part !== '') {
                parts.push(part);
            }
        }
        return parts.join('/');
    } else {
        return documentDir + '/' + relativePath;
    }
}

function processImageConversions() {
    const conversions = Array.from(pendingImageConversions.entries());
    if (conversions.length === 0) return;
    
    // Send all pending conversions to extension
    vscode.postMessage({
        type: 'convertImagePaths',
        conversions: conversions.map(([relativePath, data]) => ({
            relativePath,
            absolutePath: data.absolutePath
        }))
    });
}

function updateImageSources(pathMappings) {
    // Update all pending images with their webview URIs
    document.querySelectorAll('.pending-image-conversion').forEach(img => {
        const originalSrc = img.getAttribute('data-original-src');
        if (originalSrc && pathMappings[originalSrc]) {
            img.src = pathMappings[originalSrc];
            img.classList.remove('pending-image-conversion');
            img.removeAttribute('data-original-src');
        }
    });
    
    // Clear processed conversions
    pendingImageConversions.clear();
}

// Drag and drop setup
function setupDragAndDrop() {
    // Only set up global drag/drop once to prevent multiple listeners
    if (!dragDropInitialized) {
        setupGlobalDragAndDrop();
        dragDropInitialized = true;
        console.log('Global drag and drop initialized');
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
            
            console.log('Column drag started:', columnId);
        });

        dragHandle.addEventListener('dragend', e => {
            column.classList.remove('column-dragging');
            columns.forEach(col => col.classList.remove('drag-over'));
            console.log('Column drag ended');
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
            
            console.log('Task drag started:', taskId);
        }
    });

    handle.addEventListener('dragend', e => {
        const taskItem = e.target.closest('.task-item');
        if (taskItem) {
            taskItem.classList.remove('dragging');
            console.log('Task drag ended');
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

// Debug function to clear duplication tracking (useful for testing)
function clearDuplicationTracking() {
    console.log('Clearing duplication tracking');
    recentlyCreatedTasks.clear();
    isProcessingDrop = false;
    if (renderTimeout) {
        clearTimeout(renderTimeout);
        renderTimeout = null;
    }
}

// Debug function to test task creation
function testTaskCreation() {
    console.log('Testing task creation...');
    if (currentBoard && currentBoard.columns.length > 0) {
        // Test via extension message to match the normal flow
        vscode.postMessage({
            type: 'handleFileDrop',
            fileName: 'test-image.jpg',
            dropPosition: { x: 300, y: 300 },
            activeEditor: null
        });
    } else {
        console.log('No board or columns available for test');
    }
}

// Direct test function for debugging the insertFileLink function
function testDirectInsert() {
    console.log('Testing direct file link insertion...');
    const testFileInfo = {
        fileName: 'direct-test.jpg',
        relativePath: './direct-test.jpg',
        isImage: true,
        activeEditor: null,
        dropPosition: { x: 300, y: 300 }
    };
    
    console.log('Creating test task with:', testFileInfo);
    insertFileLink(testFileInfo);
}

// Make test functions globally available for debugging
window.testTaskCreation = testTaskCreation;
window.testDirectInsert = testDirectInsert;
window.clearDuplicationTracking = clearDuplicationTracking;