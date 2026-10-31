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
                space: "AIS_HARMONIZATION_",
                flowTechnicalName: "RF_S4H_INGESTION",
                replicationMode: "DELTA",
                sourceConnection: "S4HANA_SOURCE",
                sourceEntitiesString: "SNWD_SO, EKKO, MARA",
                flowJsonString: "",
                cliCommand: "",
                hasGenerated: false,
                isBusy: false
            });
            this.getView().setModel(oModel);
        },

        onNavBack: function () {
            this.getOwnerComponent().getRouter().navTo("landing");
        },

        onGenerateFlowJson: function () {
            const oModel = this.getView().getModel();
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sName = oModel.getProperty("/flowTechnicalName") || "RF_S4H_INGESTION";
            const sMode = oModel.getProperty("/replicationMode") || "DELTA";
            const sConn = oModel.getProperty("/sourceConnection") || "S4HANA_SOURCE";
            const sEntitiesRaw = oModel.getProperty("/sourceEntitiesString") || "SNWD_SO";

            const aEntities = sEntitiesRaw.split(",").map(e => e.trim()).filter(Boolean);
            const loadType = sMode === "DELTA" ? "InitialAndDelta" : "InitialOnly";

            const oFlow = {
                "$schema": "https://sap.com/datasphere/ns/replication-flow-schema.json",
                "name": sName,
                "type": "ReplicationFlow",
                "space": sSpace,
                "properties": {
                    "description": `HanaMorph Automated Ingestion Pipeline for ${sName}`,
                    "loadType": loadType,
                    "deltaCapture": sMode === "DELTA"
                },
                "source": {
                    "connectionId": sConn,
                    "container": "SAPHANADB",
                    "objects": aEntities.map(name => ({
                        "sourceObject": name,
                        "targetObject": `${name.toLowerCase()}_raw`,
                        "settings": {
                            "loadType": loadType,
                            "truncate": false
                        }
                    }))
                },
                "target": {
                    "connectionId": "LOCAL_SAP_DATASPHERE",
                    "container": sSpace,
                    "targetType": "LocalTable",
                    "options": {
                        "createOnDeploy": true,
                        "aiDeltaCapturing": sMode === "DELTA"
                    }
                }
            };

            const sJson = JSON.stringify(oFlow, null, 2);
            oModel.setProperty("/flowJsonString", sJson);
            oModel.setProperty("/cliCommand", `npx @sap/datasphere-cli objects replication-flows create --space "${sSpace}" --technical-name "${sName}" --file-path "${sName}.json"`);
            oModel.setProperty("/hasGenerated", true);
            MessageToast.show("Replication Flow JSON schema generated successfully!");
        },

        onDownloadFlowJson: function () {
            const oModel = this.getView().getModel();
            const sJson = oModel.getProperty("/flowJsonString");
            const sName = oModel.getProperty("/flowTechnicalName") || "ReplicationFlow";
            if (!sJson) return;

            const sCleanName = (sName || "ReplicationFlow")
                .replace(/^[\/\\]+/, "")
                .replace(/[\/\\]+/g, "_")
                .replace(/[^a-zA-Z0-9_\-\.]/g, "_");
            const blob = new Blob([sJson], { type: "application/json" });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.style.display = "none";
            a.href = url;
            a.download = `${sCleanName}.json`;
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                if (document.body.contains(a)) {
                    document.body.removeChild(a);
                }
                window.URL.revokeObjectURL(url);
            }, 1000);
            MessageToast.show("Downloaded Replication Flow JSON definition.");
        },

        onDeployFlowDirect: function () {
            const oModel = this.getView().getModel();
            const sSpace = oModel.getProperty("/space") || "AIS_HARMONIZATION_";
            const sName = oModel.getProperty("/flowTechnicalName") || "RF_S4H_INGESTION";
            const sJson = oModel.getProperty("/flowJsonString");

            if (!sJson) {
                MessageBox.warning("Please generate the flow definition first.");
                return;
            }

            oModel.setProperty("/isBusy", true);
            MessageToast.show("Connecting to Datasphere CLI...");

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
                    oModel.setProperty("/isBusy", false);
                    const res = data.value || data;
                    if (res.status === "SUCCESS") {
                        MessageBox.success(`Replication Flow '${sName}' deployed to Space '${sSpace}'!`);
                    } else {
                        MessageBox.information(`Deployment notification: ${res.message || 'CLI executed'}\n\nCommand: ${res.cliCommand}`);
                    }
                })
                .catch(err => {
                    oModel.setProperty("/isBusy", false);
                    MessageBox.error(`CLI execution notice: ${err.message}`);
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
        }
    });
});
