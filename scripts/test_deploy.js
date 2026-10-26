const deploy = require('../srv/lib/deploy-service');

const sampleCsn = JSON.stringify({
    "$version": "2.0",
    definitions: {
        "ZC_MYQ_OrderSummary_DS": {
            kind: "entity",
            elements: { "Order": { type: "cds.String(40)", key: true } }
        }
    }
});

deploy.deployCSN('AIS_HARMONIZATION_', sampleCsn, (lvl, msg) => console.log(lvl, msg))
    .then(r => {
        console.log('DEPLOY SUCCESS:', r);
        process.exit(0);
    })
    .catch(err => {
        console.error('DEPLOY ERROR:', err);
        process.exit(1);
    });
