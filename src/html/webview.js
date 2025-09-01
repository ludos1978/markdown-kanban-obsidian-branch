const vscode = acquireVsCodeApi();

let currentFileInfo = null;
let canUndo = false;
let canRedo = false;
window.currentImageMappings = {};
window.showRowTags = false;

// Document-specific folding state storage - persists across document switches
let documentFoldingStates = new Map();
let currentDocumentUri = null;

let currentColumnWidth = 'medium';
let currentLayoutRows = 1;

function toggleFileBarMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    document.querySelectorAll('.donut-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    if (!wasActive) {
        menu.classList.add('active');
    }
}

function setColumnWidth(size) {
    currentColumnWidth = size;
    
    const widthMap = {
        'small': '250px',
        'medium': '350px',
        'wide': '450px'
    };
    
    document.documentElement.style.setProperty('--column-width', widthMap[size] || '350px');
    
    vscode.postMessage({ 
        type: 'setPreference', 
        key: 'columnWidth', 
        value: size 
    });
    
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    vscode.postMessage({ type: 'showMessage', text: `Column width set to ${size}` });
}

function setLayoutRows(rows) {
    currentLayoutRows = rows;
    
    if (currentBoard) {
        renderBoard();
    }
    
    vscode.postMessage({ 
        type: 'setPreference', 
        key: 'layoutRows', 
        value: rows 
    });
    
    document.querySelectorAll('.file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    vscode.postMessage({ type: 'showMessage', text: `Layout set to ${rows} row${rows > 1 ? 's' : ''}` });
}

function detectRowsFromBoard(board) {
    if (!board || !board.columns) return 1;
    
    let maxRow = 1;
    board.columns.forEach(column => {
        if (column.title) {
            const rowMatch = column.title.match(/#row(\d+)/i);
            if (rowMatch) {
                const rowNum = parseInt(rowMatch[1]);
                if (rowNum > maxRow) {
                    maxRow = rowNum;
                }
            }
        }
    });
    
    return Math.min(maxRow, 4);
}

function getColumnRow(title) {
    if (!title) return 1;
    
    const rowMatches = title.match(/#row(\d+)\b/gi);
    if (rowMatches && rowMatches.length > 0) {
        const lastMatch = rowMatches[rowMatches.length - 1];
        const rowNum = parseInt(lastMatch.replace(/#row/i, ''));
        return Math.min(Math.max(rowNum, 1), 4);
    }
    return 1;
}

function updateColumnRowTag(columnId, newRow) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    let cleanTitle = column.title
        .replace(/#row\d+\b/gi, '')
        .replace(/\s+#row\d+/gi, '')
        .replace(/#row\d+\s+/gi, '')
        .replace(/\s+#row\d+\s+/gi, '');
    
    if (newRow > 1) {
        column.title = cleanTitle + ` #row${newRow}`;
    } else {
        column.title = cleanTitle;
    }
    
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (columnElement) {
        columnElement.setAttribute('data-row', newRow);
        
        const titleElement = columnElement.querySelector('.column-title');
        if (titleElement) {
            const displayTitle = column.title.replace(/#row\d+/gi, '').trim();
            const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
            const rowIndicator = newRow > 1 ? `<span class="column-row-tag">Row ${newRow}</span>` : '';
            titleElement.innerHTML = renderedTitle + rowIndicator;
        }
        
        const editElement = columnElement.querySelector('.column-title-edit');
        if (editElement) {
            editElement.value = column.title;
        }
    }
    
    vscode.postMessage({
        type: 'editColumnTitle',
        columnId: columnId,
        title: cleanTitle
    });
}

function cleanupRowTags() {
    if (!currentBoard || !currentBoard.columns) return;
    
    let needsUpdate = false;
    
    currentBoard.columns.forEach(column => {
        const originalTitle = column.title;
        
        const rowTags = column.title.match(/#row\d+\b/gi) || [];
        
        if (rowTags.length > 1) {
            let cleanTitle = column.title;
            rowTags.forEach(tag => {
                cleanTitle = cleanTitle.replace(new RegExp(tag, 'gi'), '');
            });
            cleanTitle = cleanTitle.replace(/\s{2,}/g, ' ').trim();
            
            const lastTag = rowTags[rowTags.length - 1];
            column.title = cleanTitle + ' ' + lastTag;
            
            if (column.title !== originalTitle) {
                needsUpdate = true;
            }
        }
    });
    
    if (needsUpdate) {
        renderBoard();
    }
}

function getCurrentDocumentFoldingState() {
    if (!currentDocumentUri) return null;
    
    if (!documentFoldingStates.has(currentDocumentUri)) {
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

function saveCurrentFoldingState() {
    if (!currentDocumentUri || !window.collapsedColumns) return;
    
    const state = getCurrentDocumentFoldingState();
    if (!state) return;
    
    state.collapsedColumns = new Set(window.collapsedColumns);
    state.collapsedTasks = new Set(window.collapsedTasks);
    state.columnFoldStates = new Map(window.columnFoldStates);
    state.globalColumnFoldState = window.globalColumnFoldState;
    state.isInitialized = true;
}

function restoreFoldingState() {
    if (!currentDocumentUri) return false;
    
    const state = getCurrentDocumentFoldingState();
    if (!state) return false;
    
    if (!window.collapsedColumns) window.collapsedColumns = new Set();
    if (!window.collapsedTasks) window.collapsedTasks = new Set();
    if (!window.columnFoldStates) window.columnFoldStates = new Map();
    if (!window.globalColumnFoldState) window.globalColumnFoldState = 'fold-mixed';
    
    if (state.isInitialized) {
        window.collapsedColumns = new Set(state.collapsedColumns);
        window.collapsedTasks = new Set(state.collapsedTasks);
        window.columnFoldStates = new Map(state.columnFoldStates);
        window.globalColumnFoldState = state.globalColumnFoldState;
        
        return true;
    }
    
    return false;
}

function applyDefaultFoldingToNewDocument() {
    if (!currentBoard || !currentBoard.columns) return;
    
    currentBoard.columns.forEach(column => {
        if (!column.tasks || column.tasks.length === 0) {
            window.collapsedColumns.add(column.id);
        }
    });
    
    const state = getCurrentDocumentFoldingState();
    if (state) {
        state.isInitialized = true;
    }
}

function updateDocumentUri(newUri) {
    if (currentDocumentUri !== newUri) {
        if (currentDocumentUri) {
            saveCurrentFoldingState();
        }
        
        currentDocumentUri = newUri;
        
        const hadSavedState = restoreFoldingState();
        
        if (!hadSavedState && currentBoard && currentBoard.columns) {
            applyDefaultFoldingToNewDocument();
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    themeObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ['class']
    });
 
    document.addEventListener('click', (e) => {
        if (!e.altKey) return;
        
        if (e.target.closest('.column-title') || 
            e.target.closest('.task-title-container') || 
            e.target.closest('.task-description-container')) {
            return;
        }
        
        window.handleLinkOrImageOpen && window.handleLinkOrImageOpen(e, e.target);
    }, false);

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.donut-menu') && !e.target.closest('.file-bar-menu')) {
            if (typeof flushPendingTagChanges === 'function' && 
                window.pendingTagChanges && 
                (window.pendingTagChanges.columns.size + window.pendingTagChanges.tasks.size > 0)) {
                flushPendingTagChanges();
            }
            
            document.querySelectorAll('.donut-menu').forEach(menu => {
                menu.classList.remove('active');
            });
            document.querySelectorAll('.file-bar-menu').forEach(menu => {
                menu.classList.remove('active');
            });
        }
    });

    document.getElementById('input-modal').addEventListener('click', e => {
        if (e.target.id === 'input-modal') {
            closeInputModal();
        }
    });

    setTimeout(() => {
        if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
            vscode.postMessage({ type: 'requestBoardUpdate' });
        }
        if (!currentFileInfo) {
            vscode.postMessage({ type: 'requestFileInfo' });
        }
    }, 100);
    
    setupDragAndDrop();
});

function isCurrentlyEditing() {
    return window.taskEditor && window.taskEditor.currentEditor && 
           window.taskEditor.currentEditor.element && 
           window.taskEditor.currentEditor.element.style.display !== 'none';
}

window.addEventListener('focus', () => {
    if (!isCurrentlyEditing() && (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0)) {
        vscode.postMessage({ type: 'requestBoardUpdate' });
    }
});

window.addEventListener('message', event => {
    const message = event.data;
    
    switch (message.type) {
        case 'updateBoard':
            const previousBoard = currentBoard;
            currentBoard = message.board;
            window.currentBoard = currentBoard;

            cleanupRowTags();
            
            const detectedRows = detectRowsFromBoard(currentBoard);
            if (detectedRows > currentLayoutRows) {
                setLayoutRows(detectedRows);
            }
            
            if (message.imageMappings) {
                window.currentImageMappings = message.imageMappings;
            }            

            if (message.whitespace) {
                updateWhitespace(message.whitespace);
            } else {
                updateWhitespace('4px');
            }

            if (typeof message.maxRowHeight !== 'undefined') {
                updateMaxRowHeight(message.maxRowHeight);
            }

            if (message.tagColors) {
                window.tagColors = message.tagColors;
                if (typeof applyTagStyles === 'function') {
                    applyTagStyles();
                }
            }
            
            if (typeof message.showRowTags !== 'undefined') {
                window.showRowTags = message.showRowTags;
            }
            
            const isEditing = window.taskEditor && window.taskEditor.currentEditor;
            if (!isEditing) {
                debouncedRenderBoard();
            }
            break;
        case 'updateFileInfo':
            const previousDocumentPath = currentFileInfo?.documentPath;
            currentFileInfo = message.fileInfo;
            
            if (currentFileInfo && currentFileInfo.documentPath && 
                currentFileInfo.documentPath !== previousDocumentPath) {
                updateDocumentUri(currentFileInfo.documentPath);
            }
            
            updateFileInfoBar();
            break;
        case 'undoRedoStatus':
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            updateUndoRedoButtons();
            break;
        case 'insertFileLink':
            insertFileLink(message.fileInfo);
            break;
    }
});

if (typeof MutationObserver !== 'undefined') {
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                updateTagStylesForTheme();
            }
        });
    });
    
    if (document.body) {
        themeObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class']
        });
    }
}

