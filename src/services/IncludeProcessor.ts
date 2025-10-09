import * as fs from 'fs';
import * as path from 'path';
import { PathResolver } from './PathResolver';
import { FormatConverter } from './FormatConverter';
import { IncludeMode, IncludeType } from './OperationOptions';

/**
 * Unified include file processing utility
 *
 * Consolidates include processing logic from:
 * - exportService.ts: processIncludedFiles
 * - markdownParser.ts: Include detection and resolution
 * - kanbanWebviewPanel.ts: Include file handling
 */
export class IncludeProcessor {
    /** Include pattern: !!!include(filename)!!! */
    private static readonly INCLUDE_PATTERN = /!!!include\(([^)]+)\)!!!/gi;

    /** Column include pattern: !!!columninclude(filename)!!! */
    private static readonly COLUMN_INCLUDE_PATTERN = /!!!columninclude\(([^)]+)\)!!!/gi;

    /** Task include pattern: !!!taskinclude(filename)!!! */
    private static readonly TASK_INCLUDE_PATTERN = /!!!taskinclude\(([^)]+)\)!!!/gi;

    /**
     * Process all include markers in content
     *
     * @param content - Content with include markers
     * @param basePath - Base path for resolving relative includes
     * @param includeMode - Include processing mode
     * @returns Processed content and metadata
     */
    static async processIncludes(
        content: string,
        basePath: string,
        includeMode: IncludeMode
    ): Promise<IncludeProcessResult> {
        const result: IncludeProcessResult = {
            content: content,
            includesProcessed: 0,
            includeFiles: [],
            errors: [],
            processedPaths: new Set()
        };

        // Skip if mode is 'ignore'
        if (includeMode.strategy === 'ignore') {
            return result;
        }

        // Process each include type
        const typesToProcess = includeMode.processTypes || ['include', 'columninclude', 'taskinclude'];

        for (const includeType of typesToProcess) {
            const pattern = this.getPatternForType(includeType);
            await this.processIncludeType(
                result,
                pattern,
                includeType,
                basePath,
                includeMode,
                0 // Start at depth 0
            );
        }

        return result;
    }

    /**
     * Process a specific type of include
     */
    private static async processIncludeType(
        result: IncludeProcessResult,
        pattern: RegExp,
        includeType: IncludeType,
        basePath: string,
        includeMode: IncludeMode,
        depth: number
    ): Promise<void> {
        // Check depth limit
        const maxDepth = includeMode.maxDepth || 10;
        if (depth >= maxDepth) {
            result.errors.push(`Maximum include depth (${maxDepth}) reached`);
            return;
        }

        let match;
        const regex = new RegExp(pattern.source, pattern.flags);
        const matches: IncludeMatch[] = [];

        // Collect all matches first (to avoid regex state issues)
        while ((match = regex.exec(result.content)) !== null) {
            matches.push({
                fullMatch: match[0],
                filename: match[1].trim(),
                index: match.index
            });
        }

        // Process matches in reverse order (to maintain correct indices)
        for (let i = matches.length - 1; i >= 0; i--) {
            const m = matches[i];

            try {
                // Resolve include path
                const decodedPath = decodeURIComponent(m.filename);
                const resolvedPath = PathResolver.resolve(basePath, decodedPath);

                // Check for circular references
                if (result.processedPaths.has(resolvedPath)) {
                    result.errors.push(`Circular include detected: ${resolvedPath}`);
                    continue;
                }

                // Check if file exists
                if (!fs.existsSync(resolvedPath)) {
                    result.errors.push(`Include file not found: ${resolvedPath}`);
                    continue;
                }

                // Read include content
                const includeContent = fs.readFileSync(resolvedPath, 'utf-8');

                // Mark as processed
                result.processedPaths.add(resolvedPath);
                result.includesProcessed++;
                result.includeFiles.push({
                    path: resolvedPath,
                    type: includeType,
                    format: this.detectIncludeFormat(includeContent)
                });

                // Process based on strategy
                if (includeMode.strategy === 'merge') {
                    // Replace marker with content
                    const processedInclude = await this.processIncludeContent(
                        includeContent,
                        resolvedPath,
                        includeType,
                        includeMode,
                        depth + 1
                    );

                    result.content =
                        result.content.substring(0, m.index) +
                        processedInclude +
                        result.content.substring(m.index + m.fullMatch.length);

                } else if (includeMode.strategy === 'separate') {
                    // Keep marker but record the file
                    // The marker will be handled by the caller (e.g., ContentPipelineService)
                    // which will write the include to a separate file
                }

            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                result.errors.push(`Error processing include ${m.filename}: ${errorMsg}`);
            }
        }
    }

    /**
     * Process include content (recursively if needed)
     */
    private static async processIncludeContent(
        content: string,
        includePath: string,
        includeType: IncludeType,
        includeMode: IncludeMode,
        depth: number
    ): Promise<string> {
        let processedContent = content;

        // Strip YAML frontmatter if present (except for columninclude in presentation)
        if (includeType !== 'columninclude') {
            processedContent = FormatConverter.stripYaml(processedContent);
        }

        // Recursively process nested includes if enabled
        if (includeMode.resolveNested) {
            const basePath = path.dirname(includePath);
            const typesToProcess = includeMode.processTypes || ['include', 'columninclude', 'taskinclude'];

            for (const nestedType of typesToProcess) {
                const pattern = this.getPatternForType(nestedType);
                const nestedResult: IncludeProcessResult = {
                    content: processedContent,
                    includesProcessed: 0,
                    includeFiles: [],
                    errors: [],
                    processedPaths: new Set()
                };

                await this.processIncludeType(
                    nestedResult,
                    pattern,
                    nestedType,
                    basePath,
                    includeMode,
                    depth
                );

                processedContent = nestedResult.content;
            }
        }

        return processedContent;
    }

    /**
     * Detect all include files in content without processing
     */
    static detectIncludes(content: string, basePath: string): IncludeDetectionResult {
        const result: IncludeDetectionResult = {
            includes: [],
            columnIncludes: [],
            taskIncludes: []
        };

        // Detect regular includes
        this.detectIncludeType(content, basePath, this.INCLUDE_PATTERN, result.includes);

        // Detect column includes
        this.detectIncludeType(content, basePath, this.COLUMN_INCLUDE_PATTERN, result.columnIncludes);

        // Detect task includes
        this.detectIncludeType(content, basePath, this.TASK_INCLUDE_PATTERN, result.taskIncludes);

        return result;
    }

    /**
     * Detect includes of a specific type
     */
    private static detectIncludeType(
        content: string,
        basePath: string,
        pattern: RegExp,
        outputArray: string[]
    ): void {
        let match;
        const regex = new RegExp(pattern.source, pattern.flags);

        while ((match = regex.exec(content)) !== null) {
            const filename = match[1].trim();
            const decodedPath = decodeURIComponent(filename);
            const resolvedPath = PathResolver.resolve(basePath, decodedPath);

            if (!outputArray.includes(resolvedPath)) {
                outputArray.push(resolvedPath);
            }
        }
    }

    /**
     * Convert include content based on target format
     *
     * @param content - Include file content
     * @param includeType - Type of include
     * @param targetFormat - Target format
     * @returns Converted content
     */
    static convertIncludeContent(
        content: string,
        includeType: IncludeType,
        targetFormat: 'kanban' | 'presentation'
    ): string {
        const sourceFormat = FormatConverter.detectFormat(content);

        // No conversion needed if formats match
        if (sourceFormat === targetFormat) {
            return content;
        }

        // For columninclude in presentation, special handling
        if (includeType === 'columninclude' && targetFormat === 'presentation') {
            // Convert kanban column to presentation slides
            return FormatConverter.kanbanToPresentation(content, true);
        }

        // For taskinclude, convert appropriately
        if (includeType === 'taskinclude') {
            if (targetFormat === 'kanban' && sourceFormat === 'presentation') {
                return FormatConverter.presentationToKanban(content);
            } else if (targetFormat === 'presentation' && sourceFormat === 'kanban') {
                return FormatConverter.kanbanToPresentation(content, false);
            }
        }

        // Default conversion
        return FormatConverter.convert(content, targetFormat);
    }

    /**
     * Get regex pattern for include type
     */
    private static getPatternForType(type: IncludeType): RegExp {
        switch (type) {
            case 'include':
                return this.INCLUDE_PATTERN;
            case 'columninclude':
                return this.COLUMN_INCLUDE_PATTERN;
            case 'taskinclude':
                return this.TASK_INCLUDE_PATTERN;
        }
    }

    /**
     * Detect format of include file content
     */
    private static detectIncludeFormat(content: string): 'kanban' | 'presentation' | 'unknown' {
        return FormatConverter.detectFormat(content);
    }

    /**
     * Create include marker for a file
     */
    static createMarker(filename: string, type: IncludeType): string {
        switch (type) {
            case 'include':
                return `!!!include(${filename})!!!`;
            case 'columninclude':
                return `!!!columninclude(${filename})!!!`;
            case 'taskinclude':
                return `!!!taskinclude(${filename})!!!`;
        }
    }

    /**
     * Check if content contains any include markers
     */
    static hasIncludes(content: string): boolean {
        return this.INCLUDE_PATTERN.test(content) ||
               this.COLUMN_INCLUDE_PATTERN.test(content) ||
               this.TASK_INCLUDE_PATTERN.test(content);
    }

    /**
     * Remove all include markers from content (replace with empty string)
     */
    static stripIncludes(content: string): string {
        return content
            .replace(this.INCLUDE_PATTERN, '')
            .replace(this.COLUMN_INCLUDE_PATTERN, '')
            .replace(this.TASK_INCLUDE_PATTERN, '');
    }
}

/**
 * Result of include processing
 */
export interface IncludeProcessResult {
    /** Processed content with includes resolved */
    content: string;

    /** Number of includes processed */
    includesProcessed: number;

    /** List of included files */
    includeFiles: IncludeFileInfo[];

    /** Errors encountered during processing */
    errors: string[];

    /** Set of already processed paths (to prevent circular references) */
    processedPaths: Set<string>;
}

/**
 * Information about an included file
 */
export interface IncludeFileInfo {
    /** Absolute path to the include file */
    path: string;

    /** Type of include */
    type: IncludeType;

    /** Detected format of the include */
    format: 'kanban' | 'presentation' | 'unknown';
}

/**
 * Result of include detection
 */
export interface IncludeDetectionResult {
    /** Regular include files */
    includes: string[];

    /** Column include files */
    columnIncludes: string[];

    /** Task include files */
    taskIncludes: string[];
}

/**
 * Internal structure for tracking include matches
 */
interface IncludeMatch {
    fullMatch: string;
    filename: string;
    index: number;
}
