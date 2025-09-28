# Comprehensive Conflict Management System

This document describes the enhanced conflict management system that handles all possible file modification scenarios gracefully, including edge cases, failures, and complex include dependencies.

## Overview

The system consists of three main components that work together to provide robust conflict resolution:

1. **RobustConflictManager** - Core conflict tracking and dependency management
2. **EnhancedConflictResolver** - Extended conflict resolution with edge case handling
3. **ComprehensiveConflictIntegration** - Integration layer that ties everything together

## Handled Scenarios

### Internal File Modifications
- User edits main markdown file content
- User edits column titles with `!!!columninclude()!!!` syntax
- User edits task titles with `!!!taskinclude()!!!` syntax
- User closes editor without saving
- User closes VS Code without saving
- Extension is disabled/reloaded while unsaved changes exist

### External File Modifications
- Include files modified by external editor
- Main markdown file modified by external editor
- Include files deleted externally
- Include files created/renamed externally
- Multiple external changes happening simultaneously

### Mixed Scenarios
- Internal unsaved changes + external file changes
- Multiple include files changed while internal changes pending
- Cascading changes through dependency chains
- Complex include hierarchies with multiple levels

### Edge Cases and Failures

#### File System Issues
- **File Watcher Failures**: Automatic fallback to polling on network drives
- **Permission Denied**: Options for elevated saves or alternative locations
- **Missing Files**: Create new, find alternative, or remove references
- **Network Timeouts**: Retry, use local version, or work offline
- **Read-only Files**: Backup and alternative save locations

#### System Issues
- **Extension Crashes**: Auto-recovery with emergency backups
- **VS Code Forced Shutdown**: Emergency state preservation
- **Memory Pressure**: Graceful degradation of watchers
- **Workspace Changes**: Re-validation of all file paths

#### Complex Dependencies
- **Circular References**: Detection and breaking assistance
- **Deep Include Chains**: Proper dependency ordering
- **Non-existent Includes**: Graceful error handling
- **Batch Changes**: Process all or selective handling

## Implementation Guide

### Basic Setup

```typescript
// In your extension.ts activate() function
import { ComprehensiveConflictIntegration } from './comprehensiveConflictIntegration';

export function activate(context: vscode.ExtensionContext) {
    // Initialize the conflict integration system
    const conflictIntegration = ComprehensiveConflictIntegration.getInstance(context, {
        enableCrashRecovery: true,
        enableNetworkDriveSupport: true,
        enableCircularDependencyDetection: true,
        enableBatchProcessing: true
    });

    // Register for cleanup
    context.subscriptions.push(conflictIntegration);
}
```

### Panel Registration

```typescript
// When creating/opening a KanbanWebviewPanel
export class KanbanWebviewPanel {
    public static createOrShow(extensionUri: vscode.Uri, context: vscode.ExtensionContext, document: vscode.TextDocument) {
        const panel = new KanbanWebviewPanel(/* ... */);

        // Register with conflict management
        const conflictIntegration = ComprehensiveConflictIntegration.getInstance();
        conflictIntegration.registerPanel(panel, document.uri.fsPath);

        return panel;
    }
}
```

### Handling File Changes

```typescript
// Replace existing external file change handlers
export class ExternalFileWatcher {
    private async handleFileChange(path: string, changeType: FileChangeType): Promise<void> {
        const conflictIntegration = ComprehensiveConflictIntegration.getInstance();
        await conflictIntegration.handleExternalFileChange(path, changeType);
    }
}
```

### Error Recovery

```typescript
// Add to extension startup
export function activate(context: vscode.ExtensionContext) {
    const conflictIntegration = ComprehensiveConflictIntegration.getInstance(context);

    // Perform crash recovery on startup
    conflictIntegration.performCrashRecovery();
}
```

## Configuration Options

The system can be configured with the following options:

```typescript
interface ConflictIntegrationConfig {
    enableCrashRecovery: boolean;           // Auto-recovery from crashes
    enableNetworkDriveSupport: boolean;     // Enhanced network drive handling
    enableCircularDependencyDetection: boolean; // Detect circular includes
    enableBatchProcessing: boolean;         // Handle multiple simultaneous changes
    maxConcurrentConflicts: number;         // Max conflicts to show at once
    debounceDelay: number;                  // Delay before processing changes
}
```

