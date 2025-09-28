/**
 * Runtime Function Usage Tracker
 * Monitors which functions are actually called during application usage
 * Helps identify truly unused functions vs. functions that are rarely used
 */


class RuntimeTracker {
    constructor() {
        this.functionCalls = new Map(); // functionName -> { count, lastCalled, firstCalled, contexts }
        this.enabled = false;
        this.startTime = null;
        this.sessionId = this.generateSessionId();

        // Configuration
        this.config = {
            trackGlobalFunctions: true,
            trackWindowFunctions: true,
            trackEventHandlers: true,
            maxContexts: 3, // Reduced from 10 to save memory
            maxStackTraces: 1, // Reduced from 3 to save memory
            reportInterval: 60000, // Increased to 60 seconds to reduce saves
            autoSave: true,
            maxFunctions: 50 // Limit total functions tracked
        };

        // Initialize tracking if enabled
        this.init();
    }

    /**
     * Initialize the runtime tracker
     */
    init() {
        // RUNTIME TRACKER CONTROL: Set to false to disable completely
        const RUNTIME_TRACKER_ENABLED = false;

        if (!RUNTIME_TRACKER_ENABLED) {
            this.enabled = false;
            return;
        }

        // Check if tracking is enabled (can be controlled by localStorage or config)
        const trackingEnabled = localStorage.getItem('codeTrackingEnabled') === 'true' ||
                               window.DEBUG_MODE === true;

        if (trackingEnabled) {
            this.start();
        }

        // Expose control functions globally for debugging
        window.runtimeTracker = {
            start: () => this.start(),
            stop: () => this.stop(),
            getReport: () => this.generateReport(),
            clear: () => this.clear(),
            enable: () => {
                localStorage.setItem('codeTrackingEnabled', 'true');
                this.start();
            },
            disable: () => {
                localStorage.setItem('codeTrackingEnabled', 'false');
                this.stop();
            }
        };

    }

    /**
     * Start function tracking
     */
    start() {
        if (this.enabled) {return;}

        this.enabled = true;
        this.startTime = Date.now();


        // Track global functions
        if (this.config.trackGlobalFunctions) {
            this.wrapGlobalFunctions();
        }

        // Track window functions
        if (this.config.trackWindowFunctions) {
            this.wrapWindowFunctions();
        }

        // Set up periodic reporting
        if (this.config.autoSave) {
            this.reportTimer = setInterval(() => {
                this.saveReport();
            }, this.config.reportInterval);
        }

        // Track page unload to save final report
        window.addEventListener('beforeunload', () => {
            this.saveReport();
        });
    }

    /**
     * Stop function tracking
     */
    stop() {
        if (!this.enabled) {return;}

        this.enabled = false;

        if (this.reportTimer) {
            clearInterval(this.reportTimer);
        }

        this.saveReport();
    }

    /**
     * Clear tracking data
     */
    clear() {
        this.functionCalls.clear();
        this.startTime = Date.now();
    }

    /**
     * Wrap global functions for tracking
     */
    wrapGlobalFunctions() {
        // Get all global functions defined in the application
        const globalFunctions = this.findGlobalFunctions();

        globalFunctions.forEach(funcName => {
            this.wrapFunction(window, funcName, 'global');
        });
    }

    /**
     * Wrap window functions for tracking
     */
    wrapWindowFunctions() {
        // Common window functions to track
        const windowFunctions = [
            'renderBoard', 'renderMarkdown', 'focusCard', 'unfocusCard',
            'openIncludeFile', 'toggleCardFontSize', 'setFontSize',
            'handleEmptyCardDragStart', 'handleClipboardDragStart',
            'manualRefresh', 'performSort',
            'toggleAllColumns', 'updateClipboardCardSource'
        ];

        windowFunctions.forEach(funcName => {
            if (typeof window[funcName] === 'function') {
                this.wrapFunction(window, funcName, 'window');
            }
        });
    }

    /**
     * Find global functions defined by the application
     */
    findGlobalFunctions() {
        const globalFunctions = [];
        const seen = new Set();

        // Check window properties for functions
        for (const prop in window) {
            if (typeof window[prop] === 'function' &&
                !seen.has(prop) &&
                this.isApplicationFunction(prop)) {
                globalFunctions.push(prop);
                seen.add(prop);
            }
        }

        return globalFunctions;
    }

