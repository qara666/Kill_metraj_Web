
const { generateStreetVariants, cleanAddress } = require('./frontend/src/utils/data/addressUtils');

console.log('--- Lukyanenka ---');
const v1 = generateStreetVariants("вул. Левка Лук'яненка, 13", "Киев");
console.log(v1);

console.log('--- Mangled ---');
const cleaned = cleanAddress("вул. Левка Лук?яненка, 13");
const v2 = generateStreetVariants(cleaned, "Киев");
console.log(v2);
