sap.ui.define([
    "hanamorph/controller/BasePipelineController"
], function (BasePipelineController) {
    "use strict";

    return BasePipelineController.extend("hanamorph.controller.CalcViewPipeline", {
        onInit: function () {
            this.initPipeline("CALC_VIEW", "Calculation View Migration Pipeline");
        }
    });
});
