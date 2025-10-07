/**
 * Debug overlay system for tracking file states and conflict management
 */

// Debug overlay state
let debugOverlayVisible = false;
let debugOverlayElement = null;
let trackedFilesData = {};
let lastTrackedFilesDataHash = null;
let refreshCount = 0;
let debugOverlaySticky = false; // New: sticky/pin state

// Hover behavior state
let hoverShowTimer = null;
let hoverHideTimer = null;
let autoRefreshTimer = null;
const HOVER_SHOW_DELAY = 500; // ms
const HOVER_HIDE_DELAY = 300; // ms

/**
 * Create and show the debug overlay
 */
function showDebugOverlay() {

    if (debugOverlayElement) {
        debugOverlayElement.remove();
    }

    // Check if vscode is available
    if (typeof window.vscode === 'undefined') {
        console.error('[DebugOverlay] vscode API not available, cannot request debug info');
        alert('Debug overlay error: vscode API not available');
        return;
    }

    // Request current file tracking state from backend
    window.vscode.postMessage({ type: 'getTrackedFilesDebugInfo' });

    // Create overlay element
    debugOverlayElement = document.createElement('div');
    debugOverlayElement.id = 'debug-overlay';
    debugOverlayElement.innerHTML = createDebugOverlayContent();

    // Add styles
    const style = document.createElement('style');
    style.textContent = getDebugOverlayStyles();
    document.head.appendChild(style);

    // Add to DOM
    document.body.appendChild(debugOverlayElement);

    debugOverlayVisible = true;

    // Request initial data
    if (window.vscode) {
        window.vscode.postMessage({ type: 'getTrackedFilesDebugInfo' });
    }

    // Handle mouse interactions with the overlay
    debugOverlayElement.addEventListener('mouseenter', () => {
        // Cancel hide timer when mouse enters overlay
        if (hoverHideTimer) {
            clearTimeout(hoverHideTimer);
            hoverHideTimer = null;
        }
    });

    debugOverlayElement.addEventListener('mouseleave', () => {
        // Only hide overlay when mouse leaves if not sticky
        if (!debugOverlaySticky) {
            hideDebugOverlayDelayed();
        }
    });

    // Close on click outside
    debugOverlayElement.addEventListener('click', (e) => {
        if (e.target === debugOverlayElement) {
            hideDebugOverlay();
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && debugOverlayVisible) {
            hideDebugOverlay();
        }
    });

    debugOverlayVisible = true;

    // Start auto-refresh when overlay is visible
    startAutoRefresh();

}

/**
 * Hide and remove the debug overlay
 */
function hideDebugOverlay() {
    // When explicitly closed, clear sticky state too
    debugOverlaySticky = false;

    // Stop auto-refresh
    stopAutoRefresh();

    if (debugOverlayElement) {
        debugOverlayElement.remove();
        debugOverlayElement = null;
    }
    debugOverlayVisible = false;
}

/**
 * Schedule showing the debug overlay after hover delay
 */
function scheduleDebugOverlayShow() {
    // Cancel any pending hide
    if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
        hoverHideTimer = null;
    }

    // If already visible, don't schedule again
    if (debugOverlayVisible) {
        return;
    }

    // Schedule show after delay
    if (!hoverShowTimer) {
        hoverShowTimer = setTimeout(() => {
            showDebugOverlay();
            hoverShowTimer = null;
        }, HOVER_SHOW_DELAY);
    }
}

/**
 * Cancel scheduled debug overlay show
 */
function cancelDebugOverlayShow() {
    if (hoverShowTimer) {
        clearTimeout(hoverShowTimer);
        hoverShowTimer = null;
    }
}

/**
 * Hide debug overlay with delay
 */
function hideDebugOverlayDelayed() {
    // Don't hide if sticky mode is enabled
    if (debugOverlaySticky) {
        return;
    }

    // Don't hide if mouse is over the overlay itself
    if (hoverHideTimer) {
        clearTimeout(hoverHideTimer);
    }

    hoverHideTimer = setTimeout(() => {
        hideDebugOverlay();
        hoverHideTimer = null;
    }, HOVER_HIDE_DELAY);
}

/**
 * Update the debug overlay with fresh data
 */
function refreshDebugOverlay() {

    if (!debugOverlayVisible || !debugOverlayElement) {
        return;
    }

    refreshCount++;

    // Only request new data if we don't have recent data
    if (window.vscode) {
        window.vscode.postMessage({ type: 'getTrackedFilesDebugInfo' });
    } else {
    }

    // Don't rebuild DOM here - let updateTrackedFilesData handle it
}

/**
 * Toggle sticky/pin state of debug overlay
 */
function toggleDebugOverlaySticky() {
    debugOverlaySticky = !debugOverlaySticky;

    // Update the pin button appearance
    const pinButton = debugOverlayElement?.querySelector('.debug-pin-btn');
    if (pinButton) {
        pinButton.textContent = debugOverlaySticky ? '📌 Pinned' : '📌 Pin';
        pinButton.style.background = debugOverlaySticky ?
            'var(--vscode-gitDecoration-addedResourceForeground)' :
            'var(--vscode-button-background)';
        pinButton.style.color = debugOverlaySticky ? 'white' : 'var(--vscode-button-foreground)';
    }

}

