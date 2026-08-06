# Owner Reconciliation Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database design, staging structures, approval ledgers, and audit tables dedicated to the **Owner Reconciliation process** triggered during Daily MGT report uploads.

---

## 1. Process & Classification Lifecycle

When a Daily MGT report is uploaded, the parser extracts all unique Owner records (represented by name, code, contact, and geographic data) present in the spreadsheet before transactional rows are officially committed to the operational database. 

The system compares these extracted rows against the master `owners` table and classifies each row into one of five states:

1. **Existing:** The extracted Owner matches an active database record perfectly in both identifier codes and descriptive details. No action is required.
2. **New:** The extracted Owner Code does not exist anywhere in the master database. This represents a brand-new partner registering a terminal.
3. **Updated:** The Owner Code exists, but one or more descriptive attributes (e.g., telephone number, spelling of name, Ward, or District) differ from the database records.
4. **Duplicate:** Multiple lines within the same uploaded report declare conflicting attributes for the same Owner Code.
5. **Unknown:** The transactional records have blank, corrupt, or missing owner identification fields entirely, or they are associated with unmatched Wakala IDs.

---

## 2. Entity Relationship Diagram (ERD) - Reconciliation Segment

The diagram below outlines how staging data links to upload reports, master owners, and the administrative decision tables:

```
    +--------------------------------------+
    |          UPLOADED_REPORTS            |
    |--------------------------------------|
    | PK  upload_id (UUID)                 |
    +--------------------------------------+
                       |
                       | 1
                       |
                       | N
                       v
    +--------------------------------------+
    |         OWNER_RECONCILIATIONS        |
    |--------------------------------------|
    | PK  reconciliation_id (UUID)         |
    | FK  upload_id (UUID)                 |
    | FK  matched_owner_id (UUID, NULL)    |
    |     parsed_owner_code (VARCHAR)      |
    |     parsed_owner_name (VARCHAR)      |
    |     parsed_phone (VARCHAR)           |
    |     parsed_email (VARCHAR)           |
    |     parsed_business_name (VARCHAR)   |
    |     parsed_region (VARCHAR)          |
    |     parsed_district (VARCHAR)        |
    |     parsed_ward (VARCHAR)            |
    |     classification (VARCHAR)         |
    |     resolution_status (VARCHAR)      |
    +--------------------------------------+
                       |
                       | 1
                       |
                       | 0..1
                       v
    +--------------------------------------+
    |        RECONCILIATION_DECISIONS      |
    |--------------------------------------|
    | PK  decision_id (BIGINT)             |
    | FK  reconciliation_id (UUID)         |
    |     decision_type (VARCHAR)          |
    |     decided_by (VARCHAR)             |
    |     decided_at (TIMESTAMPTZ)         |
    |     rejection_reason (TEXT, NULL)    |
    |     original_snapshot (JSONB, NULL)  |
    |     applied_snapshot (JSONB, NULL)   |
    +--------------------------------------+
```

---

## 3. Detailed Table Specifications

### 3.1 `owner_reconciliations` (The Staging Table)
Acts as an intermediate landing container where extracted Owner fields are scored and categorized for Admin evaluation.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `reconciliation_id`| `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Immutable primary token of the reconciliation row. |
| `upload_id` | `UUID` | `FOREIGN KEY` references `uploaded_reports(upload_id)` ON DELETE CASCADE | No | None | Link to the specific file upload instance that contained the row. |
| `matched_owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE SET NULL | Yes | `NULL` | Pointer to target record in the database if classification is `Updated` or `Existing`. |
| `parsed_owner_code`| `VARCHAR(50)` | None | No | None | Code extracted from file (e.g. `OWN-TZ-0012`). |
| `parsed_owner_name`| `VARCHAR(255)`| None | No | None | Legal name extracted from file. |
| `parsed_phone` | `VARCHAR(50)` | None | Yes | `NULL` | Phone number extracted from file. |
| `parsed_email` | `VARCHAR(255)`| None | Yes | `NULL` | Email extracted from file. |
| `parsed_business_name`| `VARCHAR(255)`| None | Yes | `NULL` | Business name extracted from file. |
| `parsed_region` | `VARCHAR(100)`| None | Yes | `NULL` | Administrative Region extracted from file. |
| `parsed_district` | `VARCHAR(100)`| None | Yes | `NULL` | Administrative District extracted from file. |
| `parsed_ward` | `VARCHAR(100)`| None | Yes | `NULL` | Local Ward extracted from file. |
| `classification` | `VARCHAR(50)` | `CHECK (classification IN ('Existing', 'New', 'Updated', 'Duplicate', 'Unknown'))` | No | None | Algorithmic matching classification category. |
| `resolution_status`| `VARCHAR(50)` | `CHECK (resolution_status IN ('Pending', 'Approved', 'Rejected', 'Auto-Skipped'))` | No | `'Pending'` | Current status of the administrative approval pipeline. |

