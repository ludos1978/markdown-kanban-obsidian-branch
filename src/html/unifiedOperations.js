/**
 * Unified Operations Module
 *
 * SINGLE SOURCE OF TRUTH for all board operations.
 * All column and task additions/insertions MUST use these functions.
 *
 * Architecture:
 * 1. Frontend calls these functions
 * 2. These functions send messages to backend via vscode.postMessage
 * 3. Backend performs operation using BoardOperations
 * 4. Backend sends updated board back to frontend
 * 5. Frontend updates display
 *
 * CRITICAL: Do NOT manipulate cachedBoard directly!
 * CRITICAL: Do NOT create objects with manual ID generation!
 * CRITICAL: All operations go through the backend!
 */

console.log('[UnifiedOps] Module loading...');

/**
 * Add a task to the end of a column
 * @param {string} columnId - Target column ID
 * @param {object} taskData - Task data {title, description}
 */
function addTask_unified(columnId, taskData = { title: '', description: '' }) {
    console.log('[UnifiedOps] addTask_unified called:', { columnId, taskData });
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'addTask',
        columnId: columnId,
        taskData: taskData
    });
    console.log('[UnifiedOps] addTask message sent to backend');
}

/**
 * Add a task at a specific position in a column
 * @param {string} columnId - Target column ID
 * @param {object} taskData - Task data {title, description}
 * @param {number} insertionIndex - Position to insert at
 */
function addTaskAtPosition_unified(columnId, taskData, insertionIndex) {
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'addTaskAtPosition',
        columnId: columnId,
        taskData: taskData,
        insertionIndex: insertionIndex
    });
}

/**
 * Insert a task before an existing task
 * @param {string} taskId - Reference task ID
 * @param {string} columnId - Column ID
 */
function insertTaskBefore_unified(taskId, columnId) {
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'insertTaskBefore',
        taskId: taskId,
        columnId: columnId
    });
}

/**
 * Insert a task after an existing task
 * @param {string} taskId - Reference task ID
 * @param {string} columnId - Column ID
 */
function insertTaskAfter_unified(taskId, columnId) {
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'insertTaskAfter',
        taskId: taskId,
        columnId: columnId
    });
}

/**
 * Add a column to the end of the board
 * @param {string} title - Column title (can include tags like #row2)
 */
function addColumn_unified(title = '') {
    console.log('[UnifiedOps] addColumn_unified called:', { title });
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'addColumn',
        title: title
    });
    console.log('[UnifiedOps] addColumn message sent to backend');
}

/**
 * Insert a column before an existing column
 * @param {string} columnId - Reference column ID
 * @param {string} title - New column title
 */
function insertColumnBefore_unified(columnId, title = '') {
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'insertColumnBefore',
        columnId: columnId,
        title: title
    });
}

/**
 * Insert a column after an existing column
 * @param {string} columnId - Reference column ID
 * @param {string} title - New column title
 */
function insertColumnAfter_unified(columnId, title = '') {
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'insertColumnAfter',
        columnId: columnId,
        title: title
    });
}

/**
 * Duplicate an existing task
 * @param {string} taskId - Task to duplicate
 * @param {string} columnId - Column ID
 */
function duplicateTask_unified(taskId, columnId) {
    if (!window.vscode) {
        console.error('[UnifiedOps] window.vscode is not available!');
        return;
    }
    window.vscode.postMessage({
        type: 'duplicateTask',
        taskId: taskId,
        columnId: columnId
    });
}

// Expose functions globally
window.addTask_unified = addTask_unified;
window.addTaskAtPosition_unified = addTaskAtPosition_unified;
window.insertTaskBefore_unified = insertTaskBefore_unified;
window.insertTaskAfter_unified = insertTaskAfter_unified;
window.addColumn_unified = addColumn_unified;
window.insertColumnBefore_unified = insertColumnBefore_unified;
window.insertColumnAfter_unified = insertColumnAfter_unified;
window.duplicateTask_unified = duplicateTask_unified;

console.log('[UnifiedOps] Functions exposed to window:', {
    addTask_unified: typeof window.addTask_unified,
    addColumn_unified: typeof window.addColumn_unified
});
