"""
FastAPI Main Application - Chat System Backend
Handles HTTP endpoints, WebSocket connections, and serves static frontend files
"""

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from typing import List, Optional
import models
import database
import auth
import websocket_manager
from pydantic import BaseModel
import os

# Initialize FastAPI app
app = FastAPI(title="Chat System API", version="1.0.0")

# CORS middleware - allow frontend to communicate with backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact domains
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create database tables on startup
@app.on_event("startup")
async def startup_event():
    """Initialize database tables when server starts"""
    models.Base.metadata.create_all(bind=database.engine)

# Pydantic models for request/response validation
class UserCreate(BaseModel):
    """Schema for user registration"""
    username: str
    email: str
    password: str

class UserResponse(BaseModel):
    """Schema for user data response (excludes password)"""
    id: int
    username: str
    email: str
    created_at: datetime
    is_active: bool
    is_admin: bool
    
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    """Schema for sending a message"""
    receiver_id: int
    content: str

class MessageResponse(BaseModel):
    """Schema for message response"""
    id: int
    sender_id: int
    receiver_id: int
    content: str
    timestamp: datetime
    read_status: bool
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    """Schema for JWT token response"""
    access_token: str
    token_type: str

class ChatRoomCreate(BaseModel):
    """Schema for creating a chat room"""
    name: str
    description: Optional[str] = None

# Dependency to get database session
def get_db():
    """Yield database session and ensure cleanup"""
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()

# OAuth2 scheme for token authentication
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/register", response_model=UserResponse)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    """
    Register a new user
    Hashes password and stores user in database
    """
    # Check if username already exists
    db_user = db.query(models.User).filter(models.User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already registered")
    
    # Check if email already exists
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create new user with hashed password
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(
        username=user.username,
        email=user.email,
        password_hash=hashed_password
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

@app.post("/api/login", response_model=Token)
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    Authenticate user and return JWT token
    """
    # Verify user credentials
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Check if user is banned
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account has been banned")
    
    # Generate JWT token
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get current authenticated user's information
    """
    return current_user

# ==================== USER MANAGEMENT ENDPOINTS ====================

@app.get("/api/users", response_model=List[UserResponse])
async def get_users(
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get list of all active users (excluding banned)
    """
    users = db.query(models.User).filter(models.User.is_active == True).offset(skip).limit(limit).all()
    return users

@app.get("/api/users/online")
async def get_online_users():
    """
    Get list of currently online users (connected via WebSocket)
    """
    online = websocket_manager.get_online_users()
    return {"online_users": online}

# ==================== MESSAGE ENDPOINTS ====================

