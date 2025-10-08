/**
 * Export Tree UI Component
 * Renders and manages the hierarchical tree selector for export
 */

class ExportTreeUI {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.tree = null;
        this.onSelectionChange = null;
    }

    /**
     * Render the tree
     */
    render(tree) {
        this.tree = tree;
        if (!this.container) return;

        this.container.innerHTML = '';
        if (!tree) {
            this.container.innerHTML = '<div class="export-tree-empty">No columns available</div>';
            return;
        }

        const treeElement = this.renderNode(tree, 0);
        this.container.appendChild(treeElement);
    }

    /**
     * Render a single tree node
     */
    renderNode(node, depth) {
        const nodeDiv = document.createElement('div');
        nodeDiv.className = `export-tree-node export-tree-${node.type}`;
        nodeDiv.style.paddingLeft = `${depth * 20}px`;

        // Create checkbox and label
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = window.ExportTreeBuilder.generateNodeId(node);
        checkbox.checked = node.selected;
        checkbox.className = 'export-tree-checkbox';

        const label = document.createElement('label');
        label.htmlFor = checkbox.id;
        label.textContent = node.label;
        label.className = 'export-tree-label';

        // Handle checkbox change
        checkbox.addEventListener('change', (e) => {
            const nodeId = e.target.id;
            const selected = e.target.checked;

            // Update tree with parent-child logic
            this.tree = window.ExportTreeBuilder.toggleSelection(this.tree, nodeId, selected);

            // Re-render
            this.render(this.tree);

            // Notify listener
            if (this.onSelectionChange) {
                const selectedItems = window.ExportTreeBuilder.getSelectedItems(this.tree);
                this.onSelectionChange(selectedItems);
            }
        });

        nodeDiv.appendChild(checkbox);
        nodeDiv.appendChild(label);

        // Render children
        if (node.children && node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'export-tree-children';

            node.children.forEach(child => {
                childrenContainer.appendChild(this.renderNode(child, depth + 1));
            });

            nodeDiv.appendChild(childrenContainer);
        }

        return nodeDiv;
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
