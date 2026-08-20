# Migration MB-Boiler : Node.js/MongoDB → Laravel/MySQL

## Vue d'ensemble

| Donnée | Valeur actuelle |
|--------|----------------|
| Stack actuel | Express 5 + MongoDB/Mongoose 9.3.3 + Redis + BullMQ + Socket.IO |
| Stack cible | Laravel 11 + MySQL 8 + Redis + Laravel Queue + Laravel Reverb |
| Modules métier | 24 |
| Endpoints REST | ~847 |
| Modèles Mongoose | 157 |
| Repositories | 112 |
| Services | 148 |
| Controllers | 126 |
| Background jobs | 43 |
| Middleware | 13 |
| Fichiers backend total | ~800+ |

---

## Phase 0 — Fondations Laravel

### 0.1 Initialisation du projet Laravel
- [ ] Créer le projet Laravel 11 (`laravel new mb-boiler-api`)
- [ ] Configurer `.env` (MySQL, Redis, Mail, S3, Sentry)
- [ ] Configurer `config/database.php` (MySQL pool, Redis)
- [ ] Configurer `config/queue.php` (Redis driver)
- [ ] Configurer `config/broadcasting.php` (Reverb/Pusher)
- [ ] Configurer `config/filesystems.php` (S3 + local)
- [ ] Configurer `config/mail.php` (SMTP)
- [ ] Configurer `config/logging.php` (structured JSON, Sentry)
- [ ] Installer et configurer Sentry (`sentry/sentry-laravel`)
- [ ] Configurer les variables d'environnement avec validation (equiv. Joi schema.js)

### 0.2 Structure du projet
- [ ] Définir l'architecture modulaire : `app/Modules/{Module}/` avec Controllers, Services, Repositories, Models, Requests, Resources, Routes, Jobs, Events, Listeners
- [ ] Créer le `ModuleServiceProvider` pour l'auto-discovery des modules
- [ ] Configurer le namespace PSR-4 dans `composer.json`
- [ ] Mettre en place les conventions de nommage

### 0.3 Packages à installer
- [ ] `laravel/sanctum` — Auth API (JWT tokens)
- [ ] `spatie/laravel-permission` — RBAC/PBAC
- [ ] `spatie/laravel-activitylog` — Audit logging
- [ ] `barryvdh/laravel-dompdf` ou `spatie/laravel-pdf` — PDF generation
- [ ] `maatwebsite/excel` — CSV/Excel import/export
- [ ] `laravel/reverb` — WebSocket server (remplacement Socket.IO)
- [ ] `laravel/scout` — Full-text search
- [ ] `laravel/horizon` — Dashboard pour les queues Redis
- [ ] `spatie/laravel-medialibrary` — File uploads/storage
- [ ] `owen-it/laravel-auditing` — Alternative audit trail
- [ ] `stancl/tenancy` — Si multi-tenant nécessaire
- [ ] Prometheus exporter pour Laravel (metrics)

---

## Phase 1 — Schéma MySQL (Migrations Laravel)

Conversion des 157 modèles Mongoose en tables relationnelles. Les sous-documents imbriqués (embedded schemas) deviennent des tables séparées avec foreign keys.

### 1.1 Auth (6 modèles → ~6 tables)
- [ ] `users` — id, email, password, first_name, last_name, role_id, status, locked_until, failed_login_attempts, last_login_at, preferences (JSON), timestamps, soft_deletes
- [ ] `roles` — id, name, guard_name, is_system, timestamps
- [ ] `permissions` — id, name (module:action), guard_name, timestamps
- [ ] `role_has_permissions` — pivot table
- [ ] `audit_logs` — id, user_id, event_type, ip_address, user_agent, result, details (JSON), timestamps
- [ ] `password_histories` — id, user_id, password_hash, timestamps
- [ ] Implémenter les 50+ règles d'implication de permissions dans un PermissionImplicationService

### 1.2 CRM (21 modèles → ~25 tables)
- [ ] `customers` — id, name, owner_name, email, phone, type, status, is_deleted, merged_into_id, migration (JSON), timestamps
- [ ] `contacts` — id, customer_id, first_name, last_name, email, phone, position, timestamps, soft_deletes
- [ ] `contact_log_entries` — id, contact_id, customer_id, type, content, user_id, timestamps
- [ ] `sites` — id, customer_id, site_number, name, type, postal_code, timestamps, soft_deletes
- [ ] `site_addresses` — id, site_id, type (billing/ownership/management), name, street, city, postal_code, country
- [ ] `site_details` — id, site_id, emergency_heating (JSON), key_box (JSON), advertising_board (JSON)
- [ ] `installations` — id, site_id, type, manufacturer, model, serial_number, fuel_type, warranty_end_date, timestamps, soft_deletes
- [ ] `installation_spare_parts` — id, installation_id, spare_part_id, quantity, timestamps
- [ ] `spare_parts` — id, name, article_number, category, stock_quantity, timestamps, soft_deletes
- [ ] `entity_notes` — id, notable_type (morph), notable_id, content, user_id, timestamps
- [ ] `entity_images` — id, imageable_type (morph), imageable_id, path, order, timestamps
- [ ] `inventory_items` — id, spare_part_id, location, quantity, timestamps
- [ ] `inventory_movements` — id, spare_part_id, type, quantity, user_id, timestamps
- [ ] `maintenance_intervals` — id, installation_id, interval_months, next_due_date, timestamps
- [ ] `maintenance_settings` — id, lookahead_days, escalation_days, timestamps
- [ ] `delivery_note_ocr_jobs` — id, status, file_path, result (JSON), timestamps
- [ ] `purchase_orders` — id, supplier_id, customer_id, status, total, timestamps, soft_deletes
- [ ] `newsletters` — id, subject, body, status, sent_at, timestamps
- [ ] `newsletter_deliveries` — id, newsletter_id, contact_id, status, timestamps
- [ ] `counters` — id, name, sequence_value
- [ ] `customer_merges` — id, source_customer_id, target_customer_id, merged_by, timestamps

