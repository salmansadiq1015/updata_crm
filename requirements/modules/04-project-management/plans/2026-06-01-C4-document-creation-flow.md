# C4: document-creation-flow Implementation Plan
> For agentic workers: REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans

**Goal:** Close PROJ-005 AC-1 (Create Document UI — template picker + variable review/edit + save-as-draft), AC-4 (draft/edit flow before finalise), AC-5 (email send for generated documents), and AC-6 (activity log surface on the project) so all four acceptance criteria are green end-to-end.

**Architecture:** The server already has `documentService.generate()` which calls `documentGenerationService.generate()` and creates a `ProjectDocument` record, but the flow is fire-and-forget with no draft state, no variable override before finalise, no email dispatch path, and no project-scoped activity log model. The client `DocumentsTab` has no "Generate Document" entry point beyond the hidden `generate` mutation — there is no template picker dialog, no variable review step, no draft badge, and no activity timeline. This cluster adds: (1) a `ProjectActivity` model and service layer that records create/generate/email events; (2) server endpoints for draft-generation preview, variable-patch-and-finalise, and document email send; (3) client dialogs for template selection, variable review/edit, draft state management, and email compose; (4) a new `ActivityTab` component wired into the project detail tab strip.

**Tech Stack:** Node/Express/Mongoose/Joi/Jest + Next.js/React Query/shadcn-ui/Vitest

---

## Pre-flight checklist

Before any task:

- Read `client/AGENTS.md` — this is a customised Next.js build; consult `node_modules/next/dist/docs/` before writing client-side API/routing code.
- All server tests: `cd server && npm test -- tests/pm/<file>`
- All client tests: `cd client && npx vitest run src/modules/pm/components/__tests__/<file>`
- Commit after each task.

---

## Task 1 — Server: ProjectActivity model + repository

### Why first
Every subsequent task (generate, email, restore) publishes activity events. The model must exist before service methods can call it. No route changes yet.

### 1-A Write failing test

File: `server/tests/unit/pm.activity.model.test.js` (new file)

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let ProjectActivity, User, Role;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  const mod = await import('../../src/modules/pm/projectActivity.model.js');
  ProjectActivity = mod.default;
  User = mongoose.model('User');
  Role = mongoose.model('Role');
});
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let seq = 0;
function nextSeq() { return ++seq; }

async function seedUser() {
  const role = await Role.create({ name: `R_${nextSeq()}`, permissions: [] });
  return User.create({
    email: `u${nextSeq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Test',
    lastName: 'Actor',
    role: role._id,
    status: 'active',
  });
}

describe('ProjectActivity model', () => {
  test('creates a document_generated activity record', async () => {
    const user = await seedUser();
    const projectId = new mongoose.Types.ObjectId();
    const docId = new mongoose.Types.ObjectId();

    const activity = await ProjectActivity.create({
      projectId,
      actorId: user._id,
      eventType: 'document_generated',
      payload: { documentId: docId, templateType: 'appointment_confirmation', fileName: 'test.pdf' },
    });

    expect(activity._id).toBeDefined();
    expect(activity.eventType).toBe('document_generated');
    expect(activity.payload.templateType).toBe('appointment_confirmation');
    expect(activity.createdAt).toBeInstanceOf(Date);
  });

  test('creates a document_emailed activity record', async () => {
    const user = await seedUser();
    const projectId = new mongoose.Types.ObjectId();
    const docId = new mongoose.Types.ObjectId();

    const activity = await ProjectActivity.create({
      projectId,
      actorId: user._id,
      eventType: 'document_emailed',
      payload: { documentId: docId, to: 'client@example.com', subject: 'Dokument' },
    });

    expect(activity.eventType).toBe('document_emailed');
    expect(activity.payload.to).toBe('client@example.com');
  });

  test('rejects unknown eventType', async () => {
    const user = await seedUser();
    const projectId = new mongoose.Types.ObjectId();
    await expect(
      ProjectActivity.create({
        projectId,
        actorId: user._id,
        eventType: 'unknown_event',
        payload: {},
      }),
    ).rejects.toThrow();
  });

  test('findByProject returns entries sorted by createdAt desc', async () => {
    const user = await seedUser();
    const projectId = new mongoose.Types.ObjectId();

    await ProjectActivity.create({ projectId, actorId: user._id, eventType: 'document_generated', payload: {} });
    await new Promise((r) => setTimeout(r, 10));
    await ProjectActivity.create({ projectId, actorId: user._id, eventType: 'document_emailed', payload: {} });

    const results = await ProjectActivity.find({ projectId }).sort({ createdAt: -1 }).lean();
    expect(results[0].eventType).toBe('document_emailed');
    expect(results[1].eventType).toBe('document_generated');
  });
});
```

Run: `cd server && npm test -- tests/pm/pm.activity.model.test.js` — expect FAIL (module not found).

### 1-B Implement

**File: `server/src/modules/pm/projectActivity.model.js`** (new file)

```js
import mongoose from 'mongoose';

const ACTIVITY_EVENT_TYPES = [
  'document_generated',
  'document_draft_created',
  'document_finalised',
  'document_emailed',
  'document_uploaded',
  'document_deleted',
  'document_restored',
  'project_created',
  'project_updated',
  'status_changed',
];

const projectActivitySchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    eventType: {
      type: String,
      enum: ACTIVITY_EVENT_TYPES,
      required: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

projectActivitySchema.index({ projectId: 1, createdAt: -1 });

const ProjectActivity = mongoose.model('ProjectActivity', projectActivitySchema);
export default ProjectActivity;
export { ACTIVITY_EVENT_TYPES };
```

**File: `server/src/modules/pm/projectActivity.repository.js`** (new file)

```js
import ProjectActivity from './projectActivity.model.js';

const POPULATE_ACTOR = { path: 'actorId', select: 'firstName lastName' };

class ProjectActivityRepository {
  async create(data) {
    const activity = new ProjectActivity(data);
    return activity.save();
  }

  async findByProject(projectId, { limit = 50, skip = 0 } = {}) {
    return ProjectActivity.find({ projectId })
      .populate(POPULATE_ACTOR)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();
  }

  async countByProject(projectId) {
    return ProjectActivity.countDocuments({ projectId });
  }
}

const projectActivityRepository = new ProjectActivityRepository();
export default projectActivityRepository;
```

Run: `cd server && npm test -- tests/pm/pm.activity.model.test.js` — expect PASS.

### 1-C Commit

```
git add server/src/modules/pm/projectActivity.model.js server/src/modules/pm/projectActivity.repository.js server/tests/unit/pm.activity.model.test.js
git commit -m "feat(pm): add ProjectActivity model and repository"
```

---

## Task 2 — Server: draft generation + finalise endpoints

### Why
AC-1 requires the user to review/edit variable values before generating the final PDF. The flow is: POST `/documents/generate/preview` → server renders variable defaults from project data, returns `{ draftVariables, templateType }` without writing any file; client edits variables; POST `/documents/generate/finalise` → server generates the real PDF and creates the `ProjectDocument`.

The existing `POST /documents/generate` remains untouched (it is already used by the schedule PDF export path). The new endpoints are additive.

### 2-A Write failing test

File: `server/tests/unit/pm.documentDraft.test.js` (new file)

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let documentService, Project, User, Role, Customer;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/pm/projectDocument.model.js');
  await import('../../src/modules/pm/projectActivity.model.js');
  const mod = await import('../../src/modules/pm/document.service.js');
  documentService = mod.default;
  Project = mongoose.model('Project');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  Customer = mongoose.model('Customer');
});
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let seq = 0;
function nextSeq() { return ++seq; }

async function seedUser() {
  const role = await Role.create({ name: `R_${nextSeq()}`, permissions: [] });
  return User.create({
    email: `u${nextSeq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Hans',
    lastName: 'Muster',
    role: role._id,
    status: 'active',
  });
}

async function seedProject(userId) {
  const n = nextSeq();
  const customer = await Customer.create({
    customerNumber: `K-${40000 + n}`,
    name: `Kunde ${n}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: userId,
  });
  return Project.create({
    projectNumber: `P-${10000 + n}`,
    name: `Projekt ${n}`,
    projectType: 'NEW_INSTALLATION',
    status: 'PLANNING',
    customerId: customer._id,
    projectManagerId: userId,
    createdBy: userId,
  });
}

describe('documentService.getGenerationPreview', () => {
  test('returns templateType and draftVariables for a valid project', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    const preview = await documentService.getGenerationPreview(
      project._id.toString(),
      'appointment_confirmation',
      user._id,
    );

    expect(preview).toHaveProperty('templateType', 'appointment_confirmation');
    expect(preview).toHaveProperty('draftVariables');
    expect(preview.draftVariables).toHaveProperty('projectName', `Projekt ${seq - 1}`);
    expect(preview.draftVariables).toHaveProperty('projectNumber');
    expect(preview.draftVariables).toHaveProperty('documentDate');
  });

  test('throws NotFoundError for unknown project', async () => {
    const user = await seedUser();
    const fakeId = new mongoose.Types.ObjectId();
    const { NotFoundError } = await import('../../src/shared/errors/AppError.js');
    await expect(
      documentService.getGenerationPreview(fakeId.toString(), 'appointment_confirmation', user._id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('documentService.generateDraft', () => {
  test('returns draftId and draftVariables without creating a ProjectDocument', async () => {
    const user = await seedUser();
    const project = await seedProject(user._id);

    const ProjectDocument = mongoose.model('ProjectDocument');
    const before = await ProjectDocument.countDocuments({ projectId: project._id });

    const draft = await documentService.generateDraft(
      project._id.toString(),
      'appointment_confirmation',
      { projectName: 'Overridden Name' },
      user._id,
    );

    const after = await ProjectDocument.countDocuments({ projectId: project._id });
    expect(draft).toHaveProperty('draftId');
    expect(draft).toHaveProperty('draftVariables');
    expect(draft.draftVariables.projectName).toBe('Overridden Name');
    expect(after).toBe(before); // no document created yet
  });
});
```

Run: `cd server && npm test -- tests/pm/pm.documentDraft.test.js` — expect FAIL (methods not found).

### 2-B Implement `getGenerationPreview` and `generateDraft` in `document.service.js`

Open `server/src/modules/pm/document.service.js`. Add the two new methods inside the `DocumentService` class, after the existing `generate()` method.

**Add import** at the top of `document.service.js` (after existing imports):

```js
import projectActivityRepository from './projectActivity.repository.js';
```

**Add method `getGenerationPreview`** after the `generate()` method:

```js
  async getGenerationPreview(projectId, templateType, userId) {
    const Project = (await import('./project.model.js')).default;
    const project = await Project.findById(projectId)
      .populate('customerId', 'name customerNumber street postalCode city canton')
      .populate('projectManagerId', 'firstName lastName email phone')
      .populate('siteId', 'name street postalCode city canton');
    if (!project) throw new NotFoundError('Project', projectId);

    const draftVariables = {
      documentNumber: project.projectNumber,
      documentDate: new Date().toISOString().split('T')[0],
      projectName: project.name,
      projectNumber: project.projectNumber,
      projectType: project.projectType,
      projectManager: project.projectManagerId
        ? `${project.projectManagerId.firstName} ${project.projectManagerId.lastName}`
        : null,
      customer: project.customerId
        ? {
            name: project.customerId.name,
            addressLine1: project.customerId.street || '',
            plz: project.customerId.postalCode || '',
            city: project.customerId.city || '',
          }
        : null,
      site: project.siteId
        ? {
            name: project.siteId.name,
            address: `${project.siteId.street || ''}, ${project.siteId.postalCode || ''} ${project.siteId.city || ''}`.trim(),
          }
        : null,
      plannedStartDate: project.plannedStartDate?.toISOString().split('T')[0] ?? null,
      plannedEndDate: project.plannedEndDate?.toISOString().split('T')[0] ?? null,
    };

    return { templateType, draftVariables };
  }
```

**Add method `generateDraft`** after `getGenerationPreview`:

```js
  async generateDraft(projectId, templateType, variableOverrides = {}, userId) {
    const preview = await this.getGenerationPreview(projectId, templateType, userId);
    const draftVariables = { ...preview.draftVariables, ...variableOverrides };
    // Store draft in a short-lived cache entry (10 min TTL).
    // Key format: pm:doc-draft:<projectId>:<userId>:<templateType>
    const draftId = `${projectId}:${userId}:${templateType}:${Date.now()}`;
    const cacheKey = `pm:doc-draft:${draftId}`;
    await cacheManager.set(cacheKey, { templateType, draftVariables, projectId, userId }, { l1Ttl: 600, l2Ttl: 600 });
    return { draftId, draftVariables };
  }
```

**Add method `finaliseFromDraft`** after `generateDraft`:

```js
  async finaliseFromDraft(draftId, userId, meta = {}) {
    const cacheKey = `pm:doc-draft:${draftId}`;
    const draft = await cacheManager.get(cacheKey);
    if (!draft) {
      const { ValidationError } = await import('../../shared/errors/AppError.js');
      throw new ValidationError('Draft has expired or does not exist. Please start a new generation.');
    }

    const { templateType, draftVariables, projectId } = draft;

    // Generate the real document using existing documentGenerationService
    const documentGenerationService = (await import('../doctpl/documentGeneration.service.js')).default;
    const generatedDoc = await documentGenerationService.generate({
      templateType,
      sourceModule: 'pm',
      sourceRecordId: projectId,
      data: draftVariables,
      language: 'de',
      generatedBy: userId,
      meta,
    });

    const doc = await documentRepository.create({
      projectId,
      fileId: generatedDoc.fileId,
      fileName: generatedDoc.fileName,
      category: 'REPORTS',
      isGenerated: true,
      uploadedBy: userId,
    });

    await this._invalidateCache(projectId);

    // Clear draft from cache
    await cacheManager.del(cacheKey);

    // Record activity
    await projectActivityRepository.create({
      projectId,
      actorId: userId,
      eventType: 'document_finalised',
      payload: { documentId: doc._id, templateType, fileName: generatedDoc.fileName },
    });

    eventBus.publish(EVENT_TYPES.PROJECT_DOCUMENT_GENERATED, {
      documentId: doc._id,
      projectId,
      templateType,
      userId,
    }, { source: 'pm:documents' });

    auditService.logEvent({
      eventType: 'project_document.generated',
      userId,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: doc._id, projectId, templateType, source: 'finalise_draft' },
      module: 'pm',
    });

    logger.info('Project document finalised from draft', {
      module: 'pm',
      action: 'finaliseFromDraft',
      documentId: doc._id,
      projectId,
      templateType,
    });

    return this._enrichDocument(await documentRepository.findById(doc._id));
  }
```

Run: `cd server && npm test -- tests/pm/pm.documentDraft.test.js` — expect PASS.

### 2-C Add validation schemas

Open `server/src/modules/pm/document.validation.js`. Append the following exports:

```js
export const previewDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    templateType: Joi.string().required().trim().max(100),
  }),
};

export const draftDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    templateType: Joi.string().required().trim().max(100),
    variableOverrides: Joi.object().default({}),
  }),
};

