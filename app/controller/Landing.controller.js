sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("hanamorph.controller.Landing", {
        onInit: function () {},

        onSelectCds: function () {
            this.getOwnerComponent().getRouter().navTo("cds");
        },

        onSelectCalcView: function () {
            this.getOwnerComponent().getRouter().navTo("calcview");
        }
    });
});
