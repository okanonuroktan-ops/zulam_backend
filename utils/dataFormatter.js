// utils/dataFormatter.js

/**
 * Scraper'dan gelen ham veriyi Zulam uygulamasının beklediği 
 * bySource, byAsset ve byCategory hiyerarşisine dönüştürür.
 */
function formatForZulam(rawData) {
    const bySource = {};
    const byAsset = {};
    const byCategory = {
        "Döviz": ["USD", "EUR"],
        "Kıymetli Madenler": ["XAU", "XAG"]
    };

    if (!Array.isArray(rawData)) return { bySource, byAsset, byCategory };

    rawData.forEach(item => {
        // 1. Kaynağa Göre Grupla (Alfabetik Liste için)
        if (!bySource[item.sourceName]) {
            bySource[item.sourceName] = [];
        }
        bySource[item.sourceName].push(item);

        // 2. Varlığa Göre Grupla (Banka Sıralaması için)
        // Dashboard 'USD' veya 'XAU' gibi kodlar üzerinden okuma yapar.
        if (!byAsset[item.assetCode]) {
            byAsset[item.assetCode] = [];
        }
        byAsset[item.assetCode].push(item);
    });

    // 3. Makas (Spread) Sıralaması: En uygun fiyatlı (makası en düşük) olanı en üste al
    Object.keys(byAsset).forEach(code => {
        byAsset[code].sort((a, b) => {
            const spreadA = parseFloat(a.spreadPercent.replace('%', '').replace(',', '.')) || 0;
            const spreadB = parseFloat(b.spreadPercent.replace('%', '').replace(',', '.')) || 0;
            return spreadA - spreadB;
        });
    });

    return { bySource, byAsset, byCategory };
}

// KRİTİK: Dışa aktarma objesi
module.exports = { formatForZulam };