process.env.USE_MOCK = 'true';
const cds = require('@sap/cds');
const assert = require('assert');

async function waitForJobCompletion(srv, jobId, timeoutMs = 80000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const job = await srv.send('getJobStatus', { jobId });
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
            return job;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for job ${jobId} to finish`);
}

async function main() {
    console.log('--- HanaMorph Refactored Service Integration Tests ---');
    
    // Deploy database
    await cds.deploy(__dirname + '/../db/schema.cds').to('sqlite:db.sqlite');
    const srv = await cds.serve('MigrationService').from(__dirname + '/../srv/migration-service');

    console.log('[Test 1] Testing getSystemInfo (Mock & Connection Status)...');
    const sysInfo = await srv.send('getSystemInfo');
    assert.strictEqual(typeof sysInfo.useMock, 'boolean', 'useMock should be a boolean');
    console.log(`✓ System Info verified: useMock=${sysInfo.useMock}, mode='${sysInfo.mode}'`);

    console.log('[Test 2] Testing listCDSViews() endpoint...');
    const cdsViews = await srv.send('listCDSViews');
    assert(Array.isArray(cdsViews), 'Should return array of CDS views');
    assert(cdsViews.length >= 10, `Expected at least 10 CDS views, got ${cdsViews.length}`);
    const poView = cdsViews.find(v => v.name === 'C_PurchaseOrderFs');
    assert(poView, 'Should find C_PurchaseOrderFs in CDS views');
    console.log(`✓ listCDSViews() returned ${cdsViews.length} views.`);

    console.log('[Test 3] Testing listCalcViews() endpoint...');
    const calcViews = await srv.send('listCalcViews');
    assert(Array.isArray(calcViews), 'Should return array of Calc views');
    assert(calcViews.length >= 5, `Expected at least 5 Calc views, got ${calcViews.length}`);
    const salesCalc = calcViews.find(v => v.name === 'CA_SALES_ANALYTICS');
    assert(salesCalc, 'Should find CA_SALES_ANALYTICS in Calc views');
    console.log(`✓ listCalcViews() returned ${calcViews.length} views.`);

    console.log('[Test 4] Testing getArtifacts(viewName)...');
    const artifacts = await srv.send('getArtifacts', { viewName: 'C_PurchaseOrderFs' });
    assert.strictEqual(artifacts.length, 3, 'Should return 3 artifacts');
    const types = artifacts.map(a => a.artifactType);
    assert(types.includes('TABLE') && types.includes('SQL') && types.includes('GRAPHICAL'));
    console.log(`✓ getArtifacts() returned 3 artifacts with types: ${types.join(', ')}.`);

    console.log('[Test 5] Testing startJob & getJobStatus for CDS Pipeline...');
    const cdsJob = await srv.send('startJob', {
        viewName: 'C_PurchaseOrderFs',
        viewType: 'CDS',
        artifacts: ['Underlying Tables (EKKO, EKPO, MARA, T001W)', 'Catalog SQL View (CPURCHASEORDFS)'],
        targetSpace: 'AIS_HARMONIZATION_'
    });
    assert(cdsJob && cdsJob.ID, 'Job should be created with an ID');
    console.log(`✓ Job ${cdsJob.ID} started. Waiting for completion...`);

    const completedCdsJob = await waitForJobCompletion(srv, cdsJob.ID);
    assert.strictEqual(completedCdsJob.status, 'COMPLETED', `Expected COMPLETED, got ${completedCdsJob.status}`);
    assert(completedCdsJob.logs && completedCdsJob.logs.length >= 4, 'Job logs should be populated');
    console.log(`✓ CDS Migration Job completed: ${completedCdsJob.targetRowCount} rows loaded, ${completedCdsJob.logs.length} log entries recorded.`);

    console.log('[Test 6] Testing startJob & getJobStatus for Calculation View Pipeline...');
    const calcJob = await srv.send('startJob', {
        viewName: 'CA_SALES_ANALYTICS',
        viewType: 'CALC_VIEW',
        artifacts: ['Base DataSources (VBAK, VBAP)', 'Calculation Scenario Node Graph'],
        targetSpace: 'AIS_HARMONIZATION_'
    });
    const completedCalcJob = await waitForJobCompletion(srv, calcJob.ID);
    assert.strictEqual(completedCalcJob.status, 'COMPLETED');
    const parsedCsn = JSON.parse(completedCalcJob.csnPayload);
    const csnObj = parsedCsn.csn || parsedCsn;
    const cubeDef = csnObj.definitions['CA_SALES_ANALYTICS_DS'] || csnObj.definitions['MIGRATION_SPACE.CA_SALES_ANALYTICS_DS'];
    assert.strictEqual(cubeDef['@Analytics.dataCategory'], '#CUBE');
    console.log(`✓ Calculation View Job completed: Analytical #CUBE generated with measures.`);

    console.log('[Test 7] Testing getColumns(viewName) for Production Confirmation Fact...');
    const cols = await srv.send('getColumns', { viewName: 'ZI_MYQ_ProdConfirmationFact' });
    assert(Array.isArray(cols) && cols.length === 52, `Expected 52 columns, got ${cols?.length}`);
    const yieldCol = cols.find(c => c.name === 'CONFIRMEDYIELDQUANTITY');
    assert(yieldCol && yieldCol.isMeasure === true, 'CONFIRMEDYIELDQUANTITY should be flagged as measure');
    console.log(`✓ getColumns() returned 52 columns with measure/key metadata.`);

    console.log('[Test 8] Testing generateModularArtifacts for Datasphere...');
    const modular = await srv.send('generateModularArtifacts', {
        viewName: 'ZI_MYQ_ProdConfirmationFact',
        selectedColumns: ['Confirmation', 'Counter', 'Order', 'CONFIRMEDYIELDQUANTITY', 'Posting_Date'],
        space: 'AIS_HARMONIZATION_',
        tableName: 'ZI_MYQ_PRODCONF_TBL',
        tableBusinessName: 'Production Confirmation Base Table',
        viewNameCustom: 'ZI_MYQ_PRODCONF_V',
        viewBusinessName: 'Production Confirmation Fact View',
        amName: 'ZI_MYQ_PRODCONF_AM',
        amBusinessName: 'Production Confirmation Analytical Model'
    });
    assert(modular.tableJsonString.includes('definitions'), 'Table JSON should contain definitions at root');
    assert(modular.viewJsonString.includes('#CUBE'), 'View JSON should contain #CUBE');
    assert(modular.analyticModelJsonString.includes('analyticModel'), 'Analytic Model JSON should contain analyticModel');
    assert(modular.optimizedSql.includes('COALESCE("CONFIRMEDYIELDQUANTITY", 0)'), 'Optimized SQL should include COALESCE for null handling on measure');
    assert(!modular.viewJsonString.includes('AIS_HARMONIZATION_.ZI_MYQ_PRODCONF_V'), 'CSN must NOT prefix entity name with AIS_HARMONIZATION_. to prevent Datasphere namespace error');
    console.log(`✓ generateModularArtifacts generated all JSONs and optimized SQL with COALESCE null handling!`);

    console.log('\n=============================================================');
    console.log(' ALL 8 BASE MIGRATION PIPELINE CONTRACT TESTS PASSED! ');
    console.log('=============================================================\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