### 1.3 Accounting (29 modèles → ~30 tables)
- [ ] `accounts` — id, parent_id (self-ref), code, name, type, is_group, normal_balance, is_system, timestamps, soft_deletes
- [ ] `accounting_documents` — id, type, document_number, date, total, status, linked_record_type (morph), linked_record_id, timestamps
- [ ] `accounting_entities` — id, name, type, timestamps
- [ ] `account_mappings` — id, source_type, target_account_id, timestamps
- [ ] `ap_invoices` — id, supplier_id, invoice_number, date, due_date, total, status, timestamps, soft_deletes
- [ ] `ar_payments` — id, customer_id, amount, date, method, reference, timestamps
- [ ] `ar_payment_allocations` — id, payment_id, invoice_id, amount, timestamps
- [ ] `bank_accounts` — id, name, iban, bic, account_id, timestamps
- [ ] `bank_transactions` — id, bank_account_id, date, amount, description, reconciled, timestamps
- [ ] `tax_codes` — id, code, name, rate, type, timestamps
- [ ] `tax_groups` — id, name, tax_code_ids (JSON), timestamps
- [ ] `tax_exemptions` — id, entity_type (morph), entity_id, tax_code_id, reason, timestamps
- [ ] `tax_transactions` — id, document_id, tax_code_id, base_amount, tax_amount, timestamps
- [ ] `journal_entries` — id, date, reference, description, is_posted, timestamps
- [ ] `journal_entry_lines` — id, journal_entry_id, account_id, debit, credit, timestamps
- [ ] `exchange_rates` — id, from_currency, to_currency, rate, date, timestamps
- [ ] `fx_revaluation_runs` — id, date, status, results (JSON), timestamps
- [ ] `payment_batches` — id, status, total, payment_count, timestamps
- [ ] `recurring_transactions` — id, template (JSON), frequency, next_run_date, is_active, timestamps
- [ ] `recurring_runs` — id, recurring_transaction_id, run_date, status, timestamps
- [ ] `budgets` — id, account_id, fiscal_period_id, amount, timestamps
- [ ] `fixed_assets` — id, name, account_id, purchase_date, purchase_cost, useful_life, depreciation_method, timestamps, soft_deletes
- [ ] `fixed_asset_depreciation_entries` — id, fixed_asset_id, date, amount, timestamps
- [ ] `fixed_asset_depreciation_runs` — id, date, status, timestamps
- [ ] `inventory_accounting_entries` — id, item_type, item_id, account_id, amount, timestamps
- [ ] `fiscal_periods` — id, name, start_date, end_date, status, timestamps
- [ ] `dunning_templates` — id, level, subject, body, days_overdue, timestamps
- [ ] `auto_allocation_rules` — id, criteria (JSON), target_account_id, priority, timestamps
- [ ] `reconciliation_learning_rules` — id, pattern, account_id, confidence, timestamps
- [ ] `ocr_results` — id, document_id, raw_data (JSON), parsed_data (JSON), confidence, timestamps

### 1.4 QOP — Quotations/Orders/Invoices (9 modèles → ~12 tables)
- [ ] `quotations` — id, customer_id, quotation_number, date, valid_until, status, total, source_template_id, timestamps, soft_deletes
- [ ] `quotation_line_items` — id, quotation_id, article_id, description, quantity, unit_price, catalog_snapshot (JSON), sort_order, timestamps
- [ ] `quotation_templates` — id, name, line_items (JSON), timestamps
- [ ] `quotation_reminders` — id, quotation_id, reminder_date, sent_at, timestamps
- [ ] `qop_reminder_settings` — id, key, value, timestamps
- [ ] `orders` — id, customer_id, quotation_id, order_number, date, status, total, timestamps, soft_deletes
- [ ] `order_line_items` — id, order_id, article_id, description, quantity, unit_price, catalog_snapshot (JSON), sort_order, timestamps
- [ ] `invoices` — id, customer_id, order_id, invoice_number, date, due_date, status, total, timestamps, soft_deletes
- [ ] `invoice_line_items` — id, invoice_id, article_id, description, quantity, unit_price, timestamps
- [ ] `document_status_logs` — id, documentable_type (morph), documentable_id, from_status, to_status, user_id, timestamps
- [ ] `document_number_sequences` — id, type, prefix, next_number, timestamps
- [ ] `search_presets` — id, user_id, module, name, filters (JSON), timestamps

