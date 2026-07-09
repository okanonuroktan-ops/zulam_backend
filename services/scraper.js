// services/scraper.js
/*
  scraper.js - CollectAPI Veri Çekme Servisi

  Bu servis, CollectAPI üzerindeki serbestPiyasa endpoint'inden döviz ve
  kıymetli maden fiyatlarını çeker.

  Her varlık için ayrı API isteği yapılır. Dövizlerde base olarak para birimi,
  kıymetli madenlerde ise CollectAPI'nin desteklediği gold base değerleri
  kullanılır.

  Gelen API verisi buildZulamRow fonksiyonu ile Zulam uygulamasının beklediği
  ortak satır formatına dönüştürülür.

  Üretilen her satırda:
  - assetCode
  - assetName
  - sourceName
  - buyPrice
  - sellPrice
  - spreadAmount
  - spreadPercent
  - category

  bilgileri bulunur.

  API limitlerini zorlamamak için istekler arasında REQUEST_DELAY_MS kadar
  bekleme yapılır.
*/

const axios = require('axios');

const delay = ms => new Promise(res => setTimeout(res, ms));

/*
    Güvenlik notu:
    API token'ını doğrudan kod içinde tutmak yerine .env üzerinden kullanman daha güvenli olur.

    .env:
    COLLECT_API_TOKEN=apikey SENIN_YENI_TOKENIN
*/
const COLLECT_API_TOKEN = process.env.COLLECT_API_TOKEN || 'apikey 54OWZKgEzaUUT54rqfpAf2:4mo2qETj2DFPrNXgZW4zwH'; // CollectAPI token'ınızı buraya ekleyin

const REQUEST_DELAY_MS = 1500;

const SERBEST_PIYASA_URL = 'https://api.collectapi.com/economy/serbestPiyasa';

/*
    Dövizler:
    USD ve EUR ayrı ayrı çekiliyor.
    Önceki kodda sadece USD çekilip EUR da aynı veriyle dolduruluyordu.
*/
const CURRENCY_ASSETS = [
    
    { assetCode: 'USD', assetName: 'Dolar', base: 'USD', category: 'Döviz', priceDecimals: 4 },
    { assetCode: 'EUR', assetName: 'Euro', base: 'EUR', category: 'Döviz', priceDecimals: 4 },
    { assetCode: 'GBP', assetName: 'İngiliz Sterlini', base: 'GBP', category: 'Döviz', priceDecimals: 4 },
    { assetCode: 'CHF', assetName: 'İsviçre Frangı', base: 'CHF', category: 'Döviz', priceDecimals: 4 },
    { assetCode: 'SAR', assetName: 'Suudi Arabistan Riyali', base: 'SAR', category: 'Döviz', priceDecimals: 4 },
    { assetCode: 'AED', assetName: 'BAE Dirhemi', base: 'AED', category: 'Döviz', priceDecimals: 4 }
    
];

/*
    GoldSymbols çıktısından gelen key değerleri:
    Bu key'ler doğrudan base parametresine yazılıyor.

    Örnek:
    /economy/serbestPiyasa?type=gold&base=gram-altin
    /economy/serbestPiyasa?type=gold&base=gumus
*/
const METAL_ASSETS = [
    {
        assetCode: 'ONS_ALTIN',
        assetName: 'Ons Altın',
        base: 'ons',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'XAU',
        assetName: 'Gram Altın',
        base: 'gram-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'CEYREK_ALTIN',
        assetName: 'Çeyrek Altın',
        base: 'ceyrek-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'YARIM_ALTIN',
        assetName: 'Yarım Altın',
        base: 'yarim-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'TAM_ALTIN',
        assetName: 'Tam Altın',
        base: 'tam-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'ATA_ALTIN',
        assetName: 'Ata Altın',
        base: 'ata-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: '14_AYAR_ALTIN',
        assetName: '14 Ayar Bilezik',
        base: '14-ayar-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: '18_AYAR_ALTIN',
        assetName: '18 Ayar Bilezik',
        base: '18-ayar-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: '22_AYAR_BILEZIK',
        assetName: '22 Ayar Bilezik',
        base: '22-ayar-bilezik',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'IKIBUCUK_ALTIN',
        assetName: 'İkibuçuk Altın',
        base: 'ikibucuk-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'GREMSE_ALTIN',
        assetName: 'Gremse Altın',
        base: 'gremse-altin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'XAG',
        assetName: 'Gram Gümüş',
        base: 'gumus',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'XPT',
        assetName: 'Gram Platin',
        base: 'gram-platin',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    },
    {
        assetCode: 'XPD',
        assetName: 'Gram Paladyum',
        base: 'gram-paladyum',
        category: 'Kıymetli Madenler',
        priceDecimals: 2
    }
];

