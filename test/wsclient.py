#!/usr/bin/env python

import asyncio
import websockets

async def hello():
    uri = "ws://192.168.5.33:8081/"
    async with websockets.connect(uri) as websocket:
        while True:
            msg = await websocket.recv()
            print(msg)

if __name__ == "__main__":
    asyncio.run(hello())