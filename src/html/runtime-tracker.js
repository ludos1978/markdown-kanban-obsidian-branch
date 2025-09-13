/**
 * Runtime Function Usage Tracker
 * Monitors which functions are actually called during application usage
 * Helps identify truly unused functions vs. functions that are rarely used
 */

console.log('🔍 Runtime tracker script loading...');

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
            maxContexts: 10, // Max number of call contexts to store per function
            reportInterval: 30000, // 30 seconds
            autoSave: true
        };

        // Initialize tracking if enabled
        this.init();
    }

    /**
     * Initialize the runtime tracker
     */
    init() {
        console.log('🔍 Init method called');

        // Check if tracking is enabled (can be controlled by localStorage or config)
        const trackingEnabled = localStorage.getItem('codeTrackingEnabled') === 'true' ||
                               window.DEBUG_MODE === true;

        console.log('🔍 Tracking enabled?', trackingEnabled);

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

        console.log('🔍 window.runtimeTracker set to:', window.runtimeTracker);
    }

    /**
     * Start function tracking
     */
    start() {
        if (this.enabled) return;

        this.enabled = true;
        this.startTime = Date.now();

        console.log('🔍 Runtime function tracking started');

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
        if (!this.enabled) return;

        this.enabled = false;
        console.log('⏹️ Runtime function tracking stopped');

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
        console.log('🗑️ Runtime tracking data cleared');
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
            'refreshIncludes', 'manualRefresh', 'performSort',
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
        if (typeof originalFunc !== 'function') return;

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
        if (record.stackTraces.length < 3) {
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
        if (!this.enabled) return;

        const report = this.generateReport();

        // Save to localStorage
        const storageKey = `runtimeReport_${this.sessionId}`;
        try {
            localStorage.setItem(storageKey, JSON.stringify(report));
        } catch (e) {
            console.warn('Failed to save runtime report to localStorage:', e);
        }

        // Send to backend if available
        if (typeof vscode !== 'undefined') {
            vscode.postMessage({
                type: 'runtimeTrackingReport',
                report: report
            });
        }

        console.log('📊 Runtime tracking report saved:', {
            functions: report.metadata.totalFunctions,
            calls: report.summary.totalCalls,
            duration: Math.round(report.metadata.duration / 1000) + 's'
        });
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
    console.log('🔍 Initializing runtime tracker...');
    window.RuntimeTracker = RuntimeTracker;

    // Auto-start if in debug mode or explicitly enabled
    const tracker = new RuntimeTracker();
    console.log('🔍 Runtime tracker instance created:', tracker);

    // Expose for manual control
    window.startFunctionTracking = () => tracker.start();
    window.stopFunctionTracking = () => tracker.stop();
    window.getFunctionReport = () => tracker.generateReport();

    console.log('🔍 Runtime tracker initialization complete. Access via window.runtimeTracker');

    // Check if it gets overwritten
    setTimeout(() => {
        console.log('🔍 Delayed check - window.runtimeTracker is:', window.runtimeTracker);
        if (!window.runtimeTracker) {
            console.log('🔍 window.runtimeTracker was overwritten! Re-setting...');
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
            console.log('🔍 window.runtimeTracker re-set to:', window.runtimeTracker);
        }
    }, 1000);
} else {
    console.log('🔍 Window not available - runtime tracker not initialized');
}