# KPI Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database design, tables, constraints, indexes, and architectural patterns dedicated exclusively to the **Key Performance Indicator (KPI) Module**. This module is engineered to define company-wide and owner-specific monthly targets, maintain strict historical versioning of changes, and support adding entirely new KPI types dynamically at runtime without requiring schema migrations or database modifications.

---

## 1. Dynamic Design Philosophy (Extensible Target Architecture)

To support adding new KPI types dynamically at runtime (e.g., adding "Float Velocity," "Registration Count," or "App Activation Rate" in the future), the schema separates the **KPI Definition** (metadata, unit of measure, scoring weight) from the **Period Targets** and **Individual Owner Allocations**.

### 1.1 Structural Components
1. **`kpi_definitions` (Metadata Configurator):** Acts as the master definition registry. Adding a new KPI type is as simple as inserting a row into this table.
2. **`kpi_period_targets` (Temporal Master Target):** Sets the global "Company Target" and "Default Owner Target" for a specific calendar month (e.g., July 2026).
3. **`owner_kpi_targets` (Individual Allocation Overrides):** Tracks the specific target allocated to individual Wakala Owners for that month.
4. **`kpi_target_versions` (Historical Revision Control):** Supports auditing and rollbacks. Any update to a target creates an audit-trail version history record, keeping historical definitions of past goals intact.

---

## 2. Entity Relationship Diagram (ERD) - KPI Segment

```
    +--------------------------------------+
    |           KPI_DEFINITIONS            |
    |--------------------------------------|
    | PK  kpi_definition_id (UUID)         |
    | UK  kpi_code (VARCHAR)               |
    |     kpi_name (VARCHAR)               |
    |     category (VARCHAR)               |
    |     measurement_unit (VARCHAR)       |
    |     default_weight (NUMERIC)         |
    |     status (VARCHAR)                 |
    +--------------------------------------+
                       |
                       | 1
                       |
                       | N
                       v
    +--------------------------------------+
    |          KPI_PERIOD_TARGETS          |
    |--------------------------------------|
    | PK  kpi_target_id (UUID)             |
    | FK  kpi_definition_id (UUID)         |
    |     effective_month (VARCHAR)        |
    |     company_target (NUMERIC)         |
    |     default_owner_target (NUMERIC)   |
    |     applied_weight (NUMERIC)         |
    |     version (INTEGER)                |
    |     status (VARCHAR)                 |
    +--------------------------------------+
            |                      |
            | 1                    | 1
            |                      |
            | N                    | N
            v                      v
    +-------------------+  +-------------------+
    | OWNER_KPI_TARGETS |  |KPI_TARGET_VERSIONS|
    |-------------------|  |-------------------|
    | PK  owner_target_ |  | PK  version_id    |
    |     id (UUID)     |  | FK  kpi_target_id |
    | FK  kpi_target_id |  |     version (INT) |
    | FK  owner_id (UUID|  |     old_company_  |
    |     custom_target |  |     target (NUM)  |
    |     (NUMERIC)     |  |     new_company_  |
    |                   |  |     target (NUM)  |
    |                   |  |     updated_by    |
    |                   |  |     updated_at    |
    +-------------------+  +-------------------+
```

---

## 3. Detailed Table Specifications

