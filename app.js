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
*/
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const cron = require('node-cron');

// Sadece CollectAPI üzerinden çalışan ana scraper
const { getDovizComData } = require('./services/scraper'); 
// Eski formata çeviren kendi fonksiyonun (BUNA DOKUNMADIK)
const { formatForZulam } = require('./utils/dataFormatter');

const app = express();
app.use(cors());

let zulamMemoryCache = null;

async function refreshData() {
    console.log(`\n--- 🔄 Veri Güncelleme Tetiklendi (${new Date().toLocaleTimeString()}) ---`);
    let rawData = [];

    try {
        console.log("🌐 CollectAPI üzerinden veri çekiliyor...");
        rawData = await getDovizComData();
        console.log(`✅ API'den toplam ${rawData.length} adet ham veri satırı başarıyla çekildi.`);

        // Veriyi formatla (Senin eski formatter'ın bu ham veriyi bySource, byAsset, byCategory olarak ayrıştıracak)
        const formatted = formatForZulam(rawData);
        
        // Belleğe yaz
        zulamMemoryCache = {
            success: true,
            lastUpdate: new Date().toLocaleString('tr-TR'),
            isFallbackMode: false, 
            data: formatted
        };

        // Json dosyasına yaz (Flutter uygulaması burayı okuyor olabilir veya doğrudan endpoint'ten alabilir)
        fs.writeFileSync('./data.json', JSON.stringify(zulamMemoryCache, null, 2));
        console.log(`💾 Veriler başarıyla formatlanıp data.json dosyasına yazıldı.`);
        
    } catch (error) {
        console.error("❌ Veri Çekme veya Formatlama Hatası:", error.message);
        // Hata anında memoryCache sıfırlanmasın, eski veriyle devam etsin
    }
}

// Uygulama başlarken ilk veriyi çek
refreshData();

// Her 15 dakikada bir veriyi güncelle (CollectAPI limiti için ideal)
cron.schedule('*/15 * * * *', refreshData);

// API Endpoint (Flutter uygulamasının bağlandığı yer)
app.get('/api/kurlar', (req, res) => {
    if (!zulamMemoryCache) {
        // Eğer sunucu yeni kalktıysa ve ilk cache oluşmadıysa varsa eski data.json'ı oku
        try {
            if (fs.existsSync('./data.json')) {
                const oldData = fs.readFileSync('./data.json', 'utf8');
                return res.json(JSON.parse(oldData));
            }
        } catch(e) {}

        return res.status(503).json({ success: false, message: "Veriler henüz hazır değil, lütfen bekleyin." });
    }
    res.json(zulamMemoryCache);
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Zulam API: http://localhost:${PORT}`);
});