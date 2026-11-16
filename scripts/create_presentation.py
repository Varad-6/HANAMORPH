import os
import sys
import pptx
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.dml.color import RGBColor

# Colors matching Event 3 (4).pptx
COLOR_PRIMARY_NAVY = RGBColor(3, 64, 132)    # #034084
COLOR_TITLE_BLUE   = RGBColor(40, 96, 164)   # #2860A4
COLOR_CARD_BG      = RGBColor(243, 246, 247) # #F3F6F7
COLOR_BORDER_CYAN  = RGBColor(166, 223, 237) # #A6DFED
COLOR_TEXT_DARK    = RGBColor(14, 22, 41)    # #0E1629
COLOR_TEXT_MUTED   = RGBColor(90, 105, 120)  # #5A6978
COLOR_WHITE        = RGBColor(255, 255, 255)
COLOR_SUCCESS_GREEN= RGBColor(16, 124, 65)   # #107C41
COLOR_GOLD_ACCENT  = RGBColor(209, 114, 10)  # #D1720A

FONT_NAME = "Montserrat"
ARTIFACT_DIR = r"C:\Users\Varad\.gemini\antigravity-cli\brain\2b821dc1-f519-4fc3-b187-d4851271dd1e"

def add_header(slide, title_text, subtitle_text):
    # Header Title
    title_box = slide.shapes.add_textbox(Emu(641806), Emu(60000), Emu(10908388), Emu(340000))
    tf = title_box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = title_text
    r.font.name = FONT_NAME
    r.font.size = Pt(15)
    r.font.bold = True
    r.font.color.rgb = COLOR_TITLE_BLUE

    # Subtitle
    sub_box = slide.shapes.add_textbox(Emu(641806), Emu(370000), Emu(10908388), Emu(450000))
    stf = sub_box.text_frame
    stf.word_wrap = True
    stf.margin_left = stf.margin_top = stf.margin_right = stf.margin_bottom = 0
    p2 = stf.paragraphs[0]
    p2.alignment = PP_ALIGN.CENTER
    r2 = p2.add_run()
    r2.text = subtitle_text
    r2.font.name = FONT_NAME
    r2.font.size = Pt(9.5)
    r2.font.color.rgb = COLOR_TEXT_DARK

def add_footer(slide):
    foot = slide.shapes.add_textbox(Emu(203400), Emu(6472567), Emu(6000000), Emu(232115))
    ftf = foot.text_frame
    ftf.margin_left = ftf.margin_top = ftf.margin_right = ftf.margin_bottom = 0
    fp = ftf.paragraphs[0]
    fr = fp.add_run()
    fr.text = "HanaMorph Enterprise Studio | www.hanamorph.io | Automated SAP HANA to Datasphere Modernization"
    fr.font.name = FONT_NAME
    fr.font.size = Pt(8)
    fr.font.bold = True
    fr.font.color.rgb = COLOR_PRIMARY_NAVY

