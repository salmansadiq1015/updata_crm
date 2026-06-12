# Module 07: AI Assistant -- Technical Design

---

## 1. Architecture Overview

The AI Assistant module follows a pipeline architecture inside the web application. Responsive field-service pages and desktop pages share the same backend and session pipeline; "mobile" in this design refers to browser-based responsive layouts, not a separate native app or standalone client.

The AI Assistant module follows a pipeline architecture with three core stages:

```
[Audio Input] --> [STT Service] --> [NLP Pipeline] --> [Action Dispatcher]
                                         |                    |
                                   [Entity Store]    [Module Integrations]
```

### Component Responsibilities

| Component          | Responsibility                                                        |
|--------------------|-----------------------------------------------------------------------|
| Audio Capture      | Records audio from the browser microphone, handles streaming/batch modes |
| STT Gateway        | Abstracts STT provider; routes audio; returns transcripts             |
| NLP Pipeline       | Intent recognition, entity extraction, entity resolution              |
| Action Dispatcher  | Routes recognized intents to target modules (orders, CRM, navigation) |
| Conversation Manager | Manages multi-turn dialogues, context, confirmation flows           |
| Vocabulary Service | Manages custom HVAC terminology and user-specific corrections         |
| Analytics Collector| Logs interactions, corrections, accuracy metrics                      |

---

## 2. Data Models

### 2.1 VoiceSession

Represents a single voice interaction session.

```json
{
  "id": "uuid",
  "userId": "uuid",
  "sessionType": "order_creation | report_dictation | address_capture | command | general",
  "language": "de-CH | fr-CH | it-CH | en",
  "startedAt": "ISO8601",
  "endedAt": "ISO8601",
  "status": "active | completed | cancelled | error",
  "audioFileUrl": "string | null",
  "audioDurationMs": "integer",
  "transcript": {
    "raw": "string",
    "corrected": "string | null",
    "confidence": "float (0-1)"
  },
  "intent": {
    "name": "string",
    "confidence": "float (0-1)"
  },
  "entities": [
    {
      "type": "CUSTOMER_NAME | ADDRESS | DATE | TIME | URGENCY | EQUIPMENT_MODEL | PART_NUMBER | QUANTITY | DESCRIPTION | STATUS",
      "value": "string",
      "normalizedValue": "string | null",
      "confidence": "float (0-1)",
      "resolvedId": "uuid | null",
      "startOffset": "integer",
      "endOffset": "integer",
      "correctedValue": "string | null"
    }
  ],
  "contextRef": {
    "module": "string",
    "recordType": "string",
    "recordId": "uuid | null"
  },
  "metadata": {
    "deviceType": "responsive-mobile | desktop",
    "sttProvider": "whisper | google | azure",
    "processingTimeMs": "integer"
  }
}
```

In this module, `deviceType` describes the browser viewport class used inside the web application, such as a responsive field-service page on a tablet-sized screen or a desktop browser page. It does not indicate a separate native mobile application.

### 2.2 CustomVocabulary

```json
{
  "id": "uuid",
  "term": "string",
  "phonetic": "string | null",
  "category": "equipment | part | brand | location | general",
  "language": "de | fr | it | en",
  "aliases": ["string"],
  "createdAt": "ISO8601",
  "source": "manual | auto_suggested",
  "status": "active | pending_review | disabled"
}
```

### 2.3 VoiceCommand

```json
{
  "id": "uuid",
  "intent": "string",
  "language": "de | fr | it | en",
  "phrases": ["string"],
  "action": {
    "type": "navigate | search | update | create",
    "target": "string",
    "parameters": {}
  },
  "requiresConfirmation": "boolean",
  "isActive": "boolean"
}
```

### 2.4 AccuracyMetric

```json
{
  "id": "uuid",
  "period": "YYYY-MM",
  "feature": "stt | intent | entity_extraction | address_parsing",
  "language": "de-CH | fr-CH | it-CH | en",
  "totalInteractions": "integer",
  "correctCount": "integer",
  "correctedCount": "integer",
  "accuracyRate": "float (0-1)",
  "topCorrections": [
    {
      "original": "string",
      "correctedTo": "string",
      "count": "integer"
    }
  ]
}
```

---

## 3. Database Schema

### Tables