export const finaliseDocumentSchema = {
  params: Joi.object({ id: objectId.required() }),
  body: Joi.object({
    draftId: Joi.string().required().trim().max(256),
  }),
};
```

### 2-D Add controller methods

Open `server/src/modules/pm/document.controller.js`. Add three methods inside the `DocumentController` class, after the existing `generate()` method:

```js
  async preview(req, res, next) {
    try {
      const result = await documentService.getGenerationPreview(
        req.params.id,
        req.body.templateType,
        req.user._id,
      );
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async createDraft(req, res, next) {
    try {
      const result = await documentService.generateDraft(
        req.params.id,
        req.body.templateType,
        req.body.variableOverrides || {},
        req.user._id,
      );
      return res.success({ data: result });
    } catch (err) { next(err); }
  }

  async finalise(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const doc = await documentService.finaliseFromDraft(req.body.draftId, req.user._id, meta);
      return res.success({ data: doc, message: 'Document finalised successfully', statusCode: 201 });
    } catch (err) { next(err); }
  }
```

### 2-E Wire routes

Open `server/src/modules/pm/pm.routes.js`.

Add imports at the top of the import block for document validation (replace the existing destructured import of document schemas):

```js
import {
  listDocumentsSchema, uploadDocumentSchema, generateDocumentSchema,
  documentIdParamSchema, updateDocumentSchema, restoreDocumentSchema,
  previewDocumentSchema, draftDocumentSchema, finaliseDocumentSchema,
} from './document.validation.js';
```

Add three new routes inside the `documentRouter` block, after the existing `POST /generate` route and before the `GET /:docId` route:

```js
documentRouter.post(
  '/generate/preview',
  authenticate,
  requirePermission('projects:write'),
  validate(previewDocumentSchema),
  (req, res, next) => documentController.preview(req, res, next),
);
documentRouter.post(
  '/generate/draft',
  authenticate,
  requirePermission('projects:write'),
  validate(draftDocumentSchema),
  (req, res, next) => documentController.createDraft(req, res, next),
);
documentRouter.post(
  '/generate/finalise',
  authenticate,
  requirePermission('projects:write'),
  validate(finaliseDocumentSchema),
  (req, res, next) => documentController.finalise(req, res, next),
);
```

Run: `cd server && npm test -- tests/pm/pm.documentDraft.test.js` — expect PASS.

### 2-F Commit

```
git add server/src/modules/pm/document.service.js \
        server/src/modules/pm/document.validation.js \
        server/src/modules/pm/document.controller.js \
        server/src/modules/pm/pm.routes.js \
        server/tests/unit/pm.documentDraft.test.js
git commit -m "feat(pm): draft/preview/finalise document generation endpoints (AC-4)"
```

---

## Task 3 — Server: document email-send endpoint (AC-5)

### Why
AC-5 requires project documents to be emailable. The doctpl `email.service.send()` already supports a `documentId` (from `GeneratedDocument`) and queues the email via the `email-dispatch` job. The gap is: `ProjectDocument.fileId` points to a `FileMetadata` record, not a `GeneratedDocument`. We need a service method that resolves the `ProjectDocument` → `fileId` → retrieves the download URL → calls `email.service.send()` with the attachment populated directly. We also need a new `DOCUMENT_EMAIL_BY_FILE` path that uses the pm-level `fileService.getDownloadUrl` rather than doctpl's `generatedDocumentRepository`.

### 3-A Write failing test

File: `server/tests/unit/pm.documentEmail.test.js` (new file)

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';

let documentService, Project, User, Role, Customer, ProjectDocument;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/files/fileMetadata.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/pm/projectDocument.model.js');
  await import('../../src/modules/pm/projectActivity.model.js');
  const mod = await import('../../src/modules/pm/document.service.js');
  documentService = mod.default;
  Project = mongoose.model('Project');
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  Customer = mongoose.model('Customer');
  ProjectDocument = mongoose.model('ProjectDocument');
});
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let seq = 0;
function nextSeq() { return ++seq; }

async function seedUser() {
  const role = await Role.create({ name: `R_${nextSeq()}`, permissions: [] });
  return User.create({
    email: `u${nextSeq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Hans',
    lastName: 'Muster',
    role: role._id,
    status: 'active',
  });
}

