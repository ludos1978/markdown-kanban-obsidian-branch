import * as path from 'path';

/**
 * Unified path resolution utility
 * Consolidates all path handling logic from across the codebase
 *
 * Replaces 6+ duplicate path resolution patterns:
 * - kanbanWebviewPanel.ts: Multiple path.resolve calls
 * - exportService.ts: URL decoding + resolution
 * - markdownParser.ts: Conditional resolution
 */
export class PathResolver {
    /**
     * Resolve a relative path to absolute, handling all edge cases
     *
     * @param basePath - The base directory (usually document folder)
     * @param relativePath - The relative path to resolve
     * @returns Absolute path
     */
    static resolve(basePath: string, relativePath: string): string {
        // Handle null/undefined
        if (!relativePath) {
            return basePath;
        }

        // Decode URL-encoded paths (from webview)
        const decoded = decodeURIComponent(relativePath);

        // If already absolute, return as-is
        if (path.isAbsolute(decoded)) {
            return decoded;
        }

        // Resolve relative to base
        return path.resolve(basePath, decoded);
    }

    /**
     * Normalize a path to use ./ prefix consistently
     * Used for map keys and comparisons
     *
     * @param relativePath - Path to normalize
     * @returns Path with ./ prefix
     */
    static normalize(relativePath: string): string {
        if (!relativePath) {
            return '';
        }

        // Already has ./ prefix
        if (relativePath.startsWith('./')) {
            return relativePath;
        }

        // Add ./ prefix
        return './' + relativePath;
    }

    /**
     * Remove ./ prefix from path
     * Used when storing or displaying paths
     *
     * @param relativePath - Path to remove prefix from
     * @returns Path without ./ prefix
     */
    static removePrefix(relativePath: string): string {
        if (!relativePath) {
            return '';
        }

        if (relativePath.startsWith('./')) {
            return relativePath.substring(2);
        }

        return relativePath;
    }

    /**
     * Check if two paths are equivalent (handles ./ prefix variations)
     *
     * @param path1 - First path
     * @param path2 - Second path
     * @returns True if paths are equivalent
     */
    static areEqual(path1: string, path2: string): boolean {
        if (!path1 || !path2) {
            return path1 === path2;
        }

        // Normalize both paths and compare
        const norm1 = this.normalize(path1);
        const norm2 = this.normalize(path2);

        return norm1 === norm2;
    }

    /**
     * Find a matching path in an array, handling ./ prefix variations
     *
     * @param searchPath - Path to search for
     * @param paths - Array of paths to search in
     * @returns Matching path if found, undefined otherwise
     */
    static findMatch(searchPath: string, paths: string[]): string | undefined {
        if (!searchPath || !paths) {
            return undefined;
        }

        return paths.find(p => this.areEqual(searchPath, p));
    }

    /**
     * Get all equivalent path variations
     * Used for looking up paths in maps with inconsistent keys
     *
     * @param relativePath - Path to generate variations for
     * @returns Array of equivalent paths [original, with prefix, without prefix]
     */
    static getVariations(relativePath: string): string[] {
        if (!relativePath) {
            return [];
        }

        const variations: string[] = [relativePath];

        // Add with prefix if it doesn't have one
        if (!relativePath.startsWith('./')) {
            variations.push('./' + relativePath);
        }

        // Add without prefix if it has one
        if (relativePath.startsWith('./')) {
            variations.push(relativePath.substring(2));
        }

        return variations;
    }

    /**
     * Get relative path from one file to another
     *
     * @param fromPath - Source file path
     * @param toPath - Target file path
     * @returns Relative path from source to target
     */
    static getRelativePath(fromPath: string, toPath: string): string {
        const rel = path.relative(path.dirname(fromPath), toPath);

        // Normalize path separators to forward slashes
        return rel.replace(/\\/g, '/');
    }

    /**
     * Check if a path is absolute
     *
     * @param filePath - Path to check
     * @returns True if absolute
     */
    static isAbsolute(filePath: string): boolean {
        if (!filePath) {
            return false;
        }

        return path.isAbsolute(filePath);
    }

    /**
     * Get the base name (file name with extension) from a path
     *
     * @param filePath - Full path
     * @returns Base name
     */
    static getBaseName(filePath: string): string {
        if (!filePath) {
            return '';
        }

        return path.basename(filePath);
    }

    /**
     * Get the directory name from a path
     *
     * @param filePath - Full path
     * @returns Directory path
     */
    static getDirName(filePath: string): string {
        if (!filePath) {
            return '';
        }

        return path.dirname(filePath);
    }

    /**
     * Join path segments, normalizing separators
     *
     * @param segments - Path segments to join
     * @returns Joined path with forward slashes
     */
    static join(...segments: string[]): string {
        const joined = path.join(...segments);

        // Normalize to forward slashes for consistency
        return joined.replace(/\\/g, '/');
    }

    /**
     * Ensure a path uses forward slashes (for cross-platform consistency)
     *
     * @param filePath - Path to normalize
     * @returns Path with forward slashes
     */
    static normalizeSeparators(filePath: string): string {
        if (!filePath) {
            return '';
        }

        return filePath.replace(/\\/g, '/');
    }
}