```sql
CREATE TABLE voice_sessions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id),
    session_type    VARCHAR(50) NOT NULL,
    language        VARCHAR(10) NOT NULL DEFAULT 'de-CH',
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at        TIMESTAMPTZ,
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    audio_file_url  TEXT,
    audio_duration_ms INTEGER,
    raw_transcript  TEXT,
    corrected_transcript TEXT,
    transcript_confidence DECIMAL(3,2),
    intent_name     VARCHAR(100),
    intent_confidence DECIMAL(3,2),
    context_module  VARCHAR(50),
    context_record_type VARCHAR(50),
    context_record_id UUID,
    device_type     VARCHAR(20),
    stt_provider    VARCHAR(30),
    processing_time_ms INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE voice_session_entities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL REFERENCES voice_sessions(id) ON DELETE CASCADE,
    entity_type     VARCHAR(50) NOT NULL,
    value           TEXT NOT NULL,
    normalized_value TEXT,
    confidence      DECIMAL(3,2),
    resolved_id     UUID,
    start_offset    INTEGER,
    end_offset      INTEGER,
    corrected_value TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE custom_vocabulary (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    term            VARCHAR(255) NOT NULL,
    phonetic        VARCHAR(255),
    category        VARCHAR(50) NOT NULL,
    language        VARCHAR(10) NOT NULL,
    aliases         JSONB DEFAULT '[]',
    source          VARCHAR(30) NOT NULL DEFAULT 'manual',
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE voice_commands (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    intent                VARCHAR(100) NOT NULL,
    language              VARCHAR(10) NOT NULL,
    phrases               JSONB NOT NULL,
    action_type           VARCHAR(30) NOT NULL,
    action_target         VARCHAR(100) NOT NULL,
    action_parameters     JSONB DEFAULT '{}',
    requires_confirmation BOOLEAN NOT NULL DEFAULT false,
    is_active             BOOLEAN NOT NULL DEFAULT true,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accuracy_metrics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    period              VARCHAR(7) NOT NULL,
    feature             VARCHAR(50) NOT NULL,
    language            VARCHAR(10) NOT NULL,
    total_interactions  INTEGER NOT NULL DEFAULT 0,
    correct_count       INTEGER NOT NULL DEFAULT 0,
    corrected_count     INTEGER NOT NULL DEFAULT 0,
    accuracy_rate       DECIMAL(5,4),
    top_corrections     JSONB DEFAULT '[]',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(period, feature, language)
);

CREATE INDEX idx_voice_sessions_user ON voice_sessions(user_id);
CREATE INDEX idx_voice_sessions_status ON voice_sessions(status);
CREATE INDEX idx_voice_sessions_type ON voice_sessions(session_type);
CREATE INDEX idx_voice_sessions_created ON voice_sessions(created_at);
CREATE INDEX idx_voice_session_entities_session ON voice_session_entities(session_id);
CREATE INDEX idx_custom_vocabulary_term ON custom_vocabulary(term);
CREATE INDEX idx_custom_vocabulary_category ON custom_vocabulary(category, language);
```

---

## 4. REST API Endpoints

### 4.1 Voice Sessions

#### Start a Voice Session

```
POST /api/v1/ai/sessions
```

**Request Body:**
```json
{
  "sessionType": "order_creation",
  "language": "de-CH",
  "contextModule": "orders",
  "contextRecordId": "uuid | null"
}
```

**Response (201):**
```json
{
  "id": "uuid",
  "status": "active",
  "wsEndpoint": "wss://api.example.com/ai/sessions/{id}/stream",
  "createdAt": "ISO8601"
}
```

#### Upload Audio for Batch Transcription

```
POST /api/v1/ai/sessions/{sessionId}/audio
Content-Type: multipart/form-data
```

**Form Fields:**
- `audio` (file): Audio file (WAV, MP3, OGG, WebM)

**Response (202):**
```json
{
  "sessionId": "uuid",
  "status": "processing",
  "estimatedCompletionMs": 5000
}
```

#### Get Session Result

```
GET /api/v1/ai/sessions/{sessionId}
```

**Response (200):**
Returns full `VoiceSession` object.

#### Submit Corrections

```
PATCH /api/v1/ai/sessions/{sessionId}/corrections
```

**Request Body:**
```json
{
  "correctedTranscript": "string | null",
  "entityCorrections": [
    {
      "entityId": "uuid",
      "correctedValue": "string"
    }
  ]
}
```

**Response (200):**
Updated `VoiceSession` object.

#### Confirm and Execute

```
POST /api/v1/ai/sessions/{sessionId}/confirm
```

**Response (200):**
```json
{
  "sessionId": "uuid",
  "status": "completed",
  "result": {
    "action": "order_created",
    "recordId": "uuid",
    "recordType": "order",
    "message": "Auftrag AUF-2026-001234 wurde erstellt."
  }
}
```

