import { isAiConfigured } from './llmFactory.js';

// ─── Lazy-init singleton ─────────────────────────────────────
let openaiClient = null;

async function getClient() {
  if (!openaiClient) {
    const { createOpenAiClient } = await import('./llmFactory.js');
    openaiClient = await createOpenAiClient();
  }
  return openaiClient;
}

/**
 * Check if the AI service is available (key configured).
 */
export function isAiAvailable() {
  return isAiConfigured();
}

/**
 * Extract data from a receipt image/PDF using GPT-4o vision.
 *
 * @param {string} fileUrl  - The S3 URL of the receipt file
 * @param {string} fileType - MIME type (image/jpeg, image/png, image/webp, application/pdf)
 * @returns {Object} Extracted receipt data with confidence score
 */
export async function extractReceiptData(fileUrl, fileType) {
  const client = await getClient();

  // Fetch active receipt categories — lazy import to avoid broken path
  let categorySlugs_fallback = ['material', 'fuel', 'tools', 'office', 'travel', 'other'];
  let categories = [];
  try {
    // Category model may not exist in current architecture — use fallback
    categories = categorySlugs_fallback.map((s) => ({ slug: s }));
  } catch {
    categories = categorySlugs_fallback.map((s) => ({ slug: s }));
  }
  const categorySlugs = categories.map((c) => c.slug);

  const systemPrompt = `You are a precise receipt/invoice data extraction system for a Swiss plumbing and heating company (Bolliger Heizungen Sanitär). Extract the following fields from the receipt image:

- vendor: The business/store name that issued the receipt
- amount: The total amount as a number (no currency symbol). If multiple totals, use the grand total.
- currency: One of CHF, EUR, USD (default CHF if unclear or Swiss receipt)
- date: Receipt date in YYYY-MM-DD format
- category: Best match from these options: ${categorySlugs.join(", ")}
- description: A brief one-line description of the purchase/service
- lineItems: Array of { description, quantity, unitPrice, total } if individual items are visible
- taxInfo: { rate, amount } if tax/VAT information is visible (Swiss VAT is typically 8.1%)
- taxDeductible: true if this appears to be a business expense, false otherwise

Rules:
- Respond ONLY with valid JSON. No markdown fences, no explanation.
- Use null for fields you cannot determine with reasonable confidence.
- For amounts, return numeric values only (e.g., 125.50 not "CHF 125.50").
- For dates, always use YYYY-MM-DD format.
- If the document is not a receipt/invoice, still extract whatever data is visible.`;

  const userContent = [];

  if (fileType === "application/pdf") {
    userContent.push({
      type: "file",
      file: { url: fileUrl },
    });
  } else {
    userContent.push({
      type: "image_url",
      image_url: { url: fileUrl, detail: "high" },
    });
  }

  userContent.push({
    type: "text",
    text: "Extract all data from this receipt/invoice. Return JSON only.",
  });

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 2000,
    temperature: 0.1,
    response_format: { type: "json_object" },
  });

  const rawResponse = response.choices[0]?.message?.content || "{}";
  let parsed;

  try {
    parsed = JSON.parse(rawResponse);
  } catch {
    parsed = {};
  }

  // Calculate confidence based on how many key fields were extracted
  const keyFields = ["vendor", "amount", "date", "category"];
  const filledFields = keyFields.filter(
    (f) => parsed[f] != null && parsed[f] !== ""
  );
  const confidence =
    Math.round((filledFields.length / keyFields.length) * 100) / 100;

  // Validate category against known slugs
  if (parsed.category && !categorySlugs.includes(parsed.category)) {
    parsed.category = "other";
  }

  // Validate and normalize amount
  let amount = null;
  if (parsed.amount != null) {
    const num = typeof parsed.amount === "string"
      ? parseFloat(parsed.amount.replace(/[^0-9.-]/g, ""))
      : Number(parsed.amount);
    if (Number.isFinite(num) && num >= 0) amount = Math.round(num * 100) / 100;
  }

  // Validate currency
  const validCurrencies = ["CHF", "EUR", "USD"];
  const currency = validCurrencies.includes(parsed.currency) ? parsed.currency : "CHF";

  // Validate and normalize line items
  const lineItems = Array.isArray(parsed.lineItems)
    ? parsed.lineItems
        .filter((item) => item && typeof item === "object")
        .map((item) => ({
          description: String(item.description || ""),
          quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : null,
          unitPrice: Number.isFinite(Number(item.unitPrice)) ? Math.round(Number(item.unitPrice) * 100) / 100 : null,
          total: Number.isFinite(Number(item.total)) ? Math.round(Number(item.total) * 100) / 100 : null,
        }))
    : [];

  // Validate tax info
  let taxInfo = null;
  if (parsed.taxInfo && typeof parsed.taxInfo === "object") {
    const rate = Number(parsed.taxInfo.rate);
    const taxAmount = Number(parsed.taxInfo.amount);
    if (Number.isFinite(rate) || Number.isFinite(taxAmount)) {
      taxInfo = {
        rate: Number.isFinite(rate) ? rate : null,
        amount: Number.isFinite(taxAmount) ? Math.round(taxAmount * 100) / 100 : null,
      };
    }
  }

  return {
    vendor: parsed.vendor ? String(parsed.vendor).trim() : "",
    amount,
    currency,
    date: parsed.date ? String(parsed.date).trim() : "",
    category: parsed.category ? String(parsed.category).trim() : "",
    description: parsed.description ? String(parsed.description).trim() : "",
    lineItems,
    taxInfo,
    taxDeductible: parsed.taxDeductible === true,
    confidence,
    rawResponse,
  };
}