/**
 * Start auto-refresh timer for sticky mode
 */
function startAutoRefresh() {
    // Clear existing timer
    stopAutoRefresh();

    // Only start timer if overlay is actually visible or sticky
    if (!debugOverlayVisible && !debugOverlaySticky) {
        return;
    }

    // Start new auto-refresh timer (refresh every 5 seconds, less frequent)
    autoRefreshTimer = setInterval(() => {
        if (debugOverlayVisible && (debugOverlaySticky || document.querySelector('#debug-overlay:hover'))) {
            refreshDebugOverlay();
        } else {
            // Stop timer if overlay is no longer visible
            stopAutoRefresh();
        }
    }, 5000);

}

/**
 * Stop auto-refresh timer
 */
function stopAutoRefresh() {
    if (autoRefreshTimer) {
        clearInterval(autoRefreshTimer);
        autoRefreshTimer = null;
    }
}

/**
 * Create a simple hash of the data to detect changes
 */
function createDataHash(data) {
    try {
        return JSON.stringify(data).replace(/\s/g, '');
    } catch (error) {
        return Math.random().toString();
    }
}

/**
 * Update tracked files data from backend
 */
function updateTrackedFilesData(data) {

    // ENHANCED DEBUG: Show main file state specifically
    if (data && data.watcherDetails) {
    }

    const newDataHash = createDataHash(data);

    // Only update if data actually changed
    if (newDataHash === lastTrackedFilesDataHash) {
        return;
    }

    lastTrackedFilesDataHash = newDataHash;
    trackedFilesData = data;

    if (debugOverlayVisible && debugOverlayElement) {
        // Only update the content, preserve scroll position
        updateFileStatesContent();
    }
}

/**
 * Update only the content without rebuilding the entire DOM
 */
function updateFileStatesContent() {
    if (!debugOverlayElement) {
        return;
    }

    // Batch DOM updates to reduce reflow
    requestAnimationFrame(() => {
        const allFiles = createAllFilesArray();

        // Update summary stats (includes timestamp now)
        const summaryElement = debugOverlayElement.querySelector('.file-states-summary');
        if (summaryElement) {
            const newSummaryHTML = createFileStatesSummary(allFiles);
            if (summaryElement.innerHTML !== newSummaryHTML) {
                summaryElement.innerHTML = newSummaryHTML;
            }
        }

        // Update file list (only if content changed)
        const listElement = debugOverlayElement.querySelector('.file-states-list');
        if (listElement) {
            const newListHTML = createFileStatesList(allFiles);
            if (listElement.innerHTML !== newListHTML) {
                listElement.innerHTML = newListHTML;
            }
        }
    });
}

/**
 * Create the HTML content for the debug overlay
 */
function createDebugOverlayContent() {
    return `
        <div class="debug-panel">
            <div class="debug-header">
                <h3>📁 File States Overview</h3>
                <div class="debug-controls">
                    <button onclick="toggleDebugOverlaySticky()" class="debug-btn debug-pin-btn">
                        📌 Pin
                    </button>
                    <button onclick="refreshDebugOverlay()" class="debug-btn">
                        🔄 Refresh
                    </button>
                    <button onclick="reloadAllIncludedFiles()" class="debug-btn">
                        🔄 Reload All
                    </button>
                    <button onclick="hideDebugOverlay()" class="debug-close">
                        ✕
                    </button>
                </div>
            </div>
            <div class="debug-content">
                ${createFileStatesContent()}
            </div>
        </div>
    `;
}

/**
 * Create the main debug content
 */
function createFileStatesContent() {
    const allFiles = createAllFilesArray();

    return `
        <div class="file-states-section">
            <div class="file-states-summary">
                ${createFileStatesSummary(allFiles)}
            </div>
            <div class="file-states-list">
                ${createFileStatesList(allFiles)}
            </div>
        </div>
    `;
}

/**
 * Create file watcher status section
 */
