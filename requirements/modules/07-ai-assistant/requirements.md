# Module 07: AI Assistant -- Detailed Requirements

---

## AI-001: Voice-Supported Order Creation

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-001                                                                                         |
| **Title**         | Voice-Supported Order Creation                                                                 |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `voice`, `order`, `field-service`, `mobile`, `stt`, `nlp`                                      |

### Description

The system shall allow users to create new service orders by dictating order details via the voice assistant. The assistant captures spoken input, transcribes it, extracts structured fields (customer, location, issue description, urgency, requested date), presents a confirmation summary, and submits the order to the order processing module upon user approval.

### Actors

- Field Technician (primary)
- Dispatcher
- Back-Office Staff

### Preconditions

1. User is authenticated and has permission to create orders.
2. Microphone access is granted on the device.
3. Internet connection is available for STT processing (or audio is queued for later processing).
4. CRM module is accessible for customer lookup.

### Flow

1. User activates the voice assistant via a dedicated button or voice wake command.
2. User speaks order details in natural language (e.g., "Neuer Auftrag fuer Herr Mueller, Bahnhofstrasse 12, Zuerich. Heizung defekt, dringend, bitte morgen frueh.").
3. System records audio and streams to STT service for real-time transcription.
4. NLP pipeline processes the transcript to extract entities:
   - Customer name --> CRM lookup
   - Address --> Address validation
   - Issue description --> Free text
   - Urgency --> Enum (Normal, Urgent, Emergency)
   - Requested date --> Date parsing
5. System presents a structured confirmation screen showing all extracted fields with confidence indicators.
6. User reviews, corrects if necessary (voice or manual), and confirms.
7. System creates the order in Module 08 (Quotations & Order Processing).
8. System provides audio and visual confirmation of successful order creation.

### Postconditions

1. A new order record exists in the system with all captured fields.
2. The order is linked to the correct customer record in CRM.
3. The original audio recording and transcript are stored as attachments to the order.
4. An audit log entry records the voice-based creation.

### Acceptance Criteria

- [ ] User can initiate order creation via voice command on mobile and web.
- [ ] STT transcription accuracy is >= 90% for standard High German in quiet environments.
- [ ] Entity extraction correctly identifies customer name, address, and urgency in >= 85% of test cases.
- [ ] CRM customer lookup returns matching candidates with fuzzy matching.
- [ ] User can correct any extracted field before submission via voice or touch/keyboard.
- [ ] Order is successfully created in Module 08 with all fields populated.
- [ ] Audio recording is stored and retrievable from the order record.
- [ ] System handles STT service unavailability by recording audio for later processing.

### Dependencies

- MOD-03: CRM & Customer Management (customer lookup)
- MOD-08: Quotations & Order Processing (order creation)
- AI-003: Speech-to-Text Conversion (STT engine)
- AI-004: Structured Data Extraction (NLP pipeline)

---

## AI-002: Spoken Report Recording & Transcription

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-002                                                                                         |
| **Title**         | Spoken Report Recording & Transcription                                                        |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `voice`, `report`, `transcription`, `field-service`, `mobile`                                  |

### Description

The system shall allow field technicians to dictate service reports, inspection findings, and work completion notes by voice. The spoken content is recorded, transcribed to text, and stored against the relevant work order or service record. The technician can review and edit the transcription before finalizing.

### Actors

- Field Technician (primary)
- Back-Office Staff (review)

### Preconditions

1. User is authenticated and assigned to a work order.
2. Microphone access is granted.
3. A work order or service record exists to attach the report to.

### Flow

1. Technician opens the assigned work order on the mobile app.
2. Technician taps "Dictate Report" or issues a voice command.
3. System begins recording audio.
4. Technician speaks the report content (e.g., "Heizkessel Viessmann Vitodens 200, Baujahr 2018. Stoerung E5 ausgelesen. Brenner gereinigt, Zuendelektrode ersetzt. Anlage laeuft wieder. Empfehlung: Wartungsvertrag abschliessen.").
5. Technician signals completion (button press or voice command "Fertig" / "Done").
6. System sends audio to STT service for transcription.
7. Transcribed text is displayed to the technician for review.
8. Technician edits if needed (voice or manual) and confirms.
9. Report text and audio recording are saved to the work order.
10. If template-based document creation is enabled (AI-005), the system offers to generate a formatted report document.

