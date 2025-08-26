const vscode = acquireVsCodeApi();

// Global variables
let currentFileInfo = null;
let canUndo = false;
let canRedo = false;
window.currentImageMappings = {}; // Make it available globally for the renderer

// Document-specific folding state storage
let documentFoldingStates = new Map(); // Map<documentUri, {collapsedColumns: Set, collapsedTasks: Set, columnFoldStates: Map}>
let currentDocumentUri = null;

// Function to get current document folding state
function getCurrentDocumentFoldingState() {
    if (!currentDocumentUri) return null;
    
    if (!documentFoldingStates.has(currentDocumentUri)) {
        // Initialize empty state for new document
        documentFoldingStates.set(currentDocumentUri, {
            collapsedColumns: new Set(),
            collapsedTasks: new Set(),
            columnFoldStates: new Map(),
            globalColumnFoldState: 'fold-mixed',
            isInitialized: false
        });
    }
    
    return documentFoldingStates.get(currentDocumentUri);
}

// Function to save current folding state to document storage
function saveCurrentFoldingState() {
    if (!currentDocumentUri || !window.collapsedColumns) return;
    
    const state = getCurrentDocumentFoldingState();
    if (!state) return;
    
    // Copy current state
    state.collapsedColumns = new Set(window.collapsedColumns);
    state.collapsedTasks = new Set(window.collapsedTasks);
    state.columnFoldStates = new Map(window.columnFoldStates);
    state.globalColumnFoldState = window.globalColumnFoldState;
    state.isInitialized = true;
    
    console.log(`Saved folding state for document: ${currentDocumentUri}`, state);
}

// Function to restore folding state from document storage
function restoreFoldingState() {
    if (!currentDocumentUri) return false;
    
    const state = getCurrentDocumentFoldingState();
    if (!state) return false;
    
    // Initialize global folding variables if they don't exist
    if (!window.collapsedColumns) window.collapsedColumns = new Set();
    if (!window.collapsedTasks) window.collapsedTasks = new Set();
    if (!window.columnFoldStates) window.columnFoldStates = new Map();
    if (!window.globalColumnFoldState) window.globalColumnFoldState = 'fold-mixed';
    
    if (state.isInitialized) {
        // Restore saved state
        window.collapsedColumns = new Set(state.collapsedColumns);
        window.collapsedTasks = new Set(state.collapsedTasks);
        window.columnFoldStates = new Map(state.columnFoldStates);
        window.globalColumnFoldState = state.globalColumnFoldState;
        
        console.log(`Restored folding state for document: ${currentDocumentUri}`, state);
        return true;
    }
    
    return false; // Don't apply default folding here
}

// Function to apply default folding (empty columns folded) - only for truly new documents
function applyDefaultFoldingToNewDocument() {
    if (!currentBoard || !currentBoard.columns) return;
    
    console.log('Applying default folding for new document - empty columns will be collapsed');
    
    // Don't reset existing state, just add empty columns to collapsed set
    currentBoard.columns.forEach(column => {
        if (!column.tasks || column.tasks.length === 0) {
            window.collapsedColumns.add(column.id);
            console.log(`Auto-folding empty column: ${column.title} (${column.id})`);
        }
    });
    
    // Mark this document as initialized so we don't apply defaults again
    const state = getCurrentDocumentFoldingState();
    if (state) {
        state.isInitialized = true;
    }
}

