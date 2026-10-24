sap.ui.define([
    "hanamorph/controller/BasePipelineController"
], function (BasePipelineController) {
    "use strict";

    return BasePipelineController.extend("hanamorph.controller.CdsPipeline", {
        onInit: function () {
            this.initPipeline("CDS", "CDS View Migration Pipeline");
        }
    });
});
