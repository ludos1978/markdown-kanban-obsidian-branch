/**
 * Drag State Management Utility
 * Centralizes all drag and drop state management
 */

class DragStateManager {
    constructor() {
        this.reset();
        this.listeners = new Map();
    }

    /**
     * Reset drag state to initial values
     */
    reset() {
        this.isDragging = false;
        this.draggedElement = null;
        this.draggedTask = null;
        this.draggedColumn = null;
        this.draggedClipboardCard = null;
        this.draggedEmptyCard = false;
        this.dragType = null;
        this.dragSource = null;
        this.dragData = null;
        this.dropTarget = null;
        this.dropPosition = null;
    }

    /**
     * Start drag operation
     * @param {string} type - Type of drag (task, column, clipboard, empty)
     * @param {Object} data - Drag data
     * @param {HTMLElement} element - Dragged element
     */
    startDrag(type, data, element) {
        this.isDragging = true;
        this.dragType = type;
        this.draggedElement = element;

        switch (type) {
            case 'task':
                this.draggedTask = data;
                this.dragSource = 'task';
                break;
            case 'column':
                this.draggedColumn = data;
                this.dragSource = 'column';
                break;
            case 'clipboard':
                this.draggedClipboardCard = data;
                this.dragSource = 'clipboard';
                break;
            case 'empty':
                this.draggedEmptyCard = true;
                this.dragSource = 'empty';
                break;
            default:
                this.dragData = data;
        }

        // Add visual feedback
        if (element) {
            element.classList.add('dragging');
        }

        this.notifyListeners('dragstart', {
            type,
            data,
            element
        });
    }

    /**
     * Update drag over state
     * @param {HTMLElement} target - Current drag over target
     * @param {string} position - Drop position (before, after, inside)
     */
    updateDragOver(target, position) {
        // Remove previous drop target highlighting
        if (this.dropTarget && this.dropTarget !== target) {
            this.dropTarget.classList.remove('drag-over', 'drag-over-top', 'drag-over-bottom');
        }

        this.dropTarget = target;
        this.dropPosition = position;

        // Add new drop target highlighting
        if (target) {
            target.classList.add('drag-over');
            if (position === 'before') {
                target.classList.add('drag-over-top');
            } else if (position === 'after') {
                target.classList.add('drag-over-bottom');
            }
        }

        this.notifyListeners('dragover', {
            target,
            position
        });
    }

    /**
     * End drag operation
     * @param {boolean} success - Whether drop was successful
     */
    endDrag(success = false) {
        // MINIMAL cleanup - let existing dragDrop.js handle most visual cleanup
        // This method is mainly for state tracking and notifications

        this.notifyListeners('dragend', {
            success,
            type: this.dragType,
            source: this.dragSource
        });

        // Only reset our internal state, don't touch DOM classes
        // The existing dragDrop.js has comprehensive cleanup logic
        this.isDragging = false;
        this.draggedElement = null;
        this.dropTarget = null;
        this.dragType = null;
        this.dragSource = null;
        this.dragData = null;
        this.dropPosition = null;

        // Don't call this.reset() as it might interfere with existing dragState properties
    }

    /**
     * Get current drag data
     * @returns {Object} Current drag state data
     */
    getDragData() {
        return {
            isDragging: this.isDragging,
            type: this.dragType,
            source: this.dragSource,
            task: this.draggedTask,
            column: this.draggedColumn,
            clipboard: this.draggedClipboardCard,
            emptyCard: this.draggedEmptyCard,
            data: this.dragData,
            element: this.draggedElement
        };
    }

    /**
     * Check if currently dragging
     * @param {string} type - Optional specific type to check
     * @returns {boolean} True if dragging (optionally of specific type)
     */
    isDraggingType(type = null) {
        if (!this.isDragging) return false;
        return type ? this.dragType === type : true;
    }

    /**
     * Set data transfer for drag event
     * @param {DataTransfer} dataTransfer - HTML5 DataTransfer object
     * @param {string} type - Data type
     * @param {*} data - Data to transfer
     */
    setDataTransfer(dataTransfer, type, data) {
        const serialized = typeof data === 'string' ? data : JSON.stringify(data);
        dataTransfer.setData('text/plain', `${type.toUpperCase()}:${serialized}`);
        dataTransfer.effectAllowed = 'all';
    }

    /**
     * Parse data transfer from drag event
     * @param {DataTransfer} dataTransfer - HTML5 DataTransfer object
     * @returns {Object} Parsed data with type and content
     */
    parseDataTransfer(dataTransfer) {
        const text = dataTransfer.getData('text/plain');
        if (!text) return null;

        // Check for prefixed data types
        const prefixes = ['TASK:', 'COLUMN:', 'CLIPBOARD_CARD:', 'CLIPBOARD_IMAGE:',
                          'MULTIPLE_FILES:', 'EMPTY_CARD:'];

        for (const prefix of prefixes) {
            if (text.startsWith(prefix)) {
                const content = text.substring(prefix.length);
                const type = prefix.slice(0, -1).toLowerCase();

                try {
                    return {
                        type,
                        data: JSON.parse(content)
                    };
                } catch {
                    return {
                        type,
                        data: content
                    };
                }
            }
        }

        // Fallback for plain text
        return {
            type: 'text',
            data: text
        };
    }

    /**
     * Add listener for drag events
     * @param {string} event - Event name (dragstart, dragover, dragend)
     * @param {Function} callback - Callback function
     */
    addListener(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove listener for drag events
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    removeListener(event, callback) {
        if (!this.listeners.has(event)) return;

        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Notify all listeners of an event
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    notifyListeners(event, data) {
        if (!this.listeners.has(event)) return;

        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`Error in drag state listener for ${event}:`, error);
            }
        });
    }

    /**
     * Helper to check if element can accept drop
     * @param {HTMLElement} element - Target element
     * @param {string} dragType - Type being dragged
     * @returns {boolean} True if can accept drop
     */
    canAcceptDrop(element, dragType = null) {
        const type = dragType || this.dragType;

        // Check for explicit drop zones
        if (element.hasAttribute('data-drop-zone')) {
            const acceptedTypes = element.getAttribute('data-drop-zone').split(',');
            return acceptedTypes.includes(type) || acceptedTypes.includes('any');
        }

        // Default rules
        if (element.classList.contains('column-tasks')) {
            return type === 'task' || type === 'clipboard' || type === 'empty';
        }

        if (element.classList.contains('kanban-board')) {
            return type === 'column';
        }

        if (element.classList.contains('task-item')) {
            return type === 'task';
        }

        return false;
    }
}

// Create singleton instance
const dragStateManager = new DragStateManager();

// Make it globally available for compatibility
if (typeof window !== 'undefined') {
    // Don't override existing dragState if it already exists (from dragDrop.js)
    if (!window.dragState) {
        window.dragState = dragStateManager;
    } else {
        // Merge our methods with existing dragState
        Object.assign(window.dragState, {
            startDrag: dragStateManager.startDrag.bind(dragStateManager),
            updateDragOver: dragStateManager.updateDragOver.bind(dragStateManager),
            endDrag: dragStateManager.endDrag.bind(dragStateManager),
            getDragData: dragStateManager.getDragData.bind(dragStateManager),
            isDraggingType: dragStateManager.isDraggingType.bind(dragStateManager),
            addListener: dragStateManager.addListener.bind(dragStateManager),
            removeListener: dragStateManager.removeListener.bind(dragStateManager)
        });
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = dragStateManager;
}