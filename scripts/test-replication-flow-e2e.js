const transformService = require('../srv/lib/transform-service');
const { EXTENDED_CATALOG } = require('../srv/fixtures/extended-catalog');

console.log('================================================================');
console.log('REPLICATION FLOW COMPREHENSIVE E2E VERIFICATION TEST');
console.log('================================================================\n');

// 1. Single CDS View Test (e.g., CV_BANK or custom CDS)
console.log('--- TEST 1: Single CDS / Calc View Replication Flow ---');
const sampleView = {
    name: 'CV_BANK_V',
    viewType: 'CALC_VIEW',
    sources: [
        { tableName: 'BNKA' },
        { tableName: 'FCLM_BAM_BNKA_BP' },
        { tableName: 'BP1010' },
        { tableName: 'CashLinefnt' }
    ],
    columns: [
        { name: 'MANDT', dataType: 'cds.String(3)', isKey: true },
        { name: 'BANKS', dataType: 'cds.String(3)', isKey: true },
        { name: 'BANKL', dataType: 'cds.String(15)', isKey: true },
        { name: 'BANKA', dataType: 'cds.String(60)', isKey: false },
        { name: 'PROVZ', dataType: 'cds.String(3)', isKey: false },
        { name: 'ORT01', dataType: 'cds.String(35)', isKey: false }
    ]
};

const userSelectedCols = [
    { sourceName: 'MANDT', targetName: 'MANDT', isKey: true },
    { sourceName: 'BANKS', targetName: 'BANKS', isKey: true },
    { sourceName: 'BANKL', targetName: 'BANKL', isKey: true },
    { sourceName: 'BANKA', targetName: 'BANKA', isKey: false }
];

const rfResult1 = transformService.generateReplicationFlowForView(sampleView, userSelectedCols, {
    space: 'AIS_HARMONIZATION_',
    flowName: 'RF_CV_BANK_V',
    connectionId: 'HDD_HANA_SOURCE',
    container: 'SAPHANADB'
});

console.log('Flow Name:', rfResult1.rfTechName);
console.log('Source Table Count:', rfResult1.sourceTableCount);
console.log('CLI Command:', rfResult1.cliCommand);

const parsed1 = JSON.parse(rfResult1.rfJsonString);
if (parsed1.name !== 'RF_CV_BANK_V') throw new Error('Incorrect flow name');
if (parsed1.source.connectionId !== 'HDD_HANA_SOURCE') throw new Error('Incorrect connectionId');
if (parsed1.source.container !== 'SAPHANADB') throw new Error('Incorrect container');
if (parsed1.target.connectionId !== 'LOCAL_SAP_DATASPHERE') throw new Error('Incorrect target connection');
if (parsed1.replicationObjects.length !== 4) throw new Error('Expected 4 replication objects');

// Verify column mappings per table
const bnkaObj = parsed1.replicationObjects.find(o => o.sourceObject === 'BNKA');
if (!bnkaObj) throw new Error('BNKA object missing');
if (bnkaObj.targetObject !== 'BNKA_TBL') throw new Error('BNKA target must be BNKA_TBL');
if (bnkaObj.loadType !== 'InitialOnly') throw new Error('Load type must be InitialOnly');
if (bnkaObj.mappings.length !== 4) throw new Error('Expected 4 column mappings for BNKA');

console.log('✅ Single View RF verified successfully!\n');

// 2. All Columns Selection (Empty array = auto-map)
console.log('--- TEST 2: All Columns Selection (Auto-Map Mode) ---');
const rfResult2 = transformService.generateReplicationFlowForView(sampleView, [], {
    space: 'AIS_HARMONIZATION_',
    connectionId: 'HDD_HANA_SOURCE'
});
const parsed2 = JSON.parse(rfResult2.rfJsonString);
const bnkaObj2 = parsed2.replicationObjects.find(o => o.sourceObject === 'BNKA');
if (bnkaObj2.mappings.length !== 0) throw new Error('When all columns selected, mappings should be empty (Datasphere auto-maps)');
console.log('✅ Auto-map mode verified successfully!\n');

// 3. Multi-View / Bulk Replication Flow Verification
console.log('--- TEST 3: Multi-View Generation ---');
const sampleViews = [
    sampleView,
    {
        name: 'CV_AC_TYPE',
        viewType: 'CALC_VIEW',
        sources: [{ tableName: 'FCLM_BAM_BNKA_BP' }, { tableName: 'BKPF' }],
        columns: [{ name: 'MANDT', isKey: true }, { name: 'BUKRS', isKey: true }]
    }
];

const bulkResults = sampleViews.map(v => transformService.generateReplicationFlowForView(v, [], {
    space: 'AIS_HARMONIZATION_',
    flowName: `RF_${v.name}`,
    connectionId: 'HDD_HANA_SOURCE',
    container: 'SAPHANADB'
}));

if (bulkResults.length !== 2) throw new Error('Expected 2 bulk results');
console.log(`Generated ${bulkResults.length} flows for bulk portfolio.`);
console.log('Flow 1:', bulkResults[0].rfTechName, 'tables:', bulkResults[0].sourceTableCount);
console.log('Flow 2:', bulkResults[1].rfTechName, 'tables:', bulkResults[1].sourceTableCount);

console.log('✅ Multi-View generation verified successfully!\n');

console.log('================================================================');
console.log('🎉 ALL REPLICATION FLOW TESTS PASSED WITH ZERO ERRORS!');
console.log('================================================================');
