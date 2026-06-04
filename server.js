const express = require('express');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const cron = require('node-cron');
const cors = require('cors');

puppeteer.use(StealthPlugin());
const app = express();
app.use(cors());

let globalKurlar = [];
let sonGuncelleme = null;

const SOURCES = [
    { name: 'Bloomberg HT', url: 'https://www.bloomberght.com/altin' },
    { name: 'Garanti Altın', url: 'https://www.garantibbva.com.tr/altin-kurlari' },
    { name: 'Garanti Döviz', url: 'https://www.garantibbva.com.tr/doviz-kurlari' },
    { name: 'Yapı Kredi Altın', url: 'https://www.yapikredi.com.tr/yatirimci-kosesi/altin-bilgileri' },
    { name: 'Yapı Kredi Döviz', url: 'https://www.yapikredi.com.tr/yatirimci-kosesi/doviz-bilgileri' }
];

async function kurlariCek() {
    console.log(`--- Çoklu Kaynak Veri Çekme Başladı (${new Date().toLocaleTimeString()}) ---`);
    let browser;

    try {
        browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });

        let tumVeriler = [];

        for (const source of SOURCES) {
            try {
                const page = await browser.newPage();

                await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 60000 });
                await new Promise(r => setTimeout(r, 5000));

                let data = [];

                switch (source.name) {
                    // ---------------- 1. BLOOMBERG HT ----------------
                    case 'Bloomberg HT':
                        data = await page.evaluate((platformName) => {
                            let results = [];
                            const seenAssets = new Set();
                            const rows = document.querySelectorAll('tbody tr');
                            const aranacakKelimeler = ['ALTIN', 'GRAM', 'ÇEYREK', 'YARIM', 'TAM', 'CUMHURİYET', 'BİLEZİK', 'ZİYNET', 'ATA'];

                            rows.forEach(row => {
                                let text = row.innerText.toUpperCase();
                                if (aranacakKelimeler.some(kelime => text.includes(kelime))) {
                                    let cols = Array.from(row.children).map(c => c.innerText.trim());
                                    if (cols.length >= 3) {
                                        let name = cols[0].replace(/[↓↑-]/g, '').trim();
                                        if (seenAssets.has(name)) return;

                                        let buy = parseFloat(cols[1].replace(/\./g, '').replace(',', '.'));
                                        let sell = parseFloat(cols[2].replace(/\./g, '').replace(',', '.'));

                                        if (!isNaN(buy) && buy > 0) {
                                            seenAssets.add(name);
                                            results.push({
                                                category: 'Değerli Madenler',
                                                assetName: name,
                                                platform: platformName,
                                                buyPrice: buy,
                                                sellPrice: isNaN(sell) ? buy : sell
                                            });
                                        }
                                    }
                                }
                            });
                            return results;
                        }, source.name);
                        break;

                    // ---------------- 2. GARANTİ ALTIN ----------------
                    case 'Garanti Altın':
                        data = await page.evaluate(() => {
                            let results = [];
                            let seen = new Set();

                            function temizle(text) {
                                return text.replace(/İ/g, 'I').replace(/i/g, 'I')
                                    .replace(/ı/g, 'I').replace(/I/g, 'I')
                                    .replace(/Ş/g, 'S').replace(/ş/g, 'S')
                                    .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
                                    .replace(/Ü/g, 'U').replace(/ü/g, 'U')
                                    .replace(/Ö/g, 'O').replace(/ö/g, 'O')
                                    .replace(/Ç/g, 'C').replace(/ç/g, 'C')
                                    .toUpperCase().replace(/\s+/g, ' ');
                            }

                            let rawText = temizle(document.body.innerText);
                            const aranacaklar = [
                                { kural: 'GRAM', name: 'GRAM ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'CEYREK', name: 'ÇEYREK ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'ONS', name: 'ONS ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'YARIM', name: 'YARIM ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'TAM', name: 'TAM ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'CUMHURIYET', name: 'CUMHURİYET ALTINI', cat: 'Değerli Madenler' },
                                { kural: 'ATA', name: 'ATA ALTIN', cat: 'Değerli Madenler' },
                                { kural: '14 AYAR', name: '14 AYAR ALTIN', cat: 'Değerli Madenler' },
                                { kural: '18 AYAR', name: '18 AYAR ALTIN', cat: 'Değerli Madenler' },
                                { kural: '22 AYAR', name: '22 AYAR ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'IKIBUCUK', name: 'İKİBUÇUK ALTIN', cat: 'Değerli Madenler' }
                            ];

                            aranacaklar.forEach(hedef => {
                                let baslangic = 0;
                                while ((baslangic = rawText.indexOf(hedef.kural, baslangic)) !== -1) {
                                    let parca = rawText.substring(baslangic + hedef.kural.length, baslangic + hedef.kural.length + 100);
                                    let sayilar = parca.match(/\d{1,3}(?:\.\d{3})*,\d{2,4}/g);

                                    if (sayilar && sayilar.length >= 2) {
                                        let buy = parseFloat(sayilar[0].replace(/\./g, '').replace(',', '.'));
                                        let sell = parseFloat(sayilar[1].replace(/\./g, '').replace(',', '.'));
                                        if (buy > 0 && !seen.has(hedef.name)) {
                                            seen.add(hedef.name);
                                            results.push({
                                                category: hedef.cat,
                                                assetName: hedef.name,
                                                platform: 'Garanti BBVA',
                                                buyPrice: buy,
                                                sellPrice: sell
                                            });
                                            break;
                                        }
                                    }
                                    baslangic += hedef.kural.length;
                                }
                            });
                            return results;
                        });
                        break;

                    // ---------------- 3. GARANTİ DÖVİZ ----------------
                    case 'Garanti Döviz':
                        const targetFrame = page.frames().find(frame =>
                            frame.url().includes('currency-convertor-app-v3')
                        );

                        if (targetFrame) {
                            data = await targetFrame.evaluate(() => {
                                const results = [];
                                const seen = new Set();
                                const assetMap = {
                                    USD: { name: 'USDTRY', cat: 'Döviz' },
                                    EUR: { name: 'EURTRY', cat: 'Döviz' },
                                    ALT: { name: 'GRAM ALTIN', cat: 'Değerli Madenler' },
                                    GMS: { name: 'GÜMÜŞ GRAM', cat: 'Değerli Madenler' },
                                    XPD: { name: 'PALADYUM GRAM', cat: 'Değerli Madenler' },
                                    XPT: { name: 'PLATİN GRAM', cat: 'Değerli Madenler' },
                                    GBP: { name: 'GBPTRY', cat: 'Döviz' },
                                    CHF: { name: 'CHFTRY', cat: 'Döviz' },
                                    AUD: { name: 'AUDTRY', cat: 'Döviz' },
                                    CAD: { name: 'CADTRY', cat: 'Döviz' },
                                    CNY: { name: 'CNYTRY', cat: 'Döviz' },
                                    DKK: { name: 'DKKTRY', cat: 'Döviz' },
                                    JPY: { name: 'JPYTRY', cat: 'Döviz' },
                                    NOK: { name: 'NOKTRY', cat: 'Döviz' },
                                    SAR: { name: 'SARTRY', cat: 'Döviz' },
                                    SEK: { name: 'SEKTRY', cat: 'Döviz' }
                                };

                                function temizle(text) {
                                    return (text || '').replace(/İ/g, 'I').replace(/i/g, 'I').replace(/ı/g, 'I')
                                        .replace(/Ş/g, 'S').replace(/ş/g, 'S').replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
                                        .replace(/Ü/g, 'U').replace(/ü/g, 'U').replace(/Ö/g, 'O').replace(/ö/g, 'O')
                                        .replace(/Ç/g, 'C').replace(/ç/g, 'C').toUpperCase().replace(/\s+/g, ' ').trim();
                                }

                                function parseNumber(text) {
                                    if (!text) return NaN;
                                    const match = String(text).match(/\d+(?:\.\d{3})*,\d{2,4}/);
                                    if (!match) return NaN;
                                    return parseFloat(match[0].replace(/\./g, '').replace(',', '.'));
                                }

                                const rows = Array.from(document.querySelectorAll('tr'));
                                for (const row of rows) {
                                    const cells = Array.from(row.querySelectorAll('td, th'))
                                        .map(cell => cell.innerText.trim()).filter(Boolean);

                                    if (cells.length < 3) continue;

                                    const firstCell = temizle(cells[0]);
                                    const code = Object.keys(assetMap).find(k => firstCell.includes(k));

                                    if (code && !seen.has(code)) {
                                        const buy = parseNumber(cells[1]);
                                        const sell = parseNumber(cells[2]);
                                        if (!isNaN(buy) && !isNaN(sell) && buy > 0) {
                                            seen.add(code);
                                            results.push({
                                                category: assetMap[code].cat,
                                                assetName: assetMap[code].name,
                                                platform: 'Garanti BBVA',
                                                buyPrice: buy,
                                                sellPrice: sell
                                            });
                                        }
                                    }
                                }

                                if (results.length === 0) {
                                    const rawText = temizle(document.body ? document.body.innerText : '');
                                    for (const code of Object.keys(assetMap)) {
                                        let startIndex = 0;
                                        while ((startIndex = rawText.indexOf(code, startIndex)) !== -1) {
                                            const part = rawText.substring(startIndex, startIndex + 350);
                                            const matches = part.match(/\d+(?:\.\d{3})*,\d{2,4}/g);
                                            if (matches && matches.length >= 2) {
                                                const buy = parseFloat(matches[0].replace(/\./g, '').replace(',', '.'));
                                                const sell = parseFloat(matches[1].replace(/\./g, '').replace(',', '.'));
                                                if (!isNaN(buy) && !isNaN(sell) && buy > 0 && !seen.has(code)) {
                                                    seen.add(code);
                                                    results.push({
                                                        category: assetMap[code].cat,
                                                        assetName: assetMap[code].name,
                                                        platform: 'Garanti BBVA',
                                                        buyPrice: buy,
                                                        sellPrice: sell
                                                    });
                                                    break;
                                                }
                                            }
                                            startIndex += code.length;
                                        }
                                    }
                                }
                                return results;
                            });
                        }
                        break;

                    // ---------------- 4. YAPI KREDİ ALTIN ----------------
                    case 'Yapı Kredi Altın':
                        data = await page.evaluate(() => {
                            let results = [];
                            let seen = new Set();

                            function temizle(text) {
                                return text.replace(/İ/g, 'I').replace(/i/g, 'I')
                                    .replace(/ı/g, 'I').replace(/I/g, 'I')
                                    .replace(/Ş/g, 'S').replace(/ş/g, 'S')
                                    .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
                                    .replace(/Ü/g, 'U').replace(/ü/g, 'U')
                                    .replace(/Ö/g, 'O').replace(/ö/g, 'O')
                                    .replace(/Ç/g, 'C').replace(/ç/g, 'C')
                                    .toUpperCase().replace(/\s+/g, ' ');
                            }

                            let rawText = temizle(document.body.innerText);
                            const aranacaklar = [
                                { kural: 'GRAM', name: 'GRAM ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'CEYREK', name: 'ÇEYREK ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'YARIM', name: 'YARIM ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'TAM', name: 'TAM ALTIN', cat: 'Değerli Madenler' }
                            ];

                            aranacaklar.forEach(hedef => {
                                let baslangic = 0;
                                while ((baslangic = rawText.indexOf(hedef.kural, baslangic)) !== -1) {
                                    let parca = rawText.substring(baslangic + hedef.kural.length, baslangic + hedef.kural.length + 100);
                                    let sayilar = parca.match(/\d{1,3}(?:\.\d{3})*,\d{2,4}/g);

                                    if (sayilar && sayilar.length >= 2) {
                                        let buy = parseFloat(sayilar[0].replace(/\./g, '').replace(',', '.'));
                                        let sell = parseFloat(sayilar[1].replace(/\./g, '').replace(',', '.'));
                                        if (buy > 0 && !seen.has(hedef.name)) {
                                            seen.add(hedef.name);
                                            results.push({
                                                category: hedef.cat,
                                                assetName: hedef.name,
                                                platform: 'Yapı Kredi',
                                                buyPrice: buy,
                                                sellPrice: sell
                                            });
                                            break;
                                        }
                                    }
                                    baslangic += hedef.kural.length;
                                }
                            });
                            return results;
                        });
                        break;

                    // ---------------- 5. YAPI KREDİ DÖVİZ ----------------
                    case 'Yapı Kredi Döviz':
                        data = await page.evaluate(() => {
                            let results = [];
                            let seen = new Set();

                            function temizle(text) {
                                return text.replace(/İ/g, 'I').replace(/i/g, 'I')
                                    .replace(/ı/g, 'I').replace(/I/g, 'I')
                                    .replace(/Ş/g, 'S').replace(/ş/g, 'S')
                                    .replace(/Ğ/g, 'G').replace(/ğ/g, 'G')
                                    .replace(/Ü/g, 'U').replace(/ü/g, 'U')
                                    .replace(/Ö/g, 'O').replace(/ö/g, 'O')
                                    .replace(/Ç/g, 'C').replace(/ç/g, 'C')
                                    .toUpperCase().replace(/\s+/g, ' ');
                            }

                            let rawText = temizle(document.body.innerText);
                            const aranacaklar = [
                                { kural: 'USD', name: 'USDTRY', cat: 'Döviz' },
                                { kural: 'EUR', name: 'EURTRY', cat: 'Döviz' },
                                { kural: 'XAU', name: 'GRAM ALTIN', cat: 'Değerli Madenler' },
                                { kural: 'XAG', name: 'GÜMÜŞ GRAM', cat: 'Değerli Madenler' },
                                { kural: 'GBP', name: 'GBPTRY', cat: 'Döviz' },
                                { kural: 'AUD', name: 'AUDTRY', cat: 'Döviz' },
                                { kural: 'DKK', name: 'DKKTRY', cat: 'Döviz' },
                                { kural: 'SEK', name: 'SEKTRY', cat: 'Döviz' },
                                { kural: 'CHF', name: 'CHFTRY', cat: 'Döviz' },
                                { kural: 'JPY', name: 'JPYTRY', cat: 'Döviz' },
                                { kural: 'CAD', name: 'CADTRY', cat: 'Döviz' },
                                { kural: 'KWD', name: 'KWDTRY', cat: 'Döviz' },
                                { kural: 'NOK', name: 'NOKTRY', cat: 'Döviz' },
                                { kural: 'SAR', name: 'SARTRY', cat: 'Döviz' },
                                { kural: 'AED', name: 'AEDTRY', cat: 'Döviz' }
                            ];

                            aranacaklar.forEach(hedef => {
                                let baslangic = 0;
                                while ((baslangic = rawText.indexOf(hedef.kural, baslangic)) !== -1) {
                                    let parca = rawText.substring(baslangic + hedef.kural.length, baslangic + hedef.kural.length + 100);
                                    let sayilar = parca.match(/\d{1,3}(?:\.\d{3})*,\d{2,4}/g);

                                    if (sayilar && sayilar.length >= 2) {
                                        let buy = parseFloat(sayilar[0].replace(/\./g, '').replace(',', '.'));
                                        let sell = parseFloat(sayilar[1].replace(/\./g, '').replace(',', '.'));
                                        if (buy > 0 && !seen.has(hedef.name)) {
                                            seen.add(hedef.name);
                                            results.push({
                                                category: hedef.cat,
                                                assetName: hedef.name,
                                                platform: 'Yapı Kredi',
                                                buyPrice: buy,
                                                sellPrice: sell
                                            });
                                            break;
                                        }
                                    }
                                    baslangic += hedef.kural.length;
                                }
                            });
                            return results;
                        });
                        break;
                }

                tumVeriler = tumVeriler.concat(data);
                console.log(`✅ ${source.name}: ${data.length} veri alındı.`);
                await page.close();
            } catch (e) {
                console.log(`❌ ${source.name} hatası: ${e.message}`);
            }
        }

        globalKurlar = tumVeriler;
        sonGuncelleme = new Date();
        console.log(`--- İşlem Tamamlandı. Toplam: ${globalKurlar.length} veri kaydedildi. ---`);
    } catch (err) {
        console.error("Ana tarayıcı hatası:", err);
    } finally {
        if (browser) await browser.close();
    }
}

kurlariCek();
cron.schedule('*/15 * * * *', kurlariCek);

app.get('/api/kurlar', (req, res) => {
    res.json({ success: true, lastUpdate: sonGuncelleme, data: globalKurlar });
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Zulam Multi-Source Backend ${PORT} portunda aktif!`);
});