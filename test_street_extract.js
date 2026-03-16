// Test for RobustGeocoding pipeline integration without React env
const { expandVariants, extractHouseNumber } = require('./frontend/src/services/robust-geocoding/variantExpander.ts')

// We compiled the TS file in our minds, let's write a mock to see what variantExpander does for the failing addresses
const tsCode = require('fs').readFileSync('./frontend/src/services/robust-geocoding/variantExpander.ts', 'utf8');

// I will just parse the logic in JS
const addresses = [
    "Київ, вул. Бакинська, 37г, под.4, д/ф моб, эт.3, кв.236",
    "Oleksandra Olesya Street,2а, под.1, д/ф моб",
    "Київ, вул. Північна, 48, под.2, д/ф 158, эт.4, кв.158",
    "вулиця Героїв Дніпра,36В, д/ф моб"
];

// Let's use the actual addressNormalization logic for cleanAddress
const fs = require('fs');
const normCode = fs.readFileSync('./frontend/src/utils/address/addressNormalization.ts', 'utf8');

// Quick mock for testing Regexes
function cleanAddressForSearch(address) {
    if (!address) return '';
    let cleaned = address.trim();
    cleaned = cleaned.replace(/,(\d)/g, ', $1');
    cleaned = cleaned.replace(/^(?:місто\s+|город\s+|м\.?\s*|г\.?\s*)?(?:київ|киев|kyiv|kiev|харків|харьков|дніпро|ужгород|одеса|одесса|львів|львов|бровари|бровары|бориспіль|борисполь|ірпінь|ирпень|буча|вишневе|вишневое)\s*,\s*/i, '');
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').trim();
    
    // We already tested step 3 in previous steps, and it works perfectly.
    const complexHouse = /\\d+[а-яієґa-z]*(?:[\\/\\-]\\d*[а-яієґa-z]*)?/i;
    const houseMatch = cleaned.match(new RegExp(`^(.*?(?:,|\\s)\\s*(?:(?:дом|д)\\.?\\s*)?(${complexHouse.source}))(?:\\s+|$|,|\\b(?:под|этаж|кв|д\\/ф|моб|под|эт|корп|секция|секто|подъезд|вход|литера|літера)\\b)`, 'iu'));
    
    // Since complexHouse dynamic creation has issues here, let's just cheat and do what we did before:
    const regex = /^(.*?(?:,|\s)\s*(?:(?:дом|д)\.?\s*)?(\d+[а-яієґa-z]*(?:[\/\-]\d*[а-яієґa-z]*)?))(?:\s+|$|,|\b(?:под|этаж|кв|д\/ф|моб|под|эт|корп|секция|секто|подъезд|вход|литера|літера)\b)/iu
    const m = cleaned.match(regex);
    if (m && m[1]) {
        const prefixMatch = m[1].match(/^(.*?)(?:,|\s)\s*(?:дом|д)\.?\s*(\d+.*)$/i);
        if (prefixMatch) {
            cleaned = `${prefixMatch[1]}, ${prefixMatch[2]}`.trim();
        } else {
            cleaned = m[1].trim();
        }
    }
    
    const suffixRegex = /(?:,|\s)\s*(?:корп\.?|корпус|під\.?|под\.?|підʼїзд|подъезд|п\.?|к\.?|эт\.?|этаж|кв\.?|квартира|оф\.?|офіс|офис|вход|вхід|секція|секция|літера|літ\.?|литера|д\/ф|д\s*[\/-]\s*ф|моб|\bпод\b|\bэт\b|\bкв\b|\bоф\b|\bліт\b|\d{4,5}|д\s*\d+)\b.*$/iu;
    cleaned = cleaned.replace(/(?:^|\s)(street|st|avenue|ave|road|rd|boulevard|blvd)\b(?:\s*,\s*|\s+)(\d+)/gi, ' $2');

    let last;
    do {
        last = cleaned;
        cleaned = cleaned.replace(suffixRegex, '');
    } while (cleaned !== last);

    return cleaned.replace(/[, \-]+$/, '').replace(/\s{2,}/g, ' ').trim();
}

function extractHouse(raw) {
    if (!raw) return null
    const noPostal = raw.replace(/\b\d{5}\b/g, '')
    const m = noPostal.match(/\b\d+[а-яА-ЯёЁіІєЄґҐa-zA-Z]*(?:[\/\-]\d*[а-яА-ЯёЁіІєЄґҐa-zA-Z]*)?\b/u)
    return m ? m[0].toLowerCase() : null
}

console.log("TESTING STREET ONLY EXTRACTION (Phase 4):");
for (const raw of addresses) {
    const cleaned = cleanAddressForSearch(raw);
    const houseNum = extractHouse(cleaned);
    if (houseNum) {
        const escapedHouse = houseNum.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
        const streetOnly = cleaned.replace(new RegExp(`(?:,|\\s)*${escapedHouse}.*$`, 'i'), '').trim()
        console.log(`\nInput:   ${raw}`);
        console.log(`Cleaned: ${cleaned}`);
        console.log(`House:   ${houseNum}`);
        console.log(`Street:  ${streetOnly}`);
    }
}