### 4.2 Streaming (WebSocket)

#### Real-Time Audio Stream

```
WSS /api/v1/ai/sessions/{sessionId}/stream
```

**Client sends:** Binary audio frames (16kHz, 16-bit PCM)

**Server sends:**
```json
{
  "type": "interim_transcript | final_transcript | entity_detected | intent_detected | error",
  "data": {
    "text": "string",
    "confidence": 0.95,
    "isFinal": false,
    "entities": [],
    "intent": null
  }
}
```

### 4.3 Custom Vocabulary

```
GET    /api/v1/ai/vocabulary?language=de&category=equipment&page=1&pageSize=50
POST   /api/v1/ai/vocabulary
PUT    /api/v1/ai/vocabulary/{id}
DELETE /api/v1/ai/vocabulary/{id}
```

### 4.4 Voice Commands

```
GET    /api/v1/ai/commands?language=de&active=true
POST   /api/v1/ai/commands
PUT    /api/v1/ai/commands/{id}
DELETE /api/v1/ai/commands/{id}
```

### 4.5 Analytics

```
GET /api/v1/ai/analytics/accuracy?period=2026-03&feature=stt&language=de-CH
GET /api/v1/ai/analytics/usage?from=2026-01-01&to=2026-03-31
GET /api/v1/ai/analytics/corrections/top?limit=20&language=de-CH
```

---

## 5. Event Flows

### 5.1 Domain Events

| Event Name                      | Trigger                                     | Payload Key Fields                           |
|---------------------------------|---------------------------------------------|----------------------------------------------|
| `ai.session.started`            | Voice session initiated                     | sessionId, userId, sessionType, language     |
| `ai.session.transcribed`        | Transcription completed                     | sessionId, transcript, confidence            |
| `ai.session.entities_extracted` | NLP pipeline completed entity extraction    | sessionId, entities[], intent                |
| `ai.session.confirmed`          | User confirmed extracted data               | sessionId, confirmedData                     |
| `ai.session.completed`          | Action executed successfully                | sessionId, resultAction, resultRecordId      |
| `ai.session.failed`             | Processing failed                           | sessionId, errorCode, errorMessage           |
| `ai.session.corrected`          | User submitted corrections                  | sessionId, corrections[]                     |
| `ai.vocabulary.updated`         | Custom vocabulary entry added/modified      | vocabularyId, term, action                   |

### 5.2 Integration Events (Published to Other Modules)

| Event                      | Target Module | Description                                         |
|----------------------------|---------------|-----------------------------------------------------|
| `order.create_requested`   | MOD-08        | Voice-created order data ready for order processing  |
| `report.content_captured`  | Work-order web surface | Voice-dictated report content ready for the work-order record in the web app |
| `customer.address_captured`| MOD-03        | Voice-captured and validated address for CRM         |
| `document.generate_requested` | MOD-09     | Voice-triggered document generation request          |

### 5.3 Consumed Events

| Event                        | Source Module | Action                                              |
|------------------------------|---------------|-----------------------------------------------------|
| `order.created`              | MOD-08        | Confirm order creation to user in voice session      |
| `customer.resolved`         | MOD-03        | Return matched customer to entity resolution step    |
| `document.generated`         | MOD-09        | Notify user that document is ready                   |

---

## 6. Integration Points

### 6.1 STT Provider Integration

The STT Gateway abstracts the underlying provider behind a common interface:

```typescript
interface STTProvider {
  transcribeStream(audioStream: ReadableStream, options: STTOptions): AsyncIterable<TranscriptChunk>;
  transcribeBatch(audioFile: Buffer, options: STTOptions): Promise<TranscriptResult>;
  getSupportedLanguages(): string[];
}

interface STTOptions {
  language: string;
  customVocabulary?: string[];
  enablePunctuation?: boolean;
  enableWordTimestamps?: boolean;
  model?: string;
}

interface TranscriptChunk {
  text: string;
  isFinal: boolean;
  confidence: number;
  words?: Array<{ word: string; startMs: number; endMs: number; confidence: number }>;
}
```

**Supported Providers (configurable):**

| Provider                   | Streaming | Batch | Swiss German | Custom Vocab |
|----------------------------|-----------|-------|--------------|--------------|
| OpenAI Whisper API         | No        | Yes   | Partial      | Via prompt   |
| Google Cloud Speech-to-Text| Yes       | Yes   | No           | Yes          |
| Azure Speech Services      | Yes       | Yes   | No           | Yes          |

