// testSymbols.js
const axios = require('axios');
const fs = require('fs');

const COLLECT_API_TOKEN = 'apikey 54OWZKgEzaUUT54rqfpAf2:4mo2qETj2DFPrNXgZW4zwH';

async function testSymbols() {
    try {
        console.log('🌐 CollectAPI /symbols üzerinden döviz sembolleri çekiliyor...\n');

        const response = await axios.get(
            'https://api.collectapi.com/economy/symbols',
            {
                headers: {
                    authorization: COLLECT_API_TOKEN,
                    'content-type': 'application/json'
                },
                timeout: 15000
            }
        );

        if (
            !response.data ||
            !response.data.success ||
            !Array.isArray(response.data.result)
        ) {
            console.log('⚠️ Beklenen formatta veri gelmedi.');
            console.log(JSON.stringify(response.data, null, 2));
            return;
        }

        const symbols = response.data.result;

        console.log(`✅ Toplam ${symbols.length} adet döviz sembolü bulundu.\n`);
        console.log('--- SAĞLANAN DÖVİZLER ---');

        symbols.forEach((item, index) => {
            console.log(`${index + 1}. ${item.code} => ${item.name}`);
        });

        fs.writeFileSync(
            './availableCurrencySymbols.json',
            JSON.stringify(
                {
                    success: true,
                    total: symbols.length,
                    lastUpdate: new Date().toLocaleString('tr-TR'),
                    data: symbols
                },
                null,
                2
            )
        );

        console.log('\n💾 Liste availableCurrencySymbols.json dosyasına yazıldı.');
        console.log('ℹ️ Bu işlem sadece /symbols endpointine 1 istek atar.');
    } catch (error) {
        console.error('❌ Hata oluştu.');

        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('API Cevabı:', JSON.stringify(error.response.data, null, 2));
        } else {
            console.error('Message:', error.message);
        }
    }
}

testSymbols();