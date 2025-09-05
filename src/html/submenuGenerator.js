// Dynamic submenu generator for DRY programming
// Creates submenus on-demand instead of generating all HTML upfront

class SubmenuGenerator {
    constructor() {
        this.activeSubmenu = null;
    }

    // Generate tag submenu on demand
    generateTagSubmenu(tags, id, type, columnId = null) {
        const groupedTags = this.groupTagsByType(tags);
        let menuHtml = '';

        // Generate grouped tags
        for (const [groupKey, groupTags] of Object.entries(groupedTags)) {
            if (groupTags.length > 0) {
                const groupLabel = groupKey.charAt(0).toUpperCase() + groupKey.slice(1);
                menuHtml += `
                    <div class="donut-menu-item has-submenu" data-submenu-type="tags" data-group="${groupKey}">
                        ${groupLabel}
                    </div>
                `;
            }
        }

        // Add user-added tags if any exist
        const userAddedTags = tags.filter(tag => !tag.configured);
        if (userAddedTags.length > 0) {
            menuHtml += `
                <div class="donut-menu-item has-submenu" data-submenu-type="tags" data-group="custom">
                    Custom Tags
                </div>
            `;
        }

        return menuHtml;
    }

    // Generate move submenu on demand
    generateMoveSubmenu(taskId, columnId) {
        return `
            <div class="donut-menu-item has-submenu" data-submenu-type="move">
                Move
            </div>
            <div class="donut-menu-item has-submenu" data-submenu-type="move-to-list" data-task-id="${taskId}" data-column-id="${columnId}">
                Move to list
            </div>
        `;
    }

    // Generate sort submenu on demand  
    generateSortSubmenu(columnId) {
        return `
            <div class="donut-menu-item has-submenu" data-submenu-type="sort" data-column-id="${columnId}">
                Sort by
            </div>
        `;
    }

    // Create submenu content dynamically when hovered
    createSubmenuContent(menuItem, id, type, columnId = null) {
        const submenuType = menuItem.dataset.submenuType;
        const group = menuItem.dataset.group;
        
        let content = '';
        
        switch (submenuType) {
            case 'tags':
                content = this.createTagGroupContent(group, id, type, columnId);
                break;
            case 'move':
                content = this.createMoveContent();
                break;
            case 'move-to-list':
                content = this.createMoveToListContent(menuItem.dataset.taskId, menuItem.dataset.columnId);
                break;
            case 'sort':
                content = this.createSortContent(menuItem.dataset.columnId);
                break;
        }

        return content;
    }

    // Create tag group content
    createTagGroupContent(group, id, type, columnId) {
        const allTags = window.getAllAvailableTags ? window.getAllAvailableTags() : [];
        const groupedTags = this.groupTagsByType(allTags);
        
        let tags = [];
        if (group === 'custom') {
            tags = allTags.filter(tag => !tag.configured);
        } else if (groupedTags[group]) {
            tags = groupedTags[group];
        }

        return window.generateGroupTagItems ? window.generateGroupTagItems(tags, id, type, columnId, group !== 'custom') : '';
    }

    // Create move content
    createMoveContent() {
        return `
            <button class="donut-menu-item" onclick="moveTaskToTop(this.closest('.task-item').id.replace('task-', ''), this.closest('.kanban-column').id.replace('column-', ''))">Top</button>
            <button class="donut-menu-item" onclick="moveTaskUp(this.closest('.task-item').id.replace('task-', ''), this.closest('.kanban-column').id.replace('column-', ''))">Up</button>
            <button class="donut-menu-item" onclick="moveTaskDown(this.closest('.task-item').id.replace('task-', ''), this.closest('.kanban-column').id.replace('column-', ''))">Down</button>
            <button class="donut-menu-item" onclick="moveTaskToBottom(this.closest('.task-item').id.replace('task-', ''), this.closest('.kanban-column').id.replace('column-', ''))">Bottom</button>
        `;
    }

    // Create move to list content
    createMoveToListContent(taskId, columnId) {
        const currentBoard = window.currentBoard;
        if (!currentBoard || !currentBoard.columns) return '';
        
        return currentBoard.columns.map(col => 
            col.id !== columnId ? 
            `<button class="donut-menu-item" onclick="moveTaskToColumn('${taskId}', '${columnId}', '${col.id}')">${window.escapeHtml ? window.escapeHtml(col.title || 'Untitled') : col.title || 'Untitled'}</button>` : ''
        ).join('');
    }

    // Create sort content
    createSortContent(columnId) {
        return `
            <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'unsorted')">Unsorted</button>
            <button class="donut-menu-item" onclick="sortColumn('${columnId}', 'title')">Sort by title</button>
        `;
    }

    // Group tags by type
    groupTagsByType(tags) {
        const grouped = {};
        
        tags.forEach(tag => {
            const type = tag.group || 'general';
            if (!grouped[type]) {
                grouped[type] = [];
            }
            grouped[type].push(tag);
        });
        
        return grouped;
    }

    // Show submenu with dynamic content
    showSubmenu(menuItem, id, type, columnId = null) {
        // Remove any existing submenu
        this.hideSubmenu();

        // Create submenu element
        const submenu = document.createElement('div');
        submenu.className = 'donut-menu-submenu dynamic-submenu';
        
        // Special class for tag grids
        if (menuItem.dataset.submenuType === 'tags') {
            submenu.classList.add('donut-menu-tags-grid');
        }
        
        // Generate content
        submenu.innerHTML = this.createSubmenuContent(menuItem, id, type, columnId);
        
        // Append to menu item
        menuItem.appendChild(submenu);
        
        // Store reference
        this.activeSubmenu = submenu;
        
        return submenu;
    }

    // Hide active submenu
    hideSubmenu() {
        if (this.activeSubmenu) {
            this.activeSubmenu.remove();
            this.activeSubmenu = null;
        }
        
        // Also remove any other dynamic submenus
        document.querySelectorAll('.dynamic-submenu').forEach(submenu => submenu.remove());
    }
}

// Global instance
window.submenuGenerator = new SubmenuGenerator();