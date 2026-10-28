/** Fixed operations over the existing exclusive serial connection. No shell commands. */
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function performSetup({ action, device, info, crm, reconnect, stopped = () => false, presenceWaitMs = 90_000, sleep = delay }) {
  if (device?.state?.call || device?.state?.callsetup) throw Object.assign(new Error('busy'), { code: 'busy' });
  if (action === 'reconnect_usb') { await reconnect(); return; }
  // A user can reconnect from the CRM even after the USB session was lost.
  // Keep a healthy session open: routine Bluetooth reconnects must not reset it.
  if (!device && action === 'connect_phone') {
    const connection = await reconnect();
    device = connection?.device;
    info = connection?.info;
    if (device?.state?.call || device?.state?.callsetup) throw Object.assign(new Error('busy'), { code: 'busy' });
  }
  if (!device) throw Object.assign(new Error('no_board'), { code: 'no_board' });
  switch (action) {
    case 'status': await device.statusRequest(); return;
    case 'pair_phone': await device.setDiscoverable(120); return;
    case 'connect_phone':
      if (device.state?.hfp !== 'slc') { await device.hfpConnect(); await device.waitForState(s => s.hfp === 'slc', 20000); }
      await device.statusRequest(); return;
    case 'disconnect_phone':
      if (device.state?.hfp !== 'disconnected') { await device.hfpDisconnect(); await device.waitForState(s => s.hfp === 'disconnected', 10000); }
      await device.statusRequest(); return;
    case 'provision_key': {
      const { key } = await crm.takeDialKey();
      const bytes = Buffer.from(key, 'hex');
      if (bytes.length !== 32) { bytes.fill(0); throw new Error('Invalid key response'); }
      try {
        const deadline = Date.now() + presenceWaitMs;
        while (!stopped()) {
          if (device.state?.call || device.state?.callsetup) throw Object.assign(new Error('busy'), { code: 'busy' });
          try { await device.provisionKey(bytes); break; }
          catch (e) { if (e.code !== 'no_presence' || Date.now() >= deadline) throw e; await sleep(500); }
        }
        if (stopped()) throw new Error('Gateway stopped');
        await crm.confirmDialKey(info.bdaddr);
        info.keyProvisioned = true;
      } finally { bytes.fill(0); }
      return;
    }
    default: throw new Error('Unsupported setup action');
  }
}
