# Detailed Service Agreement (Statement of Work)

**As of:** 22 March 2026  
**Note:** Updates as of 16 March 2026, 23:30 are indicated in the source document in blue type.

**MB Boiler & Heizung AG**  
Hohestrasse 199  
4104 Oberwil, Switzerland

*Annex to the work contract (Werkvertrag)*

---

## 1. Subject matter of the contract

The subject of the project is the conception, development, implementation, and operational delivery of a tailored digital software solution for the client. The software solution consists of:

a. a web-based application for administration, dispatching, project execution, and office organisation, and  

<!-- b. a mobile application for field staff on iOS and Android. -->

The software is intended to digitally represent, support, and manage the client’s operational business processes, in particular in the areas of CRM, plant and asset management, project management, field deployment planning, service reports, quotations, order processing, document management, materials management, task management, user management, and data migration from existing systems.

Unless otherwise agreed below, the contractor owes a functionally usable work product in accordance with this service agreement, the technical requirements, the agreed interfaces, and the defined acceptance criteria.

---

## 2. Module: CRM and plant / asset management

The contractor shall implement a module for central management of customers, contacts, sites (objects), and technical installations.

### 2.1 Scope of services

The module shall include in particular the following functions:

- Management of customer master data  
- Management of multiple contacts per customer  
- Address book function  
  - Visible in the mobile app for office / admin  
  - Customer capture via mobile possible  
- Management of sites (objects)  
- Management of technical installations per site  
- Capture and storage of installation information  
- Recording and management of maintenance intervals  
- Automatic marking of due maintenance  
- History of all orders and service assignments per site and installation  
- Storage and assignment of images  
- Recording of special notes per site or installation  
- Recording of spare parts and ordering information  
- Option to send newsletters via WhatsApp / email  
- Plugin on our website so customers can enter an order online directly  
  - Service order for repair or maintenance  
  - All inputs are entered directly in our system in the correct place  
  - Option to categorise (heating / sanitary / miscellaneous) / (priority: low / medium / high)

### 2.2 Acceptance criteria

The module shall be deemed ready for acceptance when the aforementioned master data objects can be created, edited, searched, filtered, and linked with one another, and when due maintenance is displayed correctly by the system.

---

## 3. Module: Project management

The contractor shall implement a module for managing and organising projects.

### 3.1 Scope of services

The module shall include in particular:

- Creation and management of projects  
- Overview of project status  
- Management of project-related preparatory actions, in particular funding applications, material orders, and scheduling  
  - Option to create a construction site schedule, including sending appointment confirmations to all partner companies  
- Creation of project-related documents  
- Document repository per project

### 3.2 Acceptance criteria

The module shall be deemed ready for acceptance when projects can be created, edited, and evaluated with status, appointments, documents, and assigned tasks.

---

## 4. Module: Field deployment planning

The contractor shall implement a calendar-based system for planning and assigning staff to projects and service assignments.

### 4.1 Scope of services

The module shall include in particular:

- Calendar-based deployment planning  
- Assignment of employees to orders, projects, and service assignments  
- Appointment management  
- Overview of planned assignments  
- Provision of relevant assignment information in the mobile app  

*Variant OF-Bau:* for coarse / high-level scheduling.

### 4.2 Acceptance criteria

The module shall be deemed ready for acceptance when assignments can be created, changed, and rescheduled on a calendar basis and assigned to individual employees, and when these are visible in the mobile app.

---

## 5. Module: Mobile technician app

<!-- The contractor shall implement a mobile application for iOS and Android to support field staff. -->

### 5.1 Scope of services

The mobile app shall include in particular:

