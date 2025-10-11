import { KanbanBoard, KanbanColumn, KanbanTask } from '../markdownParser';
import { TagUtils, TagVisibility } from '../utils/tagUtils';

export interface MarpConversionOptions {
    /** Marp theme to use */
    theme?: string;
    /** Custom CSS path */
    customCss?: string;
    /** Tag visibility settings */
    tagVisibility?: TagVisibility;
    /** Whether to preserve YAML frontmatter */
    preserveYaml?: boolean;
    /** Additional Marp directives */
    directives?: Record<string, string | boolean | number>;
}

/**
 * Service to convert kanban board format to Marp presentation format
 */
export class MarpConverter {
    /**
     * Convert a kanban board to Marp-compatible markdown
     * @param board - The kanban board to convert
     * @param options - Conversion options
     * @returns Marp-compatible markdown string
     */
    static kanbanToMarp(board: KanbanBoard, options: MarpConversionOptions = {}): string {
        let result = '';

        // Add Marp frontmatter
        result += this.createMarpFrontmatter(options);
        result += '\n';

        // Convert each column to slide sections
        for (const column of board.columns) {
            const columnSlides = this.columnToSlides(column, options.tagVisibility);
            if (columnSlides) {
                result += columnSlides;
                result += '\n';
            }
        }

        return result;
    }

    /**
     * Create Marp YAML frontmatter with directives
     * @param options - Conversion options
     * @returns YAML frontmatter string
     */
    private static createMarpFrontmatter(options: MarpConversionOptions): string {
        const directives: Record<string, string | boolean | number> = {
            marp: true,
            theme: options.theme || 'default',
            ...options.directives
        };

        let yaml = '---\n';
        for (const [key, value] of Object.entries(directives)) {
            if (typeof value === 'string') {
                yaml += `${key}: "${value}"\n`;
            } else {
                yaml += `${key}: ${value}\n`;
            }
        }
        yaml += '---\n';

        return yaml;
    }

    /**
     * Convert a column to Marp slides
     * @param column - The column to convert
     * @param tagVisibility - Tag visibility settings
     * @returns Markdown string with slides
     */
    private static columnToSlides(column: KanbanColumn, tagVisibility?: TagVisibility): string {
        let result = '';

        // Add column header as a slide (if title exists)
        if (column.title && column.title.trim()) {
            let columnTitle = column.title;

            // Apply tag filtering if specified
            if (tagVisibility && tagVisibility !== 'all') {
                columnTitle = TagUtils.processMarkdownContent(columnTitle, tagVisibility);
            }

            result += `## ${columnTitle}\n\n`;
            result += '---\n\n';
        }

        // Convert each task to a slide
        for (const task of column.tasks) {
            const taskSlide = this.taskToSlide(task, tagVisibility);
            if (taskSlide) {
                result += taskSlide;
                result += '\n---\n\n';
            }
        }

        return result;
    }

    /**
     * Convert a task to a Marp slide
     * @param task - The task to convert
     * @param tagVisibility - Tag visibility settings
     * @returns Slide content as markdown
     */
    private static taskToSlide(task: KanbanTask, tagVisibility?: TagVisibility): string {
        let result = '';

        // Add task title
        if (task.title && task.title.trim()) {
            let title = task.title;

            // Apply tag filtering
            if (tagVisibility && tagVisibility !== 'all') {
                title = TagUtils.processMarkdownContent(title, tagVisibility);
            }

            result += `### ${title}\n\n`;
        }

        // Add task description/content
        if (task.description && task.description.trim()) {
            let description = task.description;

            // Apply tag filtering
            if (tagVisibility && tagVisibility !== 'all') {
                description = TagUtils.processMarkdownContent(description, tagVisibility);
            }

            result += description;
            result += '\n';
        }

        return result.trim();
    }