### Postconditions

1. Transcribed report text is stored against the work order.
2. Original audio file is stored and linked to the report.
3. Report status is set to "Draft" until finalized by the technician or reviewer.
4. Notification is sent to back-office if configured for report review workflows.

### Acceptance Criteria

- [ ] Technician can record reports of up to 15 minutes duration per session.
- [ ] Transcription is available within 30 seconds of recording completion for recordings up to 5 minutes.
- [ ] Technical HVAC terminology is transcribed with >= 85% accuracy (custom vocabulary support).
- [ ] Report text is editable before and after saving.
- [ ] Audio recording is playable from the work order detail screen.
- [ ] Multiple report segments can be appended to the same work order.
- [ ] Offline recording is supported with transcription occurring upon reconnection.

### Dependencies

- MOD-06: Mobile Technician App (work order context)
- AI-003: Speech-to-Text Conversion
- AI-005: Template-Based Document Creation (optional)

---

## AI-003: Speech-to-Text Conversion

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-003                                                                                         |
| **Title**         | Speech-to-Text Conversion                                                                      |
| **Priority**      | High                                                                                           |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `stt`, `infrastructure`, `integration`, `audio`                                                |

### Description

The system shall provide a speech-to-text (STT) conversion service that converts spoken audio input into text. This is a foundational capability used by all other AI Assistant features. The service must support streaming (real-time) and batch (recorded audio) modes and handle HVAC-specific terminology through custom vocabulary or prompt engineering.

### Actors

- System (automated)
- System Administrator (configuration)

### Preconditions

1. STT provider API credentials are configured.
2. Audio input meets minimum quality requirements (sample rate >= 16kHz, supported format).

### Flow

1. Calling module submits an audio stream or audio file to the STT service.
2. STT service preprocesses audio (noise reduction, normalization).
3. Audio is sent to the configured STT provider (e.g., OpenAI Whisper API, Google Cloud Speech-to-Text).
4. Provider returns transcription with word-level timestamps and confidence scores.
5. System applies post-processing:
   - HVAC terminology correction using custom dictionary.
   - Punctuation and capitalization normalization.
   - Swiss-specific formatting (postal codes, phone numbers).
6. Processed transcript is returned to the calling module.

### Postconditions

1. Transcribed text is returned to the requesting module.
2. Confidence score per segment is available for downstream processing.
3. Audio file is stored if retention is configured.
4. STT usage metrics are logged for billing and quality monitoring.

### Acceptance Criteria

- [ ] Streaming mode provides interim results within 500ms of speech.
- [ ] Batch mode processes 1 minute of audio within 10 seconds.
- [ ] Supports audio formats: WAV, MP3, OGG, WebM.
- [ ] Custom vocabulary of >= 500 HVAC terms is applied during transcription.
- [ ] Transcription accuracy >= 90% for standard High German in controlled noise environments.
- [ ] Graceful degradation when STT provider is unavailable (queue and retry).
- [ ] Configurable STT provider (switchable without code changes).
- [ ] Audio data in transit is encrypted (TLS 1.2+).

### Dependencies

- External: STT Provider API (OpenAI Whisper / Google Speech / Azure Speech)
- Infrastructure: Audio storage service

---

## AI-004: Structured Data Extraction from Speech

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-004                                                                                         |
| **Title**         | Structured Data Extraction from Speech                                                         |
| **Priority**      | High                                                                                           |
| **Complexity**    | High                                                                                           |
| **Tags**          | `nlp`, `entity-extraction`, `intent-recognition`, `data-processing`                            |

### Description

The system shall process transcribed text through an NLP pipeline that identifies user intent and extracts structured entities. The pipeline recognizes domain-specific entities (customer names, addresses, part numbers, equipment models, dates, quantities, urgency levels) and maps them to system data fields. Extracted data is presented to the user for confirmation before being committed.

### Actors

