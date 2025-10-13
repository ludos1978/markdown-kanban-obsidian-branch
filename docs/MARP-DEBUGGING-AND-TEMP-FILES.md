# Marp Export Debugging and Temporary File Management

This document explains the enhanced error logging and temporary file handling features for Marp exports in the Kanban extension.

## Enhanced Error Logging

When Marp exports fail, the extension now provides comprehensive debugging information including:

### Debug Information Logged

1. **Working Directory**: The current working directory where Marp CLI was executed
2. **Full Command**: The complete command that was executed
3. **Temp File Path**: Path to the temporary markdown file used for export
4. **Output Path**: Intended output file path
5. **Exit Code**: Marp CLI exit code for error diagnosis
6. **File Status**: Whether temp file exists and its size
7. **Partial Output**: Information about partially created output files

### Example Error Output

```
[kanban.MarpExportService] === MARP EXPORT FAILED ===
[kanban.MarpExportService] Exit code: 1
[kanban.MarpExportService] Working directory: /Users/username/project
[kanban.MarpExportService] Command that failed: npx @marp-team/marp-cli input.marp-temp.md --pdf --output output.pdf
[kanban.MarpExportService] Temp file: /Users/username/project/input.marp-temp.md
[kanban.MarpExportService] Output path: /Users/username/project/output.pdf
[kanban.MarpExportService] Partial output file exists: 0 bytes
[kanban.MarpExportService] =========================
```

## Temporary File Management

### New Configuration Option

**Setting**: `markdown-kanban.marp.keepTempFiles`
- **Type**: Boolean
- **Default**: `false`
- **Description**: Keep temporary markdown files used during Marp export for debugging purposes. Files will be saved with `.marp-temp.md` extension in the output directory.

### File Naming Behavior

#### When `keepTempFiles: false` (Default)
- Temporary files are named `.temp-marp-export.md`
- Files are automatically deleted after export (successful or failed)
- No cleanup required by user

#### When `keepTempFiles: true`
- Temporary files are named `{output-name}.marp-temp.md`
- Files are preserved in the output directory
- Useful for debugging export issues
- Manual cleanup required

### Example File Structure

```
project/
├── my-kanban.md
├── exports/
│   ├── presentation.pdf          # Exported PDF
│   └── presentation.marp-temp.md # Temp file (when keepTempFiles: true)
└── .temp-marp-export.md          # Temp file (when keepTempFiles: false, but usually deleted)
```

## Configuration

### VS Code Settings

1. Open VS Code Settings
2. Search for "markdown-kanban"
3. Find the "Marp" section
4. Toggle **"Keep Temp Files"** to enable debugging mode

### JSON Configuration

```json
{
  "markdown-kanban.marp.keepTempFiles": true
}
```

## Debugging Workflow

### Step 1: Enable Temp File Keeping

```json
{
  "markdown-kanban.marp.keepTempFiles": true
}
```

### Step 2: Attempt Export

Try exporting your Kanban board again. The extension will now:
- Create a `.marp-temp.md` file in your output directory
- Log comprehensive debugging information
- Preserve the temp file for inspection

### Step 3: Examine Temp File

Open the generated `.marp-temp.md` file to:
- Verify the markdown content is correct
- Check for formatting issues
- Test manually with Marp CLI

### Step 4: Manual Testing

Test the temp file directly with Marp CLI:

```bash
# Navigate to the working directory shown in logs
cd /path/to/working/directory

# Run the exact command from logs
npx @marp-team/marp-cli presentation.marp-temp.md --pdf --output presentation.pdf
```

### Step 5: Analyze Logs

Check the VS Code developer console for:
- Working directory issues
- Command execution problems
- File permission errors
- Theme loading failures

## Common Issues and Solutions

### ENOENT: No such file or directory

**Error**: `ENOENT: no such file or directory, open 'bespoke.js'`

**Solution**: 
1. Check the working directory in logs
2. Verify theme files exist in expected locations
3. Check theme folder configuration

### Permission Denied

**Error**: Permission-related errors

**Solution**:
1. Check file permissions on output directory
2. Verify temp directory is writable
3. Check Marp CLI installation permissions

### Theme Loading Issues

**Error**: Theme not found or invalid

**Solution**:
1. Verify theme folder paths in configuration
2. Check CSS file syntax
3. Test with default theme first

## Advanced Debugging

### Enable Verbose Logging

For additional debugging, you can run Marp CLI directly with verbose output:

```bash
npx @marp-team/marp-cli --verbose presentation.marp-temp.md --pdf --output presentation.pdf
```

### Check Marp CLI Version

```bash
npx @marp-team/marp-cli --version
```

### Verify Theme Installation

```bash
npx @marp-team/marp-cli --list-themes
```

## Integration with Existing Features

The enhanced debugging works seamlessly with:
- **Theme Folders**: Custom themes are logged with their resolved paths
- **Export Service**: All export formats (PDF, PPTX, HTML) benefit from enhanced logging
- **Configuration Service**: Settings are cached and properly validated
- **Error Handling**: Graceful fallback with detailed error reporting

## Performance Considerations

- **Temp File Storage**: When enabled, temp files consume disk space
- **Log Volume**: Enhanced logging increases console output
- **Cleanup**: Manual cleanup required when `keepTempFiles` is enabled

## Best Practices

1. **Production Use**: Keep `keepTempFiles` disabled for normal operation
2. **Debugging Mode**: Enable temporarily when troubleshooting export issues
3. **Log Analysis**: Use the comprehensive logs to identify root causes
4. **File Cleanup**: Remove `.marp-temp.md` files after debugging is complete
5. **Theme Testing**: Verify custom themes work with default content first