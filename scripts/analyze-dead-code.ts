import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

interface FunctionInfo {
    name: string;
    file: string;
    line: number;
    column: number;
    isExported: boolean;
    isUsed: boolean;
    usedBy: Set<string>;
    calls: Set<string>;
    type: 'function' | 'method' | 'arrow' | 'class' | 'interface' | 'enum' | 'variable';
    parentClass?: string;
}

interface FileAnalysis {
    functions: Map<string, FunctionInfo>;
    imports: Set<string>;
    exports: Set<string>;
}

class DeadCodeAnalyzer {
    private program: ts.Program;
    private checker: ts.TypeChecker;
    private sourceFiles: readonly ts.SourceFile[];
    private allFunctions: Map<string, FunctionInfo> = new Map();
    private fileAnalyses: Map<string, FileAnalysis> = new Map();
    private entryPoints: Set<string> = new Set();
    private ignorePatterns: RegExp[] = [
        /node_modules/,
        /dist/,
        /out/,
        /\.test\./,
        /\.spec\./,
        /test\//
    ];

    constructor(private rootDir: string) {
        const configPath = ts.findConfigFile(rootDir, ts.sys.fileExists, 'tsconfig.json');
        if (!configPath) {
            throw new Error('tsconfig.json not found');
        }

        const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
        const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, rootDir);

