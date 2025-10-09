import { PresentationParser } from '../presentationParser';
import { MarkdownKanbanParser, KanbanColumn, KanbanTask } from '../markdownParser';

/**
 * Unified format conversion utility
 * Consolidates all conversion logic from across the codebase
 *
 * Replaces 8+ duplicate conversion functions:
 * - exportService.ts: convertToPresentationFormat, convertPresentationToKanban
 * - presentationParser.ts: parsePresentation, slidesToTasks, tasksToPresentation
 * - markdownParser.ts: parseKanban, columnsToMarkdown
 * - kanbanWebviewPanel.ts: Various inline conversions
 */
export class FormatConverter {
    /**
     * Convert kanban format to presentation format
     *
     * @param kanbanContent - Markdown content in kanban format
     * @param preserveYaml - Whether to preserve YAML frontmatter
     * @returns Content in presentation format
     */
    static kanbanToPresentation(
        kanbanContent: string,
        preserveYaml: boolean = true
    ): string {
        // Extract YAML frontmatter if it exists
        const yamlMatch = kanbanContent.match(/^---\n([\s\S]*?)\n---\n/);
        let yaml = '';
        let contentWithoutYaml = kanbanContent;

        if (yamlMatch) {
            yaml = yamlMatch[0];
            contentWithoutYaml = kanbanContent.substring(yamlMatch[0].length);
        } else if (!yamlMatch && preserveYaml) {
            // Add temporary YAML for parsing
            yaml = '---\nkanban-plugin: board\n---\n\n';
        }

        // Parse the kanban format
        const parseResult = MarkdownKanbanParser.parseMarkdown(yaml + contentWithoutYaml);
        const columns = parseResult.board.columns;

        if (!columns || columns.length === 0) {
            return kanbanContent; // Return original if parsing failed
        }

        // Convert each column to presentation format
        const slides: string[] = [];

        columns.forEach(column => {
            // Add column title as a slide (if not empty)
            if (column.title && column.title.trim()) {
                slides.push(`## ${column.title}`);
            }

            // Add each task as a slide
            column.tasks.forEach(task => {
                const taskSlides = this.taskToPresentation(task);
                slides.push(taskSlides);
            });
        });

        // Combine slides
        const presentationContent = slides.filter(s => s.trim()).join('\n\n---\n\n');

        // Add YAML back if requested
        if (preserveYaml && yaml) {
            return yaml + presentationContent + '\n';
        }

        return presentationContent + '\n';
    }

    /**
     * Convert a single kanban task to presentation format
     *
     * @param task - Kanban task
     * @returns Presentation slide content
     */
    static taskToPresentation(task: KanbanTask): string {
        let slideContent = '';

        // Add title
        if (task.title && task.title.trim()) {
            slideContent += `${task.title}\n\n`;
        }

        // Add description
        if (task.description && task.description.trim()) {
            slideContent += task.description;
        }

        return slideContent.trim();
    }

    /**
     * Convert presentation format to kanban format
     *
     * @param presentationContent - Content in presentation format
     * @param columnTitle - Title for the generated column (optional)
     * @returns Content in kanban format
     */
    static presentationToKanban(
        presentationContent: string,
        columnTitle?: string
    ): string {
        // Parse presentation slides
        const slides = PresentationParser.parsePresentation(presentationContent);

        if (!slides || slides.length === 0) {
            return presentationContent; // Return original if parsing failed
        }

        // Convert slides to tasks
        const tasks = PresentationParser.slidesToTasks(slides);

        // Create a kanban column
        const column: KanbanColumn = {
            id: 'column-1',
            title: columnTitle || 'Slides',
            tasks: tasks
        };

        // Convert to markdown
        return this.columnToMarkdown(column);
    }

    /**
     * Convert a kanban column to markdown format
     *
     * @param column - Kanban column
     * @param includeHeader - Whether to include the column header
     * @returns Markdown content
     */
    static columnToMarkdown(
        column: KanbanColumn,
        includeHeader: boolean = true
    ): string {
        let markdown = '';

        // Add column header
        if (includeHeader) {
            markdown += `## ${column.title}\n`;
        }

        // Add tasks
        column.tasks.forEach(task => {
            markdown += this.taskToMarkdown(task);
        });

        return markdown;
    }

