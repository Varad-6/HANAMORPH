namespace hanamorph;

using { cuid, managed } from '@sap/cds/common';

type ViewType : String enum {
    CDS;
    CALC_VIEW;
};

type JobStatus : String enum {
    PENDING;
    EXTRACTING;
    TRANSFORMING;
    DEPLOYING;
    LOADING;
    COMPLETED;
    FAILED;
};

type LogLevel : String enum {
    INFO;
    WARN;
    ERROR;
};

entity SourceCatalog {
    key name            : String(120);
    type                : ViewType;
    sqlViewName         : String(120);
    description         : String(255);
    packageOrSchema     : String(120);
    columnCount         : Integer default 0;
    hasAggregations     : Boolean default false;
    supportedStatus     : String(30) default 'SUPPORTED';
    unsupportedReasons  : LargeString;
}

entity ViewArtifacts {
    key id              : UUID;
    viewName            : String(120);
    artifactType        : String(50); // 'GRAPHICAL' | 'TABLE' | 'SQL'
    name                : String(120);
    columnCount         : Integer;
    details             : LargeString;
}

entity MigrationJobs : cuid, managed {
    sourceViewName      : String(120);
    sourceViewType      : ViewType;
    targetSpace         : String(60);
    targetViewName      : String(120);
    status              : JobStatus default 'PENDING';
    progress            : Integer default 0; // 0 - 100%
    csnPayload          : LargeString;
    generatedSql        : LargeString;
    errorMessage        : LargeString;
    sourceRowCount      : Integer;
    targetRowCount      : Integer;
    logs                : Composition of many JobLogs on logs.job = $self;
}

entity JobLogs : cuid {
    job                 : Association to MigrationJobs;
    timestamp           : Timestamp;
    level               : LogLevel;
    message             : LargeString;
}
