import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const gatewayPackage = fileURLToPath(new URL('../../../phone-gateway/dist/updata-phone-gateway.tgz', import.meta.url));
export async function downloadGateway(_req, res, next) {
  try {
    await access(gatewayPackage);
    res.download(gatewayPackage, 'updata-phone-gateway.tgz', e => { if (e) next(e); });
  } catch {
    res.status(503).json({ success: false, error: { code: 'GATEWAY_PACKAGE_UNAVAILABLE', message: 'The gateway download is not available. Ask your administrator to include the gateway package in this release.' } });
  }
}

export const firmwarePackage = fileURLToPath(new URL('../../../phone-gateway/dist/updata-esp32-firmware.tgz', import.meta.url));
export async function downloadFirmware(_req, res, next) {
  try {
    await access(firmwarePackage);
    res.download(firmwarePackage, 'updata-esp32-firmware.tgz', e => { if (e) next(e); });
  } catch {
    res.status(503).json({ success: false, error: { code: 'FIRMWARE_PACKAGE_UNAVAILABLE', message: 'The firmware download is not available. Ask your administrator to include the compiled ESP32 firmware in this release. Repository access is not needed.' } });
  }
}
