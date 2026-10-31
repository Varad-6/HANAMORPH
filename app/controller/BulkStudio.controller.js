sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("hanamorph.controller.BulkStudio", {
        onInit: function () {
            const oBulkModel = new JSONModel({
                selectedTabKey: "tabCatalog",
                isCatalogBusy: false,
                isAnalyzeBusy: false,
                isGenerateBusy: false,
                hasCatalogLoaded: false,
                hasAnalyzed: false,
                hasGeneratedBulk: false,
                totalCatalogCount: 0,
                selectedCount: 0,
                blockedCount: 0,
                keptCount: 0,
                space: "AIS_HARMONIZATION_",
                sourceConnection: "S4HANA_SOURCE",
                namingPattern: "DEFAULT",
                catalog: [],
                allCatalogItems: [],
                selectedViewNames: [],
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

            // Auto-load catalog on initialization
            this.onLoadCatalog();
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("landing");
        },

        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            this.getView().getModel("bulkModel").setProperty("/selectedTabKey", sKey);
        },

        /* ====================================================================
         * STEP 1: CATALOG LOADING & SELECTION
         * ==================================================================== */
        onLoadCatalog: function () {
            const oModel = this.getView().getModel("bulkModel");
            oModel.setProperty("/isCatalogBusy", true);

            Promise.all([
                fetch("/odata/v4/migration/listCDSViews()").then(r => r.json()),
                fetch("/odata/v4/migration/listCalcViews()").then(r => r.json())
            ])
            .then(([cdsRes, calcRes]) => {
                const aCds = (cdsRes.value || []).map(v => ({
                    ...v,
                    type: "CDS",
                    sourcesDisplay: (v.dependencies || []).map(d => d.BASE_OBJECT_NAME).join(", ") || (v.sqlViewName || "Source Table"),
                    isSelected: false
                }));

                const aCalc = (calcRes.value || []).map(v => ({
                    ...v,
                    type: "CALC_VIEW",
                    sourcesDisplay: (v.dependencies || []).map(d => d.BASE_OBJECT_NAME).join(", ") || "DataSources",
                    isSelected: false
                }));

                const aCombined = [...aCds, ...aCalc];
                oModel.setProperty("/catalog", aCombined);
                oModel.setProperty("/allCatalogItems", aCombined);
                oModel.setProperty("/totalCatalogCount", aCombined.length);
                oModel.setProperty("/hasCatalogLoaded", true);
                oModel.setProperty("/isCatalogBusy", false);

                // Default: Select first 4 views for rich out-of-the-box duplicate detection
                this.onSelectSampleViews();
                MessageToast.show(`Loaded ${aCombined.length} views from catalog.`);
            })
            .catch(err => {
                oModel.setProperty("/isCatalogBusy", false);
                MessageBox.error(`Failed to load catalog views: ${err.message}`);
            });
        },

        onSearchCatalog: function (oEvent) {
            const sQuery = (oEvent.getParameter("query") || oEvent.getParameter("newValue") || "").trim().toLowerCase();
            const oModel = this.getView().getModel("bulkModel");
            const aAll = oModel.getProperty("/allCatalogItems") || [];

            if (!sQuery) {
                oModel.setProperty("/catalog", aAll);
                return;
            }

            const aFiltered = aAll.filter(item => 
                (item.name && item.name.toLowerCase().includes(sQuery)) ||
                (item.description && item.description.toLowerCase().includes(sQuery)) ||
                (item.sourcesDisplay && item.sourcesDisplay.toLowerCase().includes(sQuery))
            );
            oModel.setProperty("/catalog", aFiltered);
        },

        onSelectAllViews: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aCatalog = oModel.getProperty("/catalog") || [];
            aCatalog.forEach(item => { item.isSelected = true; });
            oModel.setProperty("/catalog", aCatalog);
            this._updateSelectionState();
        },

        onSelectSampleViews: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aCatalog = oModel.getProperty("/catalog") || [];
            const sampleSet = [
                "I_SalesDocumentItem",
                "I_BillingDocumentItem",
                "ZI_MYQ_ProdConfirmationFact",
                "CA_SALES_ANALYTICS"
            ];
            aCatalog.forEach(item => {
                item.isSelected = sampleSet.includes(item.name);
            });
            oModel.setProperty("/catalog", aCatalog);
            this._updateSelectionState();
        },

        onClearSelection: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aCatalog = oModel.getProperty("/catalog") || [];
            aCatalog.forEach(item => { item.isSelected = false; });
            oModel.setProperty("/catalog", aCatalog);
            this._updateSelectionState();
        },

        onViewSelectionChange: function (oEvent) {
            this._updateSelectionState();
        },

        _updateSelectionState: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aCatalog = oModel.getProperty("/catalog") || [];
            const aSelected = aCatalog.filter(i => i.isSelected);
            const aSelectedNames = aSelected.map(i => i.name);

            oModel.setProperty("/selectedCount", aSelected.length);
            oModel.setProperty("/selectedViewNames", aSelectedNames);
        },

        onGoToStep1: function () {
            this.getView().getModel("bulkModel").setProperty("/selectedTabKey", "tabCatalog");
        },

        /* ====================================================================
         * STEP 2: DEDUPLICATION & OVERLAP ANALYSIS
         * ==================================================================== */
        onGoToStep2: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aSelectedNames = oModel.getProperty("/selectedViewNames") || [];

            if (aSelectedNames.length < 2) {
                MessageBox.warning("Please select at least 2 views to analyze duplicate sources and lineage.");
                return;
            }

            oModel.setProperty("/isAnalyzeBusy", true);
            oModel.setProperty("/selectedTabKey", "tabDeduplication");

            // Post selected views to rationalizeSources
            fetch("/odata/v4/migration/rationalizeSources", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ viewNames: aSelectedNames })
            })
                .then(res => {
                    if (!res.ok) {
                        return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                    }
                    return res.json();
                })
                .then(data => {
                    const oReport = data.value || data;
                    // Initialize each overlap with default decision: 'BLOCK' (Merge into shared star schema)
                    (oReport.overlaps || []).forEach(o => {
                        o.decision = "BLOCK";
                    });

                    oModel.setProperty("/report", oReport);
                    oModel.setProperty("/hasAnalyzed", true);
                    oModel.setProperty("/isAnalyzeBusy", false);

                    this._updateDecisionCounts();

                    if (oReport.duplicateSourceCount > 0) {
                        MessageToast.show(`Analysis complete: ${oReport.duplicateSourceCount} shared tables detected across ${oReport.totalViewsAnalyzed} views.`);
                    } else {
                        MessageToast.show("Analysis complete: No duplicate tables found across selected views.");
                    }
                })
                .catch(err => {
                    oModel.setProperty("/isAnalyzeBusy", false);
                    MessageBox.error(`Deduplication scan failed: ${err.message}`);
                });
        },

        onRescanDuplicates: function () {
            this.onGoToStep2();
        },

        onDecisionChange: function () {
            this._updateDecisionCounts();
        },

        onBlockAllDuplicates: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aOverlaps = oModel.getProperty("/report/overlaps") || [];
            aOverlaps.forEach(o => { o.decision = "BLOCK"; });
            oModel.setProperty("/report/overlaps", aOverlaps);
            this._updateDecisionCounts();
            MessageToast.show("All duplicate tables set to BLOCK (Consolidate into single shared table).");
        },

        onKeepAllDuplicates: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aOverlaps = oModel.getProperty("/report/overlaps") || [];
            aOverlaps.forEach(o => { o.decision = "KEEP"; });
            oModel.setProperty("/report/overlaps", aOverlaps);
            this._updateDecisionCounts();
            MessageToast.show("All duplicate tables set to KEEP (Preserve separate isolated copies per view).");
        },

        _updateDecisionCounts: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aOverlaps = oModel.getProperty("/report/overlaps") || [];
            let nBlocked = 0;
            let nKept = 0;

            aOverlaps.forEach(o => {
                if (o.decision === "KEEP") {
                    nKept++;
                } else {
                    nBlocked++;
                }
            });

            oModel.setProperty("/blockedCount", nBlocked);
            oModel.setProperty("/keptCount", nKept);
        },

        /* ====================================================================
         * STEP 3: MASTER DATA MART & REPLICATION FLOWS
         * ==================================================================== */
        onGoToStep3: function () {
            const oModel = this.getView().getModel("bulkModel");
            oModel.setProperty("/selectedTabKey", "tabGeneration");
            if (!oModel.getProperty("/hasGeneratedBulk")) {
                this.onGenerateArtifacts();
            }
        },

        onGenerateArtifacts: function () {
            const oModel = this.getView().getModel("bulkModel");
            const aSelectedNames = oModel.getProperty("/selectedViewNames") || [];
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sNaming = oModel.getProperty("/namingPattern") || "DEFAULT";

            // Build decisions map { "VBAK": "BLOCK", ... }
            const aOverlaps = oModel.getProperty("/report/overlaps") || [];
            const oDecisions = {};
            aOverlaps.forEach(o => {
                oDecisions[o.tableName] = o.decision || "BLOCK";
            });

            oModel.setProperty("/isGenerateBusy", true);

            fetch("/odata/v4/migration/generateBulkArtifacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    viewNames: aSelectedNames,
                    space: sSpace,
                    namingPattern: sNaming,
                    deduplicationDecisions: JSON.stringify(oDecisions)
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                }
                return res.json();
            })
            .then(data => {
                const bulkResult = data.value || data;
                oModel.setProperty("/bulkResult", bulkResult);
                oModel.setProperty("/hasGeneratedBulk", true);
                oModel.setProperty("/isGenerateBusy", false);
                MessageToast.show(`Enterprise Data Mart generated successfully (${bulkResult.processedViewCount} views bundled).`);
            })
            .catch(err => {
                oModel.setProperty("/isGenerateBusy", false);
                MessageBox.error(`Generation failed: ${err.message}`);
            });
        },

        /* ====================================================================
         * DOWNLOAD & CLIPBOARD UTILITIES
         * ==================================================================== */
        _downloadFile: function (sContent, sFileName, sMimeType) {
            if (!sContent) {
                MessageBox.warning("No content available to download.");
                return;
            }
            const sCleanName = (sFileName || "export.json")
                .replace(/^[\/\\]+/, "")
                .replace(/[\/\\]+/g, "_")
                .replace(/[^a-zA-Z0-9_\-\.]/g, "_");

            const blob = new Blob([sContent], { type: sMimeType });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = sCleanName;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
                window.URL.revokeObjectURL(url);
            }, 1000);
            MessageToast.show(`Downloaded: ${sCleanName}`);
        },

        _copyToClipboard: function (sText, sSuccessMsg) {
            if (!sText) {
                MessageBox.warning("No content available to copy.");
                return;
            }
            if (navigator.clipboard && window.isSecureContext) {
                navigator.clipboard.writeText(sText).then(() => {
                    MessageToast.show(sSuccessMsg || "Copied to clipboard!");
                }).catch(() => {
                    this._fallbackCopy(sText, sSuccessMsg);
                });
            } else {
                this._fallbackCopy(sText, sSuccessMsg);
            }
        },

        _fallbackCopy: function (sText, sSuccessMsg) {
            const textArea = document.createElement("textarea");
            textArea.value = sText;
            textArea.style.position = "fixed";
            textArea.style.left = "-999999px";
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            try {
                document.execCommand("copy");
                MessageToast.show(sSuccessMsg || "Copied to clipboard!");
            } catch (err) {
                MessageBox.error("Failed to copy content to clipboard.");
            }
            document.body.removeChild(textArea);
        },

        onDownloadMasterCsn: function () {
            const oResult = this.getView().getModel("bulkModel").getProperty("/bulkResult");
            if (oResult && oResult.masterCsnJsonString) {
                this._downloadFile(oResult.masterCsnJsonString, "HanaMorph_Enterprise_DataMart.csn.json", "application/json");
            }
        },

        onCopyMasterCsn: function () {
            const oResult = this.getView().getModel("bulkModel").getProperty("/bulkResult");
            if (oResult && oResult.masterCsnJsonString) {
                this._copyToClipboard(oResult.masterCsnJsonString, "Master CSN JSON copied to clipboard!");
            }
        },

        onDownloadAggregatedSql: function () {
            const oResult = this.getView().getModel("bulkModel").getProperty("/bulkResult");
            if (oResult && oResult.aggregatedSql) {
                this._downloadFile(oResult.aggregatedSql, "All_Views_Datasphere.sql", "text/plain");
            }
        },

        onCopyAggregatedSql: function () {
            const oResult = this.getView().getModel("bulkModel").getProperty("/bulkResult");
            if (oResult && oResult.aggregatedSql) {
                this._copyToClipboard(oResult.aggregatedSql, "Aggregated SQL script copied to clipboard!");
            }
        },

        onDownloadReplicationFlow: function () {
            const oResult = this.getView().getModel("bulkModel").getProperty("/bulkResult");
            if (oResult && oResult.replicationFlowJsonString) {
                this._downloadFile(oResult.replicationFlowJsonString, "HanaMorph_Enterprise_ReplicationFlow.replicationFlow.json", "application/json");
            }
        },

        onCopyReplicationCli: function () {
            const oResult = this.getView().getModel("bulkModel").getProperty("/bulkResult");
            if (oResult && oResult.replicationFlowCliCommand) {
                this._copyToClipboard(oResult.replicationFlowCliCommand, "Datasphere CLI deploy command copied!");
            }
        }
    });
});
