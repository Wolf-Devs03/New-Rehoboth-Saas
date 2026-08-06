# Business Requirements Document (BRD)
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Approved for Database Schema Design  
**Target Audience:** Database Administrators, Backend Engineers, Frontend Developers, Project Stakeholders  

---

## 1. Executive Summary & Context

In Tanzania, the mobile money ecosystem (including services like M-Pesa, Tigo Pesa, Airtel Money, and Halopesa) operates through a vast network of **Wakala** (agents). A **Master Agent** acts as an aggregator who manages a group of individual **Wakala Owners**, monitors their cash-in/cash-out transaction volumes, tracks commissions, ensures capital liquidity (float management), and evaluates operational Key Performance Indicators (KPIs).

The purpose of this system is to replace manual Excel tracking with an automated, high-fidelity web application. It empowers the Master Agent (Admin) to establish monthly financial and expansion targets, upload daily transactional files, dynamically reconcile agent identities, auto-compute operational metrics, and expose analytical dashboards to both the Admin and the Wakala Owners.

---

## 2. Business Requirements (BR)

### 2.1 Strategic Business Objectives
* **BR-01 (Automated Reconciliation):** Eliminate manual mapping of transactional lines to owner accounts, reducing import preparation time from hours to seconds.
* **BR-02 (Agent Identity Verification):** Guarantee that no transaction is credited to an unregistered or misconfigured Owner without explicit Admin authorization.
* **BR-03 (Real-Time Performance Transparency):** Provide Wakala Owners with self-service dashboards to view their performance against monthly targets, encouraging self-correction and competitive growth.
* **BR-04 (Historical Auditing):** Establish an immutable record of all raw uploaded sheets, calculated KPIs, and data modifications for compliance and auditing.

### 2.2 Scope of the System
* **In Scope:**
  * Multi-format (CSV/Excel) file ingestion engines for Monthly Target sheets and Daily Management (MGT) transactional reports.
  * Intermediate owner extraction and reconciliation staging area.
  * Automated KPI engine calculating: Target Attainment, Active Wakala rates, Commission Yields, and Liquidity velocity.
  * Individualized Owner Portal and centralized Admin dashboard.
  * Immutable file archival ledger.
* **Out of Scope:**
  * Direct database layout design (this document serves as the structural specification for the DB design phase).
  * Integration with real-time Mobile Network Operator (MNO) APIs (Safaricom, Vodacom, Tigo, Airtel) for live transactions.
  * Financial payout/disbursement processing.

---

## 3. Functional Requirements (FR)

### 3.1 User Management & Authentication
* **FR-1.1 (Role Differentiation):** The system must strictly enforce two user roles:
  1. **Admin (Master Agent):** Has full administrative access, including report uploading, owner reconciliation approvals, system-wide metrics analysis, and ledger reviews.
  2. **Owner (Wakala Owner):** Has read-only access restricted entirely to their own performance logs, targets, and active sub-agent metrics.
* **FR-1.2 (Agent Portal Standalone Layout):** When logged in as an Owner, the system must display a simplified standalone interface omitting administrative tools (no sidebar navigation to other owners, no file import panels, and no network-wide KPI editing).

### 3.2 Report Ingestion & Processing
* **FR-2.1 (Monthly KPI Target Upload):** The Admin must be able to upload a "Monthly KPI Target Report" (.xlsx, .xls, .csv) once per calendar month. This report establishes:
  * Monthly volume goals (TZS) per owner/region.
  * Target count of active sub-agent stations (Wakala numbers) required.
* **FR-2.2 (Daily MGT Report Ingestion):** The Admin must be able to upload a "Daily MGT Report" (.xlsx, .xls, .csv) on a daily basis. This report details active performance parameters:
  * Wakala ID / Station code.
  * Cash-In transaction volume (TZS).
  * Cash-Out transaction volume (TZS).
  * Commission earned (TZS).
  * Daily active status indicator of the sub-agent.
* **FR-2.3 (File Validation Engine):** Upon file selection, the system must perform immediate structural checks before committing records:
  * **File Type check:** Rejects non-spreadsheet formats.
  * **Header Validation:** Checks for the presence of required identifier columns (e.g., `Wakala_ID`, `Owner_Name`, `Volume`).
  * **Deduplication Check:** Prevents double-importing of the same file hash or identical reporting dates.
  * **Anomalous Values:** Flag negative transaction amounts, invalid characters, or dates outside the reporting month.