#### Constraints & Business Rules
1. **Dynamic Cascade:** If an upload record is fully removed before finalized ingestion (e.g. upload canceled), associated reconciliation staging rows are cleared using `ON DELETE CASCADE`.
2. **Data Consistency:** Match-referencing is checked. If classification is `'Updated'`, `matched_owner_id` must NOT be null.

#### Recommended Indexes
* `idx_recon_upload_id` on `upload_id` (Speeds up listing deltas for the active import workflow UI).
* `idx_recon_classification` on `classification` (Enables filtering by specific change types).

---

### 3.2 `reconciliation_decisions` (History & Audit Ledger)
Stores the definitive history of Admin approvals, rejections, original data rollback backups, and actual database mutation payloads.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `decision_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Auto-incrementing unique decision log key. |
| `reconciliation_id`| `UUID` | `FOREIGN KEY` references `owner_reconciliations(reconciliation_id)` ON DELETE RESTRICT | No | None | Maps to the target staging record. Enforces restrict to prevent audit deletions. |
| `decision_type` | `VARCHAR(50)` | `CHECK (decision_type IN ('Approved', 'Rejected'))` | No | None | Records whether the change was committed or discarded. |
| `decided_by` | `VARCHAR(255)`| None | No | None | Email or Username of the Admin who authorized the decision. |
| `decided_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Date and exact time when the decision was executed. |
| `rejection_reason` | `TEXT` | None | Yes | `NULL` | Custom explanation if the change was discarded or flagged as incorrect. |
| `original_snapshot`| `JSONB` | None | Yes | `NULL` | Snapshot of the old `owners` record before modification (for `Updated` types). |
| `applied_snapshot` | `JSONB` | None | Yes | `NULL` | The exact JSON representation of values written to the `owners` table. |

#### Database Integrity & Rollback Design
1. **The JSONB Snapshot Pattern:** Storing snapshots using PostgreSQL `JSONB` guarantees that even if columns are added or modified in the `owners` table in future system versions, the exact historical state at the time of reconciliation remains completely searchable, immutable, and readable.
2. **Audit Permanence:** Enforces `ON DELETE RESTRICT` on `reconciliation_id`. Even if staging rows are cleared in bulk later, decision entries of actual approvals and rejections must remain completely intact.

#### Recommended Indexes
* `idx_recon_decisions_recon_id` on `reconciliation_id` (For rapid audit queries).
* `idx_recon_decisions_type` on `decision_type` (To distinguish historical rejections from approvals).

---

## 4. Normalization Validation (3NF)

* **Atomic Values:** All attributes in `owner_reconciliations` represent single scalar elements (strings, UUIDs, datetimes).
* **Dependency Analysis:** Non-key columns depend strictly and entirely on the primary keys. `reconciliation_decisions` avoids denormalizing parent fields of `owner_reconciliations` by instead referencing the single foreign key `reconciliation_id`.
* **Transitive Dependency Elimination:** Any historical state snapshots are stored in dynamic schemas (`JSONB` objects) rather than creating secondary structural columns, ensuring no intermediate functional chains violate 3NF.

---
**End of Owner Reconciliation Module Schema Specification**
