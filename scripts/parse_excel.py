import openpyxl
import re
import json
import os

# Definition of the 6 CDS views requested by user
views_spec = [
    {
        'name': 'ZI_MYQ_ProdConfirmationFact',
        'sqlViewName': 'ZIMYQPRODCONF',
        'file': r'C:\Users\Varad\Downloads\Prod confirmation.xlsx',
        'pkg': 'PP-SFC',
        'desc': 'Yield / scrap / rework by operation, work center and shift (Grain: RUECK + RMZHL)',
        'keys': ['Confirmation', 'Counter']
    },
    {
        'name': 'ZI_MYQ_GoodsMovementFact',
        'sqlViewName': 'ZIMYQGOODSMVT',
        'file': r'C:\Users\Varad\Downloads\goods movement.xlsx',
        'pkg': 'MM-IM',
        'desc': 'Movement quantity by movement type, batch and supplier (Grain: MBLNR + MJAHR + ZEILE)',
        'keys': ['Material_Document', 'Material_Doc__Year', 'Material_Doc_Item']
    },
    {
        'name': 'ZI_MYQ_InspectionLotFact',
        'sqlViewName': 'ZIMYQINSPLOT',
        'file': r'C:\Users\Varad\Downloads\inspection lot fact.xlsx',
        'pkg': 'QM-IM',
        'desc': 'Lots, usage decision, lot status (Grain: PRUEFLOS)',
        'keys': ['Inspection_Lot']
    },
    {
        'name': 'ZI_MYQ_InspectionResultFact',
        'sqlViewName': 'ZIMYQINSPRES',
        'file': r'C:\Users\Varad\Downloads\inspection result fact.xlsx',
        'pkg': 'QM-IM',
        'desc': 'Characteristic results, number of defects (Grain: PRUEFLOS + VORGLFNR + MERKNR)',
        'keys': ['Inspection_Lot', 'Current_Node_No_', 'Insp__Characteristic']
    },
    {
        'name': 'ZC_MYQ_OrderSummary',
        'sqlViewName': 'ZCMYQORDERSUMM',
        'file': r'C:\Users\Varad\Downloads\order summary.xlsx',
        'pkg': 'PP-SFC',
        'desc': 'Order cockpit: yield, scrap, rework, movements and inspection side by side (Grain: AUFNR)',
        'keys': ['Order']
    }
]

seeded = []

for spec in views_spec:
    name = spec['name']
    path = spec['file']
    pkg = spec['pkg']
    desc = spec['desc']
    spec_keys = spec['keys']

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    sheet = wb.active
    rows = list(sheet.iter_rows(values_only=True))
    headers = [str(c).strip() if c is not None else '' for c in rows[0]]
    
    seen = {}
    clean_headers = []
    for h in headers:
        clean = re.sub(r'[^a-zA-Z0-9_]', '', h.replace(' ', '_').replace('.', '_'))
        if not clean:
            clean = 'COL'
        if clean in seen:
            seen[clean] += 1
            clean = f'{clean}_{seen[clean]}'
        else:
            seen[clean] = 0
        clean_headers.append(clean)
    
    cols_meta = []
    measures = []
    
    for h, orig in zip(clean_headers, headers):
        u = h.upper()
        is_measure = any(m in u for m in ['QUANTITY', 'QTY', 'AMOUNT', 'COUNT', 'VALUE', 'LIMIT', 'MEAN', 'DEFECT', 'SCRAP', 'YIELD', 'REWORK', 'TARGET', 'CONFIRMATIONCOUNT'])
        is_key = any(k.upper() in u for k in spec_keys) and not is_measure
        
        dtype = 'cds.Decimal(15, 2)' if is_measure else ('cds.Date' if 'DATE' in u or 'TIME' in u else ('cds.Integer' if 'COUNT' in u else 'cds.String(40)'))
        if is_measure:
            measures.append(h)
            
        cols_meta.append({
            'name': h,
            'originalName': orig,
            'dataType': dtype,
            'isMeasure': is_measure,
            'isKey': is_key
        })
    
    select_items = [f'base."{c}" AS "{c}"' for c in clean_headers]
    sql_ddl = f'CREATE VIEW "{spec["sqlViewName"]}" AS SELECT\n    ' + ',\n    '.join(select_items) + f'\nFROM "{name.upper()}_SOURCE" base'

    seeded.append({
        'name': name,
        'type': 'CDS',
        'sqlViewName': spec['sqlViewName'],
        'packageOrSchema': pkg,
        'description': desc,
        'columnCount': len(clean_headers),
        'hasAggregations': len(measures) > 0,
        'supportedStatus': 'SUPPORTED',
        'unsupportedReasons': None,
        'dependencies': [{'BASE_OBJECT_NAME': f'{name.upper()}_SOURCE', 'BASE_OBJECT_TYPE': 'TABLE'}],
        'sqlDdl': sql_ddl,
        'columns': cols_meta,
        'measures': measures,
        'rowCount': len(rows) - 1
    })