### 3.3 Dynamic Owner Reconciliation Staging
* **FR-3.1 (Pre-Import Extraction):** Prior to injecting Daily MGT data into historical logs, the ingestion engine must parse all unique Wakala IDs and Owner Names present in the uploaded sheet.
* **FR-3.2 (Delta Analysis):** The system must compare the extracted list against the existing database of Owners to identify:
  * **New Owners:** Owner names or Wakala IDs detected in the report that do not exist in the database.
  * **Changed Information:** Existing Owners whose details (e.g., Region, primary name spelling) differ in the uploaded file compared to the current database records.
* **FR-3.3 (Interim Review Panel):** The Admin must be presented with an interactive checklist of these identified deltas. The Admin must manually approve or map these changes before the actual operational records are written to the database.

### 3.4 KPI Calculation Engine
* **FR-4.1 (Aggregate KPI Formulas):** Once the Admin approves the reconciliation staging, the system must automatically compute:
  * $$\text{Target Achievement \%} = \left( \frac{\text{Sum of Cash-In} + \text{Sum of Cash-Out}}{\text{Monthly Volume Target}} \right) \times 100$$
  * $$\text{Wakala Active Rate \%} = \left( \frac{\text{Daily Active Wakala Stations}}{\text{Target Minimum Active Stations}} \right) \times 100$$
  * $$\text{Commission Yield} = \text{Total Commissions Earned (TZS)}$$
* **FR-4.2 (Outlier Clamping):** In case of corrupt or anomalous row calculations, the KPI engine must clamp values to logical ranges (e.g., preventing >1000% single-day targets or zero-division errors) and tag them with warning alerts.

### 3.5 Archival & History Ledger
* **FR-5.1 (Automated Archiving):** Successful imports must trigger an automatic backup process that archives the raw file parameters (Filename, Size, Timestamp, Uploaded By, Hash) in a System Audit Trail.
* **FR-5.2 (State Persistence):** Track status flags for all historical uploads: `Pending Review`, `Importing`, `Success`, or `Failed`.

---

## 4. Non-Functional Requirements (NFR)

### 4.1 Performance & Scalability
* **NFR-1.1 (Processing Time):** Spreadsheet files containing up to 10,000 transaction rows must be validated and analyzed in less than 15 seconds.
* **NFR-1.2 (Concurrent Access):** The system dashboards must render in under 2.0 seconds under a concurrent load of 500 active Wakala Owners checking daily status reports.

### 4.2 Security & Compliance
* **NFR-2.1 (Data Privacy):** An Owner must never be able to inspect or intercept metrics belonging to another Owner. API route authorization must validate identity tokens before sending JSON response payloads.
* **NFR-2.2 (Immutable Auditing):** Import history and system logs cannot be edited or deleted, even by an Admin. Only new compensatory imports are permitted.

### 4.3 Reliability & Availability
* **NFR-3.1 (Transactional Consistency):** Imports must run within database transactions. If any system failure occurs mid-import (e.g., network disconnect or server timeout), the database must rollback entirely to prevent orphaned or partial daily records.

### 4.4 Usability & Localization
* **NFR-4.1 (Responsive Design):** The interface must fully adapt to mobile viewports, as many Wakala Owners check performance metrics on tablets and mobile phones in the field.
* **NFR-4.2 (Financial Formatting):** All monetary figures must be rendered in Tanzanian Shillings format (TZS) with standard digit separation (e.g., `TZS 12,500,000`).

---

## 5. Business Rules (BRUL)

* **BRUL-01 (Strict Monthly Target Constraint):** There can only be **one** active Monthly KPI Target Report per calendar month. Uploading a subsequent Monthly Target file for the same month will overwrite previous target benchmarks (upon Admin confirmation).
* **BRUL-02 (The "Unknown Owner" Catch-All):** Any daily transaction linked to an unapproved Wakala ID during import must be temporarily assigned to a virtual default owner ("Unknown Mapped Agent") and flagged with high-priority warnings on the Admin dashboard.
* **BRUL-03 (Chronological Integrity):** Daily MGT uploads do not need to be uploaded in strict chronological order, but KPI calculations must automatically recalculate historical month-to-date averages if a past date's backfilled file is uploaded.
* **BRUL-04 (Role Escalate Protection):** Wakala Owners are strictly forbidden from writing or altering any data within the database. All post-authentication writes are restricted to Admin tokens.

---

## 6. System Modules & Architecture

