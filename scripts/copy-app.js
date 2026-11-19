const fs = require('fs');
const path = require('path');

// 1. Copy app/ UI assets
const srcApp = path.join(__dirname, '../app');
const destApp = path.join(__dirname, '../gen/srv/app');
if (!fs.existsSync(destApp)) {
    fs.mkdirSync(destApp, { recursive: true });
}
fs.cpSync(srcApp, destApp, { recursive: true });
console.log('Copied app/ to gen/srv/app/ successfully!');

// 2. Copy config.json
const configSrc = path.join(__dirname, '../config.json');
const configDest = path.join(__dirname, '../gen/srv/config.json');
if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest);
    console.log('Copied config.json to gen/srv/config.json successfully!');
}

// 3. Copy db.sqlite if present
const dbSrc = path.join(__dirname, '../db.sqlite');
const dbDest = path.join(__dirname, '../gen/srv/db.sqlite');
if (fs.existsSync(dbSrc)) {
    fs.copyFileSync(dbSrc, dbDest);
    console.log('Copied db.sqlite to gen/srv/db.sqlite successfully!');
}

// 4. Ensure live-calc-views.json is in gen/srv/srv/fixtures/
const liveCalcSrc = path.join(__dirname, '../srv/fixtures/live-calc-views.json');
const liveCalcDestDir = path.join(__dirname, '../gen/srv/srv/fixtures');
const liveCalcDest = path.join(liveCalcDestDir, 'live-calc-views.json');
if (fs.existsSync(liveCalcSrc)) {
    if (!fs.existsSync(liveCalcDestDir)) {
        fs.mkdirSync(liveCalcDestDir, { recursive: true });
    }
    fs.copyFileSync(liveCalcSrc, liveCalcDest);
    console.log('Copied live-calc-views.json to gen/srv/srv/fixtures/live-calc-views.json successfully!');
}

// 5. Ensure table-columns-catalog.json is in gen/srv/srv/fixtures/
const tableCatalogSrc = path.join(__dirname, '../srv/fixtures/table-columns-catalog.json');
const tableCatalogDest = path.join(liveCalcDestDir, 'table-columns-catalog.json');
if (fs.existsSync(tableCatalogSrc)) {
    if (!fs.existsSync(liveCalcDestDir)) {
        fs.mkdirSync(liveCalcDestDir, { recursive: true });
    }
    fs.copyFileSync(tableCatalogSrc, tableCatalogDest);
    console.log('Copied table-columns-catalog.json to gen/srv/srv/fixtures/table-columns-catalog.json successfully!');
}

// 6. Ensure live-cds-views.json is in gen/srv/srv/fixtures/
const liveCdsSrc = path.join(__dirname, '../srv/fixtures/live-cds-views.json');
const liveCdsDest = path.join(liveCalcDestDir, 'live-cds-views.json');
if (fs.existsSync(liveCdsSrc)) {
    if (!fs.existsSync(liveCalcDestDir)) {
        fs.mkdirSync(liveCalcDestDir, { recursive: true });
    }
    fs.copyFileSync(liveCdsSrc, liveCdsDest);
    console.log('Copied live-cds-views.json to gen/srv/srv/fixtures/live-cds-views.json successfully!');
}
