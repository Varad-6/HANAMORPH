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
                selectedModule: "ALL",
                searchQuery: "",
                selectionCart: [],
                cartCount: 0,
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
        onModuleChange: function () {
            this.onTriggerSearch();
        },

        onLiveSearch: function (oEvent) {
            const sValue = oEvent.getParameter("newValue") || "";
            const oModel = this.getView().getModel();
            oModel.setProperty("/searchQuery", sValue);

            if (this._debounceTimer) {
                clearTimeout(this._debounceTimer);
            }
            this._debounceTimer = setTimeout(() => {
                this.onTriggerSearch();
            }, 350);
        },

        onTriggerSearch: function () {
            const oModel = this.getView().getModel();
            const sQuery = oModel.getProperty("/searchQuery") || "";
            const sModule = oModel.getProperty("/selectedModule") || "ALL";
            const sViewType = this._pipelineType === 'CDS' ? 'CDS' : 'CALC_VIEW';

            oModel.setProperty("/isBusy", true);
            oModel.setProperty("/hasError", false);
            oModel.setProperty("/errorViewsText", "");

            const sUrl = `/odata/v4/migration/searchViews(query='${encodeURIComponent(sQuery)}',module='${encodeURIComponent(sModule)}',viewType='${sViewType}',topLimit=80)`;

            fetch(sUrl)
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
                        MessageToast.show("No views matched your filter.");
                    }
                })
                .catch(err => {
                    oModel.setProperty("/isBusy", false);
                    oModel.setProperty("/hasError", true);
                    oModel.setProperty("/errorViewsText", err.message);
                });
        },

        onTableSelectionChange: function (oEvent) {
            const oSelectedItem = oEvent.getParameter("listItem");
            if (!oSelectedItem) return;
            const oContext = oSelectedItem.getBindingContext();
            if (!oContext) return;
            const sViewName = oContext.getProperty("name");
            this._selectView(sViewName);
        },

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

                    const oTable = this.byId("artifactsTable") || this.byId("artifactTable");
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
            const oTable = this.byId("artifactsTable") || this.byId("artifactTable");
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

            // Clean technical name for Datasphere (No slashes, valid identifier)
            const sCleanName = sViewName
                .replace(/^[\/\\]+/, "")
                .replace(/[\/\\]+/g, "_")
                .replace(/[^a-zA-Z0-9_]/g, "_");
            const sTechBase = /^[0-9]/.test(sCleanName) ? `_${sCleanName}` : sCleanName;

            // Build smart suggestions for Source Object in Datasphere
            const aSourceSuggestions = [
                { key: `${sTechBase}_TBL`, text: `${sTechBase}_TBL (New Local Table in Space)` },
                { key: sTechBase, text: `${sTechBase} (Existing Table/Remote Table in Space)` }
            ];

            if (oSelectedView.dependencies && oSelectedView.dependencies.length > 0) {
                oSelectedView.dependencies.forEach(d => {
                    const rawDep = d.BASE_OBJECT_NAME;
                    if (rawDep) {
                        const cleanDep = rawDep.replace(/^[\/\\]+/, "").replace(/[\/\\]+/g, "_").replace(/[^a-zA-Z0-9_]/g, "_");
                        if (!aSourceSuggestions.find(s => s.key === cleanDep)) {
                            aSourceSuggestions.push({
                                key: cleanDep,
                                text: `${cleanDep} (Underlying Physical Table)`
                            });
                        }
                    }
                });
            }

            oModel.setProperty("/sourceSuggestions", aSourceSuggestions);
            oModel.setProperty("/naming", {
                space: "AIS_HARMONIZATION_",
                fromTableName: `${sTechBase}_TBL`,
                tableName: `${sTechBase}_TBL`,
                tableBusinessName: `${sTechBase} Base Table`,
                viewNameCustom: `${sTechBase}_V`,
                viewBusinessName: `${sTechBase} Fact View`,
                amName: `${sTechBase}_AM`,
                amBusinessName: `${sTechBase} Consumption Model`,
                semanticUsage: "FACT"
            });
        },

        /* ====================================================================
         * STEP 5: GENERATE ARTIFACTS, COPY SQL & DOWNLOADS
         * ==================================================================== */
        onGenerateArtifacts: function (fnSuccessCallback) {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/selectedViewName");
            if (!sViewName) {
                MessageBox.warning("Please select a view first.");
                return;
            }

            const aAllCols = oModel.getProperty("/allColumns") || [];
            let aSelectedCols = aAllCols.filter(c => c.selected).map(c => ({
                sourceName: c.sourceName || c.name,
                targetName: (c.targetName || c.name).trim(),
                targetLabel: (c.targetLabel || c.originalName || c.name).trim(),
                dataType: c.dataType,
                isKey: !!c.isKey,
                isMeasure: !!c.isMeasure
            }));

            // If none explicitly checked, default to all available columns
            if (aSelectedCols.length === 0 && aAllCols.length > 0) {
                aSelectedCols = aAllCols.map(c => ({
                    sourceName: c.name,
                    targetName: c.name,
                    targetLabel: c.originalName || c.name,
                    dataType: c.dataType,
                    isKey: !!c.isKey,
                    isMeasure: !!c.isMeasure
                }));
            }

            const oNaming = oModel.getProperty("/naming") || {};

            oModel.setProperty("/isGenerating", true);

            fetch("/odata/v4/migration/generateModularArtifacts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    viewName: sViewName,
                    viewType: this._pipelineType,
                    selectedColumns: aSelectedCols.map(c => c.sourceName),
                    columnsJson: aSelectedCols.length > 0 ? JSON.stringify(aSelectedCols) : null,
                    space: oNaming.space || "AIS_HARMONIZATION_",
                    fromTableName: oNaming.fromTableName || oNaming.tableName || `${sViewName}_TBL`,
                    tableName: oNaming.tableName,
                    tableBusinessName: oNaming.tableBusinessName,
                    viewNameCustom: oNaming.viewNameCustom,
                    viewBusinessName: oNaming.viewBusinessName,
                    amName: oNaming.amName,
                    amBusinessName: oNaming.amBusinessName,
                    semanticUsage: oNaming.semanticUsage || "FACT"
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                }
                return res.json();
            })
            .then(data => {
                const oResult = (data && data.value) ? data.value : (data && data.d) ? data.d : data;
                if (oResult && oResult.tierSqlsJsonString) {
                    try {
                        oResult.tierSqls = JSON.parse(oResult.tierSqlsJsonString);
                    } catch (e) {
                        oResult.tierSqls = [];
                    }
                }
                oModel.setProperty("/modularResult", oResult);
                oModel.setProperty("/hasGenerated", true);
                oModel.setProperty("/isGenerating", false);
                this.goToTab("tabCodeDownloads");
                MessageToast.show("Optimized View SQL and standard CSN JSONs generated successfully!");
                if (typeof fnSuccessCallback === "function") {
                    fnSuccessCallback(oResult);
                }
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
         * Ensure artifacts are generated before any download or export
         */
        _ensureArtifactsGenerated: function (fnCallback) {
            const oModel = this.getView().getModel();
            if (oModel.getProperty("/hasGenerated") && oModel.getProperty("/modularResult")) {
                if (typeof fnCallback === "function") fnCallback();
                return;
            }
            this.onGenerateArtifacts(() => {
                if (typeof fnCallback === "function") fnCallback();
            });
        },

        _getCleanName: function (suffix) {
            const oModel = this.getView().getModel();
            const rawName = oModel.getProperty("/modularResult/viewName") || 
                            oModel.getProperty("/selectedViewName") || 
                            "Datasphere_Artifact";
            const clean = rawName
                .replace(/^[\/\\]+/, "")
                .replace(/[\/\\]+/g, "_")
                .replace(/[^a-zA-Z0-9_]/g, "_");
            const safeBase = /^[0-9]/.test(clean) ? `_${clean}` : clean;
            return suffix ? `${safeBase}_${suffix}` : safeBase;
        },

        /**
         * Download Multi-Tier CSN Package (1:1 Architecture Parity with HANA Studio / Eclipse Lineage)
         */
        onDownloadMultiTierPackageJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/multiTierPackageJsonString") || oModel.getProperty("/modularResult/packageJsonString");
                const sName = this._getCleanName("multi_tier_package");
                this._downloadFile(`${sName}.csn.json`, sJson, "application/json");
                MessageToast.show(`Downloaded ${sName}.csn.json (1:1 Multi-Tier Lineage Parity with HANA Studio)`);
            });
        },

        onCopyMultiTierPackageJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/multiTierPackageJsonString") || oModel.getProperty("/modularResult/packageJsonString");
                this._copyTextToClipboard(sJson, "Multi-Tier CSN Package JSON copied to clipboard!");
            });
        },

        onCopyTierSql: function (oEvent) {
            const oContext = oEvent.getSource().getBindingContext();
            if (oContext) {
                const sSql = oContext.getProperty("sql");
                const sViewName = oContext.getProperty("viewTechName");
                this._copyTextToClipboard(sSql, `SQL for ${sViewName} copied to clipboard!`);
            }
        },

        /**
         * Download Unified CSN Package (Table + View + Analytic Model in ONE file)
         */
        onDownloadPackageJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/packageJsonString");
                const sName = this._getCleanName("complete_package");
                this._downloadFile(`${sName}.csn.json`, sJson, "application/json");
                MessageToast.show(`Downloaded ${sName}.csn.json (Use in Data Builder -> Import Objects from CSN/JSON File)`);
            });
        },

        onDownloadTableJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/tableJsonString");
                const sName = this._getCleanName("table");
                this._downloadFile(`${sName}.csn.json`, sJson, "application/json");
                MessageToast.show(`Downloaded ${sName}.csn.json (Native CSN for Data Builder -> Tables)`);
            });
        },

        onDownloadViewJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/viewJsonString");
                const sName = this._getCleanName("view");
                this._downloadFile(`${sName}.csn.json`, sJson, "application/json");
                MessageToast.show(`Downloaded ${sName}.csn.json (Native CSN for Data Builder -> Views)`);
            });
        },

        onDownloadStandaloneFactJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/standaloneFactJsonString");
                const sName = this._getCleanName("standalone_fact");
                this._downloadFile(`${sName}.csn.json`, sJson, "application/json");
                MessageToast.show(`Downloaded ${sName}.csn.json (Zero-dependency Standalone Fact/Dimension Entity)`);
            });
        },

        onDownloadAmJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/analyticModelJsonString");
                const sName = this._getCleanName("am");
                this._downloadFile(`${sName}.csn.json`, sJson, "application/json");
                MessageToast.show(`Downloaded ${sName}.csn.json (Native CSN for Business Builder -> Analytic Models)`);
            });
        },

        onDownloadCompleteSql: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sSql = oModel.getProperty("/modularResult/optimizedSql") || oModel.getProperty("/modularResult/completeDdlSql");
                const sName = this._getCleanName("query");
                this._downloadFile(`${sName}.sql`, sSql, "text/plain");
                MessageToast.show(`Downloaded ${sName}.sql`);
            });
        },

        onCopyPackageJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/packageJsonString");
                this._copyTextToClipboard(sJson, "Complete CSN Package JSON copied to clipboard!");
            });
        },

        onCopyViewJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/viewJsonString");
                this._copyTextToClipboard(sJson, "Fact View CSN JSON copied to clipboard!");
            });
        },

        onCopyStandaloneFactJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/standaloneFactJsonString");
                this._copyTextToClipboard(sJson, "Standalone Fact CSN JSON copied to clipboard!");
            });
        },

        onCopyTableJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/tableJsonString");
                this._copyTextToClipboard(sJson, "Table CSN JSON copied to clipboard!");
            });
        },

        onCopyAmJson: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sJson = oModel.getProperty("/modularResult/analyticModelJsonString");
                this._copyTextToClipboard(sJson, "Analytic Model CSN JSON copied to clipboard!");
            });
        },

        /* ====================================================================
         * REPLICATION FLOW GENERATION (TARGET: LOCAL TABLES)
         * ==================================================================== */
        onDownloadReplicationFlow: function () {
            this._ensureArtifactsGenerated(() => {
                const oModel = this.getView().getModel();
                const sMode = oModel.getProperty("/replicationFlowMode") || "DELTA";
                const sJson = sMode === "MASTER" 
                    ? oModel.getProperty("/modularResult/replicationFlowMasterJsonString")
                    : oModel.getProperty("/modularResult/replicationFlowDeltaJsonString");
                const sTableName = this._getCleanName();

                if (!sJson) {
                    MessageBox.warning("No replication flow generated.");
                    return;
                }

                const sFileName = `RF_${sTableName}_${sMode.toLowerCase()}.replicationFlow.json`;
                this._downloadFile(sFileName, sJson, "application/json");
                MessageToast.show(`Downloaded ${sFileName} (Datasphere Replication Flow)`);
            });
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
            if (!sContent) {
                MessageBox.warning("No content available to download.");
                return;
            }
            let fileData = sContent;
            if (typeof fileData === "object") {
                try {
                    fileData = JSON.stringify(fileData, null, 2);
                } catch (e) {
                    fileData = String(fileData);
                }
            }

            // Sanitize filename for all browsers (remove leading/nested slashes and forbidden characters)
            const sCleanName = (sFileName || "export.json")
                .replace(/^[\/\\]+/, "")
                .replace(/[\/\\]+/g, "_")
                .replace(/[^a-zA-Z0-9_\-\.]/g, "_");

            const mime = sMimeType || "application/json;charset=utf-8";
            const blob = new Blob([fileData], { type: mime });

            if (window.navigator && window.navigator.msSaveOrOpenBlob) {
                window.navigator.msSaveOrOpenBlob(blob, sCleanName);
                return;
            }

            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.setAttribute("href", url);
            a.setAttribute("download", sCleanName);
            document.body.appendChild(a);
            a.click();
            
            // Asynchronous cleanup so modern Chrome / Edge / Safari don't drop or cancel the download stream
            setTimeout(function () {
                try {
                    if (document.body.contains(a)) {
                        document.body.removeChild(a);
                    }
                    window.URL.revokeObjectURL(url);
                } catch (e) {
                    // ignore cleanup error
                }
            }, 2000);
        },

        /* ====================================================================
         * DIRECT CLOUD TRANSFER (AUTOMATED PUSH)
         * ==================================================================== */
        onTransfer: function () {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/selectedViewName");
            const oTable = this.byId("artifactsTable") || this.byId("artifactTable");
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