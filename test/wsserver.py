#!/usr/bin/env python

import asyncio,json
from websockets.server import serve

msg = {"t": 1688550463, "rps": 1, "tops": 0, "eps": 0, "tps": 1, "respTimeSum": 0.0, "avgRespTime": 0.0, "total": {"send": 1, "recv": 1, "<100ms": 1}}

async def handler(websocket):
    while True:
        msg['t'] += 1
        await websocket.send('1.1.1.1:63|'+json.dumps(msg))
        await asyncio.sleep(1)

async def main():
    async with serve(handler, "127.0.0.1", 8082):
        await asyncio.Future()  # run forever

asyncio.run(main())