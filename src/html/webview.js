// VS Code API mock for testing
const vscode = typeof acquireVsCodeApi !== 'undefined' ? acquireVsCodeApi() : {
    postMessage: (msg) => console.log('Message to extension:', msg)
};

let currentBoard = null;
let editingTask = null;
let scrollPositions = new Map();
let collapsedColumns = new Set();
let collapsedTasks = new Set();

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
    switch (message.type) {
        case 'updateBoard':
            currentBoard = message.board;
            renderBoard();
            break;
    }
});

// Render Kanban board
function renderBoard() {
    if (!currentBoard) return;

    const boardElement = document.getElementById('kanban-board');
    
    // Save current scroll positions
    document.querySelectorAll('.tasks-container').forEach(container => {
        const columnId = container.id.replace('tasks-', '');
        scrollPositions.set(columnId, container.scrollTop);
    });

    boardElement.innerHTML = '';

    // Render columns
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

function createColumnElement(column, columnIndex) {
    const columnDiv = document.createElement('div');
    const isCollapsed = collapsedColumns.has(column.id);
    columnDiv.className = `kanban-column ${isCollapsed ? 'collapsed' : ''}`;
    columnDiv.setAttribute('data-column-id', column.id);
    columnDiv.setAttribute('data-column-index', columnIndex);

    columnDiv.innerHTML = `
        <div class="column-header">
            <div class="column-title-section">
                <span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
                <span class="collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleColumnCollapse('${column.id}')">▶</span>
                <div style="display: inline-block;">
                    <h3 class="column-title" onclick="editColumnTitle('${column.id}')">${escapeHtml(column.title)}</h3>
                    <textarea class="column-title-edit" 
                                data-column-id="${column.id}"
                                style="display: none;">${escapeHtml(column.title)}</textarea>
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
                                ${currentBoard.columns.map(col => 
                                    col.id !== columnId ? 
                                    `<button class="donut-menu-item" onclick="moveTaskToColumn('${task.id}', '${columnId}', '${col.id}')">${escapeHtml(col.title)}</button>` : ''
                                ).join('')}
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
                <div class="task-title-container">
                    <div class="task-title-display markdown-content" 
                            data-task-id="${task.id}" 
                            data-column-id="${columnId}"
                            onclick="editTitle(this)">${renderedTitle || '<span class="task-title-placeholder">Add title...</span>'}</div>
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
    
    const saveTitle = () => {
        const newTitle = editElement.value.trim();
        if (newTitle) {
            vscode.postMessage({
                type: 'editColumnTitle',
                columnId: columnId,
                title: newTitle
            });
            
            const col = currentBoard.columns.find(c => c.id === columnId);
            if (col) {
                col.title = newTitle;
                titleElement.textContent = newTitle;
            }
        }
        
        titleElement.style.display = 'block';
        editElement.style.display = 'none';
        dragHandle.draggable = true;
    };
    
    const cancelEdit = () => {
        editElement.value = titleElement.textContent;
        titleElement.style.display = 'block';
        editElement.style.display = 'none';
        dragHandle.draggable = true;
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
    if (confirm('Are you sure you want to delete this column and all its tasks?')) {
        vscode.postMessage({
            type: 'deleteColumn',
            columnId: columnId
        });
        
        // Update local state for immediate feedback
        const columnIndex = currentBoard.columns.findIndex(c => c.id === columnId);
        if (columnIndex !== -1) {
            currentBoard.columns.splice(columnIndex, 1);
            renderBoard();
        }
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
    showInputModal(
        'Add Column',
        'Please enter column title:',
        'Enter column title...',
        title => {
            vscode.postMessage({
                type: 'addColumn',
                title: title
            });
        }
    );
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
    
    requestAnimationFrame(() => {
        const newScrollTop = taskItem.offsetTop - beforeEditOffset;
        scrollContainer.scrollTop = newScrollTop;
    });
    
    const saveAndHide = () => {
        const beforeSaveOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        saveTaskFieldAndUpdateDisplay(editTextarea);
        editTextarea.style.display = 'none';
        displayDiv.style.display = 'block';
        
        requestAnimationFrame(() => {
            const newScrollTop = taskItem.offsetTop - beforeSaveOffset;
            scrollContainer.scrollTop = newScrollTop;
        });
    };
    
    const cancelEdit = () => {
        const beforeCancelOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        editTextarea.style.display = 'none';
        displayDiv.style.display = 'block';
        
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
    
    requestAnimationFrame(() => {
        const newScrollTop = taskItem.offsetTop - beforeEditOffset;
        scrollContainer.scrollTop = newScrollTop;
    });
    
    const saveAndHide = () => {
        const beforeSaveOffset = taskItem.offsetTop - scrollContainer.scrollTop;
        
        saveTaskFieldAndUpdateDisplay(editTextarea);
        editTextarea.style.display = 'none';
        
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
    const value = textarea.value.trim();

    if (!taskId || !columnId || !field) return;

    const column = currentBoard?.columns.find(col => col.id === columnId);
    const task = column?.tasks.find(t => t.id === taskId);
    
    if (!task) return;

    task[field] = value;

    const taskItem = document.querySelector(`[data-task-id="${taskId}"]`);
    
    if (field === 'title') {
        const displayDiv = taskItem.querySelector('.task-title-display');
        if (value) {
            displayDiv.innerHTML = renderMarkdown(value);
        } else {
            displayDiv.innerHTML = '<span class="task-title-placeholder">Add title...</span>';
        }
    } else if (field === 'description') {
        const displayDiv = taskItem.querySelector('.task-description-display');
        const placeholder = taskItem.querySelector('.task-description-placeholder');
        
        if (value) {
            displayDiv.innerHTML = renderMarkdown(value);
            displayDiv.style.display = 'block';
            if (placeholder) placeholder.style.display = 'none';
        } else {
            displayDiv.style.display = 'none';
            if (placeholder) placeholder.style.display = 'block';
        }
    }

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

// Drag and drop setup
function setupDragAndDrop() {
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
            e.dataTransfer.setData('text/plain', taskItem.dataset.taskId);
            e.dataTransfer.setData('application/column-id', taskItem.dataset.columnId);
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
    if (!currentBoard) return -1;
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