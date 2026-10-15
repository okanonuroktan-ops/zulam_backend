// app.js

/*
  app.js - Zulam Backend API Sunucusu

  Bu dosya Express tabanlı Zulam API sunucusunu başlatır.

  Temel görevleri:
  - CollectAPI üzerinden fiyat verilerini çekmek
  - Ham veriyi Zulam formatına dönüştürmek
  - Güncel veriyi bellekte cache olarak tutmak
  - Veriyi data.json dosyasına yedeklemek
  - Flutter uygulaması için /api/kurlar endpoint'ini sunmak
  - node-cron ile verileri belirli aralıklarla otomatik güncellemek

  Sunucu ilk açıldığında refreshData çalıştırılır.
  Daha sonra her 15 dakikada bir veri yenilenir.

  API geçici olarak veri çekemezse memory cache korunur.
  Eğer memory cache henüz oluşmadıysa data.json dosyasından eski veri
  okunmaya çalışılır.

  .env dosyasını yükler
data.json yolunu güvenli kullanır
/health endpoint ekler
Aynı anda iki refresh çalışmasını engeller
API başarısız olursa eski cache’i korur
Memory cache yoksa data.json’dan okur
/api/kurlar endpointini daha stabil yapar
Cron ayarını .env’den alır

*/

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const {
    getMarketData,
    MARKET_ASSET_CODES,
} = require('./services/scraper');
const { formatForZulam } = require('./utils/dataFormatter');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const configuredDataPath = process.env.DATA_FILE_PATH?.trim();

const DATA_FILE_PATH = configuredDataPath
    ? path.resolve(__dirname, configuredDataPath)
    : path.join(__dirname, 'data.json');
const REFRESH_CRON = process.env.REFRESH_CRON || '*/60 * * * *';
const AUTO_REFRESH_ON_START = process.env.AUTO_REFRESH_ON_START !== 'false';
const AUTO_REFRESH_ENABLED =
    process.env.AUTO_REFRESH_ENABLED !== 'false';

let zulamMemoryCache = null;
let isRefreshing = false;

function getCurrentIsoDate() {
    return new Date().toISOString();
}

function getCurrentDisplayDate() {
    return new Date().toLocaleString('tr-TR', {
        timeZone: 'Europe/Istanbul',
    });
}

function readCacheFromFile() {
    try {
        if (!fs.existsSync(DATA_FILE_PATH)) {
            return null;
        }

        const fileContent = fs.readFileSync(DATA_FILE_PATH, 'utf8');

        if (!fileContent.trim()) {
            return null;
        }

        const parsedData = JSON.parse(fileContent);

        if (!parsedData || parsedData.success !== true || !parsedData.data) {
            return null;
        }

        return parsedData;
    } catch (error) {
        console.error('❌ data.json okunamadı:', error.message);
        return null;
    }
}

function writeCacheToFile(cacheData) {
    const tempFilePath = `${DATA_FILE_PATH}.tmp`;

    try {
                fs.mkdirSync(path.dirname(DATA_FILE_PATH), {
            recursive: true,
        });
        
        fs.writeFileSync(
            tempFilePath,
            JSON.stringify(cacheData, null, 2),
            'utf8'
        );

        fs.renameSync(tempFilePath, DATA_FILE_PATH);

        console.log('💾 Fiyat önbelleği dosyaya kaydedildi.');
    } catch (error) {
        console.error(
            '❌ Fiyat önbelleği dosyaya kaydedilemedi:',
            error.message
        );

        try {
            if (fs.existsSync(tempFilePath)) {
                fs.unlinkSync(tempFilePath);
            }
        } catch (cleanupError) {
            console.warn(
                '⚠️ Geçici önbellek dosyası temizlenemedi:',
                cleanupError.message
            );
        }
    }
}

