// Unified Menu System - Simple and DRY
console.log('Unified menu system loading...');

// Global state
let activeTagMenu = null;
let pendingTagChanges = {
    columns: new Map(),
    tasks: new Map()
};

// Simple Menu Manager - handles all menu types
class SimpleMenuManager {
    constructor() {
        this.activeSubmenu = null;
        this.hideTimeout = null;
    }

    // Simple button click handler - works for all button types
    handleButtonClick(button, shouldCloseMenu = true) {
        console.log('Button clicked:', button.textContent.trim());
        
        // Get onclick attribute and execute it
        const onclick = button.getAttribute('onclick');
        if (onclick) {
            try {
                // Simple eval - direct and reliable
                eval(onclick);
                console.log('✅ Executed:', onclick);
            } catch (error) {
                console.error('Failed to execute:', onclick, error);
            }
        }
        
        // Close submenu if requested
        if (shouldCloseMenu) {
            setTimeout(() => this.hideSubmenu(), 100);
        }
    }

    // Show submenu - unified approach
    showSubmenu(menuItem, id, type, columnId = null) {
        this.hideSubmenu(); // Clear any existing

        const submenu = document.createElement('div');
        submenu.className = 'donut-menu-submenu dynamic-submenu';
        
        // Create content based on submenu type
        submenu.innerHTML = this.createSubmenuContent(menuItem, id, type, columnId);
        
        // Style and position
        submenu.style.cssText = `
            position: fixed;
            z-index: 100000;
            pointer-events: all;
            visibility: hidden;
            display: flex;
        `;
        
        menuItem.appendChild(submenu);
        this.setupSubmenuEvents(submenu);
        this.activeSubmenu = submenu;
        
        return submenu;
    }

    // Create submenu content - simplified
    createSubmenuContent(menuItem, id, type, columnId) {
        const submenuType = menuItem.dataset.submenuType;
        
        switch (submenuType) {
            case 'tags':
                return this.createTagContent(menuItem.dataset.group, id, type, columnId);
            case 'move':
                return `
                    <button class="donut-menu-item" onclick="moveTaskToTop('${id}', '${columnId}')">Top</button>
                    <button class="donut-menu-item" onclick="moveTaskUp('${id}', '${columnId}')">Up</button>
                    <button class="donut-menu-item" onclick="moveTaskDown('${id}', '${columnId}')">Down</button>
                    <button class="donut-menu-item" onclick="moveTaskToBottom('${id}', '${columnId}')">Bottom</button>
                `;
            case 'move-to-list':
                return this.createMoveToListContent(id, columnId);
            case 'sort':
                return `
                    <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'unsorted')">Unsorted</button>
                    <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'title')">Sort by title</button>
                `;
            default:
                return '';
        }
    }

    // Create tag content - simplified
    createTagContent(group, id, type, columnId) {
        if (window.generateGroupTagItems) {
            const tagConfig = window.tagColors || {};
            let tags = [];
            
            if (group === 'custom') {
                tags = window.getUserAddedTags ? window.getUserAddedTags() : [];
            } else {
                const groupValue = tagConfig[group];
                if (groupValue && typeof groupValue === 'object') {
                    if (groupValue.light || groupValue.dark) {
                        tags = [group];
                    } else {
                        tags = Object.keys(groupValue).filter(key => {
                            const val = groupValue[key];
                            return val && typeof val === 'object' && (val.light || val.dark);
                        });
                    }
                }
            }
            
            return window.generateGroupTagItems(tags, id, type, columnId, group !== 'custom');
        }
        return '<div>No tags available</div>';
    }

    // Create move to list content
    createMoveToListContent(taskId, columnId) {
        const currentBoard = window.currentBoard;
        if (!currentBoard?.columns) return '';
        
        return currentBoard.columns
            .filter(col => col.id !== columnId)
            .map(col => `<button class="donut-menu-item" onclick="moveTaskToColumn('${taskId}', '${columnId}', '${col.id}')">${window.escapeHtml ? window.escapeHtml(col.title || 'Untitled') : col.title || 'Untitled'}</button>`)
            .join('');
    }

    // Setup submenu events - unified approach
    setupSubmenuEvents(submenu) {
        // Add click handlers to all buttons
        submenu.querySelectorAll('button').forEach(button => {
            button.addEventListener('click', (e) => {
                e.stopPropagation();
                
                // Tag chips don't close menu, others do
                const shouldClose = !button.classList.contains('donut-menu-tag-chip');
                this.handleButtonClick(button, shouldClose);
            });
        });

        // Hover management
        submenu.addEventListener('mouseenter', () => this.clearTimeout());
        submenu.addEventListener('mouseleave', () => this.startHideTimer());
    }

