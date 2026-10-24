const cds = require('@sap/cds');
const assert = require('assert');

async function waitForJobCompletion(srv, jobId, timeoutMs = 8000) {
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
    assert.strictEqual(sysInfo.useMock, true, 'Default configuration should have USE_MOCK=true');
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
        targetSpace: 'MIGRATION_SPACE'
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
        targetSpace: 'MIGRATION_SPACE'
    });
    const completedCalcJob = await waitForJobCompletion(srv, calcJob.ID);
    assert.strictEqual(completedCalcJob.status, 'COMPLETED');
    const parsedCsn = JSON.parse(completedCalcJob.csnPayload);
    assert.strictEqual(parsedCsn.definitions['MIGRATION_SPACE.CA_SALES_ANALYTICS_DS']['@Analytics.dataCategory'], '#CUBE');
    console.log(`✓ Calculation View Job completed: Analytical #CUBE generated with measures.`);

    console.log('\n=============================================================');
    console.log(' ALL 6 REFACTORED FRONTEND-BACKEND CONTRACT TESTS PASSED! ');
    console.log('=============================================================\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