### 1.5 Catalog (16 modèles → ~18 tables)
- [ ] `articles` — id, article_number, name, description, category_id, unit_of_measure_id, is_active, timestamps, soft_deletes
- [ ] `article_images` — id, article_id, path, order, timestamps
- [ ] `article_versions` — id, article_id, version, data (JSON), timestamps
- [ ] `catalog_categories` — id, parent_id (self-ref), name, code, sort_order, timestamps
- [ ] `catalog_connections` — id, source_article_id, target_article_id, type, timestamps
- [ ] `catalog_barcode_references` — id, article_id, barcode, type, timestamps
- [ ] `catalog_markup_rules` — id, category_id, customer_id, markup_percent, timestamps
- [ ] `catalog_recent_searches` — id, user_id, query, timestamps
- [ ] `catalog_search_analytics` — id, query, result_count, timestamps
- [ ] `catalog_sync_logs` — id, source, status, records_processed, errors (JSON), timestamps
- [ ] `price_histories` — id, article_id, price, valid_from, valid_to, timestamps
- [ ] `price_update_batches` — id, status, items_count, timestamps
- [ ] `text_blocks` — id, name, content, category, timestamps
- [ ] `units_of_measure` — id, name, abbreviation, timestamps
- [ ] `igh_configs` — id, endpoint, credentials (encrypted), sync_interval, timestamps
- [ ] `igh_import_jobs` — id, status, progress, results (JSON), timestamps

### 1.6 Deploy/Scheduling (7 modèles → ~8 tables)
- [ ] `assignments` — id, project_id, employee_id (user_id), date, start_time, end_time, work_type_id, status, timestamps, soft_deletes
- [ ] `appointment_details` — id, assignment_id, notes, customer_confirmed, timestamps
- [ ] `coarse_allocations` — id, employee_id, date, type, value, timestamps
- [ ] `employee_availabilities` — id, employee_id, date, is_available, reason, timestamps
- [ ] `conflict_records` — id, assignment_id, type, description, resolved, timestamps
- [ ] `recurrence_patterns` — id, assignable_type (morph), assignable_id, frequency, interval, end_date, timestamps
- [ ] `work_types` — id, name, color, code, is_active, timestamps

### 1.7 Tasks (7 modèles → ~8 tables)
- [ ] `tasks` — id, task_list_id, parent_task_id (self-ref, max 3 levels), title, description, status, priority, assignee_id, due_date, source_type (morph), source_id, sort_order, timestamps, soft_deletes
- [ ] `task_lists` — id, name, workspace_id, is_default, timestamps, soft_deletes
- [ ] `task_list_members` — id, task_list_id, user_id, role, timestamps
- [ ] `task_folders` — id, parent_id (self-ref), name, sort_order, timestamps
- [ ] `task_attachments` — id, task_id, file_path, filename, mime_type, size, timestamps
- [ ] `task_notes` — id, task_id, user_id, content, timestamps
- [ ] `task_reminders` — id, task_id, user_id, remind_at, sent, timestamps

### 1.8 Document Templates (8 modèles → ~9 tables)
- [ ] `document_templates` — id, name, type, content, is_active, timestamps
- [ ] `template_versions` — id, template_id, version, content, timestamps
- [ ] `generated_documents` — id, template_id, entity_type (morph), entity_id, file_path, timestamps
- [ ] `email_body_templates` — id, name, subject, body, timestamps
- [ ] `email_records` — id, to, from, subject, body, status, sent_at, timestamps
- [ ] `ci_assets` — id, type, path, timestamps
- [ ] `ci_configurations` — id, key, value (JSON), timestamps
- [ ] `document_generation_batches` — id, template_id, status, count, timestamps

### 1.9 Notifications (6 modèles → ~7 tables)
- [ ] `notifications` — table native Laravel (id, type, notifiable_type, notifiable_id, data JSON, read_at, timestamps)
- [ ] `notification_deliveries` — id, notification_id, channel, status, sent_at, error, timestamps
- [ ] `notification_templates` — id, name, type, subject, body, channels (JSON), timestamps
- [ ] `scheduled_notifications` — id, notification_template_id, scheduled_at, status, criteria (JSON), timestamps
- [ ] `in_app_notifications` — id, user_id, title, body, deep_link, category, priority, icon, read_at, timestamps
- [ ] `user_notification_preferences` — id, user_id, channel, type, enabled, timestamps

