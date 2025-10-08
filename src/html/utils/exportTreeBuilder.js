/**
 * Build hierarchical tree structure for export dialog
 * Organizes board into: Rows → Stacks → Columns
 */

class ExportTreeBuilder {
    /**
     * Build export tree from current board
     * @param {object} board - The kanban board object
     * @returns {object} Hierarchical tree structure
     */
    static buildExportTree(board) {
        if (!board || !board.columns) {
            return null;
        }

        const tree = {
            type: 'root',
            label: 'Full Kanban',
            selected: false,
            scope: 'full',
            children: []
        };

        // Organize columns by row
        const rowMap = new Map();

        board.columns.forEach((column, columnIndex) => {
            const rowNumber = this.getColumnRow(column.title);
            if (!rowMap.has(rowNumber)) {
                rowMap.set(rowNumber, []);
            }
            rowMap.get(rowNumber).push({
                column,
                columnIndex,
                isStacked: this.isColumnStacked(column.title)
            });
        });

        // Sort rows numerically
        const sortedRows = Array.from(rowMap.entries()).sort((a, b) => a[0] - b[0]);

        // Build row nodes
        sortedRows.forEach(([rowNumber, columns]) => {
            const rowNode = {
                type: 'row',
                label: `Row ${rowNumber}`,
                selected: false,
                scope: 'row',
                rowNumber: rowNumber,
                children: []
            };

            // Group columns into stacks
            const stacks = this.groupIntoStacks(columns);

            stacks.forEach((stack, stackIndex) => {
                if (stack.length > 1) {
                    // Create stack node
                    const stackLabel = stack.map(item => {
                        const title = this.getCleanColumnTitle(item.column.title);
                        return title || 'Untitled';
                    }).join(', ');

                    const stackNode = {
                        type: 'stack',
                        label: `Stack (${stackLabel})`,
                        selected: false,
                        scope: 'stack',
                        rowNumber: rowNumber,
                        stackIndex: stackIndex,
                        children: []
                    };

                    // Add columns to stack
                    stack.forEach(item => {
                        const columnTitle = this.getCleanColumnTitle(item.column.title) || 'Untitled';
                        stackNode.children.push({
                            type: 'column',
                            label: `Column: ${columnTitle}`,
                            selected: false,
                            scope: 'column',
                            columnIndex: item.columnIndex,
                            columnId: item.column.id,
                            children: []
                        });
                    });

                    rowNode.children.push(stackNode);
                } else {
                    // Single column (not stacked)
                    const item = stack[0];
                    const columnTitle = this.getCleanColumnTitle(item.column.title) || 'Untitled';
                    rowNode.children.push({
                        type: 'column',
                        label: `Column: ${columnTitle}`,
                        selected: false,
                        scope: 'column',
                        columnIndex: item.columnIndex,
                        columnId: item.column.id,
                        children: []
                    });
                }
            });

            tree.children.push(rowNode);
        });

        return tree;
    }

    /**
     * Get row number from column title
     */
    static getColumnRow(title) {
        if (!title) return 1;
        const rowMatches = title.match(/#row(\d+)\b/gi);
        if (rowMatches && rowMatches.length > 0) {
            const lastMatch = rowMatches[rowMatches.length - 1];
            const num = parseInt(lastMatch.replace(/#row/i, ''), 10);
            return isNaN(num) ? 1 : num;
        }
        return 1;
    }

    /**
     * Check if column has #stack tag
     */
    static isColumnStacked(title) {
        return /#stack\b/i.test(title);
    }

    /**
     * Get clean column title (remove layout tags)
     */
    static getCleanColumnTitle(title) {
        if (!title) return '';
        // Remove layout tags but keep other tags
        return title
            .replace(/#row\d+/gi, '')
            .replace(/#span\d+/gi, '')
            .replace(/#stack\b/gi, '')
            .trim();
    }

    /**
     * Group columns into stacks
     * Consecutive stacked columns form a stack
     */
    static groupIntoStacks(columns) {
        const stacks = [];
        let currentStack = [];

        columns.forEach(item => {
            if (item.isStacked) {
                currentStack.push(item);
            } else {
                // Non-stacked column ends current stack
                if (currentStack.length > 0) {
                    stacks.push([...currentStack]);
                    currentStack = [];
                }
                // Single non-stacked column
                stacks.push([item]);
            }
        });

        // Don't forget last stack
        if (currentStack.length > 0) {
            stacks.push(currentStack);
        }

        return stacks;
    }

    /**
     * Get all selected items from tree
     */
    static getSelectedItems(tree) {
        const selected = [];

        const traverse = (node) => {
            if (node.selected && node.scope !== 'root') {
                selected.push({
                    type: node.type,
                    scope: node.scope,
                    rowNumber: node.rowNumber,
                    stackIndex: node.stackIndex,
                    columnIndex: node.columnIndex,
                    columnId: node.columnId
                });
            }
            if (node.children) {
                node.children.forEach(child => traverse(child));
            }
        };

        traverse(tree);
        return selected;
    }

    /**
     * Handle selection with parent-child logic
     * When parent selected, select all children
     * When all children selected, select parent
     */
    static toggleSelection(tree, nodeId, selected) {
        // Find and toggle the node
        const node = this.findNodeById(tree, nodeId);
        if (!node) return tree;

        node.selected = selected;

        // If selecting, select all children
        if (selected && node.children) {
            this.selectAllChildren(node, true);
        }

        // If deselecting, deselect all children
        if (!selected && node.children) {
            this.selectAllChildren(node, false);
        }

        // Update parent selection based on children
        this.updateParentSelection(tree);

        return tree;
    }

    /**
     * Select/deselect all children recursively
     */
    static selectAllChildren(node, selected) {
        if (!node.children) return;
        node.children.forEach(child => {
            child.selected = selected;
            this.selectAllChildren(child, selected);
        });
    }

    /**
     * Update parent selection based on children
     */
    static updateParentSelection(node) {
        if (!node.children || node.children.length === 0) return;

        node.children.forEach(child => this.updateParentSelection(child));

        // If all children selected, select parent
        const allChildrenSelected = node.children.every(child => child.selected);
        if (allChildrenSelected && node.children.length > 0) {
            node.selected = true;
        }
    }

    /**
     * Find node by ID (generated from path)
     */
    static findNodeById(tree, id) {
        if (this.generateNodeId(tree) === id) return tree;
        if (!tree.children) return null;

        for (const child of tree.children) {
            const found = this.findNodeById(child, id);
            if (found) return found;
        }
        return null;
    }

    /**
     * Generate unique ID for node based on its properties
     */
    static generateNodeId(node) {
        if (node.type === 'root') return 'root';
        if (node.type === 'row') return `row-${node.rowNumber}`;
        if (node.type === 'stack') return `stack-${node.rowNumber}-${node.stackIndex}`;
        if (node.type === 'column') return `column-${node.columnIndex}`;
        return 'unknown';
    }
}

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.ExportTreeBuilder = ExportTreeBuilder;
    console.log('[kanban.exportTreeBuilder] ExportTreeBuilder loaded successfully');
} else {
    console.error('[kanban.exportTreeBuilder] window is undefined');
}
