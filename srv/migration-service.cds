using { hanamorph as db } from '../db/schema';

service MigrationService {

    @readonly
    entity SourceCatalog as projection on db.SourceCatalog;

    @readonly
    entity ViewArtifacts as projection on db.ViewArtifacts;

    entity MigrationJobs as projection on db.MigrationJobs;

    @readonly
    entity JobLogs as projection on db.JobLogs;

    // Actions & Functions
    action importCatalog(
        sourceType : String // 'ALL' | 'CDS' | 'CALC_VIEW'
    ) returns array of SourceCatalog;

    function getArtifacts(
        viewName : String
    ) returns array of ViewArtifacts;

    action triggerMigration(
        sourceViewName : String,
        sourceViewType : db.ViewType,
        targetSpace    : String,
        targetViewName : String
    ) returns MigrationJobs;

    function exportCsn(
        jobId : UUID
    ) returns LargeString;
}
