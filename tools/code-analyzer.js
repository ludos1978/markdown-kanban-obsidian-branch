#!/usr/bin/env node

/**
 * Code Analyzer Tool
 * Analyzes JavaScript/TypeScript code to find function definitions and usage
 * Helps identify unused or obsolete functions for cleanup
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

class CodeAnalyzer {
    constructor() {
        this.functions = new Map(); // functionName -> { file, line, type, calls: [] }
        this.calls = new Map(); // functionName -> [{ file, line }]
        this.exportedFunctions = new Set();
        this.importedFunctions = new Set();
        this.globalFunctions = new Set();
        this.eventHandlers = new Set();
        this.unusedFunctions = new Set();

        // Patterns for finding functions
        this.patterns = {
            // Function declarations
            functionDeclaration: /function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,
            arrowFunction: /(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g,
            methodDefinition: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/g,
            objectMethod: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*function/g,
            classMethod: /(?:static\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/g,

            // Function calls
            functionCall: /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g,

            // Exports and imports
            namedExport: /export\s+(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|(?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|class\s+([a-zA-Z_$][a-zA-Z0-9_$]*))/g,
            defaultExport: /export\s+default\s+(?:function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)|([a-zA-Z_$][a-zA-Z0-9_$]*))/g,
            namedImport: /import\s*{([^}]+)}\s*from/g,
            defaultImport: /import\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s+from/g,

            // Global assignments
            globalAssignment: /window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g,

            // Event handlers
            eventHandler: /(?:on[A-Z][a-zA-Z]*|addEventListener)\s*\(\s*['"`]?([^'"`\s,)]+)['"`]?\s*,\s*([a-zA-Z_$][a-zA-Z0-9_$]*)/g,
            htmlEventHandler: /on[a-z]+\s*=\s*['"`]([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g
        };
    }

    /**
     * Analyze all JavaScript/TypeScript files in the project
     */
    async analyze(rootDir = '.') {
        console.log('🔍 Starting code analysis...');

        const files = this.findSourceFiles(rootDir);
        console.log(`📁 Found ${files.length} source files to analyze`);

        for (const file of files) {
            await this.analyzeFile(file);
        }

        this.findUnusedFunctions();
        return this.generateReport();
    }

    /**
     * Find all JavaScript and TypeScript source files
     */
    findSourceFiles(dir) {
        const files = [];
        const extensions = ['.js', '.ts', '.jsx', '.tsx'];
        const excludeDirs = ['node_modules', 'dist', '.git', '.vscode', 'out'];

        const traverse = (currentDir) => {
            const items = fs.readdirSync(currentDir);

            for (const item of items) {
                const fullPath = path.join(currentDir, item);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    if (!excludeDirs.includes(item)) {
                        traverse(fullPath);
                    }
                } else if (extensions.includes(path.extname(item))) {
                    files.push(fullPath);
                }
            }
        };

        traverse(dir);
        return files;
    }

    /**
     * Analyze a single file for function definitions and calls
     */
    async analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = path.relative('.', filePath);

            console.log(`📄 Analyzing: ${relativePath}`);

            // Find function definitions
            this.findFunctionDefinitions(content, relativePath);

            // Find function calls
            this.findFunctionCalls(content, relativePath);

            // Find exports and imports
            this.findExportsAndImports(content, relativePath);

            // Find global assignments and event handlers
            this.findGlobalReferences(content, relativePath);

        } catch (error) {
            console.error(`❌ Error analyzing ${filePath}:`, error.message);
        }
    }

    /**
     * Find function definitions in file content
     */
    findFunctionDefinitions(content, filePath) {
        const lines = content.split('\n');

        // Function declarations
        let match;
        this.patterns.functionDeclaration.lastIndex = 0;
        while ((match = this.patterns.functionDeclaration.exec(content)) !== null) {
            const lineNumber = this.getLineNumber(content, match.index);
            this.addFunction(match[1], filePath, lineNumber, 'declaration');
        }

        // Arrow functions
        this.patterns.arrowFunction.lastIndex = 0;
        while ((match = this.patterns.arrowFunction.exec(content)) !== null) {
            const lineNumber = this.getLineNumber(content, match.index);
            this.addFunction(match[1], filePath, lineNumber, 'arrow');
        }

        // Object methods (basic detection)
        lines.forEach((line, index) => {
            const methodMatch = line.match(/^\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*{/);
            if (methodMatch) {
                this.addFunction(methodMatch[1], filePath, index + 1, 'method');
            }
        });
    }

    /**
     * Find function calls in file content
     */
    findFunctionCalls(content, filePath) {
        let match;
        this.patterns.functionCall.lastIndex = 0;

        while ((match = this.patterns.functionCall.exec(content)) !== null) {
            const functionName = match[1];
            const lineNumber = this.getLineNumber(content, match.index);

            // Skip common keywords and built-in functions
            if (this.isBuiltInOrKeyword(functionName)) {
                continue;
            }

            this.addFunctionCall(functionName, filePath, lineNumber);
        }
    }

    /**
     * Find exports and imports
     */
    findExportsAndImports(content, filePath) {
        let match;

        // Named exports
        this.patterns.namedExport.lastIndex = 0;
        while ((match = this.patterns.namedExport.exec(content)) !== null) {
            const functionName = match[1] || match[2] || match[3];
            if (functionName) {
                this.exportedFunctions.add(functionName);
            }
        }

        // Default exports
        this.patterns.defaultExport.lastIndex = 0;
        while ((match = this.patterns.defaultExport.exec(content)) !== null) {
            const functionName = match[1] || match[2];
            if (functionName) {
                this.exportedFunctions.add(functionName);
            }
        }

        // Named imports
        this.patterns.namedImport.lastIndex = 0;
        while ((match = this.patterns.namedImport.exec(content)) !== null) {
            const imports = match[1].split(',').map(s => s.trim());
            imports.forEach(imp => {
                const cleanImport = imp.replace(/\s+as\s+\w+/, '').trim();
                this.importedFunctions.add(cleanImport);
            });
        }
    }

    /**
     * Find global references and event handlers
     */
    findGlobalReferences(content, filePath) {
        let match;

        // Global assignments (window.functionName = ...)
        this.patterns.globalAssignment.lastIndex = 0;
        while ((match = this.patterns.globalAssignment.exec(content)) !== null) {
            this.globalFunctions.add(match[1]);
        }

        // Event handlers
        this.patterns.eventHandler.lastIndex = 0;
        while ((match = this.patterns.eventHandler.exec(content)) !== null) {
            if (match[2]) {
                this.eventHandlers.add(match[2]);
            }
        }

        // HTML event handlers
        this.patterns.htmlEventHandler.lastIndex = 0;
        while ((match = this.patterns.htmlEventHandler.exec(content)) !== null) {
            this.eventHandlers.add(match[1]);
        }
    }

    /**
     * Add function definition to tracking
     */
    addFunction(name, file, line, type) {
        if (!this.functions.has(name)) {
            this.functions.set(name, {
                file,
                line,
                type,
                calls: []
            });
        }
    }

    /**
     * Add function call to tracking
     */
    addFunctionCall(name, file, line) {
        if (!this.calls.has(name)) {
            this.calls.set(name, []);
        }
        this.calls.get(name).push({ file, line });
    }

    /**
     * Find unused functions based on analysis
     */
    findUnusedFunctions() {
        console.log('🔍 Analyzing function usage...');

        for (const [functionName, functionInfo] of this.functions) {
            const hasCalls = this.calls.has(functionName) && this.calls.get(functionName).length > 0;
            const isExported = this.exportedFunctions.has(functionName);
            const isGlobal = this.globalFunctions.has(functionName);
            const isEventHandler = this.eventHandlers.has(functionName);

            // A function is potentially unused if:
            // 1. It has no calls AND
            // 2. It's not exported AND
            // 3. It's not assigned to global scope AND
            // 4. It's not used as an event handler
            if (!hasCalls && !isExported && !isGlobal && !isEventHandler) {
                this.unusedFunctions.add(functionName);
            }
        }
    }

    /**
     * Generate analysis report
     */
    generateReport() {
        const report = {
            summary: {
                totalFunctions: this.functions.size,
                totalCalls: Array.from(this.calls.values()).reduce((sum, calls) => sum + calls.length, 0),
                unusedFunctions: this.unusedFunctions.size,
                exportedFunctions: this.exportedFunctions.size,
                globalFunctions: this.globalFunctions.size,
                eventHandlers: this.eventHandlers.size
            },
            unusedFunctions: [],
            functionUsage: [],
            recommendations: []
        };

        // Detailed unused functions report
        for (const functionName of this.unusedFunctions) {
            const functionInfo = this.functions.get(functionName);
            if (functionInfo) {
                report.unusedFunctions.push({
                    name: functionName,
                    file: functionInfo.file,
                    line: functionInfo.line,
                    type: functionInfo.type
                });
            }
        }

        // Function usage statistics
        for (const [functionName, functionInfo] of this.functions) {
            const callCount = this.calls.has(functionName) ? this.calls.get(functionName).length : 0;
            report.functionUsage.push({
                name: functionName,
                file: functionInfo.file,
                line: functionInfo.line,
                type: functionInfo.type,
                callCount,
                isExported: this.exportedFunctions.has(functionName),
                isGlobal: this.globalFunctions.has(functionName),
                isEventHandler: this.eventHandlers.has(functionName)
            });
        }

        // Sort by call count (least used first)
        report.functionUsage.sort((a, b) => a.callCount - b.callCount);

        // Generate recommendations
        report.recommendations = this.generateRecommendations(report);

        // Write report to file
        const reportPath = 'code-analysis-report.json';
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        console.log('\n📊 Code Analysis Complete!');
        console.log(`📋 Report saved to: ${reportPath}`);

        this.printSummary(report);
        this.printUnusedFunctions(report);

        return report;
    }

    /**
     * Generate cleanup recommendations
     */
    generateRecommendations(report) {
        const recommendations = [];

        if (report.unusedFunctions.length > 0) {
            recommendations.push({
                type: 'cleanup',
                priority: 'high',
                title: `Remove ${report.unusedFunctions.length} unused functions`,
                description: 'These functions appear to be unused and can be safely removed to reduce code bloat.'
            });
        }

        const lowUsageFunctions = report.functionUsage.filter(f =>
            f.callCount === 1 && !f.isExported && !f.isGlobal && !f.isEventHandler
        );

        if (lowUsageFunctions.length > 0) {
            recommendations.push({
                type: 'review',
                priority: 'medium',
                title: `Review ${lowUsageFunctions.length} rarely used functions`,
                description: 'These functions are called only once. Consider if they add value or could be inlined.'
            });
        }

        return recommendations;
    }

    /**
     * Print analysis summary
     */
    printSummary(report) {
        console.log('\n📊 Analysis Summary:');
        console.log(`   Functions defined: ${report.summary.totalFunctions}`);
        console.log(`   Function calls: ${report.summary.totalCalls}`);
        console.log(`   Unused functions: ${report.summary.unusedFunctions}`);
        console.log(`   Exported functions: ${report.summary.exportedFunctions}`);
        console.log(`   Global functions: ${report.summary.globalFunctions}`);
        console.log(`   Event handlers: ${report.summary.eventHandlers}`);
    }

    /**
     * Print unused functions list
     */
    printUnusedFunctions(report) {
        if (report.unusedFunctions.length > 0) {
            console.log('\n🗑️  Potentially Unused Functions:');
            report.unusedFunctions.forEach(func => {
                console.log(`   ${func.name} (${func.type}) - ${func.file}:${func.line}`);
            });
        }
    }

    /**
     * Helper: Get line number from character index
     */
    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    /**
     * Helper: Check if function name is a built-in or keyword
     */
    isBuiltInOrKeyword(name) {
        const builtIns = [
            // JavaScript built-ins
            'console', 'document', 'window', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
            'parseInt', 'parseFloat', 'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent',
            'JSON', 'Math', 'Date', 'Array', 'Object', 'String', 'Number', 'Boolean', 'RegExp',
            'Promise', 'fetch', 'addEventListener', 'removeEventListener', 'querySelector', 'querySelectorAll',
            'getElementById', 'getElementsByClassName', 'getElementsByTagName', 'createElement',

            // Common keywords
            'function', 'return', 'if', 'else', 'for', 'while', 'switch', 'case', 'break', 'continue',
            'try', 'catch', 'finally', 'throw', 'new', 'delete', 'typeof', 'instanceof',

            // VS Code API
            'vscode', 'require', 'module', 'exports', 'process',

            // Common library functions
            'require', 'import', 'export', 'default'
        ];

        return builtIns.includes(name) ||
               name.length <= 2 || // Skip very short names (likely variables)
               /^[A-Z_][A-Z0-9_]*$/.test(name); // Skip constants
    }
}

// CLI usage
if (require.main === module) {
    const analyzer = new CodeAnalyzer();
    const rootDir = process.argv[2] || '.';

    analyzer.analyze(rootDir).catch(console.error);
}

module.exports = CodeAnalyzer;