### 1.10 Mobile (12 modèles → ~13 tables)
- [ ] `time_entries` — id, user_id, project_id, date, start_time, end_time, duration, type, description, timestamps, soft_deletes
- [ ] `work_reports` — id, user_id, assignment_id, date, content (JSON), status, timestamps
- [ ] `device_tokens` — id, user_id, token, platform, is_active, timestamps
- [ ] `mobile_photos` — id, work_report_id, file_path, caption, timestamps
- [ ] `chat_messages` — id, chat_room_id, user_id, content, timestamps
- [ ] `material_line_items` — id, work_report_id, article_id, quantity, unit_price, timestamps
- [ ] `user_favorites` — id, user_id, favorable_type (morph), favorable_id, timestamps
- [ ] `catalog_items_mobile` — id, article_id, cached_data (JSON), timestamps
- [ ] `notification_logs` — id, device_token_id, notification_id, status, timestamps
- [ ] `office_work_categories` — id, name, type, is_active, timestamps
- [ ] `work_time_settings` — id, key, value, timestamps

### 1.11 AI (8 modèles → ~8 tables)
- [ ] `voice_commands` — id, name, pattern, action, timestamps
- [ ] `voice_sessions` — id, user_id, status, started_at, ended_at, timestamps
- [ ] `voice_session_entities` — id, voice_session_id, entity_type, entity_value, timestamps
- [ ] `agent_runs` — id, user_id, agent_type, status, input (JSON), output (JSON), timestamps
- [ ] `tool_executions` — id, agent_run_id, tool_name, input (JSON), output (JSON), duration_ms, timestamps
- [ ] `workflow_states` — id, agent_run_id, state (JSON), timestamps
- [ ] `accuracy_metrics` — id, agent_run_id, metric_type, value, timestamps
- [ ] `custom_vocabularies` — id, term, definition, category, timestamps

### 1.12 Autres modules (~25 tables)
- [ ] `vehicles` — id, license_plate, make, model, year, status, timestamps, soft_deletes
- [ ] `vehicle_materials` — id, vehicle_id, article_id, quantity, timestamps
- [ ] `vehicle_notes` — id, vehicle_id, user_id, content, timestamps
- [ ] `vehicle_service_entries` — id, vehicle_id, date, type, description, cost, timestamps
- [ ] `projects` — id, customer_id, site_id, project_number, name, type, status, planned_start_date, timestamps, soft_deletes
- [ ] `project_documents` — id, project_id, file_path, type, timestamps
- [ ] `project_status_histories` — id, project_id, from_status, to_status, user_id, timestamps
- [ ] `schedule_entries` — id, project_id, date, start_time, end_time, description, timestamps
- [ ] `partner_confirmations` — id, project_id, partner_name, status, timestamps
- [ ] `preparatory_actions` — id, project_id, title, status, due_date, timestamps
- [ ] `integration_configs` — id, provider, credentials (encrypted), settings (JSON), is_active, timestamps
- [ ] `integration_sync_logs` — id, integration_id, direction, status, records_count, timestamps
- [ ] `integration_health_checks` — id, integration_id, status, checked_at, timestamps
- [ ] `calendar_connections` — id, user_id, provider, access_token (encrypted), refresh_token (encrypted), timestamps
- [ ] `widget_configs` — id, name, settings (JSON), is_active, timestamps
- [ ] `widget_submissions` — id, widget_config_id, data (JSON), timestamps
- [ ] `file_metadata` — id, original_name, path, mime_type, size, folder_id, uploaded_by, timestamps, soft_deletes
- [ ] `file_folders` — id, parent_id (self-ref), name, timestamps
- [ ] `chat_rooms` — id, name, type, timestamps
- [ ] `meetings` — id, title, date, start_time, end_time, location, organizer_id, timestamps
- [ ] `leave_requests` — id, user_id, type, start_date, end_date, status, approved_by, timestamps
- [ ] `vacation_balances` — id, user_id, year, total_days, used_days, timestamps
- [ ] `field_tickets` — id, customer_id, site_id, title, description, status, priority, assigned_to, timestamps, soft_deletes
- [ ] `document_indices` — id, documentable_type (morph), documentable_id, content, timestamps
- [ ] `migration_runs`, `migration_domain_statuses`, `migration_errors`, `migration_record_maps`, `migration_source_records`, `migration_spot_checks` — tables pour l'outil de migration de données

---

## Phase 2 — Infrastructure transversale (Shared)

### 2.1 Middleware (13 → équivalents Laravel)
- [ ] `authenticate` → Laravel Sanctum middleware (`auth:sanctum`)
- [ ] `requirePermission` → Custom middleware + Spatie Permission
- [ ] `responseEnvelope` → Custom `JsonResponse` macro ou API Resource wrapper
- [ ] `requestId` → Middleware custom `X-Request-ID` (ou package)
- [ ] `requestLogger` → Middleware custom logging structuré
- [ ] `rateLimiter` → `RateLimiter` natif Laravel (`throttle:`)
- [ ] `cors` → `config/cors.php` natif Laravel
- [ ] `securityHeaders` → Middleware custom (ou `spatie/laravel-csp`)
- [ ] `compression` → Géré par nginx/reverse proxy
- [ ] `notFound` → `Handler::render()` dans `Exceptions/Handler.php`
- [ ] `errorHandler` → `Handler::render()` avec format envelope
- [ ] `mongoSanitize` → Non nécessaire avec MySQL/Eloquent (SQL injection prévenu par prepared statements)
- [ ] `swagger` → `darkaonline/l5-swagger` ou Scribe

