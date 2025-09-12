import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

interface CleanupAction {
    type: 'remove_function' | 'remove_import' | 'remove_export' | 'remove_class' | 'remove_interface' | 'remove_enum';
    file: string;
    name: string;
    startLine: number;
    endLine: number;
    description: string;
    risk: 'low' | 'medium' | 'high';
    reason: string;
    codePreview: string;
}

interface ImportUsageInfo {
    importName: string;
    file: string;
    isUsed: boolean;
    usageCount: number;
    usedIn: string[];
}

class CleanupGenerator {
    private program: ts.Program;
    private sourceFiles: readonly ts.SourceFile[];
    private cleanupActions: CleanupAction[] = [];
    private deadCodeReport: any;
    
    constructor(private rootDir: string, deadCodeReportPath: string) {
        this.loadDeadCodeReport(deadCodeReportPath);
        this.initializeTypeScript();
    }

    private loadDeadCodeReport(reportPath: string): void {
        if (!fs.existsSync(reportPath)) {
            throw new Error(`Dead code report not found at ${reportPath}. Run the dead code analyzer first.`);
        }
        this.deadCodeReport = JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
    }

    private initializeTypeScript(): void {
        const configPath = ts.findConfigFile(this.rootDir, ts.sys.fileExists, 'tsconfig.json');
        if (!configPath) {
            throw new Error('tsconfig.json not found');
        }

        const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
        const { options, fileNames } = ts.parseJsonConfigFileContent(config, ts.sys, this.rootDir);

        this.program = ts.createProgram(fileNames, options);
        this.sourceFiles = this.program.getSourceFiles()
            .filter(sf => !sf.isDeclarationFile && !sf.fileName.includes('node_modules'));
    }