## Conflict Resolution Flow

### 1. Change Detection
- File system watchers detect changes
- Polling fallback for unreliable filesystems
- Health checks ensure watchers are working

### 2. Conflict Analysis
- Determine conflict type and severity
- Check for unsaved changes
- Analyze dependency impact
- Detect circular references

### 3. User Interaction
- Present appropriate dialog based on scenario
- Queue conflicts to avoid dialog spam
- Provide context-specific options
- Remember user preferences

### 4. Resolution Application
- Apply user's chosen resolution
- Handle custom actions (retry, polling, etc.)
- Update dependency graph
- Create backups as needed

## Debugging and Monitoring

### System Status
```typescript
const conflictIntegration = ComprehensiveConflictIntegration.getInstance();
const status = conflictIntegration.getSystemStatus();
console.log('Conflict Management Status:', status);
```

### Common Issues and Solutions

#### File Watcher Not Working
- **Symptom**: External changes not detected
- **Solution**: System automatically falls back to polling
- **User Action**: "Retry File Watcher" or "Use Polling Fallback"

#### Permission Denied
- **Symptom**: Cannot save files
- **Solution**: Alternative save locations or elevated privileges
- **User Action**: "Save Copy Elsewhere" or "Continue Read-Only"

#### Circular Dependencies
- **Symptom**: Warning about infinite loops
- **Solution**: Dependency graph analysis and breaking assistance
- **User Action**: "Break Circular Reference" or "View Dependency Graph"

#### Multiple File Changes
- **Symptom**: Many files changed simultaneously
- **Solution**: Batch processing with user control
- **User Action**: "Process All Changes" or "Choose Files to Process"

## Migration from Existing System

### Step 1: Replace ConflictResolver
```typescript
// Old way
import { ConflictResolver } from './conflictResolver';
const resolver = ConflictResolver.getInstance();

// New way
import { EnhancedConflictResolver } from './enhancedConflictResolver';
const resolver = EnhancedConflictResolver.getEnhancedInstance();
```

### Step 2: Integrate File Watching
```typescript
// Old way
ExternalFileWatcher.getInstance().onFileChanged(async (event) => {
    // Manual handling
});

// New way
const conflictIntegration = ComprehensiveConflictIntegration.getInstance();
// Automatically handles all scenarios
```

### Step 3: Add Panel Registration
```typescript
// Add this to panel creation
conflictIntegration.registerPanel(panel, mainFilePath);
```

## Best Practices

### For Extension Developers
1. Always register panels with the conflict integration system
2. Use the system's file change handlers instead of custom ones
3. Enable crash recovery in production
4. Monitor system status for debugging

### For Users
1. The system will automatically handle most conflicts
2. Choose "Save Copy Elsewhere" when in doubt
3. Use "Break Circular Reference" to resolve dependency loops
4. Enable polling fallback for network drives

## Testing Scenarios

### Manual Testing
1. **External Modification**: Edit include file externally while panel open
2. **Permission Issues**: Make file read-only, then try to save
3. **Missing Files**: Delete include file, then reload panel
4. **Network Issues**: Disconnect network drive during operation
5. **Circular Dependencies**: Create include files that reference each other
6. **Batch Changes**: Modify multiple include files simultaneously
7. **Crash Recovery**: Force quit VS Code with unsaved changes

### Automated Testing
The system includes health checks and monitoring that can detect issues:
- File watcher failures
- Permission problems
- Missing dependencies
- Circular references
- System performance

## Performance Considerations

### Memory Usage
- File states are cached in memory
- Dependency graph grows with include complexity
- Emergency backups use temporary storage

### CPU Usage
- Debouncing reduces excessive processing
- Batch processing handles multiple changes efficiently
- Polling fallback only used when needed

### Disk Usage
- Emergency backups created during crashes
- Dependency analysis requires file reading
- Health checks perform periodic file system access

## Future Enhancements

### Planned Features
1. **Smart Conflict Resolution**: Learn from user choices
2. **Dependency Visualization**: Show include dependency graphs
3. **Performance Optimization**: Reduce memory usage for large projects
4. **Advanced Recovery**: More granular crash recovery options

### Extension Points
The system is designed to be extensible:
- Custom conflict resolvers
- Additional file system watchers
- Custom resolution actions
- Plugin-specific error handlers