#!/usr/bin/env node

/**
 * Code Cleanup Analyzer
 * Combines static analysis with runtime tracking data to provide
 * comprehensive recommendations for code cleanup
 */

const fs = require('fs');
const path = require('path');
const CodeAnalyzer = require('./code-analyzer');

class CleanupAnalyzer {
    constructor() {
        this.staticReport = null;
        this.runtimeReports = [];
        this.combinedAnalysis = null;
    }

    /**
     * Run comprehensive analysis
     */
    async analyze() {
        console.log('🚀 Starting comprehensive code cleanup analysis...\n');

        // Step 1: Static analysis
        console.log('📊 Step 1: Static Code Analysis');
        await this.runStaticAnalysis();

        // Step 2: Load runtime reports
        console.log('\n📈 Step 2: Runtime Tracking Analysis');
        this.loadRuntimeReports();

        // Step 3: Combine analyses
        console.log('\n🔗 Step 3: Combining Static and Runtime Data');
        this.combineAnalyses();

        // Step 4: Generate cleanup recommendations
        console.log('\n💡 Step 4: Generating Cleanup Recommendations');
        this.generateCleanupPlan();

        // Step 5: Output results
        this.outputResults();
    }

    /**
     * Run static code analysis
     */
    async runStaticAnalysis() {
        const analyzer = new CodeAnalyzer();
        this.staticReport = await analyzer.analyze('.');

        console.log(`   ✓ Analyzed ${this.staticReport.summary.totalFunctions} functions`);
        console.log(`   ✓ Found ${this.staticReport.summary.unusedFunctions} potentially unused functions`);
    }

    /**
     * Load runtime tracking reports
     */
    loadRuntimeReports() {
        const reportsDir = path.join(__dirname, 'reports');

        if (!fs.existsSync(reportsDir)) {
            console.log('   ⚠️  No runtime reports found. Enable runtime tracking to get better insights.');
            return;
        }

        const reportFiles = fs.readdirSync(reportsDir)
            .filter(file => file.startsWith('runtime-tracking-') && file.endsWith('.json'))
            .sort()
            .slice(-10); // Get last 10 reports

        console.log(`   📁 Found ${reportFiles.length} runtime tracking reports`);

        for (const file of reportFiles) {
            try {
                const reportPath = path.join(reportsDir, file);
                const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
                this.runtimeReports.push(report);

                console.log(`   ✓ Loaded ${file} (${report.summary?.totalCalls || 0} calls, ${Math.round((report.metadata?.duration || 0) / 1000)}s)`);
            } catch (error) {
                console.log(`   ❌ Failed to load ${file}: ${error.message}`);
            }
        }
    }

    /**
     * Combine static and runtime analyses
     */
    combineAnalyses() {
        const runtimeCallCounts = new Map();
        const runtimeFrequencies = new Map();
        let totalRuntimeDuration = 0;

        // Aggregate runtime data across all sessions
        for (const report of this.runtimeReports) {
            totalRuntimeDuration += report.metadata?.duration || 0;

            if (report.functions) {
                for (const func of report.functions) {
                    const currentCount = runtimeCallCounts.get(func.name) || 0;
                    const currentFreq = runtimeFrequencies.get(func.name) || 0;

                    runtimeCallCounts.set(func.name, currentCount + func.count);
                    runtimeFrequencies.set(func.name, Math.max(currentFreq, func.frequency || 0));
                }
            }
        }

        // Create combined analysis
        this.combinedAnalysis = {
            static: this.staticReport,
            runtime: {
                totalSessions: this.runtimeReports.length,
                totalDuration: totalRuntimeDuration,
                callCounts: runtimeCallCounts,
                frequencies: runtimeFrequencies
            },
            functions: new Map()
        };

        // Combine function data
        for (const func of this.staticReport.functionUsage) {
            const runtimeCalls = runtimeCallCounts.get(func.name) || 0;
            const runtimeFreq = runtimeFrequencies.get(func.name) || 0;

            this.combinedAnalysis.functions.set(func.name, {
                ...func,
                runtime: {
                    calls: runtimeCalls,
                    frequency: runtimeFreq,
                    wasUsed: runtimeCalls > 0
                }
            });
        }

        console.log(`   ✓ Combined data from ${this.runtimeReports.length} runtime sessions`);
        console.log(`   ✓ Total runtime: ${Math.round(totalRuntimeDuration / 1000 / 60)} minutes`);
    }

