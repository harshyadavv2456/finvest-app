"""
Unified Notifications API
=========================
Routes all alerts through a single API:
  - Gmail SMTP (daily brief, friction alerts)
  - Telegram Bot (real-time friction, system health)

Configuration via environment variables:
  GMAIL_USER, GMAIL_APP_PASSWORD, ALERT_EMAIL_TO
  TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
"""

import os
import smtplib
import logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
ALERT_EMAIL_TO = os.environ.get("ALERT_EMAIL_TO", "")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")


class NotificationRequest(BaseModel):
    channel: str  # "email", "telegram", "all"
    subject: str
    body: str
    html: Optional[str] = None


class NotificationResponse(BaseModel):
    email_sent: bool = False
    telegram_sent: bool = False
    errors: List[str] = []


def _send_email(subject: str, body: str, html: Optional[str] = None) -> bool:
    recipients = [a.strip() for a in ALERT_EMAIL_TO.split(",") if a.strip()]
    if not GMAIL_USER or not GMAIL_APP_PASSWORD or not recipients:
        return False
    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject[:200]
        msg["From"] = GMAIL_USER
        msg["To"] = ", ".join(recipients)
        msg.attach(MIMEText(body, "plain", "utf-8"))
        if html:
            msg.attach(MIMEText(html, "html", "utf-8"))
        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as server:
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, recipients, msg.as_string())
        return True
    except Exception as e:
        logger.warning(f"Email send failed: {e}")
        return False


def _send_telegram(text: str) -> bool:
    if not TELEGRAM_BOT_TOKEN or not TELEGRAM_CHAT_ID:
        return False
    try:
        import urllib.request
        import urllib.parse
        url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
        data = urllib.parse.urlencode({
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text[:4096],
            "parse_mode": "HTML",
            "disable_web_page_preview": True,
        }).encode()
        req = urllib.request.Request(url, data=data, method="POST")
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status == 200
    except Exception as e:
        logger.warning(f"Telegram send failed: {e}")
        return False


@router.post("/send", response_model=NotificationResponse)
async def send_notification(req: NotificationRequest):
    """Send a notification via email, telegram, or both."""
    result = NotificationResponse()

    if req.channel in ("email", "all"):
        ok = _send_email(req.subject, req.body, req.html)
        result.email_sent = ok
        if not ok:
            result.errors.append("email_failed_or_not_configured")

    if req.channel in ("telegram", "all"):
        text = f"<b>{req.subject}</b>\n\n{req.body}"
        ok = _send_telegram(text)
        result.telegram_sent = ok
        if not ok:
            result.errors.append("telegram_failed_or_not_configured")

    return result


@router.get("/config")
async def notification_config():
    """Check which notification channels are configured."""
    return {
        "email": {
            "configured": bool(GMAIL_USER and GMAIL_APP_PASSWORD and ALERT_EMAIL_TO),
            "user": GMAIL_USER[:3] + "***" if GMAIL_USER else None,
            "recipients": len([a for a in ALERT_EMAIL_TO.split(",") if a.strip()]),
        },
        "telegram": {
            "configured": bool(TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID),
            "chat_id": TELEGRAM_CHAT_ID[:4] + "***" if TELEGRAM_CHAT_ID else None,
        },
    }
