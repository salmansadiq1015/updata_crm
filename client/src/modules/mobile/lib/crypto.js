const ALGO = 'AES-GCM';
const KEY_NAME = 'mb-field-encryption-key';

async function getOrCreateKey() {
  const stored = localStorage.getItem(KEY_NAME);
  if (stored) {
    const raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
    return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt']);
  }
  const key = await crypto.subtle.generateKey({ name: ALGO, length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(KEY_NAME, btoa(String.fromCharCode(...new Uint8Array(exported))));
  return key;
}

export async function encryptField(plaintext) {
  if (!plaintext) return null;
  const key = await getOrCreateKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipher = await crypto.subtle.encrypt({ name: ALGO, iv }, key, encoded);
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(cipher), iv.length);
  return btoa(String.fromCharCode(...combined));
}

export async function decryptField(cipherBase64) {
  if (!cipherBase64) return null;
  const key = await getOrCreateKey();
  const combined = Uint8Array.from(atob(cipherBase64), (c) => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const decrypted = await crypto.subtle.decrypt({ name: ALGO, iv }, key, data);
  return new TextDecoder().decode(decrypted);
}

export function clearEncryptionKey() {
  localStorage.removeItem(KEY_NAME);
}

const SENSITIVE_FIELDS = ['customer_signature', 'customerSignature', 'technician_notes', 'technicianNotes'];

export async function encryptSensitiveFields(record) {
  if (!record || typeof window === 'undefined' || !crypto.subtle) return record;
  const copy = { ...record };
  for (const field of SENSITIVE_FIELDS) {
    if (copy[field]) {
      copy[field] = await encryptField(copy[field]);
      copy[`${field}__encrypted`] = true;
    }
  }
  return copy;
}

export async function decryptSensitiveFields(record) {
  if (!record || typeof window === 'undefined' || !crypto.subtle) return record;
  const copy = { ...record };
  for (const field of SENSITIVE_FIELDS) {
    if (copy[field] && copy[`${field}__encrypted`]) {
      try {
        copy[field] = await decryptField(copy[field]);
      } catch {
        copy[field] = null;
      }
      delete copy[`${field}__encrypted`];
    }
  }
  return copy;
}