@app.post("/api/messages", response_model=MessageResponse)
async def send_message(
    message: MessageCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Send a message to another user (HTTP fallback)
    Real-time messages should use WebSocket
    """
    # Verify receiver exists
    receiver = db.query(models.User).filter(models.User.id == message.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")
    
    # Create message
    db_message = models.Message(
        sender_id=current_user.id,
        receiver_id=message.receiver_id,
        content=message.content
    )
    db.add(db_message)
    db.commit()
    db.refresh(db_message)
    
    # Notify receiver via WebSocket if online
    await websocket_manager.send_personal_message(
        {
            "type": "new_message",
            "message_id": db_message.id,
            "sender_id": current_user.id,
            "sender_username": current_user.username,
            "content": message.content,
            "timestamp": db_message.timestamp.isoformat()
        },
        message.receiver_id
    )
    
    return db_message

@app.get("/api/messages/{user_id}", response_model=List[MessageResponse])
async def get_chat_history(
    user_id: int,
    skip: int = 0,
    limit: int = 50,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get chat history between current user and specified user
    """
    messages = db.query(models.Message).filter(
        ((models.Message.sender_id == current_user.id) & (models.Message.receiver_id == user_id)) |
        ((models.Message.sender_id == user_id) & (models.Message.receiver_id == current_user.id))
    ).order_by(models.Message.timestamp.desc()).offset(skip).limit(limit).all()
    
    # Mark messages as read
    for msg in messages:
        if msg.receiver_id == current_user.id and not msg.read_status:
            msg.read_status = True
    db.commit()
    
    return messages

@app.get("/api/messages/unread/count")
async def get_unread_count(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get count of unread messages for current user
    """
    count = db.query(models.Message).filter(
        models.Message.receiver_id == current_user.id,
        models.Message.read_status == False
    ).count()
    return {"unread_count": count}

# ==================== WEBSOCKET ENDPOINTS ====================

@app.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """
    WebSocket endpoint for real-time messaging
    Each user connects with their user_id for identification
    """
    await websocket_manager.connect(websocket, user_id)
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_json()
            
            # Validate message structure
            if "receiver_id" not in data or "content" not in data:
                await websocket.send_json({"error": "Invalid message format"})
                continue
            
            # Get database session
            db = database.SessionLocal()
            try:
                # Verify sender exists
                sender = db.query(models.User).filter(models.User.id == user_id).first()
                if not sender or not sender.is_active:
                    await websocket.send_json({"error": "Unauthorized"})
                    continue
                
                # Create and store message
                db_message = models.Message(
                    sender_id=user_id,
                    receiver_id=data["receiver_id"],
                    content=data["content"]
                )
                db.add(db_message)
                db.commit()
                
                # Send to receiver if online
                await websocket_manager.send_personal_message(
                    {
                        "type": "message",
                        "id": db_message.id,
                        "sender_id": user_id,
                        "sender_username": sender.username,
                        "content": data["content"],
                        "timestamp": db_message.timestamp.isoformat()
                    },
                    data["receiver_id"]
                )
                
                # Confirm to sender
                await websocket.send_json({
                    "type": "sent_confirmation",
                    "message_id": db_message.id,
                    "timestamp": db_message.timestamp.isoformat()
                })
                
            finally:
                db.close()
                
    except WebSocketDisconnect:
        websocket_manager.disconnect(user_id)
    except Exception as e:
        print(f"WebSocket error: {e}")
        websocket_manager.disconnect(user_id)

# ==================== ADMIN ENDPOINTS ====================

@app.post("/api/admin/login", response_model=Token)
async def admin_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Admin login - requires admin privileges
    """
    user = auth.authenticate_user(db, form_data.username, form_data.password)
    if not user or not user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid admin credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = auth.create_access_token(
        data={"sub": user.username, "role": "admin"}, expires_delta=access_token_expires
    )
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/admin/users", response_model=List[UserResponse])
async def admin_get_all_users(
    current_user: models.User = Depends(auth.get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin: Get all users including banned ones
    """
    users = db.query(models.User).all()
    return users

@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin: Delete a user permanently
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    # Prevent self-deletion
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

@app.put("/api/admin/users/{user_id}/ban")
async def admin_ban_user(
    user_id: int,
    current_user: models.User = Depends(auth.get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin: Ban/unban a user (toggle is_active status)
    """
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot ban yourself")
    
    user.is_active = not user.is_active
    db.commit()
    
    status_msg = "banned" if not user.is_active else "unbanned"
    return {"message": f"User {status_msg} successfully"}

@app.get("/api/admin/messages")
async def admin_get_messages(
    search: Optional[str] = None,
    user_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    current_user: models.User = Depends(auth.get_current_admin),
    db: Session = Depends(get_db)
):
    """
    Admin: View all messages with search and filter options
    """
    query = db.query(models.Message)
    
    # Filter by user
    if user_id:
        query = query.filter(
            (models.Message.sender_id == user_id) | (models.Message.receiver_id == user_id)
        )
    
    # Search in content
    if search:
        query = query.filter(models.Message.content.contains(search))
    
    messages = query.order_by(models.Message.timestamp.desc()).offset(skip).limit(limit).all()
    return messages

# ==================== CHAT ROOMS (Optional) ====================

@app.post("/api/rooms")
async def create_room(
    room: ChatRoomCreate,
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Create a new chat room
    """
    db_room = models.ChatRoom(
        name=room.name,
        description=room.description,
        created_by=current_user.id
    )
    db.add(db_room)
    db.commit()
    db.refresh(db_room)
    return db_room

@app.get("/api/rooms")
async def get_rooms(
    current_user: models.User = Depends(auth.get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get all chat rooms
    """
    rooms = db.query(models.ChatRoom).all()
    return rooms

# Run with: uvicorn main:app --reload --host 0.0.0.0 --port 8000