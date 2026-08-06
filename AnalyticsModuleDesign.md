# Analytics & Reporting Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database design, tables, constraints, indexes, and caching strategies dedicated exclusively to the **Analytics & Reporting Module**. This module is engineered to provide lightning-fast, high-fidelity dashboards and performance comparison queries. Instead of executing resource-intensive real-time aggregations (such as full-table scans) over millions of historical transaction rows, the system writes pre-computed performance metrics, trend curves, and league rankings directly into optimized analytical tables.

---

## 1. Architectural Strategy: Materialized Performance Caches

To meet the high-performance non-functional requirements (NFR-1.2: dashboards loading in under 2 seconds), the system implements an **Asynchronous Pre-Aggregation Strategy**:
1. **Trigger-Based or Job-Based Aggregation:** Whenever a Daily MGT report is successfully imported, a backend worker computes the analytics snapshots, owner standings, and trends, and commits them in a single batch write.
2. **Read-Optimized Queries:** Both the Admin Workspace and the Owner Portal query these pre-calculated analytical tables directly, eliminating runtime join bottlenecks.
3. **Auditability:** Every record in this module links to a historical day, month, or target period, ensuring that raw records can always be audited to verify the cached totals.

---

## 2. Entity Relationship Diagram (ERD) - Analytics Segment

The diagram below shows the relationships between core operational master entities and the optimized cache tables:

```
    +-----------------------------+
    |           OWNERS            |
    |-----------------------------|
    | PK  owner_id (UUID)         |
    +-----------------------------+
         |     |             |
         |     |             |
         |     | 1           | 1
         |     |             |
         |     | N           | N
         |     v             v
         |  +-----------------------------+
         |  |       OWNER_RANKINGS        |
         |  |-----------------------------|
         |  | PK  ranking_id (BIGINT)     |
         |  | FK  owner_id (UUID)         |
         |  |     ranking_period (VARCHAR)|
         |  |     rank_type (VARCHAR)     |
         |  |     rank_position (INTEGER) |
         |  +-----------------------------+
         |
         | 1
         |
         | N
         v
    +-------------------------------------+
    |         PERFORMANCE_TRENDS          |
    |-------------------------------------|
    | PK  trend_id (BIGINT)               |
    | FK  owner_id (UUID, NULL)           |
    |     reporting_period (VARCHAR)      |
    |     metric_code (VARCHAR)           |
    |     current_value (NUMERIC)         |
    |     previous_value (NUMERIC)        |
    |     growth_rate_pct (NUMERIC)       |
    |     moving_avg_7day (NUMERIC)       |
    +-------------------------------------+

    +-------------------------------------+
    |     DAILY_DASHBOARD_SNAPSHOTS       |
    |-------------------------------------|
    | PK  snapshot_id (BIGINT)            |
    |     reporting_date (DATE)           |
    |     company_volume (NUMERIC)        |
    |     company_commission (NUMERIC)    |
    |     active_wakala_count (INTEGER)   |
    |     attainment_rate_pct (NUMERIC)   |
    +-------------------------------------+

    +-------------------------------------+
    |    MONTHLY_DASHBOARD_SNAPSHOTS      |
    |-------------------------------------|
    | PK  monthly_snapshot_id (BIGINT)    |
    |     reporting_month (VARCHAR)       |
    |     company_total_volume (NUMERIC)  |
    |     company_total_comm (NUMERIC)    |
    |     active_wakala_avg_pct (NUMERIC) |
    |     overall_target_attainment (NUM) |
    +-------------------------------------+
```

---

## 3. Detailed Table Specifications

### 3.1 `daily_dashboard_snapshots` Table
Caches company-wide aggregated metrics for the executive landing dashboard. 

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `snapshot_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique serial identifier of the snapshot. |
| `reporting_date` | `DATE` | `UNIQUE` | No | None | The specific operational date cached. |
| `company_volume` | `NUMERIC(15, 2)`| `CHECK (company_volume >= 0)` | No | `0.00` | Aggregate network-wide transaction volume in TZS. |
| `company_commission` | `NUMERIC(15, 2)`| `CHECK (company_commission >= 0)` | No | `0.00` | Aggregate network commissions earned in TZS. |
| `active_wakala_count`| `INTEGER` | `CHECK (active_wakala_count >= 0)` | No | `0` | Total unique active sub-agents on this date. |
| `attainment_rate_pct`| `NUMERIC(5, 2)` | None | No | `0.00` | Average attainment score achieved across the system. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when snapshot was pre-aggregated. |

* **Indexes:**
  * `idx_daily_snap_date` on `reporting_date` (To pull rapid timelines).

---

### 3.2 `monthly_dashboard_snapshots` Table
Provides instant reads of network performance across sequential billing cycles.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `monthly_snapshot_id`| `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique monthly snapshot identifier. |
| `reporting_month` | `VARCHAR(7)` | `UNIQUE` `CHECK (reporting_month ~ '^[0-9]{4}-[0-9]{2}$')` | No | None | Year-month of performance (Format: `YYYY-MM`). |
| `company_total_volume`| `NUMERIC(15, 2)`| `CHECK (company_total_volume >= 0)` | No | `0.00` | Total transactional volume for the month (TZS). |
| `company_total_comm` | `NUMERIC(15, 2)`| `CHECK (company_total_comm >= 0)` | No | `0.00` | Total master partner commission for the month (TZS). |
| `active_wakala_avg_pct`| `NUMERIC(5, 2)` | None | No | `0.00` | System-wide monthly average of active sub-agents. |
| `overall_target_attainment`| `NUMERIC(5, 2)` | None | No | `0.00` | Percent of the company target achieved (calculated against period targets). |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Ingestion timestamp. |

