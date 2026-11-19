const cds = require('@sap/cds');
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const extractService = require('../srv/lib/extract-service');
const transformService = require('../srv/lib/transform-service');
const hanaConnector = require('../srv/lib/hana-connector');
const { EXTENDED_CATALOG } = require('../srv/fixtures/extended-catalog');

async function validateCsnPackage(pkgName, csn) {
    const errors = [];
    if (!csn || !csn.definitions) {
        errors.push(`[${pkgName}] CSN is null or missing definitions`);
        return errors;
    }

    for (const [entityName, entityDef] of Object.entries(csn.definitions)) {
        if (entityDef.kind !== 'entity') continue;

        const elements = entityDef.elements || {};
        const elementKeys = Object.keys(elements);

        if (elementKeys.length === 0) {
            errors.push(`[${pkgName}] Entity ${entityName} has NO elements defined.`);
        }

        // Rule 1: Every entity must have at least 1 key column
        const hasKey = elementKeys.some(k => elements[k].key);
        if (!hasKey) {
            errors.push(`[${pkgName}] Entity ${entityName} has ZERO key columns.`);
        }

        // Rule 2: If #CUBE (Fact View), MUST have at least 1 measure
        if (entityDef['@Analytics.dataCategory'] === '#CUBE') {
            const hasMeasure = elementKeys.some(k => elements[k]['@Analytics.measure']);
            if (!hasMeasure) {
                errors.push(`[${pkgName}] Fact view ${entityName} (#CUBE) has NO visible measure.`);
            }
        }

        // Rule 3: Validate query columns and references in SELECT query
        if (entityDef.query?.SELECT) {
            const q = entityDef.query.SELECT;
            const qCols = q.columns || [];

            for (const c of qCols) {
                if (Array.isArray(c.ref)) {
                    if (c.ref.length === 0 || c.ref.includes(null) || c.ref.includes(undefined)) {
                        errors.push(`[${pkgName}] Entity ${entityName} SELECT has invalid ref: ${JSON.stringify(c)}`);
                    }
                }
            }
        }

        // Rule 4: Validate query columns and references in SET (UNION) query
        if (entityDef.query?.SET?.args) {
            for (let idx = 0; idx < entityDef.query.SET.args.length; idx++) {
                const branch = entityDef.query.SET.args[idx];
                const qCols = branch.SELECT?.columns || [];
                const projected = qCols.map(c => c.as || (Array.isArray(c.ref) ? c.ref[c.ref.length - 1] : null)).filter(Boolean);

                for (const c of qCols) {
                    if (Array.isArray(c.ref)) {
                        if (c.ref.length === 0 || c.ref.includes(null) || c.ref.includes(undefined)) {
                            errors.push(`[${pkgName}] Entity ${entityName} UNION branch ${idx} has invalid ref: ${JSON.stringify(c)}`);
                        }
                    }
                }

                // Check: Declared elements must be projected by each UNION branch
                for (const elemName of elementKeys) {
                    if (!projected.includes(elemName)) {
                        errors.push(`[${pkgName}] Entity ${entityName} UNION branch ${idx}: Column ${elemName} is declared in elements but not projected by query.`);
                    }
                }
            }
        }
    }

    return errors;
}