    // Simple positioning with minimal gap for easy mouse movement
    positionSubmenu(menuItem, submenu) {
        const rect = menuItem.getBoundingClientRect();
        // Reduce gap from 8px to 2px for easier mouse movement
        const left = Math.min(rect.right - 1, window.innerWidth - 300);
        // Align top exactly with menu item for seamless transition
        const top = Math.min(rect.top, window.innerHeight - 200);
        
        submenu.style.left = left + 'px';
        submenu.style.top = top + 'px';
        submenu.style.visibility = 'visible';
    }

    // Timeout management
    startHideTimer() {
        this.clearTimeout();
        this.hideTimeout = setTimeout(() => this.hideSubmenu(), 300);
    }

    clearTimeout() {
        if (this.hideTimeout) {
            clearTimeout(this.hideTimeout);
            this.hideTimeout = null;
        }
    }

    // Hide submenu
    hideSubmenu() {
        this.clearTimeout();
        if (this.activeSubmenu) {
            this.activeSubmenu.remove();
            this.activeSubmenu = null;
        }
        document.querySelectorAll('.dynamic-submenu').forEach(s => s.remove());
    }
}

// Global menu manager instance
window.menuManager = new SimpleMenuManager();

// Simplified donut menu toggle
function toggleDonutMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    // Close all menus
    document.querySelectorAll('.donut-menu, .file-bar-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    if (!wasActive) {
        menu.classList.add('active');
        activeTagMenu = menu;
        
        const dropdown = menu.querySelector('.donut-menu-dropdown');
        if (dropdown) {
            positionDropdown(button, dropdown);
            setupMenuHoverHandlers(menu, dropdown);
        }
    }
}

// Setup hover handlers for menu items
function setupMenuHoverHandlers(menu, dropdown) {
    dropdown.querySelectorAll('.donut-menu-item.has-submenu').forEach(menuItem => {
        menuItem.addEventListener('mouseenter', () => {
            window.menuManager.clearTimeout();
            
            const submenu = window.menuManager.showSubmenu(
                menuItem, 
                menuItem.dataset.id, 
                menuItem.dataset.type, 
                menuItem.dataset.columnId
            );
            
            if (submenu) {
                window.menuManager.positionSubmenu(menuItem, submenu);
            }
        });
        
        menuItem.addEventListener('mouseleave', () => {
            window.menuManager.startHideTimer();
        });
    });
    
    // Menu-level hover handlers
    dropdown.addEventListener('mouseenter', () => window.menuManager.clearTimeout());
    dropdown.addEventListener('mouseleave', () => {
        setTimeout(() => {
            if (pendingTagChanges.columns.size + pendingTagChanges.tasks.size > 0) {
                flushPendingTagChanges();
            }
            menu.classList.remove('active');
            activeTagMenu = null;
        }, 400);
    });
}

// Simple dropdown positioning
function positionDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let left = rect.right - 180;
    let top = rect.bottom + 5;
    
    if (left < 10) left = 10;
    if (left + 180 > viewportWidth - 10) left = viewportWidth - 190;
    if (top + 300 > viewportHeight - 10) top = rect.top - 300;
    if (top < 10) top = 10;
    
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
}

// File bar menu toggle (similar pattern)
function toggleFileBarMenu(event, button) {
    event.stopPropagation();
    const menu = button.parentElement;
    const wasActive = menu.classList.contains('active');
    
    document.querySelectorAll('.file-bar-menu, .donut-menu').forEach(m => {
        m.classList.remove('active');
    });
    
    if (!wasActive) {
        menu.classList.add('active');
        const dropdown = menu.querySelector('.file-bar-menu-dropdown');
        if (dropdown) {
            positionFileBarDropdown(button, dropdown);
        }
    }
}

function positionFileBarDropdown(triggerButton, dropdown) {
    const rect = triggerButton.getBoundingClientRect();
    const left = Math.max(10, rect.right - 200);
    const top = rect.bottom + 4;
    
    dropdown.style.left = left + 'px';
    dropdown.style.top = top + 'px';
}

// Column operations - keep existing functions
function insertColumnBefore(columnId) {
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
    vscode.postMessage({ type: 'insertColumnBefore', columnId, title: '' });
}

function insertColumnAfter(columnId) {
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
    vscode.postMessage({ type: 'insertColumnAfter', columnId, title: '' });
}