- System (automated)
- Field Technician (confirmation)
- Back-Office Staff (confirmation)

### Preconditions

1. Transcribed text is available from AI-003.
2. NLP models/services are configured and accessible.
3. Entity dictionaries (customers, products, locations) are loaded from system data.

### Flow

1. Transcribed text is received from the STT module.
2. Intent recognition identifies the user's goal:
   - `create_order`, `create_report`, `search_customer`, `update_status`, `navigate`, etc.
3. Entity extraction identifies and labels entities in the text:
   - `CUSTOMER_NAME`, `ADDRESS`, `EQUIPMENT_MODEL`, `PART_NUMBER`, `DATE`, `TIME`, `URGENCY`, `QUANTITY`, `DESCRIPTION`
4. Entity resolution matches extracted entities against system data:
   - Customer name --> CRM record (fuzzy matching)
   - Address --> Postal database validation
   - Equipment model --> Product catalog lookup
   - Part number --> Inventory/catalog lookup
5. Confidence scores are assigned to each extraction.
6. Low-confidence extractions are flagged for manual review.
7. Structured result (intent + entities + confidence) is returned to the calling feature.

### Postconditions

1. Structured data object is returned containing intent, entities, and confidence scores.
2. Ambiguous entities are flagged with alternatives for user selection.
3. Extraction results are logged for quality monitoring and model improvement.

### Acceptance Criteria

- [ ] Intent recognition accuracy >= 90% for the defined intent set.
- [ ] Entity extraction correctly identifies >= 85% of entities in test utterances.
- [ ] Customer name fuzzy matching returns the correct CRM record in top-3 results >= 90% of the time.
- [ ] Swiss address parsing handles street, house number, PLZ, and city correctly.
- [ ] Date/time expressions in German are parsed correctly (e.g., "naechsten Dienstag", "morgen frueh", "am 15. Maerz").
- [ ] Low-confidence fields (< 0.7) are visually highlighted in the confirmation UI.
- [ ] Processing latency < 2 seconds per utterance.
- [ ] System supports adding new entity types without code deployment (configuration-based).

### Dependencies

- AI-003: Speech-to-Text Conversion (input)
- MOD-03: CRM & Customer Management (entity resolution)
- MOD-10: Product/Service Catalog (part number/model lookup, if applicable)

---

## AI-005: Template-Based Document Creation from Voice

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-005                                                                                         |
| **Title**         | Template-Based Document Creation from Voice                                                    |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `voice`, `documents`, `templates`, `automation`                                                |

### Description

The system shall allow users to create formatted business documents (service reports, cover letters, quotations) by dictating content that is automatically merged with predefined templates. The voice-dictated content fills template placeholders, combined with system data (customer info, order details), to produce a complete document.

### Actors

- Field Technician
- Back-Office Staff

### Preconditions

1. A document template exists in Module 09 for the requested document type.
2. Transcribed and structured text is available from AI-003/AI-004.
3. Related system data (customer, order) is accessible.

### Flow

1. User requests document creation via voice (e.g., "Erstelle Servicebericht fuer den aktuellen Auftrag").
2. System identifies the document type (service report) and selects the appropriate template.
3. System collects template data from:
   - Voice-dictated content (findings, recommendations, work performed)
   - Current context (active work order, customer record)
   - System data (technician name, date, order number)
4. Template placeholders are populated with the collected data.
5. System renders a document preview for user review.
6. User approves or requests edits (voice or manual).
7. Final document is generated as PDF via Module 09.
8. Document is attached to the relevant order/customer record.

### Postconditions

1. A formatted PDF document is created and stored in the system.
2. Document is linked to the relevant work order and customer.
3. Document is available for email dispatch or download.

### Acceptance Criteria

- [ ] User can trigger document creation by voice command specifying the document type.
- [ ] System correctly identifies and selects the matching template.
- [ ] Voice-dictated content is placed in the correct template sections.
- [ ] System data (customer name, address, order number, date) is auto-populated.
- [ ] Document preview is displayed before final generation.
- [ ] Generated PDF matches the CI guidelines defined in Module 09.
- [ ] Document is stored and linked to the correct records.

