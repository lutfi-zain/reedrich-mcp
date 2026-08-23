import { Hono } from "hono";
import { html } from "hono/html";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../db/schema";
import { generateOAuthCode, verifyOAuthCode } from "../utils/oauth";
import { registerUser, loginUser } from "../services";
import { generateUserToken } from "../utils/token";

export type OAuthBindings = {
  DB: D1Database;
  JWT_SECRET: string;
  OAUTH_CLIENT_ID?: string;
  OAUTH_CLIENT_SECRET?: string;
};

const oauth = new Hono<{ Bindings: OAuthBindings }>();

// -----------------------------------------------------------------------------
// 1. GET /authorize — Web Consent & Login/Signup UI
// -----------------------------------------------------------------------------
oauth.get("/authorize", (c) => {
  const clientId = c.req.query("client_id") || "chatgpt";
  const redirectUri = c.req.query("redirect_uri");
  const state = c.req.query("state") || "";
  const responseType = c.req.query("response_type") || "code";

  if (!redirectUri) {
    return c.json({ error: "invalid_request", message: "Missing required parameter: redirect_uri" }, 400);
  }

  const errorMessage = c.req.query("error_msg") || "";

  return c.html(
    html`<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Otorisasi Reedrich untuk ChatGPT</title>
  <style>
    :root {
      --bg: #0d1117;
      --card: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --heading: #f0f6fc;
      --primary: #238636;
      --primary-hover: #2ea043;
      --accent: #58a6ff;
      --danger: #f85149;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
      box-sizing: border-box;
    }
    .auth-card {
      width: 100%;
      max-width: 480px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.5);
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
    }
    .logo {
      font-size: 40px;
      margin-bottom: 8px;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: var(--heading);
      margin: 0 0 6px 0;
    }
    .subtitle {
      font-size: 14px;
      color: #8b949e;
      margin: 0;
    }
    .tabs {
      display: flex;
      border-bottom: 1px solid var(--border);
      margin-bottom: 20px;
    }
    .tab-btn {
      flex: 1;
      background: none;
      border: none;
      padding: 10px;
      color: #8b949e;
      font-weight: 600;
      font-size: 14px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
    }
    .tab-btn.active {
      color: var(--heading);
      border-bottom: 2px solid var(--accent);
    }
    .tab-content {
      display: none;
    }
    .tab-content.active {
      display: block;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--heading);
    }
    input {
      width: 100%;
      padding: 10px 12px;
      background: #0d1117;
      border: 1px solid var(--border);
      border-radius: 6px;
      color: var(--text);
      font-size: 14px;
      box-sizing: border-box;
    }
    input:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(88, 166, 255, 0.2);
    }
    .btn {
      width: 100%;
      padding: 12px;
      background: var(--primary);
      color: #ffffff;
      border: none;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      transition: background 0.15s;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .error-box {
      background: rgba(248, 81, 73, 0.1);
      border: 1px solid var(--danger);
      color: var(--danger);
      padding: 10px 12px;
      border-radius: 6px;
      font-size: 13px;
      margin-bottom: 16px;
    }
    .footer-note {
      font-size: 12px;
      color: #8b949e;
      text-align: center;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="auth-card">
    <div class="header">
      <div class="logo">⚡</div>
      <h1 class="title">Hubungkan ke Reedrich</h1>
      <p class="subtitle">Otorisasi ChatGPT untuk mengakses asisten keuangan Anda</p>
    </div>

    ${errorMessage ? html`<div class="error-box">${errorMessage}</div>` : ""}

    <div class="tabs">
      <button class="tab-btn active" onclick="switchTab('login')">Masuk dengan API Key</button>
      <button class="tab-btn" onclick="switchTab('signup')">Daftar Akun Baru</button>
    </div>

    <!-- Tab 1: Login via API Key -->
    <div id="tab-login" class="tab-content active">
      <form method="POST" action="/oauth/authorize">
        <input type="hidden" name="auth_method" value="login" />
        <input type="hidden" name="client_id" value="${clientId}" />
        <input type="hidden" name="redirect_uri" value="${redirectUri}" />
        <input type="hidden" name="state" value="${state}" />
        <input type="hidden" name="response_type" value="${responseType}" />

        <div class="form-group">
          <label for="apiKey">Persistent API Key (rd_live_... / fp_live_...)</label>
          <input type="password" id="apiKey" name="api_key" placeholder="rd_live_xxxxxxxxxxxxxxxx" required />
        </div>

        <button type="submit" class="btn">Otorisasi Akun</button>
      </form>
    </div>

    <!-- Tab 2: Signup New User -->
    <div id="tab-signup" class="tab-content">
      <form method="POST" action="/oauth/authorize">
        <input type="hidden" name="auth_method" value="signup" />
        <input type="hidden" name="client_id" value="${clientId}" />
        <input type="hidden" name="redirect_uri" value="${redirectUri}" />
        <input type="hidden" name="state" value="${state}" />
        <input type="hidden" name="response_type" value="${responseType}" />

        <div class="form-group">
          <label for="firstName">Nama Depan</label>
          <input type="text" id="firstName" name="first_name" placeholder="Budi" required />
        </div>

        <div class="form-group">
          <label for="lastName">Nama Belakang</label>
          <input type="text" id="lastName" name="last_name" placeholder="Santoso" required />
        </div>

        <div class="form-group">
          <label for="email">Alamat Email</label>
          <input type="email" id="email" name="email" placeholder="budi@example.com" required />
        </div>

        <div class="form-group">
          <label for="whatsapp">Nomor WhatsApp (dengan kode negara)</label>
          <input type="text" id="whatsapp" name="whatsapp_number" placeholder="+6281234567890" required />
        </div>

        <button type="submit" class="btn">Daftar & Otorisasi</button>
      </form>
    </div>

    <div class="footer-note">
      Data Anda dilindungi enkripsi end-to-end. <br/>
      <a href="/privacy" target="_blank" style="color: var(--accent);">Baca Kebijakan Privasi</a>
    </div>
  </div>

  <script>
    function switchTab(tab) {
      const loginTab = document.getElementById('tab-login');
      const signupTab = document.getElementById('tab-signup');
      const btns = document.querySelectorAll('.tab-btn');

      if (tab === 'login') {
        loginTab.classList.add('active');
        signupTab.classList.remove('active');
        btns[0].classList.add('active');
        btns[1].classList.remove('active');
      } else {
        signupTab.classList.add('active');
        loginTab.classList.remove('active');
        btns[1].classList.add('active');
        btns[0].classList.remove('active');
      }
    }
  </script>
</body>
</html>`
  );
});

