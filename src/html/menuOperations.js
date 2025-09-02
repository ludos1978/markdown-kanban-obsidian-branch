// Track menu hover state to prevent premature closing
let menuHoverTimeout = null;

// Simple submenu positioning
function positionSubmenu(menuItem) {
    const submenu = menuItem.querySelector('.donut-menu-submenu, .file-bar-menu-submenu');
    if (!submenu) return;
    
    const rect = menuItem.getBoundingClientRect();
    const submenuWidth = 280; // Approximate max width
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;
    
    // Determine which side has more space
    if (spaceRight < submenuWidth && spaceLeft > submenuWidth) {
        // Not enough space on right, but enough on left
        submenu.style.left = 'auto';
        submenu.style.right = '100%';
    } else {
        // Enough space on right, or default behavior
        submenu.style.left = '100%';
        submenu.style.right = 'auto';
    }
}

// donut menu toggle that respects tag interactions
function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // If closing a menu with pending tag changes, flush them
    if (wasActive && pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
        flushPendingTagChanges();
    }
    
    // Clear any pending close timeout
    if (menuHoverTimeout) {
        clearTimeout(menuHoverTimeout);
        menuHoverTimeout = null;
    }
    
    // Close all other menus (and flush their changes if any)
    document.querySelectorAll('.donut-menu').forEach(m => {
        if (m !== menu && m.classList.contains('active')) {
            if (activeTagMenu === m && pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
                flushPendingTagChanges();
            }
            m.classList.remove('active');
        }
    });
    
    // Toggle this menu
    if (!wasActive) {
        menu.classList.add('active');
        activeTagMenu = menu;
        
        // Add hover listeners to keep menu open
        const dropdown = menu.querySelector('.donut-menu-dropdown');
        if (dropdown) {
            dropdown.onmouseenter = () => {
                if (menuHoverTimeout) {
                    clearTimeout(menuHoverTimeout);
                    menuHoverTimeout = null;
                }
            };
            
            dropdown.onmouseleave = (e) => {
                // Don't close if moving to a submenu
                const toElement = e.relatedTarget;
                if (toElement && toElement.closest('.donut-menu-dropdown') === dropdown) {
                    return;
                }
                
                // Delay closing to allow for submenu navigation
                menuHoverTimeout = setTimeout(() => {
                    if (pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
                        flushPendingTagChanges();
                    }
                    menu.classList.remove('active');
                    activeTagMenu = null;
                }, 300);
            };
        }
    } else {
        menu.classList.remove('active');
        activeTagMenu = null;
    }
}

function insertColumnBefore(columnId) {
    // Close any open menus first
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
    
    // Send message to insert empty column
    vscode.postMessage({
        type: 'insertColumnBefore',
        columnId: columnId,
        title: ''  // Empty title for new column
    });
}

function insertColumnAfter(columnId) {
    // Close any open menus first
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
    
    // Send message to insert empty column
    vscode.postMessage({
        type: 'insertColumnAfter',
        columnId: columnId,
        title: ''  // Empty title for new column
    });
}

function moveColumnLeft(columnId) {
    
    if (!currentBoard || !currentBoard.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index > 0) {
        // Get current row
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        
        console.log(`moveColumnLeft ${columnId}`);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId: columnId,
            newPosition: index - 1,
            newRow: currentRow // Keep same row when using menu
        });
    }
}

function moveColumnRight(columnId) {
    if (!currentBoard || !currentBoard.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index < currentBoard.columns.length - 1) {
        // Get current row
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        
        console.log(`moveColumnRight ${columnId}`);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId: columnId,
            newPosition: index + 1,
            newRow: currentRow // Keep same row when using menu
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
        if (task.description && task.description.trim()) {
            markdown += `\n${task.description}\n`;
        }
    });
    
    copyToClipboard(markdown);
    
    // Close all menus after copying
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
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
    if (task.description && task.description.trim()) {
        markdown += `\n${task.description}\n`;
    }
    
    copyToClipboard(markdown);
    
    // Close all menus after copying
    document.querySelectorAll('.donut-menu').forEach(menu => {
        menu.classList.remove('active');
    });
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

function addTaskAndUnfold(columnId) {
    // First, unfold the column if it's collapsed
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column && column.classList.contains('collapsed')) {
        toggleColumnCollapse(columnId);
    }
    
    // Then add the task
    addTask(columnId);
}

function addColumn(rowNumber) {
    // Default to row 1 if not specified
    const targetRow = rowNumber || 1;
    
    // Add row tag if not row 1
    let title = '';
    if (targetRow > 1) {
        title = `#row${targetRow}`;
    }
    
    vscode.postMessage({
        type: 'addColumn',
        title: title
    });
}