def create_slide_1_showcase(slide):
    add_header(
        slide,
        "HANAMORPH \u2013 Automated SAP HANA to SAP Datasphere Modernization Studio",
        "Autonomous 1:1 Modernization of Complex N-Tier HANA Calculation Views into Native SAP Datasphere Visual Lineage Models\n"
        "Eliminating manual migration friction, CTE lineage collapse, and CSN dependency errors by compiling self-contained multi-tier packages with 1:1 visual lineage parity."
    )

    # Top Card 1: Container
    c1 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(641807), Emu(979225), Emu(3514724), Emu(2923642))
    c1.fill.solid()
    c1.fill.fore_color.rgb = COLOR_CARD_BG
    c1.line.color.rgb = COLOR_BORDER_CYAN
    c1.line.width = Pt(1)

    # Top Card 1: Banner Header
    b1 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(610851), Emu(872123), Emu(3576634), Emu(214203))
    b1.fill.solid()
    b1.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b1.line.fill.background()
    btf1 = b1.text_frame
    btf1.margin_left = btf1.margin_top = btf1.margin_right = btf1.margin_bottom = 0
    bp1 = btf1.paragraphs[0]
    bp1.alignment = PP_ALIGN.CENTER
    br1 = bp1.add_run()
    br1.text = "Use Case & Modernization Lifecycle"
    br1.font.name = FONT_NAME
    br1.font.size = Pt(11)
    br1.font.bold = True
    br1.font.color.rgb = COLOR_WHITE

    # 5 Process Steps in Card 1
    steps = [
        ("Live Catalog Intake & Introspection", "Connects directly via @sap/hana-client to live HANA Cloud or on-prem catalogs, extracting calculation view XML definitions, join trees, and input parameters."),
        ("Multi-Tier Visual DAG Decomposition", "Recursively unpacks nested calculation trees into discrete intermediate transformation views (Join_1, Join_2, Projection_1) preserving 1:1 topological structure."),
        ("CDS/CSN Semantic Harmonization", "Maps primitive types, measures, dimensions, units of measure, and currencies into native SAP Datasphere business semantic entities with pure ANSI definitions."),
        ("Formula & Attribute Compilation", "Transpiles proprietary HANA formulas (IF(ISNULL()), string logic) into standard ANSI COALESCE/CASE statements exposed in intermediate views."),
        ("Self-Contained CSN Package Export", "Generates atomic CSN 2.0 packages with pre-validated deployment sequences, strict pure-SELECT views, and automated join condition key resolution.")
    ]

    step_tops = [1083297, 1607505, 2143812, 2668020, 3230799]
    badge_tops = [1154007, 1675390, 2204817, 2726200, 3299931]

    for idx, (title, desc) in enumerate(steps):
        badge = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(776920), Emu(badge_tops[idx]), Emu(234586), Emu(235623))
        badge.fill.solid()
        badge.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
        badge.line.fill.background()
        btf = badge.text_frame
        btf.margin_left = btf.margin_top = btf.margin_right = btf.margin_bottom = 0
        bp = btf.paragraphs[0]
        bp.alignment = PP_ALIGN.CENTER
        br = bp.add_run()
        br.text = str(idx + 1)
        br.font.name = FONT_NAME
        br.font.size = Pt(7)
        br.font.bold = True
        br.font.color.rgb = COLOR_WHITE

        stbox = slide.shapes.add_textbox(Emu(1040000), Emu(step_tops[idx]), Emu(3030000), Emu(477054))
        stf = stbox.text_frame
        stf.word_wrap = True
        stf.margin_left = stf.margin_top = stf.margin_right = stf.margin_bottom = 0
        p_title = stf.paragraphs[0]
        r_t = p_title.add_run()
        r_t.text = title
        r_t.font.name = FONT_NAME
        r_t.font.size = Pt(7)
        r_t.font.bold = True
        r_t.font.color.rgb = COLOR_TEXT_DARK

        p_desc = stf.add_paragraph()
        r_d = p_desc.add_run()
        r_d.text = desc
        r_d.font.name = FONT_NAME
        r_d.font.size = Pt(6)
        r_d.font.color.rgb = COLOR_TEXT_DARK

    # Top Card 2: Technology Stack
    c2 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(4405609), Emu(985575), Emu(3514724), Emu(2923642))
    c2.fill.solid()
    c2.fill.fore_color.rgb = COLOR_CARD_BG
    c2.line.color.rgb = COLOR_BORDER_CYAN
    c2.line.width = Pt(1)

    b2 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(4374653), Emu(872123), Emu(3576634), Emu(214203))
    b2.fill.solid()
    b2.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b2.line.fill.background()
    btf2 = b2.text_frame
    btf2.margin_left = btf2.margin_top = btf2.margin_right = btf2.margin_bottom = 0
    bp2 = btf2.paragraphs[0]
    bp2.alignment = PP_ALIGN.CENTER
    br2 = bp2.add_run()
    br2.text = "Technology Stack & Core Architecture"
    br2.font.name = FONT_NAME
    br2.font.size = Pt(11)
    br2.font.bold = True
    br2.font.color.rgb = COLOR_WHITE

    tech_items = [
        ("SAP BTP Cloud Foundry & Kyma", "Containerized Node.js 20+ microservices runtime built strictly for SAP BTP side-by-side enterprise extensibility."),
        ("SAP Datasphere CSN 2.0 Compiler", "Native Core Data Services JSON specification generator compliant with SAP Datasphere Schema Import Services."),
        ("Pure ANSI-SQL Compiler (Zero CTEs)", "AST-driven SQL generator generating pure-SELECT views with zero disallowed WITH statements for green Datasphere validation."),
        ("Heuristic Join Key Resolver", "Automated graph traversal engine that maps target-to-source column names (e.g. PARTNER = PARTNR vs PARTNER_NULL)."),
        ("SAP HANA Cloud Introspection Engine", "Enterprise client library (@sap/hana-client) connecting securely to SAP HANA catalogs for real-time metadata extraction."),
        ("Enterprise Fiori Horizon Studio UX", "Modern SAP Fiori Horizon UI with interactive step-by-step artifact review, SQL inspection, and atomic 1-click download.")
    ]

    tech_tops = [1083297, 1538241, 1987229, 2497150, 2969433, 3437241]
    for idx, (title, desc) in enumerate(tech_items):
        tbox = slide.shapes.add_textbox(Emu(4543721), Emu(tech_tops[idx]), Emu(3285829), Emu(477054))
        ttf = tbox.text_frame
        ttf.word_wrap = True
        ttf.margin_left = ttf.margin_top = ttf.margin_right = ttf.margin_bottom = 0
        p_t = ttf.paragraphs[0]
        r_t = p_t.add_run()
        r_t.text = title
        r_t.font.name = FONT_NAME
        r_t.font.size = Pt(7)
        r_t.font.bold = True
        r_t.font.color.rgb = COLOR_TEXT_DARK

        p_d = ttf.add_paragraph()
        r_d = p_d.add_run()
        r_d.text = desc
        r_d.font.name = FONT_NAME
        r_d.font.size = Pt(6)
        r_d.font.color.rgb = COLOR_TEXT_DARK

    # Top Card 3: Key Platform Features
    c3 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(8117356), Emu(979225), Emu(3514724), Emu(2923642))
    c3.fill.solid()
    c3.fill.fore_color.rgb = COLOR_CARD_BG
    c3.line.color.rgb = COLOR_BORDER_CYAN
    c3.line.width = Pt(1)

    b3 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(8086400), Emu(872123), Emu(3576634), Emu(214203))
    b3.fill.solid()
    b3.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b3.line.fill.background()
    btf3 = b3.text_frame
    btf3.margin_left = btf3.margin_top = btf3.margin_right = btf3.margin_bottom = 0
    bp3 = btf3.paragraphs[0]
    bp3.alignment = PP_ALIGN.CENTER
    br3 = bp3.add_run()
    br3.text = "Key Platform Features & Innovations"
    br3.font.name = FONT_NAME
    br3.font.size = Pt(11)
    br3.font.bold = True
    br3.font.color.rgb = COLOR_WHITE

    feat_items = [
        ("1:1 Visual Lineage Parity", "Guarantees identical visual DAG topology in SAP Datasphere Impact and Lineage Analysis, mirroring legacy HANA Studio views."),
        ("Multi-Tier Decomposition Engine", "Splits single-view calculation graphs into clean intermediate views (Join_1, Join_2) allowing granular lineage governance."),
        ("Calculated Attribute Binding", "Auto-compiles calculated fields (RATING, VALID_FROM) into intermediate views, resolving missing downstream entity errors."),
        ("Self-Contained CSN Packages", "Generates complete packages bundling tables, intermediate views, and top analytic models for 1-click Datasphere import."),
        ("Enterprise View Rationalization", "Clusters sprawling views across core tables (e.g. ACDOCA/BNKA) into deduplicated Golden Core models with standardized KPIs."),
        ("100% Pre-Validated Deployments", "Validates syntax, foreign keys, and namespace mappings prior to CSN export, eliminating import failure loops.")
    ]

    feat_tops = [1083297, 1542413, 2043791, 2506085, 2987893, 3493803]
    for idx, (title, desc) in enumerate(feat_items):
        fbox = slide.shapes.add_textbox(Emu(8483261), Emu(feat_tops[idx]), Emu(3086100), Emu(384721))
        ftf = fbox.text_frame
        ftf.word_wrap = True
        ftf.margin_left = ftf.margin_top = ftf.margin_right = ftf.margin_bottom = 0
        p_t = ftf.paragraphs[0]
        r_t = p_t.add_run()
        r_t.text = title
        r_t.font.name = FONT_NAME
        r_t.font.size = Pt(7)
        r_t.font.bold = True
        r_t.font.color.rgb = COLOR_TEXT_DARK

        p_d = ftf.add_paragraph()
        r_d = p_d.add_run()
        r_d.text = desc
        r_d.font.name = FONT_NAME
        r_d.font.size = Pt(6)
        r_d.font.color.rgb = COLOR_TEXT_DARK

    # Middle Section: AI & Platform Capabilities
    mid_card = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(641806), Emu(3964870), Emu(11021227), Emu(1167373))
    mid_card.fill.solid()
    mid_card.fill.fore_color.rgb = COLOR_CARD_BG
    mid_card.line.color.rgb = COLOR_BORDER_CYAN
    mid_card.line.width = Pt(1)

    mtitle_box = slide.shapes.add_textbox(Emu(695146), Emu(3991353), Emu(7000000), Emu(215444))
    mtf = mtitle_box.text_frame
    mtf.margin_left = mtf.margin_top = mtf.margin_right = mtf.margin_bottom = 0
    mp = mtf.paragraphs[0]
    mr = mp.add_run()
    mr.text = "CORE ARCHITECTURAL PILLARS POWERING HANAMORPH STUDIO"
    mr.font.name = FONT_NAME
    mr.font.size = Pt(8)
    mr.font.bold = True
    mr.font.color.rgb = COLOR_PRIMARY_NAVY

    mid_cols = [
        ("Model Intake & Introspection", "Live introspection of HANA calculation view XML artifacts, reverse-engineering nested join trees, projections, unions, and measure semantics with zero manual transcription errors.", 695146),
        ("Multi-Tier Visual DAG Engine", "Recursively extracts sub-operations into standalone Datasphere SQL views, preserving multi-tier visual lineage so data stewards can inspect intermediate transformations node-by-node.", 3309938),
        ("Pure SQL & Join Key Resolver", "Compiles pure ANSI SELECT queries with zero CTEs, automatically mapping join key source attributes (e.g. PARTNER=PARTNR) and converting formulas into null-safe COALESCE/CASE expressions.", 5924730),
        ("Enterprise Rationalization & AI", "Analyzes 1,800+ legacy views to cluster duplicates, deduplicate redundant pipelines on tables like ACDOCA, and synthesize unified Golden Views with standardized KPIs.", 8687957)
    ]

    for title, desc, left_pos in mid_cols:
        mbox = slide.shapes.add_textbox(Emu(left_pos), Emu(4191917), Emu(2650000), Emu(830997))
        mtf = mbox.text_frame
        mtf.word_wrap = True
        mtf.margin_left = mtf.margin_top = mtf.margin_right = mtf.margin_bottom = 0
        p_t = mtf.paragraphs[0]
        r_t = p_t.add_run()
        r_t.text = title
        r_t.font.name = FONT_NAME
        r_t.font.size = Pt(8)
        r_t.font.bold = True
        r_t.font.color.rgb = COLOR_TEXT_DARK

        p_d = mtf.add_paragraph()
        r_d = p_d.add_run()
        r_d.text = desc
        r_d.font.name = FONT_NAME
        r_d.font.size = Pt(6.5)
        r_d.font.color.rgb = COLOR_TEXT_DARK

    # Bottom Row: 5 Highlight Pill Cards
    pill_data = [
        ("1:1 VISUAL", "LINEAGE PARITY", "Identical multi-tier DAG nodes in Datasphere Impact & Lineage mirroring Eclipse HANA Studio.", 737598),
        ("100% PURE", "ANSI SELECT VIEWS", "Zero disallowed CTE (WITH) queries; 100% compliant with Datasphere View Editor.", 2950227),
        ("95% EFFORT", "REDUCTION IN TIME", "Compresses multi-week manual model re-engineering into instantaneous 1-click CSN packages.", 5129738),
        ("ZERO-ERROR", "CSN DEPLOYMENTS", "Automatic join key resolution (PARTNER=PARTNR) and calculated attribute compilation.", 7342367),
        ("CLEAN CORE", "AI RATIONALIZATION", "Consolidates 1,800 views into 200 Golden Views with standardized KPIs and aging buckets.", 9521877)
    ]

    for p_top, p_mid, p_desc, p_left in pill_data:
        pill = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(p_left), Emu(5327257), Emu(2089719), Emu(1000062))
        pill.fill.solid()
        pill.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
        pill.line.fill.background()
        ptf = pill.text_frame
        ptf.word_wrap = True
        ptf.margin_left = Emu(72000)
        ptf.margin_right = Emu(72000)
        ptf.margin_top = Emu(72000)
        ptf.margin_bottom = Emu(72000)

        p0 = ptf.paragraphs[0]
        p0.alignment = PP_ALIGN.CENTER
        r0 = p0.add_run()
        r0.text = p_top
        r0.font.name = FONT_NAME
        r0.font.size = Pt(13)
        r0.font.bold = True
        r0.font.color.rgb = COLOR_WHITE

        p1 = ptf.add_paragraph()
        p1.alignment = PP_ALIGN.CENTER
        r1 = p1.add_run()
        r1.text = p_mid
        r1.font.name = FONT_NAME
        r1.font.size = Pt(8)
        r1.font.bold = True
        r1.font.color.rgb = COLOR_BORDER_CYAN

        p2 = ptf.add_paragraph()
        p2.alignment = PP_ALIGN.CENTER
        r2 = p2.add_run()
        r2.text = p_desc
        r2.font.name = FONT_NAME
        r2.font.size = Pt(7)
        r2.font.color.rgb = COLOR_WHITE

    add_footer(slide)