### 2.2 Cache (Two-tier L1/L2)
- [ ] Configurer Redis comme cache driver Laravel
- [ ] Implémenter le cache L1 in-process si nécessaire (`Spatie\LaravelCache` ou custom)
- [ ] Porter les patterns d'invalidation de cache
- [ ] Metrics hit/miss pour Prometheus

### 2.3 Event System
- [ ] Mapper les domain events vers Laravel Events + Listeners
- [ ] Créer l'envelope d'événement (id, type, source, correlationId, timestamp, version, payload)
- [ ] Enregistrer les 13+ subscribers modules
- [ ] Cache invalidation via events

### 2.4 Error Handling
- [ ] Créer `AppException` base class avec retry logic
- [ ] Mapper les erreurs Eloquent (validation, unique constraint, etc.)
- [ ] Format de réponse d'erreur standardisé (envelope)
- [ ] Codes d'erreur custom enum

### 2.5 Utilitaires
- [ ] `crypto` → Laravel Crypt facade + JWT handling
- [ ] `csv` → `maatwebsite/excel`
- [ ] `queryBuilder` → Eloquent query scopes
- [ ] `pagination` → Laravel pagination native (cursor + offset)
- [ ] `documentFilename` → Helper function
- [ ] `analyticsGenerator` → Service class
- [ ] `zipStore` → `ZipArchive` PHP natif
- [ ] `sanitize` → Purifier HTML (`mews/purifier`)

### 2.6 PDF Generation
- [ ] Porter PDFKit → DomPDF ou Snappy
- [ ] Swiss QR Bill → Trouver un package PHP équivalent (`sprain/swiss-qr-bill`)
- [ ] Templates PDF pour factures, devis, documents

### 2.7 Mail
- [ ] Porter les templates EJS → Blade mail templates
- [ ] Configurer les Mailables Laravel
- [ ] Queue-based dispatch (natif Laravel)

### 2.8 Storage
- [ ] Configurer Laravel Filesystem (S3 + local)
- [ ] Presigned URLs via `Storage::temporaryUrl()`
- [ ] File cleanup scheduled command
- [ ] Max file size via validation rules

---

## Phase 3 — Modules métier (par ordre de complexité croissante)

### Tier 1 — Modules simples (1-4 endpoints chacun)

#### 3.1 Health (2 endpoints)
- [ ] `GET /health` — DB + Redis + Queue connectivity check
- [ ] Controller, route, pas de modèle

#### 3.2 System (8 endpoints)
- [ ] Routes + Controller pour configuration système
- [ ] Service system info

#### 3.3 Dashboard (2 endpoints)
- [ ] Routes + Controller pour analytics dashboards
- [ ] Requêtes d'agrégation SQL

### Tier 2 — Modules moyens

#### 3.4 Files (9 endpoints)
- [ ] FileController : upload, download, list, delete
- [ ] FolderController : CRUD dossiers
- [ ] Intégration Laravel Filesystem / MediaLibrary
- [ ] Presigned URLs

#### 3.5 Chat (20 endpoints)
- [ ] ChatRoomController : CRUD rooms
- [ ] MessageController : CRUD messages
- [ ] Broadcasting via Laravel Reverb (remplacement Socket.IO)
- [ ] Online status tracking

#### 3.6 Meetings (12 endpoints)
- [ ] MeetingController : CRUD complet
- [ ] Participants, invitations

#### 3.7 Vehicles (17 endpoints)
- [ ] VehicleController : CRUD
- [ ] VehicleMaterialController
- [ ] VehicleNoteController
- [ ] VehicleServiceEntryController

#### 3.8 Time Tracking (21 endpoints)
- [ ] TimeEntryController : CRUD + filtres
- [ ] LeaveRequestController : CRUD + workflow approbation
- [ ] VacationBalanceController

#### 3.9 Field Tickets (12 endpoints)
- [ ] FieldTicketController : CRUD + workflow statut
- [ ] Escalation logic

#### 3.10 Document Index (11 endpoints)
- [ ] DocumentIndexController
- [ ] Full-text search via Laravel Scout

### Tier 3 — Modules complexes

#### 3.11 Auth (37 endpoints)
- [ ] AuthController : login, logout, refresh, forgot/reset password (12 endpoints)
- [ ] UserController : CRUD, profile, preferences, activation (20 endpoints)
- [ ] RoleController : CRUD + permission assignment (5 endpoints)
- [ ] Sanctum token management
- [ ] Redis session validation
- [ ] Account lockout logic (failed attempts, window, duration)
- [ ] Permission implication system (50+ rules)
- [ ] Audit logging de tous les événements auth
- [ ] Password history check

