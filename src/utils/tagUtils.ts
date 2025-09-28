/**
 * Tag utility functions for export service
 * Handles tag removal based on visibility settings
 */

export type TagVisibility = 'all' | 'allexcludinglayout' | 'customonly' | 'mentionsonly' | 'none';

export class TagUtils {
    // Regular expressions for different tag patterns
    private static readonly BASIC_TAG_PATTERN = /#[a-zA-Z0-9_-]+/g;
    private static readonly AT_TAG_PATTERN = /@[a-zA-Z0-9_-]+/g;
    private static readonly ROW_TAG_PATTERN = /#row\d*/gi;
    private static readonly SPAN_TAG_PATTERN = /#span\d*/gi;
    private static readonly STACK_TAG_PATTERN = /#stack\d*/gi;

    /**
     * Remove tags from text based on visibility setting
     */
    static filterTagsFromText(text: string, visibility: TagVisibility): string {
        if (!text) {
            return text;
        }

        switch (visibility) {
            case 'all':
                // Keep all tags
                return text;

            case 'allexcludinglayout':
                // Remove layout tags (#span, #row, #stack)
                return text
                    .replace(this.ROW_TAG_PATTERN, '')
                    .replace(this.SPAN_TAG_PATTERN, '')
                    .replace(this.STACK_TAG_PATTERN, '')
                    .replace(/\s+/g, ' ')
                    .trim();

            case 'customonly':
                // Keep only custom tags and @ tags
                // For simplicity in export, we'll remove all configured tags
                // This is a simplified version - in production you'd check against configured tags
                return this.removeConfiguredTags(text);

            case 'mentionsonly':
                // Remove all # tags, keep only @ tags
                return text
                    .replace(this.BASIC_TAG_PATTERN, '')
                    .replace(/\s+/g, ' ')
                    .trim();

            case 'none':
                // Remove all tags
                return text
                    .replace(this.BASIC_TAG_PATTERN, '')
                    .replace(this.AT_TAG_PATTERN, '')
                    .replace(/\s+/g, ' ')
                    .trim();

            default:
                return text;
        }
    }

    /**
     * Remove configured tags (simplified version)
     * In a full implementation, this would check against the actual configured tags
     */
    private static removeConfiguredTags(text: string): string {
        // Common configured tags to remove
        const configuredTags = [
            '#urgent', '#high', '#medium', '#low',
            '#todo', '#doing', '#done', '#blocked',
            '#bug', '#feature', '#enhancement',
            '#red', '#green', '#blue', '#yellow', '#orange',
            '#row', '#span', '#stack'
        ];

        let result = text;
        for (const tag of configuredTags) {
            const pattern = new RegExp(tag + '\\d*', 'gi');
            result = result.replace(pattern, '');
        }

        return result.replace(/\s+/g, ' ').trim();
    }

    /**
     * Process markdown content to filter tags
     */
    static processMarkdownContent(content: string, visibility: TagVisibility): string {
        if (visibility === 'all') {
            return content;
        }

        const lines = content.split('\n');
        const processedLines: string[] = [];

        for (const line of lines) {
            // Process headers (## Column Title #tag1 #tag2)
            if (line.startsWith('## ')) {
                processedLines.push(this.filterTagsFromText(line, visibility));
            }
            // Process task lines (- [ ] Task text #tag1 #tag2)
            else if (line.match(/^-\s*\[[x\s]\]/i)) {
                processedLines.push(this.filterTagsFromText(line, visibility));
            }
            // Process regular lines that might contain tags
            else if (line.includes('#') || line.includes('@')) {
                processedLines.push(this.filterTagsFromText(line, visibility));
            }
            // Keep other lines as-is
            else {
                processedLines.push(line);
            }
        }

        return processedLines.join('\n');
    }
}