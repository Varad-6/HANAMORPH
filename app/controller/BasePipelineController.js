sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("hanamorph.controller.BasePipelineController", {
        initPipeline: function (sPipelineType, sTitle) {
            this._pipelineType = sPipelineType; // 'CDS' or 'CALC_VIEW'
            
            const oViewModel = new JSONModel({
                pipelineType: sPipelineType,
                title: sTitle,
                isBusy: false,
                hasImported: false,
                views: [],
                selectedViewName: "",
                selectedView: null,
                hasViewSelected: false,
                emptyViewsText: "Click 'Import' to load views from source HANA.",
                errorViewsText: "",
                hasError: false,

                // 5-Tab Navigation State
                selectedTabKey: "tabSelectView",

                // Tab 2: Artifacts section
                artifacts: [],
                hasArtifacts: false,
                isArtifactsBusy: false,
                selectedArtifactCount: 0,

                // Tab 3: Columns section (Supports custom renaming)
                columns: [],
                allColumns: [],
                columnSearchTerm: "",
                selectedColumnCount: 0,
                totalColumnCount: 0,
                isColumnsBusy: false,

                // Tab 4: Object Renaming
                naming: {
                    space: "AIS_HARMONIZATION_",
                    tableName: "",
                    tableBusinessName: "",
                    viewNameCustom: "",
                    viewBusinessName: "",
                    amName: "",
                    amBusinessName: ""
                },

                // Tab 5: Code & Downloads
                replicationFlowMode: "DELTA", // "MASTER" or "DELTA"
                sourceConnection: "S4HANA_SOURCE",
                modularResult: {
                    tableJsonString: "",
                    viewJsonString: "",
                    analyticModelJsonString: "",
                    packageJsonString: "",
                    optimizedSql: "",
                    completeDdlSql: "",
                    replicationFlowMasterJsonString: "",
                    replicationFlowDeltaJsonString: "",
                    replicationFlowCliCommand: "",
                    tableName: "",
                    viewName: "",
                    amName: ""
                },
                isGenerating: false,
                hasGenerated: false,

                // Direct Cloud Job status strip
                job: null,
                isJobRunning: false,
                currentStage: "",
                jobLogs: []
            });
            this.getView().setModel(oViewModel);

            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute(sPipelineType === 'CDS' ? "cds" : "calcview").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Auto-load views if not loaded yet
            const oModel = this.getView().getModel();
            if (!oModel.getProperty("/hasImported")) {
                this.onImportViews();
            }
        },

        onNavBack: function () {
            if (this._pollTimer) {
                clearInterval(this._pollTimer);
            }
            this.getOwnerComponent().getRouter().navTo("landing");
        },

        /* ====================================================================
         * TAB NAVIGATION METHODS
         * ==================================================================== */
        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            const oModel = this.getView().getModel();
            oModel.setProperty("/selectedTabKey", sKey);

            if (sKey === "tabColumns" && (!oModel.getProperty("/columns") || oModel.getProperty("/columns").length === 0)) {
                const sViewName = oModel.getProperty("/selectedViewName");
                if (sViewName) {
                    this._loadColumns(sViewName);
                }
            }
        },

        goToTab: function (sTabKey) {
            const oModel = this.getView().getModel();
            oModel.setProperty("/selectedTabKey", sTabKey);
        },

        onGoToSelectView: function () {
            this.goToTab("tabSelectView");
        },

        onGoToArtifacts: function () {
            const oModel = this.getView().getModel();
            if (!oModel.getProperty("/selectedViewName")) {
                MessageBox.warning("Please select a view first.");
                return;
            }
            this.goToTab("tabArtifacts");
        },

        onGoToColumns: function () {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/selectedViewName");
            if (!sViewName) {
                MessageBox.warning("Please select a view first.");
                return;
            }
            if (!oModel.getProperty("/columns") || oModel.getProperty("/columns").length === 0) {
                this._loadColumns(sViewName);
            }
            this.goToTab("tabColumns");
        },

        onGoToNaming: function () {
            const oModel = this.getView().getModel();
            if (!oModel.getProperty("/selectedViewName")) {
                MessageBox.warning("Please select a view first.");
                return;
            }
            this._initDefaultNaming();
            this.goToTab("tabNaming");
        },

        onGoToDownloads: function () {
            const oModel = this.getView().getModel();
            if (!oModel.getProperty("/hasGenerated")) {
                this.onGenerateArtifacts();
            } else {
                this.goToTab("tabCodeDownloads");
            }
        },

        /* ====================================================================
         * STEP 1: IMPORT & SELECT VIEW
         * ==================================================================== */
        onImportViews: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/isBusy", true);
            oModel.setProperty("/errorViewsText", "");
            oModel.setProperty("/hasError", false);

            const sEndpoint = this._pipelineType === 'CDS' 
                ? "/odata/v4/migration/listCDSViews()"
                : "/odata/v4/migration/listCalcViews()";

            fetch(sEndpoint)
                .then(res => {
                    if (!res.ok) {
                        return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                    }
                    return res.json();
                })
                .then(data => {
                    const aViews = data.value || [];
                    oModel.setProperty("/views", aViews);
                    oModel.setProperty("/hasImported", true);
                    oModel.setProperty("/isBusy", false);

                    if (aViews.length === 0) {
                        oModel.setProperty("/emptyViewsText", `No ${this._pipelineType} views found on source HANA.`);
                    } else {
                        MessageToast.show(`Imported ${aViews.length} views from source HANA.`);
                        if (!oModel.getProperty("/selectedViewName") && aViews.length > 0) {
                            this._selectView(aViews[0].name);
                        }
                    }
                })
                .catch(err => {
                    oModel.setProperty("/isBusy", false);
                    oModel.setProperty("/hasError", true);
                    oModel.setProperty("/errorViewsText", err.message);
                    MessageBox.error(`Import failed: ${err.message}`);
                });
        },

        onViewChange: function (oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
            this._selectView(sSelectedKey);
        },

        _selectView: function (sViewName) {
            const oModel = this.getView().getModel();
            if (!sViewName) {
                oModel.setProperty("/selectedViewName", "");
                oModel.setProperty("/selectedView", null);
                oModel.setProperty("/hasViewSelected", false);
                oModel.setProperty("/artifacts", []);
                oModel.setProperty("/hasArtifacts", false);
                oModel.setProperty("/columns", []);
                oModel.setProperty("/allColumns", []);
                return;
            }

            const aViews = oModel.getProperty("/views") || [];
            const oSelected = aViews.find(v => v.name === sViewName);
            oModel.setProperty("/selectedViewName", sViewName);
            oModel.setProperty("/selectedView", oSelected);
            oModel.setProperty("/hasViewSelected", true);
            oModel.setProperty("/isArtifactsBusy", true);
            oModel.setProperty("/job", null);
            oModel.setProperty("/hasGenerated", false);

            this._loadArtifacts(sViewName);
            this._loadColumns(sViewName);
            this._initDefaultNaming(sViewName);
        },

        /* ====================================================================
         * STEP 2: ARTIFACTS
         * ==================================================================== */
        _loadArtifacts: function (sViewName) {
            const oModel = this.getView().getModel();
            oModel.setProperty("/isArtifactsBusy", true);

            fetch(`/odata/v4/migration/getArtifacts(viewName='${encodeURIComponent(sViewName)}')`)
                .then(res => res.json())
                .then(data => {
                    const aArtifacts = (data.value || []).map(art => {
                        art.selected = true;
                        return art;
                    });
                    oModel.setProperty("/artifacts", aArtifacts);
                    oModel.setProperty("/hasArtifacts", aArtifacts.length > 0);
                    oModel.setProperty("/selectedArtifactCount", aArtifacts.length);
                    oModel.setProperty("/isArtifactsBusy", false);

                    const oTable = this.byId("artifactTable");
                    if (oTable) {
                        oTable.selectAll();
                    }
                })
                .catch(err => {
                    oModel.setProperty("/isArtifactsBusy", false);
                    MessageBox.error(`Failed to load artifacts: ${err.message}`);
                });
        },

        onArtifactSelectionChange: function () {
            const oTable = this.byId("artifactTable");
            const aSelected = oTable ? oTable.getSelectedItems() : [];
            const oModel = this.getView().getModel();
            oModel.setProperty("/selectedArtifactCount", aSelected.length);
        },

        /* ====================================================================
         * STEP 3: COLUMNS & RENAMING
         * ==================================================================== */
        _loadColumns: function (sViewName) {
            const oModel = this.getView().getModel();
            oModel.setProperty("/isColumnsBusy", true);

            fetch(`/odata/v4/migration/getColumns(viewName='${encodeURIComponent(sViewName)}')`)
                .then(res => res.json())
                .then(data => {
                    const aCols = (data.value || []).map(c => ({
                        ...c,
                        selected: true,
                        sourceName: c.name,
                        targetName: c.name,
                        targetLabel: c.originalName || c.name
                    }));
                    oModel.setProperty("/allColumns", aCols);
                    oModel.setProperty("/columns", aCols);
                    oModel.setProperty("/totalColumnCount", aCols.length);
                    oModel.setProperty("/selectedColumnCount", aCols.length);
                    oModel.setProperty("/isColumnsBusy", false);
                })
                .catch(err => {
                    oModel.setProperty("/isColumnsBusy", false);
                    console.error("Column load error:", err);
                });
        },

        onSearchColumns: function (oEvent) {
            const sQuery = (oEvent.getParameter("newValue") || "").toLowerCase().trim();
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            
            if (!sQuery) {
                oModel.setProperty("/columns", aAll);
                return;
            }

            const aFiltered = aAll.filter(c => 
                (c.name && c.name.toLowerCase().includes(sQuery)) ||
                (c.targetName && c.targetName.toLowerCase().includes(sQuery)) ||
                (c.originalName && c.originalName.toLowerCase().includes(sQuery)) ||
                (c.dataType && c.dataType.toLowerCase().includes(sQuery))
            );
            oModel.setProperty("/columns", aFiltered);
        },

        onSelectAllColumns: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            aAll.forEach(c => c.selected = true);
            oModel.setProperty("/allColumns", [...aAll]);
            oModel.setProperty("/columns", [...oModel.getProperty("/columns")]);
            oModel.setProperty("/selectedColumnCount", aAll.length);
            MessageToast.show(`Selected all ${aAll.length} columns.`);
        },

        onDeselectAllColumns: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            aAll.forEach(c => c.selected = false);
            oModel.setProperty("/allColumns", [...aAll]);
            oModel.setProperty("/columns", [...oModel.getProperty("/columns")]);
            oModel.setProperty("/selectedColumnCount", 0);
            MessageToast.show("Deselected all columns.");
        },

        onSelectMeasuresOnly: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            let nCount = 0;
            aAll.forEach(c => {
                c.selected = !!c.isMeasure || !!c.isKey;
                if (c.selected) nCount++;
            });
            oModel.setProperty("/allColumns", [...aAll]);
            oModel.setProperty("/columns", [...oModel.getProperty("/columns")]);
            oModel.setProperty("/selectedColumnCount", nCount);
            MessageToast.show(`Selected ${nCount} measures & keys.`);
        },

        onColumnCheckboxChange: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            const nCount = aAll.filter(c => c.selected).length;
            oModel.setProperty("/selectedColumnCount", nCount);
        },

        /* Column Quick Naming Helpers */
        onApplyPascalCase: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            aAll.forEach(c => {
                c.targetName = c.name
                    .toLowerCase()
                    .replace(/[^a-zA-Z0-9]+(.)/g, (m, chr) => chr.toUpperCase())
                    .replace(/^[a-z]/, ch => ch.toUpperCase());
            });
            oModel.setProperty("/allColumns", [...aAll]);
            oModel.setProperty("/columns", [...oModel.getProperty("/columns")]);
            MessageToast.show("Applied PascalCase to target column names.");
        },

        onApplyUpperSnakeCase: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            aAll.forEach(c => {
                c.targetName = c.name
                    .replace(/([a-z])([A-Z])/g, '$1_$2')
                    .replace(/[\s\-]+/g, '_')
                    .toUpperCase();
            });
            oModel.setProperty("/allColumns", [...aAll]);
            oModel.setProperty("/columns", [...oModel.getProperty("/columns")]);
            MessageToast.show("Applied UPPER_SNAKE to target column names.");
        },

        onResetColumnNames: function () {
            const oModel = this.getView().getModel();
            const aAll = oModel.getProperty("/allColumns") || [];
            aAll.forEach(c => {
                c.targetName = c.sourceName || c.name;
                c.targetLabel = c.originalName || c.name;
            });
            oModel.setProperty("/allColumns", [...aAll]);
            oModel.setProperty("/columns", [...oModel.getProperty("/columns")]);
            MessageToast.show("Reset column names back to original source names.");
        },

        /* ====================================================================
         * STEP 4: OBJECT NAMING
         * ==================================================================== */
        _initDefaultNaming: function (sName) {
            const oModel = this.getView().getModel();
            const sViewName = sName || oModel.getProperty("/selectedViewName") || "VIEW";
            const oSelectedView = oModel.getProperty("/selectedView") || {};

            // Build smart suggestions for Source Object in Datasphere
            const aSourceSuggestions = [
                { key: sViewName, text: `${sViewName} (Existing CDS/Remote Table in Space)` },
                { key: `${sViewName}_TBL`, text: `${sViewName}_TBL (New Local Table)` }
            ];

            if (oSelectedView.dependencies && oSelectedView.dependencies.length > 0) {
                oSelectedView.dependencies.forEach(d => {
                    if (d.BASE_OBJECT_NAME && !aSourceSuggestions.find(s => s.key === d.BASE_OBJECT_NAME)) {
                        aSourceSuggestions.splice(1, 0, {
                            key: d.BASE_OBJECT_NAME,
                            text: `${d.BASE_OBJECT_NAME} (Underlying Physical Table)`
                        });
                    }
                });
            }

            oModel.setProperty("/sourceSuggestions", aSourceSuggestions);
            oModel.setProperty("/naming", {
                space: "AIS_HARMONIZATION_",
                fromTableName: sViewName, // Default to existing view name so it avoids "missing object" error!
                tableName: `${sViewName}_TBL`,
                tableBusinessName: `${sViewName} Base Table`,
                viewNameCustom: `${sViewName}_V`,
                viewBusinessName: `${sViewName} Fact View`,
                amName: `${sViewName}_AM`,
                amBusinessName: `${sViewName} Consumption Model`
            });
        },

        /* ====================================================================
         * STEP 5: GENERATE ARTIFACTS, COPY SQL & DOWNLOADS
         * ==================================================================== */
        onGenerateArtifacts: function () {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/selectedViewName");
            if (!sViewName) {
                MessageBox.warning("Please select a view first.");
                return;
            }

            const aAllCols = oModel.getProperty("/allColumns") || [];
            const aSelectedCols = aAllCols.filter(c => c.selected).map(c => ({
                sourceName: c.sourceName || c.name,
                targetName: (c.targetName || c.name).trim(),
                targetLabel: (c.targetLabel || c.originalName || c.name).trim(),
                dataType: c.dataType,
                isKey: !!c.isKey,
                isMeasure: !!c.isMeasure
            }));

            if (aSelectedCols.length === 0) {
                MessageBox.warning("Please select at least one column.");
                return;
            }

            const oNaming = oModel.getProperty("/naming") || {};

            oModel.setProperty("/isGenerating", true);

            fetch("/odata/v4/migration/generateModularArtifacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    viewName: sViewName,
                    selectedColumns: aSelectedCols.map(c => c.sourceName),
                    columnsJson: JSON.stringify(aSelectedCols),
                    space: oNaming.space || "AIS_HARMONIZATION_",
                    fromTableName: oNaming.fromTableName || oNaming.tableName || `${sViewName}_TBL`,
                    tableName: oNaming.tableName,
                    tableBusinessName: oNaming.tableBusinessName,
                    viewNameCustom: oNaming.viewNameCustom,
                    viewBusinessName: oNaming.viewBusinessName,
                    amName: oNaming.amName,
                    amBusinessName: oNaming.amBusinessName
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                }
                return res.json();
            })
            .then(data => {
                oModel.setProperty("/modularResult", data);
                oModel.setProperty("/hasGenerated", true);
                oModel.setProperty("/isGenerating", false);
                this.goToTab("tabCodeDownloads");
                MessageToast.show("Optimized View SQL and standard CSN JSONs generated successfully!");
            })
            .catch(err => {
                oModel.setProperty("/isGenerating", false);
                MessageBox.error(`Generation failed: ${err.message}`);
            });
        },

        /**
         * Copy pure SELECT query (Ready for Datasphere Data Builder -> New SQL View)
         */
        onCopySql: function () {
            const oModel = this.getView().getModel();
            const sSql = oModel.getProperty("/modularResult/optimizedSql");
            if (!sSql) {
                MessageBox.warning("No SQL code generated yet.");
                return;
            }

            this._copyTextToClipboard(sSql, "SQL Query copied! Paste directly into Datasphere New SQL View (without CREATE VIEW wrapper).");
        },

        /**
         * Copy complete DDL (CREATE VIEW ... AS SELECT ...)
         */
        onCopyCompleteDdl: function () {
            const oModel = this.getView().getModel();
            const sSql = oModel.getProperty("/modularResult/completeDdlSql") || oModel.getProperty("/modularResult/optimizedSql");
            if (!sSql) {
                MessageBox.warning("No SQL code generated yet.");
                return;
            }

            this._copyTextToClipboard(sSql, "Full DDL copied! Suitable for SAP HANA Database Explorer / SQL Console.");
        },

        _copyTextToClipboard: function (sText, sSuccessMsg) {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(sText)
                    .then(() => {
                        MessageToast.show(sSuccessMsg);
                    })
                    .catch(() => {
                        this._fallbackCopyText(sText, sSuccessMsg);
                    });
            } else {
                this._fallbackCopyText(sText, sSuccessMsg);
            }
        },

        _fallbackCopyText: function (sText, sSuccessMsg) {
            const oTextArea = document.createElement("textarea");
            oTextArea.value = sText;
            document.body.appendChild(oTextArea);
            oTextArea.select();
            try {
                document.execCommand("copy");
                MessageToast.show(sSuccessMsg);
            } catch (err) {
                MessageBox.information("Please select and copy the SQL code manually.");
            }
            document.body.removeChild(oTextArea);
        },

        /**
         * Download Unified CSN Package (Table + View + Analytic Model in ONE file)
         */
        onDownloadPackageJson: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/modularResult/packageJsonString");
            const sName = oModel.getProperty("/modularResult/viewName") || "Package";
            if (!sJson) {
                MessageBox.warning("Please generate artifacts first.");
                return;
            }
            this._downloadFile(`${sName}_complete_package.csn.json`, sJson, "application/json");
            MessageToast.show(`Downloaded ${sName}_complete_package.csn.json (Use in Data Builder -> Import Objects from CSN/JSON File)`);
        },

        onDownloadTableJson: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/modularResult/tableJsonString");
            const sName = oModel.getProperty("/modularResult/tableName") || "Table";
            if (!sJson) {
                MessageBox.warning("Please generate artifacts first.");
                return;
            }
            this._downloadFile(`${sName}_table.csn.json`, sJson, "application/json");
            MessageToast.show(`Downloaded ${sName}_table.csn.json (Native CSN for Data Builder -> Tables)`);
        },

        onDownloadViewJson: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/modularResult/viewJsonString");
            const sName = oModel.getProperty("/modularResult/viewName") || "View";
            if (!sJson) {
                MessageBox.warning("Please generate artifacts first.");
                return;
            }
            this._downloadFile(`${sName}_view.csn.json`, sJson, "application/json");
            MessageToast.show(`Downloaded ${sName}_view.csn.json (Native CSN for Data Builder -> Views)`);
        },

        onDownloadAmJson: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/modularResult/analyticModelJsonString");
            const sName = oModel.getProperty("/modularResult/amName") || "AnalyticModel";
            if (!sJson) {
                MessageBox.warning("Please generate artifacts first.");
                return;
            }
            this._downloadFile(`${sName}_am.csn.json`, sJson, "application/json");
            MessageToast.show(`Downloaded ${sName}_am.csn.json (Native CSN for Business Builder -> Analytic Models)`);
        },

        /* ====================================================================
         * REPLICATION FLOW GENERATION (TARGET: LOCAL TABLES)
         * ==================================================================== */
        onDownloadReplicationFlow: function () {
            const oModel = this.getView().getModel();
            const sMode = oModel.getProperty("/replicationFlowMode") || "DELTA";
            const sJson = sMode === "MASTER" 
                ? oModel.getProperty("/modularResult/replicationFlowMasterJsonString")
                : oModel.getProperty("/modularResult/replicationFlowDeltaJsonString");
            const sTableName = oModel.getProperty("/modularResult/tableName") || "Table";

            if (!sJson) {
                MessageBox.warning("Please generate artifacts first.");
                return;
            }

            const sFileName = `RF_${sTableName}_${sMode.toLowerCase()}.replicationFlow.json`;
            this._downloadFile(sFileName, sJson, "application/json");
            MessageToast.show(`Downloaded ${sFileName} (Datasphere Replication Flow to Local Table)`);
        },

        onCopyReplicationCli: function () {
            const oModel = this.getView().getModel();
            const sCmd = oModel.getProperty("/modularResult/replicationFlowCliCommand");
            if (!sCmd) {
                MessageBox.warning("No CLI command available yet.");
                return;
            }
            this._copyTextToClipboard(sCmd, "Datasphere CLI replication-flow command copied!");
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
        },

        /* ====================================================================
         * DIRECT CLOUD TRANSFER (AUTOMATED PUSH)
         * ==================================================================== */
        onTransfer: function () {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/selectedViewName");
            const oTable = this.byId("artifactTable");
            const aSelectedItems = oTable ? oTable.getSelectedItems() : [];

            if (!sViewName) {
                MessageBox.warning("Please select a view first.");
                return;
            }

            const aArtifactNames = aSelectedItems.map(item => item.getBindingContext().getObject().name);

            oModel.setProperty("/isJobRunning", true);
            oModel.setProperty("/job", {
                status: "PENDING",
                progress: 5,
                sourceViewName: sViewName
            });
            oModel.setProperty("/currentStage", "EXTRACTING");

            fetch("/odata/v4/migration/startJob", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    viewName: sViewName,
                    viewType: this._pipelineType,
                    artifacts: aArtifactNames,
                    targetSpace: oModel.getProperty("/naming/space") || "AIS_HARMONIZATION_"
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                }
                return res.json();
            })
            .then(job => {
                this._pollJob(job.ID);
            })
            .catch(err => {
                oModel.setProperty("/isJobRunning", false);
                oModel.setProperty("/job/status", "FAILED");
                oModel.setProperty("/job/errorMessage", err.message);
                oModel.setProperty("/currentStage", "FAILED");
                MessageBox.error(`Transfer failed to start: ${err.message}`);
            });
        },

        _pollJob: function (sJobId) {
            const oModel = this.getView().getModel();
            if (this._pollTimer) {
                clearInterval(this._pollTimer);
            }

            this._pollTimer = setInterval(() => {
                fetch(`/odata/v4/migration/getJobStatus(jobId=${sJobId})`)
                    .then(res => res.json())
                    .then(job => {
                        oModel.setProperty("/job", job);
                        oModel.setProperty("/currentStage", job.status);

                        if (job.status === "COMPLETED" || job.status === "FAILED") {
                            clearInterval(this._pollTimer);
                            this._pollTimer = null;
                            oModel.setProperty("/isJobRunning", false);

                            if (job.status === "COMPLETED") {
                                MessageToast.show(`Successfully migrated ${job.targetViewName} to Datasphere!`);
                            }
                        }
                    })
                    .catch(() => {});
            }, 600);
        },

        onDownloadCsn: function () {
            const oModel = this.getView().getModel();
            const oJob = oModel.getProperty("/job");
            if (!oJob || !oJob.csnPayload) {
                MessageBox.information("No CSN available for download.");
                return;
            }
            this._downloadFile(`${oJob.targetViewName || oJob.sourceViewName}.csn.json`, oJob.csnPayload, "application/json");
        }
    });
});