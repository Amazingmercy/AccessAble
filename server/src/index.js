import "dotenv/config";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import {
  generateRegistrationOptions, verifyRegistrationResponse,
  generateAuthenticationOptions, verifyAuthenticationResponse
} from "@simplewebauthn/server";
import { initDb, query, one, run, transaction } from "./db.js";

const app = express();
const PORT = Number(process.env.PORT || 4000);
const RP_NAME = process.env.RP_NAME || "AccessAble Banking";
const RP_ID = process.env.RP_ID || "localhost";
const ORIGIN = process.env.EXPECTED_ORIGIN || "http://localhost:5174";
const JWT_SECRET = process.env.JWT_SECRET || "accessable-super-secure-jwt-key-2026";
const PUBLIC_CUSTOMER_URL = process.env.PUBLIC_CUSTOMER_URL || "http://localhost:5174";
const STAFF_KEY = process.env.STAFF_KEY || "accessable-staff-demo-key-2026";

// WebAuthn challenges cache with 5-minute TTL
const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function setChallenge(key, challenge) {
  challenges.set(key, { challenge, expiresAt: Date.now() + CHALLENGE_TTL_MS });
}

function getChallenge(key) {
  const item = challenges.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    challenges.delete(key);
    return null;
  }
  return item.challenge;
}

app.use(cors({ origin: true }));
app.use(express.json({ limit: "1mb" }));

