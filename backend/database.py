"""
Database Configuration Module
Sets up SQLAlchemy engine, session, and connection to SQLite database
"""

from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# SQLite database URL - stores data in local file
# For MySQL, use: "mysql+pymysql://user:password@localhost/chat_db"
SQLALCHEMY_DATABASE_URL = "sqlite:///./chat.db"

# Create database engine
# check_same_thread=False is needed for SQLite with FastAPI async
engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)

# Session factory for creating database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for declarative models
Base = declarative_base()

def get_db():
    """
    Dependency to get database session
    Ensures session is closed after request
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()