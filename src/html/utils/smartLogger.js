/**
 * Smart Logger - Only logs when data changes
 *
 * Usage:
 *   const logger = createSmartLogger('DragDrop');
 *   logger.log('dragState', { isDragging: true, draggedTask: 'task-1' });
 *   logger.log('dragState', { isDragging: true, draggedTask: 'task-1' }); // Won't log - no change
 *   logger.log('dragState', { isDragging: false, draggedTask: null }); // Will log - changed
 */

function createSmartLogger(prefix) {
    const cache = new Map();

    return {
        /**
         * Log only if data changed since last call with this key
         * @param {string} key - Cache key (e.g., 'dragState', 'position')
         * @param {*} data - Data to log (will be JSON stringified for comparison)
         * @param {string} label - Optional label to override key in log
         */
        log(key, data, label) {
            const dataStr = JSON.stringify(data);
            const cached = cache.get(key);

            if (cached !== dataStr) {
                cache.set(key, dataStr);
                console.log(`[${prefix}] ${label || key}:`, data);
            }
        },

        /**
         * Always log, regardless of cache
         * @param {string} message - Message to log
         * @param {*} data - Optional data to log
         */
        always(message, data) {
            if (data !== undefined) {
                console.log(`[${prefix}] ${message}`, data);
            } else {
                console.log(`[${prefix}] ${message}`);
            }
        },

        /**
         * Clear cache for a specific key or all keys
         * @param {string} key - Optional key to clear, clears all if omitted
         */
        clear(key) {
            if (key) {
                cache.delete(key);
            } else {
                cache.clear();
            }
        },

        /**
         * Log only once per session (first time this key is seen)
         * @param {string} key - Unique key for this log
         * @param {string} message - Message to log
         */
        once(key, message) {
            if (!cache.has(key)) {
                cache.set(key, true);
                console.log(`[${prefix}] ${message}`);
            }
        }
    };
}

// Export for use in other modules
window.createSmartLogger = createSmartLogger;