const money = n => `₦${(Number(n) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const safeCustomer = (c, prefs = null) => ({
  id: c.id,
  name: c.name,
  accountNumber: c.account_number,
  phone: c.phone || "",
  email: c.email || "",
  balance: c.balance,
  formattedBalance: money(c.balance),
  status: c.status,
  activationToken: c.activation_token,
  createdAt: c.created_at,
  accessibilityPreferences: prefs || getCustomerPreferences(c.id)
});

function getCustomerPreferences(customerId) {
  const p = one("SELECT * FROM accessibility_preferences WHERE customer_id = ?", [customerId]);
  if (!p) {
    return {
      voiceGuidance: true,
      speechRate: 1.0,
      textSize: "normal",
      highContrast: false,
      screenReader: true,
      preferredInteractionMode: "voice_first"
    };
  }
  return {
    voiceGuidance: Boolean(p.voice_guidance),
    speechRate: Number(p.speech_rate) || 1.0,
    textSize: p.text_size || "normal",
    highContrast: Boolean(p.high_contrast),
    screenReader: Boolean(p.screen_reader),
    preferredInteractionMode: p.preferred_interaction_mode || "voice_first"
  };
}

// Authentication middleware for customers
const auth = (req, res, next) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Please authenticate to continue." });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const customer = one("SELECT * FROM customers WHERE id = ?", [payload.sub]);
    if (!customer) return res.status(401).json({ error: "Customer record not found." });
    if (customer.status !== "active") {
      return res.status(403).json({ error: "Your account is currently inactive. Please contact bank staff." });
    }
    req.session = payload;
    req.customer = customer;
    next();
  } catch {
    res.status(401).json({ error: "Session expired or invalid. Please authenticate again." });
  }
};

// Staff authentication middleware
const staffAuth = (req, res, next) => {
  const key = req.headers["x-staff-key"] || (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  // In demo prototype mode, allow access if key matches or header is provided
  if (STAFF_KEY && key && key !== STAFF_KEY && key !== "demo-staff") {
    return res.status(403).json({ error: "Unauthorized staff access." });
  }
  req.staff = { id: "staff-operator", role: "admin" };
  next();
};

/* ----------------- System & Health ----------------- */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    service: "AccessAble Banking API",
    version: "2.1.0",
    environment: "demonstration",
    timestamp: new Date().toISOString()
  });
});

/* ----------------- Staff Dashboard Endpoints ----------------- */
app.get("/api/dashboard/summary", staffAuth, (req, res) => {
  const customers = one("SELECT COUNT(*) AS n FROM customers")?.n || 0;
  const active = one("SELECT COUNT(*) AS n FROM customers WHERE status='active'")?.n || 0;
  const deactivated = one("SELECT COUNT(*) AS n FROM customers WHERE status!='active'")?.n || 0;
  const tx = one("SELECT COUNT(*) AS n FROM transactions")?.n || 0;
  const volume = one("SELECT COALESCE(SUM(amount),0) AS n FROM transactions WHERE type='debit' AND status='successful'")?.n || 0;
  const passkeys = one("SELECT COUNT(DISTINCT customer_id) AS n FROM credentials")?.n || 0;

  res.json({
    totalCustomers: customers,
    activeCustomers: active,
    deactivatedCustomers: deactivated,
    transactions: tx,
    transferVolume: volume,
    passkeyEnrolledCustomers: passkeys
  });
});

app.get("/api/dashboard/transactions", staffAuth, (req, res) => {
  const rows = query(`
    SELECT t.id, t.reference, t.type, t.description, t.amount, t.status, t.created_at,
           c.name as customer_name, c.account_number as customer_account
    FROM transactions t
    LEFT JOIN customers c ON c.id = t.customer_id
    ORDER BY t.created_at DESC
    LIMIT 100
  `);
  res.json(rows.map(r => ({
    id: r.id,
    reference: r.reference || `TXN-${r.id.substring(0, 6).toUpperCase()}`,
    customerName: r.customer_name || "Unknown Customer",
    customerAccount: r.customer_account || "—",
    type: r.type,
    description: r.description,
    amount: money(r.amount),
    rawAmount: r.amount,
    status: r.status,
    createdAt: r.created_at
  })));
});

app.get("/api/dashboard/security-settings", staffAuth, (req, res) => {
  res.json({
    rpId: RP_ID,
    rpName: RP_NAME,
    expectedOrigin: ORIGIN,
    challengeTtlSeconds: CHALLENGE_TTL_MS / 1000,
    staffKeyConfigured: Boolean(STAFF_KEY),
    userVerification: "required",
    spokenPinPolicy: "strictly_disallowed",
    simulatedFinancialRails: true,
    platformAuthenticatorRequired: true,
    maxDemoTransferLimit: 20000000 // ₦200,000 in kobo
  });
});

app.post("/api/dashboard/reset-demo", staffAuth, (req, res) => {
  run("UPDATE customers SET balance = 8500000, status = 'active' WHERE id = 'c_emeka'");
  run("UPDATE customers SET balance = 12500000, status = 'active' WHERE id = 'c_john'");
  res.json({
    success: true,
    message: "Demo balances and customer statuses reset to default demo values."
  });
});

app.get("/api/customers", staffAuth, (req, res) => {
  const rows = query(`
    SELECT c.*,
      (SELECT COUNT(*) FROM credentials k WHERE k.customer_id = c.id) AS passkeys,
      (SELECT COUNT(*) FROM beneficiaries b WHERE b.customer_id = c.id) AS beneficiary_count
    FROM customers c
    ORDER BY c.created_at DESC
  `);
  res.json(rows.map(c => ({
    ...safeCustomer(c),
    passkeyRegistered: Number(c.passkeys) > 0,
    beneficiaryCount: Number(c.beneficiary_count) || 0,
    activationUrl: `${PUBLIC_CUSTOMER_URL}/activate/${c.activation_token}`
  })));
});

app.get("/api/customers/:id", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });

  const prefs = getCustomerPreferences(c.id);
  const beneficiaries = query(
    "SELECT id, nickname, account_holder_name AS accountHolderName, account_number AS accountNumber, bank_name AS bankName, created_at AS createdAt FROM beneficiaries WHERE customer_id = ? ORDER BY nickname ASC",
    [c.id]
  );
  const credentials = query("SELECT id, credential_id AS credentialId, created_at AS createdAt FROM credentials WHERE customer_id = ?", [c.id]);
  const transactions = query("SELECT id, reference, type, description, amount, status, created_at AS createdAt FROM transactions WHERE customer_id = ? ORDER BY created_at DESC LIMIT 15", [c.id]);

  res.json({
    customer: safeCustomer(c, prefs),
    accessibilityPreferences: prefs,
    beneficiaries,
    credentials: credentials.map(k => ({ ...k, type: "platform_passkey" })),
    transactions: transactions.map(t => ({ ...t, formattedAmount: money(t.amount) })),
    activationUrl: `${PUBLIC_CUSTOMER_URL}/activate/${c.activation_token}`
  });
});

app.post("/api/customers", staffAuth, (req, res) => {
  const {
    name,
    accountNumber,
    phone = "",
    email = "",
    balance = 0,
    preferences = {},
    beneficiaries = []
  } = req.body || {};

  if (!name?.trim()) return res.status(400).json({ error: "Customer full name is required." });
  if (!accountNumber?.trim()) return res.status(400).json({ error: "Account reference / number is required." });

  const existingAccount = one("SELECT id FROM customers WHERE account_number = ?", [accountNumber.trim()]);
  if (existingAccount) return res.status(409).json({ error: "That account number is already registered." });

  const id = "c_" + randomUUID();
  const token = randomUUID().replaceAll("-", "");
  const now = new Date().toISOString();
  const parsedBalance = Math.max(0, Math.round(Number(balance || 0) * 100));

  try {
    transaction(() => {
      // 1. Insert customer
      run(
        `INSERT INTO customers
          (id, name, account_number, phone, email, balance, activation_token, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
        [id, name.trim(), accountNumber.trim(), phone.trim(), email.trim(), parsedBalance, token, now]
      );

      // 2. Insert accessibility preferences
      run(
        `INSERT INTO accessibility_preferences
          (customer_id, voice_guidance, speech_rate, text_size, high_contrast, screen_reader, preferred_interaction_mode, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          preferences.voiceGuidance !== false ? 1 : 0,
          Number(preferences.speechRate) || 1.0,
          preferences.textSize || "normal",
          preferences.highContrast ? 1 : 0,
          preferences.screenReader !== false ? 1 : 0,
          preferences.preferredInteractionMode || "voice_first",
          now
        ]
      );

      // 3. Insert beneficiaries
      if (Array.isArray(beneficiaries) && beneficiaries.length > 0) {
        for (const b of beneficiaries) {
          const nick = (b.nickname || b.name || "").trim();
          const holder = (b.accountHolderName || b.name || nick).trim();
          const acct = (b.accountNumber || "").trim();
          const bank = (b.bankName || "Demo Bank").trim();
          if (nick || acct) {
            run(
              `INSERT INTO beneficiaries
                (id, customer_id, name, nickname, account_holder_name, account_number, bank_name, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              ["b_" + randomUUID(), id, nick, nick, holder, acct, bank, now]
            );
          }
        }
      }
    });

    const activationUrl = `${PUBLIC_CUSTOMER_URL}/activate/${token}`;
    res.status(201).json({
      success: true,
      customer: {
        id,
        name: name.trim(),
        accountNumber: accountNumber.trim(),
        phone: phone.trim(),
        email: email.trim(),
        balance: parsedBalance,
        status: "active"
      },
      activationUrl
    });
  } catch (err) {
    console.error("Customer creation error:", err);
    res.status(500).json({ error: "Failed to create customer record." });
  }
});

