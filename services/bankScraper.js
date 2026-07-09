// services/bankScraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const SOURCES = [
    { name: 'Bloomberg HT', url: 'https://www.bloomberght.com/altin' },
    { name: 'Garanti BBVA', url: 'https://www.garantibbva.com.tr/altin-kurlari' },
    { name: 'Garanti BBVA Döviz', url: 'https://www.garantibbva.com.tr/doviz-kurlari' }
];

async function getFallbackBankData() {
    console.log(`⚠️ --- YEDEK SİSTEM: Bankalardan Veri Çekme Başladı ---`);
    let browser;
    let totalData = [];

    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        for (const source of SOURCES) {
            try {
                const page = await browser.newPage();
                await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
                
                await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 45000 });
                // Banka sayfalarının DOM yapısı yavaş yüklenebiliyor, 3 saniye bekle
                await new Promise(r => setTimeout(r, 3000));

                let data = [];

                if (source.name === 'Bloomberg HT') {
                    data = await page.evaluate(() => {
                        let results = [];
                        const rows = document.querySelectorAll('tbody tr');
                        const targetAssets = { 'GRAM ALTIN': 'XAU', 'GÜMÜŞ': 'XAG' }; // Zulam standart kodları

                        rows.forEach(row => {
                            let text = row.innerText.toUpperCase();
                            for (const [name, code] of Object.entries(targetAssets)) {
                                if (text.includes(name)) {
                                    let cols = Array.from(row.children).map(c => c.innerText.trim());
                                    if (cols.length >= 3) {
                                        let buy = parseFloat(cols[1].replace(/\./g, '').replace(',', '.'));
                                        let sell = parseFloat(cols[2].replace(/\./g, '').replace(',', '.'));
                                        
                                        if (!isNaN(buy) && buy > 0) {
                                            results.push({
                                                assetCode: code,
                                                assetName: name,
                                                sourceName: 'Bloomberg HT',
                                                buyPrice: buy,
                                                sellPrice: isNaN(sell) ? buy : sell,
                                                spreadAmount: "0",
                                                spreadPercent: "0,00%", // Bankalarda makas yüzdesi direkt yazmadığı için 0 varsayıyoruz
                                                category: 'Kıymetli Madenler'
                                            });
                                        }
                                    }
                                }
                            }
                        });
                        return results;
                    });
                } else if (source.name.includes('Garanti')) {
                    // Garanti için basitleştirilmiş çekim (Eski server.js'teki karmaşık kodu Zulam modeline uydurduk)
                    data = await page.evaluate((sourceName) => {
                         let results = [];
                         let rawText = document.body.innerText.toUpperCase();
                         
                         const assetMap = {
                            'USD': { code: 'USD', name: 'Dolar', cat: 'Döviz' },
                            'EUR': { code: 'EUR', name: 'Euro', cat: 'Döviz' },
                            'GRAM ALTIN': { code: 'XAU', name: 'Gram Altın', cat: 'Kıymetli Madenler' }
                         };

                         for (const [searchKey, info] of Object.entries(assetMap)) {
                            let startIndex = rawText.indexOf(searchKey);
                            if (startIndex !== -1) {
                                const part = rawText.substring(startIndex, startIndex + 300);
                                const matches = part.match(/\d+(?:\.\d{3})*,\d{2,4}/g);
                                if (matches && matches.length >= 2) {
                                    results.push({
                                        assetCode: info.code,
                                        assetName: info.name,
                                        sourceName: 'Garanti BBVA',
                                        buyPrice: parseFloat(matches[0].replace(/\./g, '').replace(',', '.')),
                                        sellPrice: parseFloat(matches[1].replace(/\./g, '').replace(',', '.')),
                                        spreadAmount: "0",
                                        spreadPercent: "0,00%",
                                        category: info.cat
                                    });
                                }
                            }
                         }
                         return results;
                    });
                }

                totalData = totalData.concat(data);
                console.log(`✅ Yedek Kaynak (${source.name}) ${data.length} adet veri alındı.`);
                await page.close();

            } catch (e) {
                console.log(`❌ Yedek Kaynak Hatası (${source.name}): ${e.message}`);
            }
        }

        await browser.close();
        return totalData;

    } catch (err) {
        console.error("❌ Yedek Sistem Ana Hatası:", err.message);
        if (browser) await browser.close();
        return []; // Hata alsa bile boş array dönsün ki sistem çökmesin
    }
}

module.exports = { getFallbackBankData };