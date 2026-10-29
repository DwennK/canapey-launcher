"""Interop only: pip install -r scripts/apple-remote-test-requirements.txt.

These dependencies are never shipped in the installer.
"""
import asyncio
import json
import sys
from pathlib import Path

import pyatv
from pyatv.conf import AppleTV, ManualService
from pyatv.const import Protocol

ROOT = Path(__file__).resolve().parents[1]

async def main():
    binary = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "src-tauri/target/debug/examples/companion_probe"
    proc = await asyncio.create_subprocess_exec(str(binary), stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE)
    events = []
    async def receive(key):
        while True:
            line = await asyncio.wait_for(proc.stdout.readline(), 15)
            if not line:
                raise AssertionError("Rust probe exited")
            item = json.loads(line)
            if key in item:
                return item[key]
            events.append(item)
    async def send(text):
        proc.stdin.write((text + "\n").encode())
        await proc.stdin.drain()
    port = await receive("port")
    def config(credentials=None):
        cfg = AppleTV("127.0.0.1", "Canapey test")
        cfg.add_service(ManualService("test", Protocol.Companion, port, {}, credentials=credentials))
        return cfg
    async def pair(wrong=False):
        await send("pair")
        state = await receive("pairing")
        pairing = await pyatv.pair(config(), Protocol.Companion, asyncio.get_running_loop())
        try:
            await pairing.begin()
            pin = state["pin"]
            pairing.pin(f"{(int(pin)+1)%10000:04d}" if wrong else pin)
            await pairing.finish()
            return pairing.service.credentials
        finally:
            await pairing.close()
    try:
        try:
            await pair(wrong=True)
            raise AssertionError("wrong PIN accepted")
        except (pyatv.exceptions.AuthenticationError, pyatv.exceptions.PairingError):
            pass
        # No controls are accepted before pairing, including oversized frames.
        for wire in (bytes([8, 0, 0, 1, 0xe0]), bytes([8, 1, 0, 1])):
            reader, writer = await asyncio.open_connection("127.0.0.1", port)
            writer.write(wire)
            await writer.drain()
            assert await asyncio.wait_for(reader.read(), 3) == b""
            writer.close()
            await writer.wait_closed()
        credentials = await pair()
        atv = await pyatv.connect(config(credentials), asyncio.get_running_loop())
        await atv.remote_control.up()
        await atv.remote_control.select()
        await atv.remote_control.home()
        # HID button API: this receiver intentionally has no absolute volume feedback.
        await atv.remote_control.volume_up()
        expected = ["up", "accept", "home", "volumeUp"]
        for name in expected:
            down = await receive("action")
            up = await receive("action")
            assert (down["action"], down["pressed"]) == (name, True), down
            assert (up["action"], up["pressed"]) == (name, False), up
        pending = atv.close()
        if pending:
            await asyncio.gather(*pending)
        # A second connection must verify the remembered identity.
        atv = await pyatv.connect(config(credentials), asyncio.get_running_loop())
        await atv.remote_control.down()
        assert (await receive("action"))["action"] == "down"
        await receive("action")
        await send("revoke")
        await receive("revoked")
        await asyncio.sleep(.1)
        try:
            await atv.remote_control.up()
        except (pyatv.exceptions.ProtocolError, pyatv.exceptions.InvalidStateError, pyatv.exceptions.BlockedStateError):
            pass
        else:
            raise AssertionError("revoked live connection accepted controls")
        pending = atv.close()
        if pending:
            await asyncio.gather(*pending)
        try:
            other = await pyatv.connect(config(credentials), asyncio.get_running_loop())
        except (pyatv.exceptions.AuthenticationError, pyatv.exceptions.ConnectionFailedError, pyatv.exceptions.ProtocolError):
            pass
        else:
            other.close()
            raise AssertionError("revoked identity accepted")
        print("PASS: wrong PIN rejected, pairing, encrypted verification, commands, reconnect, revocation")
    finally:
        await send("quit")
        await asyncio.wait_for(proc.wait(), 10)

asyncio.run(main())