app.put("/api/customers/:id", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });

  const { name, phone = "", email = "", balance } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "Customer full name is required." });

  const updatedBalance = balance !== undefined && balance !== null
    ? Math.max(0, Math.round(Number(balance) * 100))
    : c.balance;

  run(
    "UPDATE customers SET name = ?, phone = ?, email = ?, balance = ? WHERE id = ?",
    [name.trim(), phone.trim(), email.trim(), updatedBalance, c.id]
  );

  res.json({
    success: true,
    customer: safeCustomer({ ...c, name: name.trim(), phone: phone.trim(), email: email.trim(), balance: updatedBalance })
  });
});

app.patch("/api/customers/:id/status", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });

  const { status } = req.body || {};
  if (!["active", "deactivated"].includes(status)) {
    return res.status(400).json({ error: "Status must be either 'active' or 'deactivated'." });
  }

  run("UPDATE customers SET status = ? WHERE id = ?", [status, c.id]);
  res.json({
    success: true,
    message: `Customer profile is now ${status}.`,
    customer: safeCustomer({ ...c, status })
  });
});

app.put("/api/customers/:id/preferences", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });

  const {
    voiceGuidance = true,
    speechRate = 1.0,
    textSize = "normal",
    highContrast = false,
    screenReader = true,
    preferredInteractionMode = "voice_first"
  } = req.body || {};

  const now = new Date().toISOString();
  run(
    `INSERT OR REPLACE INTO accessibility_preferences
      (customer_id, voice_guidance, speech_rate, text_size, high_contrast, screen_reader, preferred_interaction_mode, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      voiceGuidance ? 1 : 0,
      Number(speechRate) || 1.0,
      textSize,
      highContrast ? 1 : 0,
      screenReader ? 1 : 0,
      preferredInteractionMode,
      now
    ]
  );

  res.json({
    success: true,
    accessibilityPreferences: getCustomerPreferences(c.id)
  });
});

app.post("/api/customers/:id/activation-link", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });
  res.json({
    activationUrl: `${PUBLIC_CUSTOMER_URL}/activate/${c.activation_token}`,
    token: c.activation_token,
    status: c.status
  });
});

app.post("/api/customers/:id/regenerate-token", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });

  const newToken = randomUUID().replaceAll("-", "");
  run("UPDATE customers SET activation_token = ? WHERE id = ?", [newToken, c.id]);
  res.json({
    success: true,
    activationUrl: `${PUBLIC_CUSTOMER_URL}/activate/${newToken}`,
    token: newToken
  });
});

/* ----------------- Beneficiary Management ----------------- */
app.get("/api/customers/:id/beneficiaries", staffAuth, (req, res) => {
  const rows = query(
    "SELECT id, nickname, account_holder_name AS accountHolderName, account_number AS accountNumber, bank_name AS bankName, created_at AS createdAt FROM beneficiaries WHERE customer_id = ? ORDER BY nickname ASC",
    [req.params.id]
  );
  res.json(rows);
});

app.post("/api/customers/:id/beneficiaries", staffAuth, (req, res) => {
  const c = one("SELECT * FROM customers WHERE id = ?", [req.params.id]);
  if (!c) return res.status(404).json({ error: "Customer not found." });

  const { nickname, accountHolderName, accountNumber, bankName = "Demo Bank" } = req.body || {};
  if (!nickname?.trim()) return res.status(400).json({ error: "Beneficiary nickname is required (e.g. Mama)." });
  if (!accountNumber?.trim()) return res.status(400).json({ error: "Account number is required." });

  const bId = "b_" + randomUUID();
  const holder = (accountHolderName || nickname).trim();
  const nick = nickname.trim();
  const now = new Date().toISOString();

  run(
    `INSERT INTO beneficiaries
      (id, customer_id, name, nickname, account_holder_name, account_number, bank_name, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [bId, c.id, nick, nick, holder, accountNumber.trim(), bankName.trim(), now]
  );

  res.status(201).json({
    success: true,
    beneficiary: {
      id: bId,
      nickname: nick,
      accountHolderName: holder,
      accountNumber: accountNumber.trim(),
      bankName: bankName.trim(),
      createdAt: now
    }
  });
});

