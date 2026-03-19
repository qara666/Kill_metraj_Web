import { cleanAddressForSearch } from './frontend/src/utils/address/addressNormalization.ts';
// Oh wait, node cannot natively run TS without ts-node or similar.
// Let's just copy the logic.
const complexHouse = /\d+[а-яієґa-z]*(?:[\/\-]\d*[а-яієґa-z]*)?/i;
const regex = new RegExp(`^(.*?(?:,|\\s)\\s*(?:(?:дом|д)\\.?\\s*)?(${complexHouse.source}))(?:\\s+|$|,|\\b(?:под|этаж|кв|д\\/ф|моб|корп|секция|сектор|подъезд|вход|литера|літера)\\b)`, 'iu');

const address = "росп. Володимира Івасюка, 4 корп. 1, под.1, д/ф моб, эт.1, кв.1";
console.log(address.match(regex));