// Tag toggle operations - uses configured tags from VSCode settings
function toggleColumnTag(columnId, tagName, event) {
    // Prevent event from bubbling up
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag (preserve row tags at the end)
        const rowMatch = title.match(/(#row\d+)$/i);
        if (rowMatch) {
            // Insert before row tag
            const beforeRow = title.substring(0, title.length - rowMatch[0].length).trim();
            title = `${beforeRow} ${tagWithHash} ${rowMatch[0]}`;
        } else {
            // Append at end
            title = `${title} ${tagWithHash}`.trim();
        }
    }
    
    // Update local state immediately
    column.title = title;
    
    // Update visual display without re-render
    updateColumnDisplayImmediate(columnId, title, !wasActive, tagName);
    
    // Send update to backend with a delay to batch multiple toggles
    clearTimeout(window.columnTagUpdateTimeout);
    window.columnTagUpdateTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editColumnTitle',
            columnId: columnId,
            title: title
        });
    }, 500); // Wait 500ms before sending update
}

// Simplified toggleTaskTag that works immediately
function toggleTaskTag(taskId, columnId, tagName, event) {
    // Prevent event from bubbling up
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const task = column.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const tagWithHash = `#${tagName}`;
    let title = task.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag at the end
        title = `${title} ${tagWithHash}`.trim();
    }
    
    // Update local state immediately
    task.title = title;
    
    // Update visual display without re-render
    updateTaskDisplayImmediate(taskId, title, !wasActive, tagName);
    
    // Send update to backend with a delay to batch multiple toggles
    clearTimeout(window.taskTagUpdateTimeout);
    window.taskTagUpdateTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editTask',
            taskId: taskId,
            columnId: columnId,
            taskData: task
        });
    }, 500); // Wait 500ms before sending update
}

// Update column display immediately with visual feedback
function updateColumnDisplayImmediate(columnId, newTitle, isActive, tagName) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) return;
    
    // Update title display
    const titleElement = columnElement.querySelector('.column-title');
    if (titleElement) {
        const displayTitle = newTitle.replace(/#row\d+/gi, '').trim();
        const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
        const columnRow = getColumnRow(newTitle);
        const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
        titleElement.innerHTML = renderedTitle + rowIndicator;
    }
    
    // Update data attributes
    const firstTag = extractFirstTag(newTitle);
    if (firstTag) {
        columnElement.setAttribute('data-column-tag', firstTag);
    } else {
        columnElement.removeAttribute('data-column-tag');
    }
    
    const allTags = getActiveTagsInTitle(newTitle);
    if (allTags.length > 0) {
        columnElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        columnElement.removeAttribute('data-all-tags');
    }
    
    // Update the button visual state
    const button = document.querySelector(`.donut-menu-tag-chip[data-element-id="${columnId}"][data-tag-name="${tagName}"]`);
    if (button) {
        button.classList.toggle('active', isActive);
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isActive ? '✓' : '';
        }
        updateTagChipStyle(button, tagName, isActive);
    }
}

// Update task display immediately with visual feedback
function updateTaskDisplayImmediate(taskId, newTitle, isActive, tagName) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    // Update title display
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = newTitle ? renderMarkdown(newTitle) : '<span class="task-title-placeholder">Add title...</span>';
        titleElement.innerHTML = renderedTitle;
    }
    
    // Update data attributes
    const firstTag = extractFirstTag(newTitle);
    if (firstTag) {
        taskElement.setAttribute('data-task-tag', firstTag);
    } else {
        taskElement.removeAttribute('data-task-tag');
    }
    
    const allTags = getActiveTagsInTitle(newTitle);
    if (allTags.length > 0) {
        taskElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        taskElement.removeAttribute('data-all-tags');
    }
    
    // Update the button visual state
    const button = document.querySelector(`.donut-menu-tag-chip[data-element-id="${taskId}"][data-tag-name="${tagName}"]`);
    if (button) {
        button.classList.toggle('active', isActive);
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isActive ? '✓' : '';
        }
        updateTagChipStyle(button, tagName, isActive);
    }
}

// Helper function to update tag chip styling
function updateTagChipStyle(button, tagName, isActive) {
    const config = getTagConfig(tagName);
    const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                       document.body.classList.contains('vscode-high-contrast');
    
    let bgColor = '#666';
    let textColor = '#fff';
    
    if (config) {
        const themeKey = isDarkTheme ? 'dark' : 'light';
        const themeColors = config[themeKey] || config.light || {};
        bgColor = themeColors.background || '#666';
        textColor = themeColors.text || '#fff';
    } else {
        // Default colors for user-added tags
        if (isDarkTheme) {
            bgColor = '#555';
            textColor = '#ddd';
        } else {
            bgColor = '#999';
            textColor = '#fff';
        }
    }
    
    if (isActive) {
        button.style.backgroundColor = bgColor;
        button.style.color = textColor;
    } else {
        button.style.backgroundColor = 'transparent';
        button.style.color = 'inherit';
    }
}


