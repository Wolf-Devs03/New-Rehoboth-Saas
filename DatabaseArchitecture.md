# Database Architecture & Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document outlines the conceptual Entity Relationship Diagram (ERD), table structures, constraint definitions, normalization validation, and architectural best practices designed to implement the Tanzanian Wakala Management & KPI Performance System in **Third Normal Form (3NF)**.

---

## 1. Entity Relationship Diagram (ERD)

The conceptual relationship structure is mapped using a text-based Crow's Foot diagram representing logical constraints and cardinalities:

```
    +------------------+                    +------------------+
    |      USERS       | 1:0..1     1:1     |      OWNERS      |
    |------------------|------------------->|------------------|
    | PK  user_id      |                    | PK  owner_id     |
    |     email        |                    | FK  user_id      |
    +------------------+                    +------------------+
             |                                    |      |
             | 1:N                                | 1:N  | 1:N
             v                                    |      |
    +------------------+                          |      |
    |  NOTIFICATIONS   |                          |      |
    |------------------|                          |      |
    | PK  notification_|                          |      |
    | FK  user_id      |                          |      |
    +------------------+                          |      |
                                                  |      |
             +------------------------------------+      |
             |                                           |
             v 1:N                                       v 1:N
    +------------------+                    +------------------+
    |     WAKALAS      |                    | MONTHLY_TARGETS  |
    |------------------|                    |------------------|
    | PK  wakala_id    |                    | PK  target_id    |
    | FK  owner_id     |                    | FK  owner_id     |
    +------------------+                    +------------------+
             |                                           ^
             | 1:N                                       |
             v                                           |
    +------------------+                                 |
    |   DAILY_TRANS    |                                 |
    |------------------|                                 |
    | PK  transaction_id                                 |
    | FK  wakala_id    |                                 |
    | FK  upload_id    |                                 |
    | FK  owner_id     |---------------------------------+
    +------------------+ 1:N (Used to calculate goals)
             ^
             | 1:N
    +------------------+                    +------------------+
    |  UPLOAD_ARCHIVE  | 1:N                |   PERFORMANCE    |
    |------------------|------------------->|     SUMMARIES    |
    | PK  upload_id    |                    |------------------|
    +------------------+                    | PK  summary_id   |
             |                              | FK  owner_id     |
             | 1:N                          +------------------+
             v
    +------------------+
    | RECON_STAGING    |
    |------------------|
    | PK  stage_id     |
    | FK  upload_id    |
    | FK  mapped_owner_|
    +------------------+
             | 1:N
             | (Tracks operations)
             v
    +------------------+
    |    AUDIT_LOGS    |
    |------------------|
    | PK  log_id       |
    | FK  user_id      |
    +------------------+
```

---

## 2. Relationship Analysis & Cardinalities

### 2.1 User to Owner (1:0..1)
* **Description:** A security account (`USERS`) optionally links to a commercial operational identity (`OWNERS`).
* **Justification:** Admins (Master Agents) are users who do not have an Owner profile. On the other hand, every registered Wakala Owner logging into the system must link to a unique security user record to ensure data isolation.
* **Constraints:** Unique index on `owners.user_id` to enforce a 1:1 constraint for those users who have profiles.

### 2.2 Owner to Wakala (1:N)
* **Description:** An Owner manages multiple physical or SIM point-of-sale terminals (`WAKALAS`).
* **Justification:** An individual commercial partner (Wakala Owner) expands their footprint by operating multiple sub-agent kiosks in different physical wards or zones. Each kiosk maps strictly to one administrative owner.

### 2.3 Owner to Monthly KPI Target (1:N)
* **Description:** An Owner receives specific monthly performance goals (`MONTHLY_TARGETS`) over successive periods.
* **Justification:** Target metrics (volume targets in TZS, sub-agent thresholds) change monthly. The database stores these targets chronologically per Owner.

### 2.4 Wakala to Daily Transaction Record (1:N)
* **Description:** An active terminal station (`WAKALAS`) generates individual operational logs (`DAILY_TRANS`) on a day-by-day basis.
* **Justification:** Raw operational parameters (cash-in, cash-out, commissions) are logged at the terminal level for granular regional analytics.

### 2.5 File Upload Archive to Daily Transaction Record (1:N)
* **Description:** Every successfully parsed and verified Daily MGT spreadsheet (`UPLOAD_ARCHIVE`) is unpacked into many transactional rows (`DAILY_TRANS`).
* **Justification:** Critical for administrative rollbacks and tracing the file provenance of any given transaction line.

### 2.6 File Upload Archive to Owner Reconciliation Stage (1:N)
* **Description:** An uploaded sheet may trigger multiple delta rows (`RECON_STAGING`) requiring manual review or creation before final ingestion.
* **Justification:** Isolates discrepancies (e.g., misspelled owner names, newly added sub-agent IDs) to a staging container associated directly with that upload transaction.

### 2.7 Owner to Performance Summary (1:N)
* **Description:** An Owner maps to multiple month-by-month cached performance states (`PERFORMANCE_SUMMARIES`).
* **Justification:** This composite table caches aggregated records (MTD Volume, Wakala Active Rates) by calendar period to bypass expensive row-scanning on large transaction datasets.

### 2.8 User to Notifications & Audit Logs (1:N)
* **Description:** Users generate forensic events (`AUDIT_LOGS`) and receive administrative alerts (`NOTIFICATIONS`).
* **Justification:** Ensures strict compliance, traceability of operational updates (like overriding a transaction limit), and real-time delivery of system logs to the correct party.

---

## 3. Database Normalization (3NF) Validation

The proposed database architecture strictly complies with **Third Normal Form (3NF)**:

1. **First Normal Form (1NF):**
   * Every attribute contains only atomic values (e.g., telephone numbers, regions, and volumes are split into distinct columns instead of CSV arrays).
   * All tables have defined primary keys (`GENERATED ALWAYS AS IDENTITY` or native system string hashes).
2. **Second Normal Form (2NF):**
   * Meets 1NF.
   * All non-key attributes are fully functionally dependent on the entire primary key. In tables with surrogate auto-incrementing keys, this is trivially satisfied because the key is a single attribute.
3. **Third Normal Form (3NF):**
   * Meets 2NF.
   * There are **no transitive dependencies** (no non-key column depends on another non-key column through a transitive relationship).
   * *Example:* In `WAKALAS`, we do not store the Owner's phone number or region. Instead, we reference the `owner_id`, and look up those fields in the `OWNERS` table. Similarly, transaction lines (`DAILY_TRANS`) store only the `WakalaID` and raw volume; they reference the active owner relation rather than storing redundant owner contact info.

---

## 4. PostgreSQL Best Practices Applied

* **Identity Columns:** Using standard PostgreSQL `BIGINT GENERATED ALWAYS AS IDENTITY` rather than the legacy `SERIAL` keyword. This strictly complies with SQL standards and prevents sequence pollution.
* **Precision Decimals:** Financial values (TZS) are configured as `NUMERIC(15, 2)` instead of float or double precision to completely avoid IEEE-754 rounding inaccuracies in banking tallies.
* **Timestamps:** Standardized on `TIMESTAMPTZ` (timestamp with time zone) to prevent system timezone misalignment across different deployment server containers.
* **Case-Insensitive Constraints:** Email fields enforce uniqueness and are indexed with lower-case collations to prevent duplicate accounts based on character casing.
* **Explicit Foreign Key Indexes:** PostgreSQL does not automatically index foreign keys. Indexes are manually specified for all foreign key relations (`_id` columns) to maximize join query performance.

---

## 5. Detailed Table Designs

### 5.1 `users`
Represents system administrators and authenticated Wakala Owners.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `user_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Unique security token. |
| `email` | `VARCHAR(255)` | `UNIQUE` | No | None | Login username. |
| `password_hash` | `VARCHAR(255)` | None | No | None | Secure bcrypt password hash. |
| `role` | `VARCHAR(50)` | `CHECK (role IN ('Admin', 'Owner'))` | No | None | System permission level. |
| `is_active` | `BOOLEAN` | None | No | `TRUE` | Controls system access. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Account creation timestamp. |
| `last_login_at`| `TIMESTAMPTZ` | None | Yes | `NULL` | Authentication trace. |

* **Indexes:**
  * `idx_users_email_lower` on `LOWER(email)`

---

### 5.2 `owners`
Represents the commercial business partners.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `owner_id` | `VARCHAR(100)` | `PRIMARY KEY` | No | None | Master unique operational identifier. |
| `user_id` | `UUID` | `FOREIGN KEY` references `users(user_id)` | Yes | `NULL` | Links to login security account. |
| `owner_name` | `VARCHAR(255)` | None | No | None | Full legal name of business owner. |
| `phone_number` | `VARCHAR(50)` | None | No | None | Primary contact (Tanzanian format). |
| `region` | `VARCHAR(100)` | None | No | None | Base territory of operations. |
| `risk_level` | `VARCHAR(50)` | `CHECK (risk_level IN ('Low', 'Medium', 'High'))` | No | `'Low'` | Compliance category. |
| `date_joined` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Date of registration. |

* **Unique Constraints:**
  * `uq_owners_user_id` on `user_id` (enforces 1:1 security linkage)
* **Indexes:**
  * `idx_owners_user_id` on `user_id`
  * `idx_owners_region` on `region`

---

### 5.3 `wakalas`
Represents individual agent transaction SIM terminals.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `wakala_id` | `VARCHAR(100)` | `PRIMARY KEY` | No | None | Unique terminal code (e.g. `WK-9921`). |
| `owner_id` | `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | No | None | Owner responsible for terminal. |
| `station_name` | `VARCHAR(255)` | None | No | None | Geographic descriptor of terminal. |
| `is_active` | `BOOLEAN` | None | No | `TRUE` | Physical status of SIM station. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Audit registration timestamp. |

* **Indexes:**
  * `idx_wakalas_owner_id` on `owner_id`

---

### 5.4 `monthly_kpi_targets`
Holds target goal benchmarks set by administrative uploads once per month.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `target_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique goal identifier. |
| `owner_id` | `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | No | None | Target recipient. |
| `reporting_month`| `VARCHAR(7)` | `CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$')` | No | None | Calendar period target (e.g., `2026-07`). |
| `volume_target` | `NUMERIC(15, 2)`| `CHECK (volume_target >= 0)` | No | `0.00` | Target MTD transaction volume (TZS). |
| `active_stations`| `INTEGER` | `CHECK (active_stations >= 0)` | No | `0` | Min active sub-stations required. |
| `comm_yield` | `NUMERIC(15, 2)`| `CHECK (comm_yield >= 0)` | No | `0.00` | Monthly target earned commission. |
| `uploaded_by` | `UUID` | `FOREIGN KEY` references `users(user_id)` | No | None | Admin user responsible for setup. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Target log timestamp. |

* **Unique Constraints:**
  * `uq_monthly_period` on (`owner_id`, `reporting_month`) - ensures single monthly goal set per owner.
* **Indexes:**
  * `idx_monthly_targets_owner_id` on `owner_id`
  * `idx_monthly_targets_period` on `reporting_month`

---