function loadInitialCache() {
    const fileCache = readCacheFromFile();

    if (fileCache) {
        zulamMemoryCache = {
            ...fileCache,
            isFallbackMode: true,
            source: 'file-cache',
        };

        console.log('📦 data.json üzerinden başlangıç cache yüklendi.');
        return;
    }

    console.log('ℹ️ Başlangıçta kullanılabilir data.json cache bulunamadı.');
}

function buildNextCache(rawData, previousCache) {
    const freshData = formatForZulam(rawData);
    const freshRows = Object.values(freshData.byAsset).flat();

    // Kullanılabilir yeni veri yoksa mevcut cache değiştirilmez.
    if (freshRows.length === 0) {
        throw new Error(
            'Filtreleme sonrası kullanılabilir fiyat bulunamadı.'
        );
    }

    const now = getCurrentIsoDate();

    const keyFor = row =>
        JSON.stringify([row.assetCode, row.sourceName]);

    const merged = new Map();

    // Yeni gelen fiyatlar önceliklidir.
    for (const row of freshRows) {
        merged.set(keyFor(row), {
            ...row,
            updatedAt: now,
            isStale: false,
        });
    }

    const oldByAsset = previousCache?.data?.byAsset || {};

    // Bu yenilemede gelmeyen varlık/kaynak kayıtlarını koru.
    for (const rows of Object.values(oldByAsset)) {
        if (!Array.isArray(rows)) continue;

        for (const row of rows) {
            if (!row?.assetCode || !row.sourceName) continue;

            const key = keyFor(row);

            if (merged.has(key)) continue;

            merged.set(key, {
                ...row,
                updatedAt:
                    row.updatedAt ||
                    previousCache.lastUpdate ||
                    null,
                isStale: true,
            });
        }
    }

    // Kaynak filtresi ve sıralama birleşmiş veriye de uygulanır.
    const data = formatForZulam(Array.from(merged.values()));
    const finalRows = Object.values(data.byAsset).flat();

    const staleRecords = finalRows
        .filter(row => row.isStale)
        .map(row => ({
            assetCode: row.assetCode,
            sourceName: row.sourceName,
            updatedAt: row.updatedAt,
        }));

    // Yeni veya eski hiçbir fiyatı bulunmayan varlıklar.
    const missingAssetCodes = MARKET_ASSET_CODES.filter(
        code => !data.byAsset[code]?.length
    );

    // Bu yenilemede yeni fiyatı gelmeyen varlıklar.
    const incompleteAssetCodes = MARKET_ASSET_CODES.filter(
        code => !freshData.byAsset[code]?.length
    );

    const isFallbackMode =
        staleRecords.length > 0 ||
        incompleteAssetCodes.length > 0;

    return {
        success: true,
        source: isFallbackMode ? 'mixed-cache' : 'live-api',

        // Kısmi yenilemede tüm veri yeniymiş gibi tarih değiştirme.
        lastUpdate: isFallbackMode
            ? (previousCache?.lastUpdate || now)
            : now,

        lastUpdateDisplay: isFallbackMode
            ? (
                previousCache?.lastUpdateDisplay ||
                getCurrentDisplayDate()
            )
            : getCurrentDisplayDate(),

        lastRefresh: now,
        isFallbackMode,
        incompleteAssetCodes,
        missingAssetCodes,
        staleRecords,
        data,
    };
}

