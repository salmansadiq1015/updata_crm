import { describe, expect, it } from 'vitest';
import { buildWhatsAppComponents, whatsappTemplateSlots } from '@/modules/leads/ui/whatsapp-template-mapping';

describe('Meta WhatsApp template parameter mapping', () => {
  it('preserves approved component and parameter ordering, including supported media', () => {
    const slots = whatsappTemplateSlots([
      { type: 'HEADER', format: 'IMAGE' },
      { type: 'BODY', text: 'Hello {{1}}, your appointment is {{2}}.' },
      { type: 'BUTTONS', buttons: [{ type: 'URL', url: 'https://example.com/{{1}}' }] },
    ]);
    expect(slots.map((slot) => slot.key)).toEqual(['header:image', 'body:1', 'body:2', 'button:0']);

    expect(buildWhatsAppComponents(slots, {
      'header:image': 'https://cdn.example.com/header.jpg',
      'body:1': '{{firstName}}', 'body:2': '{{city}}', 'button:0': '{{fullName}}',
    })).toEqual([
      { type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example.com/header.jpg' } }] },
      { type: 'body', parameters: [{ type: 'text', text: '{{firstName}}' }, { type: 'text', text: '{{city}}' }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '{{fullName}}' }] },
    ]);
  });

  it('ignores fixed template components that need no runtime parameters', () => {
    expect(whatsappTemplateSlots([{ type: 'BODY', text: 'A fixed approved message' }, { type: 'FOOTER', text: 'Stop to opt out' }])).toEqual([]);
  });
});
