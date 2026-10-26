sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("hanamorph.controller.Landing", {
        onInit: function () {
            const oBulkModel = new JSONModel({
                isBusy: false,
                hasAnalyzed: false,
                hasGeneratedBulk: false,
                report: {
                    totalViewsAnalyzed: 0,
                    uniqueSourcesFound: 0,
                    duplicateSourceCount: 0,
                    overlaps: [],
                    recommendations: []
                },
                bulkResult: null
            });
            this.getView().setModel(oBulkModel, "bulkModel");
        },

        onSelectCds: function () {
            this.getOwnerComponent().getRouter().navTo("cds");
        },

        onSelectCalcView: function () {
            this.getOwnerComponent().getRouter().navTo("calcview");
        },

        onSelectBulkStudio: function () {
            this.getOwnerComponent().getRouter().navTo("bulk");
        },

        /* ====================================================================
         * SOURCE DEDUPLICATION & RATIONALIZATION SCAN
         * ==================================================================== */
        onRunDeduplication: function () {
            const oBulkModel = this.getView().getModel("bulkModel");
            oBulkModel.setProperty("/isBusy", true);

            fetch("/odata/v4/migration/rationalizeSources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ viewNames: [] })
            })
                .then(res => {
                    if (!res.ok) {
                        return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                    }
                    return res.json();
                })
                .then(data => {
                    const oReport = data.value || data;
                    oBulkModel.setProperty("/report", oReport);
                    oBulkModel.setProperty("/hasAnalyzed", true);
                    oBulkModel.setProperty("/isBusy", false);

                    if (oReport.duplicateSourceCount > 0) {
                        MessageToast.show(`Analysis complete: Found ${oReport.duplicateSourceCount} duplicate source tables across ${oReport.totalViewsAnalyzed} views.`);
                    } else {
                        MessageToast.show("Analysis complete: All views operate on independent base sources.");
                    }
                })
                .catch(err => {
                    oBulkModel.setProperty("/isBusy", false);
                    MessageBox.error(`Deduplication scan failed: ${err.message}`);
                });
        },

        /* ====================================================================
         * BULK MASTER CSN DATA MART GENERATION
         * ==================================================================== */
        onGenerateBulkMasterCsn: function () {
            const oBulkModel = this.getView().getModel("bulkModel");
            oBulkModel.setProperty("/isBusy", true);

            // Fetch all view names from catalog first
            Promise.all([
                fetch("/odata/v4/migration/listCDSViews()").then(r => r.json()),
                fetch("/odata/v4/migration/listCalcViews()").then(r => r.json())
            ])
            .then(([cdsRes, calcRes]) => {
                const aCds = (cdsRes.value || []).map(v => v.name);
                const aCalc = (calcRes.value || []).map(v => v.name);
                const aAll = [...aCds, ...aCalc];

                return fetch("/odata/v4/migration/generateBulkArtifacts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        viewNames: aAll,
                        space: "AIS_HARMONIZATION_",
                        namingPattern: "DEFAULT"
                    })
                });
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                }
                return res.json();
            })
            .then(bulkResult => {
                oBulkModel.setProperty("/bulkResult", bulkResult);
                oBulkModel.setProperty("/hasGeneratedBulk", true);
                oBulkModel.setProperty("/isBusy", false);
                MessageToast.show(`Master CSN Bundle generated for ${bulkResult.processedViewCount} views!`);
            })
            .catch(err => {
                oBulkModel.setProperty("/isBusy", false);
                MessageBox.error(`Bulk generation failed: ${err.message}`);
            });
        },

        onDownloadMasterCsn: function () {
            const oBulkModel = this.getView().getModel("bulkModel");
            const sJson = oBulkModel.getProperty("/bulkResult/masterCsnJsonString");
            if (!sJson) {
                MessageBox.warning("Please generate the bulk bundle first.");
                return;
            }
            this._downloadFile("HanaMorph_Enterprise_DataMart.csn.json", sJson, "application/json");
            MessageToast.show("Downloaded Master CSN Bundle (Upload in Datasphere via Data Builder -> Import Objects from CSN/JSON File).");
        },

        onDownloadAggregatedSql: function () {
            const oBulkModel = this.getView().getModel("bulkModel");
            const sSql = oBulkModel.getProperty("/bulkResult/aggregatedSql");
            if (!sSql) {
                MessageBox.warning("Please generate the bulk bundle first.");
                return;
            }
            this._downloadFile("All_Views_Datasphere.sql", sSql, "text/plain");
            MessageToast.show("Downloaded aggregated SQL view statements.");
        },

        _downloadFile: function (sFileName, sContent, sMimeType) {
            const blob = new Blob([sContent], { type: sMimeType });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = sFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    });
});