const axios = require('axios');
async function test() {
  try {
    const res = await axios.get('http://localhost:5001/api/proxy/geocoding?url=' + encodeURIComponent('https://photon.komoot.io/api/?q=Киев, Крещатик 1&limit=1'));
    console.log("Geocode Code/Type:", typeof res.data, Array.isArray(res.data) ? res.data.length : res.data);
    const osrmRes = await axios.get('http://localhost:5001/api/proxy/osrm?url=' + encodeURIComponent('http://router.project-osrm.org/route/v1/driving/30.5234,50.4501;30.5235,50.4502?overview=false'));
    console.log("OSRM Code:", osrmRes.data.code);
  } catch(e) {
    console.error(e.message);
  }
}
test();