        this.program = ts.createProgram(fileNames, options);
        this.checker = this.program.getTypeChecker();
        this.sourceFiles = this.program.getSourceFiles()
            .filter(sf => !sf.isDeclarationFile && !this.shouldIgnoreFile(sf.fileName));
    }

    private shouldIgnoreFile(fileName: string): boolean {
        return this.ignorePatterns.some(pattern => pattern.test(fileName));
    }

    private getFullyQualifiedName(node: ts.Node, fileName: string): string {
        const name = this.getNodeName(node);
        const relativePath = path.relative(this.rootDir, fileName).replace(/\\/g, '/');
        
        if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
            const parent = node.parent;
            if (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) {
                const parentName = parent.name?.getText() || 'anonymous';
                return `${relativePath}:${parentName}.${name}`;
            }
        }
        
        return `${relativePath}:${name}`;
    }

    private getNodeName(node: ts.Node): string {
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || 
            ts.isClassDeclaration(node) || ts.isInterfaceDeclaration(node) || 
            ts.isEnumDeclaration(node)) {
            return node.name?.getText() || 'anonymous';
        }
        if (ts.isVariableDeclaration(node)) {
            return node.name.getText();
        }
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            const parent = node.parent;
            if (ts.isVariableDeclaration(parent)) {
                return parent.name.getText();
            }
            if (ts.isPropertyAssignment(parent)) {
                return parent.name.getText();
            }
            return 'anonymous';
        }
        return 'unknown';
    }

    private getNodeType(node: ts.Node): FunctionInfo['type'] {
        if (ts.isFunctionDeclaration(node)) return 'function';
        if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) return 'method';
        if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return 'arrow';
        if (ts.isClassDeclaration(node)) return 'class';
        if (ts.isInterfaceDeclaration(node)) return 'interface';
        if (ts.isEnumDeclaration(node)) return 'enum';
        return 'variable';
    }

    private isExported(node: ts.Node): boolean {
        if (ts.getCombinedModifierFlags(node as any) & ts.ModifierFlags.Export) {
            return true;
        }
        
        const parent = node.parent;
        if (ts.isSourceFile(parent)) {
            const symbol = this.checker.getSymbolAtLocation((node as any).name);
            if (symbol) {
                const exports = this.checker.getExportsOfModule(this.checker.getSymbolAtLocation(parent) as any);
                return exports.some(exp => exp === symbol);
            }
        }
        
        return false;
    }

    private findReferences(node: ts.Node, sourceFile: ts.SourceFile): void {
        const functionName = this.getFullyQualifiedName(node, sourceFile.fileName);
        const functionInfo = this.allFunctions.get(functionName);
        
        if (!functionInfo) return;

        const visit = (visitNode: ts.Node) => {
            if (ts.isCallExpression(visitNode)) {
                const expression = visitNode.expression;
                let calledName = '';
                
                if (ts.isIdentifier(expression)) {
                    calledName = expression.getText();
                } else if (ts.isPropertyAccessExpression(expression)) {
                    calledName = expression.name.getText();
                    const objectName = expression.expression.getText();
                    if (objectName !== 'this' && objectName !== 'super') {
                        calledName = `${objectName}.${calledName}`;
                    }
                }
                
                if (calledName) {
                    functionInfo.calls.add(calledName);
                    
                    for (const [targetName, targetInfo] of this.allFunctions) {
                        if (targetName.endsWith(`:${calledName}`) || 
                            targetName.endsWith(`.${calledName}`)) {
                            targetInfo.usedBy.add(functionName);
                            targetInfo.isUsed = true;
                        }
                    }
                }
            }
            
            ts.forEachChild(visitNode, visit);
        };
        
        if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || 
            ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
            if (node.body) {
                visit(node.body);
            }
        }
    }

    private identifyEntryPoints(): void {
        this.entryPoints.add('src/extension.ts:activate');
        this.entryPoints.add('src/extension.ts:deactivate');
        
        for (const sourceFile of this.sourceFiles) {
            const fileName = path.relative(this.rootDir, sourceFile.fileName).replace(/\\/g, '/');
            
            if (fileName === 'src/extension.ts') {
                const visit = (node: ts.Node) => {
                    if (ts.isCallExpression(node)) {
                        const expression = node.expression;
                        if (ts.isPropertyAccessExpression(expression)) {
                            const prop = expression.name.getText();
                            const obj = expression.expression.getText();
                            
                            if (obj === 'vscode' && prop === 'commands' && 
                                node.arguments.length > 0) {
                                const firstArg = node.arguments[0];
                                if (ts.isPropertyAccessExpression(firstArg)) {
                                    const methodName = firstArg.name.getText();
                                    if (methodName === 'registerCommand') {
                                        const commandHandler = node.arguments[1];
                                        if (commandHandler) {
                                            const handlerName = commandHandler.getText();
                                            this.entryPoints.add(`${fileName}:${handlerName}`);
                                        }
                                    }
                                }
                            }
                            
                            if ((obj === 'context' && prop === 'subscriptions') ||
                                (obj === 'vscode' && prop === 'window')) {
                                this.markSubtreeAsUsed(node);
                            }
                        }
                    }
                    
                    ts.forEachChild(node, visit);
                };
                
                visit(sourceFile);
            }
            
            const exportedFunctions = Array.from(this.allFunctions.values())
                .filter(f => f.file === fileName && f.isExported);
            
            for (const func of exportedFunctions) {
                this.entryPoints.add(`${fileName}:${func.name}`);
            }
        }
    }

    private markSubtreeAsUsed(node: ts.Node): void {
        const visit = (visitNode: ts.Node) => {
            if (ts.isIdentifier(visitNode)) {
                const name = visitNode.getText();
                for (const [funcName, funcInfo] of this.allFunctions) {
                    if (funcName.endsWith(`:${name}`)) {
                        funcInfo.isUsed = true;
                        this.entryPoints.add(funcName);
                    }
                }
            }
            ts.forEachChild(visitNode, visit);
        };
        visit(node);
    }

    private collectAllDeclarations(): void {
        for (const sourceFile of this.sourceFiles) {
            const fileName = path.relative(this.rootDir, sourceFile.fileName).replace(/\\/g, '/');
            const analysis: FileAnalysis = {
                functions: new Map(),
                imports: new Set(),
                exports: new Set()
            };
            
            const visit = (node: ts.Node) => {
                if (ts.isFunctionDeclaration(node) || 
                    ts.isMethodDeclaration(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isFunctionExpression(node) ||
                    ts.isClassDeclaration(node) ||
                    ts.isInterfaceDeclaration(node) ||
                    ts.isEnumDeclaration(node)) {
                    
                    const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
                    const name = this.getFullyQualifiedName(node, sourceFile.fileName);
                    
                    const info: FunctionInfo = {
                        name: this.getNodeName(node),
                        file: fileName,
                        line: line + 1,
                        column: character + 1,
                        isExported: this.isExported(node),
                        isUsed: false,
                        usedBy: new Set(),
                        calls: new Set(),
                        type: this.getNodeType(node)
                    };
                    
                    if (ts.isMethodDeclaration(node) || ts.isMethodSignature(node)) {
                        const parent = node.parent;
                        if (ts.isClassDeclaration(parent) || ts.isInterfaceDeclaration(parent)) {
                            info.parentClass = parent.name?.getText();
                        }
                    }
                    
                    this.allFunctions.set(name, info);
                    analysis.functions.set(name, info);
                }
                
                if (ts.isVariableStatement(node)) {
                    const declarations = node.declarationList.declarations;
                    for (const decl of declarations) {
                        if (ts.isVariableDeclaration(decl)) {
                            const init = decl.initializer;
                            if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) {
                                const { line, character } = sourceFile.getLineAndCharacterOfPosition(decl.getStart());
                                const name = this.getFullyQualifiedName(decl, sourceFile.fileName);
                                
                                const info: FunctionInfo = {
                                    name: this.getNodeName(decl),
                                    file: fileName,
                                    line: line + 1,
                                    column: character + 1,
                                    isExported: this.isExported(node),
                                    isUsed: false,
                                    usedBy: new Set(),
                                    calls: new Set(),
                                    type: 'arrow'
                                };
                                
                                this.allFunctions.set(name, info);
                                analysis.functions.set(name, info);
                            }
                        }
                    }
                }
                
                if (ts.isImportDeclaration(node)) {
                    const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;
                    analysis.imports.add(moduleSpecifier);
                }
                
                if (ts.isExportDeclaration(node) || ts.isExportAssignment(node)) {
                    analysis.exports.add(node.getText());
                }
                
                ts.forEachChild(node, visit);
            };
            
            visit(sourceFile);
            this.fileAnalyses.set(fileName, analysis);
        }
    }

    private analyzeUsage(): void {
        for (const sourceFile of this.sourceFiles) {
            const visit = (node: ts.Node) => {
                if (ts.isFunctionDeclaration(node) ||
                    ts.isMethodDeclaration(node) ||
                    ts.isArrowFunction(node) ||
                    ts.isFunctionExpression(node)) {
                    this.findReferences(node, sourceFile);
                }
                
                ts.forEachChild(node, visit);
            };
            
            visit(sourceFile);
        }
    }

    private propagateUsage(): void {
        const toProcess = new Set(this.entryPoints);
        const processed = new Set<string>();
        
        while (toProcess.size > 0) {
            const current = toProcess.values().next().value;
            toProcess.delete(current);
            
            if (processed.has(current)) continue;
            processed.add(current);
            
            const funcInfo = this.allFunctions.get(current);
            if (funcInfo) {
                funcInfo.isUsed = true;
                
                for (const called of funcInfo.calls) {
                    for (const [name, info] of this.allFunctions) {
                        if (name.endsWith(`:${called}`) || name.endsWith(`.${called}`)) {
                            if (!processed.has(name)) {
                                toProcess.add(name);
                            }
                        }
                    }
                }
            }
        }
    }

    public analyze(): void {
        console.log('🔍 Starting dead code analysis...\n');
        
        this.collectAllDeclarations();
        console.log(`📊 Found ${this.allFunctions.size} declarations across ${this.sourceFiles.length} files\n`);
        
        this.analyzeUsage();
        
        this.identifyEntryPoints();
        console.log(`🎯 Identified ${this.entryPoints.size} entry points\n`);
        
        this.propagateUsage();
        
        this.generateReport();
    }

    private generateReport(): void {
        const unusedFunctions = Array.from(this.allFunctions.values())
            .filter(f => !f.isUsed && !f.file.includes('.test.') && !f.file.includes('.spec.'));
        
        const stats = {
            total: this.allFunctions.size,
            used: this.allFunctions.size - unusedFunctions.length,
            unused: unusedFunctions.length,
            byType: new Map<string, number>(),
            byFile: new Map<string, number>()
        };
        
        for (const func of unusedFunctions) {
            stats.byType.set(func.type, (stats.byType.get(func.type) || 0) + 1);
            stats.byFile.set(func.file, (stats.byFile.get(func.file) || 0) + 1);
        }
        
        console.log('═══════════════════════════════════════════════════════════════════════');
        console.log('                        DEAD CODE ANALYSIS REPORT                      ');
        console.log('═══════════════════════════════════════════════════════════════════════\n');
        
        console.log('📈 SUMMARY STATISTICS');
        console.log('─────────────────────────────────────────────────────────────────────');
        console.log(`  Total declarations analyzed: ${stats.total}`);
        console.log(`  Used declarations: ${stats.used} (${((stats.used / stats.total) * 100).toFixed(1)}%)`);
        console.log(`  Unused declarations: ${stats.unused} (${((stats.unused / stats.total) * 100).toFixed(1)}%)`);
        console.log('');
        
        console.log('📊 UNUSED BY TYPE');
        console.log('─────────────────────────────────────────────────────────────────────');
        for (const [type, count] of stats.byType) {
            console.log(`  ${type}: ${count}`);
        }
        console.log('');
        
        console.log('📁 FILES WITH MOST UNUSED CODE');
        console.log('─────────────────────────────────────────────────────────────────────');
        const sortedFiles = Array.from(stats.byFile.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);
        
        for (const [file, count] of sortedFiles) {
            console.log(`  ${file}: ${count} unused`);
        }
        console.log('');
        
        console.log('🗑️  UNUSED DECLARATIONS (Can potentially be removed)');
        console.log('─────────────────────────────────────────────────────────────────────');
        
        const groupedByFile = new Map<string, FunctionInfo[]>();
        for (const func of unusedFunctions) {
            if (!groupedByFile.has(func.file)) {
                groupedByFile.set(func.file, []);
            }
            groupedByFile.get(func.file)!.push(func);
        }
        
        for (const [file, funcs] of groupedByFile) {
            console.log(`\n📄 ${file}`);
            for (const func of funcs.sort((a, b) => a.line - b.line)) {
                const badge = func.isExported ? '🔓' : '🔒';
                const typeIcon = {
                    'function': '⚡',
                    'method': '🔧',
                    'arrow': '➡️',
                    'class': '📦',
                    'interface': '📋',
                    'enum': '🔢',
                    'variable': '📌'
                }[func.type] || '❓';
                
                console.log(`   ${typeIcon} ${badge} ${func.name} (line ${func.line}:${func.column})`);
                if (func.parentClass) {
                    console.log(`      └─ in class ${func.parentClass}`);
                }
            }
        }
        
        const reportPath = path.join(this.rootDir, 'dead-code-report.json');
        const reportData = {
            timestamp: new Date().toISOString(),
            stats,
            unusedFunctions: unusedFunctions.map(f => ({
                name: f.name,
                file: f.file,
                line: f.line,
                column: f.column,
                type: f.type,
                isExported: f.isExported,
                parentClass: f.parentClass
            }))
        };
        
        fs.writeFileSync(reportPath, JSON.stringify(reportData, null, 2));
        console.log(`\n\n💾 Detailed report saved to: ${reportPath}`);
        
        console.log('\n═══════════════════════════════════════════════════════════════════════');
        console.log('⚠️  IMPORTANT NOTES:');
        console.log('─────────────────────────────────────────────────────────────────────');
        console.log('• Functions marked with 🔓 are exported and might be used externally');
        console.log('• Event handlers and callback functions may appear unused');
        console.log('• Always manually verify before removing any code');
        console.log('• Some functions might be used via dynamic imports or string references');
        console.log('═══════════════════════════════════════════════════════════════════════\n');
    }
}

const rootDir = process.cwd();
const analyzer = new DeadCodeAnalyzer(rootDir);
analyzer.analyze();