    /**
     * Convert a kanban task to markdown format
     *
     * @param task - Kanban task
     * @param indentLevel - Indentation level (for subtasks)
     * @returns Markdown content
     */
    static taskToMarkdown(task: KanbanTask, indentLevel: number = 0): string {
        const indent = '  '.repeat(indentLevel);
        let markdown = '';

        // Task checkbox line (always unchecked for now)
        markdown += `${indent}- [ ] ${task.title}\n`;

        // Add description if it exists
        if (task.description && task.description.trim()) {
            // Indent description lines
            const descLines = task.description.split('\n');
            descLines.forEach(line => {
                markdown += `${indent}  ${line}\n`;
            });
        }

        return markdown;
    }

    /**
     * Detect the format of markdown content
     *
     * @param content - Markdown content
     * @returns Format type
     */
    static detectFormat(content: string): 'kanban' | 'presentation' | 'unknown' {
        // Remove YAML frontmatter for detection
        const contentWithoutYaml = content.replace(/^---\n[\s\S]*?\n---\n/, '');

        // Check for kanban indicators
        const hasCheckboxes = /^[\s]*-\s\[[ x]\]/m.test(contentWithoutYaml);
        const hasColumns = /^##\s+/m.test(contentWithoutYaml);

        // Check for presentation indicators
        const hasSlideSeparators = /^---\s*$/m.test(contentWithoutYaml);

        if (hasCheckboxes && hasColumns) {
            return 'kanban';
        }

        if (hasSlideSeparators) {
            return 'presentation';
        }

        // Default to kanban if it has headings (columns)
        if (hasColumns) {
            return 'kanban';
        }

        return 'unknown';
    }

    /**
     * Convert content to a specific format
     * Auto-detects source format
     *
     * @param content - Source content
     * @param targetFormat - Target format
     * @param options - Conversion options
     * @returns Converted content
     */
    static convert(
        content: string,
        targetFormat: 'kanban' | 'presentation',
        options: ConversionOptions = {}
    ): string {
        const sourceFormat = this.detectFormat(content);

        // No conversion needed
        if (sourceFormat === targetFormat) {
            return content;
        }

        // Unknown source format - return original
        if (sourceFormat === 'unknown') {
            console.warn('[FormatConverter] Unable to detect source format');
            return content;
        }

        // Perform conversion
        if (targetFormat === 'presentation') {
            return this.kanbanToPresentation(content, options.preserveYaml);
        } else {
            return this.presentationToKanban(content, options.columnTitle);
        }
    }

    /**
     * Extract only the content (remove YAML frontmatter)
     *
     * @param content - Markdown content with YAML
     * @returns Content without YAML
     */
    static stripYaml(content: string): string {
        const yamlMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        if (yamlMatch) {
            return content.substring(yamlMatch[0].length);
        }
        return content;
    }

    /**
     * Extract YAML frontmatter
     *
     * @param content - Markdown content
     * @returns YAML frontmatter (including delimiters) or empty string
     */
    static extractYaml(content: string): string {
        const yamlMatch = content.match(/^---\n[\s\S]*?\n---\n/);
        return yamlMatch ? yamlMatch[0] : '';
    }

    /**
     * Add or replace YAML frontmatter
     *
     * @param content - Markdown content
     * @param yaml - YAML frontmatter (without delimiters)
     * @returns Content with YAML
     */
    static addYaml(content: string, yaml: string): string {
        // Remove existing YAML
        const contentWithoutYaml = this.stripYaml(content);

        // Format YAML with delimiters
        const formattedYaml = `---\n${yaml.trim()}\n---\n\n`;

        return formattedYaml + contentWithoutYaml;
    }
}

/**
 * Options for format conversion
 */
export interface ConversionOptions {
    /** Preserve YAML frontmatter during conversion */
    preserveYaml?: boolean;

    /** Column title when converting to kanban */
    columnTitle?: string;

    /** Additional metadata to preserve */
    preserveMetadata?: boolean;
}