async function refreshData() {
    if (isRefreshing) {
        console.log('⏳ Refresh zaten devam ediyor, yeni istek atlanıyor.');
        return zulamMemoryCache;
    }

    isRefreshing = true;

    console.log(
        `\n--- 🔄 Veri Güncelleme Tetiklendi (${getCurrentDisplayDate()}) ---`
    );

    try {
        console.log('🌐 CollectAPI üzerinden veri çekiliyor...');

const rawData = await getMarketData();

        if (!Array.isArray(rawData) || rawData.length === 0) {
            throw new Error('CollectAPI boş veri döndürdü.');
        }

        console.log(
            `✅ API'den toplam ${rawData.length} adet ham veri satırı çekildi.`
        );

        const previousCache = zulamMemoryCache || readCacheFromFile();
const newCache = buildNextCache(rawData, previousCache);

        zulamMemoryCache = newCache;
        writeCacheToFile(newCache);

        if (newCache.isFallbackMode) {
    console.warn(
        '⚠️ Kısmi yenileme: eksik fiyatlar için eski kayıtlar korundu.',
        {
            incompleteAssetCodes: newCache.incompleteAssetCodes,
            missingAssetCodes: newCache.missingAssetCodes,
            staleRecordCount: newCache.staleRecords.length,
        }
    );
} else {
    console.log('✅ Veri güncelleme başarıyla tamamlandı.');
}

        return newCache;
    } catch (error) {
        console.error('❌ Veri çekme veya formatlama hatası:', error.message);

        if (zulamMemoryCache) {
            zulamMemoryCache = {
                ...zulamMemoryCache,
                source: zulamMemoryCache.source || 'memory-cache',
                isFallbackMode: true,
                fallbackReason: error.message,
            };

            console.log('⚠️ Eski memory cache korunarak devam ediliyor.');
            return zulamMemoryCache;
        }

        const fileCache = readCacheFromFile();

        if (fileCache) {
            zulamMemoryCache = {
                ...fileCache,
                source: 'file-cache',
                isFallbackMode: true,
                fallbackReason: error.message,
            };

            console.log('⚠️ API başarısız oldu, data.json cache kullanılıyor.');
            return zulamMemoryCache;
        }

        console.log('❌ Kullanılabilir cache bulunamadı.');
        return null;
    } finally {
        isRefreshing = false;
    }
}

app.get('/health', (req, res) => {
    res.json({
        success: true,
        status: 'ok',
        service: 'zulam-market-api',
        isRefreshing,
        hasMemoryCache: Boolean(zulamMemoryCache),
        time: getCurrentIsoDate(),
    });
});

app.get('/api/kurlar', async (req, res) => {
    if (zulamMemoryCache) {
        return res.json(zulamMemoryCache);
    }

    const fileCache = readCacheFromFile();

    if (fileCache) {
        zulamMemoryCache = {
            ...fileCache,
            source: 'file-cache',
            isFallbackMode: true,
        };

        return res.json(zulamMemoryCache);
    }

    return res.status(503).json({
        success: false,
        message: 'Veriler henüz hazır değil. Lütfen kısa süre sonra tekrar deneyin.',
        data: null,
    });
});

app.post('/api/kurlar/refresh', async (req, res) => {
    const adminToken = process.env.ADMIN_REFRESH_TOKEN?.trim();

    if (!adminToken) {
        return res.status(503).json({
            success: false,
            message: 'Manuel yenileme devre dışı.',
        });
    }

    if (req.get('Authorization') !== `Bearer ${adminToken}`) {
        return res.status(401).json({
            success: false,
            message: 'Yetkisiz erişim.',
        });
    }
    const refreshedData = await refreshData();

    if (!refreshedData) {
        return res.status(503).json({
            success: false,
            message: 'Veri güncellenemedi ve kullanılabilir cache bulunamadı.',
            data: null,
        });
    }

    return res.json(refreshedData);
});

loadInitialCache();

if (AUTO_REFRESH_ON_START) {
    refreshData();
} else {
    console.log('ℹ️ AUTO_REFRESH_ON_START=false olduğu için başlangıç refresh yapılmadı.');
}

if (AUTO_REFRESH_ENABLED) {
    if (!cron.validate(REFRESH_CRON)) {
        throw new Error('REFRESH_CRON geçersiz.');
    }

    cron.schedule(REFRESH_CRON, refreshData);

    console.log(`⏱️ Otomatik yenileme açık: ${REFRESH_CRON}`);
} else {
    console.log('ℹ️ Otomatik yenileme kapalı.');
}

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Zulam API çalışıyor: http://localhost:${PORT}`);
    console.log(`🩺 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Kur endpoint: http://localhost:${PORT}/api/kurlar`);
    console.log(`⏱️ Cron: ${REFRESH_CRON}`);
});