---

### 3.3 `owner_rankings` Table
Maintains dynamic league standings for all Wakala Owners. Crucial for gamification dashboards and identifying high-performing partners.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `ranking_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique serial key of the ranking entry. |
| `owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE CASCADE | No | None | Owner being ranked. |
| `ranking_period` | `VARCHAR(10)` | None | No | None | Period indicator (e.g. `2026-07` or `2026-07-01`). |
| `rank_type` | `VARCHAR(50)` | `CHECK (rank_type IN ('Daily', 'Monthly'))` | No | None | Scope of the ranking evaluation. |
| `score_metric` | `VARCHAR(100)`| None | No | None | Field being ranked (e.g. `VOLUME`, `COMMISSION`, `ATTAINMENT`). |
| `score_value` | `NUMERIC(15, 2)`| None | No | `0.00` | Absolute value of the metric achieved. |
| `rank_position` | `INTEGER` | `CHECK (rank_position > 0)` | No | None | Dynamic leaderboard position (1st, 2nd, etc.). |
| `percentile_standing`| `NUMERIC(5, 2)` | `CHECK (percentile_standing >= 0 AND percentile_standing <= 100.00)` | No | `0.00` | Statistical standing percentage relative to peer group. |
| `recalculated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when leaderboard values were refreshed. |

#### Constraints & Business Rules
* **No Ranking Collisions:** A unique constraint on (`owner_id`, `ranking_period`, `rank_type`, `score_metric`) prevents double-ranking records for a single owner in the same period.

* **Indexes:**
  * `idx_rankings_period_type` on (`ranking_period`, `rank_type`, `score_metric`, `rank_position`) (Accelerates displaying leaderboard listings).
  * `idx_rankings_owner` on `owner_id` (Allows owners to view their own standing history quickly).

---

### 3.4 `performance_trends` Table
Houses analytical trend values, pre-calculated velocity scores, and percentage differences for owners and the overall company.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `trend_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique trend identifier. |
| `owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE CASCADE | Yes | `NULL` | Null represents company-wide trends; non-null tracks specific owners. |
| `reporting_period` | `VARCHAR(10)` | None | No | None | Period of calculation (e.g., `2026-W27`, `2026-07`). |
| `trend_type` | `VARCHAR(50)` | `CHECK (trend_type IN ('Weekly', 'Monthly'))` | No | None | Duration window evaluated. |
| `metric_code` | `VARCHAR(100)`| None | No | None | Identifier of metric (e.g., `VOLUME`, `COMMISSION`). |
| `current_value` | `NUMERIC(15, 2)`| None | No | `0.00` | Value computed for the current period. |
| `previous_value` | `NUMERIC(15, 2)`| None | No | `0.00` | Value computed for the prior comparative period. |
| `growth_rate_pct` | `NUMERIC(7, 2)` | None | No | `0.00` | Calculated growth percentage between periods. |
| `moving_avg_7day` | `NUMERIC(15, 2)`| None | Yes | `NULL` | 7-day rolling performance average. |
| `recalculated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Cache timestamp. |

* **Indexes:**
  * `idx_trends_owner_metric` on (`owner_id`, `metric_code`, `reporting_period`)
  * `idx_trends_growth` on `growth_rate_pct` (To quickly pull top growing or declining partners).

---

### 3.5 `comparison_reports` Table
Stores pre-packaged target vs. actual matrices for rapid rendering of multi-period analytical comparison reports.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `comparison_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique sequence key. |
| `owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE CASCADE | No | None | Target owner. |
| `reporting_month` | `VARCHAR(7)` | None | No | None | Evaluation month (e.g., `2026-07`). |
| `volume_target` | `NUMERIC(15, 2)`| None | No | `0.00` | Monthly target set (TZS). |
| `volume_actual` | `NUMERIC(15, 2)`| None | No | `0.00` | MTD actual volume achieved (TZS). |
| `variance_volume` | `NUMERIC(15, 2)`| None | No | `0.00` | Numerical difference (Actual - Target) in TZS. |
| `variance_pct` | `NUMERIC(7, 2)` | None | No | `0.00` | Variance percentage. |
| `active_target` | `INTEGER` | None | No | `0` | Expected minimum active stations. |
| `active_actual_avg`| `NUMERIC(5, 2)` | None | No | `0.00` | actual average active sub-stations. |
| `recalculated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime cached. |

* **Indexes:**
  * `idx_comparison_lookup` on (`owner_id`, `reporting_month`)

---

## 4. Normalization Validation (3NF)

The dynamic analytical caching strategy satisfies relational integrity constraints and Third Normal Form standards. It introduces optimized caches of mathematical equations derived from base tables. No primary user operational information is duplicated (e.g. Owner Names, codes, and physical ward structures are omitted and replaced strictly by UUID relationship pointers `owner_id`), preserving 3NF compliance throughout the reporting engine.

---
**End of Analytics & Reporting Module Schema Specification**