- Overview of all orders assigned to the employee  
- Access to order, site, and installation information  
- Creation and editing of work reports  
- Recording of service line items and material lists in accordance with IGH and the company-internal catalogue  
- Assignment of small orders within a project  
- Document access and document storage per order  
- Photo documentation for archive and current work  
- Mobile time recording  
- System-side lock so that time reports can only be released when the related report has been fully submitted  
- Project-related chat function  
- Installation overview for employees  
- Offline use for defined core functions with automatic synchronisation after connectivity is restored  
- Push notifications for new tasks, changes to orders, chat messages, and due tasks  
- Option to store the quotation without prices for technicians  
- Daily reminder for technicians when tasks are not reported / completed via report  
- *(Further bullet as in source—empty in original.)*

### 5.2 Offline functionality

The following shall be available offline at minimum:

- Display of already assigned orders  
- Viewing of already synchronised site and order data  
- Report capture  
- Photo capture  
- Time recording

### 5.3 Acceptance criteria

The module shall be deemed ready for acceptance when the functions described in Clauses 5.1 and 5.2 are available in a productively usable version on iOS and Android.

*Reference in source: example “Benetics AI” (illustrative).*

---

## 6. Module: AI assistant

The contractor shall integrate a voice-based assistant to support data entry and document creation.

### 6.1 Scope of services

The AI assistant shall include in particular:

- Voice-supported creation of orders  
- Recording of spoken reports  
- Speech-to-text conversion  
- Structured processing of recognised content  
- Support for creating documents based on defined templates and existing system data  
- Voice-supported capture of customer addresses  
- Support for selected application functions via voice input  
- Support for defined foreign languages as per annex “language scope”

---

## 7. Module: Quotations and order processing (together with CRM)

The contractor shall implement a module for creating, managing, and further processing quotations, orders, and invoices.

### 7.1 Scope of services

The module shall include in particular:

- Creation of quotations  
- Management of quotation status  
- Reminder function for following up open quotations  
- Conversion of quotations into orders  
- Creation of order confirmations  
- Assignment of documents to customers and projects  
- Creation of invoices from quotations  
- Creation of pro forma / advance invoices (*Akontorechnungen*)  
- Automatic deduction of advance payments on final invoices  
- Invoice status tracking  
- Search and filter functions  
- Automatic numbering of all documents  
- Filtering by department  
- Option to create multilingual document versions  
- Interface to WhatsApp / email for automatic appointment reminders to customer and employee

### 7.2 Clarification

Graphical formatting of documents is based on the agreed templates. Unlimited correction loops are not owed. The work price includes at most **[X]** correction rounds per template type.

### 7.3 Acceptance criteria

The module shall be deemed ready for acceptance when quotations, orders, advance invoices, final invoices, and status changes can be created and processed in accordance with the release process.

*Reference in source: example images of OF software (illustrative).*

---

## 8. Module: Document templates and layout system

The contractor shall implement a template and layout system for standardised business documents.

### 8.1 Scope of services

The module shall include in particular:

- Creation of templates for quotations, order confirmations, and invoices  
- Creation of further templates, in particular cover letters  
- Definition of individual layouts  
- Automatic document generation from system data  
- PDF export  
- Email dispatch from the system

### 8.2 Design principles

Implementation shall follow these client specifications:

- Fonts: Museo Sans 300 as well as Museo Sans 500 / 700  
- Default body text size: 10 pt  
- Logo and colour values according to the client’s corporate identity guidelines

### 8.3 Acceptance criteria

Acceptance is based on approved sample documents per template type.

**Foundations (as stated):**

- Standard font: Museo Sans 300  
- Bold font: Museo Sans 500 / 700  
- Default size 10 in body text  
- **Logo:** file reference in source: `mb_boiler_heizung_ag_cmyk.eps`  
- **CMYK values:**  
  - Blue: C100 / M85 / Y2 / K0  
  - Red: C10 / M100 / Y95 / K2  

---

## 9. Module: Material catalogues and interfaces

The contractor shall implement a module for managing materials, services, and text blocks.

### 9.1 Scope of services

The module shall include in particular:

- Company-internal article catalogues  
- Management of materials and services  
- Use of articles in quotations, orders, and reports  
- Text blocks with prices  
- Prepared or implemented interface to IGH industry catalogues as per separate interface specification

