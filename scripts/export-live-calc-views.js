const fs = require('fs');
const path = require('path');
const hanaConnector = require('../srv/lib/hana-connector');

async function exportViews() {
    console.log('[Export] Fetching calculation views list from live HANA...');
    const views = await hanaConnector.listCalcViews();
    console.log(`[Export] Found ${views.length} calculation views.`);

    const exported = [];
    for (let i = 0; i < views.length; i++) {
        const v = views[i];
        try {
            const xml = await hanaConnector.getCalcViewXml(v.name);
            exported.push({
                name: v.name,
                type: 'CALC_VIEW',
                sqlViewName: v.sqlViewName || `_SYS_BIC."${v.packageOrSchema}/${v.name}"`,
                packageOrSchema: v.packageOrSchema || 'sap.hana.models',
                description: v.description || `HANA Calculation View: ${v.name}`,
                columnCount: v.columnCount || 0,
                hasAggregations: true,
                supportedStatus: 'SUPPORTED',
                xmlDefinition: xml || null
            });
            if ((i + 1) % 20 === 0 || i === views.length - 1) {
                console.log(`[Export] Processed ${i + 1}/${views.length} views...`);
            }
        } catch (e) {
            console.warn(`[Export] Failed for ${v.name}:`, e.message);
            exported.push({
                name: v.name,
                type: 'CALC_VIEW',
                sqlViewName: v.sqlViewName,
                packageOrSchema: v.packageOrSchema,
                description: v.description,
                columnCount: 0,
                hasAggregations: true,
                supportedStatus: 'SUPPORTED',
                xmlDefinition: null
            });
        }
    }

    const outPath = path.join(__dirname, '../srv/fixtures/live-calc-views.json');
    fs.writeFileSync(outPath, JSON.stringify(exported, null, 2), 'utf8');
    const sizeMb = (fs.statSync(outPath).size / 1024 / 1024).toFixed(2);
    console.log(`[Export] Successfully wrote ${exported.length} views to ${outPath} (${sizeMb} MB)`);
}

exportViews()
    .then(() => process.exit(0))
    .catch(err => {
        console.error('[Export Error]', err);
        process.exit(1);
    });
