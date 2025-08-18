// VS Code API
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : {
    postMessage: (msg) => console.log('Message to extension:', msg),
    getState: () => null,
    setState: () => {}
};

let currentBoard = null;
let canUndo = false;
let canRedo = false;

// Listen for messages from the extension
window.addEventListener('message', event => {
    const message = event.data;
    switch (message.type) {
        case 'updateBoard':
            currentBoard = message.board;
            canUndo = message.canUndo;
            canRedo = message.canRedo;
            renderBoard();
            updateUndoRedoButtons();
            break;
    }
});

// Add keyboard shortcut handling
document.addEventListener('keydown', (e) => {
    // Check if user is typing in an input field or textarea
    const activeElement = document.activeElement;
    const isEditing = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA'
    );

    // Don't intercept keyboard shortcuts while editing
    if (isEditing) {
        return;
    }

    // Detect Undo: Cmd+Z (Mac) or Ctrl+Z (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
    }

    // Detect Redo: Cmd+Shift+Z (Mac) or Ctrl+Shift+Z (Windows/Linux) or Ctrl+Y (Windows)
    if (((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) || 
        (e.ctrlKey && e.key === 'y')) {
        e.preventDefault();
        redo();
        return;
    }

    // Save: Cmd+S (Mac) or Ctrl+S (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        vscode.postMessage({ type: 'save' });
        return;
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

// Render Kanban board
function renderBoard() {
    if (!currentBoard) return;

    const boardElement = document.getElementById('kanban-board');
    boardElement.innerHTML = '';

    // Add toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    toolbar.innerHTML = `
        <button id="undo-btn" class="toolbar-btn" onclick="undo()" title="Undo (Cmd/Ctrl+Z)">↶ Undo</button>
        <button id="redo-btn" class="toolbar-btn" onclick="redo()" title="Redo (Cmd/Ctrl+Shift+Z)">↷ Redo</button>
        <button class="toolbar-btn" onclick="vscode.postMessage({type: 'save'})" title="Save (Cmd/Ctrl+S)">💾 Save</button>
    `;
    boardElement.appendChild(toolbar);

    // Create board container
    const boardContainer = document.createElement('div');
    boardContainer.className = 'board-container';
    
    // Render columns
    currentBoard.columns.forEach((column, columnIndex) => {
        const columnElement = createColumnElement(column, columnIndex);
        boardContainer.appendChild(columnElement);
    });

    const addColumnBtn = document.createElement('button');
    addColumnBtn.className = 'add-column-btn';
    addColumnBtn.textContent = '+ Add Column';
    addColumnBtn.onclick = () => addColumn();
    boardContainer.appendChild(addColumnBtn);
    
    boardElement.appendChild(boardContainer);
    setupDragAndDrop();
}

function createColumnElement(column, columnIndex) {
    const columnDiv = document.createElement('div');
    columnDiv.className = 'kanban-column';
    columnDiv.setAttribute('data-column-index', columnIndex);

    columnDiv.innerHTML = `
        <div class="column-header">
            <div class="column-title-section">
                <span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
                <h3 class="column-title" onclick="editColumnTitle(${columnIndex})">${escapeHtml(column.title)}</h3>
                <textarea class="column-title-edit" 
                         data-column-index="${columnIndex}"
                         style="display: none;">${escapeHtml(column.title)}</textarea>
            </div>
            <div class="column-controls">
                <span class="task-count">${column.tasks.length}</span>
                <div class="donut-menu">
                    <button class="donut-menu-btn" onclick="toggleDonutMenu(event, this)">⋯</button>
                    <div class="donut-menu-dropdown">
                        <button class="donut-menu-item" onclick="moveColumnLeft(${columnIndex})">Move list left</button>
                        <button class="donut-menu-item" onclick="moveColumnRight(${columnIndex})">Move list right</button>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item" onclick="sortColumn(${columnIndex}, 'title')">Sort by title</button>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item danger" onclick="deleteColumn(${columnIndex})">Delete list</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="tasks-container">
            ${column.tasks.map((task, taskIndex) => createTaskElement(task, columnIndex, taskIndex)).join('')}
        </div>
        <button class="add-task-btn" onclick="addTask(${columnIndex})">
            + Add Task
        </button>
    `;

    return columnDiv;
}

function createTaskElement(task, columnIndex, taskIndex) {
    const renderedDescription = task.description ? renderMarkdown(task.description) : '';
    const renderedTitle = task.title ? renderMarkdown(task.title) : '';
    
    return `
        <div class="task-item" data-column-index="${columnIndex}" data-task-index="${taskIndex}">
            <div class="task-menu-container">
                <div class="donut-menu">
                    <button class="donut-menu-btn" onclick="toggleDonutMenu(event, this)">⋯</button>
                    <div class="donut-menu-dropdown">
                        <button class="donut-menu-item" onclick="insertTaskBefore(${columnIndex}, ${taskIndex})">Insert card before</button>
                        <button class="donut-menu-item" onclick="insertTaskAfter(${columnIndex}, ${taskIndex})">Insert card after</button>
                        <button class="donut-menu-item" onclick="duplicateTask(${columnIndex}, ${taskIndex})">Duplicate card</button>
                        <div class="donut-menu-divider"></div>
                        <button class="donut-menu-item danger" onclick="deleteTask(${columnIndex}, ${taskIndex})">Delete card</button>
                    </div>
                </div>
            </div>
            
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <div class="task-title-container">
                    <div class="task-title-display markdown-content" 
                         onclick="editTitle(this, ${columnIndex}, ${taskIndex})">${renderedTitle || '<span class="task-title-placeholder">Add title...</span>'}</div>
                    <textarea class="task-title-edit" 
                             data-column-index="${columnIndex}"
                             data-task-index="${taskIndex}"
                             data-field="title"
                             placeholder="Task title (Markdown supported)..."
                             style="display: none;">${escapeHtml(task.title || '')}</textarea>
                </div>
            </div>

            <div class="task-description-container">
                <div class="task-description-display markdown-content" 
                     onclick="editDescription(this, ${columnIndex}, ${taskIndex})"
                     style="${task.description ? '' : 'display: none;'}">${renderedDescription}</div>
                <textarea class="task-description-edit" 
                         data-column-index="${columnIndex}"
                         data-task-index="${taskIndex}"
                         data-field="description"
                         placeholder="Add description (Markdown supported)..."
                         style="display: none;">${escapeHtml(task.description || '')}</textarea>
                ${!task.description ? `<div class="task-description-placeholder" onclick="editDescription(this, ${columnIndex}, ${taskIndex})">Add description...</div>` : ''}
            </div>
        </div>
    `;
}

// Donut menu functions
window.toggleDonutMenu = function(event, button) {
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
};

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.donut-menu')) {
        document.querySelectorAll('.donut-menu').forEach(menu => {
            menu.classList.remove('active');
        });
    }
});

// Column operations
window.editColumnTitle = function(columnIndex) {
    const column = document.querySelector(`[data-column-index="${columnIndex}"]`);
    const titleElement = column.querySelector('.column-title');
    const editElement = column.querySelector('.column-title-edit');
    
    titleElement.style.display = 'none';
    editElement.style.display = 'block';
    editElement.focus();
    editElement.select();
    
    const saveTitle = () => {
        const newTitle = editElement.value.trim();
        if (newTitle) {
            vscode.postMessage({
                type: 'editColumnTitle',
                columnIndex: columnIndex,
                title: newTitle
            });
        }
        titleElement.style.display = 'block';
        editElement.style.display = 'none';
    };
    
    editElement.onblur = saveTitle;
    editElement.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveTitle();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            editElement.value = titleElement.textContent;
            titleElement.style.display = 'block';
            editElement.style.display = 'none';
        }
    };
};

window.moveColumnLeft = function(columnIndex) {
    if (columnIndex > 0) {
        vscode.postMessage({
            type: 'moveColumn',
            fromIndex: columnIndex,
            toIndex: columnIndex - 1
        });
    }
};

window.moveColumnRight = function(columnIndex) {
    if (columnIndex < currentBoard.columns.length - 1) {
        vscode.postMessage({
            type: 'moveColumn',
            fromIndex: columnIndex,
            toIndex: columnIndex + 1
        });
    }
};

window.deleteColumn = function(columnIndex) {
    vscode.postMessage({
        type: 'deleteColumn',
        columnIndex: columnIndex
    });
};

window.sortColumn = function(columnIndex, sortType) {
    vscode.postMessage({
        type: 'sortColumn',
        columnIndex: columnIndex,
        sortType: sortType
    });
};

window.addColumn = function() {
    const title = prompt('Enter column title:');
    if (title) {
        vscode.postMessage({
            type: 'addColumn',
            title: title
        });
    }
};

// Task operations
window.addTask = function(columnIndex) {
    vscode.postMessage({
        type: 'addTask',
        columnIndex: columnIndex,
        taskData: { title: '', description: '' }
    });
};

window.duplicateTask = function(columnIndex, taskIndex) {
    vscode.postMessage({
        type: 'duplicateTask',
        columnIndex: columnIndex,
        taskIndex: taskIndex
    });
};

window.insertTaskBefore = function(columnIndex, taskIndex) {
    vscode.postMessage({
        type: 'insertTaskBefore',
        columnIndex: columnIndex,
        taskIndex: taskIndex
    });
};

window.insertTaskAfter = function(columnIndex, taskIndex) {
    vscode.postMessage({
        type: 'insertTaskAfter',
        columnIndex: columnIndex,
        taskIndex: taskIndex
    });
};

window.deleteTask = function(columnIndex, taskIndex) {
    vscode.postMessage({
        type: 'deleteTask',
        columnIndex: columnIndex,
        taskIndex: taskIndex
    });
};

// Edit functions
window.editTitle = function(element, columnIndex, taskIndex) {
    const taskItem = element.closest('.task-item');
    const displayDiv = taskItem.querySelector('.task-title-display');
    const editTextarea = taskItem.querySelector('.task-title-edit');
    
    displayDiv.style.display = 'none';
    editTextarea.style.display = 'block';
    autoResize(editTextarea);
    editTextarea.focus();
    editTextarea.select();
    
    const saveAndHide = () => {
        const value = editTextarea.value.trim();
        const task = currentBoard.columns[columnIndex].tasks[taskIndex];
        task.title = value;
        
        vscode.postMessage({
            type: 'editTask',
            columnIndex: columnIndex,
            taskIndex: taskIndex,
            taskData: { title: value, description: task.description }
        });
    };
    
    editTextarea.onblur = saveAndHide;
    editTextarea.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveAndHide();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            renderBoard();
        }
    };
    
    editTextarea.oninput = () => autoResize(editTextarea);
};

window.editDescription = function(element, columnIndex, taskIndex) {
    const taskItem = element.closest('.task-item');
    const displayDiv = taskItem.querySelector('.task-description-display');
    const editTextarea = taskItem.querySelector('.task-description-edit');
    const placeholder = taskItem.querySelector('.task-description-placeholder');
    
    if (displayDiv) displayDiv.style.display = 'none';
    if (placeholder) placeholder.style.display = 'none';
    
    editTextarea.style.display = 'block';
    autoResize(editTextarea);
    editTextarea.focus();
    
    const saveAndHide = () => {
        const value = editTextarea.value.trim();
        const task = currentBoard.columns[columnIndex].tasks[taskIndex];
        task.description = value;
        
        vscode.postMessage({
            type: 'editTask',
            columnIndex: columnIndex,
            taskIndex: taskIndex,
            taskData: { title: task.title, description: value }
        });
    };
    
    editTextarea.onblur = saveAndHide;
    editTextarea.onkeydown = (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            renderBoard();
        }
    };
    
    editTextarea.oninput = () => autoResize(editTextarea);
};

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function renderMarkdown(text) {
    if (!text) return '';
    
    try {
        marked.setOptions({
            breaks: true,
            gfm: true,
            sanitize: false
        });
        
        const rendered = marked.parse(text);
        
        if (!text.includes('\n') && rendered.startsWith('<p>') && rendered.endsWith('</p>\n')) {
            return rendered.slice(3, -5);
        }
        
        return rendered;
    } catch (error) {
        console.error('Error rendering markdown:', error);
        return escapeHtml(text);
    }
}

// Drag and drop
function setupDragAndDrop() {
    setupColumnDragAndDrop();
    setupTaskDragAndDrop();
}

function setupColumnDragAndDrop() {
    const columns = document.querySelectorAll('.kanban-column');
    let draggedColumn = null;
    let draggedColumnIndex = null;

    columns.forEach(column => {
        const dragHandle = column.querySelector('.column-drag-handle');
        if (!dragHandle) return;

        dragHandle.addEventListener('dragstart', e => {
            draggedColumn = column;
            draggedColumnIndex = parseInt(column.dataset.columnIndex);
            e.dataTransfer.effectAllowed = 'move';
            column.classList.add('dragging');
        });

        dragHandle.addEventListener('dragend', e => {
            column.classList.remove('dragging');
        });

        column.addEventListener('dragover', e => {
            e.preventDefault();
            if (draggedColumn && draggedColumn !== column) {
                column.classList.add('drag-over');
            }
        });

        column.addEventListener('dragleave', e => {
            column.classList.remove('drag-over');
        });

        column.addEventListener('drop', e => {
            e.preventDefault();
            column.classList.remove('drag-over');

            if (draggedColumn && draggedColumn !== column) {
                const toIndex = parseInt(column.dataset.columnIndex);
                vscode.postMessage({
                    type: 'moveColumn',
                    fromIndex: draggedColumnIndex,
                    toIndex: toIndex
                });
            }
        });
    });
}

function setupTaskDragAndDrop() {
    let draggedTask = null;
    let draggedFromColumn = null;
    let draggedTaskIndex = null;

    document.querySelectorAll('.task-drag-handle').forEach(handle => {
        handle.draggable = true;
        
        handle.addEventListener('dragstart', e => {
            const taskItem = e.target.closest('.task-item');
            draggedTask = taskItem;
            draggedFromColumn = parseInt(taskItem.dataset.columnIndex);
            draggedTaskIndex = parseInt(taskItem.dataset.taskIndex);
            e.dataTransfer.effectAllowed = 'move';
            taskItem.classList.add('dragging');
        });

        handle.addEventListener('dragend', e => {
            const taskItem = e.target.closest('.task-item');
            taskItem.classList.remove('dragging');
        });
    });

    document.querySelectorAll('.tasks-container').forEach(container => {
        container.addEventListener('dragover', e => {
            e.preventDefault();
            const column = container.closest('.kanban-column');
            column.classList.add('drag-over');
        });

        container.addEventListener('dragleave', e => {
            const column = container.closest('.kanban-column');
            column.classList.remove('drag-over');
        });

        container.addEventListener('drop', e => {
            e.preventDefault();
            const column = container.closest('.kanban-column');
            column.classList.remove('drag-over');

            if (draggedTask) {
                const toColumnIndex = parseInt(column.dataset.columnIndex);
                const dropIndex = calculateDropIndex(container, e.clientY);
                
                vscode.postMessage({
                    type: 'moveTask',
                    fromColumnIndex: draggedFromColumn,
                    taskIndex: draggedTaskIndex,
                    toColumnIndex: toColumnIndex,
                    newIndex: dropIndex
                });
            }
        });
    });
}

function calculateDropIndex(container, clientY) {
    const tasks = Array.from(container.querySelectorAll('.task-item:not(.dragging)'));
    let dropIndex = tasks.length;

    for (let i = 0; i < tasks.length; i++) {
        const rect = tasks[i].getBoundingClientRect();
        if (clientY < rect.top + rect.height / 2) {
            dropIndex = i;
            break;
        }
    }

    return dropIndex;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Make functions globally available
window.undo = undo;
window.redo = redo;