window.addEventListener('focus', () => {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        vscode.postMessage({ type: 'requestBoardUpdate' });
    }
});

document.addEventListener('keydown', (e) => {
    const activeElement = document.activeElement;
    const isEditing = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        activeElement.classList.contains('column-title-edit') ||
        activeElement.classList.contains('task-title-edit') ||
        activeElement.classList.contains('task-description-edit')
    );
    
    const isInSearchInput = activeElement && activeElement.id === 'search-input';
    
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !isEditing) {
        e.preventDefault();
        kanbanSearch.openSearch();
        return;
    }
    
    if (kanbanSearch && kanbanSearch.isSearching) {
        if (e.key === 'Escape') {
            e.preventDefault();
            kanbanSearch.closeSearch();
            return;
        }
        
        if (e.key === 'Enter' && isInSearchInput && !e.shiftKey) {
            e.preventDefault();
            kanbanSearch.nextResult();
            return;
        }
        
        if (e.key === 'Enter' && isInSearchInput && e.shiftKey) {
            e.preventDefault();
            kanbanSearch.previousResult();
            return;
        }
        
        if (e.key === 'F3' && !e.shiftKey) {
            e.preventDefault();
            kanbanSearch.nextResult();
            return;
        }
        
        if (e.key === 'F3' && e.shiftKey) {
            e.preventDefault();
            kanbanSearch.previousResult();
            return;
        }
    }
    
    if (!isEditing && !isInSearchInput) {
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
    let activeEditor = getActiveTextEditor();

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
        
        const element = activeEditor.element;
        const cursorPos = element.selectionStart || activeEditor.cursorPosition || 0;
        const currentValue = element.value;
        
        const newValue = currentValue.slice(0, cursorPos) + markdownLink + currentValue.slice(cursorPos);
        element.value = newValue;
        
        const newCursorPos = cursorPos + markdownLink.length;
        element.setSelectionRange(newCursorPos, newCursorPos);
        
        element.dispatchEvent(new Event('input'));
        if (typeof autoResize === 'function') {
            autoResize(element);
        }
        
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
        
        element.focus();
        
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
        createNewTaskWithContent(markdownLink, fileInfo.dropPosition, isImage ? markdownLink : '');
        vscode.postMessage({ type: 'showMessage', text: `Created new task with ${isImage ? 'image' : 'file'} link: ${fileName}` });
    }
}