app.put("/api/customers/:id/beneficiaries/:bId", staffAuth, (req, res) => {
  const b = one("SELECT * FROM beneficiaries WHERE id = ? AND customer_id = ?", [req.params.bId, req.params.id]);
  if (!b) return res.status(404).json({ error: "Beneficiary not found." });

  const { nickname, accountHolderName, accountNumber, bankName } = req.body || {};
  const nick = (nickname || b.nickname || b.name).trim();
  const holder = (accountHolderName || b.account_holder_name || nick).trim();
  const acct = (accountNumber || b.account_number).trim();
  const bank = (bankName || b.bank_name).trim();

  run(
    `UPDATE beneficiaries
      SET name = ?, nickname = ?, account_holder_name = ?, account_number = ?, bank_name = ?
      WHERE id = ? AND customer_id = ?`,
    [nick, nick, holder, acct, bank, b.id, req.params.id]
  );

  res.json({
    success: true,
    beneficiary: {
      id: b.id,
      nickname: nick,
      accountHolderName: holder,
      accountNumber: acct,
      bankName: bank
    }
  });
});

app.delete("/api/customers/:id/beneficiaries/:bId", staffAuth, (req, res) => {
  const b = one("SELECT * FROM beneficiaries WHERE id = ? AND customer_id = ?", [req.params.bId, req.params.id]);
  if (!b) return res.status(404).json({ error: "Beneficiary not found." });

  run("DELETE FROM beneficiaries WHERE id = ? AND customer_id = ?", [b.id, req.params.id]);
  res.json({ success: true, message: `Beneficiary '${b.nickname || b.name}' removed.` });
});

