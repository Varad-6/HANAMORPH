sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("hanamorph.Component", {
        metadata: {
            manifest: "json"
        },

        init: function () {
            UIComponent.prototype.init.apply(this, arguments);

            // Global System Model (Connection status & Mock badge)
            const oSystemModel = new JSONModel({
                useMock: true,
                hanaConnected: false,
                mode: "INITIALIZING",
                datasphereConnected: true
            });
            this.setModel(oSystemModel, "system");

            // Fetch system status from CAP
            fetch("/odata/v4/migration/getSystemInfo()")
                .then(r => r.json())
                .then(data => {
                    oSystemModel.setData(data);
                })
                .catch(() => {
                    oSystemModel.setProperty("/mode", "OFFLINE");
                });

            // Initialize router
            this.getRouter().initialize();
        }
    });
});
