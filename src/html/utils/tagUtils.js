/**
 * Tag Processing Utility Module
 * Centralizes all tag extraction, parsing, and processing functionality
 */

class TagUtils {
    constructor() {
        // Centralized regex patterns for tag matching
        this.patterns = {
            // Basic tag patterns
            basicTags: /#([a-zA-Z0-9_-]+)/g,
            atTags: /@([a-zA-Z0-9_&-]+)/g,

            // Layout-specific tags
            rowTag: /#row(\d+)\b/gi,
            spanTag: /#span(\d+)\b/gi,
            stackTag: /#stack\b/gi,
            includeTag: /#include:([^\s]+)/i,

            // Special gather tags
            gatherTags: /#(gather_[a-zA-Z0-9_&|=><!\-]+|ungathered)/g,

            // Date patterns
            dateTags: /@(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})(?:\s|$)/,

            // Priority/state tags
            priorityTag: /#(high|medium|low|urgent)\b/i,
            stateTag: /#(todo|doing|done|blocked|waiting)\b/i,

            // Card/column state tags
            foldTag: /#fold\b/i,
            archiveTag: /#archive\b/i,
            hiddenTag: /#hidden\b/i
        };

        // Layout tags that should not be displayed
        this.layoutTags = ['row', 'span', 'stack', 'fold', 'archive', 'hidden', 'include'];

