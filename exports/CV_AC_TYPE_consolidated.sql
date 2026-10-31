SELECT
        "MANDT",
        "ACC_TYPE_ID",
        "ACC_TYPE_DIRE",
        "ACC_CURRENT",
        "LANGU",
        "ACC_TYPE_DESC",
        1 AS "RECORD_COUNT"
FROM (
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
) AS "Join_1"

UNION ALL

SELECT
        "MANDT",
        "NotAssignedPlaceholder" AS "ACC_TYPE_ID",
        "NotAssignedPlaceholder1" AS "ACC_TYPE_DIRE",
        "NotAssignedPlaceholder2" AS "ACC_CURRENT",
        "LANGU",
        "NAME" AS "ACC_TYPE_DESC",
        1 AS "RECORD_COUNT"
FROM "CashLinefnt" AS "Projection_1"