### 5.5 `file_upload_archives`
Contains integrity data for all uploaded Excel and CSV files.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `upload_id` | `VARCHAR(100)` | `PRIMARY KEY` | No | None | System report code (e.g., `REP-9021`). |
| `file_name` | `VARCHAR(255)` | None | No | None | Original sheet file name. |
| `report_type` | `VARCHAR(100)` | `CHECK (report_type IN ('Monthly KPI', 'Daily MGT'))` | No | None | Controls ledger parsing format. |
| `file_size` | `BIGINT` | None | No | None | Total file bytes. |
| `file_hash` | `VARCHAR(64)` | `UNIQUE` | No | None | SHA-256 integrity digest. |
| `status` | `VARCHAR(50)` | `CHECK (status IN ('Pending', 'Importing', 'Success', 'Failed'))` | No | `'Pending'` | Current step in import. |
| `target_date` | `DATE` | None | No | None | Day/month represented by report. |
| `uploaded_by` | `VARCHAR(255)` | None | No | None | Audit name of uploading admin. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Time of upload. |

* **Indexes:**
  * `idx_upload_hash` on `file_hash`
  * `idx_upload_type` on `report_type`

---

### 5.6 `daily_transaction_records`
Stores transactional operation rows parsed from Daily MGT reports.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `record_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique ledger record. |
| `upload_id` | `VARCHAR(100)` | `FOREIGN KEY` references `file_upload_archives(upload_id)` ON DELETE CASCADE | No | None | Ingestion file source. |
| `wakala_id` | `VARCHAR(100)` | `FOREIGN KEY` references `wakalas(wakala_id)` | No | None | Point of sale station code. |
| `owner_id` | `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | No | None | Credited owner identity. |
| `reporting_date` | `DATE` | None | No | None | Actual transaction calendar day. |
| `cash_in` | `NUMERIC(15, 2)`| `CHECK (cash_in >= 0)` | No | `0.00` | Inward cash value (TZS). |
| `cash_out` | `NUMERIC(15, 2)`| `CHECK (cash_out >= 0)` | No | `0.00` | Outward cash value (TZS). |
| `commission` | `NUMERIC(15, 2)`| `CHECK (commission >= 0)` | No | `0.00` | Earned partner revenue (TZS). |
| `is_active` | `BOOLEAN` | None | No | `TRUE` | Terminal operational status indicator. |

* **Indexes:**
  * `idx_daily_trans_upload_id` on `upload_id`
  * `idx_daily_trans_wakala_id` on `wakala_id`
  * `idx_daily_trans_owner_id` on `owner_id`
  * `idx_daily_trans_date` on `reporting_date`

---

### 5.7 `owner_reconciliation_stages`
Administrative sandbox container for resolving unmapped owners/IDs during upload.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `stage_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique staging sequence block. |
| `upload_id` | `VARCHAR(100)` | `FOREIGN KEY` references `file_upload_archives(upload_id)` ON DELETE CASCADE | No | None | Parent ingestion session. |
| `parsed_wakala_id`| `VARCHAR(100)` | None | No | None | Raw terminal code parsed. |
| `parsed_owner_name`| `VARCHAR(255)`| None | No | None | Raw name string parsed. |
| `parsed_region` | `VARCHAR(100)` | None | Yes | `NULL` | Raw region found. |
| `delta_type` | `VARCHAR(50)` | `CHECK (delta_type IN ('New Owner', 'Name Change', 'Unknown ID'))` | No | None | Classification of delta anomaly. |
| `proposed_action`| `VARCHAR(50)` | `CHECK (proposed_action IN ('Create New', 'Map Existing', 'Ignore'))` | No | `'Create New'`| Resolution approach chosen. |
| `mapped_owner_id`| `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | Yes | `NULL` | Resolved owner target. |
| `is_approved` | `BOOLEAN` | None | No | `FALSE` | Approved validation flag. |

* **Indexes:**
  * `idx_recon_stage_upload` on `upload_id`
  * `idx_recon_stage_mapped` on `mapped_owner_id`

---

### 5.8 `performance_summaries`
MTD aggregate cache for instantaneous dashboard loads.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `summary_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Cache sequence. |
| `owner_id` | `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | Yes | `NULL` | Null represents aggregated master totals. |
| `reporting_month`| `VARCHAR(7)` | `CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$')` | No | None | Period of calculation (e.g. `2026-07`). |
| `mtd_volume` | `NUMERIC(15, 2)`| None | No | `0.00` | Month-to-date transaction sum (TZS). |
| `attainment_rate`| `NUMERIC(5, 2)` | None | No | `0.00` | Percentage against Monthly KPI. |
| `avg_active` | `NUMERIC(5, 2)` | None | No | `0.00` | Average sub-stations operating. |
| `accum_comm` | `NUMERIC(15, 2)`| None | No | `0.00` | Total monthly commissions. |
| `recalculated_at`| `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Cache fresh marker. |

* **Unique Constraints:**
  * `uq_perf_summary_period` on (`owner_id`, `reporting_month`)
* **Indexes:**
  * `idx_perf_summary_owner` on `owner_id`
  * `idx_perf_summary_month` on `reporting_month`

---

### 5.9 `notifications`
Direct operational bulletins and alerts.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `notification_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique alert sequence. |
| `recipient_user_id`| `UUID` | `FOREIGN KEY` references `users(user_id)` | No | None | Targeted recipient. |
| `alert_type` | `VARCHAR(100)` | `CHECK (alert_type IN ('Import Success', 'Warning', 'Target Alert'))` | No | None | Category of visual badge. |
| `title` | `VARCHAR(255)` | None | No | None | Short alert banner text. |
| `message` | `TEXT` | None | No | None | Complete contextual details. |
| `is_read` | `BOOLEAN` | None | No | `FALSE` | Visual dismiss flag. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Alert creation timestamp. |

