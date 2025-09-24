/**
 * File Type Validation Utility Module for TypeScript/Node.js
 * Provides unified file type detection and validation functions using shared definitions
 */

import * as path from 'path';
import { BaseFileTypeUtils } from '../shared/fileTypeDefinitions';

export class FileTypeUtils extends BaseFileTypeUtils {
    /**
     * Get file extension using Node.js path module
     */
    static getFileExtension(fileName: string): string {
        if (!fileName || typeof fileName !== 'string') {
            return '';
        }
        const ext = path.extname(fileName);
        return this.normalizeExtension(ext);
    }

}