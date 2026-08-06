# Business Entities Specification
## Tanzanian Wakala Management & KPI Performance System

**Document Version:** 1.0  
**Date:** July 6, 2026  
**Author:** Senior Business Systems Analyst  
**Status:** Under Review / Approved for Database Schema Design  

This document defines every business entity required to implement the Tanzanian Wakala Management & KPI Performance System, based on the approved Business Requirements Document (BRD). 

---

## 1. User
* **Purpose:** Manages authentication, system access rights, and security scopes.
* **Description:** Represents any individual authorized to log into the web application. Determines whether they view the system-wide executive dashboard (Admin) or are restricted to their specific personal portfolio (Owner).
* **Main Attributes:**
  * `UserID` (Unique system-generated identifier)
  * `Email` (Used as login username, e.g., `executive@hasidadi.com` or `abubakar.khalid@hasidadi.com`)
  * `PasswordHash` (Securely hashed credential string)
  * `Role` (Enum: `Admin`, `Owner`)
  * `CreatedAt` (Timestamp of account creation)
  * `LastLoginAt` (Timestamp of last successful authentication)
  * `IsActive` (Boolean flag controlling access status)
* **Relationships:**
  * One-to-One with **Owner** (An Owner entity links directly to a User account for Portal access; Admins do not require an Owner profile linkage).

---

## 2. Owner (Wakala Owner)
* **Purpose:** Represents the primary commercial partners (investors/franchisees) who own and coordinate multiple transactional agent locations (Wakala).
* **Description:** Represents the human entity who manages a fleet of sub-agents (Wakala numbers) across one or more regions of Tanzania. All financial targets are established at this level, and KPI performances are aggregated here.
* **Main Attributes:**
  * `OwnerID` (Unique business key)
  * `UserID` (Nullable foreign key linking to a security credential record)
  * `OwnerName` (Full name, e.g., "Abubakar Khalid", "Fatma Hassan")
  * `PrimaryContactPhone` (Tanzanian format phone number, e.g., `+255...`)
  * `Region` (Primary operating territory, e.g., "Dar es Salaam", "Mwanza", "Arusha")
  * `RiskLevel` (Enum: `Low`, `Medium`, `High` – based on liquidity or float violations)
  * `DateJoined` (Timestamp when contract became active)
* **Relationships:**
  * One-to-Many with **Wakala** (An Owner can own and manage multiple sub-agent stations).
  * One-to-Many with **MonthlyKPITarget** (An Owner receives targets month-over-month).
  * One-to-Many with **OwnerReconciliationStage** (An Owner can be part of staging mappings during file ingestion).
  * One-to-One with **PerformanceSummary** (An Owner has one compiled month-to-date performance dashboard record).

---

## 3. Wakala (Agent Station)
* **Purpose:** Represents the actual physical point-of-sale station or SIM card performing transactions.
* **Description:** The granular operational unit in Tanzania's mobile money system. Transactions are recorded under specific Wakala IDs (e.g., `WK-9921`).
* **Main Attributes:**
  * `WakalaID` (Unique physical agent ID string from Mobile Network Operators)
  * `OwnerID` (Foreign key linking back to the designated Owner)
  * `StationName` (Descriptive terminal name or sub-location, e.g., "Posta Terminal A")
  * `IsActive` (Boolean indicating physical operating status)
  * `DateRegistered` (Date of SIM activation under the Master Agent)
* **Relationships:**
  * Many-to-One with **Owner** (Multiple Wakala numbers are pooled under a single Owner).
  * One-to-Many with **DailyTransactionRecord** (A Wakala station generates transactional records daily).

---