### Dependencies

- MOD-09: Document Templates & Layout System
- MOD-08: Quotations & Order Processing
- AI-003: Speech-to-Text Conversion
- AI-004: Structured Data Extraction

---

## AI-006: Voice-Based Address Capture

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-006                                                                                         |
| **Title**         | Voice-Based Address Capture                                                                    |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `voice`, `address`, `crm`, `validation`                                                        |

### Description

The system shall capture customer addresses through voice input, parse them into structured components (street, house number, PLZ, city, canton), validate against Swiss postal databases, and store them in the CRM. The feature handles Swiss address formats and common verbal patterns.

### Actors

- Field Technician
- Back-Office Staff
- Dispatcher

### Preconditions

1. User is in a context where address entry is applicable (new customer, order creation, etc.).
2. Swiss postal database (PLZ directory) is loaded and accessible.

### Flow

1. User speaks an address (e.g., "Industriestrasse 42, 8005 Zuerich").
2. System transcribes and parses the address into components:
   - Street: Industriestrasse
   - House number: 42
   - PLZ: 8005
   - City: Zuerich
   - Canton: ZH (auto-derived from PLZ)
3. System validates the PLZ-city combination against the Swiss postal database.
4. If ambiguous or invalid, system prompts for clarification.
5. User confirms or corrects the parsed address.
6. Address is stored in the relevant record (CRM customer, order, etc.).

### Postconditions

1. Validated address is stored in structured format.
2. Geocoordinates are optionally derived for mapping/routing purposes.

### Acceptance Criteria

- [ ] Swiss addresses are parsed correctly for >= 90% of standard format utterances.
- [ ] PLZ-city validation catches mismatches and prompts for correction.
- [ ] Canton is auto-derived from PLZ.
- [ ] Common street name variations are normalized (e.g., "Str." vs "Strasse").
- [ ] Multi-line addresses (with c/o, apartment number) are supported.
- [ ] Addresses can be spoken in German, French, Italian, and English.

### Dependencies

- AI-003: Speech-to-Text Conversion
- AI-004: Structured Data Extraction
- MOD-03: CRM & Customer Management
- External: Swiss Post PLZ database

---

## AI-007: Voice-Supported Application Functions

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-007                                                                                         |
| **Title**         | Voice-Supported Application Functions                                                          |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | High                                                                                           |
| **Tags**          | `voice`, `navigation`, `commands`, `accessibility`                                             |

### Description

The system shall support voice commands for general application interaction, including navigating between screens, searching records, updating statuses, and triggering common workflows. This provides a hands-free interaction model for technicians wearing gloves or working in confined spaces.

### Actors

- Field Technician (primary)
- Back-Office Staff
- Dispatcher

### Preconditions

1. User is authenticated.
2. Voice assistant is active.
3. Command vocabulary is loaded for the user's language.

### Flow

1. User issues a voice command (e.g., "Zeige meine heutigen Auftraege", "Suche Kunde Mueller", "Status auf erledigt setzen").
2. System transcribes and identifies the intent:
   - Navigation: "Zeige Auftraege" --> Navigate to order list
   - Search: "Suche Kunde Mueller" --> Open CRM search with query "Mueller"
   - Update: "Status erledigt" --> Update current record status
3. System executes the action or navigates to the target screen.
4. System provides audio and visual feedback confirming the action.
5. For destructive or irreversible actions, system requests confirmation before execution.

### Postconditions

1. The requested action is performed or the target screen is displayed.
2. Command execution is logged in the audit trail.

### Acceptance Criteria

- [ ] Minimum 20 distinct voice commands are supported at launch.
- [ ] Command recognition accuracy >= 90% for defined commands.
- [ ] Navigation commands execute within 1 second.
- [ ] Search commands display results within 2 seconds.
- [ ] Status updates require voice or tap confirmation before execution.
- [ ] Users can access a "What can I say?" help overlay.
- [ ] New voice commands can be added via configuration without code deployment.

### Dependencies

- AI-003: Speech-to-Text Conversion
- AI-004: Structured Data Extraction
- All modules with user-facing screens

