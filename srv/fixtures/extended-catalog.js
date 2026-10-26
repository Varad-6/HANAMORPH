/**
 * Extended Catalog Fixtures for HanaMorph (20+ S/4 CDS Views & HANA Calc Views)
 */

const { EXCEL_SEEDED_VIEWS } = require('./excel-seeded-catalog');

const BASE_CATALOG = [
    // 1. Purchase Order CDS
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
        dependencies: [
            { BASE_OBJECT_NAME: 'EKKO', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'EKPO', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'MARA', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'T001W', BASE_OBJECT_TYPE: 'TABLE' }
        ],
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

    // 2. Sales Document Item CDS
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
        dependencies: [
            { BASE_OBJECT_NAME: 'VBAP', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'VBAK', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'KNA1', BASE_OBJECT_TYPE: 'TABLE' }
        ],
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
            vbak.KUNNR AS SoldToParty,
            kna1.NAME1 AS CustomerName,
            kna1.LAND1 AS CountryKey,
            kna1.ORT01 AS City
        FROM "VBAP" vbap
        INNER JOIN "VBAK" vbak ON vbap.MANDT = vbak.MANDT AND vbap.VBELN = vbak.VBELN
        LEFT OUTER JOIN "KNA1" kna1 ON vbak.MANDT = kna1.MANDT AND vbak.KUNNR = kna1.KUNNR`
    },

    // 3. Journal Entry Item CDS (Universal Journal ACDOCA)
    {
        name: 'C_JournalEntryItem',
        type: 'CDS',
        sqlViewName: 'CJOURNALENTRYITM',
        packageOrSchema: 'FI-GL',
        description: 'Universal Journal Entry Item (ACDOCA + BKPF)',
        columnCount: 22,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'ACDOCA', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'BKPF', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "CJOURNALENTRYITM" AS SELECT
            acdoca.RCLNT AS Client,
            acdoca.RLDNR AS Ledger,
            acdoca.RBUKRS AS CompanyCode,
            acdoca.GJAHR AS FiscalYear,
            acdoca.BELNR AS AccountingDocument,
            acdoca.DOCLN AS LedgerGLLineItem,
            acdoca.RACCT AS GLAccount,
            acdoca.PRCTR AS ProfitCenter,
            acdoca.RCNTR AS CostCenter,
            acdoca.SEGMENT AS Segment,
            acdoca.WSL AS AmountInTransactionCurrency,
            acdoca.RWCUR AS TransactionCurrency,
            acdoca.HSL AS AmountInCompanyCodeCurrency,
            acdoca.RHCUR AS CompanyCodeCurrency,
            bkpf.BLDAT AS DocumentDate,
            bkpf.BUDAT AS PostingDate,
            bkpf.BLART AS AccountingDocumentType,
            bkpf.USNAM AS UserPostingDocument
        FROM "ACDOCA" acdoca
        INNER JOIN "BKPF" bkpf ON acdoca.RCLNT = bkpf.MANDT AND acdoca.RBUKRS = bkpf.BUKRS AND acdoca.BELNR = bkpf.BELNR AND acdoca.GJAHR = bkpf.GJAHR`
    },

    // 4. Billing Document Item CDS
    {
        name: 'I_BillingDocumentItem',
        type: 'CDS',
        sqlViewName: 'IBILLINGDOCITM',
        packageOrSchema: 'SD-BIL',
        description: 'Customer Billing Document Item View',
        columnCount: 16,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'VBRK', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'VBRP', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "IBILLINGDOCITM" AS SELECT
            vbrp.MANDT AS Client,
            vbrp.VBELN AS BillingDocument,
            vbrp.POSNR AS BillingDocumentItem,
            vbrp.FKIMG AS BilledQuantity,
            vbrp.VRKME AS BillingQuantityUnit,
            vbrp.NETWR AS NetAmount,
            vbrp.MATNR AS Product,
            vbrk.FKART AS BillingDocumentType,
            vbrk.FKDAT AS BillingDocumentDate,
            vbrk.KUNAG AS SoldToParty,
            vbrk.KUNRG AS PayerParty,
            vbrk.WAERK AS DocumentCurrency
        FROM "VBRP" vbrp
        INNER JOIN "VBRK" vbrk ON vbrp.MANDT = vbrk.MANDT AND vbrp.VBELN = vbrk.VBELN`
    },

    // 5. Outbound Delivery Document CDS
    {
        name: 'I_DeliveryDocumentItem',
        type: 'CDS',
        sqlViewName: 'IDELIVDOCITM',
        packageOrSchema: 'LE-SHP',
        description: 'Outbound Delivery Document Item',
        columnCount: 15,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'LIKP', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'LIPS', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "IDELIVDOCITM" AS SELECT
            lips.MANDT AS Client,
            lips.VBELN AS DeliveryDocument,
            lips.POSNR AS DeliveryDocumentItem,
            lips.MATNR AS Material,
            lips.LFIMG AS ActualDeliveryQuantity,
            lips.MEINS AS BaseUnit,
            lips.WERKS AS Plant,
            likp.LFART AS DeliveryDocumentType,
            likp.WADAT_IST AS ActualGoodsMovementDate,
            likp.KUNNR AS ShipToParty
        FROM "LIPS" lips
        INNER JOIN "LIKP" likp ON lips.MANDT = likp.MANDT AND lips.VBELN = likp.VBELN`
    },

    // 6. Material Stock CDS
    {
        name: 'I_MaterialStock',
        type: 'CDS',
        sqlViewName: 'IMATERIALSTOCK',
        packageOrSchema: 'MM-IM',
        description: 'Current Material Stock per Plant & Storage Location',
        columnCount: 14,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'MARD', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'MARA', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "IMATERIALSTOCK" AS SELECT
            mard.MANDT AS Client,
            mard.MATNR AS Material,
            mard.WERKS AS Plant,
            mard.LGORT AS StorageLocation,
            mard.LABST AS UnrestrictedStock,
            mard.INSME AS StockInQualityInspection,
            mard.SPEME AS BlockedStock,
            mara.MTART AS MaterialType,
            mara.MEINS AS BaseUnitOfMeasure
        FROM "MARD" mard
        INNER JOIN "MARA" mara ON mard.MANDT = mara.MANDT AND mard.MATNR = mara.MATNR`
    },

    // 7. Supplier Invoice Item CDS
    {
        name: 'C_SupplierInvoiceItem',
        type: 'CDS',
        sqlViewName: 'CSUPPLIERINVITM',
        packageOrSchema: 'MM-IV',
        description: 'Supplier Invoice Item and Tax Reconciliation',
        columnCount: 18,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'RBKP', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'RSEG', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "CSUPPLIERINVITM" AS SELECT
            rseg.MANDT AS Client,
            rseg.BELNR AS SupplierInvoice,
            rseg.GJAHR AS FiscalYear,
            rseg.BUZEI AS SupplierInvoiceItem,
            rseg.EBELN AS PurchaseOrder,
            rseg.EBELP AS PurchaseOrderItem,
            rseg.WRBTR AS InvoiceAmountInDocCurrency,
            rseg.MENGE AS QuantityInInvoiceUnit,
            rbkp.BLDAT AS DocumentDate,
            rbkp.BUDAT AS PostingDate,
            rbkp.LIFNR AS InvoicingParty,
            rbkp.WAERS AS Currency
        FROM "RSEG" rseg
        INNER JOIN "RBKP" rbkp ON rseg.MANDT = rbkp.MANDT AND rseg.BELNR = rbkp.BELNR AND rseg.GJAHR = rbkp.GJAHR`
    },

    // 8. Product Master CDS
    {
        name: 'I_ProductMaster',
        type: 'CDS',
        sqlViewName: 'IPRODUCTMASTER',
        packageOrSchema: 'MD-PROD',
        description: 'Product Master Basic Attributes & Descriptions',
        columnCount: 12,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'MARA', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'MAKT', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "IPRODUCTMASTER" AS SELECT
            mara.MANDT AS Client,
            mara.MATNR AS Product,
            mara.MTART AS ProductType,
            mara.MATKL AS ProductGroup,
            mara.MEINS AS BaseUnit,
            makt.SPRAS AS Language,
            makt.MAKTX AS ProductDescription
        FROM "MARA" mara
        LEFT OUTER JOIN "MAKT" makt ON mara.MANDT = makt.MANDT AND mara.MATNR = makt.MATNR`
    },

    // 9. Cost Center CDS
    {
        name: 'I_CostCenter',
        type: 'CDS',
        sqlViewName: 'ICOSTCENTER',
        packageOrSchema: 'CO-OM',
        description: 'Cost Center Master and Hierarchy',
        columnCount: 11,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'CSKS', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'CSKT', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "ICOSTCENTER" AS SELECT
            csks.MANDT AS Client,
            csks.KOKRS AS ControllingArea,
            csks.KOSTL AS CostCenter,
            csks.BUKRS AS CompanyCode,
            csks.PRCTR AS ProfitCenter,
            cskt.KTEXT AS CostCenterName,
            cskt.LTEXT AS CostCenterDescription
        FROM "CSKS" csks
        LEFT OUTER JOIN "CSKT" cskt ON csks.MANDT = cskt.MANDT AND csks.KOKRS = cskt.KOKRS AND csks.KOSTL = cskt.KOSTL`
    },

    // 10. Profit Center CDS
    {
        name: 'I_ProfitCenter',
        type: 'CDS',
        sqlViewName: 'IPROFITCENTER',
        packageOrSchema: 'EC-PCA',
        description: 'Profit Center Master Entity',
        columnCount: 10,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'CEPC', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'CEPCT', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "IPROFITCENTER" AS SELECT
            cepc.MANDT AS Client,
            cepc.PRCTR AS ProfitCenter,
            cepc.KOKRS AS ControllingArea,
            cepc.SEGMENT AS Segment,
            cepct.KTEXT AS ProfitCenterName
        FROM "CEPC" cepc
        LEFT OUTER JOIN "CEPCT" cepct ON cepc.MANDT = cepct.MANDT AND cepc.PRCTR = cepct.PRCTR`
    },

    // 11. Customer Payment CDS
    {
        name: 'I_CustomerPayment',
        type: 'CDS',
        sqlViewName: 'ICUSTPAYMENT',
        packageOrSchema: 'FI-AR',
        description: 'Customer Accounts Receivable Open and Cleared Items',
        columnCount: 14,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'BSID', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "ICUSTPAYMENT" AS SELECT
            bsid.MANDT AS Client,
            bsid.BUKRS AS CompanyCode,
            bsid.KUNNR AS Customer,
            bsid.BELNR AS AccountingDocument,
            bsid.GJAHR AS FiscalYear,
            bsid.BUZEI AS LineItem,
            bsid.WRBTR AS AmountInTransactionCurrency,
            bsid.WAERS AS Currency,
            bsid.ZFBDT AS BaselineDate
        FROM "BSID" bsid`
    },

    // 12. Production Order CDS
    {
        name: 'I_ProductionOrderItem',
        type: 'CDS',
        sqlViewName: 'IPRODORDERITM',
        packageOrSchema: 'PP-SFC',
        description: 'Manufacturing Production Order Header & Items',
        columnCount: 15,
        hasAggregations: false,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'AFKO', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'AFPO', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        sqlDdl: `CREATE VIEW "IPRODORDERITM" AS SELECT
            afpo.MANDT AS Client,
            afpo.AUFNR AS ProductionOrder,
            afpo.POSNR AS OrderItem,
            afpo.MATNR AS Product,
            afpo.PSMNG AS TargetQuantity,
            afpo.WEMNG AS ConfirmedDeliveredQuantity,
            afko.GLTRP AS ScheduledEndDate,
            afko.GSTRP AS ScheduledStartDate
        FROM "AFPO" afpo
        INNER JOIN "AFKO" afko ON afpo.MANDT = afko.MANDT AND afpo.AUFNR = afko.AUFNR`
    },

    // ----------------------------------------------------
    // CALCULATION VIEWS (ANALYTICAL CUBES)
    // ----------------------------------------------------

    // 13. Sales Order Analytics Calc View
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
        dependencies: [
            { BASE_OBJECT_NAME: 'VBAK', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'VBAP', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        xmlDefinition: `<?xml version="1.0" encoding="UTF-8"?>
<Calculation:scenario xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:Calculation="http://www.sap.com/ndb/BiModelCalculation.ecore" schemaVersion="2.3" id="CA_SALES_ANALYTICS">
  <dataSources>
    <DataSource id="VBAK" type="DATA_BASE_TABLE"><resourceUri>VBAK</resourceUri></DataSource>
    <DataSource id="VBAP" type="DATA_BASE_TABLE"><resourceUri>VBAP</resourceUri></DataSource>
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
    },

    // 14. Financial KPI Aggregations Calc View
    {
        name: 'CA_FINANCIAL_KPI',
        type: 'CALC_VIEW',
        sqlViewName: '_SYS_BIC."sap.fi/CA_FINANCIAL_KPI"',
        packageOrSchema: 'sap.fi.models',
        description: 'General Ledger Balances & Cost Center Expense Aggregation',
        columnCount: 10,
        hasAggregations: true,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'ACDOCA', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        xmlDefinition: `<?xml version="1.0" encoding="UTF-8"?>
<Calculation:scenario xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:Calculation="http://www.sap.com/ndb/BiModelCalculation.ecore" schemaVersion="2.3" id="CA_FINANCIAL_KPI">
  <dataSources>
    <DataSource id="ACDOCA" type="DATA_BASE_TABLE"><resourceUri>ACDOCA</resourceUri></DataSource>
  </dataSources>
  <calculationViews>
    <calculationView xsi:type="Calculation:AggregationView" id="Agg_GL">
      <viewAttributes>
        <viewAttribute id="RBUKRS"/>
        <viewAttribute id="GJAHR"/>
        <viewAttribute id="RACCT"/>
        <viewAttribute id="PRCTR"/>
      </viewAttributes>
      <input node="#ACDOCA"/>
      <measures>
        <measure id="TOTAL_EXPENSE_CC" aggregationType="SUM" sourceColumn="HSL"/>
        <measure id="TOTAL_EXPENSE_TXN" aggregationType="SUM" sourceColumn="WSL"/>
      </measures>
    </calculationView>
  </calculationViews>
</Calculation:scenario>`
    },

    // 15. Inventory Stock Valuation Calc View
    {
        name: 'CA_INVENTORY_VALUATION',
        type: 'CALC_VIEW',
        sqlViewName: '_SYS_BIC."sap.mm/CA_INVENTORY_VALUATION"',
        packageOrSchema: 'sap.mm.models',
        description: 'Material Stock Valuation and Quantities per Plant',
        columnCount: 11,
        hasAggregations: true,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'MBEW', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'MARD', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        xmlDefinition: `<?xml version="1.0" encoding="UTF-8"?>
<Calculation:scenario xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:Calculation="http://www.sap.com/ndb/BiModelCalculation.ecore" schemaVersion="2.3" id="CA_INVENTORY_VALUATION">
  <dataSources>
    <DataSource id="MBEW" type="DATA_BASE_TABLE"><resourceUri>MBEW</resourceUri></DataSource>
    <DataSource id="MARD" type="DATA_BASE_TABLE"><resourceUri>MARD</resourceUri></DataSource>
  </dataSources>
  <calculationViews>
    <calculationView xsi:type="Calculation:JoinView" id="Join_Stock_Val">
      <viewAttributes>
        <viewAttribute id="MATNR"/>
        <viewAttribute id="BWKEY"/>
        <viewAttribute id="LBKUM"/>
        <viewAttribute id="SALK3"/>
      </viewAttributes>
      <input node="#MBEW"/>
      <input node="#MARD"/>
      <joinAttribute name="MATNR"/>
      <joinType>INNER</joinType>
    </calculationView>
    <calculationView xsi:type="Calculation:AggregationView" id="Agg_Stock">
      <viewAttributes>
        <viewAttribute id="MATNR"/>
        <viewAttribute id="BWKEY"/>
      </viewAttributes>
      <input node="#Join_Stock_Val"/>
      <measures>
        <measure id="TOTAL_STOCK_QTY" aggregationType="SUM" sourceColumn="LBKUM"/>
        <measure id="TOTAL_STOCK_VALUATION" aggregationType="SUM" sourceColumn="SALK3"/>
      </measures>
    </calculationView>
  </calculationViews>
</Calculation:scenario>`
    },

    // 16. Spend Analysis Calc View
    {
        name: 'CA_PURCHASE_SPEND',
        type: 'CALC_VIEW',
        sqlViewName: '_SYS_BIC."sap.mm/CA_PURCHASE_SPEND"',
        packageOrSchema: 'sap.mm.analytics',
        description: 'Supplier Procurement Spend and Order Counts',
        columnCount: 9,
        hasAggregations: true,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'EKKO', BASE_OBJECT_TYPE: 'TABLE' },
            { BASE_OBJECT_NAME: 'EKPO', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        xmlDefinition: `<?xml version="1.0" encoding="UTF-8"?>
<Calculation:scenario xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:Calculation="http://www.sap.com/ndb/BiModelCalculation.ecore" schemaVersion="2.3" id="CA_PURCHASE_SPEND">
  <dataSources>
    <DataSource id="EKKO" type="DATA_BASE_TABLE"><resourceUri>EKKO</resourceUri></DataSource>
    <DataSource id="EKPO" type="DATA_BASE_TABLE"><resourceUri>EKPO</resourceUri></DataSource>
  </dataSources>
  <calculationViews>
    <calculationView xsi:type="Calculation:JoinView" id="Join_PO">
      <viewAttributes>
        <viewAttribute id="LIFNR"/>
        <viewAttribute id="BUKRS"/>
        <viewAttribute id="NETWR"/>
        <viewAttribute id="MENGE"/>
      </viewAttributes>
      <input node="#EKKO"/>
      <input node="#EKPO"/>
      <joinAttribute name="EBELN"/>
      <joinType>INNER</joinType>
    </calculationView>
    <calculationView xsi:type="Calculation:AggregationView" id="Agg_Spend">
      <viewAttributes>
        <viewAttribute id="LIFNR"/>
        <viewAttribute id="BUKRS"/>
      </viewAttributes>
      <input node="#Join_PO"/>
      <measures>
        <measure id="TOTAL_SPEND" aggregationType="SUM" sourceColumn="NETWR"/>
        <measure id="TOTAL_ORDERED_UNITS" aggregationType="SUM" sourceColumn="MENGE"/>
      </measures>
    </calculationView>
  </calculationViews>
</Calculation:scenario>`
    },

    // 17. Manufacturing Output & Yield Calc View
    {
        name: 'CA_MANUFACTURING_OUTPUT',
        type: 'CALC_VIEW',
        sqlViewName: '_SYS_BIC."sap.pp/CA_MANUFACTURING_OUTPUT"',
        packageOrSchema: 'sap.pp.models',
        description: 'Production Order Planned vs Delivered Quantities',
        columnCount: 8,
        hasAggregations: true,
        supportedStatus: 'SUPPORTED',
        unsupportedReasons: null,
        dependencies: [
            { BASE_OBJECT_NAME: 'AFPO', BASE_OBJECT_TYPE: 'TABLE' }
        ],
        xmlDefinition: `<?xml version="1.0" encoding="UTF-8"?>
<Calculation:scenario xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:Calculation="http://www.sap.com/ndb/BiModelCalculation.ecore" schemaVersion="2.3" id="CA_MANUFACTURING_OUTPUT">
  <dataSources>
    <DataSource id="AFPO" type="DATA_BASE_TABLE"><resourceUri>AFPO</resourceUri></DataSource>
  </dataSources>
  <calculationViews>
    <calculationView xsi:type="Calculation:AggregationView" id="Agg_Yield">
      <viewAttributes>
        <viewAttribute id="MATNR"/>
        <viewAttribute id="WERKS"/>
      </viewAttributes>
      <input node="#AFPO"/>
      <measures>
        <measure id="TOTAL_TARGET_QTY" aggregationType="SUM" sourceColumn="PSMNG"/>
        <measure id="TOTAL_DELIVERED_QTY" aggregationType="SUM" sourceColumn="WEMNG"/>
      </measures>
    </calculationView>
  </calculationViews>
</Calculation:scenario>`
    }
];

const EXTENDED_CATALOG = [...EXCEL_SEEDED_VIEWS, ...BASE_CATALOG];

module.exports = {
    EXTENDED_CATALOG
};
