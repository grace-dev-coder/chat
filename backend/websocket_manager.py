"""
WebSocket Connection Manager
Handles real-time connections, message routing, and online user tracking
"""

from fastapi import WebSocket
from typing import Dict, List
import json


class ConnectionManager:
    """
    Manages WebSocket connections for real-time messaging
    """
    def __init__(self):
        # Dictionary to store active connections: {user_id: WebSocket}
        self.active_connections: Dict[int, WebSocket] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        """
        Accept new WebSocket connection and register user
        """
        await websocket.accept()
        self.active_connections[user_id] = websocket
        
        # Notify all users that someone came online
        await self.broadcast_user_status(user_id, "online")

    def disconnect(self, user_id: int):
        """
        Remove disconnected user from active connections
        """
        if user_id in self.active_connections:
            del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        """
        Send message to specific user if they are online
        """
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)

    async def broadcast(self, message: dict):
        """
        Send message to all connected users
        """
        for connection in self.active_connections.values():
            await connection.send_json(message)

    async def broadcast_user_status(self, user_id: int, status: str):
        """
        Broadcast user online/offline status to all connections
        """
        message = {
            "type": "user_status",
            "user_id": user_id,
            "status": status
        }
        # Send to all except the user themselves
        for uid, connection in self.active_connections.items():
            if uid != user_id:
                await connection.send_json(message)

    def get_online_users(self) -> List[int]:
        """
        Return list of currently online user IDs
        """
        return list(self.active_connections.keys())


# Global connection manager instance
manager = ConnectionManager()


# Convenience functions for external use
async def connect(websocket: WebSocket, user_id: int):
    await manager.connect(websocket, user_id)


def disconnect(user_id: int):
    manager.disconnect(user_id)


async def send_personal_message(message: dict, user_id: int):
    await manager.send_personal_message(message, user_id)


async def broadcast(message: dict):
    await manager.broadcast(message)


def get_online_users() -> List[int]:
    return manager.get_online_users()
