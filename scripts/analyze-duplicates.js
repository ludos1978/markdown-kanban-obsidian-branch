#!/usr/bin/env node

/**
 * Code Duplication Analysis Tool
 *
 * This script analyzes the codebase for duplicate functions, patterns, and structures
 * to help identify optimization opportunities.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class CodeAnalyzer {
    constructor() {
        this.functions = new Map(); // hash -> {files: [], code: string, name: string}
        this.patterns = new Map();  // pattern -> files[]
        this.imports = new Map();   // import -> files[]
        this.results = {
            duplicateFunctions: [],
            similarPatterns: [],
            redundantImports: [],
            deadCode: [],
            summary: {}
        };
    }

    /**
     * Analyze all JavaScript and TypeScript files in the project
     */
    analyze(rootDir = 'src') {
        console.log('🔍 Starting code analysis...');

        this.walkDirectory(rootDir);
        this.findDuplicates();
        this.findSimilarPatterns();
        this.findRedundantImports();
        this.generateSummary();

        return this.results;
    }

    /**
     * Recursively walk directory and analyze files
     */
    walkDirectory(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                this.walkDirectory(fullPath);
            } else if (entry.isFile() && this.isAnalyzableFile(entry.name)) {
                this.analyzeFile(fullPath);
            }
        }
    }

    /**
     * Check if file should be analyzed
     */
    isAnalyzableFile(filename) {
        return /\.(js|ts|jsx|tsx)$/.test(filename) &&
               !filename.endsWith('.d.ts') &&
               !filename.includes('.test.') &&
               !filename.includes('.spec.');
    }

    /**
     * Analyze a single file
     */
    analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = path.relative(process.cwd(), filePath);

            // Extract functions
            this.extractFunctions(content, relativePath);

            // Extract imports
            this.extractImports(content, relativePath);

            // Look for common patterns
            this.extractPatterns(content, relativePath);

        } catch (error) {
            console.warn(`⚠️  Could not analyze ${filePath}: ${error.message}`);
        }
    }

    /**
     * Extract function definitions from file content
     */
    extractFunctions(content, filePath) {
        // Regex patterns for different function types
        const patterns = [
            // Regular functions: function name() {}
            /function\s+(\w+)\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
            // Arrow functions assigned to variables: const name = () => {}
            /(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|\w+)\s*=>\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
            // Method definitions: methodName() {}
            /(\w+)\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g,
            // Static methods: static methodName() {}
            /static\s+(\w+)\s*\([^)]*\)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g
        ];

        patterns.forEach(pattern => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                const [fullMatch, name, body] = match;
                const normalizedBody = this.normalizeCode(body);
                const hash = this.hashCode(normalizedBody);

                if (!this.functions.has(hash)) {
                    this.functions.set(hash, {
                        name,
                        code: normalizedBody,
                        files: []
                    });
                }

                this.functions.get(hash).files.push({
                    path: filePath,
                    line: this.getLineNumber(content, match.index),
                    fullCode: fullMatch
                });
            }
        });
    }

    /**
     * Extract import statements
     */
    extractImports(content, filePath) {
        const importPattern = /^import\s+.*?from\s+['"`]([^'"`]+)['"`]/gm;
        const requirePattern = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

        let match;

        // ES6 imports
        while ((match = importPattern.exec(content)) !== null) {
            const [fullMatch, moduleName] = match;
            this.addImport(moduleName, filePath, fullMatch);
        }

        // CommonJS requires
        while ((match = requirePattern.exec(content)) !== null) {
            const [fullMatch, moduleName] = match;
            this.addImport(moduleName, filePath, fullMatch);
        }
    }

    /**
     * Add import to tracking
     */
    addImport(moduleName, filePath, fullImport) {
        if (!this.imports.has(moduleName)) {
            this.imports.set(moduleName, []);
        }

        this.imports.get(moduleName).push({
            path: filePath,
            statement: fullImport
        });
    }

    /**
     * Extract common code patterns
     */
    extractPatterns(content, filePath) {
        // Common patterns to look for
        const patterns = [
            { name: 'errorHandling', pattern: /try\s*\{[^}]+\}\s*catch\s*\([^)]*\)\s*\{[^}]+\}/g },
            { name: 'consoleLog', pattern: /console\.(log|warn|error|debug)\s*\([^)]*\)/g },
            { name: 'nullCheck', pattern: /if\s*\(\s*[^)]+\s*[!=]==?\s*(null|undefined)\s*\)/g },
            { name: 'typeCheck', pattern: /typeof\s+\w+\s*[!=]==?\s*['"`]\w+['"`]/g },
            { name: 'asyncAwait', pattern: /async\s+\w+|await\s+\w+/g }
        ];

        patterns.forEach(({ name, pattern }) => {
            let match;
            while ((match = pattern.exec(content)) !== null) {
                if (!this.patterns.has(name)) {
                    this.patterns.set(name, []);
                }

                this.patterns.get(name).push({
                    path: filePath,
                    line: this.getLineNumber(content, match.index),
                    code: match[0]
                });
            }
        });
    }

    /**
     * Find duplicate functions
     */
    findDuplicates() {
        this.functions.forEach((func, hash) => {
            if (func.files.length > 1) {
                this.results.duplicateFunctions.push({
                    hash,
                    name: func.name,
                    code: func.code,
                    files: func.files,
                    duplicateCount: func.files.length
                });
            }
        });

        // Sort by duplicate count (highest first)
        this.results.duplicateFunctions.sort((a, b) => b.duplicateCount - a.duplicateCount);
    }

    /**
     * Find similar patterns that could be consolidated
     */
    findSimilarPatterns() {
        this.patterns.forEach((occurrences, patternName) => {
            if (occurrences.length > 3) { // Only report patterns that occur frequently
                this.results.similarPatterns.push({
                    pattern: patternName,
                    count: occurrences.length,
                    files: [...new Set(occurrences.map(o => o.path))].length,
                    occurrences: occurrences.slice(0, 10) // Limit to first 10 for readability
                });
            }
        });

        // Sort by frequency
        this.results.similarPatterns.sort((a, b) => b.count - a.count);
    }

    /**
     * Find redundant imports
     */
    findRedundantImports() {
        this.imports.forEach((files, moduleName) => {
            if (files.length > 2) { // Module imported in multiple files
                this.results.redundantImports.push({
                    module: moduleName,
                    importCount: files.length,
                    files: files.map(f => f.path)
                });
            }
        });

        // Sort by import frequency
        this.results.redundantImports.sort((a, b) => b.importCount - a.importCount);
    }

    /**
     * Generate analysis summary
     */
    generateSummary() {
        this.results.summary = {
            totalFiles: this.getTotalFilesAnalyzed(),
            totalFunctions: this.functions.size,
            duplicateFunctions: this.results.duplicateFunctions.length,
            potentialDuplicateLines: this.calculateDuplicateLines(),
            commonPatterns: this.results.similarPatterns.length,
            redundantImports: this.results.redundantImports.length,
            analysisDate: new Date().toISOString()
        };
    }

    /**
     * Helper methods
     */
    normalizeCode(code) {
        return code
            .replace(/\s+/g, ' ')           // Normalize whitespace
            .replace(/\/\/.*$/gm, '')       // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .trim();
    }

    hashCode(str) {
        return crypto.createHash('md5').update(str).digest('hex');
    }

    getLineNumber(content, index) {
        return content.substring(0, index).split('\n').length;
    }

    getTotalFilesAnalyzed() {
        const allFiles = new Set();
        this.functions.forEach(func => {
            func.files.forEach(file => allFiles.add(file.path));
        });
        return allFiles.size;
    }

    calculateDuplicateLines() {
        return this.results.duplicateFunctions.reduce((total, dup) => {
            return total + (dup.duplicateCount - 1) * dup.code.split('\n').length;
        }, 0);
    }
}