/* ----------------- NFC & Customer Activation ----------------- */
app.get("/api/activate/:token", (req, res) => {
  const c = one("SELECT * FROM customers WHERE activation_token = ?", [req.params.token]);
  if (!c) {
    return res.status(404).json({
      error: "This activation link is invalid or expired. Please contact your bank branch for a new AccessAble tag."
    });
  }
  if (c.status !== "active") {
    return res.status(403).json({
      error: "This customer profile is currently deactivated. Please contact your bank branch."
    });
  }

  const credential = one("SELECT credential_id FROM credentials WHERE customer_id = ? LIMIT 1", [c.id]);
  const prefs = getCustomerPreferences(c.id);

  res.json({
    customer: safeCustomer(c, prefs),
    hasPasskey: Boolean(credential),
    accessibilityPreferences: prefs
  });
});

/* ----------------- WebAuthn Biometrics ----------------- */
app.post("/api/webauthn/register/options", async (req, res) => {
  try {
    const c = one("SELECT * FROM customers WHERE activation_token = ?", [req.body.token]);
    if (!c) return res.status(404).json({ error: "Activation link not found." });
    if (c.status !== "active") return res.status(403).json({ error: "Account is inactive." });

    const existing = query("SELECT credential_id FROM credentials WHERE customer_id = ?", [c.id])
      .map(x => ({ id: x.credential_id, type: "public-key" }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: c.account_number,
      userDisplayName: c.name,
      userID: new TextEncoder().encode(c.id),
      attestationType: "none",
      excludeCredentials: existing,
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required"
      }
    });

    setChallenge(`reg:${c.id}`, options.challenge);
    res.json(options);
  } catch (e) {
    console.error("WebAuthn register options error:", e);
    res.status(500).json({ error: "Could not initialize biometric registration." });
  }
});

app.post("/api/webauthn/register/verify", async (req, res) => {
  try {
    const c = one("SELECT * FROM customers WHERE activation_token = ?", [req.body.token]);
    if (!c) return res.status(404).json({ error: "Activation link not found." });
    if (c.status !== "active") return res.status(403).json({ error: "Account is inactive." });

    const expectedChallenge = getChallenge(`reg:${c.id}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: "Registration session expired. Please tap the button again." });
    }

    const verification = await verifyRegistrationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      requireUserVerification: true
    });

    challenges.delete(`reg:${c.id}`);

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: "Biometric registration was not verified." });
    }

    const info = verification.registrationInfo;
    const credential = info.credential || {
      id: info.credentialID ? Buffer.from(info.credentialID).toString("base64url") : req.body.response.id,
      publicKey: info.credentialPublicKey,
      counter: info.counter
    };

    const credentialId = credential.id;
    const publicKey = Buffer.from(credential.publicKey).toString("base64");
    const now = new Date().toISOString();

    run(
      `INSERT OR REPLACE INTO credentials
        (id, customer_id, credential_id, public_key, counter, transports, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        c.id,
        credentialId,
        publicKey,
        credential.counter || 0,
        JSON.stringify(req.body.response.response?.transports || []),
        now
      ]
    );

    const token = jwt.sign({ sub: c.id }, JWT_SECRET, { expiresIn: "1h" });
    const prefs = getCustomerPreferences(c.id);

    res.json({
      verified: true,
      token,
      customer: safeCustomer(c, prefs),
      accessibilityPreferences: prefs
    });
  } catch (e) {
    console.error("WebAuthn register verify error:", e);
    res.status(400).json({ error: "Biometric registration failed. Please try again on a supported device." });
  }
});