// Function to update document URI and manage state
function updateDocumentUri(newUri) {
    if (currentDocumentUri !== newUri) {
        // Save current state before switching
        if (currentDocumentUri) {
            saveCurrentFoldingState();
        }
        
        currentDocumentUri = newUri;
        console.log(`Switched to document: ${currentDocumentUri}`);
        
        // Try to restore state, if no state exists, apply defaults for new document
        if (!restoreFoldingState()) {
            applyDefaultFoldingToNewDocument();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Enhanced click handler for links, images, and wiki links
    document.addEventListener('click', (e) => {
        // Don't interfere with clicks during editing mode
        if (isCurrentlyEditing()) {
            return;
        }

        // Handle wiki links first (highest priority)
        const wikiLink = e.target.closest('.wiki-link');
        if (wikiLink) {
            e.preventDefault();
            e.stopPropagation();
            
            const documentName = wikiLink.getAttribute('data-document');
            if (documentName) {
                console.log('Opening wiki link:', documentName);
                vscode.postMessage({
                    type: 'openWikiLink',
                    documentName: documentName
                });
            }
            return;
        }

        // Handle images - check if we should edit or open
        const img = e.target.closest('img');
        if (img && img.src) {
            // Check if image is inside an editable field
            const editableContainer = img.closest('.task-title-display, .task-description-display, .column-title');
            
            if (editableContainer) {
                // Start editing the field containing the image
                e.preventDefault();
                e.stopPropagation();
                
                if (editableContainer.classList.contains('task-title-display')) {
                    const taskId = editableContainer.getAttribute('data-task-id');
                    const columnId = editableContainer.getAttribute('data-column-id');
                    if (taskId && columnId) {
                        editTitle(editableContainer, taskId, columnId);
                    }
                } else if (editableContainer.classList.contains('task-description-display')) {
                    const taskId = editableContainer.getAttribute('data-task-id');
                    const columnId = editableContainer.getAttribute('data-column-id');
                    if (taskId && columnId) {
                        editDescription(editableContainer, taskId, columnId);
                    }
                } else if (editableContainer.classList.contains('column-title')) {
                    const column = editableContainer.closest('.kanban-column');
                    const columnId = column?.getAttribute('data-column-id');
                    if (columnId) {
                        editColumnTitle(columnId);
                    }
                }
                return;
            }
            
            // If not in an editable field, handle as file link
            if (img.src.startsWith('vscode-webview://')) {
                // Get original source from data attribute for opening
                const originalSrc = img.getAttribute('data-original-src');
                if (originalSrc) {
                    e.preventDefault();
                    e.stopPropagation();
                    
                    console.log('Opening image file:', originalSrc);
                    vscode.postMessage({
                        type: 'openFileLink',
                        href: originalSrc
                    });
                }
                return;
            }
            
            const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src');
            if (originalSrc && !originalSrc.startsWith('data:')) {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('Opening image file:', originalSrc);
                vscode.postMessage({
                    type: 'openFileLink',
                    href: originalSrc
                });
            }
            return;
        }

        // Handle regular markdown links
        const link = e.target.closest('a[data-original-href]');
        if (link) {
            e.preventDefault();
            e.stopPropagation();
            
            const href = link.getAttribute('data-original-href');
            if (!href) return;
            
            console.log('Opening file link:', href);
            
            if (href.startsWith('http://') || href.startsWith('https://')) {
                vscode.postMessage({
                    type: 'openExternalLink',
                    href: href
                });
            } else {
                vscode.postMessage({
                    type: 'openFileLink',
                    href: href
                });
            }

            return false;
        }

        // Handle any other clickable links (fallback)
        const anyLink = e.target.closest('a[href]');
        if (anyLink) {
            const href = anyLink.getAttribute('href');
            
            if (!href || href.startsWith('javascript:') || href.startsWith('#')) {
                return;
            }
            
            e.preventDefault();
            e.stopPropagation();
            
            console.log('Opening fallback link:', href);
            
            if (href.startsWith('http://') || href.startsWith('https://')) {
                vscode.postMessage({
                    type: 'openExternalLink',
                    href: href
                });
            } else {
                vscode.postMessage({
                    type: 'openFileLink',
                    href: href
                });
            }
            
            return false;
        }
    }, true);

    // Close menus when clicking outside (but don't interfere with editing)
    document.addEventListener('click', (e) => {
        // Only close menus if we're not in editing mode and not clicking on a menu
        if (!isCurrentlyEditing() && !e.target.closest('.donut-menu')) {
            document.querySelectorAll('.donut-menu').forEach(menu => {
                menu.classList.remove('active');
            });
        }
    });

    // Modal event listeners
    document.getElementById('input-modal').addEventListener('click', e => {
        if (e.target.id === 'input-modal') {
            closeInputModal();
        }
    });

    // Request initial board data and file info
    setTimeout(() => {
        if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
            vscode.postMessage({ type: 'requestBoardUpdate' });
        }
        if (!currentFileInfo) {
            vscode.postMessage({ type: 'requestFileInfo' });
        }
    }, 100);
    
    // Setup drag and drop
    setupDragAndDrop();
});