### 9.2 Clarification

Interfaces to third-party systems are only owed to the extent that their technical documentation, access, licences, and cooperation obligations are made available in good time.

---

## 10. Module: Accounting

The contractor shall implement an integrated accounting module with functions to support accounts receivable and accounts payable processes.

### 10.1 Scope of services

The module shall include in particular:

- Accounts receivable  
- Creation and management of invoices  
- Management of open receivables  
- Recording and allocation of incoming payments  
- Accounts payable  
- Recording of supplier invoices  
- Management of open payables  
- Upload or scan of supplier invoices  
- OCR-supported recognition of relevant invoice data  
- Allocation to supplier and accounting structure  
- Storage of documents in the archive  
- Bank connection as per defined banking interface  
- Automatic or semi-automatic reconciliation of payments  
- Cash management  
- Document scanning via mobile app  
- Allocation of documents to employees  
- Accounting journal  
- Account overviews  
- Open-item management

### 10.2 Clarification

The functional scope aligns with the agreed requirements and not blanket-wise with any specific third-party product. A full replication of Infoniqa Sage 50 is only owed where individual functions are expressly agreed in writing.

### 10.3 Scope exclusion

Tax, audit, or commercial-law professional responsibility for annual financial statements, balance sheet preparation, or closing entries is not part of the software development unless expressly agreed separately.

---

## 11. Module: Task management

The contractor shall implement an integrated task and to-do system.

### 11.1 Scope of services

The module shall include in particular:

- Creation and management of tasks  
- Multiple task lists  
- Assignment to projects, orders, or personal lists  
- Due dates  
- Reminder functions  
- Prioritisation  
- Marking as completed  
- Subtasks  
- Notes  
- File uploads  
- Group lists  
- Synchronisation between web platform and mobile app  
- Personal task overviews  
- Integration into project and order structures

### 11.2 Acceptance criteria

The module shall be deemed ready for acceptance when tasks can be created, edited, assigned, and synchronised in the structures described.

---

## 12. Users and role management

The contractor shall implement a role-based system for managing users and access rights.

### 12.1 Scope of services

The module shall include in particular:

- User management  
- Role-based permission assignment  
- Access control per module

### 12.2 Acceptance criteria

The module shall be deemed ready for acceptance when user roles with differentiated module access can be created and enforced.

---

## 13. Data migration

The contractor shall perform the technical migration of legacy data provided by the client from the old systems.

### 13.1 Data sources

Migration shall cover in particular data from:

- OF software  
- Messerli CRM  
- Further data sources defined in writing by the parties

### 13.2 Migration scope

To be migrated, where technically available and assignable in business terms:

- Addresses  
- Quotations  
- Invoices  
- Plant / installation data  
- Further data types defined in writing

### 13.3 Cooperation and scope boundary

The client shall provide source data in an evaluable form, complete and on schedule. Professional cleansing of materially incorrect, incomplete, or duplicate legacy data is only owed where expressly agreed.

### 13.4 Acceptance criteria

Data migration shall be deemed ready for acceptance when migrated data have been imported, spot-checked, and released in accordance with a jointly defined migration protocol.

---

## Additional provisions (contract drafting notes from source)

*The following points are noted in the source as still missing from a draft and as mandatory for the contract:*

### 1. Rights to source code

Upon full payment, the contractor grants the client all rights required for use, reproduction, editing, further development, maintenance, and handover to third parties in the individually created work results, including source code, configurations, data models, scripts, interface descriptions, and technical documentation.

### 2. Third-party software / open source

The contractor shall disclose all third-party components and open-source parts before use, stating the applicable licence terms and any restrictions.

### 3. Data protection / processing on behalf

Where employees, customers, contacts, photos, chat, and voice data are processed, proper data protection in accordance with Swiss law is required.

*The list in the source may be supplemented at any time.*

---

*End of document. Translated from German: “Detaillierte Leistungsvereinbarung, stand 22.03.2026.”*
