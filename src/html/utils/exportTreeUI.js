/**
 * Export Tree UI Component
 * Renders kanban-style visual selector (rows horizontal, stacks vertical, columns in stacks)
 */

class ExportTreeUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.tree = null;
        this.onSelectionChange = null;
    }

    /**
     * Render the tree as a visual kanban layout
     */
    render(tree) {
        this.tree = tree;
        if (!this.container) return;

        this.container.innerHTML = '';
        if (!tree) {
            this.container.innerHTML = '<div class="export-selector-empty">No columns available</div>';
            return;
        }

        // Debug: log tree structure
        console.log('[kanban.exportTreeUI.render] Tree structure:', JSON.stringify(tree, (key, value) => {
            if (key === 'children' && Array.isArray(value)) {
                return `[${value.length} children]`;
            }
            if (key === 'selected' || key === 'type' || key === 'label') return value;
            return undefined;
        }, 2));

        // Create main container
        const mainContainer = document.createElement('div');
        mainContainer.className = 'export-selector-main';

        // Full kanban option at top
        const fullKanbanOption = this.renderFullKanbanOption(tree);
        mainContainer.appendChild(fullKanbanOption);

        // Render rows
        if (tree.children && tree.children.length > 0) {
            tree.children.forEach(rowNode => {
                console.log('[kanban.exportTreeUI.render] Rendering row:', rowNode.label, 'with', rowNode.children?.length, 'children');
                const rowElement = this.renderRow(rowNode);
                mainContainer.appendChild(rowElement);
            });
        }

        this.container.appendChild(mainContainer);
    }

    /**
     * Render full kanban selection option
     */
    renderFullKanbanOption(node) {
        const fullDiv = document.createElement('div');
        fullDiv.className = 'export-selector-full';
        fullDiv.className += node.selected ? ' selected' : '';
        fullDiv.textContent = 'Full Kanban';
        fullDiv.dataset.nodeId = 'root';

        fullDiv.addEventListener('click', () => {
            this.toggleNode('root');
        });

        return fullDiv;
    }

    /**
     * Render a row (horizontal)
     */
    renderRow(rowNode) {
        const rowDiv = document.createElement('div');
        rowDiv.className = 'export-selector-row';
        rowDiv.className += rowNode.selected ? ' selected' : '';
        rowDiv.dataset.nodeId = window.ExportTreeBuilder.generateNodeId(rowNode);

        // Row label
        const rowLabel = document.createElement('div');
        rowLabel.className = 'export-selector-row-label';
        rowLabel.textContent = rowNode.label;
        rowLabel.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(rowDiv.dataset.nodeId);
        });
        rowDiv.appendChild(rowLabel);

        // Columns container (horizontal)
        const columnsContainer = document.createElement('div');
        columnsContainer.className = 'export-selector-columns-container';

        if (rowNode.children && rowNode.children.length > 0) {
            rowNode.children.forEach(child => {
                console.log('[kanban.exportTreeUI.renderRow] Child type:', child.type, 'label:', child.label, 'has', child.children?.length, 'children');
                if (child.type === 'stack') {
                    const stackElement = this.renderStack(child);
                    columnsContainer.appendChild(stackElement);
                } else if (child.type === 'column') {
                    const columnElement = this.renderColumn(child);
                    columnsContainer.appendChild(columnElement);
                }
            });
        }

        rowDiv.appendChild(columnsContainer);
        return rowDiv;
    }

    /**
     * Render a stack (vertical container)
     */
    renderStack(stackNode) {
        const stackDiv = document.createElement('div');
        stackDiv.className = 'export-selector-stack';
        stackDiv.className += stackNode.selected ? ' selected' : '';
        stackDiv.dataset.nodeId = window.ExportTreeBuilder.generateNodeId(stackNode);

        stackDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(stackDiv.dataset.nodeId);
        });

        // Stack label
        const stackLabel = document.createElement('div');
        stackLabel.className = 'export-selector-stack-label';
        stackLabel.textContent = 'Stack';
        stackDiv.appendChild(stackLabel);

        // Columns in stack (horizontal lines)
        if (stackNode.children && stackNode.children.length > 0) {
            stackNode.children.forEach(columnNode => {
                const columnElement = this.renderStackedColumn(columnNode);
                stackDiv.appendChild(columnElement);
            });
        }

        return stackDiv;
    }

    /**
     * Render a standalone column (not in a stack)
     */
    renderColumn(columnNode) {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'export-selector-column';
        columnDiv.className += columnNode.selected ? ' selected' : '';
        columnDiv.dataset.nodeId = window.ExportTreeBuilder.generateNodeId(columnNode);

        const title = this.getColumnTitle(columnNode.label);
        columnDiv.textContent = title;

        columnDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(columnDiv.dataset.nodeId);
        });

        return columnDiv;
    }

    /**
     * Render a column inside a stack (horizontal line)
     */
    renderStackedColumn(columnNode) {
        const columnDiv = document.createElement('div');
        columnDiv.className = 'export-selector-stacked-column';
        columnDiv.className += columnNode.selected ? ' selected' : '';
        columnDiv.dataset.nodeId = window.ExportTreeBuilder.generateNodeId(columnNode);

        const title = this.getColumnTitle(columnNode.label);
        columnDiv.textContent = title;

        columnDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleNode(columnDiv.dataset.nodeId);
        });

        return columnDiv;
    }

    /**
     * Get clean column title (remove "Column: " prefix)
     */
    getColumnTitle(label) {
        return label.replace(/^Column:\s*/, '');
    }

    /**
     * Toggle node selection
     */
    toggleNode(nodeId) {
        if (!this.tree) return;

        const node = window.ExportTreeBuilder.findNodeById(this.tree, nodeId);
        if (!node) return;

        const newSelected = !node.selected;
        this.tree = window.ExportTreeBuilder.toggleSelection(this.tree, nodeId, newSelected);
        this.render(this.tree);

        if (this.onSelectionChange) {
            const selectedItems = window.ExportTreeBuilder.getSelectedItems(this.tree);
            this.onSelectionChange(selectedItems);
        }
    }

    /**
     * Get selected items
     */
    getSelectedItems() {
        if (!this.tree) return [];
        return window.ExportTreeBuilder.getSelectedItems(this.tree);
    }

    /**
     * Set selection change callback
     */
    setSelectionChangeCallback(callback) {
        this.onSelectionChange = callback;
    }

    /**
     * Clear all selections
     */
    clearSelection() {
        if (!this.tree) return;
        this.tree = window.ExportTreeBuilder.toggleSelection(this.tree, 'root', false);
        this.render(this.tree);
    }

    /**
     * Select all
     */
    selectAll() {
        if (!this.tree) return;
        this.tree = window.ExportTreeBuilder.toggleSelection(this.tree, 'root', true);
        this.render(this.tree);
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ExportTreeUI = ExportTreeUI;
    console.log('[kanban.exportTreeUI] ExportTreeUI loaded successfully');
} else {
    console.error('[kanban.exportTreeUI] window is undefined');
}