// -----------------------------------------------------------------------------
// 2. POST /authorize — Process Consent & Issue Code
// -----------------------------------------------------------------------------
oauth.post("/authorize", async (c) => {
  let body: Record<string, string> = {};
  const contentType = c.req.header("Content-Type") || c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    body = (await c.req.json().catch(() => ({}))) as Record<string, string>;
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await c.req.text().catch(() => "");
    const params = new URLSearchParams(text);
    body = Object.fromEntries(params.entries());
  } else {
    body = (await c.req.parseBody().catch(() => ({}))) as Record<string, string>;
  }
  const authMethod = body["auth_method"] || "login";
  const clientId = body["client_id"] || "chatgpt";
  const redirectUri = body["redirect_uri"] || "";
  const state = body["state"] || "";
  if (!redirectUri) {
    return c.json({ error: "invalid_request", message: "Missing redirect_uri" }, 400);
  }

  const db = drizzle(c.env.DB, { schema });
  const jwtSecret = c.env.JWT_SECRET || "default-secret";

  let authenticatedUserId: string | null = null;

  try {
    if (authMethod === "login") {
      const apiKey = body["api_key"] || "";
      const loginRes = await loginUser(db, jwtSecret, apiKey);
      authenticatedUserId = loginRes.userId;
    } else {
      const firstName = body["first_name"] || "";
      const lastName = body["last_name"] || "";
      const email = body["email"] || "";
      const whatsappNumber = body["whatsapp_number"] || "";
      const regRes = await registerUser(db, jwtSecret, {
        firstName,
        lastName,
        email,
        whatsappNumber,
      });
      authenticatedUserId = regRes.userId;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : "Authentication error";
    const redirectBack = `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&error_msg=${encodeURIComponent(errorMsg)}`;
    return c.redirect(redirectBack, 302);
  }

  if (!authenticatedUserId) {
    const redirectBack = `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}&error_msg=${encodeURIComponent("Authentication failed")}`;
    return c.redirect(redirectBack, 302);
  }

  const code = await generateOAuthCode(
    {
      userId: authenticatedUserId,
      clientId,
      redirectUri,
    },
    jwtSecret
  );

  const delimiter = redirectUri.includes("?") ? "&" : "?";
  const callbackUrl = `${redirectUri}${delimiter}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;

  return c.redirect(callbackUrl, 302);
});

// -----------------------------------------------------------------------------
// 3. POST /token — Code Exchange for Access Token
// -----------------------------------------------------------------------------
oauth.post("/token", async (c) => {
  let grantType = "";
  let code = "";
  let clientId = "";
  let redirectUri = "";
  const contentType = c.req.header("Content-Type") || c.req.header("content-type") || "";
  if (contentType.includes("application/json")) {
    const jsonBody = (await c.req.json().catch(() => ({}))) as Record<string, string>;
    grantType = jsonBody.grant_type || "";
    code = jsonBody.code || "";
    clientId = jsonBody.client_id || "";
    redirectUri = jsonBody.redirect_uri || "";
  } else if (contentType.includes("application/x-www-form-urlencoded")) {
    const text = await c.req.text().catch(() => "");
    const params = new URLSearchParams(text);
    grantType = params.get("grant_type") || "";
    code = params.get("code") || "";
    clientId = params.get("client_id") || "";
    redirectUri = params.get("redirect_uri") || "";
  } else {
    const parsedBody = (await c.req.parseBody().catch(() => ({}))) as Record<string, string>;
    grantType = parsedBody["grant_type"] || "";
    code = parsedBody["code"] || "";
    clientId = parsedBody["client_id"] || "";
    redirectUri = parsedBody["redirect_uri"] || "";
  }

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type", error_description: "Only authorization_code grant type is supported" }, 400);
  }

  if (!code) {
    return c.json({ error: "invalid_request", error_description: "Missing required parameter: code" }, 400);
  }

  const jwtSecret = c.env.JWT_SECRET || "default-secret";
  const codePayload = await verifyOAuthCode(code, jwtSecret, {
    expectedClientId: clientId || undefined,
    expectedRedirectUri: redirectUri || undefined,
  });

  if (!codePayload) {
    return c.json({ error: "invalid_grant", error_description: "Invalid or expired authorization code" }, 400);
  }

  // Generate a long-lived (30-day) JWT session access token for ChatGPT Custom Action
  const accessTokenExpirySeconds = 30 * 86400; // 30 days
  const accessToken = await generateUserToken({ userId: codePayload.userId, expiresInSeconds: accessTokenExpirySeconds }, jwtSecret);

  return c.json(
    {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: accessTokenExpirySeconds,
    },
    200
  );
});

export default oauth;