function createFileWatcherSection() {
    const mainFile = trackedFilesData.mainFile || 'Unknown';
    const watcherActive = trackedFilesData.fileWatcherActive !== false;
    const mainFileInfo = trackedFilesData.watcherDetails || {};
    const hasInternalChanges = mainFileInfo.hasInternalChanges || false;
    const hasExternalChanges = mainFileInfo.hasExternalChanges || false;

    return `
        <div class="debug-group">
            <h4>📄 Main File Tracking</h4>
            <div class="debug-item">
                <span class="debug-label">File:</span>
                <span class="debug-value file-path" title="${mainFile}">
                    ${mainFile ? mainFile.split('/').pop() : 'None'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Watcher:</span>
                <span class="debug-value ${watcherActive ? 'status-good' : 'status-bad'}">
                    ${watcherActive ? '✅ Active' : '❌ Inactive'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Internal Changes:</span>
                <span class="debug-value ${hasInternalChanges ? 'status-warn' : 'status-good'}">
                    ${hasInternalChanges ? '🟡 Modified' : '🟢 Saved'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">External Changes:</span>
                <span class="debug-value ${hasExternalChanges ? 'status-warn' : 'status-good'}">
                    ${hasExternalChanges ? '🔄 Externally Modified' : '🟢 In Sync'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Document Version:</span>
                <span class="debug-value">
                    ${mainFileInfo.documentVersion || 0} (Last: ${mainFileInfo.lastDocumentVersion || -1})
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Last Modified:</span>
                <span class="debug-value">
                    ${trackedFilesData.mainFileLastModified || 'Unknown'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Create external file watcher section
 */
function createExternalFileWatcherSection() {
    const watchers = trackedFilesData.externalWatchers || [];

    return `
        <div class="debug-group">
            <h4>🔍 External File Watchers</h4>
            <div class="debug-item">
                <span class="debug-label">Total Watchers:</span>
                <span class="debug-value">${watchers.length}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Status:</span>
                <span class="debug-value ${watchers.length > 0 ? 'status-good' : 'status-warn'}">
                    ${watchers.length > 0 ? '✅ Monitoring' : '⚠️ No watchers'}
                </span>
            </div>
            <div class="watcher-list">
                ${watchers.map(w => `
                    <div class="watcher-item">
                        <span class="watcher-file" title="${w.path}">${w.path.split('/').pop()}</span>
                        <span class="watcher-type ${w.type}">${w.type}</span>
                        <span class="watcher-status ${w.active ? 'active' : 'inactive'}">
                            ${w.active ? '🟢' : '🔴'}
                        </span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Create conflict manager section
 */
function createConflictManagerSection() {
    const conflicts = trackedFilesData.conflictManager || {};

    return `
        <div class="debug-group">
            <h4>⚡ Conflict Management</h4>
            <div class="debug-item">
                <span class="debug-label">System Status:</span>
                <span class="debug-value ${conflicts.healthy ? 'status-good' : 'status-bad'}">
                    ${conflicts.healthy ? '✅ Healthy' : '❌ Issues Detected'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Tracked Files:</span>
                <span class="debug-value">${conflicts.trackedFiles || 0}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Pending Conflicts:</span>
                <span class="debug-value ${(conflicts.pendingConflicts || 0) > 0 ? 'status-warn' : 'status-good'}">
                    ${conflicts.pendingConflicts || 0}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Watcher Failures:</span>
                <span class="debug-value ${(conflicts.watcherFailures || 0) > 0 ? 'status-bad' : 'status-good'}">
                    ${conflicts.watcherFailures || 0}
                </span>
            </div>
        </div>
    `;
}

/**
 * Create include files section
 */
function createIncludeFilesSection() {
    const includeFiles = trackedFilesData.includeFiles || [];
    const internalChangesCount = includeFiles.filter(f => f.hasInternalChanges).length;
    const externalChangesCount = includeFiles.filter(f => f.hasExternalChanges).length;

    return `
        <div class="debug-group">
            <h4>📎 Include Files</h4>
            <div class="debug-item">
                <span class="debug-label">Total Includes:</span>
                <span class="debug-value">${includeFiles.length}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Internal:</span>
                <span class="debug-value ${internalChangesCount > 0 ? 'status-warn' : 'status-good'}">
                    ${internalChangesCount > 0 ? `🟡 ${internalChangesCount} Modified` : '🟢 All Saved'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">External:</span>
                <span class="debug-value ${externalChangesCount > 0 ? 'status-warn' : 'status-good'}">
                    ${externalChangesCount > 0 ? `🔄 ${externalChangesCount} Externally Modified` : '🟢 All In Sync'}
                </span>
            </div>
            <div class="debug-controls" style="margin: 8px 0;">
                <button onclick="reloadAllIncludedFiles()" class="debug-btn" style="width: 100%;">
                    🔄 Reload All Included Files (Images, Videos, Includes)
                </button>
            </div>
            <div class="include-list">
                ${includeFiles.map(file => `
                    <div class="include-item">
                        <div class="include-header">
                            <span class="include-file" title="${file.path}">${file.path.split('/').pop()}</span>
                            <span class="include-type ${file.type}">${
                                file.type === 'regular' || file.type === 'include-regular' ? 'REGULAR' :
                                file.type === 'column' || file.type === 'include-column' ? 'COLUMN' :
                                file.type === 'task' || file.type === 'include-task' ? 'TASK' :
                                file.type
                            }</span>
                            <span class="include-status ${file.exists ? 'exists' : 'missing'}">
                                ${file.exists ? '📄' : '❌'}
                            </span>
                        </div>
                        <div class="include-details">
                            <span class="detail-item">Modified: ${file.lastModified || 'Unknown'}</span>
                            <span class="detail-item">
                                Content: ${file.contentLength || 0} chars
                                ${file.baselineLength > 0 ? `(Baseline: ${file.baselineLength})` : ''}
                            </span>
                            <span class="detail-item ${file.hasInternalChanges ? 'status-warn' : 'status-good'}">
                                Internal: ${file.hasInternalChanges ? '🟡 Modified' : '🟢 Saved'}
                            </span>
                            <span class="detail-item ${file.hasExternalChanges ? 'status-warn' : 'status-good'}">
                                External: ${file.hasExternalChanges ? '🔄 Changed' : '🟢 In Sync'}
                            </span>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

/**
 * Create pending changes section
 */
function createPendingChangesSection() {
    const columnChanges = window.pendingColumnChanges?.size || 0;
    const taskChanges = window.pendingTaskChanges?.size || 0;
    const totalChanges = columnChanges + taskChanges;

    return `
        <div class="debug-group">
            <h4>💾 Pending Changes</h4>
            <div class="debug-item">
                <span class="debug-label">Total Pending:</span>
                <span class="debug-value ${totalChanges > 0 ? 'status-warn' : 'status-good'}">
                    ${totalChanges}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Column Changes:</span>
                <span class="debug-value">${columnChanges}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Task Changes:</span>
                <span class="debug-value">${taskChanges}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Unsaved Status:</span>
                <span class="debug-value ${trackedFilesData.hasUnsavedChanges ? 'status-warn' : 'status-good'}">
                    ${trackedFilesData.hasUnsavedChanges ? '🟡 Has Unsaved' : '🟢 All Saved'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Create system health section
 */
function createSystemHealthSection() {
    const health = trackedFilesData.systemHealth || {};

    return `
        <div class="debug-group">
            <h4>🏥 System Health</h4>
            <div class="debug-item">
                <span class="debug-label">Overall Status:</span>
                <span class="debug-value ${health.overall || 'status-unknown'}">
                    ${health.overall === 'good' ? '✅ Good' :
                      health.overall === 'warn' ? '⚠️ Warning' :
                      health.overall === 'bad' ? '❌ Critical' : '❓ Unknown'}
                </span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Extension State:</span>
                <span class="debug-value">${health.extensionState || 'Unknown'}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Memory Usage:</span>
                <span class="debug-value">${health.memoryUsage || 'Unknown'}</span>
            </div>
            <div class="debug-item">
                <span class="debug-label">Last Error:</span>
                <span class="debug-value ${health.lastError ? 'status-bad' : 'status-good'}">
                    ${health.lastError || 'None'}
                </span>
            </div>
        </div>
    `;
}

/**
 * Get short label for include type (for path line)
 */
function getIncludeTypeShortLabel(fileType) {
    let result;
    switch (fileType) {
        case 'include-regular':
        case 'regular':
            result = 'include';
            break;
        case 'include-column':
        case 'column':
            result = 'colinc';
            break;
        case 'include-task':
        case 'task':
            result = 'taskinc';
            break;
        default:
            result = 'include'; // default fallback
            break;
    }
    return result;
}

/**
 * Get user-friendly label for include type
 */
function getIncludeTypeLabel(fileType) {
    switch (fileType) {
        case 'include-regular':
        case 'regular':
            return 'inline';
        case 'include-column':
        case 'column':
            return 'column';
        case 'include-task':
        case 'task':
            return 'task';
        default:
            return 'inline'; // default fallback
    }
}

/**
 * Get description for include type
 */
function getIncludeTypeDescription(fileType) {
    switch (fileType) {
        case 'include-regular':
        case 'regular':
            return 'Regular include (!!!include()) - read-only content insertion';
        case 'include-column':
        case 'column':
            return 'Column include (!!!columninclude()) - bidirectional sync for column tasks';
        case 'include-task':
        case 'task':
            return 'Task include (!!!taskinclude()) - bidirectional sync for individual tasks';
        default:
            return 'Regular include (!!!include()) - read-only content insertion';
    }
}

/**
 * Create array of all files (main + included) with their states
 */
function createAllFilesArray() {
    const allFiles = [];

    // Add main file
    const mainFile = trackedFilesData.mainFile || 'Unknown';
    const mainFileInfo = trackedFilesData.watcherDetails || {};


    const mainFileData = {
        path: mainFile,
        relativePath: mainFile ? mainFile.split('/').pop() : 'Unknown', // Just filename for main file
        name: mainFile ? mainFile.split('/').pop() : 'Unknown',
        type: 'main',
        isMainFile: true,
        exists: true,
        hasInternalChanges: mainFileInfo.hasInternalChanges || false,
        hasExternalChanges: mainFileInfo.hasExternalChanges || false,
        documentVersion: mainFileInfo.documentVersion || 0,
        lastDocumentVersion: mainFileInfo.lastDocumentVersion || -1,
        isUnsavedInEditor: mainFileInfo.isUnsavedInEditor || false,
        lastModified: trackedFilesData.mainFileLastModified || 'Unknown'
    };

    allFiles.push(mainFileData);

    // Add include files
    const includeFiles = trackedFilesData.includeFiles || [];

    includeFiles.forEach(file => {

        allFiles.push({
            path: file.path,
            relativePath: file.path, // Use the path from backend directly (it's already relative for includes)
            name: file.path.split('/').pop(),
            type: file.type || 'include',
            isMainFile: false,
            exists: file.exists !== false,
            hasInternalChanges: file.hasInternalChanges || false,
            hasExternalChanges: file.hasExternalChanges || false,
            isUnsavedInEditor: file.isUnsavedInEditor || false,
            contentLength: file.contentLength || 0,
            baselineLength: file.baselineLength || 0,
            lastModified: file.lastModified || 'Unknown'
        });
    });

    return allFiles;
}

/**
 * Create summary of file states
 */
function createFileStatesSummary(allFiles) {
    const totalFiles = allFiles.length;
    const internalChanges = allFiles.filter(f => f.hasInternalChanges).length;
    const externalChanges = allFiles.filter(f => f.hasExternalChanges).length;
    const bothChanges = allFiles.filter(f => f.hasInternalChanges && f.hasExternalChanges).length;
    const cleanFiles = allFiles.filter(f => !f.hasInternalChanges && !f.hasExternalChanges).length;
    const now = new Date().toLocaleTimeString();

    return `
        <div class="file-states-stats">
            <div class="stat-group">
                <div class="stat-item">
                    <span class="stat-label">Total Files:</span>
                    <span class="stat-value">${totalFiles}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Clean:</span>
                    <span class="stat-value ${cleanFiles > 0 ? 'status-good' : 'status-unknown'}">${cleanFiles}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Internal Changes:</span>
                    <span class="stat-value ${internalChanges > 0 ? 'status-warn' : 'status-good'}">${internalChanges}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">External Changes:</span>
                    <span class="stat-value ${externalChanges > 0 ? 'status-warn' : 'status-good'}">${externalChanges}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Both:</span>
                    <span class="stat-value ${bothChanges > 0 ? 'status-bad' : 'status-good'}">${bothChanges}</span>
                </div>
            </div>
            <div class="debug-timestamp">Updated: ${now}</div>
        </div>
    `;
}

/**
 * Create list of all files with their states and action buttons
 */
function createFileStatesList(allFiles) {
    return `
        <div class="files-table-container">
            <table class="files-table">
                <thead>
                    <tr>
                        <th class="col-file">File</th>
                        <th class="col-internal">Internal</th>
                        <th class="col-external">External</th>
                        <th class="col-actions">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${allFiles.map(file => {
                        // Combine editor unsaved state + external changes into one "external" indicator
                        const hasExternalChanges = file.hasExternalChanges || file.isUnsavedInEditor;
                        const hasAnyChanges = file.hasInternalChanges || hasExternalChanges;
                        const mainFileClass = file.isMainFile ? 'main-file' : '';

                        // Debug log for each file being rendered

                        return `
                            <tr class="file-row ${mainFileClass}">
                                <td class="col-file">
                                    <div class="file-directory-path" title="${file.path}">
                                        ${file.relativePath.includes('/') ? file.relativePath.substring(0, file.relativePath.lastIndexOf('/')) : '.'}
                                        ${!file.isMainFile ? `<span class="include-type-label ${file.type || 'include'}">[${getIncludeTypeShortLabel(file.type)}]</span>` : ''}
                                    </div>
                                    <div class="file-name-clickable" onclick="openFile('${file.path}')" title="Click to open file">
                                        ${file.isMainFile ? '📄' : '📎'} ${file.name}
                                    </div>
                                </td>
                                <td class="col-internal">
                                    <span class="status-icon" title="Internal changes (Kanban interface modifications)">
                                        ${file.hasInternalChanges ? '🟡' : '🟢'}
                                    </span>
                                </td>
                                <td class="col-external">
                                    <span class="status-icon" title="External changes (modified outside Kanban interface)">
                                        ${hasExternalChanges ? '🔄' : '🟢'}
                                    </span>
                                </td>
                                <td class="col-actions">
                                    <div class="action-buttons">
                                        ${file.hasInternalChanges ?
                                            `<button onclick="saveIndividualFile('${file.path}', ${file.isMainFile})" class="action-btn save-btn" title="Save">💾</button>` : ''}
                                        ${hasAnyChanges ?
                                            `<button onclick="reloadIndividualFile('${file.path}', ${file.isMainFile})" class="action-btn reload-btn" title="Reload">🔄</button>` : ''}
                                        <button onclick="reloadImages()" class="action-btn reload-images-btn" title="Reload images">🖼️</button>
                                    </div>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>

            <div class="icon-legend">
                <div class="legend-section">
                    <div class="legend-title">Status Icons:</div>
                    <div class="legend-items">
                        <div class="legend-item">
                            <span class="legend-icon">🟢</span>
                            <span class="legend-text">Clean / No changes</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-icon">🟡</span>
                            <span class="legend-text">Internal changes (needs saving)</span>
                        </div>
                        <div class="legend-item">
                            <span class="legend-icon">🔄</span>
                            <span class="legend-text">External changes (needs reloading)</span>
                        </div>
                    </div>
                </div>
                <div class="legend-section">
                    <div class="legend-title">Include Types:</div>
                    <div class="legend-items">
                        <div class="legend-item">
                            <span class="include-type-label regular legend-badge">[INCLUDE]</span>
                            <span class="legend-text">!!!include() - read-only</span>
                        </div>
                        <div class="legend-item">
                            <span class="include-type-label column legend-badge">[COLINC]</span>
                            <span class="legend-text">!!!columninclude() - bidirectional</span>
                        </div>
                        <div class="legend-item">
                            <span class="include-type-label task legend-badge">[TASKINC]</span>
                            <span class="legend-text">!!!taskinclude() - bidirectional</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Save an individual file
 */
function saveIndividualFile(filePath, isMainFile) {
    if (window.vscode) {
        window.vscode.postMessage({
            type: 'saveIndividualFile',
            filePath: filePath,
            isMainFile: isMainFile
        });
    }
}

/**
 * Reload an individual file from saved state
 */
function reloadIndividualFile(filePath, isMainFile) {
    if (window.vscode) {
        window.vscode.postMessage({
            type: 'reloadIndividualFile',
            filePath: filePath,
            isMainFile: isMainFile
        });
    }
}

/**
 * Open a file in VS Code
 */
function openFile(filePath) {
    if (window.vscode) {
        window.vscode.postMessage({
            type: 'openFile',
            filePath: filePath
        });
    }
}


/**
 * Reload images and media content
 */
function reloadImages() {
    // Force reload all images by appending timestamp query parameter
    const images = document.querySelectorAll('img');
    images.forEach(img => {
        if (img.src) {
            const url = new URL(img.src, window.location.href);
            url.searchParams.set('_reload', Date.now().toString());
            img.src = url.toString();
        }
    });

    // Also reload any other media elements
    const videos = document.querySelectorAll('video');
    videos.forEach(video => {
        if (video.src) {
            const url = new URL(video.src, window.location.href);
            url.searchParams.set('_reload', Date.now().toString());
            video.load();
        }
    });

}

/**
 * Clear debug cache and request fresh data
 */
function clearDebugCache() {
    trackedFilesData = {};
    refreshCount = 0;
    if (window.vscode) {
        window.vscode.postMessage({ type: 'clearTrackedFilesCache' });
    }
    refreshDebugOverlay();
}

/**
 * Reload all included files (images, videos, includes)
 */
function reloadAllIncludedFiles() {
    if (window.vscode) {
        window.vscode.postMessage({ type: 'reloadAllIncludedFiles' });
        // Refresh the debug overlay after a short delay to show updated data
        setTimeout(() => {
            refreshDebugOverlay();
        }, 500);
    }
}

/**
 * CSS styles for the debug overlay
 */
function getDebugOverlayStyles() {
    return `
        #debug-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.4);
            z-index: 10000;
            display: flex;
            align-items: flex-start;
            justify-content: flex-end;
            padding: 60px 20px 20px 20px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            pointer-events: none;
        }

        .debug-panel {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 8px;
            max-width: 500px;
            max-height: 85vh;
            width: 500px;
            // min-height: 400px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            pointer-events: auto;
            animation: slideInFromRight 0.2s ease-out;
        }

        @keyframes slideInFromRight {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }

        .debug-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--whitespace-div2);
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-titleBar-activeBackground);
        }

        .debug-header h3 {
            margin: 0;
            color: var(--vscode-titleBar-activeForeground);
        }

        .debug-controls {
            display: flex;
            gap: 4px;
            align-items: center;
        }

        .debug-btn, .debug-close {
            padding: var(--vscode-whitespace-div2);
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
        }

        .debug-btn:hover, .debug-close:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .debug-close {
            background: var(--vscode-errorForeground);
            color: white;
            font-weight: bold;
        }

        .debug-content {
            padding: var(--vscode-whitespace);
            overflow-y: auto;
            flex: 1;
        }

        .debug-timestamp {
            color: var(--vscode-descriptionForeground);
            font-size: 10px;
            white-space: nowrap;
            opacity: 0.8;
        }

        .debug-stats {
            display: flex;
            gap: 20px;
            margin-bottom: 20px;
            padding: 12px;
            background: var(--vscode-textBlockQuote-background);
            border-radius: 4px;
        }

        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
        }

        .stat-label {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .stat-value {
            font-weight: bold;
            color: var(--vscode-foreground);
        }

        .debug-group {
            margin-bottom: 24px;
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            overflow: hidden;
        }

        .debug-group h4 {
            margin: 0;
            padding: 12px 16px;
            background: var(--vscode-sideBar-background);
            color: var(--vscode-sideBar-foreground);
            font-size: 13px;
            font-weight: 600;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .debug-item {
            display: flex;
            justify-content: space-between;
            padding: 8px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .debug-item:last-child {
            border-bottom: none;
        }

        .debug-label {
            font-weight: 500;
            color: var(--vscode-foreground);
        }

        .debug-value {
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }

        .status-good { color: var(--vscode-gitDecoration-addedResourceForeground); }
        .status-warn { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
        .status-bad { color: var(--vscode-gitDecoration-deletedResourceForeground); }
        .status-unknown { color: var(--vscode-descriptionForeground); }

        .file-path {
            font-family: var(--vscode-editor-font-family);
            font-size: 11px;
            max-width: 300px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* File States Overview Styles */
        .file-states-section {
            padding: 8px;
        }

        .file-states-stats {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 16px;
            margin-bottom: 6px;
            padding: 4px;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 4px;
        }

        .stat-group {
            display: flex;
            gap: 8px;
        }

        .file-states-list {
            max-height: 300px;
            overflow-y: auto;
            scrollbar-width: thin;
        }

        .file-item {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            margin-bottom: 8px;
            padding: 8px;
            background: var(--vscode-editor-background);
        }

        .file-item.status-good {
            border-color: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .file-item.status-warn {
            border-color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }

        .file-item.status-bad {
            border-color: var(--vscode-gitDecoration-deletedResourceForeground);
        }

        .file-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        }

        .file-info {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-name {
            font-weight: bold;
            font-size: 13px;
        }

        .file-type {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            text-transform: uppercase;
        }

        .file-missing {
            color: var(--vscode-gitDecoration-deletedResourceForeground);
            font-size: 11px;
        }

        .file-actions {
            display: flex;
            gap: 4px;
        }

        .action-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 6px 10px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            white-space: nowrap;
            font-weight: 500;
        }

        .action-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .debug-btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px;
            border-radius: 4px;
            font-size: 11px;
            cursor: pointer;
            white-space: nowrap;
            font-weight: 500;
            margin-left: 4px;
        }

        .debug-btn:hover {
            background: var(--vscode-button-hoverBackground);
        }

        .save-btn {
            background: var(--vscode-gitDecoration-addedResourceForeground);
            color: white;
        }

        .reload-btn {
            background: var(--vscode-gitDecoration-modifiedResourceForeground);
            color: white;
        }

        .file-states {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 4px;
            font-size: 11px;
        }

        .state-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 2px 0;
        }

        .state-label {
            color: var(--vscode-descriptionForeground);
            margin-right: 8px;
        }

        .state-value {
            font-weight: 500;
            text-align: right;
        }

        .watcher-list, .include-list {
            padding: 8px;
        }

        .watcher-item, .include-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 6px 8px;
            margin: 4px 0;
            background: var(--vscode-list-inactiveSelectionBackground);
            border-radius: 4px;
            font-size: 12px;
        }

        .include-item {
            flex-direction: column;
            align-items: stretch;
        }

        .include-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 4px;
        }

        .include-details {
            display: flex;
            gap: 12px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .watcher-type, .include-type {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            font-weight: bold;
            text-transform: uppercase;
        }

        .watcher-type.main, .include-type.main {
            background: var(--vscode-gitDecoration-addedResourceForeground);
            color: white;
        }
        .watcher-type.include, .include-type.include {
            background: var(--vscode-gitDecoration-modifiedResourceForeground);
            color: white;
        }
        .watcher-type.dependency, .include-type.dependency {
            background: var(--vscode-gitDecoration-untrackedResourceForeground);
            color: white;
        }

        /* Specific include type styles */
        .include-type-label.include-regular, .include-type-label.regular {
            background: #4CAF50 !important;
            color: white !important;
        }
        .include-type-label.include-column, .include-type-label.column {
            background: #2196F3 !important;
            color: white !important;
        }
        .include-type-label.include-task, .include-type-label.task {
            background: #FF9800 !important;
            color: white !important;
        }
        .include-type-label {
            background: #666 !important;
            color: white !important;
        }

        .watcher-status.active { color: var(--vscode-gitDecoration-addedResourceForeground); }
        .watcher-status.inactive { color: var(--vscode-gitDecoration-deletedResourceForeground); }

        .detail-item.unsaved { color: var(--vscode-gitDecoration-modifiedResourceForeground); }
        .detail-item.saved { color: var(--vscode-gitDecoration-addedResourceForeground); }

        /* Table layout styles */
        .files-table-container {
            padding: var(--vscode-whitespace);
            background: var(--vscode-editor-background);
            border-radius: 4px;
        }

        .files-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .files-table thead {
            border-bottom: 2px solid var(--vscode-panel-border);
        }

        .files-table th {
            padding: var(--vscode-whitespace);
            text-align: left;
            font-weight: 600;
            color: var(--vscode-foreground);
            background: var(--vscode-list-inactiveSelectionBackground);
            font-size: 12px;
            white-space: nowrap;
        }

        .files-table tbody tr {
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .files-table tbody tr:last-child {
            border-bottom: none;
        }

        .files-table tbody tr.main-file {
            background: rgba(135, 206, 235, 0.05);
        }

        .files-table td {
            padding: var(--vscode-whitespace);
            vertical-align: middle;
        }

        .col-file {
            width: 60%;
            min-width: 200px;
        }

        .col-internal, .col-external {
            width: 15%;
            text-align: center;
        }

        .col-actions {
            width: 25%;
            text-align: center;
        }

        .file-path {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
            margin-bottom: 2px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
        }

        .file-directory-path {
            font-size: 9px;
            color: var(--vscode-descriptionForeground);
            font-family: var(--vscode-editor-font-family);
            margin-bottom: 3px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            max-width: 100%;
            opacity: 0.8;
            font-style: italic;
            display: flex;
            align-items: center;
            gap: 6px;
        }

        .include-type-label {
            padding: 2px 4px !important;
            border-radius: 3px !important;
            font-size: 8px !important;
            font-weight: bold !important;
            text-transform: uppercase !important;
            flex-shrink: 0 !important;
            margin-left: 6px !important;
            display: inline-block !important;
            background: #666 !important;
            color: white !important;
            z-index: 9999 !important;
            vertical-align: middle !important;
        }

        .include-type-badge {
            font-size: 8px;
            padding: 1px 4px;
            border-radius: 3px;
            margin-top: 2px;
            font-weight: bold;
            text-align: center;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: inline-block;
            min-width: 40px;
        }

        .file-name-clickable {
            display: inline-block;
            max-width: 100%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-weight: 500;
            color: var(--vscode-textLink-foreground);
            cursor: pointer;
            text-decoration: underline;
            text-decoration-color: transparent;
            transition: text-decoration-color 0.2s ease;
        }

        .file-name-clickable:hover {
            text-decoration-color: var(--vscode-textLink-foreground);
            color: var(--vscode-textLink-activeForeground);
        }

        .status-icon {
            font-size: 14px;
            cursor: help;
        }

        .status-icon.na {
            color: var(--vscode-descriptionForeground);
            opacity: 0.5;
        }

        .action-buttons {
            display: flex;
            gap: 4px;
            justify-content: left;
            align-items: center;
        }

        .action-btn {
            background: var(--vscode-button-background);
            border: 1px solid var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            padding: 4px 6px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
            white-space: nowrap;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-width: 28px;
            height: 24px;
            transition: opacity 0.15s ease;
        }

        .action-btn:hover {
            opacity: 0.8;
        }

        .save-btn {
            background: transparent;
            border: none;
            color: var(--vscode-gitDecoration-addedResourceForeground);
        }

        .reload-btn {
            background: transparent;
            border: none;
            color: var(--vscode-gitDecoration-modifiedResourceForeground);
        }

        .reload-images-btn {
            background: transparent;
            border: none;
            color: var(--vscode-foreground);
            opacity: 0.7;
        }

        /* Icon Legend styles */
        .icon-legend {
            // margin-top: 12px;
            padding-top: 4px;
            border-top: 1px solid var(--vscode-panel-border);
        }

        .legend-title {
            font-size: 11px;
            font-weight: 600;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 6px;
            text-transform: uppercase;
        }

        .legend-items {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 4px 12px;
        }

        .legend-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .legend-icon {
            font-size: 12px;
        }

        .legend-section {
            margin-bottom: 8px;
        }

        .legend-section:last-child {
            margin-bottom: 0;
        }

        .legend-badge {
            min-width: 35px;
            padding: 1px 3px;
            font-size: 7px;
        }

        .file-states-list {
            max-height: 600px;
            overflow-y: auto;
            scrollbar-width: thin;
        }
    `;
}

/**
 * Enhanced manual refresh with debug overlay toggle
 */
function enhancedManualRefresh(showDebug = false) {
    // Show debug overlay if requested
    if (showDebug) {
        showDebugOverlay();
        return;
    }

    // Call original manual refresh
    if (typeof originalManualRefresh === 'function') {
        originalManualRefresh();
    }
}

// Store original function (will be done after DOM ready)
let originalManualRefresh = null;

// Keyboard shortcut removed - now using hover behavior

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDebugOverlay);
} else {
    initializeDebugOverlay();
}

function initializeDebugOverlay() {

    // Make functions globally available immediately
    window.showDebugOverlay = showDebugOverlay;
    window.hideDebugOverlay = hideDebugOverlay;
    window.updateTrackedFilesData = updateTrackedFilesData;
    window.clearDebugCache = clearDebugCache;
    window.scheduleDebugOverlayShow = scheduleDebugOverlayShow;
    window.cancelDebugOverlayShow = cancelDebugOverlayShow;
    window.hideDebugOverlayDelayed = hideDebugOverlayDelayed;
    window.openFile = openFile;

    // Store original manual refresh function
    if (typeof window.manualRefresh === 'function') {
        originalManualRefresh = window.manualRefresh;
        window.manualRefresh = enhancedManualRefresh;
    } else {
        // Try again after a short delay
        setTimeout(() => {
            if (typeof window.manualRefresh === 'function' && !originalManualRefresh) {
                originalManualRefresh = window.manualRefresh;
                window.manualRefresh = enhancedManualRefresh;
            }
        }, 1000);
    }


    // Listen for document state changes from backend to auto-refresh overlay
    window.addEventListener('message', (event) => {
        const message = event.data;
        if (message && message.type === 'documentStateChanged') {
            if (debugOverlayVisible) {
                refreshDebugOverlay();
            }
        }
    });
}

