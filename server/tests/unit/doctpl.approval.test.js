import mongoose from 'mongoose';
import { describe, expect, test, beforeAll, afterEach, afterAll } from '@jest/globals';
import { connectTestDb, clearTestDb, disconnectTestDb } from '../setup.js';
import documentTemplateRepository from '../../src/modules/doctpl/documentTemplate.repository.js';
import templateService from '../../src/modules/doctpl/template.service.js';
import documentGenerationService from '../../src/modules/doctpl/documentGeneration.service.js';
import { ValidationError } from '../../src/shared/errors/AppError.js';

beforeAll(() => connectTestDb());
afterEach(() => clearTestDb());
afterAll(() => disconnectTestDb());

const userId = new mongoose.Types.ObjectId();
const approverId = new mongoose.Types.ObjectId();

function completeTemplate(overrides = {}) {
  return {
    templateType: 'quotation',
    name: 'Standard Offerte',
    isActive: true,
    layout: { pageSize: 'A4', margins: { top: 25, bottom: 20, left: 20, right: 15 } },
    sections: [
      { id: 'header', name: 'Header', type: 'header', position: 1, isVisible: true },
      { id: 'body', name: 'Body', type: 'body', position: 2, isVisible: true },
      { id: 'table', name: 'Table', type: 'table', position: 3, isVisible: true },
      { id: 'totals', name: 'Totals', type: 'totals', position: 4, isVisible: true },
      { id: 'footer', name: 'Footer', type: 'footer', position: 5, isVisible: true },
    ],
    textBlocks: {
      de: { footer: 'DE Footer' },
      fr: { footer: 'FR Footer' },
      it: { footer: 'IT Footer' },
      en: { footer: 'EN Footer' },
    },
    tableColumns: [
      { field: 'description', widthPercent: 70, label: { de: 'Text', fr: 'Texte', it: 'Testo', en: 'Text' } },
      { field: 'total', widthPercent: 30, label: { de: 'Total', fr: 'Total', it: 'Totale', en: 'Total' } },
    ],
    createdBy: userId,
    ...overrides,
  };
}

describe('Module 09 template approval workflow', () => {
  test('new templates default to draft approval status', async () => {
    const template = await documentTemplateRepository.create(completeTemplate());
    expect(template.approvalStatus).toBe('draft');
  });

  test('requesting approval moves a complete template to pending', async () => {
    const template = await documentTemplateRepository.create(completeTemplate());
    const updated = await templateService.requestApproval(template._id, userId);
    expect(updated.approvalStatus).toBe('pending');
    expect(String(updated.approvalRequestedBy)).toBe(String(userId));
    expect(updated.approvalRequestedAt).toBeTruthy();
  });

  test('requesting approval rejects an incomplete template', async () => {
    const template = await documentTemplateRepository.create(completeTemplate({
      textBlocks: { de: { footer: 'DE' }, fr: { footer: 'FR' }, it: { footer: '' }, en: { footer: 'EN' } },
    }));
    await expect(templateService.requestApproval(template._id, userId)).rejects.toThrow(ValidationError);
  });

  test('approve moves a pending template to approved', async () => {
    const template = await documentTemplateRepository.create(completeTemplate({ approvalStatus: 'pending' }));
    const updated = await templateService.approve(template._id, approverId);
    expect(updated.approvalStatus).toBe('approved');
    expect(String(updated.approvedBy)).toBe(String(approverId));
  });

  test('approve is rejected when the template is not pending', async () => {
    const template = await documentTemplateRepository.create(completeTemplate());
    await expect(templateService.approve(template._id, approverId)).rejects.toThrow(ValidationError);
  });

  test('reject requires a reason and records it', async () => {
    const template = await documentTemplateRepository.create(completeTemplate({ approvalStatus: 'pending' }));
    await expect(templateService.reject(template._id, approverId, '   ')).rejects.toThrow(ValidationError);

    const updated = await templateService.reject(template._id, approverId, 'Footer text is wrong');
    expect(updated.approvalStatus).toBe('rejected');
    expect(updated.rejectionReason).toBe('Footer text is wrong');
  });

  test('editing template content resets approval back to draft', async () => {
    const template = await documentTemplateRepository.create(completeTemplate({ approvalStatus: 'approved', approvedBy: approverId }));
    const updated = await templateService.update(
      template._id,
      { changeDescription: 'tweak header height', layout: { ...template.layout, headerHeight: 50 } },
      userId,
    );
    expect(updated.approvalStatus).toBe('draft');
    expect(updated.approvedBy).toBeNull();
  });

  test('toggling isActive does not reset an approved template', async () => {
    const template = await documentTemplateRepository.create(completeTemplate({ approvalStatus: 'approved', approvedBy: approverId }));
    const updated = await templateService.update(
      template._id,
      { changeDescription: 'deactivate', isActive: false },
      userId,
    );
    expect(updated.approvalStatus).toBe('approved');
  });

  test('document generation is blocked for templates that are not approved', async () => {
    await documentTemplateRepository.create(completeTemplate());
    await expect(documentGenerationService.generate({
      templateType: 'quotation',
      sourceModule: 'test',
      sourceRecordId: new mongoose.Types.ObjectId(),
      data: { documentNumber: 'OFF-1' },
      language: 'de',
      generatedBy: userId,
    })).rejects.toThrow(ValidationError);
  });
});
