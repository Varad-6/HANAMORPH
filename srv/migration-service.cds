using { hanamorph as db } from '../db/schema';

service MigrationService {

    @readonly
    entity SourceCatalog as projection on db.SourceCatalog;

    @readonly
    entity ViewArtifacts as projection on db.ViewArtifacts;

    entity MigrationJobs as projection on db.MigrationJobs;

    @readonly
    entity JobLogs as projection on db.JobLogs;

    type SystemInfo {
        useMock              : Boolean;
        hanaConnected        : Boolean;
        mode                 : String;
        datasphereConnected  : Boolean;
    }

    type JobDetail : {
        ID             : UUID;
        sourceViewName : String;
        sourceViewType : db.ViewType;
        targetSpace    : String;
        targetViewName : String;
        status         : db.JobStatus;
        progress       : Integer;
        csnPayload     : LargeString;
        generatedSql   : LargeString;
        errorMessage   : LargeString;
        targetRowCount : Integer;
        logs           : array of {
            ID        : UUID;
            timestamp : Timestamp;
            level     : db.LogLevel;
            message   : LargeString;
        };
    }

    type ModularArtifactsResult : {
        tableJsonString                 : LargeString;
        viewJsonString                  : LargeString;
        analyticModelJsonString         : LargeString;
        packageJsonString               : LargeString;
        optimizedSql                    : LargeString;
        completeDdlSql                  : LargeString;
        replicationFlowMasterJsonString : LargeString;
        replicationFlowDeltaJsonString  : LargeString;
        replicationFlowCliCommand       : LargeString;
        tableName                       : String;
        viewName                        : String;
        amName                          : String;
    }

    type SourceOverlapSummary : {
        tableName         : String;
        referencedByViews : array of String;
        referenceCount    : Integer;
        suggestedLayer    : String;
        sharedColumns     : array of String;
    }

    type RationalizationReport : {
        totalViewsAnalyzed   : Integer;
        uniqueSourcesFound   : Integer;
        duplicateSourceCount : Integer;
        overlaps             : array of SourceOverlapSummary;
        recommendations      : array of String;
    }

    type BulkArtifactsResult : {
        masterCsnJsonString       : LargeString;
        aggregatedSql             : LargeString;
        replicationFlowJsonString : LargeString;
        replicationFlowCliCommand : LargeString;
        processedViewCount        : Integer;
        tableCount                : Integer;
        viewCount                 : Integer;
        views                     : array of {
            viewName   : String;
            viewType   : String;
            columns    : Integer;
        };
    }

    // Direct User Requested API Contract
    function listCDSViews() returns array of SourceCatalog;

    function listCalcViews() returns array of SourceCatalog;

    function getArtifacts(
        viewName : String
    ) returns array of ViewArtifacts;

    function getColumns(
        viewName : String
    ) returns array of {
        name         : String;
        dataType     : String;
        isKey        : Boolean;
        isMeasure    : Boolean;
        originalName : String;
    };

    action rationalizeSources(
        viewNames : array of String
    ) returns RationalizationReport;

    action generateBulkArtifacts(
        viewNames              : array of String,
        space                  : String,
        namingPattern          : String,
        deduplicationDecisions : LargeString
    ) returns BulkArtifactsResult;

    action generateModularArtifacts(
        viewName           : String,
        selectedColumns    : array of String,
        columnsJson        : LargeString,
        space              : String,
        fromTableName      : String,
        tableName          : String,
        tableBusinessName  : String,
        viewNameCustom     : String,
        viewBusinessName   : String,
        amName             : String,
        amBusinessName     : String
    ) returns ModularArtifactsResult;

    action startJob(
        viewName    : String,
        viewType    : db.ViewType,
        artifacts   : array of String,
        targetSpace : String
    ) returns MigrationJobs;

    function getJobStatus(
        jobId : UUID
    ) returns JobDetail;

    function getSystemInfo() returns SystemInfo;

    function exportCsn(
        jobId : UUID
    ) returns LargeString;
}
