# TRADERSPRO254 — Firebase, M-Pesa & PayPal Edition

A modern, responsive remake of TRADERSPRO254 powered by **Firebase** (Authentication + Cloud Firestore), **React + Tailwind CSS** (with Light & Dark theme toggle), **Deriv WebSocket live data**, **M-Pesa Daraja STK Push** for Kenyan users, and **PayPal Checkout** for international users — ready for **GitHub** and **Vercel**.

---

## 1. Quick Start (Local Development)

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:3000`.

---

## 2. Deploying to GitHub & Vercel

1. Push this folder to a new GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial TRADERSPRO254 Firebase + Vercel build"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/traderspro254.git
   git push -u origin main
   ```
2. Import the repository in **Vercel** (`https://vercel.com/new`).
   - Framework Preset: **Vite**
   - Build Command: `npm run build`
   - Output Directory: `dist`
3. Add the environment variables below in **Vercel Project Settings -> Environment Variables**.
4. In **Firebase Console -> Authentication -> Settings -> Authorized domains**, add your Vercel domain (e.g. `your-app.vercel.app`) so Google Sign-In works in production.

---

## 3. Payment API Configuration

### M-Pesa Daraja API (Kenyan Users)
Configure these variables in `.env` (or Vercel Environment Variables):
- `MPESA_ENV`: `sandbox` (for testing) or `production` (for live paybill/till)
- `MPESA_CONSUMER_KEY`: Your Safaricom Daraja Consumer Key
- `MPESA_CONSUMER_SECRET`: Your Safaricom Daraja Consumer Secret
- `MPESA_SHORTCODE`: Paybill or Till shortcode (Sandbox default: `174379`)
- `MPESA_PASSKEY`: Lipa Na M-Pesa Online Passkey
- `MPESA_CALLBACK_URL`: `https://your-app.vercel.app/api/mpesa/callback`

### PayPal REST API (International Users)
- `PAYPAL_ENV`: `sandbox` or `live`
- `PAYPAL_CLIENT_ID`: PayPal REST App Client ID
- `PAYPAL_CLIENT_SECRET`: PayPal REST App Secret
- `VITE_PAYPAL_CLIENT_ID`: Same PayPal Client ID (optional for client SDK)

---

## 4. Firebase Security Rules
The `firestore.rules` file enforces owner-isolated PII, admin-only signal publishing, and strict field validation. Review and deploy updates with:
```bash
firebase deploy --only firestore:rules
```
