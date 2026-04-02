from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session
from database import engine, Base, get_db, SessionLocal
from models import User, Message
from auth import authenticate_user, create_access_token, get_password_hash, verify_token, ACCESS_TOKEN_EXPIRE_MINUTES
from email_service import send_verification_email
from websocket_manager import manager
from datetime import datetime, timedelta
from pydantic import BaseModel, EmailStr
import secrets
import os
from typing import List, Optional
from contextlib import asynccontextmanager

Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_admin()
    yield

app = FastAPI(title="Real-Time Chat API", lifespan=lifespan)

# FIXED CORS - Explicitly list Authorization header
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["*"],
    max_age=3600,
)

@app.middleware("http")
async def cors_handler(request, call_next):
    if request.method == "OPTIONS":
        return JSONResponse(
            content={"message": "OK"},
            headers={
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Origin, X-Requested-With",
                "Access-Control-Allow-Credentials": "true",
            }
        )
    response = await call_next(request)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type, Accept, Origin, X-Requested-With"
    return response

# Serve frontend
frontend_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "frontend")
app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
async def serve_index():
    return FileResponse(os.path.join(frontend_path, "index.html"))

@app.get("/register")
async def serve_register():
    return FileResponse(os.path.join(frontend_path, "register.html"))

@app.get("/login")
async def serve_login():
    return FileResponse(os.path.join(frontend_path, "login.html"))