/**
 * Report generator
 */
class ReportGenerator {
    static generateReport(results) {
        console.log('\n📊 CODE ANALYSIS REPORT');
        console.log('=' .repeat(50));

        this.printSummary(results.summary);
        this.printDuplicateFunctions(results.duplicateFunctions);
        this.printSimilarPatterns(results.similarPatterns);
        this.printRedundantImports(results.redundantImports);

        return this.generateMarkdownReport(results);
    }

    static printSummary(summary) {
        console.log('\n📈 SUMMARY');
        console.log(`Files analyzed: ${summary.totalFiles}`);
        console.log(`Functions found: ${summary.totalFunctions}`);
        console.log(`Duplicate functions: ${summary.duplicateFunctions}`);
        console.log(`Potential duplicate lines: ${summary.potentialDuplicateLines}`);
        console.log(`Common patterns: ${summary.commonPatterns}`);
        console.log(`Redundant imports: ${summary.redundantImports}`);
    }

    static printDuplicateFunctions(duplicates) {
        if (duplicates.length === 0) {
            console.log('\n✅ No duplicate functions found!');
            return;
        }

        console.log('\n🔄 DUPLICATE FUNCTIONS');
        duplicates.slice(0, 5).forEach((dup, index) => {
            console.log(`\n${index + 1}. Function: ${dup.name} (${dup.duplicateCount} copies)`);
            dup.files.forEach(file => {
                console.log(`   📄 ${file.path}:${file.line}`);
            });
        });
    }