#### 3.12 Tasks (59 endpoints)
- [ ] TaskController : CRUD + bulk operations (21 endpoints)
- [ ] TaskListController : CRUD + members (14 endpoints)
- [ ] TaskFolderController : CRUD hiérarchique (6 endpoints)
- [ ] TaskDashboardController : agrégations (6 endpoints)
- [ ] TaskNoteController (4 endpoints)
- [ ] TaskReminderController (4 endpoints)
- [ ] TaskAttachmentController (4 endpoints)
- [ ] Broadcasting temps réel des updates tasks
- [ ] Subtasks (parentTaskId, max 3 niveaux)
- [ ] Source polymorphique (project, order, site, etc.)

#### 3.13 Notifications (31 endpoints)
- [ ] NotificationController (7 endpoints)
- [ ] NotificationFeedController (5 endpoints)
- [ ] ScheduledNotificationController (8 endpoints)
- [ ] NotificationTemplateController (6 endpoints)
- [ ] NotificationPreferenceController (2 endpoints)
- [ ] NotificationWebhookController (2 endpoints)
- [ ] NotificationMetricsController (1 endpoint)
- [ ] Multi-channel delivery (push, email, in-app) via Laravel Notifications
- [ ] Deep links, categories, priorities
- [ ] Delivery tracking

#### 3.14 Deploy/Scheduling (34 endpoints)
- [ ] AppointmentController (6 endpoints)
- [ ] AssignmentController (6 endpoints)
- [ ] CoarseController (6 endpoints)
- [ ] WorkTypeController (4 endpoints)
- [ ] DeployDashboardController (4 endpoints)
- [ ] ConflictController (3 endpoints)
- [ ] MobileDeployController (3 endpoints)
- [ ] CalendarController (1 endpoint)
- [ ] EmployeeController (1 endpoint)
- [ ] Conflict detection logic
- [ ] Recurrence patterns

#### 3.15 Document Templates (43 endpoints)
- [ ] TemplateController (15 endpoints)
- [ ] DocumentController (9 endpoints)
- [ ] EmailTemplateController (7 endpoints)
- [ ] CIController (6 endpoints)
- [ ] EmailController (5 endpoints)
- [ ] WebhookController (1 endpoint)
- [ ] Document generation engine (Blade templates → PDF)
- [ ] Batch generation
- [ ] Webhook signature verification

#### 3.16 Integrations (22 endpoints)
- [ ] IntegrationAdminController (10 endpoints)
- [ ] WidgetAdminController (5 endpoints)
- [ ] CalendarSyncController (4 endpoints) — Outlook, Google Calendar
- [ ] WidgetPublicController (3 endpoints)
- [ ] Health checks pour intégrations tierces

#### 3.17 AI (32 endpoints)
- [ ] AgentController (10 endpoints)
- [ ] VoiceSessionController (7 endpoints)
- [ ] CustomVocabularyController (5 endpoints)
- [ ] VoiceCommandController (5 endpoints)
- [ ] AIAnalyticsController (3 endpoints)
- [ ] AIDocumentController (2 endpoints)
- [ ] Intégration OpenAI (porter tel quel, pas de changement de provider)
- [ ] LangChain/LangGraph → évaluer équivalent PHP ou garder en microservice Node

#### 3.18 Project Management (18 endpoints)
- [ ] ProjectController (16 endpoints) : CRUD + status workflow + archive
- [ ] PMController (2 endpoints)
- [ ] Schedule entries, preparatory actions, partner confirmations
- [ ] Project documents
- [ ] Status history tracking

#### 3.19 Mobile (38 endpoints, 21 route files)
- [ ] OrderController (11 endpoints)
- [ ] CatalogController (6 endpoints)
- [ ] TicketController (6 endpoints)
- [ ] MaterialController (4 endpoints)
- [ ] OfficeWorkCategoryController (4 endpoints)
- [ ] SyncController (2 endpoints)
- [ ] WorkTimeSettingsController (2 endpoints)
- [ ] + 7 controllers à 1 endpoint chacun
- [ ] Device token management pour push notifications
- [ ] Mobile-specific data formats et optimisations

### Tier 4 — Modules critiques (les plus complexes)

#### 3.20 Catalog (64 endpoints)
- [ ] ArticleController (13 endpoints) : CRUD + versions + images
- [ ] IGHController (10 endpoints) : sync externe
- [ ] CatalogCategoryController (8 endpoints) : hiérarchie
- [ ] CatalogConnectionController (7 endpoints)
- [ ] PriceController (6 endpoints) : historique prix
- [ ] CatalogMarkupRuleController (6 endpoints)
- [ ] TextBlockController (5 endpoints)
- [ ] PickerController (4 endpoints)
- [ ] UnitOfMeasureController (4 endpoints)
- [ ] CatalogSearchController (1 endpoint)
- [ ] IGH import/sync logic
- [ ] Catalog snapshot pour les line items

