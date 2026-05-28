import { robustGeocodingService } from './src/services/robust-geocoding/RobustGeocodingService';
import { expandVariants } from './src/services/robust-geocoding/variantExpander';

async function test() {
  const address = 'Київ, просп. Володимира Івасюка (Героїв Сталінграда), 7, под.2, д/ф моб, эт.1, кв.18';
  console.log('--- Address:', address, '---');
  console.log('Variants:', expandVariants(address, 'Київ'));
  
  // We mock photon/nominatim here just to trace logic if needed, 
  // but it's better to just run the real service to see if the filter bugs are fixed.
  try {
      const res = await robustGeocodingService.geocode(address, { turbo: true });
      console.log('Result:', JSON.stringify(res, null, 2));
  } catch (e) {
      console.error(e);
  }
}
test();