## 4. MonthlyKPITarget
* **Purpose:** Holds the target parameters that define success for an Owner during a specific calendar month.
* **Description:** Establishes the commercial goals against which daily performance is calculated. Created by the Admin uploading a Monthly KPI Target Report once a month.
* **Main Attributes:**
  * `TargetID` (Unique sequence identifier)
  * `OwnerID` (Foreign key linking to the responsible Owner)
  * `ReportingMonth` (String representation, e.g., "2026-07")
  * `MonthlyVolumeTarget` (Decimal, representing target transactional volume in TZS)
  * `MinActiveWakalaTarget` (Integer, specifying how many Wakala stations must remain active daily)
  * `TargetCommissionYield` (Decimal, target earned revenue in TZS)
  * `CreatedBy` (Foreign key of the Admin User who uploaded the target)
  * `CreatedAt` (Audit timestamp)
* **Relationships:**
  * Many-to-One with **Owner** (An Owner receives one Target record per calendar month).
  * Many-to-One with **User (Admin)** (Identifies the administrator responsible for setting the benchmark).

---

## 5. FileUploadArchive (Report History)
* **Purpose:** Serves as the historical archive and source of truth for raw uploaded files.
* **Description:** Represents a metadata ledger tracking every physical file uploaded into the Dodoma server system. This serves compliance, auditing, and backup purposes.
* **Main Attributes:**
  * `UploadID` (Unique system-generated archive code, e.g., `REP-9812`)
  * `FileName` (Original name of spreadsheet, e.g., `Daily_MGT_Report_01_July_2026.csv`)
  * `ReportType` (Enum: `Monthly KPI Target`, `Daily MGT`)
  * `UploadedBy` (String or UserID representing the administrative actor)
  * `UploadTimestamp` (Exact datetime of upload ingestion)
  * `FileSize` (String or integer size, e.g., `2.25 MB` / `2359124 bytes`)
  * `FileHash` (SHA-256 hash used to prevent duplicate uploads)
  * `Status` (Enum: `Pending Review`, `Importing`, `Success`, `Failed`)
  * `TargetDate` (The operational date or month the file represents, e.g., `2026-07-01`)
* **Relationships:**
  * One-to-Many with **DailyTransactionRecord** (An upload of type "Daily MGT" is unpacked into thousands of transaction rows).
  * One-to-Many with **OwnerReconciliationStage** (An upload triggers interim staging rows for delta inspection).
  * One-to-Many with **AuditLog** (Generates trace entries upon status changes).

---

## 6. DailyTransactionRecord
* **Purpose:** Records the granular daily operations metrics of each individual Wakala agent.
* **Description:** Unpacked transaction lines derived from the validated Daily MGT Report. Contains primary metrics that feed the calculation engine.
* **Main Attributes:**
  * `TransactionRecordID` (Unique identifier)
  * `UploadID` (Foreign key linking to the source FileUploadArchive)
  * `WakalaID` (Identifier of the reporting station, mapping back to the Wakala entity)
  * `OwnerID` (Foreign key mapping directly to the owner at time of transaction)
  * `ReportingDate` (Date of the transactions, e.g., `2026-07-01`)
  * `CashInVolume` (Decimal, cash-in value in TZS)
  * `CashOutVolume` (Decimal, cash-out value in TZS)
  * `CommissionEarned` (Decimal, commission generated in TZS)
  * `IsActiveDaily` (Boolean, indicating if the Wakala terminal logged activity on this date)
* **Relationships:**
  * Many-to-One with **FileUploadArchive** (Links thousands of records to a single upload source).
  * Many-to-One with **Wakala** (Identifies the physical agent station).
  * Many-to-One with **Owner** (Determines whose performance ledger is credited).

---

