// utils/dataFormatter.js

/**
 * Uygulamada gösterilecek kaynaklar.
 * Buraya sadece güvenilir / göstermek istediğin kaynakları ekle.
 *
 * Not:
 * İsimler API'den gelen sourceName ile aynı olmalı.
 */
/*
  dataFormatter.js - Zulam Veri Formatlama Yardımcısı

  Bu dosya, scraper tarafından üretilen ham fiyat satırlarını Flutter
  uygulamasının beklediği hiyerarşik yapıya dönüştürür.

  Çıktı üç ana gruptan oluşur:

  bySource:
  - Kaynak/platform adına göre fiyatları gruplar.
  - Örneğin Akbank, Kapalıçarşı, Kuveyt Türk gibi kaynakların sunduğu
    tüm varlık fiyatları burada listelenir.

  byAsset:
  - Varlık koduna göre fiyatları gruplar.
  - Örneğin USD, EUR, XAU gibi varlıkların tüm kaynaklardaki fiyatları
    burada listelenir.

  byCategory:
  - Döviz ve Kıymetli Madenler gibi kategorilere göre varlık kodlarını
    gruplar.

  Sadece ALLOWED_SOURCES içinde yer alan güvenilir/gösterilmesi istenen
  kaynaklar son çıktıya dahil edilir.
*/
const ALLOWED_SOURCES = [
    'Akbank',
    'Albaraka Türk',
    'Alternatif Bank',
    'Altınkaynak',
    'Anadolubank',
    'CEPTETEB',
    'Denizbank',
    'DestekBank',
    'Dünya Katılım',
    'Emlak Katılım',
    'Enpara',
    'Fibabanka',
    'Garanti BBVA',
    'Getirfinans',
    'Halkbank',
    'Harem',
    'Hayat Finans',
    'Hepsipay',
    'HSBC',
    'ING Bank',
    'İş Bankası',
    'Kapalıçarşı',
    'Kuveyt Türk',
    'Merkez Bankası',
    'Misyon Bank',
    'Odacı',
    'Odeabank',
    'Papara',
    'QNB Finansbank',
    'Şekerbank',
    'Türkiye Finans',
    'Vakıf Katılım',
    'Vakıfbank',
    'Yapıkredi',
    'Ziraat Bankası',
];

/**
 * Türkçe karakter / büyük küçük harf farkından etkilenmemek için normalize eder.
 */
function normalizeSourceName(value) {
    return value
        .toString()
        .trim()
        .toLocaleLowerCase('tr-TR')
        .replace(/\s+/g, ' ');
}

const NORMALIZED_ALLOWED_SOURCES = ALLOWED_SOURCES.map(normalizeSourceName);

function isAllowedSource(sourceName) {
    if (!sourceName) return false;

    const normalized = normalizeSourceName(sourceName);

    return NORMALIZED_ALLOWED_SOURCES.includes(normalized);
}

/**
 * Scraper'dan gelen ham veriyi Zulam uygulamasının beklediği
 * bySource, byAsset ve byCategory hiyerarşisine dönüştürür.
 */
function formatForZulam(rawData) {
    const bySource = {};
    const byAsset = {};
    const byCategory = {};

    if (!Array.isArray(rawData)) {
        return { bySource, byAsset, byCategory };
    }

    const filteredRawData = rawData.filter(item => {
        if (!item || !item.sourceName || !item.assetCode || !item.category) {
            return false;
        }

        return isAllowedSource(item.sourceName);
    });

    console.log(`🔎 Ham veri sayısı: ${rawData.length}`);
    console.log(`✅ Filtre sonrası veri sayısı: ${filteredRawData.length}`);
    console.log(`🚫 Çıkarılan veri sayısı: ${rawData.length - filteredRawData.length}`);

    filteredRawData.forEach(item => {
        // 1. Kaynağa göre grupla
        if (!bySource[item.sourceName]) {
            bySource[item.sourceName] = [];
        }
        bySource[item.sourceName].push(item);

        // 2. Varlığa göre grupla
        if (!byAsset[item.assetCode]) {
            byAsset[item.assetCode] = [];
        }
        byAsset[item.assetCode].push(item);

        // 3. Kategoriye göre varlık kodlarını dinamik oluştur
        if (!byCategory[item.category]) {
            byCategory[item.category] = [];
        }

        if (!byCategory[item.category].includes(item.assetCode)) {
            byCategory[item.category].push(item.assetCode);
        }
    });

    // 4. Kaynak içindeki verileri kategori ve varlık adına göre sırala
    Object.keys(bySource).forEach(sourceName => {
        bySource[sourceName].sort((a, b) => {
            if (a.category !== b.category) {
                return a.category.localeCompare(b.category, 'tr');
            }

            return a.assetName.localeCompare(b.assetName, 'tr');
        });
    });

    // 5. Varlık bazlı listeleri makasa göre sırala
    Object.keys(byAsset).forEach(code => {
        byAsset[code].sort((a, b) => {
            const spreadA =
                parseFloat(
                    a.spreadPercent
                        .toString()
                        .replace('%', '')
                        .replace(',', '.')
                ) || 0;

            const spreadB =
                parseFloat(
                    b.spreadPercent
                        .toString()
                        .replace('%', '')
                        .replace(',', '.')
                ) || 0;

            return spreadA - spreadB;
        });
    });

    // 6. Kategori içindeki varlıkları okunabilir sıraya koy
    Object.keys(byCategory).forEach(category => {
        byCategory[category].sort((a, b) => {
            const firstA = byAsset[a]?.[0];
            const firstB = byAsset[b]?.[0];

            const nameA = firstA?.assetName || a;
            const nameB = firstB?.assetName || b;

            return nameA.localeCompare(nameB, 'tr');
        });
    });

    return { bySource, byAsset, byCategory };
}

module.exports = { formatForZulam };