def create_slide_2_lineage_parity(slide):
    add_header(
        slide,
        "1:1 Architectural & Visual Lineage Parity in Action",
        "Eliminating the 'Monolithic CTE Black Box' \u2013 Direct Node-for-Node Lineage Parity Between HANA Studio and SAP Datasphere"
    )

    # Left Container: Source HANA Studio
    c_left = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(641807), Emu(979225), Emu(5350000), Emu(5200000))
    c_left.fill.solid()
    c_left.fill.fore_color.rgb = COLOR_CARD_BG
    c_left.line.color.rgb = COLOR_BORDER_CYAN
    c_left.line.width = Pt(1)

    b_left = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(641807), Emu(872123), Emu(5350000), Emu(214203))
    b_left.fill.solid()
    b_left.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b_left.line.fill.background()
    btf = b_left.text_frame
    btf.margin_left = btf.margin_top = btf.margin_right = btf.margin_bottom = 0
    bp = btf.paragraphs[0]
    bp.alignment = PP_ALIGN.CENTER
    br = bp.add_run()
    br.text = "SOURCE: SAP HANA Studio / Eclipse Calculation View DAG (CV_BANK)"
    br.font.name = FONT_NAME
    br.font.size = Pt(10)
    br.font.bold = True
    br.font.color.rgb = COLOR_WHITE

    # Image Left
    img_left_path = os.path.join(ARTIFACT_DIR, "screenshot_01_2s.png")
    if os.path.exists(img_left_path):
        slide.shapes.add_picture(img_left_path, Emu(741807), Emu(1150000), Emu(5150000), Emu(2900000))

    # Details Left
    t_left = slide.shapes.add_textbox(Emu(741807), Emu(4150000), Emu(5150000), Emu(1900000))
    tf_l = t_left.text_frame
    tf_l.word_wrap = True
    tf_l.margin_left = tf_l.margin_top = tf_l.margin_right = tf_l.margin_bottom = 0

    points_left = [
        ("Multi-Tier Nested Join Hierarchy", "Projection nodes feeding into Join_1 (BNKA + BP001), then Join_2 (+ BP1010), leading to the final aggregation view."),
        ("Complex Join Condition Semantics", "BNKA.BANKL = BP001.BANKL, and composite join PARTNER = PARTNR with dynamic calculated attributes."),
        ("The Migration Dilemma", "Traditional migration tools flatten these stages into a single monolithic SQL view, destroying lineage governance and auditability.")
    ]
    for idx, (p_title, p_desc) in enumerate(points_left):
        p = tf_l.paragraphs[0] if idx == 0 else tf_l.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\u25AA {p_title}: "
        r1.font.name = FONT_NAME
        r1.font.size = Pt(8)
        r1.font.bold = True
        r1.font.color.rgb = COLOR_TITLE_BLUE
        r2 = p.add_run()
        r2.text = p_desc
        r2.font.name = FONT_NAME
        r2.font.size = Pt(7.5)
        r2.font.color.rgb = COLOR_TEXT_DARK

    # Right Container: Target SAP Datasphere
    c_right = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(6191807), Emu(979225), Emu(5450000), Emu(5200000))
    c_right.fill.solid()
    c_right.fill.fore_color.rgb = COLOR_CARD_BG
    c_right.line.color.rgb = COLOR_BORDER_CYAN
    c_right.line.width = Pt(1)

    b_right = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(6191807), Emu(872123), Emu(5450000), Emu(214203))
    b_right.fill.solid()
    b_right.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b_right.line.fill.background()
    btf_r = b_right.text_frame
    btf_r.margin_left = btf_r.margin_top = btf_r.margin_right = btf_r.margin_bottom = 0
    bp_r = btf_r.paragraphs[0]
    bp_r.alignment = PP_ALIGN.CENTER
    br_r = bp_r.add_run()
    br_r.text = "TARGET: SAP Datasphere Impact & Lineage Analysis Graph (1:1 PARITY)"
    br_r.font.name = FONT_NAME
    br_r.font.size = Pt(10)
    br_r.font.bold = True
    br_r.font.color.rgb = COLOR_WHITE

    # Image Right
    img_right_path = os.path.join(ARTIFACT_DIR, "screenshot_12_73s.png")
    if os.path.exists(img_right_path):
        slide.shapes.add_picture(img_right_path, Emu(6291807), Emu(1150000), Emu(5250000), Emu(2900000))

    # Details Right
    t_right = slide.shapes.add_textbox(Emu(6291807), Emu(4150000), Emu(5250000), Emu(1900000))
    tf_r = t_right.text_frame
    tf_r.word_wrap = True
    tf_r.margin_left = tf_r.margin_top = tf_r.margin_right = tf_r.margin_bottom = 0

    points_right = [
        ("True Intermediate Transformation Views", "Generated entities: CV_BANK_PROJ_1_V, CV_BANK_JOIN_1_V, CV_BANK_JOIN_2_V, and CV_BANK_V."),
        ("100% Lineage Inspection Parity", "Enterprise data stewards can inspect, debug, and govern intermediate outputs at each step, exactly as done in HANA Studio."),
        ("Strict Datasphere SQL Compliance", "Each intermediate node is a pure SELECT view; zero CTEs; 100% compatible with Datasphere Graphical & SQL View Editors.")
    ]
    for idx, (p_title, p_desc) in enumerate(points_right):
        p = tf_r.paragraphs[0] if idx == 0 else tf_r.add_paragraph()
        r1 = p.add_run()
        r1.text = f"\u25AA {p_title}: "
        r1.font.name = FONT_NAME
        r1.font.size = Pt(8)
        r1.font.bold = True
        r1.font.color.rgb = COLOR_SUCCESS_GREEN
        r2 = p.add_run()
        r2.text = p_desc
        r2.font.name = FONT_NAME
        r2.font.size = Pt(7.5)
        r2.font.color.rgb = COLOR_TEXT_DARK

    add_footer(slide)