    /**
     * Convert kanban markdown to Marp format (works with raw markdown string)
     * @param kanbanMarkdown - Kanban markdown content
     * @param options - Conversion options
     * @returns Marp-compatible markdown
     */
    static convertMarkdownToMarp(kanbanMarkdown: string, options: MarpConversionOptions = {}): string {
        // Extract existing YAML frontmatter if present
        const yamlMatch = kanbanMarkdown.match(/^---\n([\s\S]*?)\n---\n/);
        let existingYaml: Record<string, any> = {};

        if (yamlMatch) {
            // Parse existing YAML (simple parsing)
            const yamlContent = yamlMatch[1];
            const lines = yamlContent.split('\n');
            for (const line of lines) {
                const match = line.match(/^(\w+):\s*(.+)$/);
                if (match) {
                    const [, key, value] = match;
                    existingYaml[key] = value.replace(/["']/g, '');
                }
            }
        }

        // Create Marp frontmatter, preserving some existing values
        const marpDirectives: Record<string, string | boolean | number> = {
            marp: true,
            theme: options.theme || 'default',
            ...options.directives,
            // Preserve kanban-plugin if it exists
            ...(existingYaml['kanban-plugin'] ? { 'kanban-plugin': existingYaml['kanban-plugin'] } : {})
        };

        let result = '---\n';
        for (const [key, value] of Object.entries(marpDirectives)) {
            if (typeof value === 'string') {
                result += `${key}: "${value}"\n`;
            } else {
                result += `${key}: ${value}\n`;
            }
        }
        result += '---\n\n';

        // Remove existing frontmatter from content
        let content = kanbanMarkdown;
        if (yamlMatch) {
            content = kanbanMarkdown.substring(yamlMatch[0].length);
        }

        // Convert kanban format to slides
        // Split by ## (columns) and - [ ] (tasks)
        const lines = content.split('\n');
        let inTask = false;
        let currentSlide = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Column header (## Title)
            if (line.match(/^##\s+/)) {
                if (currentSlide.trim()) {
                    result += currentSlide;
                    result += '\n---\n\n';
                }
                currentSlide = line + '\n\n';
                inTask = false;
            }
            // Task (- [ ] Title)
            else if (line.match(/^-\s*\[[\sx]\]\s+/)) {
                if (currentSlide.trim()) {
                    result += currentSlide;
                    result += '\n---\n\n';
                }
                // Extract task title (remove checkbox)
                const taskTitle = line.replace(/^-\s*\[[\sx]\]\s+/, '');
                currentSlide = `### ${taskTitle}\n\n`;
                inTask = true;
            }
            // Task content (indented)
            else if (inTask && line.match(/^\s+/)) {
                currentSlide += line.replace(/^\s+/, '') + '\n';
            }
            // Other content
            else if (line.trim()) {
                currentSlide += line + '\n';
            }
        }

        // Add last slide
        if (currentSlide.trim()) {
            result += currentSlide;
            result += '\n';
        }

        // Apply tag filtering if specified
        if (options.tagVisibility && options.tagVisibility !== 'all') {
            result = TagUtils.processMarkdownContent(result, options.tagVisibility);
        }

        return result;
    }

    /**
     * Add Marp directives to existing markdown without converting format
     * Useful for opening kanban files in Marp without changing structure
     * @param markdown - Original markdown content
     * @param options - Conversion options
     * @returns Markdown with Marp frontmatter added
     */
    static addMarpDirectives(markdown: string, options: MarpConversionOptions = {}): string {
        // Check if already has frontmatter
        const yamlMatch = markdown.match(/^---\n([\s\S]*?)\n---\n/);

        if (yamlMatch) {
            // Add marp directive to existing frontmatter
            const yamlContent = yamlMatch[1];
            let newYaml = '---\n';
            newYaml += 'marp: true\n';
            if (options.theme) {
                newYaml += `theme: "${options.theme}"\n`;
            }
            newYaml += yamlContent + '\n';
            newYaml += '---\n';

            return markdown.replace(yamlMatch[0], newYaml);
        } else {
            // Add new frontmatter
            const frontmatter = this.createMarpFrontmatter(options);
            return frontmatter + '\n' + markdown;
        }
    }
}
