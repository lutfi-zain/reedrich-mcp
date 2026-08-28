/**
 * PKCE S256 helpers per RFC 7636 Section 4.2
 * Pure Web Crypto, workerd compatible, zero Node deps.
 */

const VERIFIER_RE = /^[A-Za-z0-9\-._~]+$/;

/**
 * Validate code_verifier per RFC 7636: 43 ≤ len ≤ 128, alphabet A-Za-z0-9\-._~
 */
export function isValidVerifier(v: string): boolean {
  if (typeof v !== 'string') return false;
  if (v.length < 43 || v.length > 128) return false;
  return VERIFIER_RE.test(v);
}

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/**
 * Compute S256 code_challenge = BASE64URL(SHA256(ASCII(verifier))) without padding.
 */
export async function computeS256Challenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(digest);
}

/**
 * Constant-time string equality (content only; length mismatch returns false).
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify verifier against expected challenge using S256 transform + constant-time compare.
 */
export async function verifyS256Challenge(verifier: string, challenge: string): Promise<boolean> {
  const computed = await computeS256Challenge(verifier);
  return constantTimeEqual(computed, challenge);
}
