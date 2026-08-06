# Owner Module Schema Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Implementation  
**Target Platform:** PostgreSQL (v12+)  

This document specifies the database tables, relations, constraints, and indexes dedicated exclusively to the **Owner (Wakala Business Owner) Module**, aligned with Third Normal Form (3NF) and PostgreSQL enterprise best practices.

---

## 1. Module Overview & Cardinality

An **Owner** represents a high-level commercial partner (franchisee/investor) under the Master Agent. 
* Each **Owner** is assigned a unique, human-readable operational code (`owner_code`) and maintains registration and geographical attributes (Region, District, Ward).
* Each **Owner** can own and manage one or multiple **Wakala** (the physical agent stations/SIM cards executing operations).
* This establishes a strict **one-to-many (1:N)** relationship between the `owners` table and the `wakalas` table.

---

## 2. Entity Relationship Diagram (ERD) - Owner Module Segment

```
    +----------------------------------+
    |             OWNERS               |
    |----------------------------------|
    | PK  owner_id (UUID)              |
    | UK  owner_code (VARCHAR)         |
    |     owner_name (VARCHAR)         |
    |     phone (VARCHAR)              |
    |     email (VARCHAR)              |
    |     national_id (VARCHAR, NULL)  |
    |     business_name (VARCHAR)      |
    |     business_number (VARCHAR)    |
    |     region (VARCHAR)             |
    |     district (VARCHAR)           |
    |     ward (VARCHAR)               |
    |     status (VARCHAR)             |
    |     registration_date (DATE)     |
    |     created_at (TIMESTAMPTZ)     |
    |     updated_at (TIMESTAMPTZ)     |
    +----------------------------------+
                     |
                     | 1
                     |
                     | N
                     v
    +----------------------------------+
    |            WAKALAS               |
    |----------------------------------|
    | PK  wakala_id (UUID)             |
    | UK  wakala_code (VARCHAR)        |
    | FK  owner_id (UUID)              |
    |     station_name (VARCHAR)       |
    |     status (VARCHAR)             |
    |     created_at (TIMESTAMPTZ)     |
    |     updated_at (TIMESTAMPTZ)     |
    +----------------------------------+
```

---

## 3. Detailed Table Specifications

### 3.1 `owners` Table
Stores master information for individual Wakala business owners.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `owner_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Internal immutable system surrogate identifier. |
| `owner_code` | `VARCHAR(50)` | `UNIQUE` | No | None | Human-readable business code (e.g., `OWN-TZ-0012`). |
| `owner_name` | `VARCHAR(255)` | None | No | None | Full legal name of the individual business owner. |
| `phone` | `VARCHAR(50)` | `UNIQUE` | No | None | Primary contact number in international format. |
| `email` | `VARCHAR(255)` | `UNIQUE` | No | None | Email address (forces case-insensitive lowercase). |
| `national_id` | `VARCHAR(100)` | `UNIQUE` | Yes | `NULL` | Optional National ID (NIDA) or passport number. |
| `business_name` | `VARCHAR(255)` | None | No | None | Registered corporate or commercial trading name. |
| `business_number`| `VARCHAR(100)` | `UNIQUE` | No | None | Government-issued business registration/license number. |
| `region` | `VARCHAR(100)` | None | No | None | Administrative Region in Tanzania (e.g., `Dar es Salaam`). |
| `district` | `VARCHAR(100)` | None | No | None | Administrative District (e.g., `Kinondoni`). |
| `ward` | `VARCHAR(100)` | None | No | None | Local Ward of primary offices (e.g., `Mikocheni`). |
| `status` | `VARCHAR(50)` | `CHECK (status IN ('Active', 'Inactive', 'Suspended'))` | No | `'Active'` | Current operational standing of the owner. |
| `registration_date`| `DATE` | None | No | `CURRENT_DATE` | Date the owner officially contracted with the Master Agent. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Database record ingestion time. |
| `updated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Timestamp of the most recent data alteration. |

#### Constraints & Business Rules
1. **Uniqueness:** Fields `owner_code`, `phone`, `email`, `business_number`, and `national_id` (when not null) are strictly unique to prevent duplicate corporate identity fraud.
2. **Case Insensitivity:** Uniqueness on `email` is enforced via a lower-case index to prevent registration of identical accounts with differing casing (e.g., `Owner@Wakala.com` vs `owner@wakala.com`).
3. **Status Check:** Enforces that `status` must strictly be one of the pre-approved operational lifecycle states: `Active`, `Inactive`, or `Suspended`.

#### Recommended Indexes
* `idx_owners_code` on `owner_code` (Fast lookup during report parsing).
* `idx_owners_email_lower` on `LOWER(email)` (Authentication and validation lookup).
* `idx_owners_region_district` on (`region`, `district`) (Speeds up geographic filters and analytical sorting).

---

### 3.2 `wakalas` Table
Represents the individual agent terminals or SIM lines owned by the business owners.

| Column Name | Data Type | Key / Constraint | Nullable | Default Value | Purpose / Description |
| :--- | :--- | :--- | :---: | :--- | :--- |
| `wakala_id` | `UUID` | `PRIMARY KEY` | No | `gen_random_uuid()` | Internal immutable system surrogate identifier. |
| `wakala_code` | `VARCHAR(100)` | `UNIQUE` | No | None | Unique agent station code from network operators (e.g., `WK-9921`). |
| `owner_id` | `UUID` | `FOREIGN KEY` references `owners(owner_id)` ON DELETE RESTRICT | No | None | Identifies the business owner who holds this terminal. |
| `station_name` | `VARCHAR(255)` | None | No | None | Geographic descriptor of terminal location (e.g., "Posta Terminal A"). |
| `status` | `VARCHAR(50)` | `CHECK (status IN ('Active', 'Inactive', 'Suspended'))` | No | `'Active'` | Operational status of the terminal line. |
| `created_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Timestamp of SIM registration in system database. |
| `updated_at` | `TIMESTAMPTZ` | None | No | `CURRENT_TIMESTAMP` | Last updated timestamp of the terminal attributes. |

#### Constraints & Business Rules
1. **Uniqueness:** `wakala_code` must be entirely unique across the entire network to guarantee transactional attribution.
2. **Foreign Key Integrity:** The foreign key constraint on `owner_id` references `owners(owner_id)`. It enforces `ON DELETE RESTRICT` to prevent deleting an Owner record if active Wakala terminals remain associated with them. This avoids orphaned point-of-sale terminals.

#### Recommended Indexes
* `idx_wakalas_owner_id` on `owner_id` (Significantly accelerates relational joins and filtering terminal lists by Owner).
* `idx_wakalas_code` on `wakala_code` (Essential for high-speed indexing during Daily MGT report parsing and import transactions).

---
**End of Owner Module Schema Specification**