    /**
     * Check if a function is likely an application function (not built-in)
     */
    isApplicationFunction(funcName) {
        // Skip built-in browser functions
        const builtInFunctions = [
            'alert', 'confirm', 'prompt', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
            'requestAnimationFrame', 'cancelAnimationFrame', 'fetch', 'addEventListener', 'removeEventListener',
            'querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent'
        ];

        if (builtInFunctions.includes(funcName)) {
            return false;
        }

        // Skip constructor functions (usually start with capital letter)
        if (/^[A-Z]/.test(funcName) && funcName !== funcName.toLowerCase()) {
            return false;
        }

        // Skip very short names (likely temporary variables)
        if (funcName.length <= 2) {
            return false;
        }

        return true;
    }

    /**
     * Wrap a function to track its usage
     */
    wrapFunction(obj, funcName, context) {
        const originalFunc = obj[funcName];
        if (typeof originalFunc !== 'function') {return;}

        const tracker = this;

        obj[funcName] = function(...args) {
            if (tracker.enabled) {
                tracker.recordFunctionCall(funcName, context, {
                    args: args.length,
                    timestamp: Date.now(),
                    stackTrace: tracker.getStackTrace()
                });
            }

            return originalFunc.apply(this, args);
        };

        // Preserve function properties
        Object.defineProperty(obj[funcName], 'name', { value: funcName });
        obj[funcName]._original = originalFunc;
        obj[funcName]._tracked = true;
    }

    /**
     * Record a function call
     */
    recordFunctionCall(funcName, context, details) {
        // Limit total number of functions tracked to prevent memory issues
        if (!this.functionCalls.has(funcName) && this.functionCalls.size >= this.config.maxFunctions) {
            return; // Skip new functions if we've hit the limit
        }

        if (!this.functionCalls.has(funcName)) {
            this.functionCalls.set(funcName, {
                count: 0,
                firstCalled: details.timestamp,
                lastCalled: details.timestamp,
                contexts: [],
                totalArgs: 0,
                stackTraces: []
            });
        }

        const record = this.functionCalls.get(funcName);
        record.count++;
        record.lastCalled = details.timestamp;
        record.totalArgs += details.args;

        // Store context information (limited to maxContexts)
        if (record.contexts.length < this.config.maxContexts) {
            record.contexts.push({
                context,
                timestamp: details.timestamp,
                args: details.args
            });
        }

        // Store stack traces for debugging (limited)
        if (record.stackTraces.length < this.config.maxStackTraces) {
            record.stackTraces.push(details.stackTrace);
        }
    }

    /**
     * Get current stack trace
     */
    getStackTrace() {
        try {
            throw new Error();
        } catch (e) {
            return e.stack ? e.stack.split('\n').slice(0, 5).join('\n') : 'No stack trace available';
        }
    }

    /**
     * Generate usage report
     */
    generateReport() {
        const now = Date.now();
        const sessionDuration = this.startTime ? now - this.startTime : 0;

        const report = {
            metadata: {
                sessionId: this.sessionId,
                startTime: this.startTime,
                endTime: now,
                duration: sessionDuration,
                enabled: this.enabled,
                totalFunctions: this.functionCalls.size
            },
            summary: {
                totalCalls: Array.from(this.functionCalls.values()).reduce((sum, record) => sum + record.count, 0),
                uniqueFunctions: this.functionCalls.size,
                mostCalled: this.getMostCalledFunctions(5),
                leastCalled: this.getLeastCalledFunctions(5),
                recentlyCalled: this.getRecentlyCalledFunctions(5)
            },
            functions: []
        };

        // Detailed function data
        for (const [funcName, record] of this.functionCalls) {
            report.functions.push({
                name: funcName,
                count: record.count,
                firstCalled: record.firstCalled,
                lastCalled: record.lastCalled,
                avgArgs: record.totalArgs / record.count,
                frequency: record.count / (sessionDuration / 1000), // calls per second
                contexts: record.contexts,
                stackTraces: record.stackTraces
            });
        }

        // Sort by call count (descending)
        report.functions.sort((a, b) => b.count - a.count);

        return report;
    }

    /**
     * Get most called functions
     */
    getMostCalledFunctions(limit) {
        return Array.from(this.functionCalls.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, limit)
            .map(([name, record]) => ({ name, count: record.count }));
    }

    /**
     * Get least called functions
     */
    getLeastCalledFunctions(limit) {
        return Array.from(this.functionCalls.entries())
            .sort((a, b) => a[1].count - b[1].count)
            .slice(0, limit)
            .map(([name, record]) => ({ name, count: record.count }));
    }