function moveColumnLeft(columnId) {
    if (!currentBoard?.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index > 0) {
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId,
            newPosition: index - 1,
            newRow: currentRow
        });
    }
}

function moveColumnRight(columnId) {
    if (!currentBoard?.columns) return;
    const index = currentBoard.columns.findIndex(c => c.id === columnId);
    if (index < currentBoard.columns.length - 1) {
        const column = currentBoard.columns[index];
        const currentRow = getColumnRow(column.title);
        vscode.postMessage({
            type: 'moveColumnWithRowUpdate',
            columnId,
            newPosition: index + 1,
            newRow: currentRow
        });
    }
}

function deleteColumn(columnId) {
    vscode.postMessage({ type: 'deleteColumn', columnId });
}

function sortColumn(columnId, sortType) {
    vscode.postMessage({ type: 'sortColumn', columnId, sortType });
}

// Copy operations
function copyColumnAsMarkdown(columnId) {
    if (!currentBoard?.columns) return;
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    let markdown = `# ${column.title}\n`;
    column.tasks.forEach(task => {
        markdown += task.title.startsWith('#') ? 
            `\n---\n\n${task.title || ''}\n` : 
            `\n---\n\n## ${task.title || ''}\n`;
        if (task.description?.trim()) {
            markdown += `\n${task.description}\n`;
        }
    });
    
    copyToClipboard(markdown);
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
}

function copyTaskAsMarkdown(taskId, columnId) {
    if (!currentBoard?.columns) return;
    const column = currentBoard.columns.find(c => c.id === columnId);
    const task = column?.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    let markdown = task.title.startsWith('#') ? 
        `${task.title || ''}\n` : 
        `## ${task.title || ''}\n`;
    if (task.description?.trim()) {
        markdown += `\n${task.description}\n`;
    }
    
    copyToClipboard(markdown);
    document.querySelectorAll('.donut-menu').forEach(menu => menu.classList.remove('active'));
}

function copyToClipboard(text) {
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => {
            vscode.postMessage({ type: 'showMessage', text: 'Copied to clipboard!' });
        }).catch(err => console.error('Failed to copy:', err));
    }
}

// Task operations
function duplicateTask(taskId, columnId) {
    vscode.postMessage({ type: 'duplicateTask', taskId, columnId });
}

function insertTaskBefore(taskId, columnId) {
    vscode.postMessage({ type: 'insertTaskBefore', taskId, columnId });
}

function insertTaskAfter(taskId, columnId) {
    vscode.postMessage({ type: 'insertTaskAfter', taskId, columnId });
}

function moveTaskToTop(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskToTop', taskId, columnId });
}

function moveTaskUp(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskUp', taskId, columnId });
}

function moveTaskDown(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskDown', taskId, columnId });
}

function moveTaskToBottom(taskId, columnId) {
    vscode.postMessage({ type: 'moveTaskToBottom', taskId, columnId });
}

function moveTaskToColumn(taskId, fromColumnId, toColumnId) {
    vscode.postMessage({ type: 'moveTaskToColumn', taskId, fromColumnId, toColumnId });
}

function deleteTask(taskId, columnId) {
    vscode.postMessage({ type: 'deleteTask', taskId, columnId });
}

function addTask(columnId) {
    vscode.postMessage({
        type: 'addTask',
        columnId,
        taskData: { title: '', description: '' }
    });
}

function addTaskAndUnfold(columnId) {
    const column = document.querySelector(`[data-column-id="${columnId}"]`);
    if (column?.classList.contains('collapsed')) {
        toggleColumnCollapse(columnId);
    }
    addTask(columnId);
}

function addColumn(rowNumber) {
    const title = (rowNumber && rowNumber > 1) ? `#row${rowNumber}` : '';
    vscode.postMessage({ type: 'addColumn', title });
}

