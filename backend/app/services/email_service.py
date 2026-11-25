"""Outbound email via SMTP (Google or Outlook — configure with env)."""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.config import settings

_log = logging.getLogger("galaxy.email")


def smtp_configured() -> bool:
    return bool((settings.smtp_host or "").strip())


def send_email(*, to: str, subject: str, body_text: str) -> None:
    """
    Send a plain-text email.
    If SMTP is not configured, log the message (local/dev) and return without raising.
    """
    to_addr = (to or "").strip()
    if not to_addr:
        raise ValueError("Recipient email is required")

    if not smtp_configured():
        _log.info(
            "smtp_not_configured to=%s subject=%s body=%s",
            to_addr,
            subject,
            body_text.replace("\n", " | "),
        )
        return

    from_addr = (settings.smtp_from or settings.smtp_user or "").strip()
    if not from_addr:
        raise RuntimeError("SMTP_FROM or SMTP_USER must be set when SMTP_HOST is set")

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body_text)

    host = settings.smtp_host.strip()
    port = int(settings.smtp_port or 587)
    try:
        with smtplib.SMTP(host, port, timeout=30) as smtp:
            if settings.smtp_use_tls:
                smtp.starttls()
            user = (settings.smtp_user or "").strip()
            password = settings.smtp_password or ""
            if user:
                smtp.login(user, password)
            smtp.send_message(msg)
        _log.info("email_sent to=%s subject=%s", to_addr, subject)
    except Exception:
        _log.exception("email_send_failed to=%s", to_addr)
        raise
