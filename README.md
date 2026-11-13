# AccessAble Banking — Voice-first PWA prototype

A refreshed prototype with a professional bank dashboard, NFC activation links, a voice-first customer PWA, passkey/biometric authentication, and simulated banking operations.

## Apps
- `server/` — Express API + SQLite database powered by `sql.js` (no native C++ build toolchain required).
- `dashboard/` — React + Vite bank staff dashboard.
- `customer-pwa/` — React + Vite installable customer PWA.

## Requirements
- Node.js 20.19+ or 22.12+ (Node 24 is suitable).
- Chrome/Chromium recommended for speech recognition.
- HTTPS for phone-based passkeys, microphone access and PWA installation. `localhost` is treated as a secure context for PC development.

## Install
Open three PowerShell windows.

### 1. API
```powershell
cd server
Copy-Item .env.example .env
npm install
npm run dev
```
API: `http://localhost:4000`

### 2. Dashboard
```powershell
cd dashboard
Copy-Item .env.example .env
npm install
npm run dev
```
Dashboard: `http://localhost:5173`

### 3. Customer PWA
```powershell
cd customer-pwa
Copy-Item .env.example .env
npm install
npm run dev -- --port 5174
```
PWA: `http://localhost:5174`

The API seeds two demo customers:
- Emeka Nwosu — `AB-1002`
- John Okafor — `AB-1001`

No PIN is used. On first activation, the customer registers a passkey on their phone. On later visits, the phone requests passkey authentication. A platform authenticator is preferred and user verification is required.

## Important biometric limitation
WebAuthn/passkeys use the phone's built-in authenticator. Depending on device/browser configuration, Android may verify using fingerprint, face, or device screen lock. A web app cannot reliably demand fingerprint specifically or receive fingerprint data. The server receives and verifies cryptographic proof, never the biometric itself.

## NFC
The dashboard creates a unique activation URL. Write that URL to an NTAG215 as an NDEF URL record using an NFC writing app. Keep tags rewritable during development. The tag stores only an opaque activation token, not account details or credentials.

## Voice interaction
After successful authentication, the customer PWA starts a spoken welcome and attempts to activate speech recognition. The user may say:
- "Check my balance"
- "I want to transfer money to Mama"
- "Send five thousand naira to Mama"
- "Show my recent transactions"
- "Help"

The dialogue manager asks for missing details, checks saved beneficiaries, reads back transfer details, and only submits the simulated transfer after verbal confirmation. The initial implementation uses deterministic intent parsing, not an external AI model. This makes financial actions predictable. An NLP model can be added later for richer phrasing, while keeping transaction execution rule-based.

Speech recognition support and autoplay policies vary. Chrome may ask for microphone permission and may require the user to tap the microphone control to start listening. The visible controls remain accessible as a fallback.

## LAN / phone testing
For a basic LAN test, use the computer's Wi-Fi IPv4 address instead of `localhost`, bind Vite to `0.0.0.0`, and update the `.env` URLs in all three apps. For passkeys, microphone access and installability on a phone, deploy behind HTTPS (or use a trusted HTTPS development tunnel). Plain LAN HTTP is not sufficient.

## Prototype safety
- All balances and transfers are simulated.
- Do not connect this prototype to a real bank.
- Do not put real customer data or real biometric data in the demo.
- The dashboard has demo-only staff access and must not be exposed publicly.
- WebAuthn challenges are held in memory for this prototype; use a persistent, distributed challenge store and hardened session/device lifecycle before production.
