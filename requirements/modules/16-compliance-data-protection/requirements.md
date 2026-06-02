# Module 16 -- Compliance, Data Protection & Handover: Detailed Requirements

---

## DP-001: Swiss Data Protection (nDSG/revDSG) Compliance Framework

| Field | Value |
|-------|-------|
| **ID** | DP-001 |
| **Title** | Swiss Data Protection (nDSG/revDSG) Compliance Framework |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | CORE-006 (File Storage), AUTH-006 (Audit Trail), CRM-001 |
| **Tags** | `compliance`, `data-protection`, `ndsg`, `revdsg`, `privacy`, `swiss-law` |

### Description

The platform shall process personal data (of employees, customers, contacts, and third parties, including photos, chat, and voice recordings) in accordance with the revised Swiss Federal Act on Data Protection (revDSG/nDSG, in force since 1 September 2023) and, where applicable to EU data subjects, the GDPR. Processing must satisfy the principles of lawfulness, good faith, proportionality, purpose limitation, data minimisation, accuracy, transparency, and data security. Data residency must be Switzerland or the EU/EEA (or a country with adequate protection).

### Actors

- **Data Protection Officer / Admin** -- oversees compliance, maintains documentation.
- **System** -- enforces technical and organisational measures.
- **Auditor / FDPIC** -- may review compliance evidence.

### Acceptance Criteria

- [ ] A privacy notice (Datenschutzerklärung) is available in DE/FR/IT/EN and linked from all data-capture surfaces (web, mobile, website widget).
- [ ] Every personal-data field has a documented lawful basis and purpose (recorded in the ROPA, DP-005).
- [ ] Personal data is stored only in Switzerland or the EU/EEA; the storage region is configurable and verifiable (links to INT-007 cloud storage residency).
- [ ] Voice recordings (Module 07) and chat content (MOB-010) are processed with explicit notice and are subject to the retention/erasure rules (DP-004).
- [ ] Data minimisation is enforced: optional fields are clearly optional and not required for service delivery.
- [ ] All access to personal data is authenticated, authorised (Module 02), and audit-logged (AUTH-006).
- [ ] A compliance checklist mapping each requirement to its implementing control is maintained and reviewable.

---

## DP-002: Consent & Communication Preference Enforcement

| Field | Value |
|-------|-------|
| **ID** | DP-002 |
| **Title** | Consent & Communication Preference Enforcement |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | CRM-013, NOTIF-005, NOTIF-002, NOTIF-003 |
| **Tags** | `compliance`, `consent`, `opt-in`, `opt-out`, `marketing` |

### Description

The platform shall capture, store, and enforce communication consent per customer and per channel (email, WhatsApp, SMS). Marketing/newsletter communication requires opt-in; transactional communication (e.g., appointment confirmations, invoices) is permitted on the basis of contract performance. Opt-out must be effortless and honoured platform-wide.

### Acceptance Criteria

- [ ] Consent is recorded per customer and per channel with timestamp, source, and scope (transactional vs marketing).
- [ ] Opt-in status is owned by Module 03 (CRM-013) and is the single source of truth; Module 13 (Notifications) reads and enforces it.
- [ ] Every marketing email includes a one-click unsubscribe link; unsubscribe updates CRM opt-in status within 24 hours (aligns with NOTIF-002 / CRM-013).
- [ ] WhatsApp marketing messages are sent only to opted-in recipients and comply with WhatsApp Business policy.
- [ ] Transactional notifications are not blocked by marketing opt-out, and this distinction is documented.
- [ ] A per-customer consent history is viewable and exportable.

---

## DP-003: Data Subject Rights (Access, Rectification, Erasure, Portability)

| Field | Value |
|-------|-------|
| **ID** | DP-003 |
| **Title** | Data Subject Rights |
| **Priority** | High |
| **Complexity** | High |
| **Dependencies** | DP-001, DP-004, CORE-006, AUTH-006 |
| **Tags** | `compliance`, `data-subject-rights`, `erasure`, `portability`, `access` |

