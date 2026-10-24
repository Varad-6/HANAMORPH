const fs = require('fs');
const path = require('path');

class ConfigManager {
    constructor() {
        this.config = this._loadConfig();
    }

    _loadConfig() {
        const configPath = path.join(__dirname, '../../config.json');
        let fileConfig = {};
        if (fs.existsSync(configPath)) {
            try {
                fileConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            } catch (e) {
                console.error('[Config] Failed to parse config.json:', e.message);
            }
        }

        // Environment variables take precedence over config.json
        const useMockEnv = process.env.USE_MOCK;
        const USE_MOCK = useMockEnv !== undefined 
            ? (useMockEnv === 'true' || useMockEnv === '1')
            : (fileConfig.USE_MOCK !== undefined ? fileConfig.USE_MOCK : true);

        return {
            USE_MOCK,
            hana: {
                host: process.env.HANA_HOST || fileConfig.hana?.host || '',
                port: process.env.HANA_PORT || fileConfig.hana?.port || 443,
                user: process.env.HANA_USER || fileConfig.hana?.user || '',
                password: process.env.HANA_PASSWORD || fileConfig.hana?.password || '',
                destinationName: process.env.HANA_DESTINATION || fileConfig.hana?.destinationName || 'HANA_ONPREM_DEST',
                encrypt: fileConfig.hana?.encrypt !== undefined ? fileConfig.hana.encrypt : true,
                sslValidateCertificate: fileConfig.hana?.sslValidateCertificate || false
            },
            datasphere: {
                defaultSpace: process.env.DATASPHERE_SPACE || fileConfig.datasphere?.defaultSpace || 'MIGRATION_SPACE'
            }
        };
    }

    get USE_MOCK() {
        return this.config.USE_MOCK;
    }

    get hana() {
        return this.config.hana;
    }

    get datasphere() {
        return this.config.datasphere;
    }
}

module.exports = new ConfigManager();
