#!/usr/bin/env node
"use strict";

/* Static file server + MailerSend contact endpoint. Requires Node 18+. */

const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const index = line.indexOf("=");
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 3000);
const MAIL_TO = process.env.MAIL_TO || "acss.agricultura@gmail.com";
const MAILERSEND_API_TOKEN = process.env.MAILERSEND_API_TOKEN || "";
const MAILERSEND_FROM_EMAIL = process.env.MAILERSEND_FROM_EMAIL || "";
const MAILERSEND_FROM_NAME = process.env.MAILERSEND_FROM_NAME || "ACSS Plants";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const MAX_BODY_BYTES = 64 * 1024;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT = 5;
const recentRequests = new Map();

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

function corsHeaders(res) {
  if (ALLOWED_ORIGIN) {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Vary", "Origin");
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  corsHeaders(res);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  res.end(body);
}

function clean(value, limit = 2000) {
  return String(value || "").replace(/\0/g, "").trim().slice(0, limit);
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isRateLimited(ip) {
  const now = Date.now();
  const timestamps = (recentRequests.get(ip) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT) {
    recentRequests.set(ip, timestamps);
    return true;
  }
  timestamps.push(now);
  recentRequests.set(ip, timestamps);
  return false;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error("Invalid request size"), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function contactMessage(data) {
  return [
    "Novo pedido de contacto através do site ACSS Plants",
    "",
    `Nome: ${data.nome}`,
    `Email: ${data.email}`,
    `Empresa: ${data.empresa || "—"}`,
    `Cargo: ${data.cargo || "—"}`,
    `País: ${data.pais}`,
    `Telefone: ${data.telefone}`,
    `Interesse: ${data.interesse || "—"}`,
    `Quantidade: ${data.quantidade || "—"}`,
    "",
    "Mensagem:",
    data.mensagem
  ].join("\n");
}

async function sendWithMailerSend(data) {
  if (!MAILERSEND_API_TOKEN || !MAILERSEND_FROM_EMAIL) {
    throw new Error("MailerSend is not configured");
  }

  const text = contactMessage(data);
  const response = await fetch("https://api.mailersend.com/v1/email", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${MAILERSEND_API_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({
      from: { email: MAILERSEND_FROM_EMAIL, name: MAILERSEND_FROM_NAME },
      to: [{ email: MAIL_TO, name: "ACSS Plants" }],
      reply_to: { email: data.email, name: data.nome },
      subject: `Novo pedido de contacto — ${data.nome}`,
      text
    })
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`MailerSend returned HTTP ${response.status}: ${detail}`);
  }
}

async function handleContact(req, res) {
  let payload;
  try {
    payload = JSON.parse(await readBody(req));
  } catch (error) {
    return sendJson(res, error.statusCode || 400, { ok: false, error: "Invalid JSON" });
  }

  const data = {};
  for (const key of ["nome", "email", "empresa", "cargo", "pais", "telefone", "interesse", "quantidade", "mensagem", "website"]) {
    data[key] = clean(payload[key], key === "mensagem" ? 4000 : 500);
  }
  if (data.website) return sendJson(res, 200, { ok: true });

  const missing = ["nome", "email", "pais", "telefone", "mensagem"].filter((key) => !data[key]);
  if (missing.length || !validEmail(data.email)) return sendJson(res, 400, { ok: false, error: "Invalid required fields" });
  if (data.mensagem.length < 10) return sendJson(res, 400, { ok: false, error: "Message is too short" });
  if (data.quantidade && !/^\d+$/.test(data.quantidade)) return sendJson(res, 400, { ok: false, error: "Invalid quantity" });
  if (isRateLimited(req.socket.remoteAddress || "unknown")) return sendJson(res, 429, { ok: false, error: "Too many requests" });

  try {
    await sendWithMailerSend(data);
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("Contact email failed:", error.message);
    return sendJson(res, 500, { ok: false, error: "Email delivery failed" });
  }
}

function serveStatic(req, res) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    return res.writeHead(400).end();
  }
  const relative = pathname.replace(/^\/+/, "") || "index.html";
  const file = path.resolve(ROOT, relative);
  if (file !== ROOT && !file.startsWith(`${ROOT}${path.sep}`)) return res.writeHead(403).end();
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) return res.writeHead(404).end("Not found");
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": stats.size,
      "X-Content-Type-Options": "nosniff"
    });
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/api/contact" && req.method === "OPTIONS") {
    corsHeaders(res);
    res.writeHead(204, { "Allow": "OPTIONS, POST", "Access-Control-Allow-Headers": "Content-Type" });
    return res.end();
  }
  if (pathname === "/api/contact" && req.method === "POST") return handleContact(req, res);
  if (pathname.startsWith("/api/")) return sendJson(res, 404, { ok: false, error: "Not found" });
  if (req.method !== "GET" && req.method !== "HEAD") return res.writeHead(405).end();
  return serveStatic(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ACSS server listening on http://0.0.0.0:${PORT}`);
  if (!MAILERSEND_API_TOKEN || !MAILERSEND_FROM_EMAIL) {
    console.warn("Warning: MailerSend is not configured; /api/contact will return 500 until it is configured.");
  }
});