    /**
     * Generate cleanup recommendations
     */
    generateCleanupPlan() {
        const recommendations = {
            highPriority: [], // Definitely can be removed
            mediumPriority: [], // Probably can be removed
            lowPriority: [], // Review and consider
            keep: [], // Should be kept
            stats: {
                totalFunctions: this.combinedAnalysis.functions.size,
                canRemove: 0,
                shouldReview: 0,
                mustKeep: 0,
                potentialSavings: 0
            }
        };

        for (const [funcName, funcData] of this.combinedAnalysis.functions) {
            const category = this.categorizeFunctionForCleanup(funcData);
            recommendations[category.priority].push({
                name: funcName,
                file: funcData.file,
                line: funcData.line,
                type: funcData.type,
                staticCalls: funcData.callCount,
                runtimeCalls: funcData.runtime.calls,
                reason: category.reason,
                confidence: category.confidence,
                estimatedLines: this.estimateFunctionSize(funcData)
            });

            // Update stats
            if (category.priority === 'highPriority' || category.priority === 'mediumPriority') {
                recommendations.stats.canRemove++;
                recommendations.stats.potentialSavings += this.estimateFunctionSize(funcData);
            } else if (category.priority === 'lowPriority') {
                recommendations.stats.shouldReview++;
            } else {
                recommendations.stats.mustKeep++;
            }
        }

        // Sort by confidence and potential impact
        for (const priority of ['highPriority', 'mediumPriority', 'lowPriority']) {
            recommendations[priority].sort((a, b) => {
                if (a.confidence !== b.confidence) {
                    return b.confidence - a.confidence; // Higher confidence first
                }
                return b.estimatedLines - a.estimatedLines; // Larger functions first
            });
        }

        this.cleanupPlan = recommendations;

        console.log(`   ✓ Generated cleanup recommendations:`);
        console.log(`     🔴 High priority (can remove): ${recommendations.highPriority.length}`);
        console.log(`     🟡 Medium priority (probably remove): ${recommendations.mediumPriority.length}`);
        console.log(`     🔵 Low priority (review): ${recommendations.lowPriority.length}`);
        console.log(`     ✅ Keep: ${recommendations.keep.length}`);
        console.log(`     📏 Potential lines saved: ~${recommendations.stats.potentialSavings}`);
    }

    /**
     * Categorize function for cleanup based on usage patterns
     */
    categorizeFunctionForCleanup(funcData) {
        const hasRuntimeData = this.runtimeReports.length > 0;
        const isExported = funcData.isExported;
        const isGlobal = funcData.isGlobal;
        const isEventHandler = funcData.isEventHandler;
        const staticCalls = funcData.callCount;
        const runtimeCalls = funcData.runtime.calls;
        const wasUsedInRuntime = funcData.runtime.wasUsed;

        // Functions that should definitely be kept
        if (isExported || isGlobal || isEventHandler) {
            return {
                priority: 'keep',
                reason: `Function is ${isExported ? 'exported' : isGlobal ? 'global' : 'event handler'}`,
                confidence: 1.0
            };
        }

        // High confidence removals
        if (hasRuntimeData && !wasUsedInRuntime && staticCalls === 0) {
            return {
                priority: 'highPriority',
                reason: 'No static calls found and never used in runtime tracking',
                confidence: 0.95
            };
        }

        if (!hasRuntimeData && staticCalls === 0) {
            return {
                priority: 'highPriority',
                reason: 'No static calls found (no runtime data available)',
                confidence: 0.8
            };
        }

        // Medium confidence removals
        if (hasRuntimeData && !wasUsedInRuntime && staticCalls <= 1) {
            return {
                priority: 'mediumPriority',
                reason: 'Very few static calls and never used in runtime',
                confidence: 0.7
            };
        }

        if (hasRuntimeData && runtimeCalls <= 1 && staticCalls <= 2) {
            return {
                priority: 'mediumPriority',
                reason: 'Rarely used in both static analysis and runtime',
                confidence: 0.6
            };
        }

        // Low priority (review needed)
        if (staticCalls <= 2 || (hasRuntimeData && runtimeCalls <= 2)) {
            return {
                priority: 'lowPriority',
                reason: 'Low usage - consider if function adds value',
                confidence: 0.4
            };
        }

        // Keep everything else
        return {
            priority: 'keep',
            reason: 'Function appears to be actively used',
            confidence: 0.9
        };
    }

    /**
     * Estimate function size in lines of code
     */
    estimateFunctionSize(funcData) {
        // This is a rough estimate - could be improved with actual parsing
        const typeMultipliers = {
            'declaration': 10,
            'arrow': 5,
            'method': 8,
            'class': 15
        };

        return typeMultipliers[funcData.type] || 8;
    }

    /**
     * Output results
     */
    outputResults() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

        // Save detailed report
        const detailedReportPath = `cleanup-analysis-detailed-${timestamp}.json`;
        fs.writeFileSync(detailedReportPath, JSON.stringify({
            staticReport: this.staticReport,
            runtimeReports: this.runtimeReports.map(r => ({
                sessionId: r.metadata?.sessionId,
                duration: r.metadata?.duration,
                totalCalls: r.summary?.totalCalls,
                uniqueFunctions: r.summary?.uniqueFunctions
            })),
            combinedAnalysis: {
                ...this.combinedAnalysis,
                functions: Array.from(this.combinedAnalysis.functions.entries()).map(([name, data]) => ({
                    name,
                    ...data
                }))
            },
            cleanupPlan: this.cleanupPlan
        }, null, 2));

        // Save cleanup script
        this.generateCleanupScript(timestamp);

        // Generate summary report
        this.generateSummaryReport(timestamp);

        console.log('\n📋 Analysis Complete!');
        console.log(`📄 Detailed report: ${detailedReportPath}`);
        console.log(`📋 Summary report: cleanup-summary-${timestamp}.md`);
        console.log(`🔧 Cleanup script: cleanup-script-${timestamp}.sh`);

