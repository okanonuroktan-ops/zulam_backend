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

const { getDovizComData } = require('./services/scraper');
const { formatForZulam } = require('./utils/dataFormatter');

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const DATA_FILE_PATH = path.join(__dirname, 'data.json');
const REFRESH_CRON = process.env.REFRESH_CRON || '*/60 * * * *';
const AUTO_REFRESH_ON_START = process.env.AUTO_REFRESH_ON_START !== 'false';

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
    try {
        fs.writeFileSync(
            DATA_FILE_PATH,
            JSON.stringify(cacheData, null, 2),
            'utf8'
        );

        console.log('💾 Veriler data.json dosyasına yazıldı.');
    } catch (error) {
        console.error('❌ data.json yazılamadı:', error.message);
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

        const rawData = await getDovizComData();

        if (!Array.isArray(rawData) || rawData.length === 0) {
            throw new Error('CollectAPI boş veri döndürdü.');
        }

        console.log(
            `✅ API'den toplam ${rawData.length} adet ham veri satırı çekildi.`
        );

        const formatted = formatForZulam(rawData);

        const newCache = {
            success: true,
            source: 'live-api',
            lastUpdate: getCurrentIsoDate(),
            lastUpdateDisplay: getCurrentDisplayDate(),
            isFallbackMode: false,
            data: formatted,
        };

        zulamMemoryCache = newCache;
        writeCacheToFile(newCache);

        console.log('✅ Veri güncelleme başarıyla tamamlandı.');

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

cron.schedule(REFRESH_CRON, refreshData);

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Zulam API çalışıyor: http://localhost:${PORT}`);
    console.log(`🩺 Health check: http://localhost:${PORT}/health`);
    console.log(`📊 Kur endpoint: http://localhost:${PORT}/api/kurlar`);
    console.log(`⏱️ Cron: ${REFRESH_CRON}`);
});