Below is a block diagram representation of the modules required to fulfill the business process:

```
+-----------------------------------------------------------------------------------+
|                                 USER INTERFACE                                    |
|   +---------------------------------------+   +-------------------------------+   |
|   |         ADMIN WORKSPACE PORTAL        |   |       OWNER PORTAL VIEW       |   |
|   |  - Report Upload Panels               |   |  - Custom Performance KPI     |   |
|   |  - Interactive Validation / Staging   |   |  - Target Attainment Metrics  |   |
|   |  - Master Dashboard / Regional Map    |   |  - Growth & History Log       |   |
|   +---------------------------------------+   +-------------------------------+   |
+-----------------------------------------------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                              SYSTEM SERVICE LAYER                                 |
|                                                                                   |
|   +--------------------------+  +--------------------------+  +----------------+  |
|   |     INGESTION ENGINE     |  |   RECONCILIATION ENGINE  |  |   KPI ENGINE   |  |
|   |  - Excel/CSV Parser      |  |  - Owner Identity Delta  |  |  - Attainment  |  |
|   |  - Structural Validator  |  |  - Manual Overrides/Maps |  |  - Active Rate |  |
|   |  - Deduplicator          |  |  - Mapping Approvals     |  |  - Commissions |  |
|   +--------------------------+  +--------------------------+  +----------------+  |
|                                                                                   |
|   +----------------------------------------------------------------------------+  |
|   |                           ARCHIVAL & LEDGER MODULE                         |  |
|   |   - File Integrity Hash Store                                              |  |
|   |   - Immutable Audit Logs & Execution Timestamps                            |  |
|   +----------------------------------------------------------------------------+  |
+-----------------------------------------------------------------------------------+
```

---

## 7. Data Flow Diagram (DFD)

The diagram below outlines how raw data uploaded by the Admin transitions into validated database records, historical statistics, and dashboard updates.

```
 [Admin User]
      |
      | 1. Uploads spreadsheet (Excel/CSV)
      v
 [File Ingestion Engine]
      |
      | 2. Checks structure, schema & file deduplication
      v
      +-- (If Invalid) --> [Trigger Error Alert & Terminate]
      |
      | 3. (If Valid) Extract unique Wakala IDs & Owner Names
      v
 [Reconciliation Engine] <---- Reads Existing ---- [Database Owners]
      |
      | 4. Compares Names & IDs, detects New/Changed Owners
      v
 [Admin Interim Review Panel]
      |
      | 5. Reviews Delta List (Confirms and/or Maps overrides)
      v
 [DB Transaction Safe-Write]
      |
      +---> [A] Updates Owner Records & Transactions Tables
      +---> [B] Appends File Info to Raw File Archival Ledger
      |
      v
 [KPI Aggregation Engine] <--- Sums Volume & Counts Stations
      |
      | 6. Recalculates month-to-date benchmarks
      v
 [Dashboard Analytics Store] ---> Updates Real-Time Dashboards for [Admin] & [Owner]
```

---

## 8. User Workflows

### 8.1 Admin (Master Agent) Upload & Reconciliation Workflow
```
+-----------------------------------------------------------------------+
|  STEP 1: Admin logs in, navigates to "Upload Reports" page            |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 2: Selects Report Type (Monthly Target vs. Daily MGT)           |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 3: Drags and drops or browses to select the Excel or CSV file   |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 4: Ingestion engine runs validation checks (results displayed)  |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 5: System extracts Wakala Owners and isolates new/changed ones  |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 6: Admin inspects preview table, delta list, and approves mappings|
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 7: Admin clicks "Analyze & Import Report"                       |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 8: System runs multi-step safe-write transaction and archives   |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 9: KPI engine updates, Dashboards refresh, ledger persists success|
+-----------------------------------------------------------------------+
```

### 8.2 Wakala Owner Performance Self-Service Workflow
```
+-----------------------------------------------------------------------+
|  STEP 1: Wakala Owner logs into the Agent Portal                      |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 2: System routes directly to Standalone Owner Details View      |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 3: Owner views customized Target Attainment & Active Wakala KPIs|
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 4: Owner reviews regional sub-stations and commission breakdown  |
+-----------------------------------------------------------------------+
                                   |
                                   v
+-----------------------------------------------------------------------+
|  STEP 5: Owner signs out securely (data remains isolated from others) |
+-----------------------------------------------------------------------+
```

---
**End of Business Requirements Document (BRD)**
