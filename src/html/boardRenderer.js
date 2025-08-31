let scrollPositions = new Map();

// Make folding state variables global for persistence
window.collapsedColumns = window.collapsedColumns || new Set();
window.collapsedTasks = window.collapsedTasks || new Set();
window.columnFoldStates = window.columnFoldStates || new Map(); // Track last manual fold state for each column
window.globalColumnFoldState = window.globalColumnFoldState || 'fold-mixed'; // Track global column fold state

let currentBoard = null;
let renderTimeout = null;

// Helper function to extract first tag from text (excluding row tags)
function extractFirstTag(text) {
    if (!text) return null;
    // Match tags but exclude #rowN tags
    const tagMatch = text.match(/#(?!row\d+\b)([a-zA-Z0-9_-]+)/);
    const tag = tagMatch ? tagMatch[1].toLowerCase() : null;
    console.log(`Extracting tag from "${text}": ${tag}`);
    return tag;
}

// Helper function to convert hex to rgba
function hexToRgba(hex, alpha) {
    // Remove the # if present
    hex = hex.replace('#', '');
    
    // Parse the hex values
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Generate dynamic CSS for tag colors
function generateTagStyles() {
    if (!window.tagColors) {
        console.log('No tag colors configuration found');
        return '';
    }
    
    console.log('Generating tag styles with colors:', window.tagColors);
    
    const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                        document.body.classList.contains('vscode-high-contrast');
    const themeKey = isDarkTheme ? 'dark' : 'light';
    console.log(`Using theme: ${themeKey}`);
    
    let styles = '';
    
    for (const [tagName, colors] of Object.entries(window.tagColors)) {
        const themeColors = colors[themeKey] || colors.light || {};
        if (themeColors.text && themeColors.background) {
            const lowerTagName = tagName.toLowerCase();
            console.log(`Generating styles for tag "${lowerTagName}" with colors:`, themeColors);
            
            // Tag pill styles (the tag text itself)
            styles += `.kanban-tag[data-tag="${lowerTagName}"] {
                color: ${themeColors.text} !important;
                background-color: ${themeColors.background} !important;
                border: 1px solid ${themeColors.background};
            }\n`;
            
            // Column background styles - subtle tint
            styles += `.kanban-column[data-column-tag="${lowerTagName}"] {
                background-color: ${hexToRgba(themeColors.background, 0.15)} !important;
                border: 1px solid ${hexToRgba(themeColors.background, 0.4)} !important;
            }\n`;
            
            // Column collapsed state
            styles += `.kanban-column.collapsed[data-column-tag="${lowerTagName}"] {
                background-color: ${hexToRgba(themeColors.background, 0.2)} !important;
                border: 2px solid ${hexToRgba(themeColors.background, 0.6)} !important;
            }\n`;
            
            // Card background styles
            styles += `.task-item[data-task-tag="${lowerTagName}"] {
                background-color: ${hexToRgba(themeColors.background, 0.25)} !important;
                border: 1px solid ${hexToRgba(themeColors.background, 0.6)} !important;
            }\n`;
            
            // Card hover state
            styles += `.task-item[data-task-tag="${lowerTagName}"]:hover {
                background-color: ${hexToRgba(themeColors.background, 0.35)} !important;
                border: 1px solid ${hexToRgba(themeColors.background, 0.8)} !important;
            }\n`;
        }
    }
    
    console.log('Generated CSS length:', styles.length);
    return styles;
}

// Apply tag styles to the document
function applyTagStyles() {
    console.log('Applying tag styles...');
    
    // Remove existing dynamic styles
    const existingStyles = document.getElementById('dynamic-tag-styles');
    if (existingStyles) {
        existingStyles.remove();
        console.log('Removed existing styles');
    }
    
    // Generate new styles
    const styles = generateTagStyles();
    
    if (styles) {
        // Create and inject style element
        const styleElement = document.createElement('style');
        styleElement.id = 'dynamic-tag-styles';
        styleElement.textContent = styles;
        document.head.appendChild(styleElement);
        console.log('Tag styles applied successfully');
        
        // Debug: Check what columns have tags
        document.querySelectorAll('.kanban-column[data-column-tag]').forEach(col => {
            console.log('Column with tag:', col.getAttribute('data-column-tag'));
        });
    } else {
        console.log('No tag styles to apply');
    }
}



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
    
    // Count columns with tasks that are collapsed
    const columnsWithTasks = currentBoard.columns.filter(column => column.tasks && column.tasks.length > 0);
    const emptyColumns = currentBoard.columns.filter(column => !column.tasks || column.tasks.length === 0);
    
    if (columnsWithTasks.length === 0) {
        // All columns are empty - consider them as all folded
        return 'fold-collapsed';
    }
    
    const collapsedWithTasks = columnsWithTasks.filter(column => window.collapsedColumns.has(column.id)).length;
    const collapsedEmpty = emptyColumns.filter(column => window.collapsedColumns.has(column.id)).length;
    
    // If all columns with tasks are expanded and all empty columns are collapsed
    if (collapsedWithTasks === 0 && collapsedEmpty === emptyColumns.length) {
        return 'fold-expanded'; // This is the "expanded" state
    } else if (collapsedWithTasks === columnsWithTasks.length) {
        // All columns with tasks are collapsed
        return 'fold-collapsed';
    } else {
        // Mixed state - return last manual state or default
        return window.globalColumnFoldState || 'fold-mixed';
    }
}

function toggleAllColumns() {
    if (!currentBoard || !currentBoard.columns || currentBoard.columns.length === 0) return;
    
    // Ensure state variables are initialized
    if (!window.collapsedColumns) window.collapsedColumns = new Set();
    
    const currentState = getGlobalColumnFoldState();
    const collapsedCount = currentBoard.columns.filter(column => window.collapsedColumns.has(column.id)).length;
    const totalColumns = currentBoard.columns.length;
    
    // Determine action based on current state
    let shouldCollapse;
    if (collapsedCount === totalColumns) {
        // All folded -> expand all (except empty ones)
        shouldCollapse = false;
    } else if (collapsedCount === 0) {
        // All expanded -> collapse all
        shouldCollapse = true;
    } else {
        // Mixed state -> use opposite of last manual state, or default to collapse
        if (window.globalColumnFoldState === 'fold-collapsed') {
            shouldCollapse = false; // Was manually set to collapsed, so expand
        } else {
            shouldCollapse = true; // Default or was expanded, so collapse
        }
    }
    
    // Apply the action to all columns
    currentBoard.columns.forEach(column => {
        const columnElement = document.querySelector(`[data-column-id="${column.id}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');
        
        // Check if column has tasks
        const hasNoTasks = !column.tasks || column.tasks.length === 0;
        
        if (shouldCollapse) {
            // When collapsing, collapse all columns
            window.collapsedColumns.add(column.id);
            columnElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        } else {
            // When expanding, only expand columns with tasks
            if (hasNoTasks) {
                // Keep empty columns collapsed
                window.collapsedColumns.add(column.id);
                columnElement?.classList.add('collapsed');
                toggle?.classList.add('rotated');
            } else {
                // Expand columns with tasks
                window.collapsedColumns.delete(column.id);
                columnElement?.classList.remove('collapsed');
                toggle?.classList.remove('rotated');
            }
        }
    });
    
    // Remember this manual state
    window.globalColumnFoldState = shouldCollapse ? 'fold-collapsed' : 'fold-expanded';
    
    // Update the global fold button appearance
    updateGlobalColumnFoldButton();
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
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

// Apply saved or default folding states to rendered elements
function applyFoldingStates() {
    console.log('Applying folding states to rendered elements');
    
    // Ensure folding state variables are initialized
    if (!window.collapsedColumns) window.collapsedColumns = new Set();
    if (!window.collapsedTasks) window.collapsedTasks = new Set();
    if (!window.columnFoldStates) window.columnFoldStates = new Map();
    
    // Apply column folding states
    window.collapsedColumns.forEach(columnId => {
        const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
        const toggle = columnElement?.querySelector('.collapse-toggle');
        
        if (columnElement) {
            columnElement.classList.add('collapsed');
            if (toggle) toggle.classList.add('rotated');
            console.log(`Applied collapsed state to column: ${columnId}`);
        }
    });
    
    // Apply task folding states
    window.collapsedTasks.forEach(taskId => {
        const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
        const toggle = taskElement?.querySelector('.task-collapse-toggle');
        
        if (taskElement) {
            taskElement.classList.add('collapsed');
            if (toggle) toggle.classList.add('rotated');
            console.log(`Applied collapsed state to task: ${taskId}`);
        }
    });
    
    // Update fold all buttons for each column
    if (currentBoard && currentBoard.columns) {
        currentBoard.columns.forEach(column => {
            updateFoldAllButton(column.id);
        });
    }
    
    // Update global fold button
    updateGlobalColumnFoldButton();
}

// Render Kanban board
function renderBoard() {
    console.log('Rendering board:', currentBoard);
    
    // Apply tag styles first
    applyTagStyles();
    
    // Check if we're currently editing - if so, skip the render
    if (window.taskEditor && window.taskEditor.currentEditor) {
        console.log('Skipping render - currently editing');
        return;
    }
    
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

    // Detect number of rows from the board
    const detectedRows = detectRowsFromBoard(currentBoard);
    const numRows = Math.max(currentLayoutRows, detectedRows);
    
    // Apply multi-row class if needed
    if (numRows > 1) {
        boardElement.classList.add('multi-row');
        
        // Create row containers
        for (let row = 1; row <= numRows; row++) {
            const rowContainer = document.createElement('div');
            rowContainer.className = 'kanban-row';
            rowContainer.setAttribute('data-row-number', row);
            
            // Add row header
            // const rowHeader = document.createElement('div');
            // rowHeader.className = 'kanban-row-header';
            // rowHeader.textContent = `Row ${row}`;
            // rowContainer.appendChild(rowHeader);
            
            // Add columns for this row
            currentBoard.columns.forEach((column, index) => {
                const columnRow = getColumnRow(column.title);
                if (columnRow === row) {
                    const columnElement = createColumnElement(column, index);
                    rowContainer.appendChild(columnElement);
                }
            });
            
            // Add the "Add Column" button to each row
            const addColumnBtn = document.createElement('button');
            addColumnBtn.className = 'add-column-btn multi-row-add-btn'; // Add the multi-row-add-btn class
            addColumnBtn.textContent = '+ Add Column';
            addColumnBtn.onclick = () => addColumn(row);
            rowContainer.appendChild(addColumnBtn);    

            // Add a drop zone spacer that fills remaining horizontal space
            const dropZoneSpacer = document.createElement('div');
            dropZoneSpacer.className = 'row-drop-zone-spacer';
            rowContainer.appendChild(dropZoneSpacer);
            
            boardElement.appendChild(rowContainer);
        }
    } else {
        // Single row layout (existing behavior)
        boardElement.classList.remove('multi-row');
        
        currentBoard.columns.forEach((column, index) => {
            const columnElement = createColumnElement(column, index);
            boardElement.appendChild(columnElement);
        });

        const addColumnBtn = document.createElement('button');
        addColumnBtn.className = 'add-column-btn';
        addColumnBtn.textContent = '+ Add Column';
        addColumnBtn.onclick = () => addColumn(1); // Default to row 1 for single row layout
        boardElement.appendChild(addColumnBtn);
    }

    // Apply folding states after rendering
    setTimeout(() => {
        applyFoldingStates();
        
        // Restore scroll positions
        scrollPositions.forEach((scrollTop, columnId) => {
            const container = document.getElementById(`tasks-${columnId}`);
            if (container) {
                container.scrollTop = scrollTop;
            }
        });
        
        // Update image sources after rendering
        updateImageSources();
    }, 10);
    
    setupDragAndDrop();
}

function getFoldAllButtonState(columnId) {
    if (!currentBoard || !currentBoard.columns) return 'fold-mixed';
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column || column.tasks.length === 0) return 'fold-mixed';
    
    const collapsedCount = column.tasks.filter(task => window.collapsedTasks.has(task.id)).length;
    const totalTasks = column.tasks.length;
    
    if (collapsedCount === totalTasks) {
        return 'fold-collapsed'; // All folded
    } else if (collapsedCount === 0) {
        return 'fold-expanded'; // All expanded
    } else {
        // Mixed state - use last manual state or default
        const lastState = window.columnFoldStates.get(columnId);
        return lastState || 'fold-mixed';
    }
}

function toggleAllTasksInColumn(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    
    // Ensure state variables are initialized
    if (!window.collapsedTasks) window.collapsedTasks = new Set();
    if (!window.columnFoldStates) window.columnFoldStates = new Map();
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column || column.tasks.length === 0) return;
    
    const collapsedCount = column.tasks.filter(task => window.collapsedTasks.has(task.id)).length;
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
        const lastState = window.columnFoldStates.get(columnId);
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
            window.collapsedTasks.add(task.id);
            taskElement?.classList.add('collapsed');
            toggle?.classList.add('rotated');
        } else {
            window.collapsedTasks.delete(task.id);
            taskElement?.classList.remove('collapsed');
            toggle?.classList.remove('rotated');
        }
    });
    
    // Remember this manual state
    window.columnFoldStates.set(columnId, shouldCollapse ? 'fold-collapsed' : 'fold-expanded');
    
    // Update the fold button appearance
    updateFoldAllButton(columnId);
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
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

    // Extract tag from column title BEFORE rendering markdown
    const columnTag = extractFirstTag(column.title);
    console.log(`Creating column "${column.title}", detected tag: "${columnTag}"`);
    
    // Extract row from column title (defaults to 1 if no row tag)
    const columnRow = getColumnRow(column.title);

    const columnDiv = document.createElement('div');
    const isCollapsed = window.collapsedColumns.has(column.id);
    
    columnDiv.className = `kanban-column ${isCollapsed ? 'collapsed' : ''}`;
    columnDiv.setAttribute('data-column-id', column.id);
    columnDiv.setAttribute('data-column-index', columnIndex);
    columnDiv.setAttribute('data-row', columnRow);
    
    // Add tag attribute if tag exists (but not for row tags)
    if (columnTag && !columnTag.startsWith('row')) {
        columnDiv.setAttribute('data-column-tag', columnTag);
        console.log(`Set data-column-tag="${columnTag}" on column element`);
    }

    // Filter out row tags from displayed title
    const displayTitle = column.title ? column.title.replace(/#row\d+/gi, '').trim() : '';
    const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
    const foldButtonState = getFoldAllButtonState(column.id);

    // Only show row indicator for rows 2, 3, 4 if configuration allows (not row 1)
    const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';

    columnDiv.innerHTML = `
        <div class="column-header">
            <div class="column-title-section">
                <span class="drag-handle column-drag-handle" draggable="true">⋮⋮</span>
                <span class="collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleColumnCollapse('${column.id}')">▶</span>
                <div style="display: inline-block;">
                    <div class="column-title" onclick="handleColumnTitleClick(event, '${column.id}')">${renderedTitle}${rowIndicator}</div>
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
                <button class="collapsed-add-task-btn" onclick="addTaskAndUnfold('${column.id}')" title="Add task and unfold column">+</button>
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
    const isCollapsed = window.collapsedTasks.has(task.id);
    
    // Extract tag from task title
    const taskTag = extractFirstTag(task.title);
    const tagAttribute = taskTag ? ` data-task-tag="${taskTag}"` : '';
    
    return `
        <div class="task-item ${isCollapsed ? 'collapsed' : ''}" data-task-id="${task.id}" data-column-id="${columnId}" data-task-index="${taskIndex}"${tagAttribute}>
            <div class="task-header">
                <div class="task-drag-handle" title="Drag to move task">⋮⋮</div>
                <span class="task-collapse-toggle ${isCollapsed ? 'rotated' : ''}" onclick="toggleTaskCollapse('${task.id}'); updateFoldAllButton('${columnId}')">▶</span>
                <div class="task-title-container" onclick="handleTaskTitleClick(event, this, '${task.id}', '${columnId}')">
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
            </div>

            <div class="task-description-container">
                <div class="task-description-display markdown-content" 
                        data-task-id="${task.id}" 
                        data-column-id="${columnId}"
                        onclick="handleDescriptionClick(event, this)"
                        style="${task.description ? '' : 'display: none;'}">${renderedDescription}</div>
                <textarea class="task-description-edit" 
                            data-task-id="${task.id}" 
                            data-column-id="${columnId}"
                            data-field="description"
                            placeholder="Add description (Markdown supported)..."
                            style="display: none;">${escapeHtml(task.description || '')}</textarea>
                ${!task.description ? `<div class="task-description-placeholder" onclick="handleDescriptionClick(event, this, '${task.id}', '${columnId}')">Add description...</div>` : ''}
            </div>
        </div>
    `;
}

// Update tag styles when theme changes
function updateTagStylesForTheme() {
    console.log('Theme changed, updating tag styles');
    applyTagStyles();
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
    
    // Ensure state variables are initialized
    if (!window.collapsedColumns) window.collapsedColumns = new Set();
    
    // Store state
    if (column.classList.contains('collapsed')) {
        window.collapsedColumns.add(columnId);
    } else {
        window.collapsedColumns.delete(columnId);
    }
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
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
    
    // Ensure state variables are initialized
    if (!window.collapsedTasks) window.collapsedTasks = new Set();
    
    // Store state
    if (task.classList.contains('collapsed')) {
        window.collapsedTasks.add(taskId);
    } else {
        window.collapsedTasks.delete(taskId);
    }
    
    // Save state immediately
    if (window.saveCurrentFoldingState) {
        window.saveCurrentFoldingState();
    }
}

// Global click handlers that check for Alt key
function handleColumnTitleClick(event, columnId) {
    const target = event.target;
    const link = target.closest('a');
    const img = target.closest('img');
    const wikiLink = target.closest('.wiki-link');
    
    // Handle wiki links
    if (wikiLink) {
        event.preventDefault();
        event.stopPropagation();
        const documentName = wikiLink.getAttribute('data-document');
        if (documentName) {
            console.log('Column title - Opening wiki link:', documentName);
            vscode.postMessage({
                type: 'openWikiLink',
                documentName: documentName
            });
        }
        return;
    }
    
    // Handle regular links
    if (link) {
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute('data-original-href') || link.getAttribute('href');
        if (href && href !== '#') {
            console.log('Column title - Opening link:', href);
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
        }
        return;
    }
    
    // Handle images
    if (img) {
        event.preventDefault();
        event.stopPropagation();
        const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src');
        if (originalSrc && !originalSrc.startsWith('data:')) {
            console.log('Column title - Opening image:', originalSrc);
            vscode.postMessage({
                type: 'openFileLink',
                href: originalSrc
            });
        }
        return;
    }
    
    // If Alt key is pressed, don't edit
    if (event.altKey) {
        return;
    }
    
    // Otherwise, start editing
    event.stopPropagation();
    editColumnTitle(columnId);
}

function handleTaskTitleClick(event, element, taskId, columnId) {
    const target = event.target;
    const link = target.closest('a');
    const img = target.closest('img');
    const wikiLink = target.closest('.wiki-link');
    
    // Handle wiki links
    if (wikiLink) {
        event.preventDefault();
        event.stopPropagation();
        const documentName = wikiLink.getAttribute('data-document');
        if (documentName) {
            console.log('Task title - Opening wiki link:', documentName);
            vscode.postMessage({
                type: 'openWikiLink',
                documentName: documentName
            });
        }
        return;
    }
    
    // Handle regular links
    if (link) {
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute('data-original-href') || link.getAttribute('href');
        if (href && href !== '#') {
            console.log('Task title - Opening link:', href);
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
        }
        return;
    }
    
    // Handle images
    if (img) {
        event.preventDefault();
        event.stopPropagation();
        const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src');
        if (originalSrc && !originalSrc.startsWith('data:')) {
            console.log('Task title - Opening image:', originalSrc);
            vscode.postMessage({
                type: 'openFileLink',
                href: originalSrc
            });
        }
        return;
    }
    
    // If Alt key is pressed, don't edit
    if (event.altKey) {
        return;
    }
    
    // Otherwise, start editing
    event.stopPropagation();
    editTitle(element, taskId, columnId);
}

function handleDescriptionClick(event, element, taskId, columnId) {
    const target = event.target;
    const link = target.closest('a');
    const img = target.closest('img');
    const wikiLink = target.closest('.wiki-link');
    
    // Handle wiki links
    if (wikiLink) {
        event.preventDefault();
        event.stopPropagation();
        const documentName = wikiLink.getAttribute('data-document');
        if (documentName) {
            console.log('Description - Opening wiki link:', documentName);
            vscode.postMessage({
                type: 'openWikiLink',
                documentName: documentName
            });
        }
        return;
    }
    
    // Handle regular links
    if (link) {
        event.preventDefault();
        event.stopPropagation();
        const href = link.getAttribute('data-original-href') || link.getAttribute('href');
        if (href && href !== '#') {
            console.log('Description - Opening link:', href);
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
        }
        return;
    }
    
    // Handle images
    if (img) {
        event.preventDefault();
        event.stopPropagation();
        const originalSrc = img.getAttribute('data-original-src') || img.getAttribute('src');
        if (originalSrc && !originalSrc.startsWith('data:')) {
            console.log('Description - Opening image:', originalSrc);
            vscode.postMessage({
                type: 'openFileLink',
                href: originalSrc
            });
        }
        return;
    }
    
    // If Alt key is pressed, don't edit
    if (event.altKey) {
        return;
    }
    
    // Otherwise, start editing
    event.stopPropagation();
    if (taskId && columnId) {
        editDescription(element, taskId, columnId);
    } else {
        editDescription(element);
    }
}

// Make functions globally available
window.handleColumnTitleClick = handleColumnTitleClick;
window.handleTaskTitleClick = handleTaskTitleClick;
window.handleDescriptionClick = handleDescriptionClick;