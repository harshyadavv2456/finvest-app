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


def send_pipeline_status_alert(job_status: dict) -> bool:
    """Called from .github/workflows/daily-refresh.yml's notify-status job
    with `toJSON(needs)` - a dict of {job_name: {"result": "...", ...}}.
    Alerts (email + telegram) only when something actually failed; a
    clean run stays quiet rather than paging every night. Silently a
    no-op if GMAIL_USER/GMAIL_APP_PASSWORD or TELEGRAM_BOT_TOKEN/
    TELEGRAM_CHAT_ID secrets aren't set on the repo - same as every
    other alert path in this module - so add those as GitHub Actions
    repo secrets to actually receive this.

    This function didn't exist before 2026-08-21 despite the workflow
    step trying to import it every run - the notify-status job itself
    was silently failing (ImportError) on every single daily-refresh
    run, so pipeline failures were never actually surfaced.
    """
    failed = {name: info for name, info in job_status.items() if info.get("result") == "failure"}
    skipped = {name: info for name, info in job_status.items() if info.get("result") == "skipped"}

    if not failed:
        logger.info("Daily refresh: all jobs passed (%s), no alert needed.", ", ".join(job_status.keys()))
        return True

    lines = [f"FinVest daily refresh: {len(failed)} job(s) failed"]
    for name in failed:
        lines.append(f"  ✗ {name}")
    if skipped:
        lines.append("Skipped (likely due to a failed dependency):")
        for name in skipped:
            lines.append(f"  - {name}")
    msg = "\n".join(lines)

    email_ok = _send_email("FinVest: daily refresh failure", msg)
    telegram_ok = _send_telegram(f"⚠️ {msg}")
    if not email_ok and not telegram_ok:
        logger.warning("Pipeline failure alert not delivered - no GMAIL_* or TELEGRAM_* secrets configured. Failed jobs: %s", list(failed.keys()))
    return email_ok or telegram_ok


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
