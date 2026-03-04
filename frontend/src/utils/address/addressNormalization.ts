/**
 * Address Normalization Utility
 * 
 * Standardizes addresses to increase cache hit rates and reduce Google API costs.
 * Treats "ул. Ленина, 5" and "Ленина 5" as the same key.
 */

const ADDR_REPLACEMENTS: [RegExp, string][] = [
    // Remove specific common noisy abbreviations (Russian)
    [/\b(ул\.?|улица)\s+/gi, ''],
    [/\b(д\.?|дом)\s+/gi, ''],
    [/\b(кв\.?|квартира)\s+/gi, ''],
    [/\b(стр\.?|строение)\s+/gi, ''],
    [/\b(корп\.?|корпус)\s+/gi, ''],
    [/\b(под\.?|подъезд)\s+/gi, ''],
    [/\b(эт\.?|этаж)\s+/gi, ''],
    [/\b(г\.?|город)\s+/gi, ''],
    [/\b(обл\.?|область)\s+/gi, ''],
    // Punctuation and special chars
    [/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '],
    // Multiple spaces
    [/\s\s+/g, ' '],
];

/**
 * Normalizes an address string for caching purposes.
 * Returns a lowercase, trimmed, "base" version of the address.
 */
export function normalizeAddress(address: string): string {
    if (!address) return '';

    let normalized = address.toLowerCase();

    // Apply all regex replacements
    for (const [regex, replacement] of ADDR_REPLACEMENTS) {
        normalized = normalized.replace(regex, replacement);
    }

    return normalized.trim();
}
