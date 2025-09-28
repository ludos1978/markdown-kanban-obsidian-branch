#!/usr/bin/env node

/**
 * Code Structure Analysis Tool
 *
 * Analyzes the codebase structure to identify architectural patterns,
 * dependencies, and opportunities for improvement.
 */

const fs = require('fs');
const path = require('path');

class StructureAnalyzer {
    constructor() {
        this.modules = new Map();      // module -> info
        this.dependencies = new Map(); // from -> to[]
        this.exports = new Map();      // file -> exports[]
        this.imports = new Map();      // file -> imports[]
        this.fileStats = new Map();   // file -> stats
        this.results = {
            architecture: {},
            dependencies: {},
            complexity: {},
            opportunities: []
        };
    }

    /**
     * Analyze project structure
     */
    analyze(rootDir = 'src') {
        console.log('🏗️  Analyzing project structure...');

        this.scanDirectory(rootDir);
        this.analyzeArchitecture();
        this.analyzeDependencies();
        this.analyzeComplexity();
        this.identifyOpportunities();

        return this.results;
    }

    /**
     * Scan directory for files and extract metadata
     */
    scanDirectory(dir) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                this.scanDirectory(fullPath);
            } else if (entry.isFile() && this.isSourceFile(entry.name)) {
                this.analyzeFile(fullPath);
            }
        }
    }

    /**
     * Check if file is a source file
     */
    isSourceFile(filename) {
        return /\.(js|ts|jsx|tsx)$/.test(filename) &&
               !filename.endsWith('.d.ts') &&
               !filename.includes('.test.') &&
               !filename.includes('.spec.');
    }

    /**
     * Analyze individual file
     */
    analyzeFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const relativePath = path.relative(process.cwd(), filePath);

            const stats = this.calculateFileStats(content);
            const imports = this.extractImports(content);
            const exports = this.extractExports(content);

            this.fileStats.set(relativePath, stats);
            this.imports.set(relativePath, imports);
            this.exports.set(relativePath, exports);

            // Build dependency graph
            imports.forEach(imp => {
                if (!this.dependencies.has(relativePath)) {
                    this.dependencies.set(relativePath, []);
                }
                this.dependencies.get(relativePath).push(imp.module);
            });

        } catch (error) {
            console.warn(`⚠️  Could not analyze ${filePath}: ${error.message}`);
        }
    }

    /**
     * Calculate file statistics
     */
    calculateFileStats(content) {
        const lines = content.split('\n');
        const nonEmptyLines = lines.filter(line => line.trim().length > 0);
        const commentLines = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*');
        });

        return {
            totalLines: lines.length,
            codeLines: nonEmptyLines.length - commentLines.length,
            commentLines: commentLines.length,
            blankLines: lines.length - nonEmptyLines.length,
            functions: this.countFunctions(content),
            classes: this.countClasses(content),
            complexity: this.calculateCyclomaticComplexity(content)
        };
    }

    /**
     * Count functions in content
     */
    countFunctions(content) {
        const patterns = [
            /function\s+\w+/g,
            /=>\s*{/g,
            /\w+\s*\([^)]*\)\s*{/g
        ];

        return patterns.reduce((count, pattern) => {
            const matches = content.match(pattern) || [];
            return count + matches.length;
        }, 0);
    }

    /**
     * Count classes in content
     */
    countClasses(content) {
        const classPattern = /class\s+\w+/g;
        const matches = content.match(classPattern) || [];
        return matches.length;
    }

    /**
     * Calculate cyclomatic complexity
     */
    calculateCyclomaticComplexity(content) {
        const complexityPatterns = [
            /\bif\b/g,
            /\belse\b/g,
            /\bwhile\b/g,
            /\bfor\b/g,
            /\bcase\b/g,
            /\bcatch\b/g,
            /&&/g,
            /\|\|/g,
            /\?/g
        ];

        return complexityPatterns.reduce((complexity, pattern) => {
            const matches = content.match(pattern) || [];
            return complexity + matches.length;
        }, 1); // Base complexity is 1
    }

    /**
     * Extract import statements
     */
    extractImports(content) {
        const imports = [];

        // ES6 imports
        const importPattern = /import\s+(?:(?:\{[^}]*\}|\w+|\*\s+as\s+\w+)\s+from\s+)?['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = importPattern.exec(content)) !== null) {
            imports.push({
                type: 'es6',
                module: match[1],
                statement: match[0]
            });
        }

        // CommonJS requires
        const requirePattern = /require\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
        while ((match = requirePattern.exec(content)) !== null) {
            imports.push({
                type: 'commonjs',
                module: match[1],
                statement: match[0]
            });
        }

        return imports;
    }

    /**
     * Extract export statements
     */
    extractExports(content) {
        const exports = [];

        // Named exports
        const namedExportPattern = /export\s+(?:const|let|var|function|class)\s+(\w+)/g;
        let match;
        while ((match = namedExportPattern.exec(content)) !== null) {
            exports.push({
                type: 'named',
                name: match[1],
                statement: match[0]
            });
        }

        // Default exports
        const defaultExportPattern = /export\s+default\s+(\w+)/g;
        while ((match = defaultExportPattern.exec(content)) !== null) {
            exports.push({
                type: 'default',
                name: match[1],
                statement: match[0]
            });
        }

        return exports;
    }

    /**
     * Analyze overall architecture
     */
    analyzeArchitecture() {
        const layers = this.identifyArchitecturalLayers();
        const patterns = this.identifyDesignPatterns();

        this.results.architecture = {
            layers,
            patterns,
            fileCount: this.fileStats.size,
            totalLines: this.getTotalLines(),
            averageFileSize: this.getAverageFileSize()
        };
    }

    /**
     * Identify architectural layers
     */
    identifyArchitecturalLayers() {
        const layers = {};

        this.fileStats.forEach((stats, filePath) => {
            const pathParts = filePath.split('/');
            const layer = this.categorizeFile(pathParts);

            if (!layers[layer]) {
                layers[layer] = {
                    files: [],
                    totalLines: 0,
                    complexity: 0
                };
            }

            layers[layer].files.push(filePath);
            layers[layer].totalLines += stats.codeLines;
            layers[layer].complexity += stats.complexity;
        });

        return layers;
    }

    /**
     * Categorize file by path
     */
    categorizeFile(pathParts) {
        const path = pathParts.join('/').toLowerCase();

        if (path.includes('html') || path.includes('frontend') || path.includes('ui')) {
            return 'Frontend';
        } else if (path.includes('utils') || path.includes('shared')) {
            return 'Utilities';
        } else if (path.includes('test') || path.includes('spec')) {
            return 'Tests';
        } else if (path.includes('config') || path.includes('settings')) {
            return 'Configuration';
        } else {
            return 'Business Logic';
        }
    }

    /**
     * Identify design patterns
     */
    identifyDesignPatterns() {
        const patterns = {
            singleton: 0,
            factory: 0,
            observer: 0,
            utility: 0,
            module: 0
        };

        this.fileStats.forEach((stats, filePath) => {
            const content = fs.readFileSync(filePath, 'utf8');

            // Singleton pattern
            if (content.includes('getInstance') || content.includes('instance')) {
                patterns.singleton++;
            }

            // Factory pattern
            if (content.includes('create') && content.includes('new ')) {
                patterns.factory++;
            }

            // Observer pattern
            if (content.includes('addEventListener') || content.includes('on(') || content.includes('emit')) {
                patterns.observer++;
            }

            // Utility pattern
            if (content.includes('static ') && stats.classes > 0) {
                patterns.utility++;
            }

            // Module pattern
            if (content.includes('export') || content.includes('module.exports')) {
                patterns.module++;
            }
        });

        return patterns;
    }

    /**
     * Analyze dependencies
     */
    analyzeDependencies() {
        const graph = this.buildDependencyGraph();
        const cycles = this.detectCycles(graph);
        const metrics = this.calculateDependencyMetrics(graph);

        this.results.dependencies = {
            graph,
            cycles,
            metrics,
            externalDependencies: this.getExternalDependencies(),
            internalDependencies: this.getInternalDependencies()
        };
    }

    /**
     * Build dependency graph
     */
    buildDependencyGraph() {
        const graph = {};

        this.dependencies.forEach((deps, file) => {
            graph[file] = deps.filter(dep => !dep.startsWith('.') && !dep.startsWith('/'));
        });

        return graph;
    }

    /**
     * Detect circular dependencies
     */
    detectCycles(graph) {
        const cycles = [];
        const visited = new Set();
        const recursionStack = new Set();

        const hasCycle = (node, path) => {
            if (recursionStack.has(node)) {
                const cycleStart = path.indexOf(node);
                cycles.push(path.slice(cycleStart));
                return true;
            }

            if (visited.has(node)) {
                return false;
            }

            visited.add(node);
            recursionStack.add(node);
            path.push(node);

            const neighbors = graph[node] || [];
            for (const neighbor of neighbors) {
                if (hasCycle(neighbor, [...path])) {
                    return true;
                }
            }

            recursionStack.delete(node);
            return false;
        };

        Object.keys(graph).forEach(node => {
            if (!visited.has(node)) {
                hasCycle(node, []);
            }
        });

        return cycles;
    }

    /**
     * Calculate dependency metrics
     */
    calculateDependencyMetrics(graph) {
        const fanOut = {}; // Dependencies of each module
        const fanIn = {};  // Modules that depend on each module

        Object.keys(graph).forEach(module => {
            fanOut[module] = graph[module].length;

            graph[module].forEach(dep => {
                if (!fanIn[dep]) fanIn[dep] = 0;
                fanIn[dep]++;
            });
        });

        return { fanOut, fanIn };
    }

    /**
     * Get external dependencies
     */
    getExternalDependencies() {
        const external = new Set();

        this.imports.forEach((imports, file) => {
            imports.forEach(imp => {
                if (!imp.module.startsWith('.') && !imp.module.startsWith('/')) {
                    external.add(imp.module);
                }
            });
        });

        return Array.from(external);
    }

    /**
     * Get internal dependencies
     */
    getInternalDependencies() {
        const internal = new Set();

        this.imports.forEach((imports, file) => {
            imports.forEach(imp => {
                if (imp.module.startsWith('.') || imp.module.startsWith('/')) {
                    internal.add(imp.module);
                }
            });
        });

        return Array.from(internal);
    }

    /**
     * Analyze complexity
     */
    analyzeComplexity() {
        const fileComplexity = [];
        let totalComplexity = 0;
        let maxComplexity = 0;
        let mostComplexFile = '';

        this.fileStats.forEach((stats, filePath) => {
            fileComplexity.push({
                file: filePath,
                complexity: stats.complexity,
                lines: stats.codeLines,
                functions: stats.functions
            });

            totalComplexity += stats.complexity;

            if (stats.complexity > maxComplexity) {
                maxComplexity = stats.complexity;
                mostComplexFile = filePath;
            }
        });

        fileComplexity.sort((a, b) => b.complexity - a.complexity);

        this.results.complexity = {
            total: totalComplexity,
            average: totalComplexity / this.fileStats.size,
            max: maxComplexity,
            mostComplexFile,
            fileComplexity: fileComplexity.slice(0, 10) // Top 10 most complex files
        };
    }

    /**
     * Identify improvement opportunities
     */
    identifyOpportunities() {
        const opportunities = [];

        // Large files
        this.fileStats.forEach((stats, filePath) => {
            if (stats.codeLines > 300) {
                opportunities.push({
                    type: 'Large File',
                    file: filePath,
                    issue: `File has ${stats.codeLines} lines of code`,
                    recommendation: 'Consider breaking into smaller modules',
                    priority: 'Medium'
                });
            }
        });

        // High complexity files
        this.fileStats.forEach((stats, filePath) => {
            if (stats.complexity > 50) {
                opportunities.push({
                    type: 'High Complexity',
                    file: filePath,
                    issue: `Cyclomatic complexity of ${stats.complexity}`,
                    recommendation: 'Refactor to reduce complexity',
                    priority: 'High'
                });
            }
        });

        // Files with many dependencies
        this.dependencies.forEach((deps, filePath) => {
            if (deps.length > 10) {
                opportunities.push({
                    type: 'Many Dependencies',
                    file: filePath,
                    issue: `Depends on ${deps.length} modules`,
                    recommendation: 'Consider dependency injection or facade pattern',
                    priority: 'Low'
                });
            }
        });

        this.results.opportunities = opportunities;
    }

    /**
     * Helper methods
     */
    getTotalLines() {
        let total = 0;
        this.fileStats.forEach(stats => total += stats.codeLines);
        return total;
    }

    getAverageFileSize() {
        const total = this.getTotalLines();
        return Math.round(total / this.fileStats.size);
    }
}

