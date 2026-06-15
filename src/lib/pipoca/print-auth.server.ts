// Server-only helpers for the print-queue admin session.
// PIN is checked server-side; a signed HMAC cookie carries the session.

import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "pipoca_pq";
const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8h

function getCookieSecret(): string {
  const s = process.env.PIPOCA_PRINT_QUEUE_COOKIE_SECRET;
  if (!s || s.length < 16) throw new Error("PIPOCA_PRINT_QUEUE_COOKIE_SECRET ausente");
  return s;
}

function getPin(): string {
  const p = process.env.PIPOCA_PRINT_QUEUE_PIN;
  if (!p) throw new Error("PIPOCA_PRINT_QUEUE_PIN ausente");
  return p.trim();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", getCookieSecret()).update(payload).digest());
}

export function verifyPin(input: string): boolean {
  const expected = Buffer.from(getPin());
  const got = Buffer.from(String(input ?? ""));
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

export function issueSessionToken(): { token: string; maxAge: number } {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${exp}`;
  const token = `${payload}.${sign(payload)}`;
  return { token, maxAge: SESSION_TTL_SECONDS };
}

export function isValidSessionToken(token: string | null | undefined): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [v, expStr, sig] = parts;
  if (v !== "v1") return false;
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || exp * 1000 < Date.now()) return false;
  const expected = sign(`${v}.${expStr}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export const PRINT_QUEUE_COOKIE = COOKIE_NAME;
export const PRINT_QUEUE_TTL = SESSION_TTL_SECONDS;
