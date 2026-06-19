// services/scraper.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const ASSETS_TO_SCRAPE = [
    { 
        code: 'USD', 
        name: 'Dolar', 
        url: 'https://kur.doviz.com/serbest-piyasa/amerikan-dolari' 
    },
    { 
        code: 'EUR', 
        name: 'Euro', 
        url: 'https://kur.doviz.com/serbest-piyasa/euro' 
    },
    { 
        code: 'XAU', 
        name: 'Altın', 
        url: 'https://altin.doviz.com/gram-altin' 
    },
    { 
        code: 'XAG', 
        name: 'Gümüş', 
        url: 'https://altin.doviz.com/gumus' 
    }
];

async function getDovizComData() {
    const browser = await puppeteer.launch({ 
        headless: "new", 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    let totalData = [];

    try {
        for (const asset of ASSETS_TO_SCRAPE) {
            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
            
            console.log(`🔍 ${asset.name} verisi çekiliyor: ${asset.url}`);
            
            // Artık sabit URL + path yerine doğrudan asset içindeki URL'e gidiyoruz
            await page.goto(asset.url, { 
                waitUntil: 'networkidle2', 
                timeout: 60000 
            });
            
            const assetData = await page.evaluate((assetInfo) => {
                const rows = Array.from(document.querySelectorAll('table tr')).slice(1);
                return rows.map(row => {
                    const cells = row.querySelectorAll('td');
                    if (cells.length < 5) return null;
                    
                    return {
                        assetCode: assetInfo.code,
                        assetName: assetInfo.name,
                        sourceName: cells[0].innerText.trim(),
                        buyPrice: cells[1].innerText.trim(),
                        sellPrice: cells[2].innerText.trim(),
                        spreadAmount: cells[3].innerText.trim(),
                        spreadPercent: cells[4].innerText.trim(),
                        category: (assetInfo.code === 'USD' || assetInfo.code === 'EUR') ? 'Döviz' : 'Kıymetli Madenler'
                    };
                }).filter(i => i !== null);
            }, asset);

            totalData = [...totalData, ...assetData];
            await page.close();
        }

        await browser.close();
        return totalData;

    } catch (err) {
        console.error("❌ Scraper Hatası:", err.message);
        if (browser) await browser.close();
        throw err;
    }
} 

module.exports = { getDovizComData };