/**
 * Structure report generator
 */
class StructureReportGenerator {
    static generateReport(results) {
        console.log('\n🏗️  STRUCTURE ANALYSIS REPORT');
        console.log('=' .repeat(50));

        this.printArchitecture(results.architecture);
        this.printDependencies(results.dependencies);
        this.printComplexity(results.complexity);
        this.printOpportunities(results.opportunities);

        return this.generateMarkdownReport(results);
    }

    static printArchitecture(architecture) {
        console.log('\n📊 ARCHITECTURE');
        console.log(`Total files: ${architecture.fileCount}`);
        console.log(`Total lines: ${architecture.totalLines}`);
        console.log(`Average file size: ${architecture.averageFileSize} lines`);

        console.log('\nLayers:');
        Object.entries(architecture.layers).forEach(([layer, info]) => {
            console.log(`  ${layer}: ${info.files.length} files, ${info.totalLines} lines`);
        });
    }

    static printDependencies(dependencies) {
        console.log('\n🔗 DEPENDENCIES');
        console.log(`External dependencies: ${dependencies.externalDependencies.length}`);
        console.log(`Internal dependencies: ${dependencies.internalDependencies.length}`);

        if (dependencies.cycles.length > 0) {
            console.log(`\n⚠️  Circular dependencies found: ${dependencies.cycles.length}`);
            dependencies.cycles.slice(0, 3).forEach((cycle, i) => {
                console.log(`  ${i + 1}. ${cycle.join(' → ')}`);
            });
        } else {
            console.log('\n✅ No circular dependencies found');
        }
    }

