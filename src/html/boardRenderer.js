let scrollPositions = new Map();
let collapsedColumns = new Set();
let collapsedTasks = new Set();
let columnFoldStates = new Map(); // Track last manual fold state for each column
let globalColumnFoldState = 'fold-mixed'; // Track global column fold state
let currentBoard = null;
let renderTimeout = null;

// Debounced render function to prevent rapid re-renders
function debouncedRenderBoard() {
    if (renderTimeout) {
        clearTimeout(renderTimeout);
    }
    
    renderTimeout = setTimeout(() => {
        renderBoard();
        renderTimeout = null;
    }, 50);
}

// Global column folding functions
function getGlobalColumnFoldState() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) {
        return 'fold-mixed';
    }
    
    const collapsedCount = currentBoard.columns.filter(column => collapsedColumns.has(column.id)).length;
    const totalColumns = currentBoard.columns.length;
    
    if (collapsedCount === totalColumns) {
        return 'fold-collapsed'; // All folded
    } else if (collapsedCount === 0) {
        return 'fold-expanded'; // All expanded
    } else {
        // Mixed state - return last manual state or default
        return globalColumnFoldState || 'fold-mixed';
    }
}

function toggleAllColumns() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) return;
    
    const currentState = getGlobalColumnFoldState();
    const collapsedCount = currentBoard.columns.filter(column => collapsedColumns.has(column.id)).length;
    const totalColumns = currentBoard.columns.length;
    
    // Determine action based on current state
    let shouldCollapse;
    if (collapsedCount === totalColumns) {
        // All folded -> expand all
        shouldCollapse = false;
    } else if (collapsedCount === 0) {
        // All expanded -> collapse all
        shouldCollapse = true;
    } else {
        // Mixed state -> use opposite of last manual state, or default to collapse
        if (globalColumnFoldState === 'fold-collapsed') {
            shouldCollapse = false; // Was manually set to collapsed, so expand
        } else {
            shouldCollapse = true; // Default or was expanded, so collapse
        }
    }
    
    // Apply the action to all columns
    currentBoard.columns.forEach(column => {
        const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');
        
        if (shouldCollapse) {
            collapsedColumns.add(column.id);
            columnElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        } else {
            collapsedColumns.delete(column.id);
            columnElement?.classList.remove('collapsed');
            toggle?.classList.remove('rotated');
        }
    });
    
    // Remember this manual state
    globalColumnFoldState = shouldCollapse ? 'fold-collapsed' : 'fold-expanded';
    
    // Update the global fold button appearance
    updateGlobalColumnFoldButton();
}

function updateGlobalColumnFoldButton() {
    const globalFoldButton = document.getElementById('global-fold-btn');
    const globalFoldIcon = document.getElementById('global-fold-icon');
    
    if (!globalFoldButton || !globalFoldIcon) return;
    
    // Remove all state classes
    globalFoldButton.classList.remove('fold-collapsed', 'fold-expanded', 'fold-mixed');
    
    // Get current state
    const currentState = getGlobalColumnFoldState();
    globalFoldButton.classList.add(currentState);
    
    // Update icon and title
    if (currentState === 'fold-collapsed') {
        globalFoldIcon.textContent = '▶';
        globalFoldButton.title = 'Expand all columns';
    } else if (currentState === 'fold-expanded') {
        globalFoldIcon.textContent = '▼';
        globalFoldButton.title = 'Collapse all columns';
    } else {
        globalFoldIcon.textContent = '▽';
        globalFoldButton.title = 'Fold/unfold all columns';
    }
}

// Render Kanban board
function renderBoard() {
    console.log('Rendering board:', currentBoard);
    
    const boardElement = document.getElementById('kanban-board');
    if (!boardElement) {
        console.error('Board element not found');
        return;
    }

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

    // Update image sources after rendering
    setTimeout(() => {
        updateImageSources();
    }, 100);
    
    // Update global column fold button after rendering
    setTimeout(() => {
        updateGlobalColumnFoldButton();
    }, 10);
    
    setupDragAndDrop();
}

function getFoldAllButtonState(columnId) {
    if (!currentBoard || !currentBoard.columns) return 'fold-mixed';
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column || column.tasks.length === 0) return 'fold-mixed';
    
    const collapsedCount = column.tasks.filter(task => collapsedTasks.has(task.id)).length;
    const totalTasks = column.tasks.length;
    
    if (collapsedCount === totalTasks) {
        return 'fold-collapsed'; // All folded
    } else if (collapsedCount === 0) {
        return 'fold-expanded'; // All expanded
    } else {
        // Mixed state - use last manual state or default
        const lastState = columnFoldStates.get(columnId);
        return lastState || 'fold-mixed';
    }
}

