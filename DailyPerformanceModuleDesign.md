# Daily Performance Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database tables, relations, constraints, and indexes dedicated exclusively to the **Daily Performance Module**. This module captures, tracks, and analyzes owner-level metrics computed daily from ingested Daily MGT reports.

---

## 1. Process & Persistence Architecture

The Daily Performance module is designed to store historical records of daily performance metrics without overwriting past entries. 

### 1.1 Core Objectives
* **Immutable Snapshot Pattern (No Overwrites):** Every daily report import computes a static, historical day snapshot for each affected Wakala Owner. These snapshots are never mutated; they serve as a historical ledger of daily metrics, enabling trend tracking and timeline charts.
* **Granular Metrics Tracking:** Tracks financial volumes ("Daily Servicing Value"), transaction traffic, agent participation ("Active Wakalas"), auxiliary channels ("Product Sellers"), and target progression metrics.
* **MTD and Projections:** Calculates Running Monthly Totals and projects month-end achievements dynamically based on month-to-date trajectory, storing these parameters in the daily record for direct historical analysis.

---

## 2. Entity Relationship Diagram (ERD) - Daily Performance Segment

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
    |  DAILY_OWNER_PERFORMANCE_SNAPSHOTS   |
    |--------------------------------------|
    | PK  performance_snapshot_id (UUID)   |
    | FK  upload_id (UUID)                 |
    | FK  owner_id (UUID)                  |
    |     reporting_date (DATE)            |
    |     daily_servicing_value (NUMERIC)  |
    |     daily_transaction_count (INTEGER)|
    |     daily_active_wakala_count (INT)  |
    |     daily_product_sellers_count (INT)|
    |     daily_achievement_rate (NUMERIC) |
    |     running_monthly_total (NUMERIC)  |
    |     projected_achievement_rate (NUM) |
    |     performance_status (VARCHAR)     |
    |     created_at (TIMESTAMPTZ)         |
    +--------------------------------------+
```

---

## 3. Detailed Table Specifications

### 3.1 `daily_owner_performance_snapshots` Table
Contains immutable daily performance records for each Wakala Owner, computed automatically upon successful file import.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `performance_snapshot_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Internal unique immutable identifier. |
| `upload_id` | `UUID` | `FOREIGN KEY` references `uploaded_reports(upload_id)` ON DELETE RESTRICT | No | None | Link to the Daily MGT spreadsheet ingestion record that generated this snapshot. |
| `owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE RESTRICT | No | None | Link to the specific Wakala Business Owner evaluated. |
| `reporting_date` | `DATE` | None | No | None | The operational day represented (e.g. `2026-07-01`). |
| `daily_servicing_value` | `NUMERIC(15, 2)`| `CHECK (daily_servicing_value >= 0)` | No | `0.00` | Sum of all transaction volumes (Cash-In + Cash-Out) processed on this date (TZS). |
| `daily_transaction_count`| `INTEGER` | `CHECK (daily_transaction_count >= 0)`| No | `0` | Total number of individual transactions logged by the owner's sub-agents. |
| `daily_active_wakala_count`| `INTEGER` | `CHECK (daily_active_wakala_count >= 0)`| No | `0` | Count of unique Wakala terminals belonging to this owner that recorded at least one transaction. |
| `daily_product_sellers_count`| `INTEGER` | `CHECK (daily_product_sellers_count >= 0)`| No | `0` | Count of sub-agents who successfully logged sales of value-added secondary products on this date. |
| `daily_achievement_rate` | `NUMERIC(5, 2)` | None | No | `0.00` | Percentage achievement relative to the owner's pro-rated daily target. |
| `running_monthly_total` | `NUMERIC(15, 2)`| `CHECK (running_monthly_total >= 0)` | No | `0.00` | Month-to-Date (MTD) accumulated transaction volume for the current month up to this date. |
| `projected_achievement_rate`| `NUMERIC(5, 2)` | None | No | `0.00` | Forecasted month-end percentage attainment of the monthly volume goal if this day's run rate persists. |
| `performance_status` | `VARCHAR(50)` | `CHECK (performance_status IN ('Underperforming', 'On Track', 'Excellent', 'Critically Low'))` | No | `'On Track'` | Evaluative status of the owner's performance trajectory on this date. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when this summary record was committed. |

#### Constraints & Business Rules
1. **Deduplication Constraint:** Enforces a unique constraint on the composite key (`owner_id`, `reporting_date`). This ensures that only **one** performance snapshot can be committed per owner for any given calendar date. If a file is re-processed, the previous day's snapshot must be systematically archived, cancelled, or recreated within a single atomic database transaction.
2. **Archival Integrity (Restrict Actions):** `ON DELETE RESTRICT` is specified for both the `upload_id` and `owner_id` relationships to ensure historical stats remain permanent and cannot be accidentally deleted by cleaning up active operational tables.

#### Recommended Indexes
* `idx_daily_perf_owner_date` on (`owner_id`, `reporting_date`) (Significantly accelerates timeline charts, MTD graphs, and historic comparisons).
* `idx_daily_perf_date` on `reporting_date` (To render company-wide daily dashboards and performance ranking tables).
* `idx_daily_perf_upload_id` on `upload_id` (Allows fast rollbacks if an entire daily upload needs to be revoked).

---

## 4. Normalization Validation (3NF)

* **Atomic Values:** Every column holds a singular, indivisible data value (numeric financial balances, date, or status labels).
* **Dependency on Primary Key:** All columns are fully dependent on `performance_snapshot_id`.
* **No Transitive Dependencies:** No non-key attributes are dependent on other non-key attributes. For example, while `performance_status` is derived from `daily_achievement_rate`, it is persisted directly to serve as a fast filter, or is bound by the primary key, avoiding intermediate lookup tables that would violate 3NF for active transactional operations.

---
**End of Daily Performance Module Schema Specification**
