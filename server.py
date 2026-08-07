#!/usr/bin/env python3
"""Small static server and contact endpoint for ACSS Plants.

Run with: python3 server.py
Configure SMTP_HOST, SMTP_USER, SMTP_PASS and the other values in .env.
"""

import json
import mimetypes
import os
import re
import smtplib
import time
from email.message import EmailMessage
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error as urlerror
from urllib import request as urlrequest
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parent


def load_env_file(path):
    if not path.is_file():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip("\"'")
        os.environ.setdefault(key, value)


load_env_file(ROOT / ".env")
PORT = int(os.getenv("PORT", "3000"))
MAIL_TO = os.getenv("MAIL_TO", "acss.agricultura@gmail.com")
MAIL_FROM = os.getenv("MAIL_FROM", os.getenv("SMTP_USER", ""))
MAILERSEND_API_TOKEN = os.getenv("MAILERSEND_API_TOKEN", "")
MAILERSEND_FROM_EMAIL = os.getenv("MAILERSEND_FROM_EMAIL", MAIL_FROM)
MAILERSEND_FROM_NAME = os.getenv("MAILERSEND_FROM_NAME", "ACSS Plants")
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASS = os.getenv("SMTP_PASS", "")
SMTP_TLS = os.getenv("SMTP_TLS", "true").lower() == "true"
SMTP_SSL = os.getenv("SMTP_SSL", "false").lower() == "true"

MAX_BODY_BYTES = 64 * 1024
RATE_WINDOW_SECONDS = 10 * 60
RATE_LIMIT = 5
recent_requests = {}


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    handler.wfile.write(body)


def clean(value, limit=2000):
    return str(value or "").replace("\x00", "").strip()[:limit]


def valid_email(value):
    return bool(re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value))


def rate_limited(ip):
    now = time.time()
    timestamps = [stamp for stamp in recent_requests.get(ip, []) if now - stamp < RATE_WINDOW_SECONDS]
    if len(timestamps) >= RATE_LIMIT:
        recent_requests[ip] = timestamps
        return True
    timestamps.append(now)
    recent_requests[ip] = timestamps
    return False


def contact_message(data):
    subject = f"Novo pedido de contacto — {data['nome']}"
    lines = [
        "Novo pedido de contacto através do site ACSS Plants",
        "",
        f"Nome: {data['nome']}",
        f"Email: {data['email']}",
        f"Empresa: {data['empresa'] or '—'}",
        f"Cargo: {data['cargo'] or '—'}",
        f"País: {data['pais']}",
        f"Telefone: {data['telefone']}",
        f"Interesse: {data['interesse'] or '—'}",
        f"Quantidade: {data['quantidade'] or '—'}",
        "",
        "Mensagem:",
        data["mensagem"],
    ]
    return subject, lines


def send_with_mailersend(data):
    if not MAILERSEND_API_TOKEN or not MAILERSEND_FROM_EMAIL:
        raise RuntimeError("MailerSend is not configured")

    subject, lines = contact_message(data)
    payload = {
        "from": {"email": MAILERSEND_FROM_EMAIL, "name": MAILERSEND_FROM_NAME},
        "to": [{"email": MAIL_TO, "name": "ACSS Plants"}],
        "reply_to": {"email": data["email"], "name": data["nome"]},
        "subject": subject,
        "text": "\n".join(lines),
    }
    request = urlrequest.Request(
        "https://api.mailersend.com/v1/email",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {MAILERSEND_API_TOKEN}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urlrequest.urlopen(request, timeout=20) as response:
            if response.status not in (200, 202):
                raise RuntimeError(f"MailerSend returned HTTP {response.status}")
    except urlerror.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:500]
        raise RuntimeError(f"MailerSend returned HTTP {error.code}: {detail}") from error
    except urlerror.URLError as error:
        raise RuntimeError(f"MailerSend connection failed: {error.reason}") from error


def send_with_smtp(data):
    if not SMTP_HOST or not MAIL_FROM:
        raise RuntimeError("SMTP is not configured")

    subject, lines = contact_message(data)

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = MAIL_FROM
    message["To"] = MAIL_TO
    message["Reply-To"] = data["email"]
    message.set_content("\n".join(lines))

    if SMTP_SSL:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASS)
            smtp.send_message(message)
    else:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=20) as smtp:
            smtp.ehlo()
            if SMTP_TLS:
                smtp.starttls()
                smtp.ehlo()
            if SMTP_USER:
                smtp.login(SMTP_USER, SMTP_PASS)
            smtp.send_message(message)


def send_contact_email(data):
    if MAILERSEND_API_TOKEN:
        send_with_mailersend(data)
        return
    send_with_smtp(data)


class ACSSHandler(BaseHTTPRequestHandler):
    server_version = "ACSSContact/1.0"

    def log_message(self, format, *args):
        print(f"[{self.log_date_time_string()}] {format % args}")

    def do_OPTIONS(self):
        if urlparse(self.path).path == "/api/contact":
            self.send_response(204)
            self.send_header("Allow", "OPTIONS, POST")
            self.end_headers()
            return
        self.send_error(404)

    def do_POST(self):
        if urlparse(self.path).path != "/api/contact":
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY_BYTES:
            json_response(self, 413, {"ok": False, "error": "Invalid request size"})
            return

        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            json_response(self, 400, {"ok": False, "error": "Invalid JSON"})
            return

        data = {key: clean(payload.get(key), 4000 if key == "mensagem" else 500) for key in (
            "nome", "email", "empresa", "cargo", "pais", "telefone", "interesse", "quantidade", "mensagem", "website"
        )}

        # Silent success for the honeypot avoids teaching bots that the request failed.
        if data["website"]:
            json_response(self, 200, {"ok": True})
            return

        missing = [key for key in ("nome", "email", "pais", "telefone", "mensagem") if not data[key]]
        if missing or not valid_email(data["email"]):
            json_response(self, 400, {"ok": False, "error": "Invalid required fields"})
            return
        if len(data["mensagem"]) < 10:
            json_response(self, 400, {"ok": False, "error": "Message is too short"})
            return
        if data["quantidade"] and not data["quantidade"].isdigit():
            json_response(self, 400, {"ok": False, "error": "Invalid quantity"})
            return
        if rate_limited(self.client_address[0]):
            json_response(self, 429, {"ok": False, "error": "Too many requests"})
            return

        try:
            send_contact_email(data)
        except Exception as error:
            print(f"Contact email failed: {error}")
            json_response(self, 500, {"ok": False, "error": "Email delivery failed"})
            return

        json_response(self, 200, {"ok": True})

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            json_response(self, 404, {"ok": False, "error": "Not found"})
            return

        relative = unquote(parsed.path).lstrip("/") or "index.html"
        candidate = (ROOT / relative).resolve()
        if ROOT not in candidate.parents and candidate != ROOT:
            self.send_error(403)
            return
        if not candidate.is_file():
            self.send_error(404)
            return

        content = candidate.read_bytes()
        content_type = mimetypes.guess_type(candidate.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(content)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(content)


if __name__ == "__main__":
    print(f"ACSS server listening on http://0.0.0.0:{PORT}")
    if not MAILERSEND_API_TOKEN and not SMTP_HOST:
        print("Warning: MailerSend and SMTP are not configured; /api/contact will return 500 until email delivery is configured.")
    ThreadingHTTPServer(("0.0.0.0", PORT), ACSSHandler).serve_forever()
