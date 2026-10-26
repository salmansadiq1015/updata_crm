#!/usr/bin/env python3
"""A stand-in for bluetoothd plus an Android phone's HFP Audio Gateway, on a private D-Bus.

Used by test-docker.sh to run hfp_probe.py's real D-Bus/RFCOMM code without a radio. It
implements only what the probe calls: ObjectManager, ProfileManager1, Device1.ConnectProfile.
ConnectProfile hands the probe one end of a socketpair as the "RFCOMM" fd and answers AT
commands on the other end the way the TECNO's stack did in the macOS run (+BRSF: 879, Android's
indicator order). SCO cannot be faked, so audio never opens here.

Writes every AT command it receives to the file given as argv[1] for the test to assert on.
"""

import socket
import sys
import threading

import dbus
import dbus.mainloop.glib
import dbus.service
from gi.repository import GLib

ADAPTER = '/org/bluez/hci0'
DEVICE = ADAPTER + '/dev_04_01_BB_51_10_48'
AG_UUID = '0000111f-0000-1000-8000-00805f9b34fb'
CIND_TEST = ('+CIND: ("call",(0,1)),("callsetup",(0-3)),("service",(0-1)),("signal",(0-5)),'
             '("roam",(0,1)),("battchg",(0-5)),("callheld",(0-2))')

LOG = open(sys.argv[1], 'w', buffering=1)
profile = {}


class Root(dbus.service.Object):
    @dbus.service.method('org.freedesktop.DBus.ObjectManager', out_signature='a{oa{sa{sv}}}')
    def GetManagedObjects(self):
        return {
            dbus.ObjectPath(ADAPTER): {'org.bluez.Adapter1': {'Address': '00:11:22:33:44:55'}},
            dbus.ObjectPath(DEVICE): {'org.bluez.Device1': {
                'Name': 'TECNO SPARK 20', 'Paired': True, 'Trusted': True, 'Connected': True,
                'UUIDs': dbus.Array([AG_UUID], signature='s')}},
        }


class Manager(dbus.service.Object):
    @dbus.service.method('org.bluez.ProfileManager1', in_signature='osa{sv}', sender_keyword='sender')
    def RegisterProfile(self, path, uuid, options, sender=None):
        profile.update(path=str(path), uuid=str(uuid), sender=str(sender), features=int(options['Features']))
        LOG.write('REGISTER %s features=%d\n' % (uuid, int(options['Features'])))

    @dbus.service.method('org.bluez.ProfileManager1', in_signature='o')
    def UnregisterProfile(self, path):
        LOG.write('UNREGISTER\n')


class Phone:
    """Answers AT commands like Android; the call is 'answered' 1 s after it starts ringing."""

    def __init__(self, sock):
        self.sock = sock
        self.ind = {'call': 0, 'callsetup': 0}

    def send(self, text):
        self.sock.sendall(('\r\n%s\r\n' % text).encode())

    def ciev(self, name, value):
        self.ind[name] = value
        idx = ['call', 'callsetup', 'service', 'signal', 'roam', 'battchg', 'callheld'].index(name) + 1
        self.send('+CIEV: %d,%d' % (idx, value))

    def run(self):
        buf = b''
        while True:
            data = self.sock.recv(256)
            if not data:
                LOG.write('HF_CLOSED\n')
                return
            buf += data
            while b'\r' in buf:
                line, buf = buf.split(b'\r', 1)
                self.command(line.decode().strip())

    def command(self, cmd):
        LOG.write('AT %s\n' % cmd)
        if cmd.startswith('AT+BRSF='):
            self.send('+BRSF: 879')
            self.send('OK')
        elif cmd == 'AT+CIND=?':
            self.send(CIND_TEST)
            self.send('OK')
        elif cmd == 'AT+CIND?':
            self.send('+CIND: %d,%d,1,5,0,4,0' % (self.ind['call'], self.ind['callsetup']))
            self.send('OK')
        elif cmd.startswith('ATD'):
            self.send('OK')
            self.ciev('callsetup', 2)
            self.ciev('callsetup', 3)
            threading.Timer(1.0, self.answer).start()
        elif cmd == 'AT+CHUP':
            self.send('OK')
            if self.ind['call']:
                self.ciev('call', 0)
            elif self.ind['callsetup']:
                self.ciev('callsetup', 0)
        else:
            self.send('OK')

    def answer(self):
        self.ciev('call', 1)
        self.ciev('callsetup', 0)


class Device(dbus.service.Object):
    def __init__(self, bus, path):
        super().__init__(bus, path)
        self.bus = bus

    @dbus.service.method('org.bluez.Device1', in_signature='s', async_callbacks=('ok', 'err'))
    def ConnectProfile(self, uuid, ok, err):
        LOG.write('CONNECT_PROFILE %s\n' % uuid)
        if uuid != AG_UUID or not profile:
            err(dbus.DBusException('org.bluez.Error.NotAvailable'))
            return
        ours, theirs = socket.socketpair(socket.AF_UNIX, socket.SOCK_STREAM)
        threading.Thread(target=Phone(ours).run, daemon=True).start()
        client = dbus.Interface(self.bus.get_object(profile['sender'], profile['path']), 'org.bluez.Profile1')
        client.NewConnection(dbus.ObjectPath(DEVICE), dbus.types.UnixFd(theirs.fileno()), {},
                             reply_handler=lambda: (theirs.close(), ok()),
                             error_handler=lambda e: (LOG.write('NEWCONN_ERR %s\n' % e), err(e)))


def main():
    dbus.mainloop.glib.DBusGMainLoop(set_as_default=True)
    bus = dbus.SystemBus()
    name = dbus.service.BusName('org.bluez', bus)  # noqa: F841 (keeps the name)
    Root(bus, '/')
    Manager(bus, '/org/bluez')
    Device(bus, DEVICE)
    LOG.write('READY\n')
    GLib.MainLoop().run()


if __name__ == '__main__':
    main()
