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
                emptyViewsText: "Click 'Import' to load views from source HANA.",
                errorViewsText: "",
                hasError: false,
                // Artifacts section
                artifacts: [],
                hasArtifacts: false,
                isArtifactsBusy: false,
                // Job status strip
                job: null,
                isJobRunning: false,
                currentStage: "", // 'EXTRACTING' | 'TRANSFORMING' | 'DEPLOYING' | 'LOADING' | 'COMPLETED' | 'FAILED'
                jobLogs: []
            });
            this.getView().setModel(oViewModel);

            // Register router event to reset state when navigating into route
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute(sPipelineType === 'CDS' ? "cds" : "calcview").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            // Keep state or reset if needed
        },

        onNavBack: function () {
            if (this._pollTimer) {
                clearInterval(this._pollTimer);
            }
            this.getOwnerComponent().getRouter().navTo("landing");
        },

        /**
         * Step 1: Import views from CAP service
         */
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
                    }
                })
                .catch(err => {
                    oModel.setProperty("/isBusy", false);
                    oModel.setProperty("/hasError", true);
                    oModel.setProperty("/errorViewsText", err.message);
                    MessageBox.error(`Import failed: ${err.message}`);
                });
        },

        /**
         * Step 2: User selects a view -> load artifacts below selector
         */
        onViewChange: function (oEvent) {
            const sSelectedKey = oEvent.getParameter("selectedItem") ? oEvent.getParameter("selectedItem").getKey() : "";
            const oModel = this.getView().getModel();
            
            if (!sSelectedKey) {
                oModel.setProperty("/selectedViewName", "");
                oModel.setProperty("/selectedView", null);
                oModel.setProperty("/artifacts", []);
                oModel.setProperty("/hasArtifacts", false);
                return;
            }

            const aViews = oModel.getProperty("/views") || [];
            const oSelected = aViews.find(v => v.name === sSelectedKey);
            oModel.setProperty("/selectedViewName", sSelectedKey);
            oModel.setProperty("/selectedView", oSelected);
            oModel.setProperty("/isArtifactsBusy", true);
            oModel.setProperty("/job", null);
            oModel.setProperty("/isJobRunning", false);

            fetch(`/odata/v4/migration/getArtifacts(viewName='${encodeURIComponent(sSelectedKey)}')`)
                .then(res => res.json())
                .then(data => {
                    const aArtifacts = (data.value || []).map(art => {
                        art.selected = true; // Selected by default
                        return art;
                    });
                    oModel.setProperty("/artifacts", aArtifacts);
                    oModel.setProperty("/hasArtifacts", aArtifacts.length > 0);
                    oModel.setProperty("/isArtifactsBusy", false);

                    // Multi-select all in table
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

        /**
         * Step 3: Transfer selected artifacts -> start job
         */
        onTransfer: function () {
            const oModel = this.getView().getModel();
            const sViewName = oModel.getProperty("/selectedViewName");
            const oTable = this.byId("artifactTable");
            const aSelectedItems = oTable ? oTable.getSelectedItems() : [];

            if (!sViewName) {
                MessageBox.warning("Please select a view first.");
                return;
            }

            if (aSelectedItems.length === 0) {
                MessageBox.warning("Please select at least one artifact from the table to transfer.");
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
                    artifacts: aArtifactNames
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

        /**
         * Step 4: Poll job status strip
         */
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
                    .catch(() => {
                        // Keep polling or let timeout handle
                    });
            }, 600);
        },

        onDownloadCsn: function () {
            const oModel = this.getView().getModel();
            const oJob = oModel.getProperty("/job");
            if (!oJob || !oJob.csnPayload) {
                MessageBox.information("No CSN available for download.");
                return;
            }

            const blob = new Blob([oJob.csnPayload], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${oJob.targetViewName || oJob.sourceViewName}.csn.json`;
            a.click();
            URL.revokeObjectURL(url);
        }
    });
});