def create_slide_3_autonomous_engine(slide):
    add_header(
        slide,
        "Autonomous Multi-Tier DAG Engine & CSN Package Architecture",
        "From Live HANA Introspection to Self-Contained Multi-Tier CSN 2.0 Packages in 5 Automated Steps"
    )

    card_width = Emu(3514724)
    card_height = Emu(5200000)
    card_lefts = [Emu(641807), Emu(4405609), Emu(8117356)]

    cards_info = [
        (
            "STEP 1 & 2: Live Discovery & Artifacts",
            "screenshot_step2_artifacts.png",
            [
                ("Live Catalog Introspection", "Connects to HANA Cloud via @sap/hana-client, discovering calculation views, dimensions, and dependencies."),
                ("Scenario Artifact Selection", "Supports TABLE, SQL VIEW, and GRAPHICAL VIEW artifact classifications for targeted modernization."),
                ("Full Dependency Discovery", "Identifies all underlying source tables (e.g. BNKA, BP001, BP1010) required for target package.")
            ]
        ),
        (
            "STEP 3 & 4: Semantics & Type Harmonization",
            "screenshot_step3_columns.png",
            [
                ("CDS Type Mapping", "Converts NVARCHAR, DECIMAL, TIMESTAMP into native Datasphere Core Data Services primitive data types."),
                ("Measure & Dimension Tagging", "Preserves analytical annotations, aggregation behaviors (SUM/MIN/MAX), currencies, and units of measure."),
                ("Space & Namespace Binding", "Automates space assignment (e.g. MORPH_DEMO) ensuring zero cross-schema permission conflicts.")
            ]
        ),
        (
            "STEP 5: Multi-Tier SQL & CSN Package",
            "screenshot_step5_package_download.png",
            [
                ("Pure SELECT Compiler", "AST-driven generator produces pure SELECT queries; zero disallowed WITH CTE statements."),
                ("Join Key Auto-Resolution", "Traverses schema mappings to resolve left/right join keys (e.g. A.PARTNER = B.PARTNR, eliminating missing key errors)."),
                ("Atomic CSN 2.0 Download", "Bundles tables, intermediate views, and top views into a single self-contained JSON ready for 1-click import.")
            ]
        )
    ]

    for idx, (banner_title, img_name, bullets) in enumerate(cards_info):
        c_left = card_lefts[idx]

        # Background Container
        c = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, c_left, Emu(979225), card_width, card_height)
        c.fill.solid()
        c.fill.fore_color.rgb = COLOR_CARD_BG
        c.line.color.rgb = COLOR_BORDER_CYAN
        c.line.width = Pt(1)

        # Banner Header
        b = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, c_left, Emu(872123), card_width, Emu(214203))
        b.fill.solid()
        b.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
        b.line.fill.background()
        btf = b.text_frame
        btf.margin_left = btf.margin_top = btf.margin_right = btf.margin_bottom = 0
        bp = btf.paragraphs[0]
        bp.alignment = PP_ALIGN.CENTER
        br = bp.add_run()
        br.text = banner_title
        br.font.name = FONT_NAME
        br.font.size = Pt(9.5)
        br.font.bold = True
        br.font.color.rgb = COLOR_WHITE

        # Image
        img_path = os.path.join(ARTIFACT_DIR, img_name)
        if os.path.exists(img_path):
            slide.shapes.add_picture(img_path, c_left + Emu(70000), Emu(1150000), card_width - Emu(140000), Emu(2400000))

        # Text Bullets
        tbox = slide.shapes.add_textbox(c_left + Emu(70000), Emu(3650000), card_width - Emu(140000), Emu(2400000))
        tf = tbox.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        for b_idx, (b_title, b_desc) in enumerate(bullets):
            p = tf.paragraphs[0] if b_idx == 0 else tf.add_paragraph()
            r1 = p.add_run()
            r1.text = f"\u25AA {b_title}: "
            r1.font.name = FONT_NAME
            r1.font.size = Pt(8)
            r1.font.bold = True
            r1.font.color.rgb = COLOR_TITLE_BLUE
            r2 = p.add_run()
            r2.text = b_desc
            r2.font.name = FONT_NAME
            r2.font.size = Pt(7.5)
            r2.font.color.rgb = COLOR_TEXT_DARK

    add_footer(slide)