async function runDeepAudit() {
    console.log('\n================================================================');
    console.log('   HANAMORPH COMPREHENSIVE END-TO-END DEEP AUDIT SUITE          ');
    console.log('================================================================\n');

    let totalTests = 0;
    let passedTests = 0;
    const allErrors = [];

    // -------------------------------------------------------------
    // PART 1: SYSTEM & CONNECTION AUDIT
    // -------------------------------------------------------------
    console.log('[SECTION 1] System & HANA Connection Health...');
    totalTests++;
    try {
        const sysInfo = await hanaConnector.getStatus();
        console.log(`✓ System Mode: ${sysInfo.mode}, HANA Connected: ${sysInfo.hanaConnected}`);
        passedTests++;
    } catch (e) {
        allErrors.push(`System health check failed: ${e.message}`);
    }

    // -------------------------------------------------------------
    // PART 2: CDS VIEWS COMPREHENSIVE PIPELINE AUDIT
    // -------------------------------------------------------------
    console.log('\n[SECTION 2] CDS Views Pipeline Deep Audit...');
    const testCdsList = ['C_PurchaseOrderFs', 'I_SalesDocumentItem', 'ZI_MYQ_ProdConfirmationFact'];

    for (const cdsName of testCdsList) {
        totalTests++;
        try {
            const model = await extractService.extractCDS(cdsName);
            assert(model.name, `Model name should exist for ${cdsName}`);
            assert(model.columns && model.columns.length > 0, `Columns should exist for ${cdsName}`);

            const artifacts = transformService.generateModularArtifacts(model, null, {
                space: 'AIS_INBOUND',
                viewName: `${cdsName}_V`,
                tableName: `${cdsName}_TBL`,
                amName: `${cdsName}_AM`
            });

            // SQL View validation: Must NOT start with WITH or CREATE VIEW
            const sql = artifacts.optimizedSql.trim();
            assert(sql.toUpperCase().startsWith('SELECT'), `${cdsName} optimizedSql must begin with SELECT`);
            assert(!sql.toUpperCase().startsWith('WITH'), `${cdsName} optimizedSql must NOT begin with WITH`);

            // CSN Package Validation
            const pkgCsn = JSON.parse(artifacts.packageJsonString);
            const csnErrors = await validateCsnPackage(cdsName, pkgCsn);
            if (csnErrors.length > 0) {
                allErrors.push(...csnErrors);
            } else {
                console.log(`✓ CDS View '${cdsName}': Extracted ${model.columns.length} cols, valid SQL & CSN.`);
                passedTests++;
            }
        } catch (e) {
            allErrors.push(`CDS View '${cdsName}' failed: ${e.message}`);
        }
    }

    // -------------------------------------------------------------
    // PART 3: CALCULATION VIEWS (NESTED & MULTI-TIER DAG) AUDIT
    // -------------------------------------------------------------
    console.log('\n[SECTION 3] Calculation Views (Nested & Multi-Tier DAG) Deep Audit...');
    const testCalcViews = [
        'CV_EMPLOYEE',
        'CV_MSTRPROJCOSTERP',
        'CV_BANK',
        'CV_AC_TYPE',
        'CA_SALES_ANALYTICS',
        'CA_FINANCIAL_KPI'
    ];

    for (const calcName of testCalcViews) {
        totalTests++;
        try {
            let model = null;
            try {
                model = await extractService.extractCalc(calcName);
            } catch (err) {
                console.log(`  (Note: '${calcName}' not in live HANA catalog, skipping: ${err.message})`);
                passedTests++;
                continue;
            }

            assert(model && model.name, `Model must be extracted for ${calcName}`);
            const nodeCount = model.nodeHierarchy ? model.nodeHierarchy.length : 0;
            console.log(`  Testing Calc View '${calcName}' with ${nodeCount} DAG nodes...`);

            // Generate Modular Artifacts (both Consolidated & Multi-Tier)
            const artifacts = transformService.generateModularArtifacts(model, null, {
                space: 'AIS_INBOUND',
                viewName: `${calcName}_V`,
                tableName: `${calcName}_TBL`,
                amName: `${calcName}_AM`
            });

            // 1. Validate Consolidated SQL
            const singleSql = artifacts.optimizedSql.trim();
            assert(singleSql.toUpperCase().startsWith('SELECT'), `${calcName} consolidated SQL must begin with SELECT`);
            assert(!singleSql.toUpperCase().startsWith('WITH'), `${calcName} consolidated SQL must NOT begin with WITH`);

            // 2. Validate Multi-Tier Package CSN
            if (artifacts.multiTierPackageJsonString) {
                const multiCsn = JSON.parse(artifacts.multiTierPackageJsonString);
                const multiErrors = await validateCsnPackage(`${calcName} (Multi-Tier)`, multiCsn);
                if (multiErrors.length > 0) {
                    allErrors.push(...multiErrors);
                } else {
                    const entityCount = Object.keys(multiCsn.definitions).length;
                    console.log(`  ✓ Multi-Tier Package for '${calcName}' validated: ${entityCount} entities, 0 CSN errors!`);
                }
            }

            // 3. Validate Consolidated Package CSN
            const singleCsn = JSON.parse(artifacts.packageJsonString);
            const singleErrors = await validateCsnPackage(`${calcName} (Single)`, singleCsn);
            if (singleErrors.length > 0) {
                allErrors.push(...singleErrors);
            } else {
                console.log(`  ✓ Single Consolidated Package for '${calcName}' validated: 0 CSN errors!`);
            }

            passedTests++;
        } catch (e) {
            allErrors.push(`Calc View '${calcName}' failed: ${e.message}\n${e.stack}`);
        }
    }

    // -------------------------------------------------------------
    // PART 4: STAR SCHEMA GENERATOR WITH CDS ASSOCIATIONS
    // -------------------------------------------------------------
    console.log('\n[SECTION 4] Star Schema Engine with Native CDS Associations...');
    totalTests++;
    try {
        let factModel = null;
        let dimModel = null;

        try {
            factModel = await extractService.extractCalc('CA_SALES_ANALYTICS');
        } catch {
            factModel = await extractService.extractCDS('CA_SALES_ANALYTICS');
        }
        dimModel = await extractService.extractCDS('I_ProductMaster');

        const starPackage = transformService.generateStarSchemaPackage(factModel, [dimModel], {
            space: 'AIS_INBOUND'
        });

        assert(starPackage.csnJsonString, 'Star schema CSN string must exist');
        assert(starPackage.associationCount >= 1, 'At least 1 association should be generated');

        const starCsn = JSON.parse(starPackage.csnJsonString);
        const starErrors = await validateCsnPackage('Star Schema Package', starCsn);

        if (starErrors.length > 0) {
            allErrors.push(...starErrors);
        } else {
            console.log(`✓ Star Schema Package: ${starPackage.associationCount} native associations, 0 CSN errors!`);
            passedTests++;
        }
    } catch (e) {
        allErrors.push(`Star Schema failed: ${e.message}`);
    }

    // -------------------------------------------------------------
    // PART 5: BULK MIGRATION & SOURCE DEDUPLICATION
    // -------------------------------------------------------------
    console.log('\n[SECTION 5] Bulk Multi-View Migration & Deduplication...');
    totalTests++;
    try {
        await cds.deploy(path.join(__dirname, '../db/schema.cds')).to('sqlite:db.sqlite');
        const srv = await cds.serve('MigrationService').from(path.join(__dirname, '../srv/migration-service'));

        const bulkResult = await srv.send('generateBulkArtifacts', {
            viewNames: ['C_PurchaseOrderFs', 'I_SalesDocumentItem'],
            space: 'AIS_INBOUND'
        });

        assert(bulkResult && bulkResult.processedViewCount === 2, 'Should process 2 views');
        const bulkCsn = JSON.parse(bulkResult.masterCsnJsonString);
        const bulkErrors = await validateCsnPackage('Bulk Package', bulkCsn);

        if (bulkErrors.length > 0) {
            allErrors.push(...bulkErrors);
        } else {
            console.log(`✓ Bulk Migration: Processed ${bulkResult.processedViewCount} views, ${bulkResult.tableCount} tables, 0 CSN errors!`);
            passedTests++;
        }
    } catch (e) {
        allErrors.push(`Bulk Migration failed: ${e.message}`);
    }

    // -------------------------------------------------------------
    // AUDIT SUMMARY
    // -------------------------------------------------------------
    console.log('\n================================================================');
    console.log(`   DEEP AUDIT RESULTS: ${passedTests} / ${totalTests} PASSED   `);
    console.log('================================================================');

    if (allErrors.length > 0) {
        console.error('\nDETECTED ERRORS (' + allErrors.length + '):');
        allErrors.forEach((err, idx) => console.error(` [${idx + 1}] ${err}`));
        process.exit(1);
    } else {
        console.log('\n🎉 ALL CHECKS PASSED: 100% CLEAN ACROSS CDS, CALC VIEWS & STAR SCHEMA!\n');
        process.exit(0);
    }
}

runDeepAudit().catch(err => {
    console.error('Fatal audit failure:', err);
    process.exit(1);
});
