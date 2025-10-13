# Marp Theme Folders Configuration

This extension now supports configuring additional theme folders for Marp presentations, allowing you to use custom themes in your Kanban board exports.

## Configuration

### Setting up Theme Folders

1. Open VS Code Settings
2. Search for "markdown-kanban"
3. Find the "Marp" section
4. Configure the **Theme Folders** setting

### Configuration Options

#### `markdown-kanban.marp.themeFolders`
- **Type**: Array of strings
- **Default**: `[]` (empty array)
- **Description**: Additional theme folders for Marp. Add paths to directories containing custom Marp theme CSS files. Paths can be relative to workspace or absolute.

### Example Configuration

```json
{
  "markdown-kanban.marp.themeFolders": [
    "./themes",
    "./custom-marp-themes",
    "/absolute/path/to/themes",
    "./docs/presentation-themes"
  ]
}
```

## Theme File Requirements

Custom theme files should be CSS files with either:
- `.css` extension
- `.marp.css` extension

### Example Theme Structure

```
workspace/
├── themes/
│   ├── corporate.css
│   ├── dark-theme.marp.css
│   └── minimal.css
├── custom-marp-themes/
│   └── presentation-style.css
└── my-kanban.md
```

## How It Works

1. **Priority Order**: The extension first checks configured theme folders, then falls back to common locations:
   - `.marp/themes/`
   - `themes/`
   - `_themes/`
   - `assets/themes/`

2. **Path Resolution**: 
   - **Relative paths**: Resolved relative to the workspace root
   - **Absolute paths**: Used as-is

3. **Theme Detection**: The extension automatically scans configured folders for CSS files and makes them available in the export dialog.

## Usage in Kanban Export

1. Create a Kanban board with presentation content
2. Use the export functionality (PDF, PPTX, HTML)
3. Select your custom theme from the available themes dropdown
4. The extension will automatically use your custom theme files

## Example Custom Theme

```css
/* corporate-theme.css */
@theme default;

section {
  background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
  color: white;
  font-family: 'Arial', sans-serif;
}

h1, h2, h3 {
  color: #ffffff;
  text-align: center;
}

blockquote {
  border-left: 4px solid #ffd700;
  background-color: rgba(255,255,255,0.1);
  padding: 1em;
  margin: 1em 0;
}
```

## Troubleshooting

### Theme Not Showing Up
1. Verify the theme folder path is correct
2. Check that CSS files have `.css` or `.marp.css` extension
3. Ensure the folder exists and is accessible
4. Check the developer console for theme loading errors

### Export Fails
1. Verify Marp CLI is properly installed
2. Check that theme CSS syntax is valid
3. Test with a simple theme first
4. Check console logs for detailed error messages

## Integration with Existing Features

The theme folders feature integrates seamlessly with:
- **Export Service**: Automatically uses configured themes during export
- **Theme Detection**: Scans and lists available custom themes
- **Fallback System**: Uses default themes if custom themes are not found
- **Configuration Service**: Manages theme folder settings through VS Code configuration

## Notes

- Theme folders are workspace-specific
- Changes to theme folders require restarting the extension
- Custom themes override built-in themes with the same name
- Multiple theme folders are supported and scanned in order