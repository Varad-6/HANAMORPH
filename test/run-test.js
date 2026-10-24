const cds = require('@sap/cds');
const assert = require('assert');

async function waitForJobCompletion(srv, jobId, timeoutMs = 8000) {
    const { MigrationJobs } = srv.entities;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const job = await srv.run(SELECT.one.from(MigrationJobs, jobId));
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
            return job;
        }
        await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Timeout waiting for job ${jobId} to finish`);
}

async function main() {
    console.log('--- HanaMorph Expanded Pipeline Integration Tests ---');
    
    // Deploy database
    await cds.deploy(__dirname + '/../db/schema.cds').to('sqlite:db.sqlite');
    const srv = await cds.serve('MigrationService').from(__dirname + '/../srv/migration-service');

    console.log('[Test 1] Syncing Source Catalog (20+ CDS & Calc Views)...');
    const catalog = await srv.send('importCatalog', { sourceType: 'ALL' });
    assert(catalog.length >= 17, `Expected at least 17 views in catalog, got ${catalog.length}`);
    const cdsViews = catalog.filter(v => v.type === 'CDS');
    const calcViews = catalog.filter(v => v.type === 'CALC_VIEW');
    console.log(`✓ Catalog discovered ${catalog.length} views: ${cdsViews.length} CDS Views, ${calcViews.length} Calculation Views.`);

    console.log('[Test 2] Testing Artifact Inspector for ACDOCA Journal Entry View...');
    const artifacts = await srv.send('getArtifacts', { viewName: 'C_JournalEntryItem' });
    assert.strictEqual(artifacts.length, 3, 'Should return 3 artifacts');
    const tableArt = artifacts.find(a => a.artifactType === 'TABLE');
    const sqlArt = artifacts.find(a => a.artifactType === 'SQL');
    assert(tableArt.name.includes('ACDOCA'), 'Table artifact should reference ACDOCA');
    assert(sqlArt.details.includes('CJOURNALENTRYITM'), 'SQL artifact should include view definition');
    console.log(`✓ Artifact Inspector validated for C_JournalEntryItem.`);

    console.log('[Test 3] End-to-End Migration: S/4 CDS View (C_PurchaseOrderFs)...');
    const poJob = await srv.send('triggerMigration', {
        sourceViewName: 'C_PurchaseOrderFs',
        sourceViewType: 'CDS',
        targetSpace: 'MM_PURCHASING',
        targetViewName: 'V_PO_OVERVIEW'
    });
    const poCompleted = await waitForJobCompletion(srv, poJob.ID);
    assert.strictEqual(poCompleted.status, 'COMPLETED');
    assert.strictEqual(poCompleted.progress, 100);
    assert(poCompleted.targetRowCount > 0);
    assert(poCompleted.generatedSql.includes('CREATE VIEW "MM_PURCHASING"."V_PO_OVERVIEW"'));
    console.log(`✓ CDS Migration succeeded: ${poCompleted.targetRowCount} records replicated.`);

    console.log('[Test 4] End-to-End Migration: Universal Journal CDS View (C_JournalEntryItem)...');
    const acdocaJob = await srv.send('triggerMigration', {
        sourceViewName: 'C_JournalEntryItem',
        sourceViewType: 'CDS',
        targetSpace: 'FI_FINANCE',
        targetViewName: 'V_GL_JOURNAL'
    });
    const acdocaCompleted = await waitForJobCompletion(srv, acdocaJob.ID);
    assert.strictEqual(acdocaCompleted.status, 'COMPLETED');
    console.log(`✓ Financial CDS Migration succeeded: ${acdocaCompleted.targetRowCount} records replicated.`);

    console.log('[Test 5] End-to-End Migration: Analytical Calc View (CA_SALES_ANALYTICS)...');
    const calcJob = await srv.send('triggerMigration', {
        sourceViewName: 'CA_SALES_ANALYTICS',
        sourceViewType: 'CALC_VIEW',
        targetSpace: 'SD_SALES',
        targetViewName: 'V_SALES_AGG'
    });
    const calcCompleted = await waitForJobCompletion(srv, calcJob.ID);
    assert.strictEqual(calcCompleted.status, 'COMPLETED');
    const parsedCalcCsn = JSON.parse(calcCompleted.csnPayload);
    assert.strictEqual(parsedCalcCsn.definitions['SD_SALES.V_SALES_AGG']['@Analytics.dataCategory'], '#CUBE');
    console.log(`✓ Calculation View Migration succeeded: Analytical #CUBE generated with measures.`);

    console.log('[Test 6] End-to-End Migration: Financial KPI Calc View (CA_FINANCIAL_KPI)...');
    const finKpiJob = await srv.send('triggerMigration', {
        sourceViewName: 'CA_FINANCIAL_KPI',
        sourceViewType: 'CALC_VIEW',
        targetSpace: 'FI_CONTROLLING',
        targetViewName: 'V_FIN_KPI'
    });
    const finKpiCompleted = await waitForJobCompletion(srv, finKpiJob.ID);
    assert.strictEqual(finKpiCompleted.status, 'COMPLETED');
    console.log(`✓ Financial KPI Calc View Migration succeeded: ${finKpiCompleted.targetRowCount} records replicated.`);

    console.log('\n======================================================');
    console.log(' ALL 6 END-TO-END PIPELINE TESTS PASSED SUCCESSFULLY! ');
    console.log('======================================================\n');
    process.exit(0);
}

main().catch(err => {
    console.error('Test execution failed:', err);
    process.exit(1);
});