    /**
     * Get recently called functions
     */
    getRecentlyCalledFunctions(limit) {
        return Array.from(this.functionCalls.entries())
            .sort((a, b) => b[1].lastCalled - a[1].lastCalled)
            .slice(0, limit)
            .map(([name, record]) => ({ name, lastCalled: new Date(record.lastCalled) }));
    }

    /**
     * Save report to localStorage or send to backend
     */
    saveReport() {
        if (!this.enabled) {return;}

        // Clean up old reports first to free space
        this.cleanupOldReports();

        const report = this.generateReport();

        // Save to localStorage with size check
        const storageKey = `runtimeReport_${this.sessionId}`;
        try {
            const reportJson = JSON.stringify(report);

            // Check if report is too large (limit to 100KB)
            if (reportJson.length > 100000) {
                console.warn('Runtime report too large, creating summary version');
                const summaryReport = this.generateSummaryReport();
                localStorage.setItem(storageKey, JSON.stringify(summaryReport));
            } else {
                localStorage.setItem(storageKey, reportJson);
            }
        } catch (e) {
            console.warn('Failed to save runtime report to localStorage:', e);
            // Try to save a minimal summary instead
            try {
                const minimalReport = {
                    metadata: report.metadata,
                    summary: report.summary
                };
                localStorage.setItem(storageKey, JSON.stringify(minimalReport));
            } catch (e2) {
                console.warn('Failed to save even minimal runtime report:', e2);
                this.disable(); // Disable tracking to prevent repeated failures
            }
        }

        // Send to backend if available
        if (typeof vscode !== 'undefined') {
            vscode.postMessage({
                type: 'runtimeTrackingReport',
                report: report
            });
        }

    }

    /**
     * Generate a summary version of the report (smaller)
     */
    generateSummaryReport() {
        const now = Date.now();
        const sessionDuration = this.startTime ? now - this.startTime : 0;

        return {
            metadata: {
                sessionId: this.sessionId,
                startTime: this.startTime,
                endTime: now,
                duration: sessionDuration,
                enabled: this.enabled,
                totalFunctions: this.functionCalls.size,
                isSummary: true
            },
            summary: {
                totalCalls: Array.from(this.functionCalls.values()).reduce((sum, record) => sum + record.count, 0),
                uniqueFunctions: this.functionCalls.size,
                mostCalled: this.getMostCalledFunctions(5),
                leastCalled: this.getLeastCalledFunctions(5),
                recentlyCalled: this.getRecentlyCalledFunctions(5)
            }
            // No detailed function data to save space
        };
    }

    /**
     * Clean up old runtime reports from localStorage
     */
    cleanupOldReports() {
        try {
            const keys = Object.keys(localStorage);
            const reportKeys = keys.filter(key => key.startsWith('runtimeReport_'));

            // Keep only the 3 most recent reports
            if (reportKeys.length > 3) {
                reportKeys.sort(); // Sort by timestamp in key
                const keysToDelete = reportKeys.slice(0, reportKeys.length - 3);

                keysToDelete.forEach(key => {
                    try {
                        localStorage.removeItem(key);
                    } catch (e) {
                        // Ignore individual deletion failures
                    }
                });
            }
        } catch (e) {
            console.warn('Failed to cleanup old runtime reports:', e);
        }
    }

    /**
     * Disable tracking and clean up
     */
    disable() {
        localStorage.setItem('codeTrackingEnabled', 'false');
        this.stop();
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }
}

// Initialize runtime tracker
if (typeof window !== 'undefined') {
    window.RuntimeTracker = RuntimeTracker;

    // Auto-start if in debug mode or explicitly enabled
    const tracker = new RuntimeTracker();

    // Expose for manual control
    window.startFunctionTracking = () => tracker.start();
    window.stopFunctionTracking = () => tracker.stop();
    window.getFunctionReport = () => tracker.generateReport();


    // Check if it gets overwritten
    setTimeout(() => {
        if (!window.runtimeTracker) {
            window.runtimeTracker = {
                start: () => tracker.start(),
                stop: () => tracker.stop(),
                getReport: () => tracker.generateReport(),
                clear: () => tracker.clear(),
                enable: () => {
                    localStorage.setItem('codeTrackingEnabled', 'true');
                    tracker.start();
                },
                disable: () => {
                    localStorage.setItem('codeTrackingEnabled', 'false');
                    tracker.stop();
                }
            };
        }
    }, 1000);
} else {
}