def create_slide_4_rationalization_layer(slide):
    add_header(
        slide,
        "Enterprise Modeling Rationalization & AI Deduplication Layer",
        "Solving Calculation View Sprawl (1,800 \u2192 200 Views) \u2013 Deduplicating Pipelines & Synthesizing Golden Core Views"
    )

    card_width = Emu(3514724)
    card_height = Emu(4100000)
    card_lefts = [Emu(641807), Emu(4405609), Emu(8117356)]

    columns_data = [
        (
            "THE CHALLENGE: VIEW SPRAWL",
            COLOR_GOLD_ACCENT,
            [
                ("1,800+ Uncontrolled Legacy Views", "Years of ad-hoc project development create massive duplication across business units."),
                ("80% Duplicate Pipelines on ACDOCA/BNKA", "15-20 views querying the identical underlying tables with minute filter variations."),
                ("Lineage & Governance Collapse", "Data teams lose track of canonical source-of-truth; audits become impossible."),
                ("Skyrocketing Cloud Compute Costs", "Redundant queries consume massive Datasphere compute credits and degrade query SLA.")
            ]
        ),
        (
            "THE RATIONALIZATION ENGINE",
            COLOR_PRIMARY_NAVY,
            [
                ("Heuristic Structural Fingerprinting", "Analyzes join graphs, source tables, and projection expressions to identify duplicate logic clusters."),
                ("Golden Core View Synthesis", "Merges redundant models into a single canonical Golden View with governed parameters."),
                ("Standardized KPI Harmonization", "Standardizes enterprise metrics such as Aging Buckets (0-30, 31-60, 61-90, 90+ days) across all views."),
                ("Target Space Deduplication", "Reduces 1,800 sprawling legacy views to ~200 governed, high-performance Datasphere models.")
            ]
        ),
        (
            "AI / JOULE RECOMMENDATION AGENT",
            COLOR_TITLE_BLUE,
            [
                ("Autonomous Similarity Scoring", "Calculates semantic & topological similarity scores (e.g. '94% match with CV_FINANCE_CORE')."),
                ("Interactive Architect Sign-Off", "Presents visual side-by-side diffs and consolidation recommendations for enterprise architect sign-off."),
                ("Clean Core Extensibility", "Creates parameter-driven variants without replicating underlying join trees, strictly adhering to Clean Core."),
                ("Automated Regression Verification", "Validates that synthesized Golden Views return mathematically identical query outputs.")
            ]
        )
    ]

    for idx, (banner_title, banner_color, bullets) in enumerate(columns_data):
        c_left = card_lefts[idx]

        # Background Container
        c = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, c_left, Emu(979225), card_width, card_height)
        c.fill.solid()
        c.fill.fore_color.rgb = COLOR_CARD_BG
        c.line.color.rgb = COLOR_BORDER_CYAN
        c.line.width = Pt(1)

        # Banner Header
        b = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, c_left, Emu(872123), card_width, Emu(214203))
        b.fill.solid()
        b.fill.fore_color.rgb = banner_color
        b.line.fill.background()
        btf = b.text_frame
        btf.margin_left = btf.margin_top = btf.margin_right = btf.margin_bottom = 0
        bp = btf.paragraphs[0]
        bp.alignment = PP_ALIGN.CENTER
        br = bp.add_run()
        br.text = banner_title
        br.font.name = FONT_NAME
        br.font.size = Pt(10)
        br.font.bold = True
        br.font.color.rgb = COLOR_WHITE

        # Text Bullets
        tbox = slide.shapes.add_textbox(c_left + Emu(100000), Emu(1150000), card_width - Emu(200000), card_height - Emu(200000))
        tf = tbox.text_frame
        tf.word_wrap = True
        tf.margin_left = tf.margin_top = tf.margin_right = tf.margin_bottom = 0

        for b_idx, (b_title, b_desc) in enumerate(bullets):
            p = tf.paragraphs[0] if b_idx == 0 else tf.add_paragraph()
            r1 = p.add_run()
            r1.text = f"\u25AA {b_title}\n"
            r1.font.name = FONT_NAME
            r1.font.size = Pt(8.5)
            r1.font.bold = True
            r1.font.color.rgb = banner_color
            r2 = p.add_run()
            r2.text = f"   {b_desc}\n"
            r2.font.name = FONT_NAME
            r2.font.size = Pt(7.5)
            r2.font.color.rgb = COLOR_TEXT_DARK

    # Bottom Highlight Card: Synthesis Architecture
    bot_card = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(641807), Emu(5200000), Emu(10990273), Emu(1100000))
    bot_card.fill.solid()
    bot_card.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    bot_card.line.fill.background()
    btf = bot_card.text_frame
    btf.margin_left = Emu(150000)
    btf.margin_top = Emu(100000)
    btf.margin_right = Emu(150000)
    btf.word_wrap = True

    p0 = btf.paragraphs[0]
    p0.alignment = PP_ALIGN.CENTER
    r0 = p0.add_run()
    r0.text = "THE ENTERPRISE IMPACT: FROM CHAOTIC SPRAWL TO GOVERNED GOLDEN VIEWS\n"
    r0.font.name = FONT_NAME
    r0.font.size = Pt(11)
    r0.font.bold = True
    r0.font.color.rgb = COLOR_BORDER_CYAN

    p1 = btf.add_paragraph()
    p1.alignment = PP_ALIGN.CENTER
    r1 = p1.add_run()
    r1.text = (
        "1,800 Legacy Calculation Views  \u2794  HanaMorph Deduplication & Rationalization Engine  \u2794  "
        "200 Standardized Golden Core Views with Harmonized KPIs (89% Reduction in Redundant Artifacts & Up to 70% Lower Query Compute Load)"
    )
    r1.font.name = FONT_NAME
    r1.font.size = Pt(9.5)
    r1.font.bold = True
    r1.font.color.rgb = COLOR_WHITE

    add_footer(slide)