### Description

The platform shall support fulfilment of data subject requests (DSRs): right of access (data export), rectification, erasure ("right to be forgotten"), restriction of processing, and data portability. Requests must be traceable, time-bounded, and reconciled with statutory retention obligations (DP-004).

### Acceptance Criteria

- [ ] An admin can generate a complete export of all personal data held about a given data subject (customer, contact, or employee) across all modules, in a machine-readable format (JSON/CSV) and a human-readable PDF.
- [ ] Rectification updates propagate to all modules referencing the record (via the event bus / denormalised-data update flows).
- [ ] An erasure request triggers deletion or irreversible anonymisation of personal data not subject to statutory retention; data under retention (e.g., issued invoices) is locked and purged automatically at retention expiry (DP-004).
- [ ] Erasure cascades to derived/cached data: photos, voice recordings, chat messages, notification history, and offline mobile caches.
- [ ] Each DSR is logged with type, requester, scope, actions taken, retained-data exceptions, and completion date.
- [ ] DSRs are completed within the statutory/contractual deadline (default target: 30 days); overdue requests are flagged.
- [ ] A `customer.gdpr_deletion` (or equivalent) event is published so dependent modules (e.g., Module 13) purge their copies.

---

## DP-004: Data Retention & Deletion Policy

| Field | Value |
|-------|-------|
| **ID** | DP-004 |
| **Title** | Data Retention & Deletion Policy |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | ACC-009, CORE-007 (Background Jobs), DP-001 |
| **Tags** | `compliance`, `retention`, `deletion`, `lifecycle` |

### Description

The platform shall apply configurable, per-data-class retention periods and automatically delete or anonymise data when its retention period expires, balancing statutory retention (business/accounting documents: 10 years per OR Art. 958f) against the data-protection principle of minimisation.

### Acceptance Criteria

- [ ] A retention schedule defines a retention period and disposition (delete / anonymise) per data class (accounting documents, quotations, contracts, work reports, photos, voice recordings, chat, notification history, audit logs).
- [ ] Accounting and business documents are retained for at least 10 years and cannot be deleted before expiry (consistent with ACC-009).
- [ ] Audit logs (AUTH-006) are retained for their configured period (default 2 years) and notification history (NOTIF-009) per its policy.
- [ ] A scheduled background job applies dispositions when retention expires; each disposition is logged.
- [ ] Retention rules are configurable by an administrator without code changes.
- [ ] Retention and erasure (DP-003) interact correctly: an erasure request does not remove records still under statutory retention but schedules them for purge at expiry.

---

## DP-005: Records of Processing & Data Processing Agreements

| Field | Value |
|-------|-------|
| **ID** | DP-005 |
| **Title** | Records of Processing & Data Processing Agreements |
| **Priority** | Medium |
| **Complexity** | Medium |
| **Dependencies** | DP-001, INT-004, INT-005, INT-006, INT-007, INT-003, AI-003 |
| **Tags** | `compliance`, `ropa`, `dpa`, `auftragsbearbeitung`, `sub-processors` |

### Description

The contractor shall produce and maintain a Record of Processing Activities (Verzeichnis der Bearbeitungstätigkeiten / ROPA) and ensure a data processing agreement (Auftragsbearbeitungsvertrag) is in place for every sub-processor that handles personal data on the client's behalf.

### Acceptance Criteria

- [ ] A ROPA document lists each processing activity: purpose, data categories, data subjects, recipients, retention, and security measures.
- [ ] A sub-processor register lists all third parties processing personal data: cloud storage (INT-007), OCR (INT-006), speech-to-text (AI-003), WhatsApp BSP (INT-004), email provider (INT-005), and bank (INT-003).
- [ ] For each sub-processor, a DPA (or equivalent) and the processing location (CH/EU/EEA or adequacy) are recorded.
- [ ] The ROPA and sub-processor register are versioned and updated whenever a new integration is added.

---

## DP-006: Security Baseline & Breach Notification

