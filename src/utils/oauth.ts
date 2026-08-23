import { sign, verify } from "hono/jwt";

export type OAuthCodePayload = {
  userId: string;
  clientId: string;
  redirectUri: string;
  exp: number;
  iat: number;
  iss: string;
};

export const OAUTH_CODE_EXPIRY_SECONDS = 300; // 5 minutes

export async function generateOAuthCode(
  params: { userId: string; clientId: string; redirectUri: string },
  jwtSecret: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: OAuthCodePayload = {
    userId: params.userId,
    clientId: params.clientId,
    redirectUri: params.redirectUri,
    iat: now,
    exp: now + OAUTH_CODE_EXPIRY_SECONDS,
    iss: "https://reedrich-mcp.lutfidmz.workers.dev/oauth",
  };

  return await sign(payload, jwtSecret, "HS256");
}

export async function verifyOAuthCode(
  code: string,
  jwtSecret: string,
  options?: { expectedClientId?: string; expectedRedirectUri?: string }
): Promise<{ userId: string; clientId: string; redirectUri: string } | null> {
  try {
    const payload = (await verify(code, jwtSecret, "HS256")) as unknown as OAuthCodePayload;
    if (!payload || !payload.userId) return null;

    if (options?.expectedClientId && payload.clientId !== options.expectedClientId) {
      return null;
    }
    if (options?.expectedRedirectUri && payload.redirectUri !== options.expectedRedirectUri) {
      return null;
    }

    return {
      userId: payload.userId,
      clientId: payload.clientId,
      redirectUri: payload.redirectUri,
    };
  } catch {
    return null;
  }
}
