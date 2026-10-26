"""Thin BlueZ layer (Linux only): D-Bus Profile1 for the HFP hands-free role, and kernel SCO
sockets for call audio. All protocol and audio logic lives in at.py / audio.py.

Needs python3-dbus and python3-gi (GLib main loop), BlueZ 5.x, and no other process owning the
HFP role on this adapter (PipeWire/WirePlumber bluez5 HFP, oFono). See ../README.md.
"""

import socket
import struct

import dbus
import dbus.service

BLUEZ = 'org.bluez'
HFP_HF_UUID = '0000111e-0000-1000-8000-00805f9b34fb'
HFP_AG_UUID = '0000111f-0000-1000-8000-00805f9b34fb'
PROFILE_PATH = '/ai/updata/hfp_hf'

SOL_SCO = 17
SCO_OPTIONS = 0x01
SOL_BLUETOOTH = 274
BT_VOICE = 11
BT_VOICE_CVSD_16BIT = 0x0060


def managed_objects(bus):
    om = dbus.Interface(bus.get_object(BLUEZ, '/'), 'org.freedesktop.DBus.ObjectManager')
    return om.GetManagedObjects()


def find_adapter(bus, name=None):
    """Returns (path, address) of the named adapter (e.g. 'hci0') or the first one."""
    for path, ifaces in managed_objects(bus).items():
        props = ifaces.get('org.bluez.Adapter1')
        if props is None:
            continue
        if name is None or str(path).endswith('/' + name):
            return str(path), str(props['Address'])
    raise RuntimeError('no Bluetooth adapter%s found' % (' ' + name if name else ''))


def device_path(adapter_path, address):
    return '%s/dev_%s' % (adapter_path, address.upper().replace(':', '_'))


def device_props(bus, path):
    for p, ifaces in managed_objects(bus).items():
        if str(p) == path and 'org.bluez.Device1' in ifaces:
            props = ifaces['org.bluez.Device1']
            return {
                'name': str(props.get('Name', '')),
                'paired': bool(props.get('Paired', False)),
                'trusted': bool(props.get('Trusted', False)),
                'connected': bool(props.get('Connected', False)),
                'uuids': [str(u) for u in props.get('UUIDs', [])],
            }
    return None


class HfProfile(dbus.service.Object):
    """BlueZ calls NewConnection with the RFCOMM fd once either side opens the HFP channel."""

    def __init__(self, bus, on_connection, on_disconnect_request):
        super().__init__(bus, PROFILE_PATH)
        self._on_connection = on_connection
        self._on_disconnect_request = on_disconnect_request

    @dbus.service.method('org.bluez.Profile1', in_signature='', out_signature='')
    def Release(self):
        pass

    @dbus.service.method('org.bluez.Profile1', in_signature='oha{sv}', out_signature='')
    def NewConnection(self, device, fd, properties):
        sock = socket.socket(fileno=fd.take())
        self._on_connection(str(device), sock, {str(k): str(v) for k, v in properties.items()})

    @dbus.service.method('org.bluez.Profile1', in_signature='o', out_signature='')
    def RequestDisconnection(self, device):
        self._on_disconnect_request(str(device))


def register_profile(bus, sdp_features):
    """Publishes a Hands-Free SDP record (Android only routes calls to an HF that has one)."""
    manager = dbus.Interface(bus.get_object(BLUEZ, '/org/bluez'), 'org.bluez.ProfileManager1')
    manager.RegisterProfile(PROFILE_PATH, HFP_HF_UUID, {
        'Name': 'Updata Hands-Free',
        'Version': dbus.UInt16(0x0107),
        'Features': dbus.UInt16(sdp_features),
        'RequireAuthentication': True,
        'RequireAuthorization': False,
        'AutoConnect': False,
    })
    return manager


def unregister_profile(manager):
    try:
        manager.UnregisterProfile(PROFILE_PATH)
    except dbus.DBusException:
        pass


def connect_ag(bus, dev_path, on_ok, on_error):
    """Asks BlueZ to open HFP towards the phone's Audio Gateway; NewConnection follows."""
    device = dbus.Interface(bus.get_object(BLUEZ, dev_path), 'org.bluez.Device1')
    device.ConnectProfile(HFP_AG_UUID, reply_handler=on_ok, error_handler=lambda e: on_error(str(e)), timeout=30)


def _sco_socket():
    return socket.socket(socket.AF_BLUETOOTH, socket.SOCK_SEQPACKET, socket.BTPROTO_SCO)


def _bt_addr(address):
    # CPython takes the SCO address as bytes on most versions; newer ones also accept str.
    return address.encode('ascii')


def sco_listen(adapter_address):
    sock = _sco_socket()
    sock.bind(_bt_addr(adapter_address))
    sock.listen(1)
    return sock


def sco_connect(adapter_address, phone_address, timeout=8):
    sock = _sco_socket()
    sock.bind(_bt_addr(adapter_address))
    sock.settimeout(timeout)
    sock.connect(_bt_addr(phone_address))
    sock.settimeout(None)
    return sock


def sco_details(sock):
    mtu = struct.unpack('<H', sock.getsockopt(SOL_SCO, SCO_OPTIONS, 2)[:2])[0]
    try:
        voice = struct.unpack('<H', sock.getsockopt(SOL_BLUETOOTH, BT_VOICE, 2)[:2])[0]
    except OSError:
        voice = None
    return {'mtu': mtu, 'voice_setting': None if voice is None else '0x%04x' % voice,
            'cvsd_pcm': voice in (None, BT_VOICE_CVSD_16BIT)}