function updateFileInfoBar() {
    if (!currentFileInfo) return;

    const fileNameElement = document.getElementById('file-name');
    const lockStatusIcon = document.getElementById('lock-status-icon');
    const lockToggleBtnElement = document.getElementById('lock-toggle-btn');
    const lockBtnTextElement = document.getElementById('lock-btn-text');
    const lockMenuIcon = document.getElementById('lock-menu-icon');

    if (fileNameElement) {
        fileNameElement.textContent = currentFileInfo.fileName;
        fileNameElement.title = currentFileInfo.filePath || currentFileInfo.fileName;
    }

    if (currentFileInfo.isLocked) {
        if (lockStatusIcon) {
            lockStatusIcon.textContent = '🔒';
            lockStatusIcon.title = 'File is locked - click to unlock';
            lockStatusIcon.classList.add('locked');
        }
        
        if (lockBtnTextElement) {
            lockBtnTextElement.textContent = 'Unlock File';
        }
        if (lockMenuIcon) {
            lockMenuIcon.textContent = '🔒';
        }
        if (lockToggleBtnElement) {
            lockToggleBtnElement.classList.add('locked');
        }
    } else {
        if (lockStatusIcon) {
            lockStatusIcon.textContent = '🔓';
            lockStatusIcon.title = 'File is unlocked - click to lock';
            lockStatusIcon.classList.remove('locked');
        }
        
        if (lockBtnTextElement) {
            lockBtnTextElement.textContent = 'Lock File';
        }
        if (lockMenuIcon) {
            lockMenuIcon.textContent = '🔓';
        }
        if (lockToggleBtnElement) {
            lockToggleBtnElement.classList.remove('locked');
        }
    }
    
    updateUndoRedoButtons();
}

function toggleFileLock() {
    vscode.postMessage({ type: 'toggleFileLock' });
}

function selectFile() {
    saveCurrentFoldingState();
    vscode.postMessage({ type: 'selectFile' });
}

function updateWhitespace(value) {
    if (!value) {
        value = '4px';
    }
    if (!isNaN(value)) {
        value = value + 'px';
    }
    
    document.documentElement.style.setProperty('--whitespace', value);
}

function updateMaxRowHeight(value) {
    if (value === 0) {
        document.documentElement.style.removeProperty('--max-row-height');
        document.documentElement.style.setProperty('--row-overflow', 'visible');
    } else {
        document.documentElement.style.setProperty('--max-row-height', value + 'px');
        document.documentElement.style.setProperty('--row-overflow', 'auto');
    }
}

window.saveCurrentFoldingState = saveCurrentFoldingState;
window.restoreFoldingState = restoreFoldingState;

window.toggleFileBarMenu = toggleFileBarMenu;
window.setColumnWidth = setColumnWidth;
window.setLayoutRows = setLayoutRows;
window.updateColumnRowTag = updateColumnRowTag;
window.getColumnRow = getColumnRow;