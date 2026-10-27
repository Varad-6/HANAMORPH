sap.ui.define([
    "sap/ui/core/mvc/Controller"
], function (Controller) {
    "use strict";

    return Controller.extend("hanamorph.controller.Landing", {
        onInit: function () {
        },

        onAfterRendering: function () {
            const oCdsCard = this.byId("cdsCard");
            if (oCdsCard && oCdsCard.getDomRef()) {
                const domRef = oCdsCard.getDomRef();
                domRef.onclick = (e) => {
                    if (!e.target.closest("button")) {
                        this.onSelectCds();
                    }
                };
            }

            const oCalcCard = this.byId("calcCard");
            if (oCalcCard && oCalcCard.getDomRef()) {
                const domRef = oCalcCard.getDomRef();
                domRef.onclick = (e) => {
                    if (!e.target.closest("button")) {
                        this.onSelectCalcView();
                    }
                };
            }
        },

        onSelectCds: function () {
            this.getOwnerComponent().getRouter().navTo("cds");
        },

        onSelectCalcView: function () {
            this.getOwnerComponent().getRouter().navTo("calcview");
        }
    });
});