#### 3.21 QOP (71 endpoints)
- [ ] InvoiceController (17 endpoints) : CRUD + workflow + QR Bill
- [ ] QuotationController (15 endpoints) : CRUD + workflow + envoi
- [ ] OrderController (10 endpoints) : CRUD + conversion devis→commande
- [ ] SearchController (9 endpoints) : recherche cross-entité
- [ ] QuotationTemplateController (7 endpoints)
- [ ] AppointmentReminderController (6 endpoints)
- [ ] DocumentNumberSequenceController (4 endpoints) : séquences auto
- [ ] DepartmentController (3 endpoints)
- [ ] Pipeline Quotation → Order → Invoice
- [ ] Numérotation automatique
- [ ] Swiss QR Bill generation

#### 3.22 CRM (117 endpoints)
- [ ] CustomerController (25 endpoints) : CRUD + merge + search + export
- [ ] SparePartController (14 endpoints)
- [ ] InstallationController (12 endpoints) : CRUD + maintenance
- [ ] NewsletterController (12 endpoints) : CRUD + envoi + delivery tracking
- [ ] SiteController (11 endpoints) : CRUD + sous-entités (addresses, details)
- [ ] MaintenanceController (8 endpoints) : intervalles + scheduling
- [ ] ContactController (7 endpoints)
- [ ] SupplierController (6 endpoints)
- [ ] PurchaseOrderController (6 endpoints)
- [ ] AssetMaintenanceController (4 endpoints)
- [ ] ContactLogController (4 endpoints)
- [ ] ProcurementController (3 endpoints)
- [ ] NoteController (2 endpoints)
- [ ] ImageController (1 endpoint)
- [ ] AddressBookController (1 endpoint)
- [ ] Customer merge logic
- [ ] Full-text search pondéré

#### 3.23 Accounting (153 endpoints) — LE PLUS CRITIQUE
- [ ] AccountingDocumentController (15 endpoints)
- [ ] ARReceivablesController (15 endpoints)
- [ ] APInvoiceController (14 endpoints)
- [ ] RecurringTransactionController (11 endpoints)
- [ ] TaxController (11 endpoints) : codes, groupes, exemptions, transactions
- [ ] BankingController (9 endpoints) : comptes, transactions, import relevés
- [ ] AccountController (8 endpoints) : plan comptable hiérarchique
- [ ] BudgetController (8 endpoints)
- [ ] FixedAssetController (8 endpoints) : amortissements, runs
- [ ] ExchangeRateController (7 endpoints) : taux de change, réévaluation
- [ ] ReconciliationController (7 endpoints) : rapprochement bancaire + auto-learning
- [ ] ReportsController (6 endpoints) : bilan, compte de résultat, etc.
- [ ] AccountingEntityController (6 endpoints)
- [ ] FiscalPeriodController (5 endpoints) : ouverture/clôture périodes
- [ ] JournalEntryController (5 endpoints) : écritures comptables
- [ ] InventoryAccountingController (5 endpoints)
- [ ] OpenItemsController (5 endpoints) : postes ouverts
- [ ] AccountMappingController (3 endpoints)
- [ ] CashManagementController (3 endpoints)
- [ ] AccountingSearchController (1 endpoint)
- [ ] DashboardController (1 endpoint)
- [ ] Auto-réconciliation avec learning rules
- [ ] Calculs d'amortissement (linéaire, dégressif)
- [ ] Réévaluation des devises
- [ ] Transactions récurrentes
- [ ] Clôture de périodes fiscales
- [ ] Plan comptable hiérarchique (comptes parent/enfant)

---

## Phase 4 — Background Jobs (43 jobs → Laravel Jobs)

### 4.1 Email & Communication
- [ ] `AuthEmailJob` → Mailable queued
- [ ] `EmailDispatchJob` → Mailable queued
- [ ] `NotificationChannelEmailJob` → Laravel Notification channel
- [ ] `NotificationDispatchJob` → Laravel Notification
- [ ] `NotificationChannelPushJob` → Firebase/APNs via Laravel Notification
- [ ] `NotificationChannelInAppJob` → Database notification

### 4.2 Documents
- [ ] `DocumentGenerationJob` → PDF generation queued
- [ ] `OcrProcessingJob` → OCR HTTP call queued

### 4.3 Accounting
- [ ] `AutoReconciliationJob`
- [ ] `InvoiceOverdueJob` → Scheduled command
- [ ] `PaymentBatchJob`
- [ ] `BankStatementImportJob`

### 4.4 Scheduling & Reminders
- [ ] `AppointmentReminderJob`
- [ ] `FieldTicketEscalationJob`
- [ ] `TaskReminderDispatchJob`
- [ ] `QuotationExpiryJob`
- [ ] `PrepActionOverdueJob`
- [ ] `DailyReportReminderJob`
- [ ] `ReportEscalationJob`

### 4.5 Sync & Integration
- [ ] `CatalogSyncJob`
- [ ] `IGHScheduledSyncJob`
- [ ] `IntegrationHealthCheckJob`
- [ ] `CalendarSyncJob`