### 6.2 NLP Pipeline Integration

```typescript
interface NLPPipeline {
  process(transcript: string, context: NLPContext): Promise<NLPResult>;
}

interface NLPContext {
  language: string;
  sessionType: string;
  activeModule?: string;
  activeRecordId?: string;
  userId: string;
}

interface NLPResult {
  intent: { name: string; confidence: number };
  entities: Array<{
    type: string;
    value: string;
    normalizedValue?: string;
    confidence: number;
    startOffset: number;
    endOffset: number;
  }>;
  sentiment?: string;
}
```

**Implementation Options:**
- LLM-based extraction (e.g., GPT-4 / Claude with structured output prompts)
- Rule-based extraction for well-defined entities (Swiss PLZ, phone numbers)
- Hybrid: LLM for complex extraction, regex/rules for structured patterns

### 6.3 CRM Integration (MOD-03)

```
GET /api/v1/customers/search?q={fuzzyName}&limit=5
```

Used for entity resolution of customer names. Returns ranked candidates with match scores.

### 6.4 Order Module Integration (MOD-08)

```
POST /api/v1/orders
```

Submits voice-created order data. Payload matches the standard order creation schema with an additional `source: "voice_assistant"` field.

### 6.5 Document Template Integration (MOD-09)

```
POST /api/v1/documents/generate
```

Submits document generation request with template ID, data payload, and output format (PDF).

### 6.6 Address Validation

```
GET /api/v1/addresses/validate?plz={plz}&city={city}&street={street}
```

Validates Swiss addresses against the postal database. Returns normalized address components and geocoordinates.

---

## 7. Audio Processing Pipeline

### 7.1 Preprocessing

1. **Format Conversion** -- Incoming audio is converted to 16kHz, 16-bit mono PCM WAV.
2. **Noise Reduction** -- Spectral gating removes background noise (HVAC equipment, construction site noise).
3. **Voice Activity Detection (VAD)** -- Non-speech segments are trimmed to reduce processing costs and improve accuracy.
4. **Chunking** -- Long recordings are split into segments at natural pause boundaries for parallel processing.

### 7.2 Post-Processing

1. **Custom Vocabulary Correction** -- Phonetically similar words are matched against the custom vocabulary and replaced.
2. **Swiss Format Normalization** -- Phone numbers (e.g., 044 123 45 67), PLZ (4-digit), dates (DD.MM.YYYY) are normalized.
3. **Punctuation & Capitalization** -- Applied if not provided by the STT provider.

---

## 8. Security & Privacy

| Concern                    | Measure                                                                |
|----------------------------|------------------------------------------------------------------------|
| Audio data in transit      | TLS 1.2+ for all API calls; WSS for streaming                         |
| Audio data at rest         | Encrypted storage (AES-256); configurable retention period             |
| STT provider data handling | Provider DPA (Data Processing Agreement) required; EU/CH data residency|
| Voice data retention       | Configurable: 30/60/90 days; auto-deletion after retention period      |
| PII in transcripts         | Transcripts inherit the access control of the parent record            |
| Analytics anonymization    | Correction analytics are aggregated; no PII in accuracy metrics        |
| Consent                    | Users are informed that voice data is processed; opt-in per session    |

---

## 9. Error Handling

| Error Scenario                  | Handling                                                         |
|---------------------------------|------------------------------------------------------------------|
| STT provider timeout            | Retry with exponential backoff (max 3 attempts); fall back to offline recording |
| STT provider unavailable        | Queue audio file for batch processing; notify user               |
| Low transcription confidence    | Flag session; present transcript with low-confidence highlights  |
| No intent recognized            | Prompt user to rephrase; offer manual input fallback             |
| Entity resolution failure       | Present unresolved entity for manual selection/entry             |
| Audio quality too poor          | Notify user; suggest moving to quieter environment or using text input |
| WebSocket disconnection         | Auto-reconnect with session resumption; buffer audio client-side |

---

## 10. Performance Requirements

| Metric                              | Target                          |
|--------------------------------------|---------------------------------|
| Streaming transcription latency      | < 500ms from speech to interim result |
| Batch transcription throughput       | 1 min audio processed in < 10s  |
| NLP pipeline processing             | < 2s per utterance              |
| End-to-end order creation (voice)    | < 30s from first word to confirmation screen |
| Concurrent voice sessions            | >= 50 simultaneous sessions     |
| Audio file upload size limit         | 50 MB (approx. 15 min at 44kHz) |
| WebSocket connection timeout         | 5 min inactivity                |
