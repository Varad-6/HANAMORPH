# HanaMorph: CDS & Calculation View to SAP Datasphere Migration Tool

HanaMorph is an enterprise-grade migration engine and SAPUI5 cockpit designed to extract, transform, and deploy SAP S/4HANA CDS Views and HANA Calculation Views into **SAP Datasphere** Fact Views, Analytic Models, and native Replication Flows.

---

## 🏛️ System Architecture

```
SAP S/4HANA DB (System HDD)
    │  [Live SQL Extraction via @sap/hana-client]
    ▼
HanaMorph Core Engine (CAP Node.js v9)
    ├── 1. Live Type-Ahead Search Engine (Query across 120,000+ views in <30ms)
    ├── 2. ABAP CDS & Calculation View Parser (AST, Null-safe SQL, Key/Measure Inference)
    ├── 3. CSN Generator (Native Fact Views & Analytical Business Layer)
    └── 4. Datasphere CLI Orchestrator (@sap/datasphere-cli & OAuth Bearer Auth)
    │
    ▼
SAP Datasphere (Tenant: ais-bdc-dsp-tdd.eu10.hcs.cloud.sap / Space: AIS_HARMONIZATION_)
    ├── Space Local Tables (Base Physical Ingestion Target)
    ├── Replication Flows (Automated Initial & Delta CDC Data Ingestion)
    ├── Data Builder Fact Views (Pure SELECT Canvas Views)
    └── Business Builder Analytic Models (Reporting Cubes & Multi-Dimensional Models)
```

---

## 🚀 Key Functional Studios

The HanaMorph cockpit is structured into **4 dedicated studios** to keep workflows clean, decoupled, and fast:

### 1. 📘 CDS View Migration Studio
- **Live Discovery:** Search across all SAP modules (MM, SD, FI, CO, PP, Custom `Z*`/`Y*`) with instant debounced type-ahead.
- **5-Step Guided Wizard:**
  1. *Select CDS View:* Live table filtering with instant selection.
  2. *Artifacts (Dynamic Inspection):* Dynamically detects whether a view has joins/associations. Single-source views show only physical `TABLE` and `SQL` definitions; multi-source views enable `GRAPHICAL` join diagrams. Zero mock or fake artifacts.
  3. *Columns:* Rename fields, configure business labels, toggle key/measure semantics.
  4. *Object Naming:* Customize technical & business names for Fact Views and Analytic Models with verified `fromTableName` references.
  5. *Code & Downloads:* Download self-contained CSN JSON (zero missing object errors), standalone `#CUBE` fact entity, or pure SQL canvas query.

### 2. 📊 Calculation View Studio
- Dedicated live pipeline to discover and extract real HANA calculation views directly from `_SYS_REPO.ACTIVE_OBJECT` (150+ real enterprise calculation views in `HDD`).
- Parses calculation scenarios (`join`, `projection`, `aggregation`, `union` nodes) and maps measure aggregations (`#SUM`) to SAP Datasphere analytical models.

### 3. 📦 Bulk Multi-View Migration Studio ("Shopping Cart" Pattern)
- Search, tick checkboxes across different searches, and accumulate views into a **Review Cart**.
- Re-verify views before extraction to prevent storage bloat.
- Eliminates duplicate source tables across views and builds an optimized Star Schema Data Mart.

### 4. 🔄 Dedicated Replication Flow Studio
- Decoupled from view modeling: specifically designed for data engineers setting up ingestion.
- Configures and deploys native SAP Datasphere **Replication Flows** via `@sap/datasphere-cli`:
  - **Master Data:** `InitialOnly` snapshot mode.
  - **Transactional Data:** `InitialAndDelta` mode with Change Data Capture (CDC).

---


---

## 📦 SAP Datasphere CSN Import Specifications

When importing CSN JSON artifacts into **SAP Datasphere Data Builder** via `Import Objects from CSN/JSON File`, Datasphere performs deep dependency resolution across all referenced sources and columns (`query.SELECT.from.ref` and column projections).

HanaMorph delivers **100% self-contained CSN packages** to eliminate missing dependency errors:

| Export Artifact | Format | SAP Datasphere Target | Dependency Handling |
| :--- | :--- | :--- | :--- |
| **Complete CSN Package** | `*_complete_package.csn.json` | Data Builder / Business Builder | Bundles Base Ingestion Table + Analytical Fact View + Analytic Model in a single file. |
| **Self-Contained Fact View** | `*_view.csn.json` | Data Builder -> Import CSN | Bundles the View definition and its underlying Base Ingestion Table definition. Guaranteed zero missing object errors (`#field` references satisfied). |
| **Standalone Fact Entity** | `*_standalone_fact.csn.json` | Data Builder -> Import CSN | Defines a single independent `#CUBE` entity with no `query` block. Imports as a direct Local Table / Analytical Dataset with **zero external dependencies**. |
| **Base Ingestion Table** | `*_table.csn.json` | Data Builder -> Local Tables | Pure physical table definition designed to serve as the ingestion target for Replication Flows. |
| **Analytic Model CSN** | `*_am.csn.json` | Business Builder -> Import CSN | Reporting model with dimension attributes, measures, and default aggregation rules (`#SUM`). |
| **Pure SELECT Query** | `*_view.sql` | Data Builder -> New SQL View | Canvas-ready SQL SELECT statement with `COALESCE` null-safe measure handling (no `CREATE VIEW` wrapper). |

## ⚙️ Configuration & Live S/4HANA Connectivity

Connection parameters are maintained in `config.json` or BTP User-Provided Services:

```json
{
  "USE_MOCK": false,
  "hana": {
    "host": "192.168.1.55",
    "port": 31015,
    "user": "DINESH_S",
    "password": "<PASSWORD>",
    "schema": "SAPHANADB",
    "encrypt": false,
    "sslValidateCertificate": false
  },
  "datasphere": {
    "host": "https://ais-bdc-dsp-tdd.eu10.hcs.cloud.sap",
    "tokenUrl": "https://ais-bdc-dsp-tdd.authentication.eu10.hana.ondemand.com/oauth/token",
    "defaultSpace": "AIS_HARMONIZATION_",
    "clientId": "<CLIENT_ID>",
    "clientSecret": "<CLIENT_SECRET>"
  }
}
```

---

## 🛠️ Local Development & Testing

```bash
# Install dependencies
npm install

# Run CAP backend and UI5 frontend with auto-reload
cds watch
```

Open your browser at `http://localhost:4004` to access the HanaMorph Cockpit.

---

## ☁️ Cloud Foundry Deployment (When Ready)

```bash
# 1. Login to SAP BTP Cloud Foundry
cf login -a https://api.cf.eu30.hana.ondemand.com -u <USER> --origin sap.ids

# 2. Build the Multi-Target Application archive
mbt build -t gen --mtar hanamorph.mtar

# 3. Deploy to your space
cf deploy gen/hanamorph.mtar
```