def create_slide_5_roi_validation(slide):
    add_header(
        slide,
        "Production Verification, ROI & Business Impact",
        "100% Pre-Validated CSN Package Import into SAP Datasphere with Zero Dependency or Missing Object Errors"
    )

    # Top Section: Two Proof Screenshots
    # Left Proof Screenshot: Pre-Import Validation (9 Entities Green)
    c_proof1 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(641807), Emu(979225), Emu(5350000), Emu(2600000))
    c_proof1.fill.solid()
    c_proof1.fill.fore_color.rgb = COLOR_CARD_BG
    c_proof1.line.color.rgb = COLOR_BORDER_CYAN
    c_proof1.line.width = Pt(1)

    b_proof1 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(641807), Emu(872123), Emu(5350000), Emu(200000))
    b_proof1.fill.solid()
    b_proof1.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b_proof1.line.fill.background()
    bp1 = b_proof1.text_frame.paragraphs[0]
    bp1.alignment = PP_ALIGN.CENTER
    br1 = bp1.add_run()
    br1.text = "DATASPERE PRE-IMPORT VALIDATION: 100% READY TO IMPORT (9 ENTITIES GREEN)"
    br1.font.name = FONT_NAME
    br1.font.size = Pt(8.5)
    br1.font.bold = True
    br1.font.color.rgb = COLOR_WHITE

    img_proof1 = os.path.join(ARTIFACT_DIR, "screenshot_07_42s.png")
    if os.path.exists(img_proof1):
        slide.shapes.add_picture(img_proof1, Emu(741807), Emu(1120000), Emu(5150000), Emu(2350000))

    # Right Proof Screenshot: Datasphere Import Success Banner
    c_proof2 = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Emu(6191807), Emu(979225), Emu(5450000), Emu(2600000))
    c_proof2.fill.solid()
    c_proof2.fill.fore_color.rgb = COLOR_CARD_BG
    c_proof2.line.color.rgb = COLOR_BORDER_CYAN
    c_proof2.line.width = Pt(1)

    b_proof2 = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Emu(6191807), Emu(872123), Emu(5450000), Emu(200000))
    b_proof2.fill.solid()
    b_proof2.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
    b_proof2.line.fill.background()
    bp2 = b_proof2.text_frame.paragraphs[0]
    bp2.alignment = PP_ALIGN.CENTER
    br2 = bp2.add_run()
    br2.text = "DATASPERE IMPORT SUCCESS BANNER: ATOMIC DEPLOYMENT COMPLETED"
    br2.font.name = FONT_NAME
    br2.font.size = Pt(8.5)
    br2.font.bold = True
    br2.font.color.rgb = COLOR_WHITE

    img_proof2 = os.path.join(ARTIFACT_DIR, "screenshot_08_50s.png")
    if os.path.exists(img_proof2):
        slide.shapes.add_picture(img_proof2, Emu(6291807), Emu(1120000), Emu(5250000), Emu(2350000))

    # Bottom 4 ROI Pillar Cards
    roi_card_width = Emu(2600000)
    roi_card_height = Emu(2400000)
    roi_lefts = [Emu(641807), Emu(3441807), Emu(6241807), Emu(9041807)]

    roi_pillars = [
        ("95% TIME SAVINGS", "MIGRATION VELOCITY", [
            "Manual migration of 1 complex view takes 3-5 days of developer effort.",
            "HanaMorph generates complete multi-tier CSN packages in under 5 minutes.",
            "Accelerates enterprise modernization programs by 10x-15x."
        ]),
        ("100% ZERO ERRORS", "DEPLOYMENT PASS RATE", [
            "Automated join key source resolution eliminates PARTNER_NULL missing object errors.",
            "Calculated attributes compiled into intermediate views prevent missing field failures.",
            "Pre-validated deployment sequence ensures zero-friction Datasphere imports."
        ]),
        ("1:1 GOVERNANCE", "AUDITABLE ARCHITECTURE", [
            "Preserves complete intermediate transformation nodes (Join_1, Join_2, Proj_1).",
            "Eliminates opaque monolithic CTEs, allowing node-by-node data inspection.",
            "Full compliance with enterprise audit and data lineage governance standards."
        ]),
        ("CLEAN CORE", "SAP BTP COMPLIANCE", [
            "Side-by-side microservices architecture running natively on SAP BTP Cloud Foundry.",
            "Zero modifications required in SAP S/4HANA or SAP ECC source systems.",
            "Direct integration via native SAP Datasphere CSN 2.0 and Schema Import Services."
        ])
    ]

    for idx, (title, subtitle, bullets) in enumerate(roi_pillars):
        r_left = roi_lefts[idx]

        card = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, r_left, Emu(3750000), roi_card_width, roi_card_height)
        card.fill.solid()
        card.fill.fore_color.rgb = COLOR_PRIMARY_NAVY
        card.line.fill.background()

        ctf = card.text_frame
        ctf.word_wrap = True
        ctf.margin_left = Emu(80000)
        ctf.margin_right = Emu(80000)
        ctf.margin_top = Emu(80000)
        ctf.margin_bottom = Emu(80000)

        p0 = ctf.paragraphs[0]
        p0.alignment = PP_ALIGN.CENTER
        r0 = p0.add_run()
        r0.text = title
        r0.font.name = FONT_NAME
        r0.font.size = Pt(11.5)
        r0.font.bold = True
        r0.font.color.rgb = COLOR_WHITE

        p1 = ctf.add_paragraph()
        p1.alignment = PP_ALIGN.CENTER
        r1 = p1.add_run()
        r1.text = subtitle
        r1.font.name = FONT_NAME
        r1.font.size = Pt(8)
        r1.font.bold = True
        r1.font.color.rgb = COLOR_BORDER_CYAN

        for b_text in bullets:
            p = ctf.add_paragraph()
            r = p.add_run()
            r.text = f"\u2022 {b_text}"
            r.font.name = FONT_NAME
            r.font.size = Pt(6.8)
            r.font.color.rgb = COLOR_WHITE

    add_footer(slide)

