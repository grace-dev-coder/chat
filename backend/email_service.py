import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

load_dotenv()

SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
BASE_URL = os.getenv("BASE_URL")

async def send_verification_email(email: str, token: str, name: str):
    verification_link = f"{BASE_URL}/verify-email?token={token}"
    
    message = MIMEMultipart("alternative")
    message["Subject"] = "Verify Your Email - Chat App"
    message["From"] = SMTP_USER
    message["To"] = email
    
    html_content = f"""
    <html>
        <body style="font-family: Arial, sans-serif; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 30px; border-radius: 10px;">
                <h2 style="color: #333;">Welcome to Chat App, {name}!</h2>
                <p>Thank you for registering. Please verify your email address by clicking the button below:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="{verification_link}" 
                       style="background: #667eea; color: white; padding: 12px 30px; 
                              text-decoration: none; border-radius: 5px; display: inline-block;">
                        Verify Email
                    </a>
                </div>
                <p style="color: #666; font-size: 14px;">
                    Or copy and paste this link: {verification_link}
                </p>
                <p style="color: #999; font-size: 12px; margin-top: 30px;">
                    If you didn't create this account, please ignore this email.
                </p>
            </div>
        </body>
    </html>
    """
    
    text_content = f"""
    Welcome to Chat App, {name}!
    
    Please verify your email by visiting: {verification_link}
    
    If you didn't create this account, please ignore this email.
    """
    
    part1 = MIMEText(text_content, "plain")
    part2 = MIMEText(html_content, "html")
    
    message.attach(part1)
    message.attach(part2)
    
    try:
        await aiosmtplib.send(
            message,
            hostname=SMTP_HOST,
            port=SMTP_PORT,
            start_tls=True,
            username=SMTP_USER,
            password=SMTP_PASSWORD
        )
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False