@app.get("/chat")
async def serve_chat():
    return FileResponse(os.path.join(frontend_path, "chat.html"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: int
    name: str
    email: str
    is_verified: bool
    is_online: bool
    last_seen: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    receiver_id: int
    content: str

class MessageResponse(BaseModel):
    id: int
    sender_id: int
    receiver_id: int
    content: str
    timestamp: datetime
    is_read: bool
    sender_name: Optional[str] = None
    
    class Config:
        from_attributes = True

async def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token_data = verify_token(token)
    if token_data is None:
        raise credentials_exception
    user = db.query(User).filter(User.email == token_data.email).first()
    if user is None:
        raise credentials_exception
    return user

async def get_current_admin(current_user: User = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user

@app.post("/register")
async def register(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    hashed_password = get_password_hash(user.password)
    new_user = User(
        name=user.name,
        email=user.email,
        hashed_password=hashed_password,
        is_verified=True,
        verification_token=None
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "Registration successful. You can now log in."}

@app.post("/token")
async def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(data={"sub": user.email}, expires_delta=access_token_expires)
    
    user.is_online = True
    user.last_seen = datetime.utcnow()
    db.commit()
    await manager.notify_user_status(user.id, True)
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "is_admin": user.is_admin
        }
    }

@app.post("/logout")
async def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.is_online = False
    current_user.last_seen = datetime.utcnow()
    db.commit()
    await manager.notify_user_status(current_user.id, False)
    return {"message": "Logged out successfully"}

@app.get("/users/me", response_model=UserResponse)
async def read_users_me(current_user: User = Depends(get_current_user)):
    return current_user

@app.get("/users", response_model=List[UserResponse])
async def get_users(search: Optional[str] = None, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    query = db.query(User).filter(User.id != current_user.id)
    if search:
        query = query.filter(User.name.ilike(f"%{search}%"))
    return query.all()

@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@app.post("/messages", response_model=MessageResponse)
async def create_message(message: MessageCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    receiver = db.query(User).filter(User.id == message.receiver_id).first()
    if not receiver:
        raise HTTPException(status_code=404, detail="Receiver not found")
    
    new_message = Message(
        sender_id=current_user.id,
        receiver_id=message.receiver_id,
        content=message.content
    )
    db.add(new_message)
    db.commit()
    db.refresh(new_message)
    
    await manager.send_personal_message({
        "type": "new_message",
        "message": {
            "id": new_message.id,
            "sender_id": new_message.sender_id,
            "receiver_id": new_message.receiver_id,
            "content": new_message.content,
            "timestamp": new_message.timestamp.isoformat(),
            "sender_name": current_user.name
        }
    }, message.receiver_id)
    
    return {
        "id": new_message.id,
        "sender_id": new_message.sender_id,
        "receiver_id": new_message.receiver_id,
        "content": new_message.content,
        "timestamp": new_message.timestamp,
        "is_read": new_message.is_read,
        "sender_name": current_user.name
    }

@app.get("/messages/{user_id}", response_model=List[MessageResponse])
async def get_messages(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    messages = db.query(Message).filter(
        ((Message.sender_id == current_user.id) & (Message.receiver_id == user_id)) |
        ((Message.sender_id == user_id) & (Message.receiver_id == current_user.id))
    ).order_by(Message.timestamp.asc()).all()
    
    for msg in messages:
        if msg.receiver_id == current_user.id and not msg.is_read:
            msg.is_read = True
    db.commit()
    
    result = []
    for msg in messages:
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        result.append({
            "id": msg.id,
            "sender_id": msg.sender_id,
            "receiver_id": msg.receiver_id,
            "content": msg.content,
            "timestamp": msg.timestamp,
            "is_read": msg.is_read,
            "sender_name": sender.name if sender else "Unknown"
        })
    return result

@app.get("/conversations")
async def get_conversations(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    sent_to = db.query(Message.receiver_id).filter(Message.sender_id == current_user.id).distinct()
    received_from = db.query(Message.sender_id).filter(Message.receiver_id == current_user.id).distinct()
    
    partner_ids = set([r[0] for r in sent_to.all()] + [r[0] for r in received_from.all()])
    
    conversations = []
    for partner_id in partner_ids:
        partner = db.query(User).filter(User.id == partner_id).first()
        if partner:
            last_message = db.query(Message).filter(
                ((Message.sender_id == current_user.id) & (Message.receiver_id == partner_id)) |
                ((Message.sender_id == partner_id) & (Message.receiver_id == current_user.id))
            ).order_by(Message.timestamp.desc()).first()
            
            unread_count = db.query(Message).filter(
                Message.sender_id == partner_id,
                Message.receiver_id == current_user.id,
                Message.is_read == False
            ).count()
            
            conversations.append({
                "user": {
                    "id": partner.id,
                    "name": partner.name,
                    "is_online": partner.is_online,
                    "last_seen": partner.last_seen
                },
                "last_message": {
                    "content": last_message.content if last_message else None,
                    "timestamp": last_message.timestamp if last_message else None,
                    "is_from_me": last_message.sender_id == current_user.id if last_message else None
                },
                "unread_count": unread_count
            })
    
    conversations.sort(key=lambda x: x["last_message"]["timestamp"] or datetime.min, reverse=True)
    return conversations

@app.websocket("/ws/{token}")
async def websocket_endpoint(websocket: WebSocket, token: str, db: Session = Depends(get_db)):
    token_data = verify_token(token)
    if not token_data:
        await websocket.close(code=4001)
        return
    
    user = db.query(User).filter(User.email == token_data.email).first()
    if not user:
        await websocket.close(code=4001)
        return
    
    await manager.connect(user.id, websocket)
    
    try:
        while True:
            data = await websocket.receive_json()
            if data.get("type") == "typing":
                await manager.send_typing_indicator(user.id, data.get("receiver_id"), data.get("is_typing"))
            elif data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        manager.disconnect(user.id)
        user.is_online = False
        user.last_seen = datetime.utcnow()
        db.commit()
        await manager.notify_user_status(user.id, False)

@app.get("/admin/users", response_model=List[UserResponse])
async def admin_get_users(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return db.query(User).all()

@app.delete("/admin/users/{user_id}")
async def admin_delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    db.query(Message).filter((Message.sender_id == user_id) | (Message.receiver_id == user_id)).delete()
    db.delete(user)
    db.commit()
    return {"message": "User deleted successfully"}

@app.get("/admin/messages")
async def admin_get_all_messages(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    messages = db.query(Message).order_by(Message.timestamp.desc()).limit(100).all()
    result = []
    for msg in messages:
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        receiver = db.query(User).filter(User.id == msg.receiver_id).first()
        result.append({
            "id": msg.id,
            "sender": {"id": sender.id, "name": sender.name} if sender else None,
            "receiver": {"id": receiver.id, "name": receiver.name} if receiver else None,
            "content": msg.content,
            "timestamp": msg.timestamp,
            "is_read": msg.is_read
        })
    return result

@app.delete("/admin/messages/{message_id}")
async def admin_delete_message(message_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    message = db.query(Message).filter(Message.id == message_id).first()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    db.delete(message)
    db.commit()
    return {"message": "Message deleted successfully"}

@app.get("/admin/stats")
async def admin_get_stats(db: Session = Depends(get_db), current_user: User = Depends(get_current_admin)):
    return {
        "total_users": db.query(User).count(),
        "verified_users": db.query(User).filter(User.is_verified == True).count(),
        "online_users": db.query(User).filter(User.is_online == True).count(),
        "total_messages": db.query(Message).count(),
    }

async def create_admin():
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.email == "admin@chat.com").first()
        if not admin:
            admin_user = User(
                name="Admin",
                email="admin@chat.com",
                hashed_password=get_password_hash("admin123"),
                is_verified=True,
                is_admin=True
            )
            db.add(admin_user)
            db.commit()
            print("Admin user created: admin@chat.com / admin123")
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
