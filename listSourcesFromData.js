// Gelen veride hangi kaynakları kullanacağımızı belirlemek için bir fonksiyon
const fs = require('fs');

const filePath = './data.json';

if (!fs.existsSync(filePath)) {
    console.log('data.json bulunamadı.');
    process.exit(1);
}

const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));

const sources = Object.keys(json.data?.bySource || {}).sort((a, b) =>
    a.localeCompare(b, 'tr')
);

console.log(`Toplam kaynak sayısı: ${sources.length}\n`);

sources.forEach((source, index) => {
    const count = json.data.bySource[source]?.length || 0;
    console.log(`${index + 1}. ${source} (${count} veri)`);
});