| Field | Value |
|-------|-------|
| **ID** | DP-006 |
| **Title** | Security Baseline & Breach Notification |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | AUTH-004, AUTH-006, MOB-012, CORE-006 |
| **Tags** | `compliance`, `security`, `encryption`, `breach-notification` |

### Description

The platform shall implement a documented security baseline (technical and organisational measures) and a breach detection and notification process consistent with revDSG obligations to notify the FDPIC and affected persons of breaches likely to result in high risk.

### Acceptance Criteria

- [ ] All data in transit is encrypted with TLS 1.2+; all data at rest (databases, file storage, mobile offline cache per MOB-012) is encrypted.
- [ ] Access to personal data follows least privilege via RBAC (Module 02) and is fully audit-logged (AUTH-006).
- [ ] Secrets/credentials are stored in secure configuration (vault/env), never in source (consistent with Module 14).
- [ ] Security-relevant events (failed logins, permission denials, exports, bulk deletions) are logged and monitorable.
- [ ] A documented breach-response runbook defines detection, assessment, FDPIC notification, and data-subject notification steps with target timelines.
- [ ] Personal data is not written to application logs in plaintext (consistent with NOTIF-008/design security notes).

---

## OSS-001: Third-Party & Open-Source Component Disclosure (SBOM)

| Field | Value |
|-------|-------|
| **ID** | OSS-001 |
| **Title** | Third-Party & Open-Source Component Disclosure (SBOM) |
| **Priority** | Medium |
| **Complexity** | Low |
| **Dependencies** | SRC-001 |
| **Tags** | `compliance`, `open-source`, `licences`, `sbom`, `third-party` |

### Description

Per contract Additional Provision §2, the contractor shall disclose all third-party and open-source components before use, stating the applicable licence terms and any restrictions. This is delivered as a maintained Software Bill of Materials (SBOM).

### Acceptance Criteria

- [ ] An SBOM lists every third-party / open-source component (name, version, licence, purpose) for backend, frontend, and mobile.
- [ ] Each component's licence is identified, and any copyleft or usage restrictions are flagged for client review.
- [ ] The SBOM is generated/updated as part of the build/release process (not hand-maintained only).
- [ ] No component with a licence incompatible with the client's intended use (use, modify, sublicense, hand over to third parties — see SRC-001) is introduced without explicit written approval.
- [ ] The current SBOM is included in each release/handover package.

---

## SRC-001: Source Code, IP Rights & Handover Package

| Field | Value |
|-------|-------|
| **ID** | SRC-001 |
| **Title** | Source Code, IP Rights & Handover Package |
| **Priority** | High |
| **Complexity** | Medium |
| **Dependencies** | OSS-001, all modules |
| **Tags** | `compliance`, `handover`, `ip`, `source-code`, `acceptance` |

### Description

Per contract Additional Provision §1, upon full payment the contractor shall grant the client all rights required to use, reproduce, edit, further develop, maintain, and hand over to third parties the individually created work results — including source code, configurations, data models, scripts, interface descriptions, and technical documentation. This requirement defines the handover deliverable that evidences that transfer.

### Actors

- **Contractor** -- assembles and delivers the handover package.
- **Client** -- receives rights and artefacts; signs acceptance.

### Acceptance Criteria

- [ ] A handover package is produced containing: complete source code (all repositories), build/deployment scripts and configuration, database schema and migrations, data models, interface/API descriptions, and technical documentation (architecture, per-module design docs).
- [ ] The package includes the current SBOM (OSS-001) and the ROPA/sub-processor register (DP-005).
- [ ] A written rights-transfer statement confirms the client's rights to use, reproduce, edit, further develop, maintain, and transfer the work results upon full payment.
- [ ] Source-code access is transferred to a client-controlled repository/account.
- [ ] The handover package is verifiable: a clean environment can be built and deployed from the delivered artefacts following the documentation.
- [ ] Handover acceptance is recorded (signed protocol), analogous to the migration protocol (MIG-009).