async function seedProjectDoc(userId) {
  const n = nextSeq();
  const customer = await Customer.create({
    customerNumber: `K-${50000 + n}`,
    name: `Kunde ${n}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: userId,
  });
  const project = await Project.create({
    projectNumber: `P-${20000 + n}`,
    name: `Projekt ${n}`,
    projectType: 'NEW_INSTALLATION',
    status: 'PLANNING',
    customerId: customer._id,
    projectManagerId: userId,
    createdBy: userId,
  });
  const FileMetadata = mongoose.model('FileMetadata');
  const fileMeta = await FileMetadata.create({
    originalName: 'test.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    bucket: 'documents',
    storageKey: `test/${n}.pdf`,
    module: 'pm',
    entityType: 'document',
    entityId: project._id,
    uploadedBy: userId,
  });
  const doc = await ProjectDocument.create({
    projectId: project._id,
    fileId: fileMeta._id,
    fileName: 'test.pdf',
    category: 'REPORTS',
    isGenerated: true,
    uploadedBy: userId,
  });
  return { project, doc, fileMeta };
}

describe('documentService.sendEmail validation', () => {
  test('throws NotFoundError for unknown document', async () => {
    const user = await seedUser();
    const fakeDocId = new mongoose.Types.ObjectId();
    const fakeProjectId = new mongoose.Types.ObjectId();
    const { NotFoundError } = await import('../../src/shared/errors/AppError.js');

    await expect(
      documentService.sendEmail(fakeProjectId.toString(), fakeDocId.toString(), {
        to: ['client@example.com'],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      }, user._id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  test('validates recipient list — throws ValidationError when to is empty', async () => {
    const user = await seedUser();
    const { project, doc } = await seedProjectDoc(user._id);
    const { ValidationError } = await import('../../src/shared/errors/AppError.js');

    await expect(
      documentService.sendEmail(project._id.toString(), doc._id.toString(), {
        to: [],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      }, user._id),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  test('logs a document_emailed activity when email dispatch succeeds', async () => {
    const user = await seedUser();
    const { project, doc } = await seedProjectDoc(user._id);
    const ProjectActivity = mongoose.model('ProjectActivity');

    // Patch fileService so no real S3 call is made
    const fileServiceMod = await import('../../src/modules/files/file.service.js');
    const original = fileServiceMod.default.getDownloadUrl;
    fileServiceMod.default.getDownloadUrl = async () => 'https://example.com/test.pdf';

    // Patch queueManager so no real queue is needed
    const queueMod = await import('../../src/shared/queue/QueueManager.js');
    const origAdd = queueMod.default.addJob;
    queueMod.default.addJob = async () => ({ id: 'mock-job' });

    // Patch emailRecordRepository to avoid needing EmailRecord model
    const emailRecordMod = await import('../../src/modules/doctpl/emailRecord.repository.js');
    const origCreate = emailRecordMod.default.create;
    emailRecordMod.default.create = async (data) => ({ _id: new mongoose.Types.ObjectId(), ...data });

    try {
      await documentService.sendEmail(project._id.toString(), doc._id.toString(), {
        to: ['client@example.com'],
        subject: 'Dokument',
        bodyHtml: '<p>Dokument beigefuegt.</p>',
      }, user._id);

      const activities = await ProjectActivity.find({ projectId: project._id }).lean();
      expect(activities).toHaveLength(1);
      expect(activities[0].eventType).toBe('document_emailed');
      expect(activities[0].payload.to).toContain('client@example.com');
    } finally {
      fileServiceMod.default.getDownloadUrl = original;
      queueMod.default.addJob = origAdd;
      emailRecordMod.default.create = origCreate;
    }
  });
});
```

Run: `cd server && npm test -- tests/pm/pm.documentEmail.test.js` — expect FAIL (method not found).

### 3-B Implement `sendEmail` in `document.service.js`

Add the following method inside `DocumentService` after `finaliseFromDraft`:

```js
  async sendEmail(projectId, docId, { to, cc = [], bcc = [], subject, bodyHtml, bodyText }, sentBy, meta = {}) {
    // Validate recipients
    if (!Array.isArray(to) || to.length === 0) {
      const { ValidationError } = await import('../../shared/errors/AppError.js');
      throw new ValidationError('At least one recipient is required.');
    }

    const doc = await documentRepository.findById(docId);
    if (!doc) throw new NotFoundError('ProjectDocument', docId);

    // Resolve download URL for the attachment
    const fileService = (await import('../files/file.service.js')).default;
    const fileUrl = await fileService.getDownloadUrl(doc.fileId);

    // Build the attachment entry directly (bypasses GeneratedDocument lookup)
    const attachments = [{
      documentId: doc._id,
      fileName: doc.fileName,
      fileUrl,
    }];

    // Create EmailRecord and enqueue via doctpl email record repository + queue
    const emailRecordRepository = (await import('../doctpl/emailRecord.repository.js')).default;
    const queueManager = (await import('../../shared/queue/QueueManager.js')).default;

    const emailRecord = await emailRecordRepository.create({
      documentId: null, // pm document, not a GeneratedDocument
      sourceModule: 'pm',
      sourceRecordId: projectId,
      to,
      cc,
      bcc,
      subject,
      bodyHtml,
      bodyText: bodyText || '',
      attachments,
      senderAddress: config.email?.senderAddress || 'noreply@example.com',
      senderName: config.email?.senderName || 'MB Boiler',
      status: 'QUEUED',
      createdBy: sentBy,
    });

    await queueManager.addJob('email-dispatch', `email-${emailRecord._id}`, {
      emailRecordId: emailRecord._id.toString(),
    });

    // Record activity
    await projectActivityRepository.create({
      projectId,
      actorId: sentBy,
      eventType: 'document_emailed',
      payload: {
        documentId: docId,
        emailRecordId: emailRecord._id,
        to,
        subject,
      },
    });

    auditService.logEvent({
      eventType: 'project_document.emailed',
      userId: sentBy,
      ipAddress: meta.ipAddress || 'internal',
      userAgent: meta.userAgent,
      result: 'success',
      details: { documentId: docId, projectId, to, subject },
      module: 'pm',
    });

    logger.info('Project document email queued', {
      module: 'pm',
      action: 'sendEmail',
      documentId: docId,
      projectId,
      to,
    });

    return { emailRecordId: emailRecord._id };
  }
```

### 3-C Add validation schema

In `server/src/modules/pm/document.validation.js`, append:

```js
export const emailDocumentSchema = {
  params: Joi.object({ id: objectId.required(), docId: objectId.required() }),
  body: Joi.object({
    to: Joi.array().items(Joi.string().email()).min(1).required(),
    cc: Joi.array().items(Joi.string().email()).default([]),
    bcc: Joi.array().items(Joi.string().email()).default([]),
    subject: Joi.string().trim().min(1).max(500).required(),
    bodyHtml: Joi.string().min(1).max(20000).required(),
    bodyText: Joi.string().max(20000).allow('', null).default(''),
  }),
};
```

Import it at the top in pm.routes.js (add to existing destructure):

```js
import {
  listDocumentsSchema, uploadDocumentSchema, generateDocumentSchema,
  documentIdParamSchema, updateDocumentSchema, restoreDocumentSchema,
  previewDocumentSchema, draftDocumentSchema, finaliseDocumentSchema,
  emailDocumentSchema,
} from './document.validation.js';
```

### 3-D Add controller method

In `document.controller.js`, add after `finalise()`:

```js
  async sendEmail(req, res, next) {
    try {
      const meta = { ipAddress: req.ip, userAgent: req.get('user-agent') };
      const result = await documentService.sendEmail(
        req.params.id,
        req.params.docId,
        req.body,
        req.user._id,
        meta,
      );
      return res.success({ data: result, message: 'Email queued successfully' });
    } catch (err) { next(err); }
  }
```

### 3-E Wire route

In `pm.routes.js`, add inside `documentRouter` after the `POST /:docId/restore` route (before the `DELETE /:docId` route):

```js
documentRouter.post(
  '/:docId/email',
  authenticate,
  requirePermission('projects:write'),
  validate(emailDocumentSchema),
  (req, res, next) => documentController.sendEmail(req, res, next),
);
```

Run: `cd server && npm test -- tests/pm/pm.documentEmail.test.js` — expect PASS.

### 3-F Commit

```
git add server/src/modules/pm/document.service.js \
        server/src/modules/pm/document.validation.js \
        server/src/modules/pm/document.controller.js \
        server/src/modules/pm/pm.routes.js \
        server/tests/unit/pm.documentEmail.test.js
git commit -m "feat(pm): document email-send endpoint (AC-5)"
```

---

## Task 4 — Server: activity log list endpoint (AC-6)

### Why
The client needs a `GET /pm/projects/:id/activity` endpoint to display the activity timeline. This task adds the controller + route + validation for that endpoint and updates `document.service.js` to record `document_uploaded` and `document_deleted` activity events retroactively.

### 4-A Write failing test

File: `server/tests/unit/pm.activityLog.test.js` (new file)

```js
import mongoose from 'mongoose';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import request from 'supertest';

let app, User, Role, Customer, Project, ProjectActivity;

beforeAll(async () => {
  await connectTestDb();
  await import('../../src/modules/auth/user.model.js');
  await import('../../src/modules/auth/role.model.js');
  await import('../../src/modules/auth/auditLog.model.js');
  await import('../../src/modules/crm/customer.model.js');
  await import('../../src/modules/pm/project.model.js');
  await import('../../src/modules/pm/projectDocument.model.js');
  await import('../../src/modules/pm/projectActivity.model.js');
  const appMod = await import('../../src/app.js');
  app = appMod.default;
  User = mongoose.model('User');
  Role = mongoose.model('Role');
  Customer = mongoose.model('Customer');
  Project = mongoose.model('Project');
  ProjectActivity = mongoose.model('ProjectActivity');
});
afterEach(async () => { await clearTestDb(); });
afterAll(async () => { await disconnectTestDb(); });

let seq = 0;
function nextSeq() { return ++seq; }

async function seedUserWithToken() {
  const role = await Role.create({ name: `R_${nextSeq()}`, permissions: ['projects:read', 'projects:write'] });
  const user = await User.create({
    email: `u${nextSeq()}@test.ch`,
    passwordHash: '$2b$04$dummyhashpaddedenoughtopassvalidation',
    firstName: 'Hans',
    lastName: 'Muster',
    role: role._id,
    status: 'active',
  });
  // Generate a test JWT directly
  const { default: jwt } = await import('jsonwebtoken');
  const token = jwt.sign({ userId: user._id, email: user.email, roleId: role._id }, process.env.JWT_SECRET || 'test-secret', { expiresIn: '1h' });
  return { user, role, token };
}

async function seedProject(userId) {
  const n = nextSeq();
  const customer = await Customer.create({
    customerNumber: `K-${60000 + n}`,
    name: `Kunde ${n}`,
    type: 'business',
    postalCode: '8001',
    city: 'Zürich',
    canton: 'ZH',
    createdBy: userId,
  });
  return Project.create({
    projectNumber: `P-${30000 + n}`,
    name: `Projekt ${n}`,
    projectType: 'NEW_INSTALLATION',
    status: 'PLANNING',
    customerId: customer._id,
    projectManagerId: userId,
    createdBy: userId,
  });
}

describe('GET /api/v1/pm/projects/:id/activity', () => {
  test('returns 200 with empty array when no activity exists', async () => {
    const { user, token } = await seedUserWithToken();
    const project = await seedProject(user._id);

    const res = await request(app)
      .get(`/api/v1/pm/projects/${project._id}/activity`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('returns activity entries sorted newest first', async () => {
    const { user, token } = await seedUserWithToken();
    const project = await seedProject(user._id);
    const docId = new mongoose.Types.ObjectId();

    await ProjectActivity.create({ projectId: project._id, actorId: user._id, eventType: 'document_uploaded', payload: { fileName: 'first.pdf' } });
    await new Promise((r) => setTimeout(r, 15));
    await ProjectActivity.create({ projectId: project._id, actorId: user._id, eventType: 'document_generated', payload: { templateType: 'appointment_confirmation', documentId: docId } });

    const res = await request(app)
      .get(`/api/v1/pm/projects/${project._id}/activity`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].eventType).toBe('document_generated');
    expect(res.body.data[1].eventType).toBe('document_uploaded');
  });

  test('returns 401 without auth token', async () => {
    const { user } = await seedUserWithToken();
    const project = await seedProject(user._id);

    const res = await request(app)
      .get(`/api/v1/pm/projects/${project._id}/activity`);

    expect(res.status).toBe(401);
  });
});
```

Run: `cd server && npm test -- tests/pm/pm.activityLog.test.js` — expect FAIL (route not found → 404).

### 4-B Implement `ActivityController`

File: `server/src/modules/pm/activity.controller.js` (new file)

```js
import projectActivityRepository from './projectActivity.repository.js';

class ActivityController {
  async listByProject(req, res, next) {
    try {
      const { limit = 50, skip = 0 } = req._validatedQuery || req.query;
      const entries = await projectActivityRepository.findByProject(req.params.id, {
        limit: Number(limit),
        skip: Number(skip),
      });
      const total = await projectActivityRepository.countByProject(req.params.id);
      return res.success({ data: entries, meta: { total, limit: Number(limit), skip: Number(skip) } });
    } catch (err) { next(err); }
  }
}

const activityController = new ActivityController();
export default activityController;
```

### 4-C Add validation schema

File: `server/src/modules/pm/activity.validation.js` (new file)

```js
import Joi from 'joi';
import { objectId } from '../../shared/validation/commonSchemas.js';

export const listActivitySchema = {
  params: Joi.object({ id: objectId.required() }),
  query: Joi.object({
    limit: Joi.number().integer().min(1).max(200).default(50),
    skip: Joi.number().integer().min(0).default(0),
  }),
};
```

### 4-D Wire route

In `server/src/modules/pm/pm.routes.js`, add at the top of the import block:

```js
import activityController from './activity.controller.js';
import { listActivitySchema } from './activity.validation.js';
```

Add the activity route after the document router mount (`router.use('/projects/:id/documents', documentRouter);`):

```js
// --- Activity log ---
router.get(
  '/projects/:id/activity',
  authenticate,
  requirePermission('projects:read'),
  validate(listActivitySchema),
  (req, res, next) => activityController.listByProject(req, res, next),
);
```

### 4-E Backfill activity recording in `document.service.js`

In the existing `upload()` method of `DocumentService`, add an activity create call immediately after `auditService.logEvent(...)`:

```js
    await projectActivityRepository.create({
      projectId,
      actorId: uploadedBy,
      eventType: 'document_uploaded',
      payload: { documentId: doc._id, fileName: fileData.originalName, category: doc.category },
    });
```

In the existing `delete()` method, add immediately after the `auditService.logEvent(...)` call:

```js
    await projectActivityRepository.create({
      projectId: existing.projectId,
      actorId: deletedBy,
      eventType: 'document_deleted',
      payload: { documentId: id, fileName: existing.fileName },
    });
```

Run: `cd server && npm test -- tests/pm/pm.activityLog.test.js` — expect PASS.

### 4-F Commit

```
git add server/src/modules/pm/projectActivity.model.js \
        server/src/modules/pm/projectActivity.repository.js \
        server/src/modules/pm/activity.controller.js \
        server/src/modules/pm/activity.validation.js \
        server/src/modules/pm/pm.routes.js \
        server/src/modules/pm/document.service.js \
        server/tests/unit/pm.activityLog.test.js
git commit -m "feat(pm): activity log endpoint + document event recording (AC-6)"
```

---

## Task 5 — Client: add endpoint constants + query key + service methods

### 5-A Write failing client test

File: `client/src/modules/pm/components/__tests__/document-service.test.ts` (new file)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta || {} } as any;
    }
    return response;
  });
  return { default: instance };
});