---

## AI-008: Multi-Language Support

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-008                                                                                         |
| **Title**         | Multi-Language Support                                                                         |
| **Priority**      | Medium                                                                                         |
| **Complexity**    | Medium                                                                                         |
| **Tags**          | `language`, `i18n`, `stt`, `nlp`, `configuration`                                              |

### Description

The AI Assistant shall support multiple languages as defined in the annex "Language Scope." At minimum, German (High German), French, Italian, and English must be supported for voice input, transcription, entity extraction, and voice commands. The system detects the input language or uses the user's configured language preference.

### Actors

- All users
- System Administrator (language configuration)

### Preconditions

1. STT provider supports the target languages.
2. NLP models/rules are configured for each supported language.
3. Command vocabulary is translated for each language.

### Flow

1. User's language preference is loaded from their profile settings.
2. STT service is configured for the user's language.
3. Alternatively, automatic language detection identifies the spoken language.
4. NLP pipeline applies language-specific rules for entity extraction.
5. Voice command matching uses the language-specific command vocabulary.
6. System responses (audio/text feedback) are delivered in the user's language.

### Postconditions

1. Voice interaction operates in the user's preferred or detected language.
2. Extracted data is stored in a language-neutral format where applicable (dates as ISO, numbers as decimals).

### Acceptance Criteria

- [ ] German (de-CH), French (fr-CH), Italian (it-CH), and English (en) are supported.
- [ ] Language can be set per user in profile settings.
- [ ] Automatic language detection correctly identifies the language in >= 95% of cases (when enabled).
- [ ] Entity extraction works correctly across all supported languages.
- [ ] Voice commands are available in all supported languages.
- [ ] System feedback messages are localized.
- [ ] Language switching does not require app restart.

### Dependencies

- AI-003: Speech-to-Text Conversion
- AI-004: Structured Data Extraction
- External: STT provider multi-language support

---

## AI-009: Continuous Learning & Accuracy Improvement

| Field             | Value                                                                                          |
|-------------------|------------------------------------------------------------------------------------------------|
| **Req ID**        | AI-009                                                                                         |
| **Title**         | Continuous Learning & Accuracy Improvement                                                     |
| **Priority**      | Low                                                                                            |
| **Complexity**    | High                                                                                           |
| **Tags**          | `ml`, `quality`, `analytics`, `improvement`                                                    |

### Description

The system shall track AI Assistant accuracy metrics and provide mechanisms for continuous improvement. User corrections to transcriptions and entity extractions are logged and analyzed to identify systematic errors. Custom vocabulary is expanded based on usage patterns. Accuracy reports are generated for quality monitoring.

### Actors

- System (automated analytics)
- System Administrator (review and tuning)

### Preconditions

1. AI Assistant features are in production use.
2. User corrections are being captured (AI-001 through AI-008).

### Flow

1. System logs all STT transcriptions alongside user corrections (if any).
2. System logs all entity extractions alongside user modifications.
3. Analytics pipeline periodically analyzes correction patterns:
   - Frequently corrected words are flagged for custom vocabulary addition.
   - Frequently misclassified entities trigger rule/model adjustments.
   - Low-accuracy intents are flagged for review.
4. System Administrator reviews accuracy reports and approves vocabulary/rule updates.
5. Updated vocabulary and rules are deployed to production.
6. Accuracy trends are tracked over time in a dashboard.

### Postconditions

1. Accuracy metrics are available in the admin dashboard.
2. Custom vocabulary and extraction rules are updated based on real usage.
3. Accuracy trends show improvement over time.

### Acceptance Criteria

- [ ] Correction rate per feature is tracked and displayed in the admin dashboard.
- [ ] Most frequently corrected words are listed with suggested custom vocabulary entries.
- [ ] Custom vocabulary can be updated without system restart.
- [ ] Monthly accuracy reports are generated automatically.
- [ ] Accuracy improvement trend is measurable after vocabulary updates.
- [ ] User correction data is anonymized for analysis (no PII in analytics).

### Dependencies

- AI-001 through AI-008 (correction data sources)
- Analytics infrastructure
