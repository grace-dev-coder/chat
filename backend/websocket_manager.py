from typing import Dict, List
from fastapi import WebSocket
import json
from datetime import datetime

class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, WebSocket] = {}
        self.typing_users: Dict[int, int] = {}  # user_id -> typing_to_user_id

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        self.active_connections[user_id] = websocket

    def disconnect(self, user_id: int):
        if user_id in self.active_connections:
            del self.active_connections[user_id]
        if user_id in self.typing_users:
            del self.typing_users[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)

    async def broadcast(self, message: dict):
        for connection in self.active_connections.values():
            await connection.send_json(message)

    async def notify_user_status(self, user_id: int, is_online: bool):
        message = {
            "type": "user_status",
            "user_id": user_id,
            "is_online": is_online,
            "timestamp": datetime.utcnow().isoformat()
        }
        await self.broadcast(message)

    async def send_typing_indicator(self, sender_id: int, receiver_id: int, is_typing: bool):
        if receiver_id in self.active_connections:
            await self.active_connections[receiver_id].send_json({
                "type": "typing",
                "user_id": sender_id,
                "is_typing": is_typing
            })

manager = ConnectionManager()