
# Module 07: AI Assistant

## Module Metadata

| Field              | Value                                      |
|--------------------|--------------------------------------------|
| Module ID          | MOD-07                                     |
| Module Name        | AI Assistant                               |
| SOW Reference      | Section 6                                  |
| Status             | Draft                                      |
| Owner              | TBD                                        |
| Last Updated       | 2026-03-29                                 |
| Platform           | Web App, Mobile App                        |

---

## 1. Purpose

The AI Assistant module provides a voice-based assistant that supports field technicians and back-office staff with data entry, document creation, and general application interaction. It leverages speech-to-text (STT), natural language processing (NLP), and intent recognition to convert spoken input into structured data and actionable system commands.

The assistant is designed for hands-free operation in the field, enabling technicians to create orders, dictate service reports, capture customer addresses, and trigger application functions using natural language -- all while working on-site.

---

## 2. Scope

### 2.1 In Scope

- **Voice-Supported Order Creation** -- Technicians can create new service orders by speaking order details (customer, location, issue description, urgency).
- **Spoken Report Recording** -- Field technicians dictate service/inspection reports that are recorded, transcribed, and stored against the relevant work order.
- **Speech-to-Text Conversion** -- Real-time and batch conversion of spoken input to text using integrated STT services (e.g., OpenAI Whisper, Google Cloud Speech-to-Text).
- **Structured Data Extraction** -- NLP pipeline extracts entities (customer names, addresses, part numbers, dates, quantities) and intents from transcribed text.
- **Template-Based Document Creation from Voice** -- Voice-dictated content is merged with document templates (quotations, reports, cover letters) to produce formatted documents.
- **Voice-Based Customer Address Capture** -- Spoken addresses are parsed, validated against postal databases, and stored in the CRM.
- **Voice-Supported Application Functions** -- Users can navigate the app, search records, update statuses, and trigger workflows using voice commands.
- **Multi-Language Support** -- The assistant supports multiple languages as defined in the annex "Language Scope" (minimum: German, French, Italian, English).

### 2.2 Out of Scope

- The AI Assistant does **not replace** manual data entry. All voice-captured data can be reviewed and edited before submission.
- The AI Assistant does **not make business decisions** (e.g., pricing, scheduling assignments, approval workflows). It only captures and structures input.
- Training custom ML models is out of scope; the system integrates with third-party STT/NLP services.
- Real-time voice calls or telephony integration are not part of this module.
- The AI Assistant does not perform optical character recognition (OCR) on physical documents -- that belongs to a separate digitization workflow if applicable.

---

## 3. Key Actors

| Actor               | Role                                                        |
|----------------------|-------------------------------------------------------------|
| Field Technician     | Primary user; uses voice assistant on mobile app on-site    |
| Back-Office Staff    | Uses voice assistant on web app for order/document creation  |
| Dispatcher           | Uses voice commands for quick order creation and lookup      |
| System Administrator | Configures language settings, STT provider, NLP parameters   |

---

## 4. Requirements Summary

| Req ID  | Title                                          | Priority | Complexity |
|---------|-------------------------------------------------|----------|------------|
| AI-001  | Voice-Supported Order Creation                  | High     | High       |
| AI-002  | Spoken Report Recording & Transcription         | High     | High       |
| AI-003  | Speech-to-Text Conversion                       | High     | Medium     |
| AI-004  | Structured Data Extraction from Speech          | High     | High       |
| AI-005  | Template-Based Document Creation from Voice     | Medium   | Medium     |
| AI-006  | Voice-Based Address Capture                     | Medium   | Medium     |
| AI-007  | Voice-Supported Application Functions           | Medium   | High       |
| AI-008  | Multi-Language Support                          | Medium   | Medium     |
| AI-009  | Continuous Learning & Accuracy Improvement      | Low      | High       |

---

## 5. Dependencies

| Dependency                        | Direction | Description                                                          |
|-----------------------------------|-----------|----------------------------------------------------------------------|
| MOD-03: CRM & Customer Management | Outbound  | AI-extracted customer data is written to CRM records                  |
| MOD-08: Quotations & Orders       | Outbound  | Voice-created orders are submitted to the order processing module     |
| MOD-09: Document Templates        | Outbound  | Voice-dictated content is merged with templates for document output   |
| MOD-05: Field Deployment Planning | Outbound  | Voice commands can trigger scheduling lookups and updates             |
| MOD-06: Mobile Technician App     | Inbound   | Mobile app provides the primary voice input interface                 |

---

## 6. Key Assumptions

1. Users will have access to devices with functional microphones (smartphones, tablets, headsets).
2. A reliable internet connection is available for cloud-based STT processing. Offline fallback is limited to audio recording for later processing.
3. Third-party STT/NLP services (OpenAI Whisper API, Google Cloud Speech-to-Text, or equivalent) are commercially available and licensed.
4. Swiss German dialect support is desirable but not guaranteed by STT providers; standard High German (Hochdeutsch) is the baseline.
5. All voice-captured data passes through a confirmation step before committing to the database.

---

## 7. Risks

| Risk                                                    | Impact | Likelihood | Mitigation                                                       |
|---------------------------------------------------------|--------|------------|------------------------------------------------------------------|
| Low STT accuracy for Swiss German dialect               | High   | High       | Default to High German; allow manual correction; fine-tune models |
| Background noise on construction/HVAC sites             | High   | High       | Noise cancellation preprocessing; push-to-talk mode              |
| Incorrect entity extraction leading to data errors      | Medium | Medium     | Mandatory confirmation step; highlight low-confidence fields     |
| STT provider API outages                                | Medium | Low        | Queue audio for retry; offline recording capability              |
| Privacy concerns with voice data transmission           | High   | Low        | On-device preprocessing where possible; data retention policies  |
