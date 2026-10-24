/**
 * Sample Catalog Fixtures for HanaMorph
 * Realistic S/4HANA CDS Views and HANA Calculation Views
 */

const SAMPLE_CDS_VIEWS = [
    {
        name: 'C_PurchaseOrderFs',
        type: 'CDS',
        sqlViewName: 'CPURCHASEORDFS',
        packageOrSchema: 'MM-PUR-PO',
        description: 'Purchase Order Overview (Header + Item + Material + Plant)',
        columnCount: 24,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        sqlDdl: `CREATE VIEW "CPURCHASEORDFS" AS SELECT
            ekko.MANDT AS Client,
            ekko.EBELN AS PurchaseOrder,
            ekko.BUKRS AS CompanyCode,
            ekko.BSTYP AS PurchasingDocumentCategory,
            ekko.BSART AS PurchasingDocumentType,
            ekko.STATU AS PurchasingDocumentStatus,
            ekko.AEDAT AS CreationDate,
            ekko.ERNAM AS CreatedByUser,
            ekko.LIFNR AS Supplier,
            ekko.WAERS AS Currency,
            ekpo.EBELP AS PurchaseOrderItem,
            ekpo.TXZ01 AS PurchaseOrderItemText,
            ekpo.MATNR AS Material,
            ekpo.WERKS AS Plant,
            ekpo.LGORT AS StorageLocation,
            ekpo.MENGE AS OrderQuantity,
            ekpo.MEINS AS PurchaseOrderQuantityUnit,
            ekpo.NETPR AS NetPriceAmount,
            ekpo.NETWR AS NetAmount,
            mara.MTART AS MaterialType,
            mara.MATKL AS MaterialGroup,
            t001w.NAME1 AS PlantName,
            t001w.BWKEY AS ValuationArea,
            t001w.FABKL AS FactoryCalendar
        FROM "EKKO" ekko
        INNER JOIN "EKPO" ekpo ON ekko.MANDT = ekpo.MANDT AND ekko.EBELN = ekpo.EBELN
        LEFT OUTER JOIN "MARA" mara ON ekpo.MANDT = mara.MANDT AND ekpo.MATNR = mara.MATNR
        LEFT OUTER JOIN "T001W" t001w ON ekpo.MANDT = t001w.MANDT AND ekpo.WERKS = t001w.WERKS`
    },
    {
        name: 'I_SalesDocumentItem',
        type: 'CDS',
        sqlViewName: 'ISALESDOCITEM',
        packageOrSchema: 'SD-SLS',
        description: 'Sales Document Item Basic View',
        columnCount: 18,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        sqlDdl: `CREATE VIEW "ISALESDOCITEM" AS SELECT
            vbap.MANDT AS Client,
            vbap.VBELN AS SalesDocument,
            vbap.POSNR AS SalesDocumentItem,
            vbap.MATNR AS Material,
            vbap.MATKL AS MaterialGroup,
            vbap.KWMENG AS OrderQuantity,
            vbap.VRKME AS SalesUnit,
            vbap.NETWR AS NetAmount,
            vbap.WAERK AS TransactionCurrency,
            vbak.VKORG AS SalesOrganization,
            vbak.VTWEG AS DistributionChannel,
            vbak.SPART AS Division,
            vbak.KUNNR AS SoldToParty
        FROM "VBAP" vbap
        INNER JOIN "VBAK" vbak ON vbap.MANDT = vbak.MANDT AND vbap.VBELN = vbak.VBELN`
    }
];

const SAMPLE_CALC_VIEWS = [
    {
        name: 'CA_SALES_ANALYTICS',
        type: 'CALC_VIEW',
        sqlViewName: '_SYS_BIC."package/CA_SALES_ANALYTICS"',
        packageOrSchema: 'sap.hana.democontent.epm.models',
        description: 'Sales Order Value Aggregation and Margin Calculation',
        columnCount: 12,
        hasAggregations: true,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        xmlDefinition: `<?xml version="1.0" encoding="UTF-8"?>
<Calculation:scenario xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:Calculation="http://www.sap.com/ndb/BiModelCalculation.ecore" schemaVersion="2.3" id="CA_SALES_ANALYTICS" applyPrivilegeType="NONE" defaultClient="$$client$$" defaultLanguage="$$language$$">
  <dataSources>
    <DataSource id="VBAK" type="DATA_BASE_TABLE">
      <resourceUri>VBAK</resourceUri>
    </DataSource>
    <DataSource id="VBAP" type="DATA_BASE_TABLE">
      <resourceUri>VBAP</resourceUri>
    </DataSource>
  </dataSources>
  <calculationViews>
    <calculationView xsi:type="Calculation:JoinView" id="Join_Orders">
      <viewAttributes>
        <viewAttribute id="MANDT"/>
        <viewAttribute id="VBELN"/>
        <viewAttribute id="POSNR"/>
        <viewAttribute id="VKORG"/>
        <viewAttribute id="MATNR"/>
        <viewAttribute id="KWMENG"/>
        <viewAttribute id="NETWR"/>
      </viewAttributes>
      <input node="#VBAK"/>
      <input node="#VBAP"/>
      <joinAttribute name="VBELN"/>
      <joinType>INNER</joinType>
    </calculationView>
    <calculationView xsi:type="Calculation:AggregationView" id="Aggregation_1">
      <viewAttributes>
        <viewAttribute id="VKORG"/>
        <viewAttribute id="MATNR"/>
      </viewAttributes>
      <input node="#Join_Orders"/>
      <measures>
        <measure id="TOTAL_QUANTITY" aggregationType="SUM" sourceColumn="KWMENG"/>
        <measure id="TOTAL_NET_AMOUNT" aggregationType="SUM" sourceColumn="NETWR"/>
      </measures>
    </calculationView>
  </calculationViews>
</Calculation:scenario>`
    }
];

module.exports = {
    SAMPLE_CDS_VIEWS,
    SAMPLE_CALC_VIEWS
};