// Update column display without re-rendering
function updateColumnDisplay(columnId, newTitle) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) return;
    
    const titleElement = columnElement.querySelector('.column-title');
    if (titleElement) {
        // Filter out row tags for display
        const displayTitle = newTitle.replace(/#row\d+/gi, '').trim();
        const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
        
        // Add row indicator if needed
        const columnRow = getColumnRow(newTitle);
        const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
        
        titleElement.innerHTML = renderedTitle + rowIndicator;
    }
    
    // Update data attributes for styling
    const firstTag = extractFirstTag(newTitle);
    if (firstTag) {
        columnElement.setAttribute('data-column-tag', firstTag);
    } else {
        columnElement.removeAttribute('data-column-tag');
    }
    
    // Update all tags attribute
    const allTags = getActiveTagsInTitle(newTitle);
    if (allTags.length > 0) {
        columnElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        columnElement.removeAttribute('data-all-tags');
    }
}

// Update task display without re-rendering
function updateTaskDisplay(taskId, columnId, taskData) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = taskData.title ? renderMarkdown(taskData.title) : '<span class="task-title-placeholder">Add title...</span>';
        titleElement.innerHTML = renderedTitle;
    }
    
    // Update data attributes for styling
    const firstTag = extractFirstTag(taskData.title);
    if (firstTag) {
        taskElement.setAttribute('data-task-tag', firstTag);
    } else {
        taskElement.removeAttribute('data-task-tag');
    }
    
    // Update all tags attribute
    const allTags = getActiveTagsInTitle(taskData.title);
    if (allTags.length > 0) {
        taskElement.setAttribute('data-all-tags', allTags.join(' '));
    } else {
        taskElement.removeAttribute('data-all-tags');
    }
}

// Send all pending tag changes to backend
function flushPendingTagChanges() {
    // Send column changes
    pendingTagChanges.columns.forEach((title, columnId) => {
        vscode.postMessage({
            type: 'editColumnTitle',
            columnId: columnId,
            title: title
        });
    });
    
    // Send task changes
    pendingTagChanges.tasks.forEach(({ columnId, taskData }, taskId) => {
        vscode.postMessage({
            type: 'editTask',
            taskId: taskId,
            columnId: columnId,
            taskData: taskData
        });
    });
    
    // Clear pending changes
    pendingTagChanges.columns.clear();
    pendingTagChanges.tasks.clear();
    activeTagMenu = null;
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

// Auto-resize helper
function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}


// Direct handlers for tag clicks that don't trigger re-render
function handleColumnTagClick(columnId, tagName, event) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag (preserve row tags at the end)
        const rowMatch = title.match(/(#row\d+)$/i);
        if (rowMatch) {
            const beforeRow = title.substring(0, title.length - rowMatch[0].length).trim();
            title = `${beforeRow} ${tagWithHash} ${rowMatch[0]}`;
        } else {
            title = `${title} ${tagWithHash}`.trim();
        }
    }
    
    // Update local state
    column.title = title;
    
    // Update button visual immediately
    const button = event.currentTarget || event.target.closest('.donut-menu-tag-chip');
    if (button) {
        const isNowActive = !wasActive;
        button.classList.toggle('active', isNowActive);
        
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isNowActive ? '✓' : '';
        }
        
        // Update colors
        const config = getTagConfig(tagName);
        const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                           document.body.classList.contains('vscode-high-contrast');
        
        let bgColor = '#666';
        let textColor = '#fff';
        
        if (config) {
            const themeKey = isDarkTheme ? 'dark' : 'light';
            const themeColors = config[themeKey] || config.light || {};
            bgColor = themeColors.background || '#666';
            textColor = themeColors.text || '#fff';
        } else {
            if (isDarkTheme) {
                bgColor = '#555';
                textColor = '#ddd';
            } else {
                bgColor = '#999';
                textColor = '#fff';
            }
        }
        
        if (isNowActive) {
            button.style.backgroundColor = bgColor;
            button.style.color = textColor;
        } else {
            button.style.backgroundColor = 'transparent';
            button.style.color = 'inherit';
        }
    }
    
    // Update column display
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (columnElement) {
        const titleElement = columnElement.querySelector('.column-title');
        if (titleElement) {
            const displayTitle = title.replace(/#row\d+/gi, '').trim();
            const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
            const columnRow = getColumnRow(title);
            const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
            titleElement.innerHTML = renderedTitle + rowIndicator;
        }
        
        // Update data attributes
        const firstTag = extractFirstTag(title);
        if (firstTag) {
            columnElement.setAttribute('data-column-tag', firstTag);
        } else {
            columnElement.removeAttribute('data-column-tag');
        }
        
        const allTags = getActiveTagsInTitle(title);
        if (allTags.length > 0) {
            columnElement.setAttribute('data-all-tags', allTags.join(' '));
        } else {
            columnElement.removeAttribute('data-all-tags');
        }
    }
    
    // Delay sending to backend
    clearTimeout(window.columnTagTimeout);
    window.columnTagTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editColumnTitle',
            columnId: columnId,
            title: title
        });
    }, 1000);
}

