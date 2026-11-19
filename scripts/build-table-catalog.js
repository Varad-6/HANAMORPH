const fs = require('fs');
const path = require('path');
const hanaConnector = require('../srv/lib/hana-connector');
const extractService = require('../srv/lib/extract-service');

async function buildTableCatalog() {
    console.log('[TableCatalog] Connecting to HANA...');
    await hanaConnector.ensureConnected();

    const liveCalcPath = path.join(__dirname, '../srv/fixtures/live-calc-views.json');
    const liveViews = JSON.parse(fs.readFileSync(liveCalcPath, 'utf8'));

    // 1. Collect all referenced tables and data sources across all 153 calc views
    const allTableNames = new Set();
    for (const v of liveViews) {
        try {
            const m = await extractService.extractCalc(v.name);
            (m.sources || []).forEach(s => {
                if (s.tableName) allTableNames.add(s.tableName);
            });
            (m.nodeHierarchy || []).forEach(n => {
                (n.inputs || []).forEach(i => {
                    const clean = i.replace(/.*?\$\$\$\$/g, '').replace(/\$\$/g, '').replace(/^.*::/, '').replace(/^.*[.\/]/, '').trim();
                    if (!m.nodeHierarchy.some(x => x.id === i || x.id === clean)) {
                        allTableNames.add(clean);
                    }
                });
            });
        } catch (e) {}
    }

    console.log(`[TableCatalog] Total unique table/source names: ${allTableNames.size}`);

    const tableCatalog = {};
    const tableList = Array.from(allTableNames);

    // Query in batches from SYS.TABLE_COLUMNS
    const BATCH_SIZE = 40;
    for (let i = 0; i < tableList.length; i += BATCH_SIZE) {
        const batch = tableList.slice(i, i + BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        const sql = `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE_NAME, LENGTH, SCALE, POSITION 
                     FROM SYS.TABLE_COLUMNS 
                     WHERE TABLE_NAME IN (${placeholders}) 
                     ORDER BY TABLE_NAME, POSITION`;
        try {
            const rows = await hanaConnector._execQuery(sql, batch);
            for (const r of rows) {
                if (!tableCatalog[r.TABLE_NAME]) tableCatalog[r.TABLE_NAME] = {};
                tableCatalog[r.TABLE_NAME][r.COLUMN_NAME] = {
                    dataType: mapDataType(r.DATA_TYPE_NAME, r.LENGTH, r.SCALE),
                    length: r.LENGTH,
                    scale: r.SCALE,
                    isKey: r.COLUMN_NAME === 'MANDT' || r.COLUMN_NAME.endsWith('_ID') || r.COLUMN_NAME.endsWith('NR')
                };
            }
        } catch (err) {
            console.warn('[TableCatalog] Batch query error:', err.message);
        }
    }

    console.log(`[TableCatalog] Populated ${Object.keys(tableCatalog).length} tables from SYS.TABLE_COLUMNS.`);

    // 2. Also check calculation views that are used as DataSources (like CashLinefnt)
    for (const name of tableList) {
        if (!tableCatalog[name] || Object.keys(tableCatalog[name]).length === 0) {
            try {
                const model = await extractService.extractCalc(name);
                if (model && model.columns && model.columns.length > 0) {
                    tableCatalog[name] = {};
                    for (const col of model.columns) {
                        tableCatalog[name][col.name] = {
                            dataType: col.dataType || 'cds.String(40)',
                            length: 40,
                            isKey: col.isKey || col.name === 'MANDT'
                        };
                    }
                    console.log(`[TableCatalog] Resolved calc view DataSource '${name}' with ${model.columns.length} columns.`);
                }
            } catch (e) {}
        }
    }

    // Specific guarantee for CashLinefnt: ensure LANGU and all standard columns exist
    if (tableCatalog['CashLinefnt']) {
        if (!tableCatalog['CashLinefnt']['LANGU']) {
            tableCatalog['CashLinefnt']['LANGU'] = { dataType: 'cds.String(2)', length: 2, isKey: false };
        }
    } else {
        tableCatalog['CashLinefnt'] = {
            MANDT: { dataType: 'cds.String(3)', length: 3, isKey: true },
            NAME: { dataType: 'cds.String(30)', length: 30, isKey: false },
            LANGU: { dataType: 'cds.String(2)', length: 2, isKey: false },
            TEXT: { dataType: 'cds.String(50)', length: 50, isKey: false }
        };
    }

    // Specific guarantee for FCLM_BAM_AC_TYPE: ensure ACC_TYPE_DIRE and CONTRACT_TYPE exist
    if (tableCatalog['FCLM_BAM_AC_TYPE']) {
        if (!tableCatalog['FCLM_BAM_AC_TYPE']['ACC_TYPE_DIRE']) {
            tableCatalog['FCLM_BAM_AC_TYPE']['ACC_TYPE_DIRE'] = { dataType: 'cds.String(1)', length: 1, isKey: false };
        }
        if (!tableCatalog['FCLM_BAM_AC_TYPE']['CONTRACT_TYPE']) {
            tableCatalog['FCLM_BAM_AC_TYPE']['CONTRACT_TYPE'] = { dataType: 'cds.String(2)', length: 2, isKey: false };
        }
    }

    const outPath = path.join(__dirname, '../srv/fixtures/table-columns-catalog.json');
    fs.writeFileSync(outPath, JSON.stringify(tableCatalog, null, 2), 'utf8');
    const sizeKb = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`[TableCatalog] Successfully wrote ${Object.keys(tableCatalog).length} table schemas to ${outPath} (${sizeKb} KB).`);
}

function mapDataType(hanaType, length, scale) {
    const t = (hanaType || '').toUpperCase();
    if (t.includes('INT') || t === 'INTEGER' || t === 'BIGINT' || t === 'SMALLINT') return 'cds.Integer';
    if (t.includes('DECIMAL') || t === 'NUMERIC') return `cds.Decimal(${length || 15}, ${scale || 2})`;
    if (t.includes('DATE')) return 'cds.Date';
    if (t.includes('TIME') || t.includes('TIMESTAMP')) return 'cds.Timestamp';
    return `cds.String(${length || 40})`;
}

buildTableCatalog()
    .then(() => process.exit(0))
    .catch(e => { console.error(e); process.exit(1); });
