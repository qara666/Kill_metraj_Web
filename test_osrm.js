const axios = require('axios');

async function run() {
    const coordsStr = "30.448043,50.510006;30.484279,50.481023;30.488344,50.485231;30.448043,50.510006"; // Maevska -> Kirilovskaya -> Khvoyka -> Maevska
    const url = `http://osrm.yapiko.kh.ua:5050/route/v1/driving/${coordsStr}?overview=full&steps=true&annotations=true`;
    console.log("Fetching", url);
    try {
        const res = await axios.get(url);
        console.log("Distance:", res.data.routes[0].distance / 1000, "km");
    } catch (e) {
        console.error(e.message);
    }
}
run();