function handleTaskTagClick(taskId, columnId, tagName, event) {
    if (!currentBoard || !currentBoard.columns) return;
    
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const task = column.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const tagWithHash = `#${tagName}`;
    let title = task.title || '';
    
    // Check if this specific tag exists in the title (case-insensitive)
    const tagRegex = new RegExp(`#${tagName}\\b`, 'gi');
    const wasActive = tagRegex.test(title);
    
    if (wasActive) {
        // Remove the tag
        title = title.replace(tagRegex, '').replace(/\s+/g, ' ').trim();
    } else {
        // Add the tag at the end
        title = `${title} ${tagWithHash}`.trim();
    }
    
    // Update local state
    task.title = title;
    
    // Update button visual immediately
    const button = event.currentTarget || event.target.closest('.donut-menu-tag-chip');
    if (button) {
        const isNowActive = !wasActive;
        button.classList.toggle('active', isNowActive);
        
        const checkbox = button.querySelector('.tag-chip-check');
        if (checkbox) {
            checkbox.textContent = isNowActive ? '✓' : '';
        }
        
        // Update colors
        const config = getTagConfig(tagName);
        const isDarkTheme = document.body.classList.contains('vscode-dark') || 
                           document.body.classList.contains('vscode-high-contrast');
        
        let bgColor = '#666';
        let textColor = '#fff';
        
        if (config) {
            const themeKey = isDarkTheme ? 'dark' : 'light';
            const themeColors = config[themeKey] || config.light || {};
            bgColor = themeColors.background || '#666';
            textColor = themeColors.text || '#fff';
        } else {
            if (isDarkTheme) {
                bgColor = '#555';
                textColor = '#ddd';
            } else {
                bgColor = '#999';
                textColor = '#fff';
            }
        }
        
        if (isNowActive) {
            button.style.backgroundColor = bgColor;
            button.style.color = textColor;
        } else {
            button.style.backgroundColor = 'transparent';
            button.style.color = 'inherit';
        }
    }
    
    // Update task display
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (taskElement) {
        const titleElement = taskElement.querySelector('.task-title-display');
        if (titleElement) {
            const renderedTitle = title ? renderMarkdown(title) : '<span class="task-title-placeholder">Add title...</span>';
            titleElement.innerHTML = renderedTitle;
        }
        
        // Update data attributes
        const firstTag = extractFirstTag(title);
        if (firstTag) {
            taskElement.setAttribute('data-task-tag', firstTag);
        } else {
            taskElement.removeAttribute('data-task-tag');
        }
        
        const allTags = getActiveTagsInTitle(title);
        if (allTags.length > 0) {
            taskElement.setAttribute('data-all-tags', allTags.join(' '));
        } else {
            taskElement.removeAttribute('data-all-tags');
        }
    }
    
    // Delay sending to backend
    clearTimeout(window.taskTagTimeout);
    window.taskTagTimeout = setTimeout(() => {
        vscode.postMessage({
            type: 'editTask',
            taskId: taskId,
            columnId: columnId,
            taskData: task
        });
    }, 1000);
}

// Setup submenu positioning on hover
document.addEventListener('mouseover', (e) => {
    if (e.target.closest('.donut-menu-item.has-submenu, .file-bar-menu-item.has-submenu')) {
        positionSubmenu(e.target.closest('.donut-menu-item.has-submenu, .file-bar-menu-item.has-submenu'));
    }
}, true);

// Make handlers globally available
window.handleColumnTagClick = handleColumnTagClick;
window.handleTaskTagClick = handleTaskTagClick;
window.columnTagTimeout = null;
window.taskTagTimeout = null;
window.tagHandlers = window.tagHandlers || {};


window.toggleColumnTag = toggleColumnTag;
window.toggleTaskTag = toggleTaskTag;
window.updateTagChipStyle = updateTagChipStyle;
window.columnTagUpdateTimeout = null;
window.taskTagUpdateTimeout = null;