### 4.6 AI
- [ ] `AIAgentJob`
- [ ] `AIAgentTimeoutJob`
- [ ] `AITranscriptionJob`
- [ ] `AIAccuracyAggregationJob`

### 4.7 Maintenance & Cleanup
- [ ] `MaintenanceCheckJob`
- [ ] `ProjectArchiveJob`
- [ ] `FileCleanupJob`
- [ ] `AuditCleanupJob`
- [ ] `HealthCheckJob`

### 4.8 Scheduler (Console Kernel)
- [ ] Configurer `routes/console.php` avec les tâches planifiées (cron équivalents)
- [ ] Installer Laravel Horizon pour le monitoring des queues

---

## Phase 5 — Real-time (Socket.IO → Laravel Reverb)

- [ ] Installer et configurer Laravel Reverb
- [ ] Définir les channels :
  - [ ] `tasks.workspace` — Private channel
  - [ ] `tasks.list.{listId}` — Private channel
  - [ ] `time-tracking.workspace` — Private channel
  - [ ] `user.{userId}` — Private channel (notifications personnelles)
- [ ] Créer les Events broadcastables :
  - [ ] `TaskUpdated`, `TaskCreated`, `TaskDeleted`
  - [ ] `TimeEntryUpdated`
  - [ ] `NotificationReceived`
  - [ ] `ChatMessageSent`
- [ ] Authentification des channels privés dans `routes/channels.php`
- [ ] Online status tracking (Presence channels)
- [ ] Pending notification delivery on reconnect

---

## Phase 6 — Migration des données

- [ ] Écrire un script de migration MongoDB → MySQL
  - [ ] Mapper les ObjectId → UUID ou auto-increment IDs
  - [ ] Aplatir les sous-documents imbriqués en tables séparées
  - [ ] Convertir les champs Date MongoDB en datetime MySQL
  - [ ] Gérer les champs JSON (embedded objects → colonnes JSON ou tables)
  - [ ] Mapper les références polymorphiques
- [ ] Valider l'intégrité référentielle post-migration
- [ ] Tester avec un dump de production anonymisé
- [ ] Script de rollback en cas d'échec

---

## Phase 7 — Tests & Validation

- [ ] Tests unitaires pour chaque Service (PHPUnit)
- [ ] Tests d'intégration pour chaque endpoint (Feature tests Laravel)
- [ ] Comparer les réponses API Node vs Laravel (contract testing)
- [ ] Tests de performance (charge, temps de réponse)
- [ ] Tests de non-régression sur le module comptable
- [ ] Tests E2E avec le frontend existant

---

## Phase 8 — Déploiement

- [ ] Configurer le CI/CD pour le backend Laravel
- [ ] Dockeriser l'application Laravel
- [ ] Configurer nginx + PHP-FPM
- [ ] Configurer le monitoring (Prometheus + Grafana)
- [ ] Configurer les health checks Kubernetes/Docker
- [ ] Plan de migration zero-downtime (run both backends in parallel)
- [ ] Cutover plan : basculer le traffic API module par module

---

## Résumé des chiffres

| Élément | Estimation |
|---------|-----------|
| Tables MySQL à créer | ~180 |
| Migrations Laravel | ~60-80 fichiers |
| Controllers à écrire | ~130 |
| Form Requests (validation) | ~200+ |
| API Resources (transformers) | ~160+ |
| Services à porter | ~150 |
| Jobs Laravel | ~43 |
| Events + Listeners | ~30+ |
| Middleware custom | ~8 |
| Scheduled Commands | ~15 |
| Tests Feature | ~500+ |

---

## Risques principaux

1. **Module comptable** — 153 endpoints, logique financière complexe, zéro tolérance aux bugs
2. **Données MongoDB imbriquées** — Aplatir les embedded documents en tables relationnelles peut casser des logiques
3. **Performances** — Les agrégations MongoDB ne se traduisent pas toujours bien en SQL, surtout pour les rapports comptables
4. **LangChain/LangGraph** — Pas d'équivalent PHP mature, potentiellement garder en microservice Node
5. **Régression** — 847 endpoints = 847 possibilités de régression sans tests exhaustifs
6. **Swiss QR Bill** — Vérifier que le package PHP couvre les mêmes cas que le package Node

---

## Recommandation d'ordre de migration

```
Phase 0 (Fondations)
  → Phase 1 (Schema MySQL — toutes les tables d'un coup)
    → Phase 2 (Infrastructure transversale)
      → Tier 1 (Health, System, Dashboard)
        → Tier 2 (Files, Chat, Meetings, Vehicles, TimeTracking, FieldTickets, Documents)
          → Phase 4-5 en parallèle (Jobs + Reverb)
            → Tier 3 (Auth, Tasks, Notifications, Deploy, DocTpl, Integrations, AI, PM, Mobile)
              → Tier 4 (Catalog, QOP, CRM)
                → Accounting (dernier, le plus critique)
                  → Phase 6 (Migration données)
                    → Phase 7-8 (Tests + Deploy)
```
