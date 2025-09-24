# Code Analysis Tools

This directory contains automated tools for analyzing code quality, structure, and identifying optimization opportunities.

## Tools

### 1. Duplicate Code Analyzer (`analyze-duplicates.js`)

Identifies duplicate functions, redundant patterns, and consolidation opportunities.

**Features:**
- Function duplication detection using AST analysis
- Pattern recognition for common code structures
- Import/dependency analysis
- Quantitative duplication metrics
- Markdown report generation

**Usage:**
```bash
node scripts/analyze-duplicates.js
```

**Output:**
- Console summary with top duplicates
- `code-analysis-report.md` with detailed findings

### 2. Structure Analyzer (`structure-analyzer.js`)

Analyzes project architecture, dependencies, and complexity metrics.

**Features:**
- Architectural layer identification
- Dependency graph construction
- Circular dependency detection
- Cyclomatic complexity calculation
- Improvement opportunity identification

**Usage:**
```bash
node scripts/structure-analyzer.js
```

**Output:**
- Console summary with key metrics
- `structure-analysis-report.md` with comprehensive analysis

## Integration

### Continuous Quality Monitoring

Add these tools to your development workflow:

```bash
# Add to package.json scripts
{
  "scripts": {
    "analyze": "node scripts/analyze-duplicates.js && node scripts/structure-analyzer.js",
    "analyze:duplicates": "node scripts/analyze-duplicates.js",
    "analyze:structure": "node scripts/structure-analyzer.js"
  }
}
```

### Pre-commit Hooks

Consider adding quality gates:

```bash
# .husky/pre-commit
#!/bin/sh
npm run analyze
# Check if complexity thresholds are exceeded
```

## Thresholds and Targets

### Complexity Targets
- **File complexity**: <50 (current average: 122)
- **Function complexity**: <10
- **File size**: <300 lines (current average: 389)

### Quality Metrics
- **Duplicate functions**: Target <50 (current: 208)
- **Circular dependencies**: 0 (current: 0 ✅)
- **Test coverage**: >80%

## Customization

### Duplicate Analyzer Configuration

Modify patterns in `analyze-duplicates.js`:

```javascript
// Add new patterns to detect
const patterns = [
    { name: 'customPattern', pattern: /your-regex-here/g }
];
```

### Structure Analyzer Configuration

Adjust complexity thresholds in `structure-analyzer.js`:

```javascript
// Modify complexity thresholds
const COMPLEXITY_THRESHOLDS = {
    file: 50,
    function: 10,
    fileSize: 300
};
```

## Report Examples

### Duplicate Analysis Output
```
📊 CODE ANALYSIS REPORT
Files analyzed: 52
Duplicate functions: 208
Potential duplicate lines: 767
Common patterns: 5
```

### Structure Analysis Output
```
🏗️ STRUCTURE ANALYSIS REPORT
Total files: 53
Total lines: 20,604
Average complexity: 122
Circular dependencies: 0
```

## Contributing

When adding new analysis capabilities:

1. Follow the existing pattern structure
2. Add comprehensive documentation
3. Include example outputs
4. Update this README
5. Test with the current codebase

## Dependencies

These tools use only Node.js built-in modules:
- `fs` - File system operations
- `path` - Path manipulation
- `crypto` - Hash generation

No external dependencies required for maximum compatibility.