def generate_decks():
    # 1. Standalone Dedicated HanaMorph Presentation (5 Slides)
    prs = Presentation()
    prs.slide_width = 12192000
    prs.slide_height = 6858000
    blank_layout = prs.slide_layouts[6]

    print("Generating Slide 1: Flagship Executive Showcase (Event 3 master layout)...")
    s1 = prs.slides.add_slide(blank_layout)
    create_slide_1_showcase(s1)

    print("Generating Slide 2: 1:1 Visual Lineage Parity Deep Dive...")
    s2 = prs.slides.add_slide(blank_layout)
    create_slide_2_lineage_parity(s2)

    print("Generating Slide 3: Autonomous Multi-Tier DAG Engine & CSN Architecture...")
    s3 = prs.slides.add_slide(blank_layout)
    create_slide_3_autonomous_engine(s3)

    print("Generating Slide 4: Enterprise Modeling Rationalization & Deduplication...")
    s4 = prs.slides.add_slide(blank_layout)
    create_slide_4_rationalization_layer(s4)

    print("Generating Slide 5: Production Verification & ROI Summary...")
    s5 = prs.slides.add_slide(blank_layout)
    create_slide_5_roi_validation(s5)

    # Save to Downloads and exports
    dl_path = r"C:\Users\Varad\Downloads\HanaMorph_Executive_Presentation.pptx"
    exp_path = r"C:\Users\Varad\Documents\GitHub\HANAMORPH\exports\HanaMorph_Executive_Presentation.pptx"
    prs.save(dl_path)
    prs.save(exp_path)
    print(f"Saved dedicated presentation to:\n  - {dl_path}\n  - {exp_path}")

    # 2. Integrated Event 3 Presentation (Appends Slide 5 into existing Event 3 (4).pptx)
    src_event_path = r"C:\Users\Varad\Downloads\Event 3 (4).pptx"
    if os.path.exists(src_event_path):
        prs_event = Presentation(src_event_path)
        event_layout = prs_event.slide_layouts[6] if len(prs_event.slide_layouts) > 6 else prs_event.slide_layouts[-1]
        s_new = prs_event.slides.add_slide(event_layout)
        create_slide_1_showcase(s_new)
        
        dl_event_path = r"C:\Users\Varad\Downloads\Event 3 (HanaMorph).pptx"
        exp_event_path = r"C:\Users\Varad\Documents\GitHub\HANAMORPH\exports\Event 3 (HanaMorph).pptx"
        prs_event.save(dl_event_path)
        prs_event.save(exp_event_path)
        print(f"Saved integrated Event 3 presentation to:\n  - {dl_event_path}\n  - {exp_event_path}")

if __name__ == "__main__":
    generate_decks()
