// Manual mock for the ESM-only `swissqrbill` package, which Jest's default
// resolver cannot load. Mapped via moduleNameMapper in jest.config.js so renderer
// tests can assert on the QR payload our code assembles. The real library is
// exercised by the application's native-ESM runtime, not by Jest.

export const __qrCalls = [];
export const __attachCalls = [];

export function __resetQrMock() {
  __qrCalls.length = 0;
  __attachCalls.length = 0;
}

export class SwissQRBill {
  constructor(data, opts) {
    __qrCalls.push({ data, opts });
  }

  attachTo(doc) {
    __attachCalls.push(doc);
  }
}

export default { SwissQRBill };
