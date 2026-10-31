-- ==========================================================
-- Tier 1: Join_1 -> CV_BANK_JOIN_1_V
-- Target: Join_1 Intermediate View
-- Inputs: BNKA, FCLM_BAM_BNKA_BP
-- ==========================================================
SELECT
    A."MANDT" AS "MANDT",
    A."BANKS" AS "BANKS",
    A."BANKL" AS "BANKL",
    A."BANKA" AS "BANKA",
    A."PROVZ" AS "PROVZ",
    A."ORT01" AS "ORT01",
    A."BGRUP" AS "BGRUP",
    B."VALID_FROM" AS "VALID_FROM",
    B."PARTNER" AS "PARTNER"
FROM "BNKA" AS A
LEFT OUTER JOIN "FCLM_BAM_BNKA_BP" AS B
  ON A."MANDT" = B."MANDT" AND A."BANKS" = B."BANKS" AND A."BANKL" = B."BANKL"

-- ==========================================================
-- Tier 2: Join_2 -> CV_BANK_JOIN_2_V
-- Target: Join_2 Intermediate View
-- Inputs: CV_BANK_JOIN_1_V, BP1010
-- ==========================================================
SELECT
    A."MANDT" AS "MANDT",
    A."BANKS" AS "BANKS",
    A."BANKL" AS "BANKL",
    A."BANKA" AS "BANKA",
    A."PROVZ" AS "PROVZ",
    A."ORT01" AS "ORT01",
    A."BGRUP" AS "BGRUP",
    A."VALID_FROM" AS "VALID_FROM_NULL",
    A."PARTNER" AS "PARTNER_NULL",
    B."RATING" AS "RATING_NULL",
    COALESCE(B."RATING", '') AS "RATING",
    COALESCE(A."VALID_FROM", '') AS "VALID_FROM",
    COALESCE(A."PARTNER", '') AS "PARTNER"
FROM "CV_BANK_JOIN_1_V" AS A
LEFT OUTER JOIN "BP1010" AS B
  ON A."MANDT" = B."MANDT" AND A."PARTNER" = B."PARTNR"

-- ==========================================================
-- Tier 3: Projection_1 -> CV_BANK_PROJECTION_1_V
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
-- Tier 4: Union_1 -> CV_BANK_V
-- Target: CV_BANK Fact View
-- Inputs: CV_BANK_JOIN_2_V, CV_BANK_PROJECTION_1_V
-- ==========================================================
SELECT
    "MANDT",
    "BANKS",
    "BANKL",
    "BANKA",
    "PROVZ",
    "ORT01",
    "BGRUP",
    "RATING",
    "VALID_FROM",
    "PARTNER",
    1 AS "RECORD_COUNT"
FROM "CV_BANK_JOIN_2_V"

UNION ALL

SELECT
    "MANDT",
    "NotAssignedPlaceholder" AS "BANKS",
    "NotAssignedPlaceholder1" AS "BANKL",
    "NAME" AS "BANKA",
    "NotAssignedPlaceholder2" AS "PROVZ",
    "NotAssignedPlaceholder3" AS "ORT01",
    "NotAssignedPlaceholder4" AS "BGRUP",
    "NotAssignedPlaceholder5" AS "RATING",
    "NotAssignedPlaceholder6" AS "VALID_FROM",
    "NotAssignedPlaceholder7" AS "PARTNER",
    1 AS "RECORD_COUNT"
FROM "CV_BANK_PROJECTION_1_V"