// Tag operations - simplified
function toggleColumnTag(columnId, tagName, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentBoard?.columns) return;
    const column = currentBoard.columns.find(c => c.id === columnId);
    if (!column) return;
    
    const tagWithHash = `#${tagName}`;
    let title = column.title || '';
    const wasActive = new RegExp(`#${tagName}\\b`, 'gi').test(title);
    
    if (wasActive) {
        title = title.replace(new RegExp(`#${tagName}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim();
    } else {
        const rowMatch = title.match(/(#row\d+)$/i);
        if (rowMatch) {
            const beforeRow = title.substring(0, title.length - rowMatch[0].length).trim();
            title = `${beforeRow} ${tagWithHash} ${rowMatch[0]}`;
        } else {
            title = `${title} ${tagWithHash}`.trim();
        }
    }
    
    column.title = title;
    updateColumnDisplayImmediate(columnId, title, !wasActive, tagName);
    
    clearTimeout(window.columnTagUpdateTimeout);
    window.columnTagUpdateTimeout = setTimeout(() => {
        vscode.postMessage({ type: 'editColumnTitle', columnId, title });
    }, 500);
}

function toggleTaskTag(taskId, columnId, tagName, event) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    if (!currentBoard?.columns) return;
    const column = currentBoard.columns.find(c => c.id === columnId);
    const task = column?.tasks.find(t => t.id === taskId);
    if (!task) return;
    
    const tagWithHash = `#${tagName}`;
    let title = task.title || '';
    const wasActive = new RegExp(`#${tagName}\\b`, 'gi').test(title);
    
    if (wasActive) {
        title = title.replace(new RegExp(`#${tagName}\\b`, 'gi'), '').replace(/\s+/g, ' ').trim();
    } else {
        title = `${title} ${tagWithHash}`.trim();
    }
    
    task.title = title;
    updateTaskDisplayImmediate(taskId, title, !wasActive, tagName);
    
    clearTimeout(window.taskTagUpdateTimeout);
    window.taskTagUpdateTimeout = setTimeout(() => {
        vscode.postMessage({ type: 'editTask', taskId, columnId, taskData: task });
    }, 500);
}

// Keep existing display update functions
function updateColumnDisplayImmediate(columnId, newTitle, isActive, tagName) {
    const columnElement = document.querySelector(`[data-column-id="${columnId}"]`);
    if (!columnElement) return;
    
    const titleElement = columnElement.querySelector('.column-title');
    if (titleElement) {
        const displayTitle = newTitle.replace(/#row\d+/gi, '').trim();
        const renderedTitle = displayTitle ? renderMarkdown(displayTitle) : '<span class="task-title-placeholder">Add title...</span>';
        const columnRow = getColumnRow(newTitle);
        const rowIndicator = (window.showRowTags && columnRow > 1) ? `<span class="column-row-tag">Row ${columnRow}</span>` : '';
        titleElement.innerHTML = renderedTitle + rowIndicator;
    }
    
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

function updateTaskDisplayImmediate(taskId, newTitle, isActive, tagName) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) return;
    
    const titleElement = taskElement.querySelector('.task-title-display');
    if (titleElement) {
        const renderedTitle = newTitle ? renderMarkdown(newTitle) : '<span class="task-title-placeholder">Add title...</span>';
        titleElement.innerHTML = renderedTitle;
    }
    
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
    } else if (isDarkTheme) {
        bgColor = '#555';
        textColor = '#ddd';
    } else {
        bgColor = '#999';
        textColor = '#fff';
    }
    
    if (isActive) {
        button.style.backgroundColor = bgColor;
        button.style.color = textColor;
    } else {
        button.style.backgroundColor = 'transparent';
        button.style.color = 'inherit';
    }
}

function flushPendingTagChanges() {
    pendingTagChanges.columns.forEach((title, columnId) => {
        vscode.postMessage({ type: 'editColumnTitle', columnId, title });
    });
    
    pendingTagChanges.tasks.forEach(({ columnId, taskData }, taskId) => {
        vscode.postMessage({ type: 'editTask', taskId, columnId, taskData });
    });
    
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

    document.getElementById('input-ok-btn').onclick = confirmAction;
    inputField.onkeydown = e => {
        if (e.key === 'Enter') confirmAction();
    };
}

function closeInputModal() {
    document.getElementById('input-modal').style.display = 'none';
}

function autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
}

function performSort() {
    vscode.postMessage({ type: 'performSort' });
}

// Make functions globally available
window.toggleDonutMenu = toggleDonutMenu;
window.toggleFileBarMenu = toggleFileBarMenu;
window.handleColumnTagClick = (columnId, tagName, event) => toggleColumnTag(columnId, tagName, event);
window.handleTaskTagClick = (taskId, columnId, tagName, event) => toggleTaskTag(taskId, columnId, tagName, event);
window.updateTagChipStyle = updateTagChipStyle;
window.columnTagUpdateTimeout = null;
window.taskTagUpdateTimeout = null;
window.toggleColumnTag = toggleColumnTag;
window.toggleTaskTag = toggleTaskTag;
window.submenuGenerator = window.menuManager; // Compatibility alias

console.log('✅ Unified menu system loaded');