        // Tags that should be excluded from menus
        this.excludedTags = ['gather_', 'ungathered', 'fold', 'archive', 'hidden'];
    }

    /**
     * Extract all tags from text
     * @param {string} text - Text to extract tags from
     * @param {Object} options - Extraction options
     * @returns {Array} Array of extracted tags
     */
    extractTags(text, options = {}) {
        const {
            includeHash = false,
            includeAt = false,
            excludeLayout = true,
            unique = true
        } = options;

        if (!text || typeof text !== 'string') {
            return [];
        }

        const tags = [];

        // Extract hash tags
        if (includeHash !== false) {
            const hashMatches = text.matchAll(this.patterns.basicTags);
            for (const match of hashMatches) {
                const tag = includeHash === 'withSymbol' ? `#${match[1]}` : match[1];
                tags.push(tag);
            }
        }

        // Extract @ tags
        if (includeAt) {
            const atMatches = text.matchAll(this.patterns.atTags);
            for (const match of atMatches) {
                const tag = includeAt === 'withSymbol' ? `@${match[1]}` : match[1];
                tags.push(tag);
            }
        }

        // Filter out layout tags if requested
        let filteredTags = tags;
        if (excludeLayout) {
            filteredTags = tags.filter(tag => {
                const cleanTag = tag.replace(/^[#@]/, '').toLowerCase();
                return !this.isLayoutTag(cleanTag);
            });
        }

        // Return unique tags if requested
        return unique ? [...new Set(filteredTags)] : filteredTags;
    }

    /**
     * Extract the first tag from text (boardRenderer.js compatible)
     * @param {string} text - Text to extract tag from
     * @param {boolean} excludeLayout - Whether to exclude layout tags
     * @returns {string|null} First tag or null
     */
    extractFirstTag(text, excludeLayout = true) {
        if (!text) return null;

        // Use boardRenderer.js compatible regex with exclusions
        const re = /#(?!row\d+\b)(?!span\d+\b)([a-zA-Z0-9_-]+(?:[=|><][a-zA-Z0-9_-]+)*)/g;
        let m;
        while ((m = re.exec(text)) !== null) {
            const raw = m[1];
            const baseMatch = raw.match(/^([a-zA-Z0-9_-]+)/);
            const base = (baseMatch ? baseMatch[1] : raw).toLowerCase();
            if (base.startsWith('gather_')) continue; // do not use gather tags for styling
            return base;
        }
        return null;
    }

    /**
     * Extract the first tag from text (simple version for markdownRenderer.js)
     * @param {string} text - Text to extract tag from
     * @returns {string|null} First tag or null
     */
    extractFirstTagSimple(text) {
        if (!text) return null;
        const tagMatch = text.match(/#([a-zA-Z0-9_-]+)/);
        return tagMatch ? tagMatch[1].toLowerCase() : null;
    }

    /**
     * Check if a tag is a layout tag
     * @param {string} tag - Tag to check (without # symbol)
     * @returns {boolean} True if layout tag
     */
    isLayoutTag(tag) {
        if (!tag) return false;

        const cleanTag = tag.replace(/^[#@]/, '').toLowerCase();

        // Check static layout tags
        if (this.layoutTags.includes(cleanTag)) {
            return true;
        }

        // Check pattern-based layout tags
        if (this.patterns.rowTag.test(`#${cleanTag}`)) return true;
        if (this.patterns.spanTag.test(`#${cleanTag}`)) return true;
        if (this.patterns.stackTag.test(`#${cleanTag}`)) return true;
        if (this.patterns.includeTag.test(`#${cleanTag}`)) return true;

        return false;
    }

    /**
     * Check if a tag is a gather tag
     * @param {string} tag - Tag to check
     * @returns {boolean} True if gather tag
     */
    isGatherTag(tag) {
        if (!tag) return false;
        const cleanTag = tag.replace(/^[#@]/, '');
        return cleanTag.startsWith('gather_') || cleanTag === 'ungathered';
    }

    /**
     * Extract layout configuration from tags
     * @param {string} text - Text containing tags
     * @returns {Object} Layout configuration
     */
    extractLayoutConfig(text) {
        const config = {
            row: null,
            span: null,
            stack: false,
            fold: false,
            archive: false,
            hidden: false,
            include: null
        };

        if (!text) return config;

        // Extract row number
        const rowMatch = text.match(this.patterns.rowTag);
        if (rowMatch) {
            config.row = parseInt(rowMatch[1]);
        }

        // Extract span number
        const spanMatch = text.match(this.patterns.spanTag);
        if (spanMatch) {
            config.span = parseInt(spanMatch[1]);
        }

        // Check for stack tag
        config.stack = this.patterns.stackTag.test(text);

        // Check for fold tag
        config.fold = this.patterns.foldTag.test(text);

        // Check for archive tag
        config.archive = this.patterns.archiveTag.test(text);

        // Check for hidden tag
        config.hidden = this.patterns.hiddenTag.test(text);

        // Extract include path
        const includeMatch = text.match(this.patterns.includeTag);
        if (includeMatch) {
            config.include = includeMatch[1];
        }

        return config;
    }

    /**
     * Filter tags for display (exclude layout and special tags)
     * @param {Array} tags - Array of tags to filter
     * @returns {Array} Filtered tags
     */
    filterDisplayTags(tags) {
        if (!Array.isArray(tags)) return [];

        return tags.filter(tag => {
            const cleanTag = tag.replace(/^[#@]/, '').toLowerCase();

            // Skip layout tags
            if (this.isLayoutTag(cleanTag)) return false;

            // Skip gather tags
            if (this.isGatherTag(cleanTag)) return false;

            // Skip excluded tags
            if (this.excludedTags.some(excluded => cleanTag.startsWith(excluded))) {
                return false;
            }

            return true;
        });
    }

    /**
     * Group tags by type
     * @param {Array} tags - Array of tags
     * @returns {Object} Grouped tags
     */
    groupTagsByType(tags) {
        const groups = {
            priority: [],
            state: [],
            date: [],
            person: [],
            layout: [],
            gather: [],
            regular: []
        };

        tags.forEach(tag => {
            const cleanTag = tag.replace(/^[#@]/, '');

            if (this.patterns.priorityTag.test(`#${cleanTag}`)) {
                groups.priority.push(tag);
            } else if (this.patterns.stateTag.test(`#${cleanTag}`)) {
                groups.state.push(tag);
            } else if (this.patterns.dateTags.test(`@${cleanTag}`)) {
                groups.date.push(tag);
            } else if (tag.startsWith('@')) {
                groups.person.push(tag);
            } else if (this.isLayoutTag(cleanTag)) {
                groups.layout.push(tag);
            } else if (this.isGatherTag(cleanTag)) {
                groups.gather.push(tag);
            } else {
                groups.regular.push(tag);
            }
        });

        return groups;
    }

    /**
     * Generate CSS class names from tags
     * @param {Array|string} tags - Tags or text containing tags
     * @returns {string} Space-separated CSS classes
     */
    generateTagClasses(tags) {
        let tagArray = tags;

        if (typeof tags === 'string') {
            tagArray = this.extractTags(tags, {
                includeHash: true,
                includeAt: true,
                excludeLayout: false
            });
        }

        if (!Array.isArray(tagArray)) return '';

        return tagArray
            .map(tag => {
                const cleanTag = tag.replace(/^[#@]/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
                return `tag-${cleanTag}`;
            })
            .join(' ');
    }

    /**
     * Parse gather tag conditions
     * @param {string} gatherTag - Gather tag to parse
     * @returns {Object} Parsed conditions
     */
    parseGatherConditions(gatherTag) {
        if (!gatherTag || !gatherTag.startsWith('gather_')) {
            return null;
        }

        const conditionString = gatherTag.substring(7); // Remove 'gather_'
        const conditions = {
            include: [],
            exclude: [],
            operator: 'AND'
        };

        // Parse OR conditions
        if (conditionString.includes('|')) {
            conditions.operator = 'OR';
            conditions.include = conditionString.split('|').map(t => t.trim());
        }
        // Parse AND conditions
        else if (conditionString.includes('&')) {
            conditions.operator = 'AND';
            conditions.include = conditionString.split('&').map(t => t.trim());
        }
        // Parse NOT conditions
        else if (conditionString.includes('!')) {
            const parts = conditionString.split('!');
            conditions.include = parts[0] ? [parts[0].trim()] : [];
            conditions.exclude = parts.slice(1).map(t => t.trim());
        }
        // Single condition
        else {
            conditions.include = [conditionString.trim()];
        }

        return conditions;
    }

    /**
     * Clean tags from text (remove all tag patterns)
     * @param {string} text - Text to clean
     * @param {Object} options - Cleaning options
     * @returns {string} Cleaned text
     */
    removeTagsFromText(text, options = {}) {
        const {
            removeHash = true,
            removeAt = false,
            keepLayout = false
        } = options;

        if (!text) return '';

        let cleanedText = text;

        // Remove hash tags
        if (removeHash) {
            if (keepLayout) {
                // Remove only non-layout tags
                cleanedText = cleanedText.replace(this.patterns.basicTags, (match, tag) => {
                    return this.isLayoutTag(tag) ? match : '';
                });
            } else {
                cleanedText = cleanedText.replace(this.patterns.basicTags, '');
            }
        }

        // Remove @ tags
        if (removeAt) {
            cleanedText = cleanedText.replace(this.patterns.atTags, '');
        }

        // Clean up extra spaces
        cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

        return cleanedText;
    }

    /**
     * Sort tags by priority/importance
     * @param {Array} tags - Tags to sort
     * @returns {Array} Sorted tags
     */
    sortTags(tags) {
        if (!Array.isArray(tags)) return [];

        const priority = {
            urgent: 0,
            high: 1,
            blocked: 2,
            todo: 3,
            doing: 4,
            medium: 5,
            waiting: 6,
            low: 7,
            done: 8
        };

        return tags.sort((a, b) => {
            const cleanA = a.replace(/^[#@]/, '').toLowerCase();
            const cleanB = b.replace(/^[#@]/, '').toLowerCase();

            const priorityA = priority[cleanA] ?? 999;
            const priorityB = priority[cleanB] ?? 999;

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Alphabetical for same priority
            return cleanA.localeCompare(cleanB);
        });
    }

    /**
     * Validate tag format
     * @param {string} tag - Tag to validate
     * @returns {boolean} True if valid
     */
    isValidTag(tag) {
        if (!tag || typeof tag !== 'string') return false;

        // Remove symbol if present
        const cleanTag = tag.replace(/^[#@]/, '');

        // Check if empty after cleaning
        if (!cleanTag) return false;

        // Check valid characters (alphanumeric, underscore, hyphen)
        if (!/^[a-zA-Z0-9_-]+$/.test(cleanTag)) return false;

        // Check length (reasonable limits)
        if (cleanTag.length < 1 || cleanTag.length > 50) return false;

        return true;
    }

    /**
     * Get tag color configuration key
     * @param {string} tag - Tag to get color for
     * @returns {string} Configuration key for tag color
     */
    getTagColorKey(tag) {
        const cleanTag = tag.replace(/^[#@]/, '');
        return `tag-${cleanTag}`;
    }

    /**
     * Filter tags from text based on visibility setting
     * @param {string} text - Text to filter
     * @param {string} setting - Visibility setting ('all', 'standard', 'custom', 'mentions', 'none')
     * @returns {string} Filtered text
     */
    filterTagsFromText(text, setting = 'standard') {
        if (!text) return text;

        switch (setting) {
            case 'all':
                // Show all tags - don't filter anything
                return text;
            case 'standard':
            case 'allexcludinglayout':
                // Hide layout tags only (#span, #row, #stack) - direct replacement
                return text
                    .replace(this.patterns.rowTag, '')
                    .replace(this.patterns.spanTag, '')
                    .replace(this.patterns.stackTag, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            case 'custom':
            case 'customonly':
                // Hide layout tags only (configured tag filtering happens in CSS) - direct replacement
                return text
                    .replace(this.patterns.rowTag, '')
                    .replace(this.patterns.spanTag, '')
                    .replace(this.patterns.stackTag, '')
                    .replace(/\s+/g, ' ')
                    .trim();
            case 'mentions':
            case 'mentionsonly':
                // Hide all # tags, keep @ tags
                return this.removeTagsFromText(text, {
                    removeHash: true,
                    removeAt: false,
                    keepLayout: false
                });
            case 'none':
                // Hide all tags
                return this.removeTagsFromText(text, {
                    removeHash: true,
                    removeAt: true,
                    keepLayout: false
                });
            default:
                // Default to standard behavior
                return this.filterTagsFromText(text, 'standard');
        }
    }

    /**
     * Filter tags from text for export based on export setting
     * @param {string} text - Text to filter
     * @param {string} setting - Export setting ('all', 'allexcludinglayout', 'customonly', 'mentionsonly', 'none')
     * @returns {string} Filtered text for export
     */
    filterTagsForExport(text, setting = 'allexcludinglayout') {
        if (!text) return text;

        switch (setting) {
            case 'all':
                // Export all tags - don't filter anything
                return text;
            case 'allexcludinglayout':
                // Export all except layout tags (#span, #row, #stack)
                return text.replace(this.patterns.rowTag, '').replace(this.patterns.spanTag, '').replace(this.patterns.stackTag, '').trim();
            case 'customonly':
                // Export only custom tags and @ tags (remove standard layout tags)
                return text.replace(this.patterns.rowTag, '').replace(this.patterns.spanTag, '').replace(this.patterns.stackTag, '').trim();
            case 'mentionsonly':
                // Export only @ tags - remove all # tags
                return this.removeTagsFromText(text, {
                    removeHash: true,
                    removeAt: false,
                    keepLayout: false
                });
            case 'none':
                // Export no tags - remove all tags
                return this.removeTagsFromText(text, {
                    removeHash: true,
                    removeAt: true,
                    keepLayout: false
                });
            default:
                // Default to allexcludinglayout behavior
                return this.filterTagsForExport(text, 'allexcludinglayout');
        }
    }

    /**
     * Get display title for a column, handling columninclude specially
     * @param {Object} column - Column object with title, includeMode, includeFiles, displayTitle
     * @param {Function} filterFn - Tag filtering function (e.g., window.filterTagsFromText)
     * @returns {string} HTML string for display
     */
    getColumnDisplayTitle(column, filterFn) {
        if (column.includeMode && column.includeFiles && column.includeFiles.length > 0) {
            // For columninclude, show as "include(...path/filename.md)" format
            const fileName = column.includeFiles[0];
            const parts = fileName.split('/').length > 1 ? fileName.split('/') : fileName.split('\\');
            const baseFileName = parts[parts.length - 1];

            // Get path (everything except filename), limit to 10 characters
            let pathPart = '';
            if (parts.length > 1) {
                const fullPath = parts.slice(0, -1).join('/');
                if (fullPath.length > 10) {
                    // Show last 10 characters with ... prefix
                    pathPart = '...' + fullPath.slice(-10);
                } else {
                    pathPart = fullPath;
                }
            }

            // Format: "include(path/filename.md)" or "include(filename.md)" if no path
            const displayText = pathPart ? `include(${pathPart}/${baseFileName})` : `include(${baseFileName})`;

            const escapeHtml = (text) => text.replace(/[&<>"']/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
            const linkHtml = `<span class="columninclude-link" data-file-path="${escapeHtml(fileName)}" onclick="handleColumnIncludeClick(event, '${escapeHtml(fileName)}')" title="Alt+click to open file: ${escapeHtml(fileName)}">${escapeHtml(displayText)}</span>`;

            const fileNameWithoutExt = baseFileName.replace(/\.[^/.]+$/, '');
            const additionalTitle = (column.displayTitle && column.displayTitle !== fileNameWithoutExt) ? column.displayTitle : '';

            if (additionalTitle) {
                const renderFn = window.renderMarkdown || (typeof renderMarkdown !== 'undefined' ? renderMarkdown : null);
                return `${linkHtml} ${renderFn ? renderFn(additionalTitle) : additionalTitle}`;
            } else {
                return linkHtml;
            }
        } else {
            // Normal column - filter tags and render
            const displayTitle = filterFn ? filterFn(column.title) : column.title;
            const renderFn = window.renderMarkdown || (typeof renderMarkdown !== 'undefined' ? renderMarkdown : null);
            return renderFn ? renderFn(displayTitle) : displayTitle;
        }
    }
}

// Create singleton instance
const tagUtils = new TagUtils();

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = tagUtils;
}

// Global window exposure
if (typeof window !== 'undefined') {
    window.tagUtils = tagUtils;

    // Backward compatibility functions
    window.extractFirstTag = (text) => tagUtils.extractFirstTag(text);
    window.extractAllTags = (text) => tagUtils.extractTags(text, { includeHash: false });
}