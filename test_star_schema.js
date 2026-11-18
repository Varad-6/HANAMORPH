const fs = require('fs');
const path = require('path');
const transformService = require('./srv/lib/transform-service');

const factModel = {
    name: 'CV_MSTRPROJECTCOST',
    viewName: 'CV_MSTRPROJECTCOST',
    type: 'CALC_VIEW',
    columns: [
        { name: 'MANDT', dataType: 'cds.String(3)', isKey: true },
        { name: 'PROJECT_ID', dataType: 'cds.String(24)', isKey: true },
        { name: 'CUSTOMER', dataType: 'cds.String(10)' },
        { name: 'COMPANY_CODE', dataType: 'cds.String(4)' },
        { name: 'PLAN_COST', dataType: 'cds.Decimal(15,2)', isMeasure: true },
        { name: 'ACTUAL_COST', dataType: 'cds.Decimal(15,2)', isMeasure: true },
        { name: 'CURRENCY', dataType: 'cds.String(5)' }
    ]
};

const customerDimModel = {
    name: 'CV_CUSTOMER',
    viewName: 'CV_CUSTOMER',
    type: 'CALC_VIEW',
    columns: [
        { name: 'MANDT', dataType: 'cds.String(3)', isKey: true },
        { name: 'CUSTOMER', dataType: 'cds.String(10)', isKey: true },
        { name: 'NAME', dataType: 'cds.String(80)' },
        { name: 'TEXT_SH', dataType: 'cds.String(40)' },
        { name: 'TEXT_MD', dataType: 'cds.String(60)' },
        { name: 'TEXT_LG', dataType: 'cds.String(100)' }
    ]
};

console.log('Testing generateStarSchemaPackage...');
const result = transformService.generateStarSchemaPackage(
    factModel,
    [customerDimModel],
    { space: 'AIS_INBOUND' }
);

console.log('Fact View Name:', result.factViewName);
console.log('Dimension View Names:', result.dimensionViewNames);
console.log('Associations Count:', result.associationCount);
console.log('Associations:', JSON.stringify(result.associations, null, 2));

const csn = result.packageCsn;
console.log('CSN Definitions keys:', Object.keys(csn.definitions));

// Validate all references exist in definitions
const allEntityKeys = new Set(Object.keys(csn.definitions));
const missing = [];
for (const [key, def] of Object.entries(csn.definitions)) {
    if (def.query?.SELECT?.from?.ref) {
        const fromRef = def.query.SELECT.from.ref[0];
        if (!allEntityKeys.has(fromRef)) missing.push(`${key} -> from: ${fromRef}`);
    }
    if (def.source?.ref) {
        const srcRef = def.source.ref[0];
        if (!allEntityKeys.has(srcRef)) missing.push(`${key} -> source: ${srcRef}`);
    }
    for (const [elKey, elVal] of Object.entries(def.elements || {})) {
        if (elVal.type === 'cds.Association' && elVal.target) {
            if (!allEntityKeys.has(elVal.target)) missing.push(`${key}.${elKey} -> target: ${elVal.target}`);
        }
    }
}

if (missing.length === 0) {
    console.log('✓ SUCCESS: ZERO missing references! All Entities, Views, Analytic Models & Associations are 100% self-contained!');
} else {
    console.error('✗ MISSING REFERENCES:', missing);
    process.exit(1);
}

// Write to exports directory
const exportPath = path.join(__dirname, 'exports', 'CV_MSTRPROJECTCOST_STAR_SCHEMA.csn.json');
fs.writeFileSync(exportPath, result.csnJsonString, 'utf8');
console.log(`Saved Star Schema CSN to: ${exportPath}`);

const exportSqlPath = path.join(__dirname, 'exports', 'CV_MSTRPROJECTCOST_STAR_SCHEMA.sql');
fs.writeFileSync(exportSqlPath, result.completeSql, 'utf8');
console.log(`Saved Star Schema SQL to: ${exportSqlPath}`);
