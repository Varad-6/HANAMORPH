-- ==========================================================
-- Dimension View: CV_CUSTOMER_DIM_V (@Analytics.dataCategory: #DIMENSION)
-- Source Base Table: CV_CUSTOMER_TBL
-- ==========================================================
CREATE VIEW "CV_CUSTOMER_DIM_V" AS
SELECT
    "MANDT",
    "CUSTOMER",
    "NAME",
    "TEXT_SH",
    "TEXT_MD",
    "TEXT_LG"
FROM "CV_CUSTOMER_TBL";

-- ==========================================================
-- Central Fact View: CV_MSTRPROJECTCOST_FACT_V (@Analytics.dataCategory: #CUBE)
-- Source Base Table: CV_MSTRPROJECTCOST_TBL
-- Associated Dimensions: CV_CUSTOMER_DIM_V
-- ==========================================================
CREATE VIEW "CV_MSTRPROJECTCOST_FACT_V" AS
SELECT
    "MANDT",
    "PROJECT_ID",
    "CUSTOMER",
    "COMPANY_CODE",
    COALESCE("PLAN_COST", 0) AS "PLAN_COST",
    COALESCE("ACTUAL_COST", 0) AS "ACTUAL_COST",
    "CURRENCY"
FROM "CV_MSTRPROJECTCOST_TBL";