    static printComplexity(complexity) {
        console.log('\n🧠 COMPLEXITY');
        console.log(`Total complexity: ${complexity.total}`);
        console.log(`Average complexity: ${Math.round(complexity.average)}`);
        console.log(`Most complex file: ${complexity.mostComplexFile} (${complexity.max})`);

        console.log('\nTop complex files:');
        complexity.fileComplexity.slice(0, 5).forEach((file, i) => {
            console.log(`  ${i + 1}. ${file.file}: ${file.complexity} (${file.lines} lines)`);
        });
    }

    static printOpportunities(opportunities) {
        if (opportunities.length === 0) {
            console.log('\n✅ No improvement opportunities identified');
            return;
        }

        console.log('\n🎯 IMPROVEMENT OPPORTUNITIES');

        const byPriority = opportunities.reduce((acc, opp) => {
            if (!acc[opp.priority]) acc[opp.priority] = [];
            acc[opp.priority].push(opp);
            return acc;
        }, {});

        ['High', 'Medium', 'Low'].forEach(priority => {
            if (byPriority[priority]) {
                console.log(`\n${priority} Priority (${byPriority[priority].length}):`);
                byPriority[priority].slice(0, 3).forEach((opp, i) => {
                    console.log(`  ${i + 1}. ${opp.type}: ${opp.file}`);
                    console.log(`     ${opp.issue}`);
                });
            }
        });
    }

