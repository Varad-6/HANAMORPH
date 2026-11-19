const hanaConnector = require('../srv/lib/hana-connector');

async function test() {
    await hanaConnector.ensureConnected();
    const tables = ['CashLinefnt', 'FCLM_BAM_AC_TYPE', 'T001', 'TKA02', 'FCLM_BAM_AMD'];
    const placeholders = tables.map(() => '?').join(',');
    const sql = `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE_NAME, LENGTH, SCALE, POSITION 
                 FROM SYS.TABLE_COLUMNS 
                 WHERE TABLE_NAME IN (${placeholders}) 
                 ORDER BY TABLE_NAME, POSITION`;
    const rows = await hanaConnector._execQuery(sql, tables);
    console.log('Total table columns rows:', rows.length);
    const byTable = {};
    for (const r of rows) {
        if (!byTable[r.TABLE_NAME]) byTable[r.TABLE_NAME] = [];
        byTable[r.TABLE_NAME].push(r.COLUMN_NAME);
    }
    console.log('Tables found in SYS.TABLE_COLUMNS:', Object.keys(byTable));
    for (const [t, cols] of Object.entries(byTable)) {
        console.log(t, cols.length, cols.slice(0, 10));
    }

    // What about views? (e.g. CashLinefnt if it's in SYS.VIEW_COLUMNS)
    const viewSql = `SELECT VIEW_NAME, COLUMN_NAME, DATA_TYPE_NAME, LENGTH, SCALE, POSITION 
                     FROM SYS.VIEW_COLUMNS 
                     WHERE VIEW_NAME IN (${placeholders}) 
                     ORDER BY VIEW_NAME, POSITION`;
    const viewRows = await hanaConnector._execQuery(viewSql, tables);
    console.log('Total view columns rows:', viewRows.length);
    const byView = {};
    for (const r of viewRows) {
        if (!byView[r.VIEW_NAME]) byView[r.VIEW_NAME] = [];
        byView[r.VIEW_NAME].push(r.COLUMN_NAME);
    }
    console.log('Views found in SYS.VIEW_COLUMNS:', Object.keys(byView));
    for (const [t, cols] of Object.entries(byView)) {
        console.log(t, cols.length, cols.slice(0, 10));
    }
}

test().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
