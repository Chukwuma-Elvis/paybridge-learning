# Deploying PayBridge Frontend to Vercel (Connected to Render)

This guide walks you through deploying the **PayBridge frontend** to **Vercel** and connecting it to your **Spring Boot backend** on **Render**.

---

## 🏗️ Pre-configured Files Already in Place

Your `paybridge front end` directory is already 100% prepared for Vercel:

1. **[`vercel.json`](./vercel.json)**:
   - Configures edge rewrites so that `/api/*` and `/actuator/*` are proxied to `https://paybridge-zkvm.onrender.com`.
   - Prevents CORS issues by maintaining same-origin requests in production.
   - Configures Single Page Application (SPA) routing fallback to `/index.html`.
2. **[`.env.production`](./.env.production)**:
   - Defines `VITE_API_BASE_URL=https://paybridge-zkvm.onrender.com`.
3. **[In-App Backend Switcher & Wakeup Button](./src/components/BackendSettingsModal.jsx)**:
   - Built directly into the frontend header (click the **"Connected"** / **"Backend Offline"** pill).
   - Allows testing connectivity, latency, waking sleeping Render instances, or switching the backend URL at runtime without redeploying.

---

## 🚀 Option 1: Deploy via Vercel Web Dashboard (Recommended)

Since your project is in a GitHub repository (`Chukwuma-Elvis/paybridge-learning`), this is the easiest method with automatic continuous deployment on every `git push`.

### Step 1: Commit and Push your Changes
From the root of your project:
```bash
git add .
git commit -m "Add PayBridge frontend and CORS configuration"
git push origin main
```

### Step 2: Import into Vercel
1. Go to **[vercel.com/new](https://vercel.com/new)** and log in with GitHub.
2. Under **"Import Git Repository"**, find and select `paybridge-learning`.
3. In the **Project Configuration** screen:
   * **Project Name**: `paybridge-portal` (or any name you prefer)
   * **Framework Preset**: `Vite`
   * **Root Directory**: Click **Edit** and select **`paybridge front end`** (⚠️ **Crucial step**).
   * **Build Command**: `npm run build`
   * **Output Directory**: `dist`
   * **Install Command**: `npm install`
4. Under **Environment Variables**, add:
   * **Key**: `VITE_API_BASE_URL`
   * **Value**: `https://paybridge-zkvm.onrender.com` (or your actual Render backend URL)
5. Click **Deploy**.

Vercel will build and assign you a live HTTPS URL (e.g. `https://paybridge-portal.vercel.app`).

---

## 💻 Option 2: Deploy directly via Vercel CLI

If you prefer deploying directly from your terminal:

1. Open your terminal in the frontend directory:
   ```bash
   cd "c:\Users\CHUKWUMA\projects\paybridge\paybridge(learning copy)\paybridge front end"
   ```
2. Run Vercel CLI using `npx`:
   ```bash
   npx vercel
   ```
   * Authenticate in your browser if prompted.
   * `Set up and deploy?`: `y`
   * `Which scope?`: Choose your account.
   * `Link to existing project?`: `n`
   * `What’s your project’s name?`: `paybridge-frontend`
   * `In which directory is your code located?`: `./`
   * `Want to modify settings?`: `n`
3. Deploy to production:
   ```bash
   npx vercel --prod
   ```

---

## ⚠️ Important Details About Render Free Tier

1. **Instance Sleeping:**
   * Render free tier services spin down after ~15 minutes of inactivity.
   * When opening your deployed Vercel site after a break, the first request will wake Render up (taking ~30–60 seconds).
   * **Solution:** Click the **Backend Status Pill** in the top-right corner of the app $\rightarrow$ click **"Wake Up Render Backend (Send Liveness Ping)"**. The UI will pulse and wait until Render reports `{"status":"UP"}`.

2. **Dispatcher & Reconciler Workers:**
   * External transfers rely on internal Spring Boot background scheduled jobs (`dispatcher` every 2s, `reconciler` every 5s).
   * While the Render instance is awake, external transfers will progress through outbox dispatching and reconciliation automatically.

3. **CORS:**
   * The backend's `CorsConfig.java` allows all origins (`/**`), and `vercel.json` provides edge rewrites to ensure zero cross-origin issues.
