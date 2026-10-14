export type WhatsAppTemplateSlot = {
  key: string;
  label: string;
  componentType: 'header' | 'body' | 'button';
  parameterType: 'text' | 'image' | 'document' | 'video';
  order: number;
  index?: string;
  subType?: 'url';
};

type Definition = { type?: string; format?: string; text?: string; buttons?: Array<{ type?: string; url?: string }> };

const numericSlots = (value: string) => [...value.matchAll(/\{\{(\d+)\}\}/g)]
  .map((match) => Number(match[1]))
  .filter((value, index, values) => values.indexOf(value) === index)
  .sort((a, b) => a - b);

export function whatsappTemplateSlots(definition: unknown): WhatsAppTemplateSlot[] {
  if (!Array.isArray(definition)) return [];
  const slots: WhatsAppTemplateSlot[] = [];
  for (const raw of definition as Definition[]) {
    const type = String(raw.type || '').toLowerCase();
    if (type === 'header') {
      const format = String(raw.format || 'text').toLowerCase();
      if (['image', 'document', 'video'].includes(format)) {
        slots.push({ key: `header:${format}`, label: `${format} HTTPS URL`, componentType: 'header', parameterType: format as 'image' | 'document' | 'video', order: 0 });
      } else {
        for (const order of numericSlots(String(raw.text || ''))) slots.push({ key: `header:${order}`, label: `Header variable ${order}`, componentType: 'header', parameterType: 'text', order });
      }
    }
    if (type === 'body') {
      for (const order of numericSlots(String(raw.text || ''))) slots.push({ key: `body:${order}`, label: `Body variable ${order}`, componentType: 'body', parameterType: 'text', order });
    }
    if (type === 'buttons') {
      (raw.buttons || []).forEach((button, index) => {
        if (String(button.type || '').toLowerCase() !== 'url' || !numericSlots(String(button.url || '')).length) return;
        slots.push({ key: `button:${index}`, label: `Button ${index + 1} URL value`, componentType: 'button', parameterType: 'text', order: 1, index: String(index), subType: 'url' });
      });
    }
  }
  return slots;
}

export function buildWhatsAppComponents(slots: WhatsAppTemplateSlot[], values: Record<string, string>) {
  const components: Array<Record<string, unknown>> = [];
  for (const type of ['header', 'body'] as const) {
    const matching = slots.filter((slot) => slot.componentType === type).sort((a, b) => a.order - b.order);
    if (!matching.length) continue;
    components.push({
      type,
      parameters: matching.map((slot) => slot.parameterType === 'text'
        ? { type: 'text', text: values[slot.key] || '' }
        : { type: slot.parameterType, [slot.parameterType]: { link: values[slot.key] || '' } }),
    });
  }
  for (const slot of slots.filter((item) => item.componentType === 'button')) {
    components.push({ type: 'button', sub_type: slot.subType, index: slot.index, parameters: [{ type: 'text', text: values[slot.key] || '' }] });
  }
  return components;
}
