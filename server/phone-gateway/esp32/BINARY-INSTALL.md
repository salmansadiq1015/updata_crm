UPDATA ESP32 FIRMWARE - BINARY INSTALLATION

This archive contains compiled firmware, a manifest, generated flash arguments
and these instructions. No CRM repository or firmware source is required.
Only original ESP32-WROOM-32 / 32E / 32D, unsecured 4 MB boards are covered.
ESP32-S2/S3/C3/C6/H2 cannot run this Classic Bluetooth HFP bridge.
Use Setup guide in the CRM for the complete Bluetooth and audio setup.

1. Finish calls. Stop the gateway and its login service. Close serial tools.
2. Install Python 3.12 from python.org. Install isolated esptool 4.12.0:
   Mac/Linux Terminal:
     python3.12 -m venv "$HOME/.updata/flash-tools"
     source "$HOME/.updata/flash-tools/bin/activate"
   Windows Command Prompt (cmd.exe):
     py -3.12 -m venv "%USERPROFILE%\.updata\flash-tools"
     call "%USERPROFILE%\.updata\flash-tools\Scripts\activate.bat"
   Then (both):
     python -m pip install esptool==4.12.0
3. Find your actual port using the gateway's `node bin/esp32-probe.mjs ports`.
   Examples: /dev/cu.usbserial-0001 (Mac), COM5 (Windows), /dev/ttyUSB0 (Linux).
   Replace PORT in every command below; do not type PORT literally.
4. Inspect chip, flash size and security:
     python -m esptool --chip esp32 --port PORT chip_id
     python -m esptool --chip esp32 --port PORT flash_id
     python -m espefuse --chip esp32 --port PORT summary
   If Connecting stalls: hold BOOT, press/release EN, release BOOT on connection.
   Stop if chip/size differ, secure boot or flash encryption is enabled, or the
   security output is unclear. Never change eFuses, force or erase-flash.
5. Back up the actual board into a private location outside this archive.
   Replace BACKUP.bin with an absolute path to a new private filename.
     python -m esptool --chip esp32 --port PORT --baud 460800 --after no_reset read_flash 0 0x400000 BACKUP.bin
   Immediately verify without resetting/unplugging or running the application:
     python -m esptool --chip esp32 --port PORT --baud 460800 --before no_reset --after no_reset verify_flash 0 BACKUP.bin
   Stop unless verification succeeds. Keep backups private; they exclude eFuses.
6. Open Terminal in the extracted updata-esp32-firmware folder. Check manifest.json
   for version, chip, layout and SHA-256 hashes. Use only the approved CRM release.
   Flash the three images using the included, fixed flash arguments:
     python -m esptool --chip esp32 --port PORT --baud 460800 write_flash @flash_args
   Never combine files from different releases or use guessed offsets. Updating
   from a different partition layout may replace saved settings.
7. Release BOOT; press EN once; wait five seconds. Return to the gateway package:
     node bin/esp32-probe.mjs info --port PORT
   Firmware information must appear. If not, collect the complete flash output.
8. Link the computer using the existing CRM card's generated pairing command,
   start its profile gateway, save the CRM key while holding BOOT if needed,
   pair Android using Pair a new phone, allow Phone calls and set default SIM.
   Choose Connect phone, test your own second phone and verify both audio paths.

Installation needs local USB access. Downloading this archive does not flash a
board. Windows/Linux still need real hardware acceptance; project physical
verification used macOS. Keep one gateway per bridge and one profile per phone.
