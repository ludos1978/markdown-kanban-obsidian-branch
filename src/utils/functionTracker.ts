import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

interface FunctionCall {
    name: string;
    file: string;
    line: number;
    timestamp: number;
    callCount: number;
    lastCalled: Date;
    calledBy: string[];
}

export class FunctionTracker {
    private static instance: FunctionTracker;
    private trackedFunctions: Map<string, FunctionCall> = new Map();
    private isTracking: boolean = false;
    private outputChannel: vscode.OutputChannel;
    private trackerFile: string;

    private constructor() {
        this.outputChannel = vscode.window.createOutputChannel('Function Usage Tracker');
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        this.trackerFile = workspaceFolder 
            ? path.join(workspaceFolder.uri.fsPath, '.vscode', 'function-usage.json')
            : '';
        
        this.loadTrackedData();
    }

    public static getInstance(): FunctionTracker {
        if (!FunctionTracker.instance) {
            FunctionTracker.instance = new FunctionTracker();
        }
        return FunctionTracker.instance;
    }

    private loadTrackedData(): void {
        if (this.trackerFile && fs.existsSync(this.trackerFile)) {
            try {
                const data = fs.readFileSync(this.trackerFile, 'utf-8');
                const parsed = JSON.parse(data);
                for (const [key, value] of Object.entries(parsed)) {
                    this.trackedFunctions.set(key, value as FunctionCall);
                }
            } catch (error) {
                console.error('Failed to load tracking data:', error);
            }
        }
    }

    private saveTrackedData(): void {
        if (!this.trackerFile) return;
        
        const dir = path.dirname(this.trackerFile);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const data: Record<string, FunctionCall> = {};
        for (const [key, value] of this.trackedFunctions) {
            data[key] = value;
        }

        fs.writeFileSync(this.trackerFile, JSON.stringify(data, null, 2));
    }

    public trackFunction(functionName: string, fileName: string, lineNumber: number, callerName?: string): void {
        if (!this.isTracking) return;

        const key = `${fileName}:${functionName}:${lineNumber}`;
        const existing = this.trackedFunctions.get(key);

        if (existing) {
            existing.callCount++;
            existing.lastCalled = new Date();
            if (callerName && !existing.calledBy.includes(callerName)) {
                existing.calledBy.push(callerName);
            }
        } else {
            this.trackedFunctions.set(key, {
                name: functionName,
                file: fileName,
                line: lineNumber,
                timestamp: Date.now(),
                callCount: 1,
                lastCalled: new Date(),
                calledBy: callerName ? [callerName] : []
            });
        }

        this.saveTrackedData();
    }

    public startTracking(): void {
        this.isTracking = true;
        this.outputChannel.appendLine('🟢 Function tracking started');
        vscode.window.showInformationMessage('Function usage tracking started');
    }

    public stopTracking(): void {
        this.isTracking = false;
        this.saveTrackedData();
        this.outputChannel.appendLine('🔴 Function tracking stopped');
        vscode.window.showInformationMessage('Function usage tracking stopped');
    }

    public generateUsageReport(): string {
        const report: string[] = [];
        report.push('=== FUNCTION USAGE REPORT ===\n');
        report.push(`Generated: ${new Date().toISOString()}\n`);
        report.push(`Total tracked functions: ${this.trackedFunctions.size}\n`);
        
        const sorted = Array.from(this.trackedFunctions.values())
            .sort((a, b) => b.callCount - a.callCount);

        report.push('\n📊 Most Used Functions:\n');
        sorted.slice(0, 20).forEach(func => {
            report.push(`  ${func.name} (${func.file}:${func.line})`);
            report.push(`    Calls: ${func.callCount}, Last: ${func.lastCalled}`);
            if (func.calledBy.length > 0) {
                report.push(`    Called by: ${func.calledBy.join(', ')}`);
            }
        });

        const neverUsed = sorted.filter(f => f.callCount === 0);
        if (neverUsed.length > 0) {
            report.push('\n⚠️ Never Called Functions:\n');
            neverUsed.forEach(func => {
                report.push(`  ${func.name} (${func.file}:${func.line})`);
            });
        }

        const rarelyUsed = sorted.filter(f => f.callCount > 0 && f.callCount <= 3);
        if (rarelyUsed.length > 0) {
            report.push('\n⚡ Rarely Used Functions (≤3 calls):\n');
            rarelyUsed.forEach(func => {
                report.push(`  ${func.name} (${func.file}:${func.line}) - ${func.callCount} calls`);
            });
        }

        return report.join('\n');
    }

    public showReport(): void {
        const report = this.generateUsageReport();
        this.outputChannel.clear();
        this.outputChannel.appendLine(report);
        this.outputChannel.show();
    }

    public clearData(): void {
        this.trackedFunctions.clear();
        if (this.trackerFile && fs.existsSync(this.trackerFile)) {
            fs.unlinkSync(this.trackerFile);
        }
        vscode.window.showInformationMessage('Function tracking data cleared');
    }

    public exportToCSV(): void {
        const csvLines: string[] = [];
        csvLines.push('Function,File,Line,Call Count,Last Called,Called By');
        
        for (const func of this.trackedFunctions.values()) {
            csvLines.push([
                func.name,
                func.file,
                func.line.toString(),
                func.callCount.toString(),
                func.lastCalled.toISOString(),
                func.calledBy.join(';')
            ].join(','));
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder) {
            const csvPath = path.join(workspaceFolder.uri.fsPath, 'function-usage.csv');
            fs.writeFileSync(csvPath, csvLines.join('\n'));
            vscode.window.showInformationMessage(`Function usage exported to ${csvPath}`);
        }
    }
}

export function createTrackingProxy<T extends object>(
    target: T,
    fileName: string,
    className?: string
): T {
    const tracker = FunctionTracker.getInstance();
    
    return new Proxy(target, {
        get(obj, prop) {
            const value = obj[prop as keyof T];
            if (typeof value === 'function') {
                return new Proxy(value, {
                    apply(func, thisArg, args) {
                        const functionName = className 
                            ? `${className}.${String(prop)}`
                            : String(prop);
                        
                        const stack = new Error().stack;
                        const callerLine = stack?.split('\n')[3];
                        const callerMatch = callerLine?.match(/at\s+([^\s]+)/);
                        const callerName = callerMatch ? callerMatch[1] : 'unknown';
                        
                        tracker.trackFunction(
                            functionName,
                            fileName,
                            0,
                            callerName
                        );
                        
                        return func.apply(thisArg, args);
                    }
                });
            }
            return value;
        }
    });
}

export function trackMethod(className: string, fileName: string) {
    return function(
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const tracker = FunctionTracker.getInstance();

        descriptor.value = function(...args: any[]) {
            tracker.trackFunction(
                `${className}.${propertyKey}`,
                fileName,
                0
            );
            return originalMethod.apply(this, args);
        };

        return descriptor;
    };
}