* **Indexes:**
  * `idx_notifications_recipient` on `recipient_user_id`
  * `idx_notifications_unread` on `recipient_user_id` WHERE `is_read` = `FALSE`

---

### 5.10 `audit_logs`
Immutable forensic trace log.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `log_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Forensic log counter. |
| `user_id` | `UUID` | `FOREIGN KEY` references `users(user_id)` | No | None | Human actor performing task. |
| `action_taken` | `VARCHAR(255)` | None | No | None | System task performed (e.g. `Reconciliation Approved`). |
| `impacted_entity`| `VARCHAR(100)` | None | No | None | Database table name updated. |
| `meta_details` | `JSONB` | None | Yes | `NULL` | Parsed values (pre and post-state representation). |
| `ip_address` | `VARCHAR(45)` | None | No | `'127.0.0.1'` | Ingress client IP address. |
| `logged_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | System clock event mark. |

* **Indexes:**
  * `idx_audit_logs_user` on `user_id`
  * `idx_audit_logs_timestamp` on `logged_at`

---

## 6. Incremental Schema Evolution & New Requirements Support

This section documents the database schema modifications designed to support the system's new operational workflows, including dual-source file ingestion, pre-import Owner reconciliation, robust audit logging, and analytical KPI snapshots, while preserving all existing tables and relationships.

### 6.1 Dual Data Sources Integration Strategy
The application now separates data uploads into two distinct structures:
1. **Monthly KPI Report (Upload Once per Month):** Hydrates company-wide monthly goals and owner targets. It acts as the operational baseline reference. This is processed using the `monthly_kpi_targets` table.
2. **Daily MGT Report (Upload Every Day):** Stores fine-grained operational transactions at the SIM card/terminal level. This updates daily owner snapshots, running Month-to-Date (MTD) balances, and dashboards. This is processed into the `daily_transaction_records` table.

These two streams are managed via the `file_upload_archives` registry, using the `report_type` discriminator to determine the correct parsing engine and business validation constraints.

---

### 6.2 Owner Reconciliation Workflow
Before committing a Daily MGT report, the system extracts all unique Owner codes from the spreadsheet and compares them with the master `owners` table to identify registration deltas. This pre-import verification step prevents orphaned records and allows admins to resolve discrepancies.

To support this workflow without breaking the existing `owner_reconciliation_stages` (which operates at the individual sub-agent Wakala level), we introduce a dedicated, high-level **`owner_reconciliation_records`** table. This staging container stores the list of extracted owners, their auto-computed statuses, and the administrator's mapping resolutions.

#### Classification Categories:
* `Existing`: The Owner Code matches an existing database record, and name details are identical.
* `New`: The Owner Code is not in the database and represents a brand new partner.
* `Updated`: The Owner Code exists, but name or geographic attributes in the spreadsheet differ from the database (indicating a name change or transfer).
* `Duplicate`: The spreadsheet contains multiple conflicting rows representing the same Owner Code.
* `Unmatched`: The record contains critical errors (e.g., missing code or invalid format) that cannot be mapped automatically.

#### `owner_reconciliation_records` Table Specification

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `reco_record_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique reconciliation primary key. |
| `upload_id` | `VARCHAR(100)` | `FOREIGN KEY` references `file_upload_archives(upload_id)` ON DELETE CASCADE | No | None | Link to the pending file upload. |
| `parsed_owner_code`| `VARCHAR(100)` | None | No | None | Owner ID extracted from file. |
| `parsed_owner_name`| `VARCHAR(255)` | None | No | None | Owner Name extracted from file. |
| `parsed_phone` | `VARCHAR(50)` | None | Yes | `NULL` | Phone number extracted from file. |
| `classification` | `VARCHAR(50)` | `CHECK (classification IN ('Existing', 'New', 'Updated', 'Duplicate', 'Unmatched'))` | No | `'New'` | Automatic comparison status. |
| `detected_changes` | `JSONB` | None | Yes | `NULL` | Stores details of structural deltas (e.g., old vs. new name). |
| `resolution_action`| `VARCHAR(50)` | `CHECK (resolution_action IN ('Keep Existing', 'Create New', 'Update Details', 'Map Existing', 'Ignore'))` | No | `'Keep Existing'`| Action chosen by Admin. |
| `mapped_owner_id` | `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | Yes | `NULL` | Database ID of target resolved owner. |
| `is_reviewed` | `BOOLEAN` | None | No | `FALSE` | Review completion status. |
| `reviewed_by` | `UUID` | `FOREIGN KEY` references `users(user_id)` | Yes | `NULL` | Admin ID of the reviewer. |
| `reviewed_at` | `TIMESTAMPTZ` | None | Yes | `NULL` | Timestamp of review completion. |

* **Unique Constraints:**
  * `uq_owner_reco_file_code` on (`upload_id`, `parsed_owner_code`) - prevents double records for the same owner in a single upload.
* **Indexes:**
  * `idx_owner_reco_upload_id` on `upload_id`
  * `idx_owner_reco_mapped_id` on `mapped_owner_id`

---

### 6.3 Permanent Upload History Schema Extensions
To support permanent archival, tracking, and deep audibility of file uploads, we extend the existing `file_upload_archives` table by adding metadata columns.

#### Columns Added to `file_upload_archives`:
1. **`validation_status` (`VARCHAR(50)`):** Tracks file structure checks (`'Pending'`, `'Passed'`, `'Failed'`, `'Ignored'`).
2. **`file_location` (`VARCHAR(512)`):** Stores the secure file path or bucket URI where the raw spreadsheet is archived.
3. **`import_summary` (`JSONB`):** Caches a structured parsing summary, e.g., `{"total_rows_parsed": 1250, "new_owners_detected": 4, "wakalas_added": 12}`.
4. **`processing_time_ms` (`INTEGER`):** Captures server execution runtime in milliseconds to monitor performance.