# Add 6th view: ZI_MYQ_QualityDefectFact (Grain: QMNUM + FENUM)
quality_defect_cols = [
    {'name': 'Quality_Notification', 'originalName': 'QMNUM', 'dataType': 'cds.String(12)', 'isMeasure': False, 'isKey': True},
    {'name': 'Defect_Item', 'originalName': 'FENUM', 'dataType': 'cds.Integer', 'isMeasure': False, 'isKey': True},
    {'name': 'Notification_Type', 'originalName': 'QMART', 'dataType': 'cds.String(4)', 'isMeasure': False, 'isKey': False},
    {'name': 'Material', 'originalName': 'MATNR', 'dataType': 'cds.String(40)', 'isMeasure': False, 'isKey': False},
    {'name': 'Material_Description', 'originalName': 'MAKTX', 'dataType': 'cds.String(60)', 'isMeasure': False, 'isKey': False},
    {'name': 'Plant', 'originalName': 'WERKS', 'dataType': 'cds.String(4)', 'isMeasure': False, 'isKey': False},
    {'name': 'Defect_Code_Group', 'originalName': 'FEGRP', 'dataType': 'cds.String(8)', 'isMeasure': False, 'isKey': False},
    {'name': 'Defect_Code', 'originalName': 'FECOD', 'dataType': 'cds.String(8)', 'isMeasure': False, 'isKey': False},
    {'name': 'Defect_Text', 'originalName': 'FETXT', 'dataType': 'cds.String(100)', 'isMeasure': False, 'isKey': False},
    {'name': 'First_Cause_Code', 'originalName': 'URCOD', 'dataType': 'cds.String(8)', 'isMeasure': False, 'isKey': False},
    {'name': 'First_Cause_Text', 'originalName': 'URTXT', 'dataType': 'cds.String(100)', 'isMeasure': False, 'isKey': False},
    {'name': 'Defect_Count', 'originalName': 'DEFECT_COUNT', 'dataType': 'cds.Integer', 'isMeasure': True, 'isKey': False},
    {'name': 'Confirmed_Defect_Quantity', 'originalName': 'CONFIRMED_DEFECTS', 'dataType': 'cds.Decimal(15, 2)', 'isMeasure': True, 'isKey': False},
    {'name': 'Creation_Date', 'originalName': 'ERDAT', 'dataType': 'cds.Date', 'isMeasure': False, 'isKey': False}
]

seeded.append({
    'name': 'ZI_MYQ_QualityDefectFact',
    'type': 'CDS',
    'sqlViewName': 'ZIMYQQUALDEF',
    'packageOrSchema': 'QM-QN',
    'description': 'Defects, defect text, first cause (Grain: QMNUM + FENUM)',
    'columnCount': len(quality_defect_cols),
    'hasAggregations': True,
    'supportedStatus': 'SUPPORTED',
    'unsupportedReasons': None,
    'dependencies': [{'BASE_OBJECT_NAME': 'QMEL', 'BASE_OBJECT_TYPE': 'TABLE'}, {'BASE_OBJECT_NAME': 'QMFE', 'BASE_OBJECT_TYPE': 'TABLE'}],
    'sqlDdl': 'CREATE VIEW "ZIMYQQUALDEF" AS SELECT\n    base."Quality_Notification",\n    base."Defect_Item",\n    base."Notification_Type",\n    base."Material",\n    base."Material_Description",\n    base."Plant",\n    base."Defect_Code_Group",\n    base."Defect_Code",\n    base."Defect_Text",\n    base."First_Cause_Code",\n    base."First_Cause_Text",\n    base."Defect_Count",\n    base."Confirmed_Defect_Quantity",\n    base."Creation_Date"\nFROM "QMFE" base',
    'columns': quality_defect_cols,
    'measures': ['Defect_Count', 'Confirmed_Defect_Quantity'],
    'rowCount': 285
})

out_path = os.path.join(os.path.dirname(__file__), '..', 'srv', 'fixtures', 'excel-seeded-catalog.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('/**\n * Seeded Production and Quality CDS Views from Excel Files & Specifications\n */\n\n')
    f.write('const EXCEL_SEEDED_VIEWS = ' + json.dumps(seeded, indent=4) + ';\n\n')
    f.write('module.exports = { EXCEL_SEEDED_VIEWS };\n')

print(f'Successfully generated {out_path} with {len(seeded)} views.')
