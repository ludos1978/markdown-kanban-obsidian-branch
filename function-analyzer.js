#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Function to analyze a single file for function definitions
function analyzeFile(filePath, fileContent) {
    const functions = [];
    const lines = fileContent.split('\n');

    // Patterns to match different function types
    const patterns = [
        // TypeScript/JavaScript function declarations
        /^(\s*)(export\s+)?(async\s+)?function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
        // Arrow functions (const/let/var)
        /^(\s*)(export\s+)?(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(async\s+)?\(/,
        // Object method definitions
        /^(\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:\s*(async\s+)?function\s*\(/,
        // Class method definitions
        /^(\s*)(public|private|protected)?\s*(static)?\s*(async)?\s*([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
        // Class constructors
        /^(\s*)constructor\s*\(/,
        // Class declarations
        /^(\s*)(export\s+)?class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
    ];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const lineNumber = i + 1;

        for (const pattern of patterns) {
            const match = line.match(pattern);
            if (match) {
                let functionName = '';
                let functionType = '';
                let isExported = false;
                let isAsync = false;
                let isStatic = false;
                let visibility = 'public';

                // Determine function type and extract name based on pattern
                if (match[0].includes('function ')) {
                    functionType = 'function';
                    functionName = match[4] || match[3] || 'anonymous';
                    isExported = !!match[2];
                    isAsync = !!match[3] && match[3].includes('async');
                } else if (match[0].includes('=')) {
                    functionType = 'arrow_function';
                    functionName = match[4];
                    isExported = !!match[2];
                    isAsync = !!match[5] && match[5].includes('async');
                } else if (match[0].includes(':')) {
                    functionType = 'method';
                    functionName = match[2];
                    isAsync = !!match[3] && match[3].includes('async');
                } else if (match[0].includes('class')) {
                    functionType = 'class';
                    functionName = match[3];
                    isExported = !!match[2];
                } else if (match[0].includes('constructor')) {
                    functionType = 'constructor';
                    functionName = 'constructor';
                } else {
                    // Class method
                    functionType = 'class_method';
                    functionName = match[5] || 'unknown';
                    visibility = match[2] || 'public';
                    isStatic = !!match[3];
                    isAsync = !!match[4];
                }

                // Calculate function size (rough estimate)
                let endLine = lineNumber;
                let braceCount = 0;
                let startCounting = false;

                for (let j = i; j < lines.length; j++) {
                    const currentLine = lines[j];
                    if (currentLine.includes('{')) {
                        startCounting = true;
                        braceCount += (currentLine.match(/\{/g) || []).length;
                    }
                    if (startCounting) {
                        braceCount -= (currentLine.match(/\}/g) || []).length;
                        if (braceCount <= 0) {
                            endLine = j + 1;
                            break;
                        }
                    }
                }

                const functionSize = endLine - lineNumber + 1;

                functions.push({
                    name: functionName,
                    type: functionType,
                    lineNumber,
                    endLine,
                    size: functionSize,
                    isExported,
                    isAsync,
                    isStatic,
                    visibility,
                    filePath,
                    fileType: path.extname(filePath),
                    indentation: match[1] ? match[1].length : 0
                });

                break; // Found a match, move to next line
            }
        }
    }

    return functions;
}

// Function to recursively find all relevant files
function findFiles(dir, extensions = ['.ts', '.js', '.html', '.css']) {
    const files = [];

    function traverse(currentPath) {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
            const fullPath = path.join(currentPath, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip node_modules, .git, and out/dist directories
                if (!['node_modules', '.git', 'out', 'dist'].includes(item)) {
                    traverse(fullPath);
                }
            } else if (stat.isFile()) {
                const ext = path.extname(item);
                if (extensions.includes(ext)) {
                    files.push(fullPath);
                }
            }
        }
    }

    traverse(dir);
    return files;
}

// Main analysis function
function analyzeFunctions(projectPath) {
    const files = findFiles(projectPath);
    const allFunctions = [];
    const statistics = {
        totalFiles: files.length,
        totalFunctions: 0,
        functionTypes: {},
        fileCounts: {},
        largeFunctions: []
    };

    console.log(`Analyzing ${files.length} files...`);

    for (const filePath of files) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            const functions = analyzeFile(filePath, content);

            allFunctions.push(...functions);

            // Update statistics
            const relativeFilePath = path.relative(projectPath, filePath);
            const fileType = path.extname(filePath);

            statistics.fileCounts[fileType] = (statistics.fileCounts[fileType] || 0) + functions.length;

            for (const func of functions) {
                statistics.functionTypes[func.type] = (statistics.functionTypes[func.type] || 0) + 1;

                if (func.size > 20) {
                    statistics.largeFunctions.push({
                        name: func.name,
                        file: relativeFilePath,
                        size: func.size,
                        line: func.lineNumber
                    });
                }
            }

        } catch (error) {
            console.warn(`Error analyzing ${filePath}: ${error.message}`);
        }
    }

    statistics.totalFunctions = allFunctions.length;

    return { functions: allFunctions, statistics };
}

// Generate a systematic naming scheme
function generateNamingScheme(functions, projectPath) {
    const nameMap = {};

    for (const func of functions) {
        const relativePath = path.relative(projectPath, func.filePath);
        const pathParts = relativePath.split('/');

        // Generate module name
        let module = 'UNKNOWN';
        if (pathParts.includes('src')) {
            const srcIndex = pathParts.indexOf('src');
            if (srcIndex + 1 < pathParts.length) {
                const nextPart = pathParts[srcIndex + 1];
                if (nextPart === 'html') {
                    module = 'WEBVIEW';
                } else if (nextPart === 'utils') {
                    module = 'UTILS';
                } else if (nextPart === 'test') {
                    module = 'TEST';
                } else {
                    module = 'EXTENSION';
                }
            }
        } else if (pathParts.includes('tools')) {
            module = 'TOOLS';
        } else if (pathParts.includes('markdown-it-media-lib')) {
            module = 'MARKDOWN_PLUGIN';
        }

        // Generate category based on file name
        const fileName = path.basename(func.filePath, path.extname(func.filePath));
        let category = fileName.toUpperCase().replace(/-/g, '_');

        // Generate function identifier
        const functionId = func.name.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

        // Create systematic name
        const systematicName = `${module}.${category}.${functionId}`;

        nameMap[systematicName] = {
            ...func,
            systematicName,
            module,
            category,
            relativePath
        };
    }

    return nameMap;
}

// Find potential duplicates
function findDuplicates(functions) {
    const duplicates = [];
    const nameGroups = {};

    // Group by function name
    for (const func of functions) {
        const name = func.name.toLowerCase();
        if (!nameGroups[name]) {
            nameGroups[name] = [];
        }
        if (Array.isArray(nameGroups[name])) {
            nameGroups[name].push(func);
        }
    }

    // Find groups with multiple functions
    for (const [name, group] of Object.entries(nameGroups)) {
        if (group.length > 1) {
            duplicates.push({
                name,
                count: group.length,
                functions: group
            });
        }
    }

    return duplicates;
}

// Main execution
const projectPath = process.argv[2] || '.';
const result = analyzeFunctions(projectPath);
const nameMap = generateNamingScheme(result.functions, projectPath);
const duplicates = findDuplicates(result.functions);

// Output results
console.log('\n=== FUNCTION ANALYSIS RESULTS ===\n');

console.log('STATISTICS:');
console.log(`Total Files: ${result.statistics.totalFiles}`);
console.log(`Total Functions: ${result.statistics.totalFunctions}`);
console.log(`Average Functions per File: ${(result.statistics.totalFunctions / result.statistics.totalFiles).toFixed(2)}`);

console.log('\nFUNCTION TYPES:');
for (const [type, count] of Object.entries(result.statistics.functionTypes)) {
    console.log(`  ${type}: ${count}`);
}

console.log('\nFILE TYPE BREAKDOWN:');
for (const [fileType, count] of Object.entries(result.statistics.fileCounts)) {
    console.log(`  ${fileType}: ${count} functions`);
}

console.log('\nLARGE FUNCTIONS (>20 lines):');
result.statistics.largeFunctions
    .sort((a, b) => b.size - a.size)
    .slice(0, 10)
    .forEach(func => {
        console.log(`  ${func.name} (${func.file}:${func.line}) - ${func.size} lines`);
    });

console.log('\nPOTENTIAL DUPLICATES:');
duplicates
    .filter(dup => dup.count > 1)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .forEach(dup => {
        console.log(`  ${dup.name} appears ${dup.count} times:`);
        dup.functions.forEach(func => {
            const relativePath = path.relative(projectPath, func.filePath);
            console.log(`    - ${relativePath}:${func.lineNumber}`);
        });
    });

// Write detailed results to file
const detailedOutput = {
    statistics: result.statistics,
    functions: result.functions,
    nameMap,
    duplicates
};

fs.writeFileSync('function-analysis.json', JSON.stringify(detailedOutput, null, 2));
console.log('\nDetailed analysis written to function-analysis.json');