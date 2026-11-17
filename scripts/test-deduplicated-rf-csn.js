/**
 * Automated test suite for Deduplication and Multi-Object Packaging Engine
 * Tests:
 * 1. Multi-view decomposition to physical base tables
 * 2. Deduplication of identical base tables across multiple views (e.g. ACDOCA, BNKA)
 * 3. Superset column merging & delta key harmonization
 * 4. 100% naming parity between Table CSN ($version: "2.0") and Native Replication Flow JSON (.replicationFlow.json)
 * 5. Custom naming overrides propagated everywhere
 */

const assert = require('assert');
const transformService = require('../srv/lib/transform-service');

async function runTests() {
    console.log('=== [TEST] Starting Deduplication & Multi-Table Packaging Tests ===\n');

    // Sample multi-view scenario:
    // View 1 (CV_BANK_MASTER) references BNKA
    // View 2 (CV_COMPANY_BANKS) also references BNKA (with overlapping + unique columns)
    // View 3 (CV_GL_ITEMS) references ACDOCA (transactional)
    // View 4 (CV_JOURNAL_ENTRIES) also references ACDOCA and BKPF
    const mockModels = [
        {
            name: 'CV_BANK_MASTER',
            type: 'CALC_VIEW',
            sources: [{ tableName: 'BNKA', alias: 'B' }],
            columns: [
                { name: 'MANDT', dataType: 'cds.String(3)', isKey: true, originalName: 'Client' },
                { name: 'BANKS', dataType: 'cds.String(3)', isKey: true, originalName: 'Bank Country' },
                { name: 'BANKL', dataType: 'cds.String(15)', isKey: true, originalName: 'Bank Key' },
                { name: 'BANKA', dataType: 'cds.String(60)', isKey: false, originalName: 'Bank Name' }
            ]
        },
        {
            name: 'CV_COMPANY_BANKS',
            type: 'CALC_VIEW',
            sources: [{ tableName: 'BNKA', alias: 'B2' }],
            columns: [
                { name: 'MANDT', dataType: 'cds.String(3)', isKey: true, originalName: 'Client' },
                { name: 'BANKL', dataType: 'cds.String(15)', isKey: true, originalName: 'Bank Key' },
                { name: 'SWIFT', dataType: 'cds.String(11)', isKey: false, originalName: 'SWIFT Code' },
                { name: 'STRAS', dataType: 'cds.String(35)', isKey: false, originalName: 'Street' }
            ]
        },
        {
            name: 'CV_GL_ITEMS',
            type: 'CALC_VIEW',
            sources: [{ tableName: 'ACDOCA', alias: 'A' }],
            columns: [
                { name: 'RCLNT', dataType: 'cds.String(3)', isKey: true, originalName: 'Client' },
                { name: 'RLDNR', dataType: 'cds.String(2)', isKey: true, originalName: 'Ledger' },
                { name: 'RBUKRS', dataType: 'cds.String(4)', isKey: true, originalName: 'Company Code' },
                { name: 'GJAHR', dataType: 'cds.String(4)', isKey: true, originalName: 'Fiscal Year' },
                { name: 'BELNR', dataType: 'cds.String(10)', isKey: true, originalName: 'Doc Number' },
                { name: 'DOCLN', dataType: 'cds.String(6)', isKey: true, originalName: 'Line Item' },
                { name: 'HSL', dataType: 'cds.Decimal(23, 2)', isKey: false, isMeasure: true, originalName: 'Amount in LC' }
            ]
        },
        {
            name: 'CV_JOURNAL_ENTRIES',
            type: 'CALC_VIEW',
            sources: [
                { tableName: 'ACDOCA', alias: 'A' },
                { tableName: 'BKPF', alias: 'H' }
            ],
            columns: [
                { name: 'RCLNT', dataType: 'cds.String(3)', isKey: true, originalName: 'Client' },
                { name: 'RBUKRS', dataType: 'cds.String(4)', isKey: true, originalName: 'Company Code' },
                { name: 'BELNR', dataType: 'cds.String(10)', isKey: true, originalName: 'Doc Number' },
                { name: 'BLART', dataType: 'cds.String(2)', isKey: false, originalName: 'Doc Type' },
                { name: 'BLDAT', dataType: 'cds.Date', isKey: false, originalName: 'Doc Date' },
                { name: 'WSL', dataType: 'cds.Decimal(23, 2)', isKey: false, isMeasure: true, originalName: 'Amount in TC' }
            ]
        }
    ];

    // TEST 1: Deduplication Analysis
    console.log('--- Test 1: Deduplication Analysis ---');
    const deduplicatedTables = transformService.extractAndDeduplicateTables(mockModels);
    console.log(`Found ${deduplicatedTables.length} unique physical base tables from 4 views.`);
    
    // Check that BNKA, ACDOCA, BKPF are extracted
    const tableNames = deduplicatedTables.map(t => t.sourceTable);
    assert(tableNames.includes('BNKA'), 'BNKA should be present');
    assert(tableNames.includes('ACDOCA'), 'ACDOCA should be present');
    assert(tableNames.includes('BKPF'), 'BKPF should be present');
    assert.strictEqual(deduplicatedTables.length, 3, 'Should deduplicate down to exactly 3 tables');

    // Check BNKA deduplication stats
    const bnka = deduplicatedTables.find(t => t.sourceTable === 'BNKA');
    assert.strictEqual(bnka.referencingViewCount, 2, 'BNKA should be referenced by 2 views');
    assert.strictEqual(bnka.isDeduplicated, true, 'BNKA should be flagged as deduplicated');
    assert(bnka.referencingViews.includes('CV_BANK_MASTER'));
    assert(bnka.referencingViews.includes('CV_COMPANY_BANKS'));

    // Check BNKA column superset (BANKS, BANKL, BANKA, MANDT from view 1 + SWIFT, STRAS from view 2 = 6 cols)
    const bnkaColNames = bnka.columns.map(c => c.sourceName);
    console.log('BNKA merged columns superset:', bnkaColNames);
    assert(bnkaColNames.includes('MANDT') && bnkaColNames.includes('BANKS') && bnkaColNames.includes('BANKL') && 
           bnkaColNames.includes('BANKA') && bnkaColNames.includes('SWIFT') && bnkaColNames.includes('STRAS'));
    assert.strictEqual(bnka.columns.length, 6, 'BNKA superset should contain 6 merged columns');

    // Check load type auto-assignment
    assert.strictEqual(bnka.category, 'MasterData', 'BNKA should be MasterData');
    assert.strictEqual(bnka.loadType, 'Initial', 'BNKA should be Initial load');

    const acdoca = deduplicatedTables.find(t => t.sourceTable === 'ACDOCA');
    assert.strictEqual(acdoca.category, 'TransactionalData', 'ACDOCA should be TransactionalData');
    assert.strictEqual(acdoca.loadType, 'InitialAndDelta', 'ACDOCA should be InitialAndDelta');
    console.log('✓ Test 1 passed: Table deduplication and superset merging verified!\n');

    // TEST 2: Packaging with Custom Naming Overrides
    console.log('--- Test 2: Custom Naming Overrides & 100% Naming Parity ---');
    const customOverrides = {
        BNKA: {
            targetTable: 'SAP_BNKA_MASTER_LOCAL',
            businessName: 'Enterprise Bank Master Records',
            loadType: 'Initial'
        },
        ACDOCA: {
            targetTable: 'SAP_ACDOCA_UNIVERSAL_LEDGER',
            businessName: 'Universal Financial Ledger Entries',
            loadType: 'InitialAndDelta'
        }
    };

    const packageResult = transformService.generateDeduplicatedMultiTableReplicationPackage(mockModels, {
        space: 'AIS_ENTERPRISE_INBOUND',
        sourceConnection: 'S4HANA_PRD_CONN',
        flowName: 'RF_ENTERPRISE_FINANCE_HARMONIZED',
        tableOverrides: customOverrides
    });

    // Check Package Header
    assert.strictEqual(packageResult.flowName, 'RF_ENTERPRISE_FINANCE_HARMONIZED');
    assert.strictEqual(packageResult.space, 'AIS_ENTERPRISE_INBOUND');
    assert.strictEqual(packageResult.sourceConnection, 'S4HANA_PRD_CONN');
    assert.strictEqual(packageResult.tableCount, 3);
    assert.strictEqual(packageResult.taskCount, 3);

    // Check CSN Definitions
    const csnObj = packageResult.targetTablesCsnObject;
    assert.strictEqual(csnObj.$version, '2.0', 'CSN must be version 2.0');
    assert(csnObj.definitions['SAP_BNKA_MASTER_LOCAL'], 'CSN must define SAP_BNKA_MASTER_LOCAL');
    assert(csnObj.definitions['SAP_ACDOCA_UNIVERSAL_LEDGER'], 'CSN must define SAP_ACDOCA_UNIVERSAL_LEDGER');
    assert(csnObj.definitions['BKPF_TBL'], 'CSN must define BKPF_TBL with default name');

    // Check Replication Flow JSON Tasks
    const rfDef = packageResult.flowDefinition;
    assert.strictEqual(rfDef.name, 'RF_ENTERPRISE_FINANCE_HARMONIZED');
    assert.strictEqual(rfDef.target.space, 'AIS_ENTERPRISE_INBOUND');
    assert.strictEqual(rfDef.target.containerType, 'LocalTable');
    assert.strictEqual(rfDef.tasks.length, 3);

    // Verify 100% Naming Match between CSN definition and Replication Flow task targetObject
    for (const task of rfDef.tasks) {
        console.log(`Task: source '${task.sourceObject}' ➔ target '${task.targetObject}' [${task.loadType}]`);
        assert(csnObj.definitions[task.targetObject], 
            `CRITICAL PARITY FAILURE: Replication Flow target '${task.targetObject}' does not match any CSN definition!`);
        assert.strictEqual(csnObj.definitions[task.targetObject].kind, 'entity', 'CSN definition must be kind entity');
    }

    const bnkaTask = rfDef.tasks.find(t => t.sourceObject === 'BNKA');
    assert.strictEqual(bnkaTask.targetObject, 'SAP_BNKA_MASTER_LOCAL');
    assert.strictEqual(bnkaTask.loadType, 'Initial');

    const acdocaTask = rfDef.tasks.find(t => t.sourceObject === 'ACDOCA');
    assert.strictEqual(acdocaTask.targetObject, 'SAP_ACDOCA_UNIVERSAL_LEDGER');
    assert.strictEqual(acdocaTask.loadType, 'InitialAndDelta');

    // Check CLI Commands
    console.log('CLI Deploy Flow:', packageResult.cliDeployFlowCommand);
    console.log('CLI Deploy Tables:\n' + packageResult.cliDeployTablesCommand);
    assert(packageResult.cliDeployFlowCommand.includes('RF_ENTERPRISE_FINANCE_HARMONIZED'));
    assert(packageResult.cliDeployTablesCommand.includes('SAP_BNKA_MASTER_LOCAL'));
    assert(packageResult.cliDeployTablesCommand.includes('SAP_ACDOCA_UNIVERSAL_LEDGER'));

    console.log('✓ Test 2 passed: 100% Naming Parity guaranteed everywhere!\n');
    console.log('=== ALL TESTS PASSED SUCCESSFULLY! ===');
}

runTests().catch(err => {
    console.error('TEST FAILED:', err);
    process.exit(1);
});