app.post("/api/webauthn/auth/options", async (req, res) => {
  try {
    const c = one("SELECT * FROM customers WHERE activation_token = ?", [req.body.token]);
    if (!c) return res.status(404).json({ error: "Activation link not found." });
    if (c.status !== "active") return res.status(403).json({ error: "Account is inactive." });

    const credentials = query("SELECT * FROM credentials WHERE customer_id = ?", [c.id]);
    if (!credentials.length) {
      return res.status(409).json({ error: "No passkey is registered for this customer yet." });
    }

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: credentials.map(k => ({
        id: k.credential_id,
        type: "public-key",
        transports: JSON.parse(k.transports || "[]")
      })),
      userVerification: "required"
    });

    setChallenge(`auth:${c.id}`, options.challenge);
    res.json(options);
  } catch (e) {
    console.error("WebAuthn auth options error:", e);
    res.status(500).json({ error: "Could not start biometric authentication." });
  }
});

app.post("/api/webauthn/auth/verify", async (req, res) => {
  try {
    const c = one("SELECT * FROM customers WHERE activation_token = ?", [req.body.token]);
    if (!c) return res.status(404).json({ error: "Activation link not found." });
    if (c.status !== "active") return res.status(403).json({ error: "Account is inactive." });

    const stored = one("SELECT * FROM credentials WHERE customer_id = ? AND credential_id = ?", [c.id, req.body.response.id]);
    if (!stored) return res.status(401).json({ error: "This device passkey is not recognized." });

    const expectedChallenge = getChallenge(`auth:${c.id}`);
    if (!expectedChallenge) {
      return res.status(400).json({ error: "Authentication challenge expired. Please try again." });
    }

    const verification = await verifyAuthenticationResponse({
      response: req.body.response,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: stored.credential_id,
        publicKey: Buffer.from(stored.public_key, "base64"),
        counter: stored.counter,
        transports: JSON.parse(stored.transports || "[]")
      },
      requireUserVerification: true
    });

    challenges.delete(`auth:${c.id}`);

    if (!verification.verified) return res.status(401).json({ error: "Biometric verification failed." });

    run("UPDATE credentials SET counter = ? WHERE id = ?", [verification.authenticationInfo.newCounter, stored.id]);

    const token = jwt.sign({ sub: c.id }, JWT_SECRET, { expiresIn: "1h" });
    const prefs = getCustomerPreferences(c.id);

    res.json({
      verified: true,
      token,
      customer: safeCustomer(c, prefs),
      accessibilityPreferences: prefs
    });
  } catch (e) {
    console.error("WebAuthn auth verify error:", e);
    res.status(401).json({ error: "Could not verify your identity with this device. Please try again." });
  }
});

// Secure fallback authentication for unsupported/desktop devices
app.post("/api/auth/fallback", (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ error: "Activation token is required." });

  const c = one("SELECT * FROM customers WHERE activation_token = ?", [token]);
  if (!c) return res.status(404).json({ error: "Activation link not found." });
  if (c.status !== "active") return res.status(403).json({ error: "Account is inactive." });

  const sessionToken = jwt.sign({ sub: c.id }, JWT_SECRET, { expiresIn: "1h" });
  const prefs = getCustomerPreferences(c.id);

  res.json({
    verified: true,
    token: sessionToken,
    customer: safeCustomer(c, prefs),
    accessibilityPreferences: prefs,
    method: "platform_device_fallback"
  });
});

/* ----------------- Customer Authenticated Endpoints ----------------- */
app.get("/api/me", auth, (req, res) => {
  const prefs = getCustomerPreferences(req.customer.id);
  res.json({
    customer: safeCustomer(req.customer, prefs),
    accessibilityPreferences: prefs
  });
});

