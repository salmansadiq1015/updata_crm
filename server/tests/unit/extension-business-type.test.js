import { describe, it, expect } from '@jest/globals';
import { extensionBusinessType } from '../../src/modules/crm/leadExtensionProvenance.js';
import { repairedExtensionBusinessType } from '../../src/migrations/041_extension_business_type_repair.js';

describe('extension business-type validation and repair', () => {
  it.each(['add_a_label', 'add-a-label', 'Add a label', '+ Add a label', 'Edit label', 'Ajouter un libellé', null, '', 'Business', 'No reviews', 'No review', 'Online appointments', 'On-site services', 'N°1', 'Nº 1', '4.8 (23)', 'Aucun avis', 'Keine Bewertungen'])('uses the saved selected type instead of %s', (category) => {
    expect(extensionBusinessType({ category, categories: ['No reviews'], discoveryCategories: ['Software companies'] })).toBe('Software companies');
  });

  it('preserves a real category and explicit user-selected types', () => {
    expect(extensionBusinessType({ category: 'Software company', discoveryCategories: ['Software companies'] })).toBe('Software company');
    expect(extensionBusinessType({ category: 'Online marketing agency' })).toBe('Online marketing agency');
    expect(extensionBusinessType({ discoveryCategories: ['Online marketing agency'] })).toBe('Online marketing agency');
    expect(extensionBusinessType({ businessName: 'Tech AB', category: 'Tech AB - Smartpartner', discoveryCategories: ['Software companies'] })).toBe('Software companies');
  });

  it('recovers Hotel from action-polluted fields and supports saved type objects', () => {
    expect(extensionBusinessType({ category: 'Add a label', categories: ['Edit label'], discoveryCategories: ['Hotel'] })).toBe('Hotel');
    expect(extensionBusinessType({ category: 'Add a label', discoveryCategories: [{ id: 'hotel', name: 'Hotel' }] })).toBe('Hotel');
    expect(extensionBusinessType({ category: 'Label printing service', discoveryCategories: ['Hotel'] })).toBe('Label printing service');
    expect(extensionBusinessType({ category: 'Add a label' })).toBeNull();
    expect(repairedExtensionBusinessType({ source: 'extension', sourceMetadata: { businessType: 'Add a label', discoveryBusinessTypes: ['Hotel'] } })).toBe('Hotel');
  });

  it('repairs only proven extension records with recoverable per-lead provenance', () => {
    const lead = { source: 'extension', name: 'Acme', sourceMetadata: { businessType: 'No reviews', discoveryBusinessTypes: ['Software companies'] } };
    expect(repairedExtensionBusinessType(lead)).toBe('Software companies');
    expect(repairedExtensionBusinessType({ ...lead, source: 'manual' })).toBeNull();
    expect(repairedExtensionBusinessType({ ...lead, sourceMetadata: { businessType: 'No reviews' } })).toBeNull();
    expect(repairedExtensionBusinessType({ ...lead, sourceMetadata: { ...lead.sourceMetadata, businessType: 'Software company' } })).toBeNull();
  });
});