async function fetchFromCollectApi(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                authorization: COLLECT_API_TOKEN,
                'content-type': 'application/json'
            },
            timeout: 15000
        });

        if (response.data && response.data.success && Array.isArray(response.data.result)) {
            return response.data.result;
        }

        console.warn(`⚠️ CollectAPI beklenen formatta veri döndürmedi: ${url}`);
        return [];
    } catch (error) {
        const status = error.response?.status;
        const apiData = error.response?.data;

        console.error(
            `CollectAPI Hatası (${url}):`,
            status ? `Status ${status}` : error.message,
            apiData ? JSON.stringify(apiData) : ''
        );

        return [];
    }
}

function createSerbestPiyasaUrl(asset, type = null) {
    const params = new URLSearchParams();

    if (type) {
        params.set('type', type);
    }

    params.set('base', asset.base);

    return `${SERBEST_PIYASA_URL}?${params.toString()}`;
}

function parsePrice(value) {
    if (value === undefined || value === null) return 0;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : 0;
    }

    let str = value.toString().trim();

    if (!str) return 0;

    str = str.replace(/\s/g, '');
    str = str.replace(/[^\d,.-]/g, '');

    const hasComma = str.includes(',');
    const hasDot = str.includes('.');

    if (hasComma && hasDot) {
        const lastCommaIndex = str.lastIndexOf(',');
        const lastDotIndex = str.lastIndexOf('.');

        if (lastCommaIndex > lastDotIndex) {
            // Örnek: 4.250,35
            str = str.replace(/\./g, '').replace(',', '.');
        } else {
            // Örnek: 4,250.35
            str = str.replace(/,/g, '');
        }
    } else if (hasComma) {
        // Örnek: 46,8100
        str = str.replace(',', '.');
    }

    const numberValue = Number(str);

    return Number.isFinite(numberValue) ? numberValue : 0;
}

function formatNumber(value, decimals) {
    return Number(value).toFixed(decimals).replace('.', ',');
}

function buildZulamRow(asset, item) {
    const sourceName =
        item.bankName ||
        item.sourceName ||
        item.source ||
        item.bankSlug ||
        item.name ||
        'Serbest Piyasa';

    const buyRaw = parsePrice(
        item.buying ??
        item.buy ??
        item.alis ??
        item.buyingStr
    );

    const sellRaw = parsePrice(
        item.selling ??
        item.sell ??
        item.satis ??
        item.sellingStr
    );

    if (buyRaw <= 0) {
        return null;
    }

    const finalSellRaw = sellRaw > 0 ? sellRaw : buyRaw;
    const spread = Math.abs(finalSellRaw - buyRaw);
    const spreadPct = buyRaw > 0 ? (spread / buyRaw) * 100 : 0;

    return {
        assetCode: asset.assetCode,
        assetName: asset.assetName,
        sourceName: sourceName,
        buyPrice: formatNumber(buyRaw, asset.priceDecimals),
        sellPrice: formatNumber(finalSellRaw, asset.priceDecimals),
        spreadAmount: formatNumber(spread, 2),
        spreadPercent: `%${formatNumber(spreadPct, 2)}`,
        category: asset.category
    };
}

async function fetchAssetRows(asset, type = null) {
    const url = createSerbestPiyasaUrl(asset, type);

    console.log(`➡️ ${asset.assetName} verisi çekiliyor: base=${asset.base}`);

    const apiResult = await fetchFromCollectApi(url);
    const rows = [];

    for (const item of apiResult) {
        const row = buildZulamRow(asset, item);

        if (row) {
            rows.push(row);
        }
    }

    console.log(`✅ ${asset.assetName}: ${rows.length} adet kaynak verisi alındı.`);

    return rows;
}

async function getDovizComData() {
    console.log('🔍 CollectAPI üzerinden döviz ve kıymetli maden verileri çekiliyor...');

    let totalRawData = [];

    const allRequests = [
        ...CURRENCY_ASSETS.map(asset => ({
            asset,
            type: null
        })),
        ...METAL_ASSETS.map(asset => ({
            asset,
            type: 'gold'
        }))
    ];

    console.log(`ℹ️ Bu güncellemede toplam ${allRequests.length} serbestPiyasa isteği yapılacak.`);

    for (let i = 0; i < allRequests.length; i++) {
        const request = allRequests[i];

        const rows = await fetchAssetRows(request.asset, request.type);
        totalRawData.push(...rows);

        if (i < allRequests.length - 1) {
            await delay(REQUEST_DELAY_MS);
        }
    }

    if (totalRawData.length === 0) {
        throw new Error("CollectAPI'den veri alınamadı.");
    }

    const assetCounts = totalRawData.reduce((acc, item) => {
        acc[item.assetCode] = (acc[item.assetCode] || 0) + 1;
        return acc;
    }, {});

    console.log('📊 Çekilen veri dağılımı:', assetCounts);

    return totalRawData;
}

module.exports = { getDovizComData };