import { cleanAddressForSearch } from '../frontend/src/utils/address/addressNormalization';
import { expandVariants } from '../frontend/src/services/robust-geocoding/variantExpander';

const addr1 = 'Oleksandra Olesya Street,2a, под.1, д/ф моб';
const addr2 = 'Київ, вул. Івана Виговського (Маршала Гречка), 8а, под.2, д/ф моб, эт.1, кв.22';

console.log('--- ADDR 1 ---');
let c1 = cleanAddressForSearch(addr1);
console.log('Cleaned:', c1);
console.log('Variants:', expandVariants(c1, 'Київ').all.slice(0, 3));

console.log('--- ADDR 2 ---');
let c2 = cleanAddressForSearch(addr2);
console.log('Cleaned:', c2);
console.log('Variants:', expandVariants(c2, 'Київ').all.slice(0, 3));