// Must import after mock
import { documentService } from '@/modules/pm/services/document-service';
import { ENDPOINTS } from '@/lib/api/endpoints';

describe('documentService — new methods present', () => {
  it('exports previewDocument', () => {
    expect(typeof documentService.previewDocument).toBe('function');
  });

  it('exports createDraftDocument', () => {
    expect(typeof documentService.createDraftDocument).toBe('function');
  });

  it('exports finaliseDocument', () => {
    expect(typeof documentService.finaliseDocument).toBe('function');
  });

  it('exports sendDocumentEmail', () => {
    expect(typeof documentService.sendDocumentEmail).toBe('function');
  });

  it('exports getActivityLog', () => {
    expect(typeof documentService.getActivityLog).toBe('function');
  });

  it('ENDPOINTS.PM has DOCUMENTS_PREVIEW', () => {
    expect(typeof ENDPOINTS.PM.DOCUMENTS_PREVIEW).toBe('function');
    expect(ENDPOINTS.PM.DOCUMENTS_PREVIEW('abc123')).toBe('/pm/projects/abc123/documents/generate/preview');
  });

  it('ENDPOINTS.PM has DOCUMENTS_DRAFT', () => {
    expect(typeof ENDPOINTS.PM.DOCUMENTS_DRAFT).toBe('function');
    expect(ENDPOINTS.PM.DOCUMENTS_DRAFT('abc123')).toBe('/pm/projects/abc123/documents/generate/draft');
  });

  it('ENDPOINTS.PM has DOCUMENTS_FINALISE', () => {
    expect(typeof ENDPOINTS.PM.DOCUMENTS_FINALISE).toBe('function');
    expect(ENDPOINTS.PM.DOCUMENTS_FINALISE('abc123')).toBe('/pm/projects/abc123/documents/generate/finalise');
  });

  it('ENDPOINTS.PM has DOCUMENT_EMAIL', () => {
    expect(typeof ENDPOINTS.PM.DOCUMENT_EMAIL).toBe('function');
    expect(ENDPOINTS.PM.DOCUMENT_EMAIL('abc123', 'def456')).toBe('/pm/projects/abc123/documents/def456/email');
  });

  it('ENDPOINTS.PM has PROJECT_ACTIVITY', () => {
    expect(typeof ENDPOINTS.PM.PROJECT_ACTIVITY).toBe('function');
    expect(ENDPOINTS.PM.PROJECT_ACTIVITY('abc123')).toBe('/pm/projects/abc123/activity');
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/document-service.test.ts` — expect FAIL (methods/endpoints missing).

### 5-B Add endpoint constants

Open `client/src/lib/api/endpoints.js`. In the `PM` section, add after the existing `DOCUMENTS_GENERATE` entry:

```js
    DOCUMENTS_PREVIEW: (id) => `/pm/projects/${id}/documents/generate/preview`,
    DOCUMENTS_DRAFT: (id) => `/pm/projects/${id}/documents/generate/draft`,
    DOCUMENTS_FINALISE: (id) => `/pm/projects/${id}/documents/generate/finalise`,
    DOCUMENT_EMAIL: (id, docId) => `/pm/projects/${id}/documents/${docId}/email`,
    PROJECT_ACTIVITY: (id) => `/pm/projects/${id}/activity`,
```

### 5-C Add query keys

Open `client/src/lib/query/keys.js`. In the `pm` section, add after the `documents` key:

```js
    activity: {
      byProject: (projectId, params) => ['pm', 'activity', projectId, params ?? null],
    },
```

### 5-D Extend document service

Open `client/src/modules/pm/services/document-service.js`. Add five new methods to the `documentService` object before the closing `};`:

```js
  async previewDocument(projectId, templateType) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_PREVIEW(projectId), { templateType });
    return res.data;
  },

  async createDraftDocument(projectId, templateType, variableOverrides = {}) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_DRAFT(projectId), { templateType, variableOverrides });
    return res.data;
  },

  async finaliseDocument(projectId, draftId) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENTS_FINALISE(projectId), { draftId });
    return res.data;
  },

  async sendDocumentEmail(projectId, docId, { to, cc = [], bcc = [], subject, bodyHtml, bodyText = '' }) {
    const res = await apiClient.post(ENDPOINTS.PM.DOCUMENT_EMAIL(projectId, docId), {
      to, cc, bcc, subject, bodyHtml, bodyText,
    });
    return res.data;
  },

  async getActivityLog(projectId, params = {}) {
    const res = await apiClient.get(ENDPOINTS.PM.PROJECT_ACTIVITY(projectId), { params });
    return res.data;
  },
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/document-service.test.ts` — expect PASS.

### 5-E Commit

```
git add client/src/lib/api/endpoints.js \
        client/src/lib/query/keys.js \
        client/src/modules/pm/services/document-service.js \
        client/src/modules/pm/components/__tests__/document-service.test.ts
git commit -m "feat(pm-client): document draft/email/activity endpoint constants and service methods"
```

---

## Task 6 — Client: extend `use-document-mutations` + add Zod schemas

### 6-A Write failing client test

File: `client/src/modules/pm/components/__tests__/use-document-mutations.test.ts` (new file)

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('@/lib/toast', () => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (key: string, fallback: string) => fallback, language: 'en' }),
}));
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'success' in body) {
      return { data: body.data, meta: body.meta || {} } as any;
    }
    return response;
  });
  return { default: instance };
});

import { useDocumentMutations } from '@/modules/pm/hooks/use-document-mutations';

const BASE = 'http://localhost:9097/api/v1';
const PROJECT_ID = '507f1f77bcf86cd799439011';
const DOC_ID = '507f1f77bcf86cd799439012';

const mswServer = setupServer(
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/generate/preview`, () =>
    HttpResponse.json({ success: true, data: { templateType: 'appointment_confirmation', draftVariables: { projectName: 'Test' } } }),
  ),
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/generate/draft`, () =>
    HttpResponse.json({ success: true, data: { draftId: 'draft-abc', draftVariables: { projectName: 'Test' } } }),
  ),
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/generate/finalise`, () =>
    HttpResponse.json({ success: true, data: { _id: DOC_ID, fileName: 'test.pdf', isGenerated: true } }),
  ),
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/${DOC_ID}/email`, () =>
    HttpResponse.json({ success: true, data: { emailRecordId: 'email-abc' } }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'error' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
}

describe('useDocumentMutations — new mutations', () => {
  it('preview mutation resolves with templateType and draftVariables', async () => {
    const { result } = renderHook(() => useDocumentMutations(PROJECT_ID), { wrapper: makeWrapper() });

    let data: any;
    await act(async () => {
      data = await result.current.preview.mutateAsync('appointment_confirmation');
    });
    expect(data.templateType).toBe('appointment_confirmation');
    expect(data.draftVariables.projectName).toBe('Test');
  });

  it('createDraft mutation resolves with draftId', async () => {
    const { result } = renderHook(() => useDocumentMutations(PROJECT_ID), { wrapper: makeWrapper() });

    let data: any;
    await act(async () => {
      data = await result.current.createDraft.mutateAsync({
        templateType: 'appointment_confirmation',
        variableOverrides: { projectName: 'Overridden' },
      });
    });
    expect(data.draftId).toBe('draft-abc');
  });

  it('finalise mutation resolves with the created document', async () => {
    const { result } = renderHook(() => useDocumentMutations(PROJECT_ID), { wrapper: makeWrapper() });

    let data: any;
    await act(async () => {
      data = await result.current.finalise.mutateAsync('draft-abc');
    });
    expect(data._id).toBe(DOC_ID);
    expect(data.isGenerated).toBe(true);
  });

  it('sendEmail mutation resolves with emailRecordId', async () => {
    const { result } = renderHook(() => useDocumentMutations(PROJECT_ID), { wrapper: makeWrapper() });

    let data: any;
    await act(async () => {
      data = await result.current.sendEmail.mutateAsync({
        docId: DOC_ID,
        to: ['client@example.com'],
        subject: 'Test',
        bodyHtml: '<p>Test</p>',
      });
    });
    expect(data.emailRecordId).toBe('email-abc');
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/use-document-mutations.test.ts` — expect FAIL (mutations not present).

