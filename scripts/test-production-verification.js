const cds = require('@sap/cds');
const hana = require('../srv/lib/hana-connector');
const extract = require('../srv/lib/extract-service');
const transform = require('../srv/lib/transform-service');

async function runProductionVerification() {
    console.log('========================================================================');
    console.log('     HANAMORPH PRODUCTION-GRADE VERIFICATION SUITE');
    console.log('========================================================================\n');

    await hana.ensureConnected();
    console.log('>>> [1/5] Connected to Live SAP HANA DB (192.168.1.55:31015) <<<\n');

    const srv = await cds.serve('MigrationService').from('srv/migration-service.cds');

    // -------------------------------------------------------------------------
    // TEST 1: Single-Table CDS View (/1BS/SADL_CDS_PARAM)
    // -------------------------------------------------------------------------
    console.log('>>> [2/5] Testing Single-Table CDS View (/1BS/SADL_CDS_PARAM) <<<');
    const model1 = await extract.extractCDS('/1BS/SADL_CDS_PARAM');
    console.log(`    Model Name: ${model1.name}`);
    console.log(`    Sources Count: ${model1.sources.length} (${model1.sources.map(s => s.tableName).join(', ')})`);
    console.log(`    Has Joins: ${model1.hasJoins}`);
    console.log(`    Has Associations: ${model1.hasAssociations}`);
    console.log(`    isGraphicalEligible: ${model1.isGraphicalEligible}`);

    if (model1.isGraphicalEligible !== false) {
        throw new Error('FAIL: /1BS/SADL_CDS_PARAM should NOT be graphical eligible!');
    }

    const arts1 = await srv.getArtifacts('/1BS/SADL_CDS_PARAM');
    const artTypes1 = arts1.map(a => a.artifactType);
    console.log(`    Artifacts returned by service: [${artTypes1.join(', ')}]`);

    if (artTypes1.includes('GRAPHICAL')) {
        throw new Error('FAIL: /1BS/SADL_CDS_PARAM returned GRAPHICAL artifact row!');
    }
    if (!artTypes1.includes('TABLE') || !artTypes1.includes('SQL')) {
        throw new Error('FAIL: /1BS/SADL_CDS_PARAM missing TABLE or SQL artifact!');
    }
    console.log('    ✅ SUCCESS: Single-table view correctly omits GRAPHICAL artifact.\n');

    // -------------------------------------------------------------------------
    // TEST 2: CSN Dependency Integrity for /1BS/SADL_CDS_PARAM
    // -------------------------------------------------------------------------
    console.log('>>> [3/5] Testing CSN Import Integrity for /1BS/SADL_CDS_PARAM <<<');
    const naming1 = {
        space: 'AIS_HARMONIZATION_',
        fromTableName: '/1BS/SADL_CDS_PARAM',
        tableName: '/1BS/SADL_CDS_PARAM_TBL',
        viewName: '/1BS/SADL_CDS_PARAM_V'
    };
    const csnRes1 = transform.generateModularArtifacts(model1, null, naming1);

    // Validate View CSN definitions
    const viewDefs1 = Object.keys(csnRes1.viewJson.definitions);
    console.log(`    View CSN Definitions: [${viewDefs1.join(', ')}]`);
    const viewEntityKey1 = csnRes1.namingConfig.viewTechName || '_1BS_SADL_CDS_PARAM_V';
    const viewQueryFrom1 = csnRes1.viewJson.definitions[viewEntityKey1].query.SELECT.from.ref[0];
    if (!csnRes1.viewJson.definitions[viewQueryFrom1]) {
        throw new Error(`FAIL: View query FROM '${viewQueryFrom1}' is missing from definitions!`);
    }
    // Check column
    const viewCols1 = csnRes1.viewJson.definitions[viewEntityKey1].query.SELECT.columns.filter(c => c.ref).map(c => c.ref[0]);
    for (const c of viewCols1) {
        if (!csnRes1.viewJson.definitions[viewQueryFrom1].elements[c]) {
            throw new Error(`FAIL: View column '${c}' is missing from source table '${viewQueryFrom1}'!`);
        }
    }
    console.log(`    ✅ SUCCESS: View CSN contains all dependent objects and columns. 0 missing objects.\n`);

    // -------------------------------------------------------------------------
    // TEST 3: Real Calculation Views Discovery in Live HANA DB
    // -------------------------------------------------------------------------
    console.log('>>> [4/5] Testing Live Calculation View Discovery in _SYS_REPO <<<');
    const calcViews = await hana.searchViews('CV_', 'ALL', 'CALC_VIEW', 10);
    console.log(`    Discovered ${calcViews.length} real calculation views from live HANA:`);
    calcViews.slice(0, 5).forEach(cv => console.log(`      - ${cv.name} in package ${cv.packageOrSchema}`));

    if (calcViews.length === 0) {
        throw new Error('FAIL: No calculation views found in _SYS_REPO.ACTIVE_OBJECT!');
    }
    console.log('    ✅ SUCCESS: Real Calculation Views discovered directly from HANA DB.\n');

    // -------------------------------------------------------------------------
    // TEST 4: Real Calculation View Extraction & Graphical Pipeline (CV_AC_TYPE)
    // -------------------------------------------------------------------------
    console.log('>>> [5/5] Testing Real Calculation View Pipeline (CV_AC_TYPE) <<<');
    const model2 = await extract.extractCalc('CV_AC_TYPE');
    console.log(`    Calc View Name: ${model2.name}`);
    console.log(`    DataSources: ${model2.sources.map(s => s.tableName).join(', ')}`);
    console.log(`    Calculation Nodes Count: ${model2.nodes.length} (${model2.nodes.map(n => n.id).join(', ')})`);
    console.log(`    Columns Count: ${model2.columns.length}`);
    console.log(`    isGraphicalEligible: ${model2.isGraphicalEligible}`);

    if (model2.isGraphicalEligible !== true) {
        throw new Error('FAIL: Multi-node calculation view should be graphical eligible!');
    }

    const arts2 = await srv.getArtifacts('CV_AC_TYPE');
    const artTypes2 = arts2.map(a => a.artifactType);
    console.log(`    Artifacts returned by service: [${artTypes2.join(', ')}]`);

    if (!artTypes2.includes('GRAPHICAL') || !artTypes2.includes('TABLE') || !artTypes2.includes('SQL')) {
        throw new Error('FAIL: Multi-node Calculation View must have TABLE, SQL, and GRAPHICAL artifacts!');
    }
    console.log('    ✅ SUCCESS: Calculation view correctly enables GRAPHICAL pipeline.\n');

    console.log('========================================================================');
    console.log('🎉 ALL PRODUCTION-GRADE VERIFICATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('========================================================================');
}

runProductionVerification().catch(e => {
    console.error('\n❌ VERIFICATION FAILED:', e);
    process.exit(1);
});
