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

    // Direct User Requested API Contract
    function listCDSViews() returns array of SourceCatalog;

    function listCalcViews() returns array of SourceCatalog;

    function getArtifacts(
        viewName : String
    ) returns array of ViewArtifacts;

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
