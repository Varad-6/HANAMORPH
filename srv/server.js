const cds = require('@sap/cds');
const express = require('express');
const path = require('path');

// Auto-deploy model to sqlite on service connect if tables don't exist
cds.on('served', async () => {
    try {
        const db = await cds.connect.to('db');
        if (db && db.kind === 'sqlite') {
            await cds.deploy('db').to(db);
            console.log('[HanaMorph] Initialized SQLite schema tables successfully.');
        }
    } catch (e) {
        console.warn('[HanaMorph] Auto-deploy check notice:', e.message);
    }
});

cds.on('bootstrap', (app) => {
    // Serve static frontend assets from app/
    const appDir = path.resolve(__dirname, '..', 'app');
    app.use(express.static(appDir));
    app.use('/app', express.static(appDir));
    
    // Explicit route for root redirect or index
    app.get('/', (req, res, next) => {
        res.sendFile(path.join(appDir, 'index.html'), (err) => {
            if (err) next();
        });
    });
});

module.exports = cds.server;