### 6-B Extend `use-document-mutations.js`

Open `client/src/modules/pm/hooks/use-document-mutations.js`. Add four new mutations inside the exported `useDocumentMutations` function, after the existing `generate` mutation:

```js
  const preview = useMutation({
    mutationFn: (templateType) => documentService.previewDocument(projectId, templateType),
    onError: (err) => showError(err.message),
  });

  const createDraft = useMutation({
    mutationFn: ({ templateType, variableOverrides = {} }) =>
      documentService.createDraftDocument(projectId, templateType, variableOverrides),
    onError: (err) => showError(err.message),
  });

  const finalise = useMutation({
    mutationFn: (draftId) => documentService.finaliseDocument(projectId, draftId),
    onSuccess: (res) => {
      invalidate();
      showSuccess(t('pm.documentGenerated', 'Document generated'));
      onGenerate?.(res);
    },
    onError: (err) => showError(err.message),
  });

  const sendEmail = useMutation({
    mutationFn: ({ docId, to, cc, bcc, subject, bodyHtml, bodyText }) =>
      documentService.sendDocumentEmail(projectId, docId, { to, cc, bcc, subject, bodyHtml, bodyText }),
    onSuccess: () => showSuccess(t('pm.documentEmailed', 'Email sent')),
    onError: (err) => showError(err.message),
  });
```

Update the return statement to include the new mutations:

```js
  return { upload, updateMetadata, remove, generate, preview, createDraft, finalise, sendEmail };
```

### 6-C Extend Zod validation

Open `client/src/modules/pm/validations/document.js`. Append:

```js
export const previewDocumentSchema = z.object({
  templateType: z.string().trim().min(1, 'Template type is required').max(100),
});

export const emailDocumentSchema = z.object({
  to: z.array(z.string().email('Invalid email')).min(1, 'At least one recipient is required'),
  cc: z.array(z.string().email('Invalid email')).optional().default([]),
  bcc: z.array(z.string().email('Invalid email')).optional().default([]),
  subject: z.string().trim().min(1, 'Subject is required').max(500),
  bodyHtml: z.string().min(1, 'Body is required').max(20000),
  bodyText: z.string().max(20000).optional().default(''),
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/use-document-mutations.test.ts` — expect PASS.

### 6-D Commit

```
git add client/src/modules/pm/hooks/use-document-mutations.js \
        client/src/modules/pm/validations/document.js \
        client/src/modules/pm/components/__tests__/use-document-mutations.test.ts
git commit -m "feat(pm-client): preview/draft/finalise/sendEmail mutations"
```

---

## Task 7 — Client: GenerateDocumentDialog (AC-1 + AC-4)

### Why
AC-1 requires a "Create Document" UI where the user picks a template. AC-4 requires a variable review/edit step before finalising. This task builds the multi-step dialog:
- Step 1: Template picker (list of available template types with label + icon).
- Step 2: Variable review — a form with the returned `draftVariables` fields editable. User can change `documentDate`, `projectManager`, customer fields, site fields etc.
- Step 3: Confirmation — shows filename preview, a "Generate Final Document" button.

### 7-A Write failing client test

File: `client/src/modules/pm/components/__tests__/generate-document-dialog.test.tsx` (new file)

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (k: string, f: string) => f, language: 'en' }),
}));
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((r) => {
    const b = r.data;
    if (b && typeof b === 'object' && 'success' in b) return { data: b.data } as any;
    return r;
  });
  return { default: instance };
});

import { GenerateDocumentDialog } from '@/modules/pm/components/generate-document-dialog';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const BASE = 'http://localhost:9097/api/v1';

const mswServer = setupServer(
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/generate/preview`, () =>
    HttpResponse.json({
      success: true,
      data: {
        templateType: 'appointment_confirmation',
        draftVariables: {
          documentNumber: 'P-10001',
          documentDate: '2026-06-01',
          projectName: 'Test Project',
          projectNumber: 'P-10001',
          projectManager: 'Hans Muster',
          customer: { name: 'Kunde AG', addressLine1: 'Hauptstr. 1', plz: '8001', city: 'Zürich' },
        },
      },
    }),
  ),
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/generate/draft`, () =>
    HttpResponse.json({ success: true, data: { draftId: 'draft-xyz', draftVariables: { documentDate: '2026-06-01' } } }),
  ),
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/generate/finalise`, () =>
    HttpResponse.json({ success: true, data: { _id: 'doc-abc', fileName: 'test.pdf', isGenerated: true } }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('GenerateDocumentDialog', () => {
  it('renders the template picker step when open', () => {
    render(
      <Wrapper>
        <GenerateDocumentDialog projectId={PROJECT_ID} open={true} onOpenChange={vi.fn()} onGenerated={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByText(/Select Template/i)).toBeInTheDocument();
    expect(screen.getByText(/Appointment Confirmation/i)).toBeInTheDocument();
  });

  it('advances to variable review after selecting a template', async () => {
    render(
      <Wrapper>
        <GenerateDocumentDialog projectId={PROJECT_ID} open={true} onOpenChange={vi.fn()} onGenerated={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText(/Appointment Confirmation/i));
    await waitFor(() => expect(screen.getByText(/Review Variables/i)).toBeInTheDocument());
    expect(screen.getByDisplayValue('Test Project')).toBeInTheDocument();
  });

  it('calls onGenerated after finalise', async () => {
    const onGenerated = vi.fn();
    render(
      <Wrapper>
        <GenerateDocumentDialog projectId={PROJECT_ID} open={true} onOpenChange={vi.fn()} onGenerated={onGenerated} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByText(/Appointment Confirmation/i));
    await waitFor(() => screen.getByText(/Review Variables/i));
    fireEvent.click(screen.getByRole('button', { name: /Generate Document/i }));
    await waitFor(() => expect(onGenerated).toHaveBeenCalledWith(expect.objectContaining({ _id: 'doc-abc' })));
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/generate-document-dialog.test.tsx` — expect FAIL (component not found).

### 7-B Implement `generate-document-dialog.jsx`

File: `client/src/modules/pm/components/generate-document-dialog.jsx` (new file)

