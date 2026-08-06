# Audit Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database design, tables, constraints, indexes, and schemas dedicated exclusively to the **Audit Module**. This system tracks all administrative activities, data mutations, logins, and file operations to ensure absolute traceability, regulatory compliance, and a tamper-proof forensic trail.

---

## 1. Architectural Strategy: Immutable Structured Auditing

The **Audit Module** acts as an independent ledger. To preserve security and chronological integrity, it adheres to the following core guidelines:

1. **Strict Immutability:** No UPDATE or DELETE statements are permitted on audit tables. This is enforced at the database layer via PostgreSQL triggers or specialized user access rules.
2. **Comprehensive Action Mapping:** Logs all critical action families:
   * **Authentication Events:** Login (successful and failed attempts), Logout.
   * **File Management:** Report Ingestion, Ingestion Parsing, Report Deletion.
   * **Data Modifications:** Owner registration updates, KPI configuration updates.
   * **System Workflows:** Execution of reconciliations, user profile modifications.
3. **Structured Delta Tracking (JSONB):** Relies on PostgreSQL `JSONB` columns to store exact "snapshots" of modified records before and after execution. This preserves column types, handles flexible schemas, and simplifies deep auditing queries without modifying table layouts.
4. **IP & Environmental Metadata:** Captures Client IP Address (supporting both IPv4 and IPv6 formats) and browser User Agent signatures to trace action contexts.

---

## 2. Entity Relationship Diagram (ERD) - Audit Segment

```
    +--------------------------------------+
    |                USERS                 |
    |--------------------------------------|
    | PK  user_id (UUID)                   |
    |     email (VARCHAR)                  |
    +--------------------------------------+
                       |
                       | 1
                       |
                       | N (Tracks acting user)
                       v
    +--------------------------------------+
    |          SYSTEM_AUDIT_LOGS           |
    |--------------------------------------|
    | PK  audit_id (BIGINT)                |
    | FK  user_id (UUID, NULL)             |
    |     user_email_snapshot (VARCHAR)    |
    |     action_type (VARCHAR)            |
    |     action_description (TEXT)        |
    |     affected_table (VARCHAR)         |
    |     affected_record_id (VARCHAR)     |
    |     previous_value (JSONB, NULL)     |
    |     new_value (JSONB, NULL)          |
    |     ip_address (VARCHAR)             |
    |     user_agent (TEXT, NULL)          |
    |     logged_at (TIMESTAMPTZ)          |
    +--------------------------------------+
```

---

## 3. Detailed Table Specification

### 3.1 `system_audit_logs` Table
The primary single-source registry tracking security operations, admin actions, and raw data state transitions.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `audit_id` | `BIGINT` | `PRIMARY KEY` `GENERATED ALWAYS AS IDENTITY` | No | None | Unique serial identifier of the audit log record. |
| `user_id` | `UUID` | `FOREIGN KEY` references `users(user_id)` ON DELETE SET NULL | Yes | `NULL` | Links to the user performing the action. Nullable to handle unauthenticated events (e.g. failed login attempts). |
| `user_email_snapshot`| `VARCHAR(255)`| None | No | `'System'` | Backup snapshot of the actor's email. Ensures trace remains readable even if the user profile is deleted. |
| `action_type` | `VARCHAR(100)`| `CHECK (action_type IN ('LOGIN_SUCCESS', 'LOGIN_FAILED', 'LOGOUT', 'UPLOAD_REPORT', 'DELETE_REPORT', 'UPDATE_OWNER', 'UPDATE_KPI', 'IMPORT_RUN', 'USER_ACTION'))` | No | None | High-level categorization of the logged action. |
| `action_description`| `TEXT` | None | No | None | Human-readable details of the action (e.g., "Admin approved reconciliation mapping for Owner OWN-0012"). |
| `affected_table` | `VARCHAR(100)`| None | No | None | Target database table name impacted by this action (e.g., `'owners'`, `'monthly_kpi_targets'`, `'uploaded_reports'`). |
| `affected_record_id`| `VARCHAR(100)`| None | No | None | Primary key of the affected record (stores UUID or BIGINT serial value as a string). |
| `previous_value` | `JSONB` | None | Yes | `NULL` | State snapshot *before* the modification was applied. Null for creation events. |
| `new_value` | `JSONB` | None | Yes | `NULL` | State snapshot *after* the modification was applied. Null for deletion events. |
| `ip_address` | `VARCHAR(45)` | None | No | None | Client IP address of the acting machine. Supports both IPv4 (e.g. `192.168.1.1`) and IPv6 formats. |
| `user_agent` | `TEXT` | None | Yes | `NULL` | Complete web browser or connection device user agent string. |
| `logged_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | DateTime when the action was committed. |

#### Constraints & Business Rules
1. **Audit Conservation (Restrict Deletes):** There are no cascading deletes. If a user profile is deleted from the `users` table, the corresponding audit logs have their `user_id` set to `NULL` (`ON DELETE SET NULL`), but the record itself remains completely intact with the email string preserved in `user_email_snapshot`.
2. **Strict Append-Only Enforcement:** Database triggers should block any `UPDATE` or `DELETE` executions on this table, returning a database-level authorization error.
3. **Validating JSONB Integrity:** Ensures that for update actions (`UPDATE_OWNER`, `UPDATE_KPI`), both `previous_value` and `new_value` contain valid JSON payloads detailing the field deltas.

#### Recommended Indexes
* `idx_audit_logged_at` on `logged_at` (Essential for loading recent activity feeds and running chronological investigations).
* `idx_audit_action_type` on `action_type` (Speeds up filtering audit events by operation class, e.g., identifying recent file deletions).
* `idx_audit_user_id` on `user_id` (Allows fast tracking of actions executed by a specific administrator or user).
* `idx_audit_entity_lookup` on (`affected_table`, `affected_record_id`) (Enables instant chronological recovery of a single record's history from its creation to its current state).
* `idx_audit_jsonb_ops` using `GIN` on `new_value` (PostgreSQL generalized inverted index for high-speed pattern matching inside the JSON data snapshots).

---

## 4. Database Normalization (3NF) Validation

* **Atoms Verification:** Every column holds a singular, atomic scalar value.
* **Functional Dependency:** The primary key is the surrogate `audit_id`. All other columns in the row depend strictly and entirely on `audit_id`.
* **Zero Transitive Dependencies:** No non-key column depends transitively on any other non-key column. For instance, the snapshot of the actor's email (`user_email_snapshot`) is intentionally denormalized and static at the point of creation to act as a historical value, eliminating dependency chains on active records in compliance with 3NF audit standards.

---
**End of Audit Module Schema Specification**
