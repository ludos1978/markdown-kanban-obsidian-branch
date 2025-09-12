# Dead Code Analysis & Cleanup System

This project includes a comprehensive system for identifying and safely removing obsolete/unused code. Since traditional analysis tools don't work well with this complex TypeScript VSCode extension, we've built a custom solution using the TypeScript Compiler API.

## 🎯 Overview

The dead code analysis system provides:

1. **Static Analysis** - Uses TypeScript AST to find unused functions, classes, and imports
2. **Runtime Tracking** - Optional function call tracking during development
3. **Safe Cleanup** - Interactive and automated removal tools with backup
4. **Detailed Reports** - JSON and visual reports with risk assessments

## 🚀 Quick Start

### Analyze Dead Code
```bash
# Run complete analysis and generate cleanup plan
npm run clean:obsolete

# Or run individual steps:
npm run analyze:dead-code    # Generate dead-code-report.json
npm run analyze:cleanup      # Generate cleanup scripts from report
```

### Clean Up Code
```bash
# Interactive cleanup (RECOMMENDED)
npm run cleanup:interactive

# Automated cleanup (⚠️ HIGH RISK)
npm run cleanup:auto
```

## 📊 Analysis Components

### 1. Dead Code Analyzer (`scripts/analyze-dead-code.ts`)

**Features:**
- ✅ Analyzes all TypeScript files in the project
- ✅ Identifies unused functions, methods, classes, interfaces, enums
- ✅ Tracks function calls and dependencies
- ✅ Recognizes VSCode extension entry points automatically
- ✅ Handles complex patterns like method calls, arrow functions
- ✅ Generates detailed JSON reports

**Entry Points Detected:**
- `activate()` and `deactivate()` functions
- VSCode command handlers
- Exported functions
- Event handlers and callbacks

**Run:**
```bash
npm run analyze:dead-code
```

**Output:** `dead-code-report.json`

### 2. Cleanup Generator (`scripts/cleanup-generator.ts`)

**Features:**
- ✅ Generates safe cleanup actions from analysis
- ✅ Risk assessment (Low/Medium/High)
- ✅ Creates interactive and batch cleanup scripts
- ✅ Identifies unused imports
- ✅ Provides code previews for review

**Risk Levels:**
- 🟢 **Low**: Test functions, debug utilities, clearly unused
- 🟡 **Medium**: Internal functions, non-exported code
- 🔴 **High**: Exported functions, public APIs

**Run:**
```bash
npm run analyze:cleanup
```

**Output:** 
- `cleanup-plan.json` - Detailed cleanup plan
- `interactive-cleanup.ts` - Safe interactive removal
- `cleanup.sh` - Batch removal script

### 3. Function Tracker (`src/utils/functionTracker.ts`)

**Features:**
- ✅ Optional runtime tracking of function calls
- ✅ Tracks call frequency and patterns
- ✅ Identifies never-called vs rarely-called functions
- ✅ Exports usage data to CSV
- ✅ Integrates with VSCode Output panel

**Usage:**
```typescript
import { FunctionTracker } from './utils/functionTracker';

// Start tracking
const tracker = FunctionTracker.getInstance();
tracker.startTracking();

// Track specific function
tracker.trackFunction('myFunction', 'file.ts', 42);

// Generate report
tracker.showReport();
```

## 📋 Generated Reports

### Dead Code Report (`dead-code-report.json`)
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "stats": {
    "total": 150,
    "used": 120,
    "unused": 30,
    "byType": { "function": 15, "class": 5, "interface": 10 }
  },
  "unusedFunctions": [
    {
      "name": "obsoleteFunction",
      "file": "src/example.ts",
      "line": 42,
      "type": "function",
      "isExported": false
    }
  ]
}
```

### Cleanup Plan (`cleanup-plan.json`)
```json
{
  "totalActions": 25,
  "riskBreakdown": { "low": 15, "medium": 8, "high": 2 },
  "actions": [
    {
      "type": "remove_function",
      "file": "src/example.ts",
      "name": "unusedFunction",
      "startLine": 42,
      "endLine": 48,
      "risk": "low",
      "reason": "Function is not referenced anywhere",
      "codePreview": "function unusedFunction() {\n  // code...\n}"
    }
  ]
}
```

## 🛡️ Safety Features

### Automated Backups
- Creates timestamped backup directory before any changes
- Backs up all modified files
- Preserves original file structure

### Risk Assessment
Each cleanup action is classified by risk level:

- **Low Risk:** Clearly unused code, test functions
- **Medium Risk:** Internal functions, potential edge cases  
- **High Risk:** Exported functions, public APIs

### Interactive Review
The interactive cleanup tool shows:
- Code preview of what will be removed
- Risk level and reasoning
- File location and line numbers
- Option to skip individual changes

## 📝 Usage Examples

### Complete Analysis Workflow
```bash
# 1. Install dependencies
npm install

# 2. Run complete analysis
npm run clean:obsolete

# 3. Review the reports
cat cleanup-plan.json | jq '.riskBreakdown'

# 4. Interactive cleanup
npm run cleanup:interactive

# 5. Test your application
npm test
npm run compile
```

### Integration with CI/CD
```bash
# Add to CI pipeline to monitor dead code
npm run analyze:dead-code
if [ $(jq '.stats.unused' dead-code-report.json) -gt 50 ]; then
  echo "⚠️ High amount of dead code detected"
  exit 1
fi
```

### Development Workflow
```bash
# Before major refactoring
npm run analyze:dead-code

# After refactoring, clean up
npm run analyze:cleanup
npm run cleanup:interactive
```

## ⚙️ Configuration

### Ignore Patterns
Edit `analyze-dead-code.ts` to customize ignored files:
```typescript
private ignorePatterns: RegExp[] = [
    /node_modules/,
    /dist/,
    /out/,
    /\.test\./,
    /\.spec\./,
    /test\//
];
```

### Entry Points
The analyzer automatically detects:
- VSCode extension activation functions
- Command handlers registered with `vscode.commands.registerCommand`
- Exported functions
- Event listeners

Add custom entry points by modifying the `identifyEntryPoints()` method.

## 🔧 Troubleshooting

### "tsconfig.json not found"
Ensure you're running the scripts from the project root directory.

### "Cannot find module 'typescript'"
Install dependencies: `npm install`

### False Positives
Some functions may appear unused but are actually called via:
- Dynamic imports (`require()`, `import()`)
- String-based function calls
- Event handlers not detected by analysis
- External API callbacks

Always review the interactive cleanup carefully!

### High Memory Usage
For very large codebases, the analyzer might consume significant memory. Consider:
- Adding more ignore patterns
- Processing files in batches
- Running on a machine with more RAM

## 🎉 Benefits

Using this system regularly provides:

1. **Cleaner Codebase** - Remove obsolete functions and imports
2. **Better Performance** - Smaller bundle sizes, faster compilation
3. **Easier Maintenance** - Less code to understand and maintain
4. **Improved Code Quality** - Focus on code that actually matters
5. **Documentation** - Clear reports of what code is actually used

## 📞 Support

For issues with the dead code analysis system:
1. Check the generated reports for false positives
2. Review backup files if something goes wrong
3. Test thoroughly after any cleanup
4. Consider running analysis multiple times to catch indirect usage

Remember: This tool is designed to be safe, but always review changes manually before applying them to production code!