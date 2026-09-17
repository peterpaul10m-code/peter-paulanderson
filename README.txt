AI INTERVIEW GYM — MICRO1 / ZARA PACK — PRODUCT V1 HARDENED GUIDE GATE

WHAT THIS IS
AI Interview Gym is the parent brand. This first product pack is intentionally specific to Micro1 Generalist preparation and Zara-style automated interviews. It is an independent preparation product and is not affiliated with or endorsed by Micro1.

FILES
- index.html — conversion landing page + complete 29-question Micro1/Zara practice gym
- prep-guide.html — Micro1/Zara lead magnet served only through the protected /api/guide route after confirmed signup
- server.js — server-side lead capture, signed guide access, protected lead export, and static server
- package.json — zero-dependency Node build/start commands
- data/leads.csv — created automatically on first run (not publicly served)

RUN LOCALLY
1. Install Node.js 18 or later.
2. Open a terminal in this folder.
3. Run: npm run build
4. Run: npm start
5. Open: http://localhost:3000

LEAD CAPTURE + GUIDE GATE
The form posts to POST /api/leads. A success state is shown only after the server confirms that the email was validated and either newly stored or already present in the lead store. On success, the server issues a 30-minute HMAC-signed guide URL at /api/guide?token=.... The static /prep-guide.html URL is intentionally blocked, and invalid, missing, expired, or tampered guide tokens are rejected. Duplicate signups are idempotent and receive a fresh access token. Honeypot submissions receive no guide token. The form also includes lightweight in-memory rate limiting, normalized email storage, duplicate suppression, and spreadsheet-formula/CSV-injection neutralization for stored/exported user-controlled cells. If the endpoint or guide-token service is unavailable, the page shows an error and does NOT unlock the guide.

PRODUCTION DEPLOYMENT
Use a host that runs a persistent Node process and provides persistent disk/storage. Set GUIDE_ACCESS_SECRET to a long random secret used only to sign guide-access tokens. Set PORT if your host requires it. Mount/persist the data directory so leads survive restarts/redeployments. If your host has ephemeral storage, replace appendLead() with a database or email-platform integration before launch.

OPTIONAL LEAD EXPORT
Set LEAD_EXPORT_TOKEN to a strong secret separate from GUIDE_ACCESS_SECRET. Then request GET /api/leads/export with header: Authorization: Bearer <token>. If the variable is absent, the export route is disabled.

VOICE FEATURES
- Microphone readiness test in Delivery Mechanics
- Browser recording + playback in Mastery mode
- Live transcription where Web Speech Recognition is supported
- 8-second minimum for a recorded attempt to count as spoken evidence
- Spoken evidence gates Comfortable/Mastered ratings

BROWSER NOTES
Microphone recording requires HTTPS in production (or localhost during development) and browser permission. Live transcription support varies by browser.