---

### 6.4 Advanced Audit History Schema Extensions
We upgrade our auditing capability to record precise data modifications, tracking both old and new states explicitly as structured objects.

#### Columns Added to `audit_logs`:
1. **`old_value` (`JSONB`):** Stores the record's exact snapshot *before* the transaction was applied (null for creation events).
2. **`new_value` (`JSONB`):** Stores the record's exact snapshot *after* the transaction was applied (null for deletion events).

These columns enable the system to log crucial operations including:
* **`UPDATE_OWNER`:** Logged when an Owner's compliance, region, or profile is changed.
* **`IMPORT_REPORT`:** Logged when a Daily MGT or Monthly KPI spreadsheet is approved and imported into active ledgers.
* **`RECALCULATE_KPI`:** Logged when historical targets or calculations are updated.
* **`UPDATE_DASHBOARD`:** Logged when analytical summary snapshots are recompiled.

---

### 6.5 KPI Reporting Snapshots Schema Definitions
To meet sub-second dashboard rendering performance goals without running real-time aggregations over millions of raw transaction lines, the system stores pre-calculated analytical snapshots optimized for read operations.

#### 1. `daily_kpi_snapshots` (Company-wide Daily Snapshot)
Caches daily overall network KPI aggregates for system dashboards.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `snapshot_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique serial identifier. |
| `reporting_date` | `DATE` | `UNIQUE` | No | None | Operational day represented. |
| `total_volume` | `NUMERIC(15, 2)`| `CHECK (total_volume >= 0)` | No | `0.00` | Network cash-in + cash-out (TZS). |
| `total_transactions`| `INTEGER` | `CHECK (total_transactions >= 0)` | No | `0` | Total transactions logged across system. |
| `active_wakalas` | `INTEGER` | `CHECK (active_wakalas >= 0)` | No | `0` | Count of active terminals. |
| `product_sellers` | `INTEGER` | `CHECK (product_sellers >= 0)` | No | `0` | Count of agents selling auxiliary products. |
| `attainment_rate` | `NUMERIC(5, 2)` | None | No | `0.00` | Network average target achievement %. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Pre-aggregation timestamp. |

* **Indexes:**
  * `idx_daily_kpi_snap_date` on `reporting_date`

#### 2. `monthly_kpi_snapshots` (Company-wide Monthly Snapshot)
Provides high-speed history comparisons across operational months.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `snapshot_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique monthly identifier. |
| `reporting_month` | `VARCHAR(7)` | `UNIQUE` `CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$')` | No | None | Format: `YYYY-MM`. |
| `total_volume` | `NUMERIC(15, 2)`| `CHECK (total_volume >= 0)` | No | `0.00` | Monthly cumulative volume (TZS). |
| `total_transactions`| `INTEGER` | `CHECK (total_transactions >= 0)` | No | `0` | Monthly cumulative transaction count. |
| `avg_active_wakalas`| `NUMERIC(5, 2)` | None | No | `0.00` | Average daily active terminals count. |
| `product_sellers` | `INTEGER` | `CHECK (product_sellers >= 0)` | No | `0` | Unique product sellers during month. |
| `target_volume` | `NUMERIC(15, 2)`| `CHECK (target_volume >= 0)` | No | `0.00` | Overall company volume target (TZS). |
| `attainment_rate` | `NUMERIC(5, 2)` | None | No | `0.00` | Overall target attainment rate %. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Ingestion creation timestamp. |

