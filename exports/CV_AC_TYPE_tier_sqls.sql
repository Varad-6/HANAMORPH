-- ==========================================================
-- Tier 1: Join_1 -> CV_AC_TYPE_JOIN_1_V
-- Target: Join_1 Intermediate View
-- Inputs: FCLM_BAM_AC_TYPE, FCLM_BAM_AC_TYPT
-- ==========================================================
SELECT
    A."MANDT" AS "MANDT",
    A."ACC_TYPE_ID" AS "ACC_TYPE_ID",
    A."ACC_TYPE_DIRE" AS "ACC_TYPE_DIRE",
    A."ACC_CURRENT" AS "ACC_CURRENT",
    B."LANGU" AS "LANGU",
    B."ACC_TYPE_DESC" AS "ACC_TYPE_DESC"
FROM "FCLM_BAM_AC_TYPE" AS A
LEFT OUTER JOIN "FCLM_BAM_AC_TYPT" AS B
  ON A."MANDT" = B."MANDT" AND A."ACC_TYPE_ID" = B."ACC_TYPE_ID"

-- ==========================================================
-- Tier 2: Projection_1 -> CV_AC_TYPE_PROJECTION_1_V
-- Target: Projection_1 Intermediate View
-- Inputs: CashLinefnt
-- ==========================================================
SELECT
    "MANDT",
    "NAME",
    "LANGU",
    "TEXT",
    "NotAssignedPlaceholder",
    "NotAssignedPlaceholder1",
    "NotAssignedPlaceholder2",
    "NotAssignedPlaceholder3",
    "NotAssignedPlaceholder4",
    "NotAssignedPlaceholder5",
    "NotAssignedPlaceholder6",
    "NotAssignedPlaceholder7",
    "NotAssignedPlaceholder8",
    "NotAssignedPlaceholder9",
    "NotAssignedPlaceholder10",
    "NotAssignedPlaceholder11",
    "NotAssignedPlaceholder12",
    "NotAssignedPlaceholder13",
    "NotAssignedPlaceholder14",
    "NotAssignedPlaceholder15"
FROM "CashLinefnt"

-- ==========================================================
-- Tier 3: Union_1 -> CV_AC_TYPE_V
-- Target: CV_AC_TYPE Fact View
-- Inputs: CV_AC_TYPE_JOIN_1_V, CV_AC_TYPE_PROJECTION_1_V
-- ==========================================================
SELECT
    "MANDT",
    "ACC_TYPE_ID",
    "ACC_TYPE_DIRE",
    "ACC_CURRENT",
    "LANGU",
    "ACC_TYPE_DESC",
    1 AS "RECORD_COUNT"
FROM "CV_AC_TYPE_JOIN_1_V"

UNION ALL

SELECT
    "MANDT",
    "NotAssignedPlaceholder" AS "ACC_TYPE_ID",
    "NotAssignedPlaceholder1" AS "ACC_TYPE_DIRE",
    "NotAssignedPlaceholder2" AS "ACC_CURRENT",
    "LANGU",
    "NAME" AS "ACC_TYPE_DESC",
    1 AS "RECORD_COUNT"
FROM "CV_AC_TYPE_PROJECTION_1_V"

