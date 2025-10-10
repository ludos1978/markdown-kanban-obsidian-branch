/**
 * Shared utility functions for column operations
 * Used by both frontend (rendering) and backend (saving)
 * This ensures consistent row detection logic across the application
 */

/**
 * Extracts the row number from a column title
 * @param title - Column title (may contain #row2, #row3, etc.)
 * @returns Row number (defaults to 1 if no row tag found)
 */
export function getColumnRow(title: string): number {
    if (!title) return 1;

    const rowMatch = title.match(/#row(\d+)\b/i);
    if (rowMatch && rowMatch[1]) {
        return parseInt(rowMatch[1], 10);
    }

    return 1; // Default to row 1 if no #row tag
}

/**
 * Sorts columns by row number, maintaining original order within each row
 * @param columns - Array of columns with title property
 * @returns Sorted array of columns (row 1 first, then row 2, etc.)
 */
export function sortColumnsByRow<T extends { title: string }>(columns: T[]): T[] {
    return columns
        .map((column, index) => ({
            column,
            index,
            row: getColumnRow(column.title)
        }))
        .sort((a, b) => {
            // First sort by row number
            if (a.row !== b.row) {
                return a.row - b.row;
            }
            // Within same row, maintain original order
            return a.index - b.index;
        })
        .map(item => item.column);
}
