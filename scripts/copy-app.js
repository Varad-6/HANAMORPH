const fs = require('fs');
const path = require('path');

const srcApp = path.join(__dirname, '../app');
const destApp = path.join(__dirname, '../gen/srv/app');

if (!fs.existsSync(destApp)) {
    fs.mkdirSync(destApp, { recursive: true });
}

fs.cpSync(srcApp, destApp, { recursive: true });
console.log('Copied app/ to gen/srv/app/ successfully!');

const configSrc = path.join(__dirname, '../config.json');
const configDest = path.join(__dirname, '../gen/srv/config.json');
if (fs.existsSync(configSrc)) {
    fs.copyFileSync(configSrc, configDest);
    console.log('Copied config.json to gen/srv/config.json successfully!');
}
