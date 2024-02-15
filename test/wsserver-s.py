#!/usr/bin/env python

import asyncio,json,ssl,pathlib
from websockets.server import serve

ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
localhost_pem = pathlib.Path(__file__).with_name("localhost.pem")
localhost_pem = ("d:\\localhost.pem")
ssl_context.load_cert_chain(localhost_pem)

msg = {"t": 1688550463, "rps": 1, "tops": 0, "eps": 0, "tps": 1, "respTimeSum": 0.0, "avgRespTime": 0.0, "total": {"send": 1, "recv": 1, "<100ms": 1}}

async def handler(websocket):
    while True:
        msg['t'] += 1
        await websocket.send('1.1.1.1:63|'+json.dumps(msg))
        await asyncio.sleep(3)

async def main():
    async with serve(handler, "localhost", 8081, ssl=ssl_context):
        await asyncio.Future()  # run forever

asyncio.run(main())