#### 3. `owner_performance_snapshots` (Historical Owner Performance Snapshot)
Stores daily and monthly historical snapshots of each Owner, powering personal portals and admin listings.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `owner_snap_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique record identifier. |
| `owner_id` | `VARCHAR(100)` | `FOREIGN KEY` references `owners(owner_id)` | No | None | Target evaluated owner. |
| `reporting_period` | `VARCHAR(10)` | None | No | None | Period descriptor (e.g. `2026-07` or `2026-07-01`). |
| `period_type` | `VARCHAR(10)` | `CHECK (period_type IN ('Daily', 'Monthly'))` | No | None | Duration scope of snapshot. |
| `volume_target` | `NUMERIC(15, 2)`| `CHECK (volume_target >= 0)` | No | `0.00` | Target set for the month (TZS). |
| `volume_actual` | `NUMERIC(15, 2)`| `CHECK (volume_actual >= 0)` | No | `0.00` | Actual MTD volume achieved (TZS). |
| `attainment_rate` | `NUMERIC(5, 2)` | None | No | `0.00` | Current attainment percentage %. |
| `remaining_target` | `NUMERIC(15, 2)`| None | No | `0.00` | Value remaining to hit goal (TZS). |
| `projected_actual` | `NUMERIC(15, 2)`| None | No | `0.00` | Forecasted month-end volume (TZS). |
| `projected_attainment`| `NUMERIC(5, 2)` | None | No | `0.00` | Forecasted month-end attainment %. |
| `active_wakalas` | `INTEGER` | `CHECK (active_wakalas >= 0)` | No | `0` | Active terminals count. |
| `product_sellers` | `INTEGER` | `CHECK (product_sellers >= 0)` | No | `0` | Unique secondary product sellers count. |
| `performance_status`| `VARCHAR(50)` | `CHECK (performance_status IN ('Underperforming', 'On Track', 'Excellent', 'Critically Low'))` | No | `'On Track'` | Performance evaluation status. |
| `rank_position` | `INTEGER` | `CHECK (rank_position > 0)` | No | None | Ranking position on leaderboard. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Log compile timestamp. |

* **Unique Constraints:**
  * `uq_owner_snap_lookup` on (`owner_id`, `reporting_period`, `period_type`)
* **Indexes:**
  * `idx_owner_snap_lookup` on (`owner_id`, `reporting_period`, `period_type`)
  * `idx_owner_snap_rank` on (`reporting_period`, `period_type`, `rank_position`)

#### 4. `company_performance_snapshots` (Historical Company Performance Snapshot)
Stores daily and monthly overall network aggregates.

| Column | Data Type | Key / Constraint | Nullable | Default | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `company_snap_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique record key. |
| `reporting_period` | `VARCHAR(10)` | None | No | None | Period descriptor (e.g., `2026-07-01` or `2026-07`). |
| `period_type` | `VARCHAR(10)` | `CHECK (period_type IN ('Daily', 'Monthly'))` | No | None | Duration scope. |
| `volume_target` | `NUMERIC(15, 2)`| `CHECK (volume_target >= 0)` | No | `0.00` | Aggregate company target (TZS). |
| `volume_actual` | `NUMERIC(15, 2)`| `CHECK (volume_actual >= 0)` | No | `0.00` | Aggregate network actual volume (TZS). |
| `attainment_rate` | `NUMERIC(5, 2)` | None | No | `0.00` | Company attainment percentage %. |
| `remaining_target` | `NUMERIC(15, 2)`| None | No | `0.00` | Remainder to reach network target (TZS). |
| `projected_actual` | `NUMERIC(15, 2)`| None | No | `0.00` | Forecasted company month-end volume (TZS). |
| `projected_attainment`| `NUMERIC(5, 2)` | None | No | `0.00` | Forecasted company month-end attainment %. |
| `active_wakalas` | `INTEGER` | `CHECK (active_wakalas >= 0)` | No | `0` | Count of active terminals. |
| `product_sellers` | `INTEGER` | `CHECK (product_sellers >= 0)` | No | `0` | Active secondary product sellers. |
| `active_owners_count`| `INTEGER` | `CHECK (active_owners_count >= 0)` | No | `0` | Count of unique active Wakala owners. |
| `performance_status`| `VARCHAR(50)` | `CHECK (performance_status IN ('Underperforming', 'On Track', 'Excellent', 'Critically Low'))` | No | `'On Track'` | Overall network status. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Ingestion timestamp. |

* **Unique Constraints:**
  * `uq_company_snap_lookup` on (`reporting_period`, `period_type`)

---

### 6.6 Performance Aggregations Engine
To support automatic calculations of critical MTD run rates, forecasting, and rankings without breaking the existing `performance_summaries` table, we extend it with calculated metrics.

#### Columns Added to `performance_summaries`:
1. **`remaining_target` (`NUMERIC(15, 2)`):** Calculated difference: `volume_target - mtd_volume` (clamped to 0 minimum).
2. **`projected_achievement` (`NUMERIC(15, 2)`):** Projected run-rate: `(mtd_volume / elapsed_days_in_month) * total_days_in_month`.
3. **`projected_attainment_rate` (`NUMERIC(5, 2)`):** Projected attainment: `(projected_achievement / volume_target) * 100`.
4. **`performance_status` (`VARCHAR(50)`):** Classification score (`'Underperforming'`, `'On Track'`, `'Excellent'`, `'Critically Low'`).
5. **`rank_position` (`INTEGER`):** Leaderboard ranking assigned to the owner for that month.

These pre-calculated columns are updated atomically in a batch transaction whenever a new Daily MGT sheet is successfully imported.

---

## 7. Comprehensive Database Review (Gap Analysis)

An architectural comparison of the original system specifications against the new business requirements reveals several operational and performance gaps. Below is the structured analysis of required updates:

### 7.1 Missing Tables
1. **`owner_reconciliation_records`:** Necessary to store extracted owner codes, automated statuses, and administrative resolutions during pre-import validation.
2. **`daily_kpi_snapshots` & `monthly_kpi_snapshots`:** Necessary to cache network-wide aggregates and feed historical charts.
3. **`owner_performance_snapshots` & `company_performance_snapshots`:** Necessary to record immutable periodic states of owners and network metrics.

### 7.2 Missing Columns
1. **`file_upload_archives`:** Missing `validation_status`, `file_location`, `import_summary`, and `processing_time_ms` to support a permanent, comprehensive upload registry.
2. **`audit_logs`:** Missing `old_value` and `new_value` to support detailed delta tracking for data mutations.
3. **`performance_summaries`:** Missing `remaining_target`, `projected_achievement`, `projected_attainment_rate`, `performance_status`, and `rank_position` to support automatic performance calculations and leaderboard sorting.

### 7.3 Missing Indexes
1. **`idx_file_upload_archives_history`** on `file_upload_archives` (`status`, `target_date`) to load file history lists quickly.
2. **`idx_perf_summary_ranking`** on `performance_summaries` (`reporting_month`, `rank_position`) to optimize leaderboard queries.
3. **`idx_audit_logs_mutation`** on `audit_logs` (`impacted_entity`, `logged_at`) to audit single tables chronologically.

### 7.4 Missing Relationships
1. Staging table references from `owner_reconciliation_records` back to `file_upload_archives(upload_id)`, `owners(owner_id)`, and `users(user_id)`.
2. Snapshot references from `owner_performance_snapshots` back to `owners(owner_id)`.

