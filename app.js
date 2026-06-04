// app.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const { getDovizComData } = require('./services/scraper'); // Dosya yoluna dikkat
const { formatForZulam } = require('./utils/dataFormatter'); // Dosya yoluna dikkat

const app = express();
app.use(cors());

let zulamMemoryCache = null;

async function refreshData() {
    console.log(`--- 🔄 Veri Güncelleniyor (${new Date().toLocaleTimeString()}) ---`);
    try {
        // 1. Veriyi Doviz.com'dan çek
        const rawData = await getDovizComData(); 
        
        // 2. Veriyi formatla (Hata aldığın satır burasıydı)
        const formatted = formatForZulam(rawData);
        
        // 3. Belleğe yaz
        zulamMemoryCache = {
            success: true,
            lastUpdate: new Date().toLocaleString('tr-TR'),
            data: formatted
        };

        // 4. Yedek dosyaya yaz
        fs.writeFileSync('./data.json', JSON.stringify(zulamMemoryCache, null, 2));
        console.log("✅ Veriler başarıyla tazelendi ve paketlendi.");
    } catch (error) {
        console.error("❌ Güncelleme hatası:", error.message);
    }
}

// Uygulama başlarken veriyi çek
refreshData();

// API Endpoint
app.get('/api/kurlar', (req, res) => {
    if (!zulamMemoryCache) {
        return res.status(503).json({ success: false, message: "Veriler henüz hazır değil" });
    }
    res.json(zulamMemoryCache);
});

const PORT = 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Zulam API: http://localhost:${PORT}`);
});