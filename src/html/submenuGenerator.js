// Dynamic submenu generator for DRY programming
// Creates submenus on-demand instead of generating all HTML upfront


class SubmenuGenerator {
    constructor() {
        this.activeSubmenu = null;
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
                content = this.createMoveContent(menuItem.dataset.taskId || id, window.getColumnIdFromElement(menuItem) || columnId);
                break;
            case 'move-to-list':
                content = this.createMoveToListContent(menuItem.dataset.taskId || id, window.getColumnIdFromElement(menuItem) || columnId);
                break;
            case 'sort':
                content = this.createSortContent(window.getColumnIdFromElement(menuItem) || columnId);
                break;
        }
        
        return content;
    }

    // Create tag group content
    createTagGroupContent(group, id, type, columnId) {
        const tagConfig = window.tagColors || {};
        let tags = [];
        
        if (group === 'custom') {
            // Get user-added tags using the same function as the original
            if (window.getUserAddedTags) {
                tags = window.getUserAddedTags();
            }
        } else {
            // Get tags from the specific group in tagConfig
            const groupValue = tagConfig[group];
            if (groupValue && typeof groupValue === 'object') {
                // Check if this is a direct tag or a group
                if (groupValue.light || groupValue.dark) {
                    // This is a single tag
                    tags = [group];
                } else {
                    // This is a group, collect its tags
                    Object.keys(groupValue).forEach(tagKey => {
                        const tagValue = groupValue[tagKey];
                        if (tagValue && typeof tagValue === 'object' && (tagValue.light || tagValue.dark)) {
                            tags.push(tagKey);
                        }
                    });
                }
            }
        }
        
        // Generate the tag items HTML
        if (window.generateGroupTagItems) {
            return window.generateGroupTagItems(tags, id, type, columnId, group !== 'custom');
        }
        
        // Fallback if generateGroupTagItems is not available
        return '<div>Tags not available</div>';
    }

    // Create move content
    createMoveContent(taskId, columnId) {
        return `
            <button class="donut-menu-item" onclick="moveTaskToTop('${taskId}', '${columnId}')">Top</button>
            <button class="donut-menu-item" onclick="moveTaskUp('${taskId}', '${columnId}')">Up</button>
            <button class="donut-menu-item" onclick="moveTaskDown('${taskId}', '${columnId}')">Down</button>
            <button class="donut-menu-item" onclick="moveTaskToBottom('${taskId}', '${columnId}')">Bottom</button>
        `;
    }

    // Create move to list content
    createMoveToListContent(taskId, columnId) {
        const currentBoard = window.currentBoard;
        if (!currentBoard || !currentBoard.columns) {return '';}
        
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
        
        // Initially hide submenu to prevent flash
        submenu.style.display = 'none';
        submenu.style.visibility = 'hidden';
        
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