```jsx
'use client';

import { useState, useCallback } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useDocumentMutations } from '@/modules/pm/hooks/use-document-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormBody } from '@/components/ui/form-field';
import { cn } from '@/lib/utils';
import { Loader2, FileText, CheckCircle2, ChevronLeft } from 'lucide-react';

// Template catalogue — must match TEMPLATE_TYPES in documentTemplate.model.js
// Only the types relevant to project documents are surfaced here.
const PM_TEMPLATE_OPTIONS = [
  {
    type: 'appointment_confirmation',
    labelDe: 'Terminbestätigung',
    labelEn: 'Appointment Confirmation',
    descDe: 'Bestätigung eines vereinbarten Projekttermins',
    descEn: 'Confirmation of a scheduled project appointment',
  },
  {
    type: 'status_report',
    labelDe: 'Statusbericht',
    labelEn: 'Status Report',
    descDe: 'Aktueller Projektstatus und Fortschrittsbericht',
    descEn: 'Current project status and progress report',
  },
  {
    type: 'completion_certificate',
    labelDe: 'Abnahmeprotokoll',
    labelEn: 'Completion Certificate',
    descDe: 'Formelles Abnahmeprotokoll nach Projektabschluss',
    descEn: 'Formal acceptance record after project completion',
  },
];

const variableReviewSchema = z.object({
  documentDate: z.string().min(1, 'Required'),
  projectName: z.string().min(1, 'Required').max(255),
  projectManager: z.string().max(255).optional().nullable(),
  customerName: z.string().max(255).optional().nullable(),
  customerAddressLine1: z.string().max(500).optional().nullable(),
  customerPlz: z.string().max(20).optional().nullable(),
  customerCity: z.string().max(100).optional().nullable(),
  siteName: z.string().max(255).optional().nullable(),
  siteAddress: z.string().max(500).optional().nullable(),
  plannedStartDate: z.string().optional().nullable(),
  plannedEndDate: z.string().optional().nullable(),
});

function StepTemplatePicker({ language, onSelect }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {language === 'de'
          ? 'Wählen Sie eine Dokumentvorlage für dieses Projekt.'
          : 'Select a document template for this project.'}
      </p>
      <div className="grid gap-3">
        {PM_TEMPLATE_OPTIONS.map((tpl) => (
          <button
            key={tpl.type}
            type="button"
            onClick={() => onSelect(tpl.type)}
            className={cn(
              'flex items-start gap-4 rounded-xl border border-border/60 bg-card p-4 text-left transition-all duration-150',
              'hover:border-primary/50 hover:bg-primary/[0.03] hover:shadow-sm',
            )}
          >
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
              <FileText className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">
                {language === 'de' ? tpl.labelDe : tpl.labelEn}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {language === 'de' ? tpl.descDe : tpl.descEn}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StepVariableReview({ draftVariables, language, onBack, onGenerate, isGenerating }) {
  const defaults = {
    documentDate: draftVariables?.documentDate || '',
    projectName: draftVariables?.projectName || '',
    projectManager: draftVariables?.projectManager || '',
    customerName: draftVariables?.customer?.name || '',
    customerAddressLine1: draftVariables?.customer?.addressLine1 || '',
    customerPlz: draftVariables?.customer?.plz || '',
    customerCity: draftVariables?.customer?.city || '',
    siteName: draftVariables?.site?.name || '',
    siteAddress: draftVariables?.site?.address || '',
    plannedStartDate: draftVariables?.plannedStartDate || '',
    plannedEndDate: draftVariables?.plannedEndDate || '',
  };

  const form = useForm({
    resolver: zodResolver(variableReviewSchema),
    defaultValues: defaults,
  });

  const onSubmit = (data) => {
    const overrides = {
      documentDate: data.documentDate,
      projectName: data.projectName,
      projectManager: data.projectManager || null,
      customer: {
        name: data.customerName || '',
        addressLine1: data.customerAddressLine1 || '',
        plz: data.customerPlz || '',
        city: data.customerCity || '',
      },
      site: data.siteName ? { name: data.siteName, address: data.siteAddress || '' } : null,
      plannedStartDate: data.plannedStartDate || null,
      plannedEndDate: data.plannedEndDate || null,
    };
    onGenerate(overrides);
  };

  const lbl = (de, en) => language === 'de' ? de : en;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
      <FormBody className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <FormField label={lbl('Dokumentdatum', 'Document Date')}>
            <Input type="date" {...form.register('documentDate')} className="h-9 text-sm" />
            {form.formState.errors.documentDate && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.documentDate.message}</p>
            )}
          </FormField>
          <FormField label={lbl('Projektname', 'Project Name')}>
            <Input {...form.register('projectName')} className="h-9 text-sm" />
            {form.formState.errors.projectName && (
              <p className="text-xs text-destructive mt-1">{form.formState.errors.projectName.message}</p>
            )}
          </FormField>
        </div>

        <FormField label={lbl('Projektleiter', 'Project Manager')}>
          <Input {...form.register('projectManager')} className="h-9 text-sm" />
        </FormField>

        <div className="rounded-lg border border-border/50 p-3 space-y-2.5">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            {lbl('Kundenadresse', 'Customer Address')}
          </p>
          <Input {...form.register('customerName')} placeholder={lbl('Name', 'Name')} className="h-9 text-sm" />
          <Input {...form.register('customerAddressLine1')} placeholder={lbl('Strasse', 'Street')} className="h-9 text-sm" />
          <div className="grid grid-cols-3 gap-2">
            <Input {...form.register('customerPlz')} placeholder="PLZ" className="h-9 text-sm" />
            <Input {...form.register('customerCity')} placeholder={lbl('Ort', 'City')} className="h-9 text-sm col-span-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label={lbl('Geplanter Start', 'Planned Start')}>
            <Input type="date" {...form.register('plannedStartDate')} className="h-9 text-sm" />
          </FormField>
          <FormField label={lbl('Geplantes Ende', 'Planned End')}>
            <Input type="date" {...form.register('plannedEndDate')} className="h-9 text-sm" />
          </FormField>
        </div>
      </FormBody>

      <DialogFooter className="gap-2 pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-3.5 w-3.5" />
          {lbl('Zurück', 'Back')}
        </Button>
        <Button type="submit" disabled={isGenerating} className="gap-2">
          {isGenerating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {lbl('Dokument generieren', 'Generate Document')}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function GenerateDocumentDialog({ projectId, open, onOpenChange, onGenerated }) {
  const { language } = useLanguage();
  const [step, setStep] = useState('pick'); // 'pick' | 'review' | 'done'
  const [selectedType, setSelectedType] = useState(null);
  const [draftVariables, setDraftVariables] = useState(null);
  const [draftId, setDraftId] = useState(null);

  const { preview, createDraft, finalise } = useDocumentMutations(projectId, {
    onGenerate: (doc) => {
      setStep('done');
      onGenerated?.(doc);
    },
  });

  const handleClose = useCallback((val) => {
    onOpenChange(val);
    if (!val) {
      setStep('pick');
      setSelectedType(null);
      setDraftVariables(null);
      setDraftId(null);
    }
  }, [onOpenChange]);

  const handleSelectTemplate = useCallback(async (templateType) => {
    setSelectedType(templateType);
    try {
      const result = await preview.mutateAsync(templateType);
      setDraftVariables(result.draftVariables);
      setStep('review');
    } catch {
      // error shown by mutation
    }
  }, [preview]);

  const handleGenerate = useCallback(async (variableOverrides) => {
    try {
      const draft = await createDraft.mutateAsync({ templateType: selectedType, variableOverrides });
      setDraftId(draft.draftId);
      await finalise.mutateAsync(draft.draftId);
    } catch {
      // errors shown by mutation
    }
  }, [createDraft, finalise, selectedType]);

  const lbl = (de, en) => language === 'de' ? de : en;
  const isLoading = preview.isPending || createDraft.isPending || finalise.isPending;

  const stepTitle = {
    pick: lbl('Vorlage auswählen', 'Select Template'),
    review: lbl('Variablen prüfen', 'Review Variables'),
    done: lbl('Dokument erstellt', 'Document Created'),
  }[step];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg flex flex-col max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            {stepTitle}
          </DialogTitle>
          <DialogDescription>
            {step === 'pick' && lbl('Wählen Sie ein Dokumenttyp aus, um fortzufahren.', 'Choose a document type to proceed.')}
            {step === 'review' && lbl('Prüfen und anpassen Sie die Dokumentvariablen vor der Generierung.', 'Review and adjust document variables before generating.')}
            {step === 'done' && lbl('Das Dokument wurde erfolgreich generiert.', 'The document was generated successfully.')}
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-y-auto flex-1 -mx-6 px-6">
          {step === 'pick' && (
            <StepTemplatePicker
              language={language}
              onSelect={handleSelectTemplate}
              isLoading={preview.isPending}
            />
          )}

          {step === 'review' && draftVariables && (
            <StepVariableReview
              draftVariables={draftVariables}
              language={language}
              onBack={() => setStep('pick')}
              onGenerate={handleGenerate}
              isGenerating={isLoading}
            />
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-foreground text-center">
                {lbl('Dokument wurde erfolgreich erstellt und in der Dokumentenliste gespeichert.', 'Document created successfully and saved to the document list.')}
              </p>
              <Button onClick={() => handleClose(false)} className="mt-2">
                {lbl('Schließen', 'Close')}
              </Button>
            </div>
          )}
        </div>

        {step === 'pick' && (
          <DialogFooter>
            <Button variant="outline" onClick={() => handleClose(false)}>
              {lbl('Abbrechen', 'Cancel')}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/generate-document-dialog.test.tsx` — expect PASS.

### 7-C Commit

```
git add client/src/modules/pm/components/generate-document-dialog.jsx \
        client/src/modules/pm/components/__tests__/generate-document-dialog.test.tsx
git commit -m "feat(pm-client): GenerateDocumentDialog with template picker + variable review (AC-1 + AC-4)"
```

---

## Task 8 — Client: EmailDocumentDialog (AC-5)

### 8-A Write failing client test

File: `client/src/modules/pm/components/__tests__/email-document-dialog.test.tsx` (new file)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (k: string, f: string) => f, language: 'en' }),
}));
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((r) => {
    const b = r.data;
    if (b && typeof b === 'object' && 'success' in b) return { data: b.data } as any;
    return r;
  });
  return { default: instance };
});

import { EmailDocumentDialog } from '@/modules/pm/components/email-document-dialog';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const DOC_ID = '507f1f77bcf86cd799439012';
const BASE = 'http://localhost:9097/api/v1';