### 3.1 `kpi_definitions` Table
Registers new KPI categories and definitions dynamically. Admin interfaces can insert rows here to deploy new operational metrics instantly.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `kpi_definition_id`| `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Internal immutable primary key. |
| `kpi_code` | `VARCHAR(100)` | `UNIQUE` | No | None | Standardized variable code name (e.g., `CASH_IN_VOLUME`, `ACTIVE_WAKALA_COUNT`). |
| `kpi_name` | `VARCHAR(255)` | None | No | None | Human-readable label (e.g., "Monthly Cash-In Volume Target"). |
| `category` | `VARCHAR(100)` | None | No | None | Scoring department category (e.g., `Financial`, `Operational`, `Growth`). |
| `measurement_unit` | `VARCHAR(50)` | None | No | None | Unit scale representation (e.g., `TZS`, `Count`, `Percentage`). |
| `default_weight` | `NUMERIC(5, 2)`| `CHECK (default_weight >= 0 AND default_weight <= 100.00)` | No | `0.00` | Standard default percentage weight in performance score formulas. |
| `status` | `VARCHAR(50)` | `CHECK (status IN ('Active', 'Inactive'))` | No | `'Active'` | Controls whether this metric is active in reporting. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Audit registration timestamp. |

---

### 3.2 `kpi_period_targets` Table
Determines company-wide global targets and default parameters for specific calendar months.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `kpi_target_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Core target instance key. |
| `kpi_definition_id`| `UUID` | `FOREIGN KEY` references `kpi_definitions(kpi_definition_id)` ON DELETE RESTRICT | No | None | Connects to the KPI configuration definition. |
| `effective_month` | `VARCHAR(7)` | `CHECK (effective_month ~ '^[0-9]{4}-[0-9]{2}$')` | No | None | Target calendar period (Format: `YYYY-MM`, e.g., `2026-07`). |
| `company_target` | `NUMERIC(15, 2)`| `CHECK (company_target >= 0)` | No | `0.00` | Global company aggregated performance goal. |
| `default_owner_target`| `NUMERIC(15, 2)`| `CHECK (default_owner_target >= 0)` | No | `0.00` | Default fallback target allocated to an Owner if no custom override is set. |
| `applied_weight` | `NUMERIC(5, 2)`| `CHECK (applied_weight >= 0 AND applied_weight <= 100.00)` | No | `0.00` | Weight applied specifically for this month's score evaluation. |
| `version` | `INTEGER` | `CHECK (version >= 1)` | No | `1` | Current tracking version sequence of this month's goals. |
| `status` | `VARCHAR(50)` | `CHECK (status IN ('Active', 'Superseded', 'Draft'))` | No | `'Active'` | Logical active status of this target. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Log creation timestamp. |
| `updated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime of last configuration update. |

#### Constraints & Business Rules
* **Uniqueness:** A unique constraint is enforced on (`kpi_definition_id`, `effective_month`, `version`). This prevents version collisions for the same metric in a single period.

---

### 3.3 `owner_kpi_targets` Table
Establishes the customized targets assigned directly to individual Wakala Owners, overriding default settings.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `owner_target_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Immutable allocation primary key. |
| `kpi_target_id` | `UUID` | `FOREIGN KEY` references `kpi_period_targets(kpi_target_id)` ON DELETE CASCADE | No | None | Connects directly to the period target configuration. |
| `owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE RESTRICT | No | None | Target recipient (Wakala Owner). |
| `custom_target` | `NUMERIC(15, 2)`| `CHECK (custom_target >= 0)` | No | None | Override target allocated to this specific owner. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Creation log. |
| `updated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Mutation tracking. |

#### Constraints & Business Rules
* **No Duplicates:** Enforces a unique constraint on (`kpi_target_id`, `owner_id`) to ensure an Owner has exactly one specific target entry per KPI definition per active month.

---

### 3.4 `kpi_target_versions` Table
Immutably archives past values whenever a target is updated or re-released, supporting auditing and comparisons.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `version_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Serial index of historical archive logs. |
| `kpi_target_id` | `UUID` | `FOREIGN KEY` references `kpi_period_targets(kpi_target_id)` ON DELETE CASCADE | No | None | Target row that was updated. |
| `version` | `INTEGER` | None | No | None | The version number *prior* to this revision. |
| `old_company_target`| `NUMERIC(15, 2)`| None | No | None | Past global company target. |
| `new_company_target`| `NUMERIC(15, 2)`| None | No | None | The newly assigned global target. |
| `old_owner_target` | `NUMERIC(15, 2)`| None | No | None | Past default owner target. |
| `new_owner_target` | `NUMERIC(15, 2)`| None | No | None | The newly assigned default owner target. |
| `updated_by` | `VARCHAR(255)` | None | No | None | Identity of the administrator executing the modification. |
| `updated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when the update was logged. |

---

## 4. Key Performance Indicators: Normalized Index Design

* `idx_kpi_def_code` on `kpi_code` (Fast lookup during spreadsheet uploads).
* `idx_period_target_month` on (`effective_month`, `status`) (Accelerates target fetch requests for reports).
* `idx_owner_kpi_targets_owner` on `owner_id` (Crucial for rendering individual owner performance portals).

---
**End of KPI Module Schema Specification**
