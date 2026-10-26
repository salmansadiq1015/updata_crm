#!/bin/sh
# Run inside the Linux gateway (VM or Raspberry Pi). Read-only checks by default.
#   sh setup.sh            report what is there and what is missing
#   sh setup.sh --install  apt-install the probe's packages (needs sudo; asks nothing else)
# It never pairs, restarts Bluetooth or changes audio-server configuration; the README says
# when and how to do those by hand.
set -u

say() { printf '%-28s %s\n' "$1" "$2"; }

if [ "${1:-}" = "--install" ]; then
  sudo apt-get update && sudo apt-get install -y --no-install-recommends \
    bluez bluez-tools python3 python3-dbus python3-gi linux-firmware usbutils || exit 1
fi

. /etc/os-release 2>/dev/null
say "OS" "${PRETTY_NAME:-unknown}"
say "Kernel" "$(uname -r)"
say "Arch" "$(uname -m)"
say "BlueZ" "$(bluetoothctl --version 2>/dev/null || echo MISSING)"
python3 -c 'import dbus, gi' 2>/dev/null && say "python3-dbus/gi" "ok" || say "python3-dbus/gi" "MISSING (sh setup.sh --install)"
python3 -c 'import socket; socket.BTPROTO_SCO' 2>/dev/null && say "Python SCO sockets" "ok" || say "Python SCO sockets" "MISSING"

echo
echo "USB Bluetooth adapters (expect 2357:0604 TP-Link UB500 or 0b05:190e ASUS BT500):"
lsusb 2>/dev/null | grep -iE 'bluetooth|realtek|2357:0604|0b05:190e|0bda:' || echo "  none found by lsusb"

echo
echo "Controllers:"
if command -v btmgmt >/dev/null; then
  sudo -n btmgmt info 2>/dev/null | grep -E '^hci|addr|current settings' || echo "  btmgmt needs sudo, or no controller"
fi
ls /sys/class/bluetooth 2>/dev/null || echo "  /sys/class/bluetooth is empty: no controller visible"

echo
echo "Realtek firmware load (dmesg):"
sudo -n dmesg 2>/dev/null | grep -iE 'bluetooth: hci[0-9]: (rtl|RTL)|rtl_bt' | tail -5 || echo "  (needs sudo)"
ls /lib/firmware/rtl_bt/rtl8761b* 2>/dev/null || echo "  rtl8761b firmware file not found in /lib/firmware/rtl_bt"

echo
echo "Processes that may grab the hands-free role or SCO links:"
for p in ofonod wireplumber pipewire pulseaudio; do
  pgrep -x "$p" >/dev/null && say "  $p" "RUNNING (see README: conflicts)"
done
echo "done."
