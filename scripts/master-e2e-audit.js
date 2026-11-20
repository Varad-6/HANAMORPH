const https = require('https');
const transformService = require('../srv/lib/transform-service');
const extractService = require('../srv/lib/extract-service');
const hanaConnector = require('../srv/lib/hana-connector');
const { EXTENDED_CATALOG } = require('../srv/fixtures/extended-catalog');

const CF_HOST = 'abhiyanta-india-solutions-private-limited-sap-btp-ais-d668dc90a.cfapps.eu30.hana.ondemand.com';

function httpGet(path) {
    return new Promise((resolve, reject) => {
        https.get(`https://${CF_HOST}${path}`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, headers: res.headers, body: data }));
        }).on('error', reject);
    });
}

function httpPost(path, payload) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);
        const req = https.request({
            hostname: CF_HOST,
            path: path,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function runMasterAudit() {
    console.log('================================================================');
    console.log('   HANAMORPH COMPREHENSIVE END-TO-END MASTER SYSTEM AUDIT       ');
    console.log('================================================================\n');

    let totalTests = 0;
    let passedTests = 0;

    function assert(name, condition, details = '') {
        totalTests++;
        if (condition) {
            passedTests++;
            console.log(`  ✓ [PASS] ${name} ${details ? '(' + details + ')' : ''}`);
        } else {
            console.error(`  ✗ [FAIL] ${name} ${details ? ': ' + details : ''}`);
        }
    }

    // -------------------------------------------------------------
    // SECTION 1: LIVE CLOUD FOUNDRY HEALTH
    // -------------------------------------------------------------
    console.log('[STAGE 1] Testing Cloud Foundry Live Web & Service Endpoints...');
    try {
        const uiRes = await httpGet('/');
        assert('Live UI Web Server is Running', uiRes.statusCode === 200, `HTTP ${uiRes.statusCode}`);
        assert('Live UI Index HTML Serves UI5', uiRes.body.includes('sap-ui-core') || uiRes.body.includes('hanamorph'), 'UI5 Bootstrap Verified');

        const odataRes = await httpGet('/odata/v4/migration/');
        assert('OData V4 Service Root Online', odataRes.statusCode === 200, `HTTP ${odataRes.statusCode}`);

        const metaRes = await httpGet('/odata/v4/migration/$metadata');
        assert('OData V4 $metadata Document Valid', metaRes.statusCode === 200 && metaRes.body.includes('Schema'), 'EDMX Valid');
    } catch(e) {
        assert('Cloud Foundry Live Endpoints Reachable', false, e.message);
    }

    // -------------------------------------------------------------
    // SECTION 2: HANA DATABASE CONNECTIVITY
    // -------------------------------------------------------------
    console.log('\n[STAGE 2] Testing SAP HANA DB (HDD) Connectivity...');
    try {
        const connected = await hanaConnector.ensureConnected();
        assert('Live SAP HANA Connected', connected, '192.168.1.55:31015 as DINESH_S');
        const status = await hanaConnector.getStatus();
        assert('HANA System Status Verified', status.hanaConnected === true, status.mode);
    } catch(e) {
        assert('SAP HANA Connectivity', false, e.message);
    }

    // -------------------------------------------------------------
    // SECTION 3: CDS VIEWS PIPELINE & REPLICATION FLOW
    // -------------------------------------------------------------
    console.log('\n[STAGE 3] Testing CDS Views Pipeline & Replication Flow...');
    try {
        const poEntry = EXTENDED_CATALOG.find(v => v.name === 'C_PurchaseOrderFs');
        const poModel = extractService._parseCdsDdl(poEntry.name, poEntry.sqlDdl, poEntry.sqlViewName);
        assert('CDS Parser Model Extracted', poModel && poModel.columns.length === 24, `${poModel.columns.length} columns`);

        const poRes = transformService.generateModularArtifacts(poModel, null, {
            space: 'AIS_INBOUND',
            sourceConnection: 'AIS_S21_S4HANA_2023_Inbound'
        });

        assert('CDS Local Table CSN Generated', !!poRes.tableJsonString && (poRes.tableJsonString.includes('C_PurchaseOrderFs_TBL') || poRes.tableJsonString.includes('CPURCHASEORDFS_TBL')), 'Table CSN OK');
        assert('CDS View DDL SQL Generated', !!poRes.optimizedQuerySql && poRes.optimizedQuerySql.includes('SELECT'), 'SQL OK');

        const poRf = JSON.parse(poRes.replicationFlowDeltaJsonString);
        assert('Replication Flow Target Space = AIS_INBOUND', poRf.target.space === 'AIS_INBOUND', poRf.target.space);
        assert('Replication Flow Source Connection = AIS_S21_S4HANA_2023_Inbound', poRf.source.connection === 'AIS_S21_S4HANA_2023_Inbound', poRf.source.connection);
        
        const poSourceTables = poRf.tasks.map(t => t.sourceObject);
        const expectedPoTables = ['EKKO', 'EKPO', 'MARA', 'T001W'];
        const hasAllPoTables = expectedPoTables.every(t => poSourceTables.includes(t));
        assert('Replication Flow Maps Real S/4 Tables (EKKO, EKPO, MARA, T001W)', hasAllPoTables, poSourceTables.join(', '));
    } catch(e) {
        assert('CDS Views Pipeline Audit', false, e.message);
    }

    // -------------------------------------------------------------
    // SECTION 4: CALCULATION VIEWS (MULTI-TIER DAG) VERIFICATION
    // -------------------------------------------------------------
    console.log('\n[STAGE 4] Testing Calculation Views Multi-Tier CSN Generation & Dependency Integrity...');
    const calcViewTestList = ['CV_EMPLOYEE', 'CV_AMD', 'CV_BANK', 'CV_AC_TYPE', 'CV_ProjectCostObjects'];

    for (const vName of calcViewTestList) {
        try {
            const model = await extractService.extractCalc(vName);
            const res = transformService.generateModularArtifacts(model, null, {
                space: 'AIS_INBOUND',
                sourceConnection: 'AIS_S21_S4HANA_2023_Inbound'
            });

            const defs = res.multiTierPackageJson.definitions;
            const defKeys = Object.keys(defs);

            let zeroElements = [];
            let missingKeys = [];
            let missingDependencies = [];

            for (const [k, v] of Object.entries(defs)) {
                const elCount = Object.keys(v.elements || {}).length;
                if (elCount === 0) zeroElements.push(k);
                if (v.kind === 'entity') {
                    const hasKey = Object.values(v.elements || {}).some(e => e.key);
                    if (!hasKey) missingKeys.push(k);
                }

                // Check dependencies in query
                if (v.query?.SELECT) {
                    const fromRef = v.query.SELECT.from?.ref?.[0];
                    const joinArgs = v.query.SELECT.from?.args;
                    if (fromRef && defs[fromRef]) {
                        for (const col of (v.query.SELECT.columns || [])) {
                            if (Array.isArray(col.ref)) {
                                const cName = col.ref[col.ref.length - 1];
                                if (!defs[fromRef].elements?.[cName]) missingDependencies.push(`${k}->${fromRef}#${cName}`);
                            }
                        }
                    }
                    if (joinArgs && Array.isArray(joinArgs)) {
                        const aliasMap = {};
                        for (const a of joinArgs) if (a.as && a.ref) aliasMap[a.as] = a.ref[0];
                        for (const col of (v.query.SELECT.columns || [])) {
                            if (Array.isArray(col.ref) && col.ref.length >= 2) {
                                const [alias, cName] = col.ref;
                                const srcTbl = aliasMap[alias];
                                if (srcTbl && defs[srcTbl] && !defs[srcTbl].elements?.[cName]) {
                                    missingDependencies.push(`${k}->${srcTbl}#${cName}`);
                                }
                            }
                        }
                    }
                }
            }

            assert(`Calc View '${vName}' Multi-Tier Entities Count`, defKeys.length > 0, `${defKeys.length} entities in DAG`);
            assert(`Calc View '${vName}' All Entities Have Non-Empty Elements`, zeroElements.length === 0, zeroElements.length ? zeroElements.join(', ') : 'OK');
            assert(`Calc View '${vName}' All Entity Keys Valid`, missingKeys.length === 0, missingKeys.length ? missingKeys.join(', ') : 'OK');
            assert(`Calc View '${vName}' Zero Missing Object References`, missingDependencies.length === 0, missingDependencies.length ? missingDependencies.join(', ') : 'OK');

            // Verify RF for Calc View
            const cvRf = JSON.parse(res.replicationFlowDeltaJsonString);
            assert(`Calc View '${vName}' RF Targets AIS_INBOUND via AIS_S21_S4HANA_2023_Inbound`, cvRf.target.space === 'AIS_INBOUND' && cvRf.source.connection === 'AIS_S21_S4HANA_2023_Inbound', `${cvRf.tasks.length} table tasks`);

        } catch(e) {
            assert(`Calc View '${vName}' Processing`, false, e.message);
        }
    }

    // -------------------------------------------------------------
    // SECTION 5: LIVE CLOUD FOUNDRY ODATA ACTION EXECUTION
    // -------------------------------------------------------------
    console.log('\n[STAGE 5] Testing Live Cloud Foundry API Actions...');
    try {
        const livePoRes = await httpPost('/odata/v4/migration/generateModularArtifacts', {
            viewName: 'C_PurchaseOrderFs',
            space: 'AIS_INBOUND',
            sourceConnection: 'AIS_S21_S4HANA_2023_Inbound'
        });
        assert('Live API generateModularArtifacts for C_PurchaseOrderFs', livePoRes.statusCode === 200, `HTTP ${livePoRes.statusCode}`);
        const livePoData = JSON.parse(livePoRes.body);
        assert('Live API Returned replicationFlowDeltaJsonString', !!livePoData.replicationFlowDeltaJsonString, 'Payload OK');

        const liveBankRes = await httpPost('/odata/v4/migration/generateModularArtifacts', {
            viewName: 'CV_BANK',
            space: 'AIS_INBOUND',
            sourceConnection: 'AIS_S21_S4HANA_2023_Inbound'
        });
        assert('Live API generateModularArtifacts for CV_BANK', liveBankRes.statusCode === 200, `HTTP ${liveBankRes.statusCode}`);
        const liveBankData = JSON.parse(liveBankRes.body);
        assert('Live API Returned multiTierPackageJsonString', !!liveBankData.multiTierPackageJsonString, 'Multi-Tier CSN OK');

        const liveEmpRes = await httpPost('/odata/v4/migration/generateModularArtifacts', {
            viewName: 'CV_EMPLOYEE',
            space: 'AIS_INBOUND',
            sourceConnection: 'AIS_S21_S4HANA_2023_Inbound'
        });
        assert('Live API generateModularArtifacts for CV_EMPLOYEE', liveEmpRes.statusCode === 200, `HTTP ${liveEmpRes.statusCode}`);

        const liveAmdRes = await httpPost('/odata/v4/migration/generateModularArtifacts', {
            viewName: 'CV_AMD',
            space: 'AIS_INBOUND',
            sourceConnection: 'AIS_S21_S4HANA_2023_Inbound'
        });
        assert('Live API generateModularArtifacts for CV_AMD', liveAmdRes.statusCode === 200, `HTTP ${liveAmdRes.statusCode}`);

    } catch(e) {
        assert('Live Cloud Foundry API Actions', false, e.message);
    }

    // -------------------------------------------------------------
    // SECTION 6: REPLICATION STUDIO DEDUPLICATION ENGINE
    // -------------------------------------------------------------
    console.log('\n[STAGE 6] Testing Replication Studio Enterprise Deduplication Engine...');
    try {
        const viewsToDeduplicate = ['CV_BANK', 'CV_AMD'];
        const models = await Promise.all(viewsToDeduplicate.map(v => extractService.extractCalc(v)));
        const pkg = transformService.generateDeduplicatedMultiTableReplicationPackage(models, {
            space: 'AIS_INBOUND',
            sourceConnection: 'AIS_S21_S4HANA_2023_Inbound',
            flowName: 'RF_DEDUPLICATED_TEST'
        });

        assert('Deduplication Package Generated', !!pkg.replicationFlowJsonString && !!pkg.targetTablesCsn, `${pkg.tableCount} tables, ${pkg.taskCount} tasks`);
        const parsedFlow = JSON.parse(pkg.replicationFlowJsonString);
        assert('Deduplication Flow Connection = AIS_S21_S4HANA_2023_Inbound', parsedFlow.source.connection === 'AIS_S21_S4HANA_2023_Inbound', parsedFlow.source.connection);
        assert('Deduplication Flow Space = AIS_INBOUND', parsedFlow.target.space === 'AIS_INBOUND', parsedFlow.target.space);
        assert('CLI Deploy Command Valid Syntax', pkg.cliDeployFlowCommand.includes('--file-path') && pkg.cliDeployFlowCommand.includes('--save-anyway'), pkg.cliDeployFlowCommand);
    } catch(e) {
        assert('Replication Studio Engine', false, e.message);
    }

    // -------------------------------------------------------------
    // SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`   FINAL AUDIT SUMMARY: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
    console.log('================================================================');

    if (passedTests === totalTests) {
        console.log('\n🎉 ALL SYSTEMS 100% OPERATIONAL, CONNECTED & PRODUCTION-READY!');
        process.exit(0);
    } else {
        console.error(`\n⚠️ ${totalTests - passedTests} TEST(S) FAILED!`);
        process.exit(1);
    }
}

runMasterAudit().catch(err => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
});
