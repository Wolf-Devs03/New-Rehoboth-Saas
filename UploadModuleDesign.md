# Upload Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database tables, relations, constraints, and indexes dedicated exclusively to the **Upload Module**, ensuring permanent, immutable archival of all ingested spreadsheets (Monthly KPI and Daily MGT reports).

---

## 1. Module Overview & Structural Rules

The **Upload Module** acts as the system's entry gateway and historical data archive. It processes and logs files containing monthly performance targets or daily transactional operations.

### 1.1 Integrity Constraints
* **Immutability (No Overwrites):** The system is strictly forbidden from overwriting, updating, or deleting existing upload records. Every file uploaded is permanently stored and cataloged with a unique, non-recyclable primary identifier.
* **Deduplication (Checksum Protection):** A cryptographic hash (SHA-256 Checksum) is calculated for each file during ingestion. The database enforces global uniqueness on this checksum to prevent the same physical file from being uploaded multiple times.
* **Granular Audit Logs:** System errors, row validation failures, and operational logs are stored in dedicated subordinate tables to prevent text-field truncation and maintain Third Normal Form (3NF) relational compliance.

---

## 2. Entity Relationship Diagram (ERD) - Upload Module Segment

```
    +--------------------------------------+
    |          UPLOADED_REPORTS            |
    |--------------------------------------|
    | PK  upload_id (UUID)                 |
    |     report_type (VARCHAR)            |
    |     original_filename (VARCHAR)      |
    |     storage_path (VARCHAR)           |
    |     upload_date (TIMESTAMPTZ)        |
    |     uploaded_by (VARCHAR)            |
    |     file_size (BIGINT)               |
    | UK  checksum (VARCHAR)               |
    |     import_status (VARCHAR)          |
    |     validation_status (VARCHAR)      |
    |     processing_time_ms (INTEGER)     |
    |     report_date (DATE, NULL)         |
    |     report_month (VARCHAR, NULL)     |
    +--------------------------------------+
            |                      |
            | 1                    | 1
            |                      |
            | N                    | N
            v                      v
    +-------------------+  +-------------------+
    |    IMPORT_LOGS    |  |   IMPORT_ERRORS   |
    |-------------------|  |-------------------|
    | PK  log_id (BIGINT)  |  | PK  error_id (BINT)|
    | FK  upload_id (UUID) |  | FK  upload_id (UUID)|
    |     message (TEXT)   |  |     row_num (INT)  |
    |     created_at (TSTZ)|  |     column_name(VC)|
    +-------------------+  |     error_desc(TEXT)|
                           |     created_at (TSTZ)|
                           +-------------------+
```

---

## 3. Detailed Table Specifications

### 3.1 `uploaded_reports` Table
Stores master information, location pointers, and core metadata for each ingested file.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `upload_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Internal unique immutable identifier. |
| `report_type` | `VARCHAR(50)` | `CHECK (report_type IN ('Monthly KPI', 'Daily MGT'))` | No | None | Controls ledger parsing logic. |
| `original_filename`| `VARCHAR(255)` | None | No | None | Name of the spreadsheet as uploaded by the user. |
| `storage_path` | `VARCHAR(512)` | `UNIQUE` | No | None | Absolute path to secure block/object storage (e.g., S3/GCS bucket). |
| `upload_date` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Date and exact time of ingestion. |
| `uploaded_by` | `VARCHAR(255)` | None | No | None | Username or email of the active Admin who initiated upload. |
| `file_size` | `BIGINT` | `CHECK (file_size > 0)` | No | None | Size of the file in bytes (supports files up to 50 MB limit). |
| `checksum` | `VARCHAR(64)` | `UNIQUE` | No | None | SHA-256 cryptographic file checksum for deduplication. |
| `import_status` | `VARCHAR(50)` | `CHECK (import_status IN ('Pending', 'Processing', 'Success', 'Failed'))` | No | `'Pending'` | Status of database row ingestion. |
| `validation_status`| `VARCHAR(50)` | `CHECK (validation_status IN ('Passed', 'Warnings', 'Failed'))` | No | `'Pending'` | Structural analysis results. |
| `processing_time_ms`| `INTEGER` | `CHECK (processing_time_ms >= 0)` | No | `0` | Execution time of parsing and import (in milliseconds). |
| `report_date` | `DATE` | None | Yes | `NULL` | Applicable only for "Daily MGT" reports. |
| `report_month` | `VARCHAR(7)` | `CHECK (report_month ~ '^[0-9]{4}-[0-9]{2}$')` | Yes | `NULL` | Applicable for "Monthly KPI" (Format: `YYYY-MM`). |

#### Constraints & Business Rules
1. **Permanent Archive Rule:** No `ON DELETE` cascading is allowed on this table. Delete and Update statements are restricted through database trigger constraints or user permissions.
2. **Double Ingestion Check:** The database level `UNIQUE` constraint on the `checksum` column ensures that identical files (by contents) are blocked from repeating metrics calculation.
3. **Period Constraints:** A trigger or database constraint validates that if `report_type` is `'Monthly KPI'`, the field `report_month` must be populated, and if the type is `'Daily MGT'`, `report_date` must be populated.

#### Recommended Indexes
* `idx_uploaded_reports_checksum` on `checksum` (Rapid check during file selection).
* `idx_uploaded_reports_type_date` on (`report_type`, `report_date`, `report_month`) (To filter upload lists in administrative archives).

---

### 3.2 `import_logs` Table
Maintains verbose, sequential trace messages generated by the parsing engine during import operations.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `log_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Serial index of the trace log. |
| `upload_id` | `UUID` | `FOREIGN KEY` references `uploaded_reports(upload_id)` ON DELETE RESTRICT | No | None | Parent upload target. |
| `message` | `TEXT` | None | No | None | Descriptive trace message (e.g. "Started header validation..."). |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when log line was compiled. |

#### Recommended Indexes
* `idx_import_logs_upload_id` on `upload_id` (Allows fast listing of processing history for a specific report in the UI).

---

### 3.3 `import_errors` Table
Isolates structured parsing, row-level schema, or business rule validation errors for analysis.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `error_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique serial error key. |
| `upload_id` | `UUID` | `FOREIGN KEY` references `uploaded_reports(upload_id)` ON DELETE RESTRICT | No | None | Parent upload target. |
| `row_number` | `INTEGER` | `CHECK (row_number >= 0)` | Yes | `NULL` | Raw spreadsheet line number where anomaly was found. |
| `column_name` | `VARCHAR(100)` | None | Yes | `NULL` | Name of field triggering error (e.g. `cash_in_volume`). |
| `error_description`| `TEXT` | None | No | None | Human-readable explanation of rejection cause. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when error was logged. |

#### Recommended Indexes
* `idx_import_errors_upload_id` on `upload_id` (Enables instant administrative review of validation failures).

---
**End of Upload Module Schema Specification**
