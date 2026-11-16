sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], function (Controller, JSONModel, MessageToast, MessageBox) {
    "use strict";

    return Controller.extend("hanamorph.controller.ReplicationStudio", {
        onInit: function () {
            const oModel = new JSONModel({
                activeTab: "singleView",
                space: "AIS_HARMONIZATION_",
                sourceConnection: "HDD_HANA_SOURCE",
                container: "SAPHANADB",

                // Tab 1: Single View
                viewSearchQuery: "",
                viewTypeFilter: "ALL",
                isSearchingViews: false,
                matchingViews: [],
                singleView: {
                    selectedName: "",
                    selectedItem: null,
                    flowName: "",
                    isBusy: false,
                    hasGenerated: false,
                    jsonString: "",
                    cliCommand: "",
                    sourceObjects: []
                },

                // Tab 2: Multiple Views / Bulk Cart
                cartViews: [],
                isBulkBusy: false,
                hasGeneratedBulk: false,
                bulkResults: [],

                // Tab 3: Direct Tables
                flowTechnicalName: "RF_S4H_INGESTION",
                replicationMode: "INITIAL",
                sourceEntitiesString: "BNKA, BKPF, MARA",
                flowJsonString: "",
                cliCommand: "",
                hasDirectGenerated: false
            });
            this.getView().setModel(oModel);
            this._loadInitialViews();
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("landing");
        },

        onTabSelect: function (oEvent) {
            const sKey = oEvent.getParameter("key");
            this.getView().getModel().setProperty("/activeTab", sKey);
        },

        /* ====================================================================
         * TAB 1: SINGLE CDS / VIEW REPLICATION
         * ==================================================================== */
        _loadInitialViews: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/isSearchingViews", true);
            fetch("/odata/v4/migration/searchViews(query='',module='ALL',viewType='ALL',topLimit=20)")
                .then(res => res.json())
                .then(data => {
                    oModel.setProperty("/matchingViews", data.value || []);
                    oModel.setProperty("/isSearchingViews", false);
                })
                .catch(() => {
                    oModel.setProperty("/isSearchingViews", false);
                });
        },

        onLiveSearchViews: function (oEvent) {
            const sQuery = oEvent.getParameter("newValue") || "";
            const oModel = this.getView().getModel();
            oModel.setProperty("/viewSearchQuery", sQuery);

            if (this._debounce) clearTimeout(this._debounce);
            this._debounce = setTimeout(() => {
                this.onTriggerSearchViews();
            }, 350);
        },

        onTriggerSearchViews: function () {
            const oModel = this.getView().getModel();
            const sQuery = oModel.getProperty("/viewSearchQuery") || "";
            const sType = oModel.getProperty("/viewTypeFilter") || "ALL";

            oModel.setProperty("/isSearchingViews", true);
            const sUrl = `/odata/v4/migration/searchViews(query='${encodeURIComponent(sQuery)}',module='ALL',viewType='${encodeURIComponent(sType)}',topLimit=30)`;
            fetch(sUrl)
                .then(res => res.json())
                .then(data => {
                    oModel.setProperty("/matchingViews", data.value || []);
                    oModel.setProperty("/isSearchingViews", false);
                })
                .catch(err => {
                    oModel.setProperty("/isSearchingViews", false);
                    MessageBox.error(`Search error: ${err.message}`);
                });
        },

        onSingleViewSelect: function (oEvent) {
            const oItem = oEvent.getParameter("listItem");
            if (!oItem) return;
            const oCtx = oItem.getBindingContext();
            if (!oCtx) return;
            const oView = oCtx.getObject();

            const oModel = this.getView().getModel();
            const cleanName = (oView.name || "VIEW")
                .replace(/^[\/\\]+/, "")
                .replace(/[\/\\]+/g, "_")
                .replace(/[^a-zA-Z0-9_]/g, "_");

            oModel.setProperty("/singleView/selectedName", oView.name);
            oModel.setProperty("/singleView/selectedItem", oView);
            oModel.setProperty("/singleView/flowName", `RF_${cleanName}`);
            oModel.setProperty("/singleView/hasGenerated", false);
            oModel.setProperty("/singleView/jsonString", "");
            oModel.setProperty("/singleView/sourceObjects", []);
        },

        onGenerateSingleViewRF: function () {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/singleView/selectedName");
            if (!sViewName) {
                MessageBox.warning("Please select a view first.");
                return;
            }

            const oView = oModel.getProperty("/singleView/selectedItem") || {};
            const sViewType = oView.type || "CDS";
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sFlowName = oModel.getProperty("/singleView/flowName") || `RF_${sViewName}`;
            const sConn = oModel.getProperty("/sourceConnection") || "HDD_HANA_SOURCE";
            const sContainer = oModel.getProperty("/container") || "SAPHANADB";

            oModel.setProperty("/singleView/isBusy", true);

            fetch("/odata/v4/migration/generateReplicationFlowForView", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    viewName: sViewName,
                    viewType: sViewType,
                    columnsJson: "[]",
                    space: sSpace,
                    flowName: sFlowName,
                    connectionId: sConn,
                    container: sContainer
                })
            })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(e => { throw new Error(e.error?.message || res.statusText); });
                }
                return res.json();
            })
            .then(data => {
                const res = data.value || data;
                let aSources = [];
                try { aSources = JSON.parse(res.sourceObjectsJson || "[]"); } catch (e) {}

                oModel.setProperty("/singleView/isBusy", false);
                oModel.setProperty("/singleView/jsonString", res.rfJsonString || "");
                oModel.setProperty("/singleView/cliCommand", res.cliCommand || "");
                oModel.setProperty("/singleView/sourceObjects", aSources);
                oModel.setProperty("/singleView/hasGenerated", true);

                MessageToast.show(`Replication Flow generated for ${aSources.length} base table(s).`);
            })
            .catch(err => {
                oModel.setProperty("/singleView/isBusy", false);
                MessageBox.error(`Generation error: ${err.message}`);
            });
        },

        onDownloadSingleViewRF: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/singleView/jsonString");
            const sName = oModel.getProperty("/singleView/flowName") || "ReplicationFlow";
            if (!sJson) return;
            this._downloadJson(`${sName}.json`, sJson);
        },

        onDeploySingleViewRF: function () {
            const oModel = this.getView().getModel();
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sName = oModel.getProperty("/singleView/flowName") || "RF_UNNAMED";
            const sJson = oModel.getProperty("/singleView/jsonString");

            if (!sJson) {
                MessageBox.warning("Generate flow definition first.");
                return;
            }

            oModel.setProperty("/singleView/isBusy", true);
            fetch("/odata/v4/migration/deployReplicationFlow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    space: sSpace,
                    flowTechnicalName: sName,
                    flowJsonString: sJson
                })
            })
            .then(res => res.json())
            .then(data => {
                oModel.setProperty("/singleView/isBusy", false);
                const res = data.value || data;
                if (res.status === "SUCCESS") {
                    MessageBox.success(`Replication Flow '${sName}' deployed to Space '${sSpace}'!\n\nNext: Run it in Datasphere Data Integration Monitor.`);
                } else {
                    MessageBox.information(`Deploy notice: ${res.message || 'CLI executed'}`);
                }
            })
            .catch(err => {
                oModel.setProperty("/singleView/isBusy", false);
                MessageBox.error(`Deploy error: ${err.message}`);
            });
        },

        /* ====================================================================
         * TAB 2: MULTIPLE CDS VIEWS (CART / BULK)
         * ==================================================================== */
        onAddSingleViewToCart: function () {
            const oModel = this.getView().getModel();
            const oView = oModel.getProperty("/singleView/selectedItem");
            if (!oView) {
                MessageBox.warning("Select a view in Tab 1 first.");
                return;
            }

            const aCart = oModel.getProperty("/cartViews") || [];
            if (aCart.find(v => v.name === oView.name)) {
                MessageToast.show(`'${oView.name}' is already in cart.`);
                return;
            }

            aCart.push({
                name: oView.name,
                type: oView.type || "CDS",
                description: oView.description || ""
            });
            oModel.setProperty("/cartViews", [...aCart]);
            oModel.setProperty("/hasGeneratedBulk", false);
            MessageToast.show(`Added '${oView.name}' to cart.`);
        },

        onRemoveFromCart: function (oEvent) {
            const oItem = oEvent.getSource().getBindingContext();
            if (!oItem) return;
            const sName = oItem.getProperty("name");
            const oModel = this.getView().getModel();
            const aCart = (oModel.getProperty("/cartViews") || []).filter(v => v.name !== sName);
            oModel.setProperty("/cartViews", aCart);
            MessageToast.show(`Removed '${sName}' from cart.`);
        },

        onClearCart: function () {
            const oModel = this.getView().getModel();
            oModel.setProperty("/cartViews", []);
            oModel.setProperty("/bulkResults", []);
            oModel.setProperty("/hasGeneratedBulk", false);
        },

        onGenerateAllCartRFs: async function () {
            const oModel = this.getView().getModel();
            const aCart = oModel.getProperty("/cartViews") || [];
            if (aCart.length === 0) {
                MessageBox.warning("Cart is empty.");
                return;
            }

            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sConn = oModel.getProperty("/sourceConnection") || "HDD_HANA_SOURCE";
            const sContainer = oModel.getProperty("/container") || "SAPHANADB";

            oModel.setProperty("/isBulkBusy", true);
            const aResults = [];

            try {
                for (const item of aCart) {
                    const cleanName = item.name.replace(/^[\/\\]+/, "").replace(/[\/\\]+/g, "_").replace(/[^a-zA-Z0-9_]/g, "_");
                    const flowName = `RF_${cleanName}`;

                    const res = await fetch("/odata/v4/migration/generateReplicationFlowForView", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            viewName: item.name,
                            viewType: item.type,
                            columnsJson: "[]",
                            space: sSpace,
                            flowName: flowName,
                            connectionId: sConn,
                            container: sContainer
                        })
                    }).then(r => r.json());

                    const data = res.value || res;
                    aResults.push({
                        viewName: item.name,
                        rfTechName: data.rfTechName || flowName,
                        rfJsonString: data.rfJsonString,
                        cliCommand: data.cliCommand,
                        sourceTableCount: data.sourceTableCount || 1,
                        space: sSpace
                    });
                }

                oModel.setProperty("/bulkResults", aResults);
                oModel.setProperty("/hasGeneratedBulk", true);
                oModel.setProperty("/isBulkBusy", false);
                MessageToast.show(`Generated ${aResults.length} Replication Flow definition(s)!`);
            } catch (err) {
                oModel.setProperty("/isBulkBusy", false);
                MessageBox.error(`Bulk generation failed: ${err.message}`);
            }
        },

        onDownloadAllCartRFs: function () {
            const oModel = this.getView().getModel();
            const aResults = oModel.getProperty("/bulkResults") || [];
            if (aResults.length === 0) return;

            aResults.forEach((r, idx) => {
                setTimeout(() => {
                    this._downloadJson(`${r.rfTechName}.json`, r.rfJsonString);
                }, idx * 300);
            });
            MessageToast.show(`Downloading ${aResults.length} Replication Flow file(s)...`);
        },

        onDownloadSingleBulkResult: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext();
            if (!oCtx) return;
            const oItem = oCtx.getObject();
            this._downloadJson(`${oItem.rfTechName}.json`, oItem.rfJsonString);
        },

        onDeploySingleBulkResult: function (oEvent) {
            const oCtx = oEvent.getSource().getBindingContext();
            if (!oCtx) return;
            const oItem = oCtx.getObject();
            const oModel = this.getView().getModel();
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";

            fetch("/odata/v4/migration/deployReplicationFlow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    space: sSpace,
                    flowTechnicalName: oItem.rfTechName,
                    flowJsonString: oItem.rfJsonString
                })
            })
            .then(res => res.json())
            .then(data => {
                const res = data.value || data;
                if (res.status === "SUCCESS") {
                    MessageToast.show(`'${oItem.rfTechName}' deployed successfully!`);
                } else {
                    MessageBox.information(`Deploy notice: ${res.message || 'CLI executed'}`);
                }
            })
            .catch(err => {
                MessageBox.error(`Deploy error: ${err.message}`);
            });
        },

        onDeployAllCartRFs: async function () {
            const oModel = this.getView().getModel();
            const aResults = oModel.getProperty("/bulkResults") || [];
            if (aResults.length === 0) return;
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";

            oModel.setProperty("/isBulkBusy", true);
            let nSuccess = 0;

            for (const r of aResults) {
                try {
                    await fetch("/odata/v4/migration/deployReplicationFlow", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            space: sSpace,
                            flowTechnicalName: r.rfTechName,
                            flowJsonString: r.rfJsonString
                        })
                    });
                    nSuccess++;
                } catch (e) {
                    console.error("Deploy failed for", r.rfTechName, e);
                }
            }

            oModel.setProperty("/isBulkBusy", false);
            MessageBox.success(`Deployed ${nSuccess} of ${aResults.length} Replication Flows to Space '${sSpace}'!`);
        },

        /* ====================================================================
         * TAB 3: AD-HOC DIRECT TABLES
         * ==================================================================== */
        onGenerateDirectFlowJson: function () {
            const oModel = this.getView().getModel();
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sName = oModel.getProperty("/flowTechnicalName") || "RF_S4H_INGESTION";
            const sMode = oModel.getProperty("/replicationMode") || "INITIAL";
            const sConn = oModel.getProperty("/sourceConnection") || "HDD_HANA_SOURCE";
            const sContainer = oModel.getProperty("/container") || "SAPHANADB";
            const sEntitiesRaw = oModel.getProperty("/sourceEntitiesString") || "BNKA";

            const aEntities = sEntitiesRaw.split(",").map(e => e.trim().toUpperCase()).filter(Boolean);
            const loadType = sMode === "DELTA" ? "InitialAndDelta" : "InitialOnly";

            const oFlow = {
                "$schema": "https://sap.com/datasphere/ns/replication-flow-schema.json",
                "type": "ReplicationFlow",
                "name": sName,
                "space": sSpace,
                "description": `HanaMorph Direct Table Replication Flow for ${sName}`,
                "source": {
                    "connectionId": sConn,
                    "container": sContainer
                },
                "target": {
                    "connectionId": "LOCAL_SAP_DATASPHERE",
                    "container": sSpace,
                    "options": {
                        "createOnDeploy": true,
                        "mode": "UPSERT"
                    }
                },
                "replicationObjects": aEntities.map(table => ({
                    "sourceObject": table,
                    "targetObject": `${table}_TBL`,
                    "loadType": loadType,
                    "mappings": []
                }))
            };

            const sJson = JSON.stringify(oFlow, null, 2);
            oModel.setProperty("/flowJsonString", sJson);
            oModel.setProperty("/cliCommand", `npx @sap/datasphere-cli objects replication-flows create --space "${sSpace}" --technical-name "${sName}" --file-path "${sName}.json"`);
            oModel.setProperty("/hasDirectGenerated", true);
            MessageToast.show("Direct Replication Flow JSON generated!");
        },

        onDownloadDirectFlowJson: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/flowJsonString");
            const sName = oModel.getProperty("/flowTechnicalName") || "DirectReplicationFlow";
            if (!sJson) return;
            this._downloadJson(`${sName}.json`, sJson);
        },

        onDeployDirectFlow: function () {
            const oModel = this.getView().getModel();
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sName = oModel.getProperty("/flowTechnicalName") || "RF_DIRECT";
            const sJson = oModel.getProperty("/flowJsonString");

            if (!sJson) {
                MessageBox.warning("Generate the flow definition first.");
                return;
            }

            fetch("/odata/v4/migration/deployReplicationFlow", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    space: sSpace,
                    flowTechnicalName: sName,
                    flowJsonString: sJson
                })
            })
            .then(res => res.json())
            .then(data => {
                const res = data.value || data;
                if (res.status === "SUCCESS") {
                    MessageBox.success(`Replication Flow '${sName}' deployed to Space '${sSpace}'!`);
                } else {
                    MessageBox.information(`Deploy notice: ${res.message || 'CLI executed'}`);
                }
            })
            .catch(err => {
                MessageBox.error(`Deploy error: ${err.message}`);
            });
        },

        onCopyCliCommand: function () {
            const oModel = this.getView().getModel();
            const sCmd = oModel.getProperty("/cliCommand");
            if (sCmd) {
                navigator.clipboard.writeText(sCmd).then(() => {
                    MessageToast.show("CLI command copied to clipboard!");
                });
            }
        },

        /* Utility */
        _downloadJson: function (sFileName, sJson) {
            const blob = new Blob([sJson], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = sFileName;
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                if (document.body.contains(a)) document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
            }, 1000);
            MessageToast.show(`Downloaded ${sFileName}`);
        }
    });
});