    private getNodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
        return sourceFile.text.substring(node.getFullStart(), node.getEnd());
    }

    private getRiskLevel(item: any): 'low' | 'medium' | 'high' {
        if (item.isExported) return 'high';
        if (item.type === 'interface' || item.type === 'enum') return 'medium';
        if (item.name.toLowerCase().includes('test') || 
            item.name.toLowerCase().includes('mock') ||
            item.name.toLowerCase().includes('debug')) return 'low';
        return 'medium';
    }

    private findUnusedImports(): ImportUsageInfo[] {
        const unusedImports: ImportUsageInfo[] = [];

        for (const sourceFile of this.sourceFiles) {
            const fileName = path.relative(this.rootDir, sourceFile.fileName).replace(/\\/g, '/');
            const importDeclarations: ts.ImportDeclaration[] = [];
            const usedIdentifiers: Set<string> = new Set();

            const collectImports = (node: ts.Node) => {
                if (ts.isImportDeclaration(node)) {
                    importDeclarations.push(node);
                }
                ts.forEachChild(node, collectImports);
            };

            const collectUsedIdentifiers = (node: ts.Node) => {
                if (ts.isIdentifier(node) && !ts.isImportDeclaration(node.parent)) {
                    usedIdentifiers.add(node.text);
                }
                ts.forEachChild(node, collectUsedIdentifiers);
            };

            collectImports(sourceFile);
            collectUsedIdentifiers(sourceFile);

            for (const importDecl of importDeclarations) {
                const importClause = importDecl.importClause;
                if (importClause) {
                    if (importClause.name) {
                        const importName = importClause.name.text;
                        if (!usedIdentifiers.has(importName)) {
                            unusedImports.push({
                                importName,
                                file: fileName,
                                isUsed: false,
                                usageCount: 0,
                                usedIn: []
                            });
                        }
                    }

                    if (importClause.namedBindings) {
                        if (ts.isNamedImports(importClause.namedBindings)) {
                            for (const element of importClause.namedBindings.elements) {
                                const importName = element.name.text;
                                if (!usedIdentifiers.has(importName)) {
                                    unusedImports.push({
                                        importName,
                                        file: fileName,
                                        isUsed: false,
                                        usageCount: 0,
                                        usedIn: []
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }

        return unusedImports;
    }

    private generateCleanupActions(): void {
        this.cleanupActions = [];

        for (const unusedFunc of this.deadCodeReport.unusedFunctions) {
            const sourceFile = this.sourceFiles.find(sf => 
                path.relative(this.rootDir, sf.fileName).replace(/\\/g, '/') === unusedFunc.file
            );

            if (!sourceFile) continue;

            const visit = (node: ts.Node) => {
                let shouldAdd = false;
                let nodeType = '';

                if (ts.isFunctionDeclaration(node) && node.name?.text === unusedFunc.name) {
                    shouldAdd = true;
                    nodeType = 'function';
                }
                else if (ts.isClassDeclaration(node) && node.name?.text === unusedFunc.name) {
                    shouldAdd = true;
                    nodeType = 'class';
                }
                else if (ts.isInterfaceDeclaration(node) && node.name?.text === unusedFunc.name) {
                    shouldAdd = true;
                    nodeType = 'interface';
                }
                else if (ts.isEnumDeclaration(node) && node.name?.text === unusedFunc.name) {
                    shouldAdd = true;
                    nodeType = 'enum';
                }
                else if (ts.isMethodDeclaration(node) && node.name?.getText() === unusedFunc.name) {
                    const parent = node.parent;
                    if (ts.isClassDeclaration(parent) && parent.name?.text === unusedFunc.parentClass) {
                        shouldAdd = true;
                        nodeType = 'method';
                    }
                }
                else if (ts.isVariableStatement(node)) {
                    const declaration = node.declarationList.declarations[0];
                    if (ts.isVariableDeclaration(declaration) && 
                        declaration.name.getText() === unusedFunc.name) {
                        shouldAdd = true;
                        nodeType = 'variable';
                    }
                }

                if (shouldAdd) {
                    const { line: startLine } = sourceFile.getLineAndCharacterOfPosition(node.getFullStart());
                    const { line: endLine } = sourceFile.getLineAndCharacterOfPosition(node.getEnd());
                    const codePreview = this.getNodeText(node, sourceFile)
                        .split('\n')
                        .slice(0, 5)
                        .join('\n') + (node.getText().split('\n').length > 5 ? '\n...' : '');

                    this.cleanupActions.push({
                        type: nodeType === 'method' ? 'remove_function' : `remove_${nodeType}` as any,
                        file: unusedFunc.file,
                        name: unusedFunc.name,
                        startLine: startLine + 1,
                        endLine: endLine + 1,
                        description: `Remove unused ${nodeType} '${unusedFunc.name}'`,
                        risk: this.getRiskLevel(unusedFunc),
                        reason: `This ${nodeType} is not referenced anywhere in the codebase.`,
                        codePreview
                    });
                }

                ts.forEachChild(node, visit);
            };

            visit(sourceFile);
        }

        const unusedImports = this.findUnusedImports();
        for (const unusedImport of unusedImports) {
            this.cleanupActions.push({
                type: 'remove_import',
                file: unusedImport.file,
                name: unusedImport.importName,
                startLine: 0,
                endLine: 0,
                description: `Remove unused import '${unusedImport.importName}'`,
                risk: 'low',
                reason: 'This import is not used anywhere in the file.',
                codePreview: `import { ${unusedImport.importName} } from '...'`
            });
        }
    }

    private generateCleanupScript(): string {
        const script = [
            '#!/bin/bash',
            '# Generated cleanup script for removing dead code',
            '# CAUTION: Review each change before running!',
            '',
            'set -e',
            '',
            'echo "🧹 Starting dead code cleanup..."',
            'echo "⚠️  Please review each file modification carefully!"',
            '',
            '# Create backup directory',
            'BACKUP_DIR="./backup_$(date +%Y%m%d_%H%M%S)"',
            'mkdir -p "$BACKUP_DIR"',
            'echo "📦 Created backup directory: $BACKUP_DIR"',
            '',
            '# Function to backup file',
            'backup_file() {',
            '    local file="$1"',
            '    local backup_path="$BACKUP_DIR/$file"',
            '    mkdir -p "$(dirname "$backup_path")"',
            '    cp "$file" "$backup_path"',
            '    echo "📋 Backed up: $file"',
            '}',
            ''
        ];

        const actionsByFile = new Map<string, CleanupAction[]>();
        for (const action of this.cleanupActions) {
            if (!actionsByFile.has(action.file)) {
                actionsByFile.set(action.file, []);
            }
            actionsByFile.get(action.file)!.push(action);
        }

        for (const [file, actions] of actionsByFile) {
            script.push(`echo "🔄 Processing file: ${file}"`);
            script.push(`backup_file "${file}"`);
            script.push('');
            
            const sortedActions = actions.sort((a, b) => b.startLine - a.startLine);
            
            for (const action of sortedActions) {
                script.push(`# ${action.description} (Risk: ${action.risk.toUpperCase()})`);
                script.push(`# Reason: ${action.reason}`);
                
                if (action.startLine > 0 && action.endLine > 0) {
                    script.push(`sed -i '${action.startLine},${action.endLine}d' "${file}"`);
                } else if (action.type === 'remove_import') {
                    script.push(`# TODO: Manually remove unused import '${action.name}' from ${file}`);
                }
                
                script.push('');
            }
        }

        script.push('echo "✅ Cleanup completed!"');
        script.push('echo "🔍 Please run your tests and verify everything works correctly"');
        script.push('echo "📂 Backup files are available in: $BACKUP_DIR"');

        return script.join('\n');
    }

    private generateInteractiveCleanup(): string {
        const script = [
            'import * as fs from "fs";',
            'import * as readline from "readline";',
            '',
            'interface CleanupAction {',
            '    type: string;',
            '    file: string;',
            '    name: string;',
            '    startLine: number;',
            '    endLine: number;',
            '    description: string;',
            '    risk: string;',
            '    reason: string;',
            '    codePreview: string;',
            '}',
            '',
            `const actions: CleanupAction[] = ${JSON.stringify(this.cleanupActions, null, 2)};`,
            '',
            'const rl = readline.createInterface({',
            '    input: process.stdin,',
            '    output: process.stdout',
            '});',
            '',
            'function askQuestion(question: string): Promise<string> {',
            '    return new Promise((resolve) => {',
            '        rl.question(question, resolve);',
            '    });',
            '}',
            '',
            'async function processActions() {',
            '    console.log(`🧹 Found ${actions.length} cleanup opportunities\\n`);',
            '',
            '    for (let i = 0; i < actions.length; i++) {',
            '        const action = actions[i];',
            '        console.log(`\\n${"=".repeat(60)}`);',
            '        console.log(`Action ${i + 1}/${actions.length}`);',
            '        console.log(`File: ${action.file}`);',
            '        console.log(`Type: ${action.type}`);',
            '        console.log(`Name: ${action.name}`);',
            '        console.log(`Risk: ${action.risk.toUpperCase()}`);',
            '        console.log(`Reason: ${action.reason}`);',
            '        console.log(`Lines: ${action.startLine}-${action.endLine}`);',
            '        console.log("\\nCode preview:");',
            '        console.log("-".repeat(40));',
            '        console.log(action.codePreview);',
            '        console.log("-".repeat(40));',
            '',
            '        const answer = await askQuestion("\\nApply this cleanup? (y/n/s=skip remaining): ");',
            '        ',
            '        if (answer.toLowerCase() === "s") {',
            '            console.log("Skipping remaining actions.");',
            '            break;',
            '        }',
            '',
            '        if (answer.toLowerCase() === "y") {',
            '            try {',
            '                applyCleanupAction(action);',
            '                console.log("✅ Applied successfully");',
            '            } catch (error) {',
            '                console.error("❌ Failed to apply:", error);',
            '            }',
            '        } else {',
            '            console.log("⏭️  Skipped");',
            '        }',
            '    }',
            '',
            '    rl.close();',
            '    console.log("\\n🎉 Interactive cleanup completed!");',
            '}',
            '',
            'function applyCleanupAction(action: CleanupAction) {',
            '    const filePath = action.file;',
            '    const content = fs.readFileSync(filePath, "utf-8");',
            '    const lines = content.split("\\n");',
            '',
            '    if (action.startLine > 0 && action.endLine > 0) {',
            '        // Remove lines (1-based indexing)',
            '        lines.splice(action.startLine - 1, action.endLine - action.startLine + 1);',
            '        fs.writeFileSync(filePath, lines.join("\\n"));',
            '    }',
            '}',
            '',
            'processActions().catch(console.error);'
        ];

        return script.join('\n');
    }

    public generate(): void {
        console.log('🔧 Generating cleanup actions...\n');
        this.generateCleanupActions();

        console.log(`Found ${this.cleanupActions.length} cleanup opportunities:\n`);

        const riskCounts = {
            low: this.cleanupActions.filter(a => a.risk === 'low').length,
            medium: this.cleanupActions.filter(a => a.risk === 'medium').length,
            high: this.cleanupActions.filter(a => a.risk === 'high').length
        };

        console.log(`📊 Risk breakdown:`);
        console.log(`   🟢 Low risk: ${riskCounts.low}`);
        console.log(`   🟡 Medium risk: ${riskCounts.medium}`);
        console.log(`   🔴 High risk: ${riskCounts.high}\n`);

        const detailedReportPath = path.join(this.rootDir, 'cleanup-plan.json');
        fs.writeFileSync(detailedReportPath, JSON.stringify({
            timestamp: new Date().toISOString(),
            totalActions: this.cleanupActions.length,
            riskBreakdown: riskCounts,
            actions: this.cleanupActions
        }, null, 2));

        const bashScriptPath = path.join(this.rootDir, 'cleanup.sh');
        fs.writeFileSync(bashScriptPath, this.generateCleanupScript());
        fs.chmodSync(bashScriptPath, 0o755);

        const interactiveScriptPath = path.join(this.rootDir, 'interactive-cleanup.ts');
        fs.writeFileSync(interactiveScriptPath, this.generateInteractiveCleanup());

        console.log('📁 Generated files:');
        console.log(`   📋 Detailed plan: ${detailedReportPath}`);
        console.log(`   🤖 Bash script: ${bashScriptPath}`);
        console.log(`   ⚡ Interactive script: ${interactiveScriptPath}\n`);

        console.log('🚀 Next steps:');
        console.log('   1. Review cleanup-plan.json for detailed analysis');
        console.log('   2. Run "npx ts-node interactive-cleanup.ts" for safe, interactive cleanup');
        console.log('   3. Or run "./cleanup.sh" for batch processing (⚠️  high risk!)');
        console.log('   4. Always test your application after cleanup!\n');
    }
}

const args = process.argv.slice(2);
const reportPath = args[0] || './dead-code-report.json';

try {
    const generator = new CleanupGenerator(process.cwd(), reportPath);
    generator.generate();
} catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
}