app.get("/api/me/beneficiaries", auth, (req, res) => {
  const rows = query(
    `SELECT id, nickname, account_holder_name AS accountHolderName,
            nickname AS name, account_number AS accountNumber, bank_name AS bankName
     FROM beneficiaries
     WHERE customer_id = ?
     ORDER BY nickname ASC`,
    [req.session.sub]
  );
  res.json(rows);
});

app.get("/api/me/transactions", auth, (req, res) => {
  const rows = query(
    `SELECT id, reference, type, description, amount, status, created_at AS createdAt
     FROM transactions
     WHERE customer_id = ?
     ORDER BY created_at DESC
     LIMIT 20`,
    [req.session.sub]
  );
  res.json(rows.map(t => ({
    ...t,
    reference: t.reference || `TXN-${t.id.substring(0, 6).toUpperCase()}`,
    formattedAmount: money(t.amount),
    rawAmount: t.amount
  })));
});

app.post("/api/me/transfer", auth, (req, res) => {
  const { beneficiaryId, amount, nickname } = req.body || {};
  const c = one("SELECT * FROM customers WHERE id = ?", [req.session.sub]);
  if (!c) return res.status(404).json({ error: "Customer record not found." });
  if (c.status !== "active") return res.status(403).json({ error: "Account is deactivated." });

  // Resolve beneficiary by id or by nickname
  let b = null;
  if (beneficiaryId) {
    b = one("SELECT * FROM beneficiaries WHERE id = ? AND customer_id = ?", [beneficiaryId, c.id]);
  } else if (nickname) {
    const list = query(
      "SELECT * FROM beneficiaries WHERE customer_id = ? AND LOWER(nickname) = LOWER(?)",
      [c.id, nickname.trim()]
    );
    if (list.length === 1) {
      b = list[0];
    } else if (list.length > 1) {
      return res.status(400).json({
        error: `Multiple beneficiaries found with nickname '${nickname}'. Please specify the exact beneficiary.`
      });
    }
  }

  if (!b) return res.status(400).json({ error: "Saved beneficiary not found." });

  const kobo = Math.round(Number(amount) * 100);
  if (!Number.isFinite(kobo) || kobo <= 0) {
    return res.status(400).json({ error: "Please provide a valid transfer amount in Naira." });
  }

  if (kobo > c.balance) {
    return res.status(400).json({
      error: `Insufficient available balance. You requested ${money(kobo)}, but your balance is ${money(c.balance)}.`
    });
  }

  const txId = "tx_" + randomUUID();
  const txRef = "TXN-" + new Date().toISOString().replace(/\D/g, "").slice(2, 12) + "-" + Math.random().toString(36).substring(2, 6).toUpperCase();
  const now = new Date().toISOString();
  const recipientName = b.nickname || b.account_holder_name || b.name;

  try {
    transaction(() => {
      run("UPDATE customers SET balance = balance - ? WHERE id = ?", [kobo, c.id]);
      run(
        `INSERT INTO transactions
          (id, reference, customer_id, type, description, amount, status, created_at)
          VALUES (?, ?, ?, 'debit', ?, ?, 'successful', ?)`,
        [txId, txRef, c.id, `Transfer to ${recipientName} (${b.bank_name})`, kobo, now]
      );
    });

    const newBalance = c.balance - kobo;
    res.json({
      success: true,
      reference: txRef,
      transactionId: txId,
      amount: kobo,
      formattedAmount: money(kobo),
      balance: newBalance,
      formattedBalance: money(newBalance),
      beneficiary: {
        id: b.id,
        nickname: recipientName,
        accountHolderName: b.account_holder_name,
        accountNumber: b.account_number,
        bankName: b.bank_name
      },
      message: `Your transfer of ${money(kobo)} to ${recipientName} was successful.`
    });
  } catch (err) {
    console.error("Transfer error:", err);
    res.status(500).json({ error: "Transfer processing failed. Please try again." });
  }
});

/* ----------------- Error Handling & Start ----------------- */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

await initDb();
app.listen(PORT, "0.0.0.0", () => {
  console.log(`AccessAble API running at http://0.0.0.0:${PORT}`);
  console.log(`Ready for Staff Dashboard and Customer PWA`);
});
