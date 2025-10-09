import * as path from 'path';
import { PathResolver } from '../../services/PathResolver';

describe('PathResolver Tests', () => {
    const basePath = '/Users/test/project';

    describe('resolve()', () => {
        test('should resolve relative path to absolute', () => {
            const result = PathResolver.resolve(basePath, 'includes/file.md');
            expect(result).toBe(path.join(basePath, 'includes/file.md'));
        });

        test('should handle ./ prefix in relative path', () => {
            const result = PathResolver.resolve(basePath, './includes/file.md');
            expect(result).toBe(path.join(basePath, 'includes/file.md'));
        });

        test('should return absolute path as-is', () => {
            const absolutePath = '/absolute/path/file.md';
            const result = PathResolver.resolve(basePath, absolutePath);
            expect(result).toBe(absolutePath);
        });

        test('should decode URL-encoded paths', () => {
            const encoded = 'includes%2Ffile%20with%20spaces.md';
            const result = PathResolver.resolve(basePath, encoded);
            expect(result).toBe(path.join(basePath, 'includes/file with spaces.md'));
        });

        test('should handle empty/null paths', () => {
            expect(PathResolver.resolve(basePath, '')).toBe(basePath);
            expect(PathResolver.resolve(basePath, null as any)).toBe(basePath);
            expect(PathResolver.resolve(basePath, undefined as any)).toBe(basePath);
        });
    });

    describe('normalize()', () => {
        test('should add ./ prefix to paths without it', () => {
            expect(PathResolver.normalize('includes/file.md')).toBe('./includes/file.md');
        });

        test('should keep ./ prefix if already present', () => {
            expect(PathResolver.normalize('./includes/file.md')).toBe('./includes/file.md');
        });

        test('should handle simple filenames', () => {
            expect(PathResolver.normalize('file.md')).toBe('./file.md');
        });

        test('should handle empty string', () => {
            expect(PathResolver.normalize('')).toBe('');
        });
    });

    describe('removePrefix()', () => {
        test('should remove ./ prefix', () => {
            expect(PathResolver.removePrefix('./includes/file.md')).toBe('includes/file.md');
        });

        test('should leave paths without prefix unchanged', () => {
            expect(PathResolver.removePrefix('includes/file.md')).toBe('includes/file.md');
        });

        test('should handle simple filenames with prefix', () => {
            expect(PathResolver.removePrefix('./file.md')).toBe('file.md');
        });
    });

    describe('areEqual()', () => {
        test('should return true for identical paths', () => {
            expect(PathResolver.areEqual('./file.md', './file.md')).toBe(true);
            expect(PathResolver.areEqual('file.md', 'file.md')).toBe(true);
        });

        test('should return true for equivalent paths with/without prefix', () => {
            expect(PathResolver.areEqual('./file.md', 'file.md')).toBe(true);
            expect(PathResolver.areEqual('file.md', './file.md')).toBe(true);
        });

        test('should return false for different paths', () => {
            expect(PathResolver.areEqual('./file1.md', './file2.md')).toBe(false);
            expect(PathResolver.areEqual('file1.md', 'file2.md')).toBe(false);
        });
    });

    describe('findMatch()', () => {
        test('should find matching path with same format', () => {
            const paths = ['./file1.md', './file2.md', './file3.md'];
            const result = PathResolver.findMatch('./file2.md', paths);
            expect(result).toBe('./file2.md');
        });

        test('should find matching path with different prefix format', () => {
            const paths = ['./file1.md', 'file2.md', './file3.md'];
            const result = PathResolver.findMatch('file2.md', paths);
            expect(result).toBe('file2.md');
        });

        test('should find match regardless of prefix', () => {
            const paths = ['file1.md', 'file2.md', 'file3.md'];
            const result = PathResolver.findMatch('./file2.md', paths);
            expect(result).toBe('file2.md');
        });

        test('should return undefined if no match', () => {
            const paths = ['./file1.md', './file2.md'];
            const result = PathResolver.findMatch('./file3.md', paths);
            expect(result).toBeUndefined();
        });
    });

    describe('getVariations()', () => {
        test('should return both variations for path without prefix', () => {
            const variations = PathResolver.getVariations('file.md');
            expect(variations).toHaveLength(2);
            expect(variations[0]).toBe('file.md');
            expect(variations[1]).toBe('./file.md');
        });

        test('should return both variations for path with prefix', () => {
            const variations = PathResolver.getVariations('./file.md');
            expect(variations).toHaveLength(2);
            expect(variations[0]).toBe('./file.md');
            expect(variations[1]).toBe('file.md');
        });

        test('should handle nested paths', () => {
            const variations = PathResolver.getVariations('includes/file.md');
            expect(variations).toHaveLength(2);
            expect(variations[0]).toBe('includes/file.md');
            expect(variations[1]).toBe('./includes/file.md');
        });
    });

    describe('getRelativePath()', () => {
        test('should get relative path from one file to another', () => {
            const from = '/Users/test/project/main.md';
            const to = '/Users/test/project/includes/file.md';
            const result = PathResolver.getRelativePath(from, to);
            expect(result).toBe('includes/file.md');
        });

        test('should get relative path to parent directory', () => {
            const from = '/Users/test/project/includes/main.md';
            const to = '/Users/test/project/file.md';
            const result = PathResolver.getRelativePath(from, to);
            expect(result).toBe('../file.md');
        });

        test('should normalize path separators to forward slashes', () => {
            const from = 'C:\\Users\\test\\project\\main.md';
            const to = 'C:\\Users\\test\\project\\includes\\file.md';
            const result = PathResolver.getRelativePath(from, to);
            // Result should use forward slashes
            expect(result.includes('\\')).toBe(false);
        });
    });

    describe('isAbsolute()', () => {
        test('should return true for absolute Unix path', () => {
            expect(PathResolver.isAbsolute('/absolute/path')).toBe(true);
        });

        test('should return false for relative path', () => {
            expect(PathResolver.isAbsolute('relative/path')).toBe(false);
            expect(PathResolver.isAbsolute('./relative/path')).toBe(false);
        });
    });

    describe('getBaseName()', () => {
        test('should get base name from path', () => {
            expect(PathResolver.getBaseName('/path/to/file.md')).toBe('file.md');
        });

        test('should handle simple filename', () => {
            expect(PathResolver.getBaseName('file.md')).toBe('file.md');
        });
    });

    describe('getDirName()', () => {
        test('should get directory from path', () => {
            expect(PathResolver.getDirName('/path/to/file.md')).toBe('/path/to');
        });

        test('should handle simple filename', () => {
            expect(PathResolver.getDirName('file.md')).toBe('.');
        });
    });

    describe('join()', () => {
        test('should join path segments with forward slashes', () => {
            const result = PathResolver.join('path', 'to', 'file.md');
            expect(result).toBe('path/to/file.md');
        });

        test('should handle mixed separators', () => {
            const result = PathResolver.join('path\\to', 'subdir', 'file.md');
            // Should normalize to forward slashes
            expect(result.includes('\\')).toBe(false);
        });
    });

    describe('normalizeSeparators()', () => {
        test('should convert backslashes to forward slashes', () => {
            expect(PathResolver.normalizeSeparators('path\\to\\file.md')).toBe('path/to/file.md');
        });

        test('should leave forward slashes unchanged', () => {
            expect(PathResolver.normalizeSeparators('path/to/file.md')).toBe('path/to/file.md');
        });

        test('should handle mixed separators', () => {
            expect(PathResolver.normalizeSeparators('path/to\\file.md')).toBe('path/to/file.md');
        });
    });

    describe('Integration Scenarios', () => {
        test('should handle column include path lookup pattern', () => {
            // Simulates kanbanWebviewPanel.ts:2671 pattern
            const includeFile = 'includes/column.md';
            const normalized = PathResolver.normalize(includeFile);

            // Should be able to find in map with either format
            const map = new Map<string, any>();
            map.set('./includes/column.md', { data: 'test' });

            const variations = PathResolver.getVariations(includeFile);
            const found = variations.find(v => map.has(v));

            expect(found).toBeTruthy();
        });

        test('should handle path comparison from different sources', () => {
            // Simulates kanbanWebviewPanel.ts:3684 pattern
            const storedPath = './includes/file.md';
            const relativePath = 'includes/file.md';

            expect(PathResolver.areEqual(storedPath, relativePath)).toBe(true);
        });

        test('should handle export service path resolution', () => {
            // Simulates exportService.ts:424-426 pattern
            const sourceDir = '/Users/test/project';
            const decodedIncludePath = './includes/file%20with%20spaces.md';

            const decoded = decodeURIComponent(decodedIncludePath);
            const resolved = PathResolver.isAbsolute(decoded)
                ? decoded
                : PathResolver.resolve(sourceDir, decoded);

            expect(resolved).toBe(path.join(sourceDir, 'includes/file with spaces.md'));
        });
    });
});
