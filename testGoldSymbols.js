// testGoldSymbols.js
const axios = require('axios');

const COLLECT_API_TOKEN = 'apikey 54OWZKgEzaUUT54rqfpAf2:4mo2qETj2DFPrNXgZW4zwH'; // CollectAPI token'ınızı buraya ekleyin

async function testGoldSymbols() {
    try {
        const response = await axios.get(
            'https://api.collectapi.com/economy/goldSymbols',
            {
                headers: {
                    authorization: COLLECT_API_TOKEN,
                    'content-type': 'application/json'
                }
            }
        );

        const result = response.data.result || [];

        console.log('\n--- TÜM ALTIN/GÜMÜŞ KEY LİSTESİ ---');
        result.forEach(item => {
            console.log(`${item.name} => ${item.key}`);
        });

        console.log('\n--- GÜMÜŞ İÇEREN KAYITLAR ---');
        const silverItems = result.filter(item => {
            const text = `${item.name} ${item.key}`.toLocaleLowerCase('tr-TR');
            return (
                text.includes('gümüş') ||
                text.includes('gumus') ||
                text.includes('silver')
            );
        });

        console.log(silverItems);

    } catch (error) {
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
        console.error('Message:', error.message);
    }
}

testGoldSymbols();