// Helper function to check if we're currently in editing mode
function isCurrentlyEditing() {
    return window.taskEditor && window.taskEditor.currentEditor && 
           window.taskEditor.currentEditor.element && 
           window.taskEditor.currentEditor.element.style.display !== 'none';
}

// Listen for messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    console.log('Received message:', message);
    
    switch (message.type) {
        case 'updateBoard':
            console.log('Updating board with:', message.board);
            currentBoard = message.board;
            if (message.imageMappings) {
                window.currentImageMappings = message.imageMappings;
                console.log('Received image mappings:', window.currentImageMappings);
            }
            debouncedRenderBoard();
            break;
        case 'updateFileInfo':
            console.log('Updating file info with:', message.fileInfo);
            const previousDocumentPath = currentFileInfo?.documentPath;
            currentFileInfo = message.fileInfo;
            
            // Only update document URI if it actually changed
            if (currentFileInfo && currentFileInfo.documentPath && 
                currentFileInfo.documentPath !== previousDocumentPath) {
                updateDocumentUri(currentFileInfo.documentPath);
            }
            
            updateFileInfoBar();
            break;
        case 'undoRedoStatus':
            console.log('Undo/Redo status:', message);
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            updateUndoRedoButtons();
            break;
        case 'insertFileLink':
            console.log('Insert file link:', message.fileInfo);
            insertFileLink(message.fileInfo);
            break;
    }
});

// Also request update when window becomes visible again
window.addEventListener('focus', () => {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        vscode.postMessage({ type: 'requestBoardUpdate' });
    }
});

// Keyboard shortcuts for undo/redo
document.addEventListener('keydown', (e) => {
    const activeElement = document.activeElement;
    const isEditing = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.classList.contains('column-title-edit') ||
        activeElement.classList.contains('task-title-edit') ||
        activeElement.classList.contains('task-description-edit')
    );
    
    if (!isEditing) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            undo();
        }
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

function insertFileLink(fileInfo) {
    const { fileName, relativePath, isImage } = fileInfo;
    let activeEditor = fileInfo.activeEditor || getActiveTextEditor();
    
    // Create markdown link with ORIGINAL relative path
    let markdownLink;
    if (isImage) {
        const altText = fileName.split('.')[0];
        markdownLink = `![${altText}](${relativePath})`;
    } else {
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
        
        // FOR IMAGES: Also add to the other field if needed
        if (isImage && (activeEditor.type === 'task-title' || activeEditor.type === 'task-description')) {
            const taskItem = element.closest('.task-item');
            const otherField = activeEditor.type === 'task-title' ? 
                taskItem.querySelector('.task-description-edit') : 
                taskItem.querySelector('.task-title-edit');
            
            if (otherField) {
                const otherValue = otherField.value;
                otherField.value = otherValue ? `${otherValue}\n${markdownLink}` : markdownLink;
                otherField.dispatchEvent(new Event('input'));
                if (typeof autoResize === 'function') {
                    autoResize(otherField);
                }
            }
        }
        
        // Focus back on the element
        element.focus();
        
        // Save the changes immediately
        setTimeout(() => {
            if (element.classList.contains('task-title-edit') || element.classList.contains('task-description-edit')) {
                if (taskEditor.currentEditor && taskEditor.currentEditor.element === element) {
                    taskEditor.save();
                }
            } else if (element.classList.contains('column-title-edit')) {
                element.blur();
            }
        }, 50);
        
        vscode.postMessage({ type: 'showMessage', text: `Inserted ${isImage ? 'image' : 'file'} link: ${fileName}` });
    } else {
        // Create new task with the file link
        createNewTaskWithContent(markdownLink, fileInfo.dropPosition, isImage ? markdownLink : '');
        vscode.postMessage({ type: 'showMessage', text: `Created new task with ${isImage ? 'image' : 'file'} link: ${fileName}` });
    }
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
    // Save current state before potentially switching files
    saveCurrentFoldingState();
    vscode.postMessage({ type: 'selectFile' });
}

function updateWhitespace(value) {
    document.documentElement.style.setProperty('--whitespace', value);
}

// Export functions for use by other modules
window.saveCurrentFoldingState = saveCurrentFoldingState;
window.restoreFoldingState = restoreFoldingState;