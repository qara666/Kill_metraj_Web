import { describe, it, expect } from 'vitest';
import { cleanAddress, generateStreetVariants } from '../addressUtils';

describe('addressUtils', () => {
    describe('cleanAddress', () => {
        it('should replace ? with space', () => {
            expect(cleanAddress("вул. Левка Лук?яненка, 13")).toContain("Левка Лук яненка");
        });

        it('should replace * with space', () => {
            expect(cleanAddress("вул. Левка Лук*яненка, 13")).toContain("Левка Лук яненка");
        });

        it('should strip technical notes', () => {
            expect(cleanAddress("вул. Левка Лук'яненка, 11А, под.3, д/ф моб, эт.1, кв.73")).toBe("вул. Левка Лук'яненка, 11А");
        });
    });

    describe('generateStreetVariants', () => {
        it('should generate variants for Lukyanenka (new/old names)', () => {
            const variants = generateStreetVariants("вул. Левка Лук'яненка, 13", "Киев");
            expect(variants.some(v => v.includes("Маршала Тимошенка"))).toBe(true);
        });

        it('should generate variants for Timoshenka (new/old names)', () => {
            const variants = generateStreetVariants("вул. Маршала Тимошенка, 13", "Киев");
            expect(variants.some(v => v.includes("Левка Лук'яненка"))).toBe(true);
        });

        it('should generate variants for Ivasyuka (new/old names)', () => {
            const variants = generateStreetVariants("просп. Володимира Івасюка, 46", "Киев");
            expect(variants.some(v => v.includes("Героїв Сталінграда"))).toBe(true);
        });
        
        it('should handle mangled Lukyanenka with ?', () => {
            const cleaned = cleanAddress("вул. Левка Лук?яненка, 13");
            const variants = generateStreetVariants(cleaned, "Киев");
            // Should find the rename even if it was "Лук яненка" after cleaning
            expect(variants.some(v => v.includes("Тимошенка"))).toBe(true);
        });
    });
});
