/**
 * Centralized date normalization for cross-component comparison
 * Handles:
 * - DD.MM.YYYY (API format)
 * - YYYY-MM-DD (Store/DatePicker format)
 * Returns: YYYY-MM-DD
 */
export const normalizeDateToIso = (d: any): string => {
    if (!d) return '';
    // Handle numerical timestamps (milliseconds)
    if (typeof d === 'number' || (!isNaN(Number(d)) && String(d).length > 10)) {
        const date = new Date(Number(d));
        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    }

    const s = String(d).split(' ')[0].split('T')[0];
    
    // DD.MM.YYYY -> YYYY-MM-DD
    if (/^\d{2}\.\d{2}\.\d{4}$/.test(s)) {
        const [dd, mm, yyyy] = s.split('.');
        return `${yyyy}-${mm}-${dd}`;
    }
    
    // YYYY-MM-DD -> YYYY-MM-DD (already correct)
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return s;
    }
    
    return s;
};
