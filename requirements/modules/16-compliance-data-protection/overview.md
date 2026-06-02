# Module 16 -- Compliance, Data Protection & Handover

| Field | Value |
|-------|-------|
| Module ID | MOD-16 |
| Priority | Foundation (cross-cutting) |
| Status | Draft |

## 1. Purpose

This module captures the cross-cutting compliance, data-protection, and contractual-handover obligations that apply across the entire MB Boiler & Heizung AG platform. It exists to make the contract's "Additional provisions" (source-code rights, third-party / open-source disclosure, and Swiss data-protection compliance) explicit, testable deliverables rather than implicit assumptions scattered across other modules.

Unlike feature modules (01-15), this module does not own a single screen or service. It defines requirements that constrain, audit, and certify the behaviour of every other module, and it produces contractual artefacts required for acceptance and handover.

## 2. Scope

### In Scope

- **Swiss Data Protection (nDSG / revDSG) compliance** -- lawful processing, data minimisation, transparency, and Swiss/EU data residency across all modules that process personal data (employees, customers, contacts, photos, chat, voice).
- **Consent & communication preferences** -- consistent enforcement of opt-in/opt-out for email, WhatsApp, and newsletters, owned at the CRM level (Module 03) and respected by Notifications (Module 13).
- **Data subject rights** -- access, rectification, erasure, restriction, and portability workflows spanning all data stores.
- **Data retention & deletion** -- per-data-class retention rules that reconcile statutory accounting retention (10 years, OR Art. 958f) with data-protection minimisation.
- **Records of Processing & Data Processing Agreements** -- ROPA (Verzeichnis der Bearbeitungstätigkeiten) and processor agreements (Auftragsbearbeitung) for every sub-processor (cloud storage, STT/OCR, WhatsApp BSP, email provider, bank).
- **Security baseline** -- encryption in transit and at rest, access control, and breach detection/notification.
- **Third-party & open-source disclosure** -- a maintained Software Bill of Materials (SBOM) with licences and restrictions, disclosed before use.
- **Source code & IP handover** -- the deliverable package transferring all rights and artefacts to the client upon full payment.

### Out of Scope

- **Tax, audit, or commercial-law responsibility** for annual financial statements, balance-sheet preparation, or closing entries (excluded per contract §10.3). This module covers data protection and software-handover compliance, not financial-statement assurance.
- **Legal advice.** This module operationalises documented obligations; it does not replace the client's own legal/DPO counsel.

## 3. Boundaries

- **Does NOT own customer master data or opt-in flags.** Those live in Module 03 (CRM & Asset Management). This module defines the rules they must satisfy.
- **Does NOT dispatch notifications.** It defines the consent constraints that Module 13 (Notifications) must enforce.
- **Does NOT store documents.** It defines retention/erasure rules applied by Module 01 (Core Platform) file storage and Module 11 (Accounting) archive.

## 4. Requirements Summary

| Req ID | Title | Priority | Complexity |
|--------|-------|----------|------------|
| DP-001 | Swiss Data Protection (nDSG/revDSG) Compliance Framework | High | High |
| DP-002 | Consent & Communication Preference Enforcement | High | Medium |
| DP-003 | Data Subject Rights (Access, Rectification, Erasure, Portability) | High | High |
| DP-004 | Data Retention & Deletion Policy | High | Medium |
| DP-005 | Records of Processing & Data Processing Agreements | Medium | Medium |
| DP-006 | Security Baseline & Breach Notification | High | Medium |
| OSS-001 | Third-Party & Open-Source Component Disclosure (SBOM) | Medium | Low |
| SRC-001 | Source Code, IP Rights & Handover Package | High | Medium |

## 5. Key Dependencies

| Module | Relationship |
|--------|--------------|
| 01 - Core Platform | File storage, audit log, encryption, background jobs that execute retention/erasure |
| 02 - Authentication & User Management | Access control, audit trail (AUTH-006), session management |
| 03 - CRM & Asset Management | Customer/contact personal data, opt-in/opt-out ownership (CRM-013) |
| 11 - Accounting | Statutory 10-year retention of business documents (ACC-009) |
| 13 - Notifications | Consent enforcement, GDPR-respecting dispatch and retention |
| 14 - Integrations | Sub-processors (cloud storage, OCR, STT, WhatsApp BSP, email, bank) requiring DPAs and Swiss/EU residency |

## 6. Mapping to Contract

| Contract clause (Additional provisions) | Covered by |
|-----------------------------------------|------------|
| 1. Rights to source code | SRC-001 |
| 2. Third-party software / open source | OSS-001 |
| 3. Data protection / processing on behalf | DP-001 … DP-006 |