    static generateMarkdownReport(results) {
        return `# Code Structure Analysis Report

Generated: ${new Date().toISOString()}

## Architecture Overview

- **Total files**: ${results.architecture.fileCount}
- **Total lines**: ${results.architecture.totalLines.toLocaleString()}
- **Average file size**: ${results.architecture.averageFileSize} lines

### Architectural Layers

${Object.entries(results.architecture.layers).map(([layer, info]) =>
    `- **${layer}**: ${info.files.length} files (${info.totalLines.toLocaleString()} lines)`
).join('\n')}

## Dependencies

- **External dependencies**: ${results.dependencies.externalDependencies.length}
- **Internal dependencies**: ${results.dependencies.internalDependencies.length}
- **Circular dependencies**: ${results.dependencies.cycles.length}

${results.dependencies.cycles.length > 0 ? `
### Circular Dependencies
${results.dependencies.cycles.map((cycle, i) =>
    `${i + 1}. ${cycle.join(' → ')}`
).join('\n')}
` : '✅ No circular dependencies found'}

## Complexity Analysis

- **Total complexity**: ${results.complexity.total}
- **Average complexity**: ${Math.round(results.complexity.average)}
- **Most complex file**: ${results.complexity.mostComplexFile} (${results.complexity.max})

### Most Complex Files

${results.complexity.fileComplexity.slice(0, 10).map((file, i) =>
    `${i + 1}. **${file.file}** - Complexity: ${file.complexity}, Lines: ${file.lines}, Functions: ${file.functions}`
).join('\n')}

## Improvement Opportunities

${results.opportunities.length === 0 ? '✅ No improvement opportunities identified' :
results.opportunities.map((opp, i) => `
### ${i + 1}. ${opp.type} (${opp.priority} Priority)
- **File**: ${opp.file}
- **Issue**: ${opp.issue}
- **Recommendation**: ${opp.recommendation}
`).join('\n')}

## Recommendations

1. **Monitor complexity** - Keep files under 300 lines and complexity under 50
2. **Reduce dependencies** - Files with >10 dependencies should be refactored
3. **Eliminate cycles** - Circular dependencies make code harder to test and maintain
4. **Layer separation** - Maintain clear boundaries between architectural layers
`;
    }
}

// Main execution
if (require.main === module) {
    const analyzer = new StructureAnalyzer();
    const results = analyzer.analyze();
    const report = StructureReportGenerator.generateReport(results);

    // Save report to file
    fs.writeFileSync('structure-analysis-report.md', report);
    console.log('\n💾 Full report saved to structure-analysis-report.md');
}

module.exports = { StructureAnalyzer, StructureReportGenerator };