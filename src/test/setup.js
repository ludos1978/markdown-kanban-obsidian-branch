/**
 * Jest Test Setup
 * 
 * Global test setup and mocks
 */

// Mock VS Code API globally
global.vscode = {
    postMessage: jest.fn(),
    setState: jest.fn(),
    getState: jest.fn(() => ({})),
    workspace: {
        onDidChangeTextDocument: jest.fn(),
        onDidSaveTextDocument: jest.fn()
    },
    window: {
        showErrorMessage: jest.fn(),
        showWarningMessage: jest.fn(),
        showInformationMessage: jest.fn()
    },
    commands: {
        executeCommand: jest.fn()
    }
};

// Mock console methods to reduce noise in tests
global.console = {
    ...console,
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Mock common DOM APIs
Object.defineProperty(global.window, 'getComputedStyle', {
    value: () => ({
        getPropertyValue: () => '#ffffff'
    })
});

// Mock DataTransfer for drag/drop tests
global.DataTransfer = class DataTransfer {
    constructor() {
        this.data = {};
        this.files = [];
        this.effectAllowed = 'all';
        this.dropEffect = 'none';
    }
    
    setData(format, data) {
        this.data[format] = data;
    }
    
    getData(format) {
        return this.data[format] || '';
    }
    
    clearData() {
        this.data = {};
    }
};

// Mock File API
global.File = class File {
    constructor(parts, name, options = {}) {
        this.name = name;
        this.size = parts.join('').length;
        this.type = options.type || '';
        this.lastModified = Date.now();
    }
};

// Mock clipboard API
Object.defineProperty(global.navigator, 'clipboard', {
    value: {
        writeText: jest.fn().mockResolvedValue(),
        readText: jest.fn().mockResolvedValue('clipboard content')
    },
    configurable: true
});

// Mock requestAnimationFrame
global.requestAnimationFrame = (callback) => {
    setTimeout(callback, 16);
};

global.cancelAnimationFrame = (id) => {
    clearTimeout(id);
};

// Mock IntersectionObserver
global.IntersectionObserver = class IntersectionObserver {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
    }
    
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
    constructor(callback) {
        this.callback = callback;
    }
    
    observe() {}
    unobserve() {}
    disconnect() {}
};

// Mock markdown renderer
global.renderMarkdown = (text) => {
    // Simple mock - just return the text with basic HTML escaping
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Mock utility functions that might be needed
global.escapeHtml = (text) => {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

// Set up default tag colors for tests
global.window.tagColors = {
    urgent: {
        light: { background: '#ff4444', text: '#ffffff' },
        dark: { background: '#cc2222', text: '#ffffff' }
    },
    feature: {
        light: { background: '#44ff44', text: '#000000' },
        dark: { background: '#22cc22', text: '#ffffff' }
    },
    bug: {
        light: { background: '#ff8844', text: '#000000' },
        dark: { background: '#cc5522', text: '#ffffff' }
    }
};

// Mock performance.now for timing tests
global.performance = {
    now: jest.fn(() => Date.now())
};

// Mock TextEncoder/TextDecoder for Node.js compatibility
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

// Suppress specific warnings in tests
const originalError = console.error;
beforeEach(() => {
    jest.clearAllMocks();
});

afterEach(() => {
    // Clean up any global state
    if (global.window.pendingColumnChanges) {
        global.window.pendingColumnChanges.clear();
    }
    if (global.window.pendingTaskChanges) {
        global.window.pendingTaskChanges.clear();
    }
    if (global.window.collapsedColumns) {
        global.window.collapsedColumns.clear();
    }
    if (global.window.collapsedTasks) {
        global.window.collapsedTasks.clear();
    }
});