### 7.5 Performance Improvements
* **Pre-Computed Cache Tables:** Introducing snapshots reduces high-frequency transaction parsing operations to simple index lookups.
* **Covering Indexes:** Implementing indexes with `INCLUDE` structures enables index-only scans, bypassing table space access during large leaderboard queries.

---

## 8. Schema Migration Plan & SQL DDL Script

This section details the migration steps to apply these structural updates to an existing production PostgreSQL instance without data loss, service degradation, or breaking existing constraints.

### 8.1 SQL Migration Script (Incremental DDL)

```sql
-- Tanzanian Wakala Management System - Database Evolution DDL
-- Target Platform: PostgreSQL v12+
-- Description: Non-destructive incremental schema updates

BEGIN;

-- ==========================================
-- 1. EXTEND EXISTING TABLES WITH COLUMNS
-- ==========================================

-- Extend file_upload_archives to support detailed historical status and locations
ALTER TABLE file_upload_archives 
  ADD COLUMN IF NOT EXISTS validation_status VARCHAR(50) DEFAULT 'Pending',
  ADD COLUMN IF NOT EXISTS file_location VARCHAR(512),
  ADD COLUMN IF NOT EXISTS import_summary JSONB,
  ADD COLUMN IF NOT EXISTS processing_time_ms INTEGER;

-- Extend audit_logs to support detailed before-and-after change tracking
ALTER TABLE audit_logs 
  ADD COLUMN IF NOT EXISTS old_value JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS new_value JSONB DEFAULT NULL;

-- Extend performance_summaries to cache pre-calculated engine metrics
ALTER TABLE performance_summaries
  ADD COLUMN IF NOT EXISTS remaining_target NUMERIC(15, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS projected_achievement NUMERIC(15, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS projected_attainment_rate NUMERIC(5, 2) DEFAULT 0.00,
  ADD COLUMN IF NOT EXISTS performance_status VARCHAR(50) DEFAULT 'On Track',
  ADD COLUMN IF NOT EXISTS rank_position INTEGER;

-- Add constraints on extended performance_summaries columns
ALTER TABLE performance_summaries 
  DROP CONSTRAINT IF EXISTS chk_perf_summary_status,
  ADD CONSTRAINT chk_perf_summary_status CHECK (performance_status IN ('Underperforming', 'On Track', 'Excellent', 'Critically Low')),
  DROP CONSTRAINT IF EXISTS chk_perf_summary_rank,
  ADD CONSTRAINT chk_perf_summary_rank CHECK (rank_position > 0);


-- ==========================================
-- 2. CREATE NEW VERIFICATION & CACHE TABLES
-- ==========================================

-- Create owner reconciliation staging table for pre-import auditing
CREATE TABLE IF NOT EXISTS owner_reconciliation_records (
  reco_record_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id VARCHAR(100) NOT NULL,
  parsed_owner_code VARCHAR(100) NOT NULL,
  parsed_owner_name VARCHAR(255) NOT NULL,
  parsed_phone VARCHAR(50),
  classification VARCHAR(50) NOT NULL DEFAULT 'New',
  detected_changes JSONB,
  resolution_action VARCHAR(50) NOT NULL DEFAULT 'Keep Existing',
  mapped_owner_id VARCHAR(100),
  is_reviewed BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  
  CONSTRAINT fk_owner_reco_upload FOREIGN KEY (upload_id) REFERENCES file_upload_archives(upload_id) ON DELETE CASCADE,
  CONSTRAINT fk_owner_reco_mapped FOREIGN KEY (mapped_owner_id) REFERENCES owners(owner_id) ON DELETE SET NULL,
  CONSTRAINT fk_owner_reco_user FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,
  CONSTRAINT chk_owner_reco_classification CHECK (classification IN ('Existing', 'New', 'Updated', 'Duplicate', 'Unmatched')),
  CONSTRAINT chk_owner_reco_action CHECK (resolution_action IN ('Keep Existing', 'Create New', 'Update Details', 'Map Existing', 'Ignore')),
  CONSTRAINT uq_owner_reco_file_code UNIQUE (upload_id, parsed_owner_code)
);

-- Create company-wide daily KPI snapshot table
CREATE TABLE IF NOT EXISTS daily_kpi_snapshots (
  snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_date DATE UNIQUE NOT NULL,
  total_volume NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  active_wakalas INTEGER NOT NULL DEFAULT 0,
  product_sellers INTEGER NOT NULL DEFAULT 0,
  attainment_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT chk_daily_snap_volume CHECK (total_volume >= 0),
  CONSTRAINT chk_daily_snap_trans CHECK (total_transactions >= 0),
  CONSTRAINT chk_daily_snap_wakalas CHECK (active_wakalas >= 0),
  CONSTRAINT chk_daily_snap_sellers CHECK (product_sellers >= 0)
);

-- Create company-wide monthly KPI snapshot table
CREATE TABLE IF NOT EXISTS monthly_kpi_snapshots (
  snapshot_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_month VARCHAR(7) UNIQUE NOT NULL,
  total_volume NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  total_transactions INTEGER NOT NULL DEFAULT 0,
  avg_active_wakalas NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  product_sellers INTEGER NOT NULL DEFAULT 0,
  target_volume NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  attainment_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT chk_monthly_snap_volume CHECK (total_volume >= 0),
  CONSTRAINT chk_monthly_snap_trans CHECK (total_transactions >= 0),
  CONSTRAINT chk_monthly_snap_sellers CHECK (product_sellers >= 0),
  CONSTRAINT chk_monthly_snap_target CHECK (target_volume >= 0),
  CONSTRAINT chk_monthly_snap_period CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$')
);

-- Create owner performance snapshots table
CREATE TABLE IF NOT EXISTS owner_performance_snapshots (
  owner_snap_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id VARCHAR(100) NOT NULL,
  reporting_period VARCHAR(10) NOT NULL,
  period_type VARCHAR(10) NOT NULL,
  volume_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  volume_actual NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  attainment_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  remaining_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  projected_actual NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  projected_attainment NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  active_wakalas INTEGER NOT NULL DEFAULT 0,
  product_sellers INTEGER NOT NULL DEFAULT 0,
  performance_status VARCHAR(50) NOT NULL DEFAULT 'On Track',
  rank_position INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_owner_snap_id FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE CASCADE,
  CONSTRAINT chk_owner_snap_period CHECK (period_type IN ('Daily', 'Monthly')),
  CONSTRAINT chk_owner_snap_target CHECK (volume_target >= 0),
  CONSTRAINT chk_owner_snap_actual CHECK (volume_actual >= 0),
  CONSTRAINT chk_owner_snap_wakalas CHECK (active_wakalas >= 0),
  CONSTRAINT chk_owner_snap_sellers CHECK (product_sellers >= 0),
  CONSTRAINT chk_owner_snap_rank CHECK (rank_position > 0),
  CONSTRAINT chk_owner_snap_status CHECK (performance_status IN ('Underperforming', 'On Track', 'Excellent', 'Critically Low')),
  CONSTRAINT uq_owner_snap_lookup UNIQUE (owner_id, reporting_period, period_type)
);

-- Create company-wide performance snapshots table
CREATE TABLE IF NOT EXISTS company_performance_snapshots (
  company_snap_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reporting_period VARCHAR(10) NOT NULL,
  period_type VARCHAR(10) NOT NULL,
  volume_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  volume_actual NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  attainment_rate NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  remaining_target NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  projected_actual NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  projected_attainment NUMERIC(5, 2) NOT NULL DEFAULT 0.00,
  active_wakalas INTEGER NOT NULL DEFAULT 0,
  product_sellers INTEGER NOT NULL DEFAULT 0,
  active_owners_count INTEGER NOT NULL DEFAULT 0,
  performance_status VARCHAR(50) NOT NULL DEFAULT 'On Track',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT chk_company_snap_period CHECK (period_type IN ('Daily', 'Monthly')),
  CONSTRAINT chk_company_snap_target CHECK (volume_target >= 0),
  CONSTRAINT chk_company_snap_actual CHECK (volume_actual >= 0),
  CONSTRAINT chk_company_snap_wakalas CHECK (active_wakalas >= 0),
  CONSTRAINT chk_company_snap_sellers CHECK (product_sellers >= 0),
  CONSTRAINT chk_company_snap_owners CHECK (active_owners_count >= 0),
  CONSTRAINT chk_company_snap_status CHECK (performance_status IN ('Underperforming', 'On Track', 'Excellent', 'Critically Low')),
  CONSTRAINT uq_company_snap_lookup UNIQUE (reporting_period, period_type)
);


-- ==========================================
-- 3. BUILD SUPPORTIVE INDEXES
-- ==========================================

-- Index for loading file list histories
CREATE INDEX IF NOT EXISTS idx_file_upload_history 
  ON file_upload_archives (status, target_date);

-- Index for searching owner staging rows during ingestion
CREATE INDEX IF NOT EXISTS idx_owner_reco_lookup 
  ON owner_reconciliation_records (upload_id, classification);

-- Index for retrieving leaderboard listings from cache
CREATE INDEX IF NOT EXISTS idx_perf_summaries_rankings 
  ON performance_summaries (reporting_month, rank_position) 
  INCLUDE (mtd_volume, attainment_rate, performance_status);

-- Indexes for snapshot analytics queries
CREATE INDEX IF NOT EXISTS idx_owner_snap_query 
  ON owner_performance_snapshots (owner_id, reporting_period, period_type);

CREATE INDEX IF NOT EXISTS idx_company_snap_query 
  ON company_performance_snapshots (reporting_period, period_type);

COMMIT;
```