## 7. OwnerReconciliationStage (The Interim Delta Stage)
* **Purpose:** An intermediate staging sandbox used by the Admin to review, map, and approve newly discovered identities or modifications before database writes occur.
* **Description:** Temporary entity populated during the "validation" phase of an upload. Isolates entries from the file where the Wakala ID or Owner Name doesn't align perfectly with existing database master records.
* **Main Attributes:**
  * `StageID` (Unique sequence key)
  * `UploadID` (Foreign key linking to the active FileUploadArchive)
  * `ParsedWakalaID` (Wakala ID string found in the file)
  * `ParsedOwnerName` (Owner Name string found in the file)
  * `ParsedRegion` (Region string found in the file)
  * `DeltaType` (Enum: `New Owner`, `Changed Name`, `Unmapped Region`, `Outlier Value`)
  * `ProposedResolution` (Enum: `Create New Owner`, `Map To Existing`, `Clamp Value`, `Flag As Unknown`)
  * `MappedOwnerID` (Nullable foreign key linking to an existing Owner if resolved by mapping)
  * `IsApproved` (Boolean, indicating if the Admin has cleared this delta)
* **Relationships:**
  * Many-to-One with **FileUploadArchive** (Isolates deltas occurring in a single upload session).
  * Many-to-One with **Owner** (Optionally references an existing Owner for mapping/resolution).

---

## 8. PerformanceSummary
* **Purpose:** Caches aggregated, high-speed Key Performance Indicators for rapid dashboard rendering.
* **Description:** Since reading raw transactions for MTD (Month-To-Date) charts is expensive, this entity caches daily recalculated KPI states for each Owner and the overall Master Agent portfolio.
* **Main Attributes:**
  * `PerformanceID` (Unique identifier)
  * `OwnerID` (Nullable foreign key – null represents the company-wide aggregate, non-null represents individual Owner)
  * `ReportingMonth` (String representation, e.g., "2026-07")
  * `MonthToDateVolume` (Decimal, accumulated Cash-In + Cash-Out volume in TZS)
  * `TargetAttainmentRate` (Decimal, calculated percentage against MonthlyKPITarget)
  * `ActiveWakalaAverage` (Decimal, average daily active terminals during the month)
  * `ActiveWakalaRate` (Decimal, percentage of active stations against target)
  * `AccumulatedCommission` (Decimal, total earnings in TZS)
  * `LastRecalculatedAt` (Timestamp of last update)
* **Relationships:**
  * Many-to-One with **Owner** (Links cached metrics to the owner or company portfolio).

---

## 9. Notification (Action Alert)
* **Purpose:** Displays operational alerts, compliance warnings, and system events to the Admin and Owners.
* **Description:** Represents dynamic status bulletins, such as a severe fall in active stations, unmapped agent IDs, or the successful completion of a monthly import.
* **Main Attributes:**
  * `NotificationID` (Unique system identifier)
  * `RecipientUserID` (Foreign key linking to the User who should receive this notification)
  * `Type` (Enum: `Import Success`, `Validation Error`, `Unmapped Wakala Warning`, `KPI Threshold Alert`)
  * `Title` (Short descriptive heading)
  * `Message` (Detailed alert explanation text)
  * `IsRead` (Boolean status tracker)
  * `CreatedAt` (Timestamp of alert generation)
* **Relationships:**
  * Many-to-One with **User** (Directs targeted alerts to specific User accounts).

---

## 10. AuditLog (System Trace Log)
* **Purpose:** Immutably records administrative and critical database activities for strict oversight.
* **Description:** Generates forensic track logs of who did what, and when. Highly critical for verifying Master Agent auditing, approval of unmapped owners, and login history.
* **Main Attributes:**
  * `LogID` (Unique auto-increment sequence)
  * `UserID` (Foreign key pointing to the acting User, e.g., Admin)
  * `Action` (String representation of activity, e.g., "Approved Reconciliation Map", "User Login", "Manual Target Alteration")
  * `EntityImpacted` (Name of table/module affected, e.g., "OwnerReconciliationStage", "MonthlyKPITarget")
  * `Details` (JSON or text block documenting values pre- and post-action)
  * `IPAddress` (String recording client container IP)
  * `Timestamp` (Datetime when transaction occurred)
* **Relationships:**
  * Many-to-One with **User** (Identifies the human actor responsible for the audit trail entry).

---
**End of Business Entities Specification Document**
