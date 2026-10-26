/**
 * Seeded Production and Quality CDS Views from Excel Files & Specifications
 */

const EXCEL_SEEDED_VIEWS = [
    {
        "name": "ZI_MYQ_ProdConfirmationFact",
        "type": "CDS",
        "sqlViewName": "ZIMYQPRODCONF",
        "packageOrSchema": "PP-SFC",
        "description": "Yield / scrap / rework by operation, work center and shift (Grain: RUECK + RMZHL)",
        "columnCount": 52,
        "hasAggregations": true,
        "supportedStatus": "SUPPORTED",
        "unsupportedReasons": null,
        "dependencies": [
            {
                "BASE_OBJECT_NAME": "ZI_MYQ_PRODCONFIRMATIONFACT_SOURCE",
                "BASE_OBJECT_TYPE": "TABLE"
            }
        ],
        "sqlDdl": "CREATE VIEW \"ZIMYQPRODCONF\" AS SELECT\n    base.\"Confirmation\" AS \"Confirmation\",\n    base.\"Counter\" AS \"Counter\",\n    base.\"Order\" AS \"Order\",\n    base.\"Activity\" AS \"Activity\",\n    base.\"Operation_Short_Text\" AS \"Operation_Short_Text\",\n    base.\"Order_Type\" AS \"Order_Type\",\n    base.\"Material\" AS \"Material\",\n    base.\"Material_Description\" AS \"Material_Description\",\n    base.\"Batch\" AS \"Batch\",\n    base.\"Plant\" AS \"Plant\",\n    base.\"Work_Center\" AS \"Work_Center\",\n    base.\"Description\" AS \"Description\",\n    base.\"Posting_Date\" AS \"Posting_Date\",\n    base.\"Start_of_Execution\" AS \"Start_of_Execution\",\n    base.\"Actual_Start_Time\" AS \"Actual_Start_Time\",\n    base.\"Final_Confirmation\" AS \"Final_Confirmation\",\n    base.\"Entered_by_User\" AS \"Entered_by_User\",\n    base.\"Order_category\" AS \"Order_category\",\n    base.\"Reference_Order\" AS \"Reference_Order\",\n    base.\"Created_On\" AS \"Created_On\",\n    base.\"Basic_Start_Date\" AS \"Basic_Start_Date\",\n    base.\"Basic_finish_date\" AS \"Basic_finish_date\",\n    base.\"Item_Number\" AS \"Item_Number\",\n    base.\"Bill_of_Material\" AS \"Bill_of_Material\",\n    base.\"Alternative_BOM\" AS \"Alternative_BOM\",\n    base.\"Planning_Plant\" AS \"Planning_Plant\",\n    base.\"Base_Unit_of_Measure\" AS \"Base_Unit_of_Measure\",\n    base.\"Work_Center_Category\" AS \"Work_Center_Category\",\n    base.\"Start_date\" AS \"Start_date\",\n    base.\"End_Date\" AS \"End_Date\",\n    base.\"Deletion_Flag\" AS \"Deletion_Flag\",\n    base.\"WORKCENTERCOSTCENTER\" AS \"WORKCENTERCOSTCENTER\",\n    base.\"Shift_Grouping\" AS \"Shift_Grouping\",\n    base.\"Shift_Definition\" AS \"Shift_Definition\",\n    base.\"Shift_Definition_Text\" AS \"Shift_Definition_Text\",\n    base.\"Start_Time\" AS \"Start_Time\",\n    base.\"End_Time\" AS \"End_Time\",\n    base.\"Region\" AS \"Region\",\n    base.\"Valuation_Area\" AS \"Valuation_Area\",\n    base.\"Factory_Calendar\" AS \"Factory_Calendar\",\n    base.\"ORDERQUANTITY\" AS \"ORDERQUANTITY\",\n    base.\"PLANNEDSCRAPQUANTITY\" AS \"PLANNEDSCRAPQUANTITY\",\n    base.\"ISUNITDIFFERENTFROMORDER\" AS \"ISUNITDIFFERENTFROMORDER\",\n    base.\"SHIFT\" AS \"SHIFT\",\n    base.\"SHIFTNAME\" AS \"SHIFTNAME\",\n    base.\"ISLASTOPERATION\" AS \"ISLASTOPERATION\",\n    base.\"Base_Unit_of_Measure_1\" AS \"Base_Unit_of_Measure_1\",\n    base.\"CONFIRMEDYIELDQUANTITY\" AS \"CONFIRMEDYIELDQUANTITY\",\n    base.\"CONFIRMEDSCRAPQUANTITY\" AS \"CONFIRMEDSCRAPQUANTITY\",\n    base.\"CONFIRMEDREWORKQUANTITY\" AS \"CONFIRMEDREWORKQUANTITY\",\n    base.\"ORDERTARGETQUANTITY\" AS \"ORDERTARGETQUANTITY\",\n    base.\"CONFIRMATIONCOUNT\" AS \"CONFIRMATIONCOUNT\"\nFROM \"ZI_MYQ_PRODCONFIRMATIONFACT_SOURCE\" base",
        "columns": [
            {
                "name": "Confirmation",
                "originalName": "Confirmation",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Counter",
                "originalName": "Counter",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Order",
                "originalName": "Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Activity",
                "originalName": "Activity",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Operation_Short_Text",
                "originalName": "Operation Short Text",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Order_Type",
                "originalName": "Order Type",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material",
                "originalName": "Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Description",
                "originalName": "Material Description",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Batch",
                "originalName": "Batch",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Plant",
                "originalName": "Plant",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Work_Center",
                "originalName": "Work Center",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Description",
                "originalName": "Description",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Posting_Date",
                "originalName": "Posting Date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Start_of_Execution",
                "originalName": "Start of Execution",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Actual_Start_Time",
                "originalName": "Actual Start (Time)",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Final_Confirmation",
                "originalName": "Final Confirmation",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Entered_by_User",
                "originalName": "Entered by User",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Order_category",
                "originalName": "Order category",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Reference_Order",
                "originalName": "Reference Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Created_On",
                "originalName": "Created On",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Basic_Start_Date",
                "originalName": "Basic Start Date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Basic_finish_date",
                "originalName": "Basic finish date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Item_Number",
                "originalName": "Item Number",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Bill_of_Material",
                "originalName": "Bill of Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Alternative_BOM",
                "originalName": "Alternative BOM",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Planning_Plant",
                "originalName": "Planning Plant",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Base_Unit_of_Measure",
                "originalName": "Base Unit of Measure",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Work_Center_Category",
                "originalName": "Work Center Category",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Start_date",
                "originalName": "Start date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "End_Date",
                "originalName": "End Date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Deletion_Flag",
                "originalName": "Deletion Flag",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "WORKCENTERCOSTCENTER",
                "originalName": "WORKCENTERCOSTCENTER",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Shift_Grouping",
                "originalName": "Shift Grouping",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Shift_Definition",
                "originalName": "Shift Definition",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Shift_Definition_Text",
                "originalName": "Shift Definition Text",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Start_Time",
                "originalName": "Start Time",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "End_Time",
                "originalName": "End Time",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Region",
                "originalName": "Region",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Valuation_Area",
                "originalName": "Valuation Area",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Factory_Calendar",
                "originalName": "Factory Calendar",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "ORDERQUANTITY",
                "originalName": "ORDERQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "PLANNEDSCRAPQUANTITY",
                "originalName": "PLANNEDSCRAPQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "ISUNITDIFFERENTFROMORDER",
                "originalName": "ISUNITDIFFERENTFROMORDER",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "SHIFT",
                "originalName": "SHIFT",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "SHIFTNAME",
                "originalName": "SHIFTNAME",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "ISLASTOPERATION",
                "originalName": "ISLASTOPERATION",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Base_Unit_of_Measure_1",
                "originalName": "Base Unit of Measure",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "CONFIRMEDYIELDQUANTITY",
                "originalName": "CONFIRMEDYIELDQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "CONFIRMEDSCRAPQUANTITY",
                "originalName": "CONFIRMEDSCRAPQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "CONFIRMEDREWORKQUANTITY",
                "originalName": "CONFIRMEDREWORKQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "ORDERTARGETQUANTITY",
                "originalName": "ORDERTARGETQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "CONFIRMATIONCOUNT",
                "originalName": "CONFIRMATIONCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            }
        ],
        "measures": [
            "Counter",
            "ORDERQUANTITY",
            "PLANNEDSCRAPQUANTITY",
            "CONFIRMEDYIELDQUANTITY",
            "CONFIRMEDSCRAPQUANTITY",
            "CONFIRMEDREWORKQUANTITY",
            "ORDERTARGETQUANTITY",
            "CONFIRMATIONCOUNT"
        ],
        "rowCount": 500
    },
    {
        "name": "ZI_MYQ_GoodsMovementFact",
        "type": "CDS",
        "sqlViewName": "ZIMYQGOODSMVT",
        "packageOrSchema": "MM-IM",
        "description": "Movement quantity by movement type, batch and supplier (Grain: MBLNR + MJAHR + ZEILE)",
        "columnCount": 28,
        "hasAggregations": true,
        "supportedStatus": "SUPPORTED",
        "unsupportedReasons": null,
        "dependencies": [
            {
                "BASE_OBJECT_NAME": "ZI_MYQ_GOODSMOVEMENTFACT_SOURCE",
                "BASE_OBJECT_TYPE": "TABLE"
            }
        ],
        "sqlDdl": "CREATE VIEW \"ZIMYQGOODSMVT\" AS SELECT\n    base.\"Material_Document\" AS \"Material_Document\",\n    base.\"Material_Doc__Year\" AS \"Material_Doc__Year\",\n    base.\"Material_Doc_Item\" AS \"Material_Doc_Item\",\n    base.\"Posting_Date\" AS \"Posting_Date\",\n    base.\"Movement_Type\" AS \"Movement_Type\",\n    base.\"Movement_indicator\" AS \"Movement_indicator\",\n    base.\"MOVEMENTCATEGORY\" AS \"MOVEMENTCATEGORY\",\n    base.\"Material\" AS \"Material\",\n    base.\"Material_Description\" AS \"Material_Description\",\n    base.\"Plant\" AS \"Plant\",\n    base.\"Storage_Location\" AS \"Storage_Location\",\n    base.\"Batch\" AS \"Batch\",\n    base.\"Order\" AS \"Order\",\n    base.\"Purchase_order\" AS \"Purchase_order\",\n    base.\"Supplier\" AS \"Supplier\",\n    base.\"Supplier_1\" AS \"Supplier_1\",\n    base.\"Supplier_Batch\" AS \"Supplier_Batch\",\n    base.\"Date_of_Manufacture\" AS \"Date_of_Manufacture\",\n    base.\"SLEDBBD\" AS \"SLEDBBD\",\n    base.\"Base_Unit_of_Measure\" AS \"Base_Unit_of_Measure\",\n    base.\"Entry_Date\" AS \"Entry_Date\",\n    base.\"User_Name\" AS \"User_Name\",\n    base.\"Created_On\" AS \"Created_On\",\n    base.\"Created_By\" AS \"Created_By\",\n    base.\"City\" AS \"City\",\n    base.\"CountryRegion_Key\" AS \"CountryRegion_Key\",\n    base.\"Name\" AS \"Name\",\n    base.\"MOVEMENTQUANTITY\" AS \"MOVEMENTQUANTITY\"\nFROM \"ZI_MYQ_GOODSMOVEMENTFACT_SOURCE\" base",
        "columns": [
            {
                "name": "Material_Document",
                "originalName": "Material Document",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Material_Doc__Year",
                "originalName": "Material Doc. Year",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Material_Doc_Item",
                "originalName": "Material Doc.Item",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Posting_Date",
                "originalName": "Posting Date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Movement_Type",
                "originalName": "Movement Type",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Movement_indicator",
                "originalName": "Movement indicator",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "MOVEMENTCATEGORY",
                "originalName": "MOVEMENTCATEGORY",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material",
                "originalName": "Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Description",
                "originalName": "Material Description",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Plant",
                "originalName": "Plant",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Storage_Location",
                "originalName": "Storage Location",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Batch",
                "originalName": "Batch",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Order",
                "originalName": "Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Purchase_order",
                "originalName": "Purchase order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Supplier",
                "originalName": "Supplier",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Supplier_1",
                "originalName": "Supplier",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Supplier_Batch",
                "originalName": "Supplier Batch",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Date_of_Manufacture",
                "originalName": "Date of Manufacture",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "SLEDBBD",
                "originalName": "SLED/BBD",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Base_Unit_of_Measure",
                "originalName": "Base Unit of Measure",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Entry_Date",
                "originalName": "Entry Date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "User_Name",
                "originalName": "User Name",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Created_On",
                "originalName": "Created On",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Created_By",
                "originalName": "Created By",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "City",
                "originalName": "City",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "CountryRegion_Key",
                "originalName": "Country/Region Key",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Name",
                "originalName": "Name",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "MOVEMENTQUANTITY",
                "originalName": "MOVEMENTQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            }
        ],
        "measures": [
            "CountryRegion_Key",
            "MOVEMENTQUANTITY"
        ],
        "rowCount": 500
    },
    {
        "name": "ZI_MYQ_InspectionLotFact",
        "type": "CDS",
        "sqlViewName": "ZIMYQINSPLOT",
        "packageOrSchema": "QM-IM",
        "description": "Lots, usage decision, lot status (Grain: PRUEFLOS)",
        "columnCount": 29,
        "hasAggregations": true,
        "supportedStatus": "SUPPORTED",
        "unsupportedReasons": null,
        "dependencies": [
            {
                "BASE_OBJECT_NAME": "ZI_MYQ_INSPECTIONLOTFACT_SOURCE",
                "BASE_OBJECT_TYPE": "TABLE"
            }
        ],
        "sqlDdl": "CREATE VIEW \"ZIMYQINSPLOT\" AS SELECT\n    base.\"Inspection_Lot\" AS \"Inspection_Lot\",\n    base.\"Inspection_Type\" AS \"Inspection_Type\",\n    base.\"Insp__Lot_Origin\" AS \"Insp__Lot_Origin\",\n    base.\"INSPECTIONSTAGE\" AS \"INSPECTIONSTAGE\",\n    base.\"Plant\" AS \"Plant\",\n    base.\"Material\" AS \"Material\",\n    base.\"Material_Description\" AS \"Material_Description\",\n    base.\"Batch\" AS \"Batch\",\n    base.\"Order\" AS \"Order\",\n    base.\"Purchasing_Document\" AS \"Purchasing_Document\",\n    base.\"Item\" AS \"Item\",\n    base.\"Material_Document\" AS \"Material_Document\",\n    base.\"Material_Doc__Year\" AS \"Material_Doc__Year\",\n    base.\"Material_Doc_Item\" AS \"Material_Doc_Item\",\n    base.\"Supplier\" AS \"Supplier\",\n    base.\"Date_in_Time_Zone_Where_Lot_Created\" AS \"Date_in_Time_Zone_Where_Lot_Created\",\n    base.\"Start_of_Inspection\" AS \"Start_of_Inspection\",\n    base.\"End_of_Inspection\" AS \"End_of_Inspection\",\n    base.\"Base_Unit_of_Measure\" AS \"Base_Unit_of_Measure\",\n    base.\"INSPECTIONLOTQUANTITY\" AS \"INSPECTIONLOTQUANTITY\",\n    base.\"UD_Code_Group\" AS \"UD_Code_Group\",\n    base.\"Usage_Decision_Code\" AS \"Usage_Decision_Code\",\n    base.\"Code_Valuation\" AS \"Code_Valuation\",\n    base.\"USAGEDECISIONSTATUS\" AS \"USAGEDECISIONSTATUS\",\n    base.\"UD_Code_Date_System_Date\" AS \"UD_Code_Date_System_Date\",\n    base.\"UD_Made_By\" AS \"UD_Made_By\",\n    base.\"Insp__Lot_Created\" AS \"Insp__Lot_Created\",\n    base.\"INSPECTIONLOTCOUNT\" AS \"INSPECTIONLOTCOUNT\",\n    base.\"REJECTEDLOTCOUNT\" AS \"REJECTEDLOTCOUNT\"\nFROM \"ZI_MYQ_INSPECTIONLOTFACT_SOURCE\" base",
        "columns": [
            {
                "name": "Inspection_Lot",
                "originalName": "Inspection Lot",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Inspection_Type",
                "originalName": "Inspection Type",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Insp__Lot_Origin",
                "originalName": "Insp. Lot Origin",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "INSPECTIONSTAGE",
                "originalName": "INSPECTIONSTAGE",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Plant",
                "originalName": "Plant",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material",
                "originalName": "Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Description",
                "originalName": "Material Description",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Batch",
                "originalName": "Batch",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Order",
                "originalName": "Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Purchasing_Document",
                "originalName": "Purchasing Document",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Item",
                "originalName": "Item",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Document",
                "originalName": "Material Document",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Doc__Year",
                "originalName": "Material Doc. Year",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Doc_Item",
                "originalName": "Material Doc.Item",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Supplier",
                "originalName": "Supplier",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Date_in_Time_Zone_Where_Lot_Created",
                "originalName": "Date in Time Zone Where Lot Created",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Start_of_Inspection",
                "originalName": "Start of Inspection",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "End_of_Inspection",
                "originalName": "End of Inspection",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Base_Unit_of_Measure",
                "originalName": "Base Unit of Measure",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "INSPECTIONLOTQUANTITY",
                "originalName": "INSPECTIONLOTQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "UD_Code_Group",
                "originalName": "UD Code Group",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Usage_Decision_Code",
                "originalName": "Usage Decision Code",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Code_Valuation",
                "originalName": "Code Valuation",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "USAGEDECISIONSTATUS",
                "originalName": "USAGEDECISIONSTATUS",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "UD_Code_Date_System_Date",
                "originalName": "UD Code Date (System Date)",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "UD_Made_By",
                "originalName": "UD Made By",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Insp__Lot_Created",
                "originalName": "Insp. Lot Created",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "INSPECTIONLOTCOUNT",
                "originalName": "INSPECTIONLOTCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "REJECTEDLOTCOUNT",
                "originalName": "REJECTEDLOTCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            }
        ],
        "measures": [
            "INSPECTIONLOTQUANTITY",
            "INSPECTIONLOTCOUNT",
            "REJECTEDLOTCOUNT"
        ],
        "rowCount": 415
    },
    {
        "name": "ZI_MYQ_InspectionResultFact",
        "type": "CDS",
        "sqlViewName": "ZIMYQINSPRES",
        "packageOrSchema": "QM-IM",
        "description": "Characteristic results, number of defects (Grain: PRUEFLOS + VORGLFNR + MERKNR)",
        "columnCount": 30,
        "hasAggregations": true,
        "supportedStatus": "SUPPORTED",
        "unsupportedReasons": null,
        "dependencies": [
            {
                "BASE_OBJECT_NAME": "ZI_MYQ_INSPECTIONRESULTFACT_SOURCE",
                "BASE_OBJECT_TYPE": "TABLE"
            }
        ],
        "sqlDdl": "CREATE VIEW \"ZIMYQINSPRES\" AS SELECT\n    base.\"Inspection_Lot\" AS \"Inspection_Lot\",\n    base.\"Current_Node_No_\" AS \"Current_Node_No_\",\n    base.\"Insp__Characteristic\" AS \"Insp__Characteristic\",\n    base.\"Master_Insp__Charac_\" AS \"Master_Insp__Charac_\",\n    base.\"Short_Text\" AS \"Short_Text\",\n    base.\"Unit_of_Measurement\" AS \"Unit_of_Measurement\",\n    base.\"Target_Value\" AS \"Target_Value\",\n    base.\"Lower_Specif__Limit\" AS \"Lower_Specif__Limit\",\n    base.\"Upper_Specif__Limit\" AS \"Upper_Specif__Limit\",\n    base.\"Mean_Value\" AS \"Mean_Value\",\n    base.\"Inspected\" AS \"Inspected\",\n    base.\"Valuation\" AS \"Valuation\",\n    base.\"Status\" AS \"Status\",\n    base.\"NUMBEROFDEFECTS\" AS \"NUMBEROFDEFECTS\",\n    base.\"RESULTSTATUS\" AS \"RESULTSTATUS\",\n    base.\"INSPECTIONSTAGE\" AS \"INSPECTIONSTAGE\",\n    base.\"Plant\" AS \"Plant\",\n    base.\"Material\" AS \"Material\",\n    base.\"Material_Description\" AS \"Material_Description\",\n    base.\"Batch\" AS \"Batch\",\n    base.\"Order\" AS \"Order\",\n    base.\"Supplier\" AS \"Supplier\",\n    base.\"Date_in_Time_Zone_Where_Lot_Created\" AS \"Date_in_Time_Zone_Where_Lot_Created\",\n    base.\"INSPECTIONLOTQUANTITY\" AS \"INSPECTIONLOTQUANTITY\",\n    base.\"Base_Unit_of_Measure\" AS \"Base_Unit_of_Measure\",\n    base.\"Usage_Decision_Code\" AS \"Usage_Decision_Code\",\n    base.\"USAGEDECISIONSTATUS\" AS \"USAGEDECISIONSTATUS\",\n    base.\"UD_Code_Date_System_Date\" AS \"UD_Code_Date_System_Date\",\n    base.\"RESULTCOUNT\" AS \"RESULTCOUNT\",\n    base.\"REJECTEDRESULTCOUNT\" AS \"REJECTEDRESULTCOUNT\"\nFROM \"ZI_MYQ_INSPECTIONRESULTFACT_SOURCE\" base",
        "columns": [
            {
                "name": "Inspection_Lot",
                "originalName": "Inspection Lot",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Current_Node_No_",
                "originalName": "Current Node No.",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Insp__Characteristic",
                "originalName": "Insp. Characteristic",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Master_Insp__Charac_",
                "originalName": "Master Insp. Charac.",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Short_Text",
                "originalName": "Short Text",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Unit_of_Measurement",
                "originalName": "Unit of Measurement",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Target_Value",
                "originalName": "Target Value",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Lower_Specif__Limit",
                "originalName": "Lower Specif. Limit",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Upper_Specif__Limit",
                "originalName": "Upper Specif. Limit",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Mean_Value",
                "originalName": "Mean Value",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Inspected",
                "originalName": "Inspected",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Valuation",
                "originalName": "Valuation",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Status",
                "originalName": "Status",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "NUMBEROFDEFECTS",
                "originalName": "NUMBEROFDEFECTS",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "RESULTSTATUS",
                "originalName": "RESULTSTATUS",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "INSPECTIONSTAGE",
                "originalName": "INSPECTIONSTAGE",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Plant",
                "originalName": "Plant",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material",
                "originalName": "Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Description",
                "originalName": "Material Description",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Batch",
                "originalName": "Batch",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Order",
                "originalName": "Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Supplier",
                "originalName": "Supplier",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Date_in_Time_Zone_Where_Lot_Created",
                "originalName": "Date in Time Zone Where Lot Created",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "INSPECTIONLOTQUANTITY",
                "originalName": "INSPECTIONLOTQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Base_Unit_of_Measure",
                "originalName": "Base Unit of Measure",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Usage_Decision_Code",
                "originalName": "Usage Decision Code",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "USAGEDECISIONSTATUS",
                "originalName": "USAGEDECISIONSTATUS",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "UD_Code_Date_System_Date",
                "originalName": "UD Code Date (System Date)",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "RESULTCOUNT",
                "originalName": "RESULTCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "REJECTEDRESULTCOUNT",
                "originalName": "REJECTEDRESULTCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            }
        ],
        "measures": [
            "Target_Value",
            "Lower_Specif__Limit",
            "Upper_Specif__Limit",
            "Mean_Value",
            "NUMBEROFDEFECTS",
            "INSPECTIONLOTQUANTITY",
            "RESULTCOUNT",
            "REJECTEDRESULTCOUNT"
        ],
        "rowCount": 331
    },
    {
        "name": "ZC_MYQ_OrderSummary",
        "type": "CDS",
        "sqlViewName": "ZCMYQORDERSUMM",
        "packageOrSchema": "PP-SFC",
        "description": "Order cockpit: yield, scrap, rework, movements and inspection side by side (Grain: AUFNR)",
        "columnCount": 26,
        "hasAggregations": true,
        "supportedStatus": "SUPPORTED",
        "unsupportedReasons": null,
        "dependencies": [
            {
                "BASE_OBJECT_NAME": "ZC_MYQ_ORDERSUMMARY_SOURCE",
                "BASE_OBJECT_TYPE": "TABLE"
            }
        ],
        "sqlDdl": "CREATE VIEW \"ZCMYQORDERSUMM\" AS SELECT\n    base.\"Order\" AS \"Order\",\n    base.\"Order_Type\" AS \"Order_Type\",\n    base.\"Order_category\" AS \"Order_category\",\n    base.\"Reference_Order\" AS \"Reference_Order\",\n    base.\"Created_On\" AS \"Created_On\",\n    base.\"Basic_Start_Date\" AS \"Basic_Start_Date\",\n    base.\"Basic_finish_date\" AS \"Basic_finish_date\",\n    base.\"Material\" AS \"Material\",\n    base.\"Bill_of_Material\" AS \"Bill_of_Material\",\n    base.\"Alternative_BOM\" AS \"Alternative_BOM\",\n    base.\"Planning_Plant\" AS \"Planning_Plant\",\n    base.\"Name_1\" AS \"Name_1\",\n    base.\"Base_Unit_of_Measure\" AS \"Base_Unit_of_Measure\",\n    base.\"ORDERQUANTITY\" AS \"ORDERQUANTITY\",\n    base.\"PLANNEDSCRAPQUANTITY\" AS \"PLANNEDSCRAPQUANTITY\",\n    base.\"YIELDQUANTITY\" AS \"YIELDQUANTITY\",\n    base.\"SCRAPQUANTITY\" AS \"SCRAPQUANTITY\",\n    base.\"REWORKQUANTITY\" AS \"REWORKQUANTITY\",\n    base.\"HASUNITMISMATCH\" AS \"HASUNITMISMATCH\",\n    base.\"CONFIRMATIONCOUNT\" AS \"CONFIRMATIONCOUNT\",\n    base.\"PRODUCTIONGRQUANTITY\" AS \"PRODUCTIONGRQUANTITY\",\n    base.\"CONSUMPTIONQUANTITY\" AS \"CONSUMPTIONQUANTITY\",\n    base.\"SCRAPPOSTEDQUANTITY\" AS \"SCRAPPOSTEDQUANTITY\",\n    base.\"INSPECTIONQUANTITY\" AS \"INSPECTIONQUANTITY\",\n    base.\"INSPECTIONLOTCOUNT\" AS \"INSPECTIONLOTCOUNT\",\n    base.\"PRODUCTIONORDERCOUNT\" AS \"PRODUCTIONORDERCOUNT\"\nFROM \"ZC_MYQ_ORDERSUMMARY_SOURCE\" base",
        "columns": [
            {
                "name": "Order",
                "originalName": "Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Order_Type",
                "originalName": "Order Type",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Order_category",
                "originalName": "Order category",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Reference_Order",
                "originalName": "Reference Order",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Created_On",
                "originalName": "Created On",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Basic_Start_Date",
                "originalName": "Basic Start Date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Basic_finish_date",
                "originalName": "Basic finish date",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material",
                "originalName": "Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Bill_of_Material",
                "originalName": "Bill of Material",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Alternative_BOM",
                "originalName": "Alternative BOM",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Planning_Plant",
                "originalName": "Planning Plant",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Name_1",
                "originalName": "Name 1",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Base_Unit_of_Measure",
                "originalName": "Base Unit of Measure",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "ORDERQUANTITY",
                "originalName": "ORDERQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "PLANNEDSCRAPQUANTITY",
                "originalName": "PLANNEDSCRAPQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "YIELDQUANTITY",
                "originalName": "YIELDQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "SCRAPQUANTITY",
                "originalName": "SCRAPQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "REWORKQUANTITY",
                "originalName": "REWORKQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "HASUNITMISMATCH",
                "originalName": "HASUNITMISMATCH",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "CONFIRMATIONCOUNT",
                "originalName": "CONFIRMATIONCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "PRODUCTIONGRQUANTITY",
                "originalName": "PRODUCTIONGRQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "CONSUMPTIONQUANTITY",
                "originalName": "CONSUMPTIONQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "SCRAPPOSTEDQUANTITY",
                "originalName": "SCRAPPOSTEDQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "INSPECTIONQUANTITY",
                "originalName": "INSPECTIONQUANTITY",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "INSPECTIONLOTCOUNT",
                "originalName": "INSPECTIONLOTCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "PRODUCTIONORDERCOUNT",
                "originalName": "PRODUCTIONORDERCOUNT",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            }
        ],
        "measures": [
            "ORDERQUANTITY",
            "PLANNEDSCRAPQUANTITY",
            "YIELDQUANTITY",
            "SCRAPQUANTITY",
            "REWORKQUANTITY",
            "CONFIRMATIONCOUNT",
            "PRODUCTIONGRQUANTITY",
            "CONSUMPTIONQUANTITY",
            "SCRAPPOSTEDQUANTITY",
            "INSPECTIONQUANTITY",
            "INSPECTIONLOTCOUNT",
            "PRODUCTIONORDERCOUNT"
        ],
        "rowCount": 500
    },
    {
        "name": "ZI_MYQ_QualityDefectFact",
        "type": "CDS",
        "sqlViewName": "ZIMYQQUALDEF",
        "packageOrSchema": "QM-QN",
        "description": "Defects, defect text, first cause (Grain: QMNUM + FENUM)",
        "columnCount": 14,
        "hasAggregations": true,
        "supportedStatus": "SUPPORTED",
        "unsupportedReasons": null,
        "dependencies": [
            {
                "BASE_OBJECT_NAME": "QMEL",
                "BASE_OBJECT_TYPE": "TABLE"
            },
            {
                "BASE_OBJECT_NAME": "QMFE",
                "BASE_OBJECT_TYPE": "TABLE"
            }
        ],
        "sqlDdl": "CREATE VIEW \"ZIMYQQUALDEF\" AS SELECT\n    base.\"Quality_Notification\",\n    base.\"Defect_Item\",\n    base.\"Notification_Type\",\n    base.\"Material\",\n    base.\"Material_Description\",\n    base.\"Plant\",\n    base.\"Defect_Code_Group\",\n    base.\"Defect_Code\",\n    base.\"Defect_Text\",\n    base.\"First_Cause_Code\",\n    base.\"First_Cause_Text\",\n    base.\"Defect_Count\",\n    base.\"Confirmed_Defect_Quantity\",\n    base.\"Creation_Date\"\nFROM \"QMFE\" base",
        "columns": [
            {
                "name": "Quality_Notification",
                "originalName": "QMNUM",
                "dataType": "cds.String(12)",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Defect_Item",
                "originalName": "FENUM",
                "dataType": "cds.Integer",
                "isMeasure": false,
                "isKey": true
            },
            {
                "name": "Notification_Type",
                "originalName": "QMART",
                "dataType": "cds.String(4)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material",
                "originalName": "MATNR",
                "dataType": "cds.String(40)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Material_Description",
                "originalName": "MAKTX",
                "dataType": "cds.String(60)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Plant",
                "originalName": "WERKS",
                "dataType": "cds.String(4)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Defect_Code_Group",
                "originalName": "FEGRP",
                "dataType": "cds.String(8)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Defect_Code",
                "originalName": "FECOD",
                "dataType": "cds.String(8)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Defect_Text",
                "originalName": "FETXT",
                "dataType": "cds.String(100)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "First_Cause_Code",
                "originalName": "URCOD",
                "dataType": "cds.String(8)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "First_Cause_Text",
                "originalName": "URTXT",
                "dataType": "cds.String(100)",
                "isMeasure": false,
                "isKey": false
            },
            {
                "name": "Defect_Count",
                "originalName": "DEFECT_COUNT",
                "dataType": "cds.Integer",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Confirmed_Defect_Quantity",
                "originalName": "CONFIRMED_DEFECTS",
                "dataType": "cds.Decimal(15, 2)",
                "isMeasure": true,
                "isKey": false
            },
            {
                "name": "Creation_Date",
                "originalName": "ERDAT",
                "dataType": "cds.Date",
                "isMeasure": false,
                "isKey": false
            }
        ],
        "measures": [
            "Defect_Count",
            "Confirmed_Defect_Quantity"
        ],
        "rowCount": 285
    }
];

module.exports = { EXCEL_SEEDED_VIEWS };