const mswServer = setupServer(
  http.post(`${BASE}/pm/projects/${PROJECT_ID}/documents/${DOC_ID}/email`, () =>
    HttpResponse.json({ success: true, data: { emailRecordId: 'email-abc' } }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

const SAMPLE_DOC = { _id: DOC_ID, fileName: 'report.pdf', originalName: 'Statusbericht.pdf' };

describe('EmailDocumentDialog', () => {
  it('renders recipient, subject, and body fields', () => {
    render(
      <Wrapper>
        <EmailDocumentDialog projectId={PROJECT_ID} doc={SAMPLE_DOC} open={true} onOpenChange={vi.fn()} />
      </Wrapper>,
    );
    expect(screen.getByLabelText(/To/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Subject/i)).toBeInTheDocument();
  });

  it('shows validation error when To is empty on submit', async () => {
    render(
      <Wrapper>
        <EmailDocumentDialog projectId={PROJECT_ID} doc={SAMPLE_DOC} open={true} onOpenChange={vi.fn()} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));
    await waitFor(() =>
      expect(screen.getByText(/At least one recipient/i)).toBeInTheDocument(),
    );
  });

  it('calls onSent after successful send', async () => {
    const onSent = vi.fn();
    render(
      <Wrapper>
        <EmailDocumentDialog projectId={PROJECT_ID} doc={SAMPLE_DOC} open={true} onOpenChange={vi.fn()} onSent={onSent} />
      </Wrapper>,
    );
    fireEvent.change(screen.getByLabelText(/To/i), { target: { value: 'client@example.com' } });
    fireEvent.change(screen.getByLabelText(/Subject/i), { target: { value: 'Test subject' } });
    // body is a textarea
    const bodyField = screen.getByRole('textbox', { name: /body/i });
    if (bodyField) fireEvent.change(bodyField, { target: { value: 'Hello' } });
    fireEvent.click(screen.getByRole('button', { name: /Send/i }));
    await waitFor(() => expect(onSent).toHaveBeenCalledWith({ emailRecordId: 'email-abc' }));
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/email-document-dialog.test.tsx` — expect FAIL (component not found).

### 8-B Implement `email-document-dialog.jsx`

File: `client/src/modules/pm/components/email-document-dialog.jsx` (new file)

```jsx
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { emailDocumentSchema } from '@/modules/pm/validations/document';
import { useDocumentMutations } from '@/modules/pm/hooks/use-document-mutations';
import { useLanguage } from '@/lib/i18n/language-context';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormBody } from '@/components/ui/form-field';
import { Loader2, Mail } from 'lucide-react';

export function EmailDocumentDialog({ projectId, doc, open, onOpenChange, onSent }) {
  const { t, language } = useLanguage();
  const lbl = (de, en) => language === 'de' ? de : en;

  const { sendEmail } = useDocumentMutations(projectId, {});

  const form = useForm({
    resolver: zodResolver(emailDocumentSchema),
    defaultValues: {
      to: '',
      cc: '',
      bcc: '',
      subject: doc ? `Dokument: ${doc.originalName || doc.fileName}` : '',
      bodyHtml: '',
      bodyText: '',
    },
  });

  // Reset when doc changes
  useEffect(() => {
    if (doc) {
      form.reset({
        to: '',
        cc: '',
        bcc: '',
        subject: `Dokument: ${doc.originalName || doc.fileName}`,
        bodyHtml: '',
        bodyText: '',
      });
    }
  }, [doc, form]);

  const onSubmit = async (data) => {
    const toList = data.to.split(',').map((e) => e.trim()).filter(Boolean);
    const ccList = data.cc ? data.cc.split(',').map((e) => e.trim()).filter(Boolean) : [];
    const bccList = data.bcc ? data.bcc.split(',').map((e) => e.trim()).filter(Boolean) : [];

    try {
      const result = await sendEmail.mutateAsync({
        docId: doc._id,
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject: data.subject,
        bodyHtml: data.bodyHtml || `<p>${data.bodyText || ''}</p>`,
        bodyText: data.bodyText || '',
      });
      onSent?.(result);
      onOpenChange(false);
    } catch {
      // error shown by mutation
    }
  };

  if (!doc) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            {lbl('Dokument senden', 'Send Document')}
          </DialogTitle>
          <DialogDescription>
            {doc.originalName || doc.fileName}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col flex-1 overflow-hidden">
          <FormBody className="space-y-3">
            <FormField label={lbl('An', 'To')}>
              <Input
                aria-label={lbl('An', 'To')}
                {...form.register('to')}
                placeholder="email@example.com, email2@example.com"
                className="h-9 text-sm"
              />
              {form.formState.errors.to && (
                <p className="text-xs text-destructive mt-1">
                  {lbl('Mindestens ein Empfänger erforderlich.', 'At least one recipient is required.')}
                </p>
              )}
            </FormField>

            <FormField label={lbl('CC', 'CC')}>
              <Input
                aria-label="CC"
                {...form.register('cc')}
                placeholder={lbl('Optional', 'Optional')}
                className="h-9 text-sm"
              />
            </FormField>

            <FormField label={lbl('Betreff', 'Subject')}>
              <Input
                aria-label={lbl('Betreff', 'Subject')}
                {...form.register('subject')}
                className="h-9 text-sm"
              />
              {form.formState.errors.subject && (
                <p className="text-xs text-destructive mt-1">{form.formState.errors.subject.message}</p>
              )}
            </FormField>

            <FormField label={lbl('Nachricht', 'Body')}>
              <textarea
                aria-label={lbl('Nachricht', 'Body')}
                {...form.register('bodyText')}
                rows={4}
                placeholder={lbl('Nachrichtentext...', 'Message body...')}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </FormField>
          </FormBody>

          <DialogFooter className="gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button type="submit" disabled={sendEmail.isPending} className="gap-2">
              {sendEmail.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Mail className="h-3.5 w-3.5" />
              {lbl('Senden', 'Send')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/email-document-dialog.test.tsx` — expect PASS.

### 8-C Commit

```
git add client/src/modules/pm/components/email-document-dialog.jsx \
        client/src/modules/pm/components/__tests__/email-document-dialog.test.tsx
git commit -m "feat(pm-client): EmailDocumentDialog (AC-5)"
```

---

## Task 9 — Client: ActivityTab component (AC-6)

### 9-A Write failing client test

File: `client/src/modules/pm/components/__tests__/activity-tab.test.tsx` (new file)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (k: string, f: string) => f, language: 'en' }),
}));
vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}));
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((r) => {
    const b = r.data;
    if (b && typeof b === 'object' && 'success' in b) return { data: b.data, meta: b.meta || {} } as any;
    return r;
  });
  return { default: instance };
});

import { ActivityTab } from '@/modules/pm/components/activity-tab';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const BASE = 'http://localhost:9097/api/v1';

const MOCK_ACTIVITIES = [
  {
    _id: 'act1',
    eventType: 'document_generated',
    payload: { templateType: 'appointment_confirmation', fileName: 'Terminbestaetigung.pdf' },
    actorId: { _id: 'user1', firstName: 'Hans', lastName: 'Muster' },
    createdAt: '2026-06-01T10:00:00Z',
  },
  {
    _id: 'act2',
    eventType: 'document_emailed',
    payload: { to: ['client@example.com'], subject: 'Bericht' },
    actorId: { _id: 'user1', firstName: 'Hans', lastName: 'Muster' },
    createdAt: '2026-06-01T09:00:00Z',
  },
];

const mswServer = setupServer(
  http.get(`${BASE}/pm/projects/${PROJECT_ID}/activity`, () =>
    HttpResponse.json({ success: true, data: MOCK_ACTIVITIES, meta: { total: 2 } }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('ActivityTab', () => {
  it('renders a loading skeleton and then activity entries', async () => {
    render(
      <Wrapper>
        <ActivityTab projectId={PROJECT_ID} />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/document_generated/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/Hans Muster/i)).toBeInTheDocument();
  });

  it('renders document_emailed entry with recipient info', async () => {
    render(
      <Wrapper>
        <ActivityTab projectId={PROJECT_ID} />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/client@example.com/i)).toBeInTheDocument(),
    );
  });

  it('renders empty state when no activity exists', async () => {
    mswServer.use(
      http.get(`${BASE}/pm/projects/${PROJECT_ID}/activity`, () =>
        HttpResponse.json({ success: true, data: [], meta: { total: 0 } }),
      ),
    );
    render(
      <Wrapper>
        <ActivityTab projectId={PROJECT_ID} />
      </Wrapper>,
    );
    await waitFor(() =>
      expect(screen.getByText(/No activity/i)).toBeInTheDocument(),
    );
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/activity-tab.test.tsx` — expect FAIL (component not found).

### 9-B Implement `activity-tab.jsx`

File: `client/src/modules/pm/components/activity-tab.jsx` (new file)

```jsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query/keys';
import { documentService } from '@/modules/pm/services/document-service';
import { useLanguage } from '@/lib/i18n/language-context';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/shared/components/empty-state';
import { formatDate } from '@/lib/formatters';
import { cn } from '@/lib/utils';
import {
  FileText, Mail, Upload, Trash2, RotateCcw,
  FilePlus, FileCheck, Activity,
} from 'lucide-react';

const EVENT_CONFIG = {
  document_generated: {
    icon: FileText,
    color: 'text-primary bg-primary/10',
    labelDe: 'Dokument generiert',
    labelEn: 'Document generated',
    detail: (p, lang) => p.templateType ? `Vorlage: ${p.templateType}` : (p.fileName || ''),
  },
  document_draft_created: {
    icon: FilePlus,
    color: 'text-amber-600 bg-amber-500/10',
    labelDe: 'Entwurf erstellt',
    labelEn: 'Draft created',
    detail: (p) => p.templateType || '',
  },
  document_finalised: {
    icon: FileCheck,
    color: 'text-emerald-600 bg-emerald-500/10',
    labelDe: 'Dokument finalisiert',
    labelEn: 'Document finalised',
    detail: (p) => p.fileName || '',
  },
  document_emailed: {
    icon: Mail,
    color: 'text-blue-600 bg-blue-500/10',
    labelDe: 'Dokument gesendet',
    labelEn: 'Document emailed',
    detail: (p) => Array.isArray(p.to) ? p.to.join(', ') : (p.to || ''),
  },
  document_uploaded: {
    icon: Upload,
    color: 'text-violet-600 bg-violet-500/10',
    labelDe: 'Dokument hochgeladen',
    labelEn: 'Document uploaded',
    detail: (p) => p.fileName || '',
  },
  document_deleted: {
    icon: Trash2,
    color: 'text-destructive bg-destructive/10',
    labelDe: 'Dokument gelöscht',
    labelEn: 'Document deleted',
    detail: (p) => p.fileName || '',
  },
  document_restored: {
    icon: RotateCcw,
    color: 'text-emerald-600 bg-emerald-500/10',
    labelDe: 'Dokument wiederhergestellt',
    labelEn: 'Document restored',
    detail: (p) => p.fileName || '',
  },
};

function ActivityEntry({ entry, language }) {
  const cfg = EVENT_CONFIG[entry.eventType] || {
    icon: Activity,
    color: 'text-muted-foreground bg-muted',
    labelDe: entry.eventType,
    labelEn: entry.eventType,
    detail: () => '',
  };
  const Icon = cfg.icon;
  const label = language === 'de' ? cfg.labelDe : cfg.labelEn;
  const detail = cfg.detail(entry.payload || {}, language);
  const actor = entry.actorId && typeof entry.actorId === 'object'
    ? `${entry.actorId.firstName || ''} ${entry.actorId.lastName || ''}`.trim()
    : null;

  return (
    <div className="flex items-start gap-3.5 py-3 border-b border-border/40 last:border-0">
      <div className={cn(
        'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
        cfg.color,
      )}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-medium text-foreground">{label}</span>
          {actor && (
            <span className="text-[11px] text-muted-foreground">{language === 'de' ? 'von' : 'by'} {actor}</span>
          )}
        </div>
        {detail && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{detail}</p>
        )}
        <p className="text-[11px] text-muted-foreground/60 mt-0.5 tabular-nums">
          {formatDate(entry.createdAt)}
        </p>
      </div>
    </div>
  );
}

export function ActivityTab({ projectId }) {
  const { t, language } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.pm.activity.byProject(projectId),
    queryFn: () => documentService.getActivityLog(projectId, { limit: 100 }),
    enabled: !!projectId,
  });

  const entries = Array.isArray(data) ? data : (data?.data || []);

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3.5 py-3">
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-32" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        title={t('pm.activity', 'Activity')}
        description={language === 'de' ? 'Noch keine Aktivitäten aufgezeichnet.' : 'No activity recorded yet.'}
      />
    );
  }

  return (
    <div className="divide-y divide-border/40">
      {entries.map((entry) => (
        <ActivityEntry key={entry._id} entry={entry} language={language} />
      ))}
    </div>
  );
}
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/activity-tab.test.tsx` — expect PASS.

### 9-C Commit

```
git add client/src/modules/pm/components/activity-tab.jsx \
        client/src/modules/pm/components/__tests__/activity-tab.test.tsx
git commit -m "feat(pm-client): ActivityTab component (AC-6)"
```

---

## Task 10 — Client: wire everything into `DocumentsTab` and `project-detail`

### Why
The individual pieces exist but are not yet surfaced in the UI. This task:
1. Adds a "Generate Document" button to `DocumentsTab` that opens `GenerateDocumentDialog`.
2. Adds an email icon action on each `DocumentCard` / `DocumentGridCard` that opens `EmailDocumentDialog`.
3. Adds an "Activity" tab to `project-detail.jsx` wired to `ActivityTab`.

No new test file is needed here — the integration is covered by the component tests above. A smoke-test of the detail page render is sufficient.

### 10-A Write failing smoke test

File: `client/src/modules/pm/components/__tests__/documents-tab-generate.test.tsx` (new file)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement } from 'react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

vi.mock('@/lib/toast', () => ({ showSuccess: vi.fn(), showError: vi.fn() }));
vi.mock('@/lib/i18n/language-context', () => ({
  useLanguage: () => ({ t: (k: string, f: string) => f, language: 'en' }),
}));
vi.mock('@/shared/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (p: string) => p.includes('write') || p.includes('read') }),
}));
vi.mock('@/lib/api/client', async () => {
  const axios = await import('axios');
  const instance = axios.default.create({ baseURL: 'http://localhost:9097/api/v1' });
  instance.interceptors.response.use((r) => {
    const b = r.data;
    if (b && typeof b === 'object' && 'success' in b) return { data: b.data, meta: b.meta || {} } as any;
    return r;
  });
  return { default: instance };
});

import { DocumentsTab } from '@/modules/pm/components/documents-tab';

const PROJECT_ID = '507f1f77bcf86cd799439011';
const BASE = 'http://localhost:9097/api/v1';

const mswServer = setupServer(
  http.get(`${BASE}/pm/projects/${PROJECT_ID}/documents`, () =>
    HttpResponse.json({ success: true, data: [] }),
  ),
);

beforeAll(() => mswServer.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => mswServer.resetHandlers());
afterAll(() => mswServer.close());

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return createElement(QueryClientProvider, { client: qc }, children);
}

describe('DocumentsTab — generate button', () => {
  it('renders "Generate Document" button when user has write permission', async () => {
    render(
      <Wrapper>
        <DocumentsTab projectId={PROJECT_ID} />
      </Wrapper>,
    );
    expect(screen.getByRole('button', { name: /Generate Document/i })).toBeInTheDocument();
  });

  it('opens GenerateDocumentDialog when Generate Document is clicked', () => {
    render(
      <Wrapper>
        <DocumentsTab projectId={PROJECT_ID} />
      </Wrapper>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Generate Document/i }));
    expect(screen.getByText(/Select Template/i)).toBeInTheDocument();
  });
});
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/documents-tab-generate.test.tsx` — expect FAIL (button not found).

### 10-B Update `documents-tab.jsx`

Open `client/src/modules/pm/components/documents-tab.jsx`.

**Add imports** at the top (after existing imports):

```jsx
import { GenerateDocumentDialog } from '@/modules/pm/components/generate-document-dialog';
import { EmailDocumentDialog } from '@/modules/pm/components/email-document-dialog';
import { Wand2, Mail } from 'lucide-react';
```

**Add state** inside the `DocumentsTab` component (after `const [previewUrl, setPreviewUrl] = useState(null);`):

```jsx
  const [generateOpen, setGenerateOpen] = useState(false);
  const [emailTarget, setEmailTarget] = useState(null);
```

**Add "Generate Document" button** in the upload area section — add immediately after the `</div>` that closes the `{canWrite && (...)}` upload area block (before the filter bar):

```jsx
      {canWrite && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-2 h-9 text-xs"
            onClick={() => setGenerateOpen(true)}
          >
            <Wand2 className="h-3.5 w-3.5" />
            {language === 'de' ? 'Dokument generieren' : 'Generate Document'}
          </Button>
        </div>
      )}
```

**Add Email button** to `DocumentCard` and `DocumentGridCard`. In `DocumentCard`, inside the hover action buttons block after the existing Download button (and inside `{canWrite && ...}`), add:

```jsx
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-lg"
                onClick={(e) => { e.stopPropagation(); onEmail(doc); }}
                title={language === 'de' ? 'Per E-Mail senden' : 'Send by email'}
              >
                <Mail className="h-3.5 w-3.5" />
              </Button>
```

Do the same in `DocumentGridCard` after the existing Download button.

Update `DocumentCard` and `DocumentGridCard` function signatures to accept `onEmail`:

```jsx
function DocumentCard({ doc, language, canWrite, onEdit, onDelete, onDownload, onPreview, onEmail }) {
```

```jsx
function DocumentGridCard({ doc, language, canWrite, onEdit, onDelete, onDownload, onPreview, onEmail }) {
```

**Wire `onEmail`** in the document render loops. Where `DocumentCard` is rendered, add `onEmail={(doc) => setEmailTarget(doc)}`. Where `DocumentGridCard` is rendered, do the same.

**Add dialogs** at the bottom of the return, after the existing `ConfirmDialog`:

```jsx
      <GenerateDocumentDialog
        projectId={projectId}
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={() => setGenerateOpen(false)}
      />

      <EmailDocumentDialog
        projectId={projectId}
        doc={emailTarget}
        open={!!emailTarget}
        onOpenChange={(v) => { if (!v) setEmailTarget(null); }}
        onSent={() => setEmailTarget(null)}
      />
```

Run: `cd client && npx vitest run src/modules/pm/components/__tests__/documents-tab-generate.test.tsx` — expect PASS.

### 10-C Add Activity tab to `project-detail.jsx`

Open `client/src/modules/pm/components/project-detail.jsx`.

Add import at the top:

```jsx
import { ActivityTab } from '@/modules/pm/components/activity-tab';
```

Locate the tab strip definition (look for the `tabs` array or the tab value strings like `'overview'`, `'prep-actions'`, `'schedule'`, `'documents'`). Add the activity tab entry:

```jsx
{ value: 'activity', label: t('pm.activity', 'Activity'), component: <ActivityTab projectId={project._id} /> }
```

If the tab strip uses `queryKeys.pm.activity` for a badge count, add to the tab badge area:

```jsx
<TabsTrigger value="activity">
  {language === 'de' ? 'Aktivität' : 'Activity'}
</TabsTrigger>
```

And add the tab panel:

```jsx
<TabsContent value="activity">
  <ActivityTab projectId={project._id} />
</TabsContent>
```

### 10-D Commit

```
git add client/src/modules/pm/components/documents-tab.jsx \
        client/src/modules/pm/components/project-detail.jsx \
        client/src/modules/pm/components/__tests__/documents-tab-generate.test.tsx
git commit -m "feat(pm-client): wire GenerateDocumentDialog, EmailDocumentDialog, and ActivityTab into project detail (AC-1, AC-5, AC-6)"
```

---

## Task 11 — Full test run + verification

### 11-A Run full server PM test suite

```
cd server && npm test -- tests/unit/pm.activity.model.test.js tests/unit/pm.documentDraft.test.js tests/unit/pm.documentEmail.test.js tests/unit/pm.activityLog.test.js tests/unit/pm.test.js tests/unit/pm.projectDashboard.test.js
```

All must pass. Fix any import-order or mock issues before proceeding.

### 11-B Run full client PM test suite

```
cd client && npx vitest run src/modules/pm/components/__tests__/
```

All must pass.

### 11-C AC coverage checklist

| AC | Closed by | Verified by |
|----|-----------|-------------|
| PROJ-005 AC-1 Create Document UI | Tasks 7 + 10 | `generate-document-dialog.test.tsx`, `documents-tab-generate.test.tsx` |
| PROJ-005 AC-4 Edit before finalize + draft | Tasks 2 + 7 | `pm.documentDraft.test.js`, `generate-document-dialog.test.tsx` step 2 |
| PROJ-005 AC-5 Email documents | Tasks 3 + 8 + 10 | `pm.documentEmail.test.js`, `email-document-dialog.test.tsx` |
| PROJ-005 AC-6 Activity log surface | Tasks 1 + 4 + 9 + 10 | `pm.activityLog.test.js`, `activity-tab.test.tsx` |

### 11-D Final commit

```
git add .
git commit -m "chore(pm): full test run green — C4 document-creation-flow complete"
```

---

## Appendix — New files summary

| Path | Purpose |
|------|---------|
| `server/src/modules/pm/projectActivity.model.js` | Mongoose model for project activity entries |
| `server/src/modules/pm/projectActivity.repository.js` | CRUD layer for ProjectActivity |
| `server/src/modules/pm/activity.controller.js` | Controller for GET activity endpoint |
| `server/src/modules/pm/activity.validation.js` | Joi schema for activity query params |
| `server/tests/unit/pm.activity.model.test.js` | Model + repo unit tests |
| `server/tests/unit/pm.documentDraft.test.js` | Draft preview + draft creation unit tests |
| `server/tests/unit/pm.documentEmail.test.js` | Email send unit tests |
| `server/tests/unit/pm.activityLog.test.js` | Activity list endpoint integration tests |
| `client/src/modules/pm/components/generate-document-dialog.jsx` | Multi-step template picker + variable review dialog |
| `client/src/modules/pm/components/email-document-dialog.jsx` | Email compose + send dialog |
| `client/src/modules/pm/components/activity-tab.jsx` | Activity timeline tab |
| `client/src/modules/pm/components/__tests__/document-service.test.ts` | Service method + endpoint constant tests |
| `client/src/modules/pm/components/__tests__/use-document-mutations.test.ts` | Mutation hook tests |
| `client/src/modules/pm/components/__tests__/generate-document-dialog.test.tsx` | Dialog component tests |
| `client/src/modules/pm/components/__tests__/email-document-dialog.test.tsx` | Email dialog component tests |
| `client/src/modules/pm/components/__tests__/activity-tab.test.tsx` | Activity tab tests |
| `client/src/modules/pm/components/__tests__/documents-tab-generate.test.tsx` | Smoke test for generate button wiring |

## Appendix — Modified files

| Path | Change |
|------|--------|
| `server/src/modules/pm/document.service.js` | Add `getGenerationPreview`, `generateDraft`, `finaliseFromDraft`, `sendEmail`; backfill activity calls to `upload` and `delete` |
| `server/src/modules/pm/document.validation.js` | Add `previewDocumentSchema`, `draftDocumentSchema`, `finaliseDocumentSchema`, `emailDocumentSchema` |
| `server/src/modules/pm/document.controller.js` | Add `preview`, `createDraft`, `finalise`, `sendEmail` handler methods |
| `server/src/modules/pm/pm.routes.js` | Add preview/draft/finalise/email routes; add activity route; import new schemas and controller |
| `client/src/lib/api/endpoints.js` | Add `DOCUMENTS_PREVIEW`, `DOCUMENTS_DRAFT`, `DOCUMENTS_FINALISE`, `DOCUMENT_EMAIL`, `PROJECT_ACTIVITY` |
| `client/src/lib/query/keys.js` | Add `pm.activity.byProject` key |
| `client/src/modules/pm/services/document-service.js` | Add `previewDocument`, `createDraftDocument`, `finaliseDocument`, `sendDocumentEmail`, `getActivityLog` |
| `client/src/modules/pm/hooks/use-document-mutations.js` | Add `preview`, `createDraft`, `finalise`, `sendEmail` mutations |
| `client/src/modules/pm/validations/document.js` | Add `previewDocumentSchema`, `emailDocumentSchema` |
| `client/src/modules/pm/components/documents-tab.jsx` | Add Generate button, email action on cards, wire both dialogs |
| `client/src/modules/pm/components/project-detail.jsx` | Add Activity tab wired to `ActivityTab` |
