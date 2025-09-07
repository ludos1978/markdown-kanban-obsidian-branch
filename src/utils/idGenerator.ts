/**
 * UUID Generation Utilities for Kanban Board
 * Provides consistent, unique identifiers for columns and tasks
 * that persist across saves/loads and frontend/backend operations
 */

export class IdGenerator {
    /**
     * Generates a RFC4122-compliant UUID v4
     * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
     * Where x is any hexadecimal digit and y is one of 8, 9, A, or B
     */
    static generateUUID(): string {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * Generates a column ID with a specific prefix
     * Format: col-{uuid}
     */
    static generateColumnId(): string {
        return `col-${IdGenerator.generateUUID()}`;
    }

    /**
     * Generates a task ID with a specific prefix
     * Format: task-{uuid}
     */
    static generateTaskId(): string {
        return `task-${IdGenerator.generateUUID()}`;
    }

    /**
     * Validates if a string is a valid UUID format
     */
    static isValidUUID(uuid: string): boolean {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid);
    }

    /**
     * Validates if a string is a valid column ID format
     */
    static isValidColumnId(id: string): boolean {
        return id.startsWith('col-') && IdGenerator.isValidUUID(id.substring(4));
    }

    /**
     * Validates if a string is a valid task ID format
     */
    static isValidTaskId(id: string): boolean {
        return id.startsWith('task-') && IdGenerator.isValidUUID(id.substring(5));
    }

    /**
     * Extracts UUID from a prefixed ID
     */
    static extractUUID(prefixedId: string): string {
        const parts = prefixedId.split('-');
        if (parts.length >= 6) {
            return parts.slice(1).join('-'); // Remove first part (prefix)
        }
        return '';
    }

    /**
     * Generates a short display ID for debugging (first 8 chars of UUID)
     */
    static getShortId(id: string): string {
        const uuid = IdGenerator.extractUUID(id);
        return uuid ? uuid.substring(0, 8) : id.substring(0, 8);
    }
}