    static printSimilarPatterns(patterns) {
        if (patterns.length === 0) return;

        console.log('\n🔍 COMMON PATTERNS');
        patterns.slice(0, 3).forEach((pattern, index) => {
            console.log(`\n${index + 1}. ${pattern.pattern}: ${pattern.count} occurrences in ${pattern.files} files`);
        });
    }

    static printRedundantImports(imports) {
        if (imports.length === 0) return;

        console.log('\n📦 FREQUENT IMPORTS');
        imports.slice(0, 5).forEach((imp, index) => {
            console.log(`${index + 1}. ${imp.module}: imported ${imp.importCount} times`);
        });
    }

    static generateMarkdownReport(results) {
        const markdown = `# Code Analysis Report

Generated: ${new Date().toISOString()}

## Summary

- **Files analyzed**: ${results.summary.totalFiles}
- **Functions found**: ${results.summary.totalFunctions}
- **Duplicate functions**: ${results.summary.duplicateFunctions}
- **Potential duplicate lines**: ${results.summary.potentialDuplicateLines}

${results.duplicateFunctions.length > 0 ? `
## Duplicate Functions

${results.duplicateFunctions.map((dup, i) => `
### ${i + 1}. ${dup.name} (${dup.duplicateCount} copies)

${dup.files.map(file => `- \`${file.path}:${file.line}\``).join('\n')}

\`\`\`javascript
${dup.code.substring(0, 200)}${dup.code.length > 200 ? '...' : ''}
\`\`\`
`).join('\n')}
` : '## ✅ No duplicate functions found!'}

${results.similarPatterns.length > 0 ? `
## Common Patterns

${results.similarPatterns.slice(0, 5).map((pattern, i) => `
### ${i + 1}. ${pattern.pattern}
- **Occurrences**: ${pattern.count}
- **Files**: ${pattern.files}
`).join('\n')}
` : ''}

## Recommendations

1. **Consolidate duplicate functions** into shared utilities
2. **Create pattern-based helper functions** for common operations
3. **Consider creating shared modules** for frequently imported dependencies
4. **Implement consistent error handling** patterns
`;

        return markdown;
    }
}

// Main execution
if (require.main === module) {
    const analyzer = new CodeAnalyzer();
    const results = analyzer.analyze();
    const report = ReportGenerator.generateReport(results);

    // Save report to file
    fs.writeFileSync('code-analysis-report.md', report);
    console.log('\n💾 Full report saved to code-analysis-report.md');
}

module.exports = { CodeAnalyzer, ReportGenerator };