function toggleAllTasksInColumn(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column || column.tasks.length === 0) return;
    
    const collapsedCount = column.tasks.filter(task => collapsedTasks.has(task.id)).length;
    const totalTasks = column.tasks.length;
    
    // Determine action based on current state
    let shouldCollapse;
    if (collapsedCount === totalTasks) {
        // All folded -> expand all
        shouldCollapse = false;
    } else if (collapsedCount === 0) {
        // All expanded -> collapse all
        shouldCollapse = true;
    } else {
        // Mixed state -> use opposite of last manual state, or default to collapse
        const lastState = columnFoldStates.get(columnId);
        if (lastState === 'fold-collapsed') {
            shouldCollapse = false; // Was manually set to collapsed, so expand
        } else {
            shouldCollapse = true; // Default or was expanded, so collapse
        }
    }
    
    // Apply the action to all tasks
    column.tasks.forEach(task => {
        const taskElement = document.querySelector(`[data-task-id="${task.id}"]`);
        const toggle = taskElement?.querySelector('.task-collapse-toggle');
        
        if (shouldCollapse) {
            collapsedTasks.add(task.id);
            taskElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        } else {
            collapsedTasks.delete(task.id);
            taskElement?.classList.remove('collapsed');
            toggle?.classList.remove('rotated');
        }
    });
    
    // Remember this manual state
    columnFoldStates.set(columnId, shouldCollapse ? 'fold-collapsed' : 'fold-expanded');
    
    // Update the fold button appearance
    updateFoldAllButton(columnId);
}

function updateFoldAllButton(columnId) {
    const foldButton = document.querySelector(`[data-column-id="${columnId}"] .fold-all-btn`);
    if (!foldButton) return;
    
    // Remove all state classes
    foldButton.classList.remove('fold-collapsed', 'fold-expanded', 'fold-mixed');
    
    // Add current state class
    const currentState = getFoldAllButtonState(columnId);
    foldButton.classList.add(currentState);
    
    // Update icon and title
    const icon = foldButton.querySelector('.fold-icon');
    if (icon) {
        if (currentState === 'fold-collapsed') {
            icon.textContent = '▶';
            foldButton.title = 'Expand all cards';
        } else if (currentState === 'fold-expanded') {
            icon.textContent = '▼';
            foldButton.title = 'Collapse all cards';
        } else {
            icon.textContent = '▽';
            foldButton.title = 'Fold/unfold all cards';
        }
    }
}

function createColumnElement(column, columnIndex) {
    if (!column) {
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
    const foldButtonState = getFoldAllButtonState(column.id);

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
                <button class="fold-all-btn ${foldButtonState}" onclick="toggleAllTasksInColumn('${column.id}')" title="Fold/unfold all cards">
                    <span class="fold-icon">${foldButtonState === 'fold-collapsed' ? '▶' : foldButtonState === 'fold-expanded' ? '▼' : '▽'}</span>
                </button>
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
    if (!task) {
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
                <span class="task-collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleTaskCollapse('${task.id}'); updateFoldAllButton('${columnId}')">▶</span>
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

function initializeFile() {
    vscode.postMessage({
        type: 'initializeFile'
    });
}

function updateImageSources() {
    // This function would handle updating image sources if needed
    // Currently handled by the backend processing
}

// Make toggle functions globally accessible
window.toggleAllColumns = toggleAllColumns;

// Simplified toggle functions
function toggleColumnCollapse(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    const toggle = column.querySelector('.collapse-toggle');
    
    column.classList.toggle('collapsed');
    toggle.classList.toggle('rotated');
    
    // Store state if needed
    if (column.classList.contains('collapsed')) {
        collapsedColumns.add(columnId);
    } else {
        collapsedColumns.delete(columnId);
    }
    
    // Update global fold button after individual column toggle
    setTimeout(() => {
        updateGlobalColumnFoldButton();
    }, 10);
}

function toggleTaskCollapse(taskId) {
    const task = document.querySelector(`[data-task-id="${taskId}"]`);
    const toggle = task.querySelector('.task-collapse-toggle');
    
    task.classList.toggle('collapsed');
    toggle.classList.toggle('rotated');
    
    // Store state if needed
    if (task.classList.contains('collapsed')) {
        collapsedTasks.add(taskId);
    } else {
        collapsedTasks.delete(taskId);
    }
}