        this.printQuickSummary();
    }

    /**
     * Generate cleanup script
     */
    generateCleanupScript(timestamp) {
        const scriptPath = `cleanup-script-${timestamp}.sh`;
        let script = '#!/bin/bash\n\n';
        script += '# Generated cleanup script based on code analysis\n';
        script += '# Review each removal carefully before executing\n\n';

        script += 'echo "🗑️  Code Cleanup Script"\n';
        script += 'echo "This script will help remove unused functions based on analysis"\n\n';

        script += '# High priority removals (high confidence)\n';
        for (const func of this.cleanupPlan.highPriority) {
            script += `echo "Removing ${func.name} from ${func.file}:${func.line}"\n`;
            script += `# Reason: ${func.reason}\n`;
            script += `# sed -i '${func.line}d' "${func.file}"\n\n`;
        }

        script += '# Medium priority removals (review recommended)\n';
        for (const func of this.cleanupPlan.mediumPriority) {
            script += `echo "Consider removing ${func.name} from ${func.file}:${func.line}"\n`;
            script += `# Reason: ${func.reason}\n`;
            script += `# sed -i '${func.line}d' "${func.file}"\n\n`;
        }

        fs.writeFileSync(scriptPath, script);
    }

    /**
     * Generate summary report in Markdown
     */
    generateSummaryReport(timestamp) {
        const reportPath = `cleanup-summary-${timestamp}.md`;
        let report = '# Code Cleanup Analysis Report\n\n';

        report += `**Generated**: ${new Date().toISOString()}\n\n`;

        report += '## Summary\n\n';
        report += `- **Total Functions**: ${this.cleanupPlan.stats.totalFunctions}\n`;
        report += `- **Can Remove**: ${this.cleanupPlan.stats.canRemove}\n`;
        report += `- **Should Review**: ${this.cleanupPlan.stats.shouldReview}\n`;
        report += `- **Estimated Lines Saved**: ~${this.cleanupPlan.stats.potentialSavings}\n\n`;

        if (this.runtimeReports.length > 0) {
            report += '## Runtime Data\n\n';
            report += `- **Sessions Analyzed**: ${this.runtimeReports.length}\n`;
            report += `- **Total Runtime**: ${Math.round(this.combinedAnalysis.runtime.totalDuration / 1000 / 60)} minutes\n\n`;
        }

        report += '## High Priority Removals\n\n';
        report += 'These functions can likely be removed safely:\n\n';
        for (const func of this.cleanupPlan.highPriority) {
            report += `- **${func.name}** in \`${func.file}:${func.line}\`\n`;
            report += `  - *Reason*: ${func.reason}\n`;
            report += `  - *Confidence*: ${Math.round(func.confidence * 100)}%\n\n`;
        }

        report += '## Medium Priority Removals\n\n';
        report += 'These functions should be reviewed and likely removed:\n\n';
        for (const func of this.cleanupPlan.mediumPriority) {
            report += `- **${func.name}** in \`${func.file}:${func.line}\`\n`;
            report += `  - *Reason*: ${func.reason}\n`;
            report += `  - *Confidence*: ${Math.round(func.confidence * 100)}%\n\n`;
        }

        if (this.cleanupPlan.lowPriority.length > 0) {
            report += '## Review Candidates\n\n';
            report += 'These functions have low usage and should be reviewed:\n\n';
            for (const func of this.cleanupPlan.lowPriority.slice(0, 10)) { // Show top 10
                report += `- **${func.name}** in \`${func.file}:${func.line}\`\n`;
                report += `  - *Reason*: ${func.reason}\n\n`;
            }
        }

        fs.writeFileSync(reportPath, report);
    }

    /**
     * Print quick summary to console
     */
    printQuickSummary() {
        console.log('\n📊 Quick Summary:');
        console.log(`   🔴 ${this.cleanupPlan.highPriority.length} functions can be removed immediately`);
        console.log(`   🟡 ${this.cleanupPlan.mediumPriority.length} functions should be reviewed for removal`);
        console.log(`   🔵 ${this.cleanupPlan.lowPriority.length} functions have low usage`);
        console.log(`   💾 Potential space savings: ~${this.cleanupPlan.stats.potentialSavings} lines of code`);

        if (this.cleanupPlan.highPriority.length > 0) {
            console.log('\n🔥 Top removal candidates:');
            this.cleanupPlan.highPriority.slice(0, 5).forEach(func => {
                console.log(`   • ${func.name} (${func.file}:${func.line}) - ${func.reason}`);
            });
        }

        console.log('\n💡 To enable runtime tracking for better analysis:');
        console.log('   1. Open the kanban webview');
        console.log('   2. Open browser console');
        console.log('   3. Run: runtimeTracker.enable()');
        console.log('   4. Use the application normally');
        console.log('   5. Run this analysis again after some usage');
    }
}

// CLI usage
if (require.main === module) {
    const analyzer = new CleanupAnalyzer();
    analyzer.analyze().catch(console.error);
}

module.exports = CleanupAnalyzer;