---

### 8.2 Data Backfill Strategy
When applying this DDL migration to an active system with historical data, a structured data backfill plan is required to populate the new columns:

1. **`file_upload_archives` Columns:**
   * Run a script setting default `validation_status` to `'Passed'` for existing uploads with status `'Success'`.
   * For successful historical files, build a basic JSON import summary representing rows ingested based on `daily_transaction_records` and commit it to `import_summary`.
2. **`performance_summaries` Engine Columns:**
   * Compute existing differences: `remaining_target` = `volume_target - mtd_volume`. If negative, set to `0.00`.
   * Calculate elapsed days from the reporting month of the record to compute `projected_achievement`, and classify `performance_status` based on attainment.
   * Run a query using the standard PostgreSQL `DENSE_RANK() OVER (PARTITION BY reporting_month ORDER BY mtd_volume DESC)` window function to assign correct historical `rank_position` to all records in `performance_summaries`.
3. **Snapshot Table Seed:**
   * Seed the `daily_kpi_snapshots` and `monthly_kpi_snapshots` tables using aggregations from historical transaction tables to populate historical stats instantly.

---

### 8.3 Zero-Downtime Verification Checklist
Before deploying the schema updates to production:
1. **Constraint Safety:** Run the migration script within an isolated transaction block (`BEGIN ... COMMIT`) to ensure that if any operation fails, the database automatically rolls back to its pre-migration state, avoiding sequence corruption.
2. **Backward Compatibility:** All existing queries, views, and application routes remain operational because no tables are renamed, no columns are deleted, and new columns feature default values.
3. **Index Warm-up:** In production, build indexes using the `CONCURRENTLY` keyword (outside transaction blocks) to prevent locking operations on high-frequency tables.

---
**End of Database Architecture Specification**

