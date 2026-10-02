# Deploying EcoAI

EcoAI can be hosted in two ways. Both work on free plans.

| | **A. Vercel + Render** (recommended) | **B. One Render service** |
|---|---|---|
| Website | Vercel (global CDN) | Render |
| API | Render | Render (same service) |
| When the free server is asleep | The site opens instantly; data loads once the API wakes (about a minute) | The whole site waits about a minute |
| Setup | Two services | One service |

What you need either way:
- a GitHub repository with this project;
- a free **MongoDB Atlas** database;
- for email, a free **Brevo** account (Render's free plan blocks Gmail SMTP).

---

## 0. Before you push to GitHub

`server/.env` is git-ignored, but an **old commit contains `backend/.env`** with a Gmail app password, and your Gemini and Vision keys (those two keys are no longer valid).

- **Revoke that Gmail app password** at <https://myaccount.google.com/apppasswords> before publishing the repo.
- The old Gemini and Vision keys no longer work. EcoAI now uses OpenAI (step 6), so you don't need new Google AI keys.
- Either push to a **private** repository, or remove the file from the history first (for example with `git filter-repo --path backend/.env --invert-paths`).

---

## 1. MongoDB Atlas (both options)

1. Create a free **M0** cluster at <https://cloud.mongodb.com>.
2. **Database Access:** add a database user with a password.
3. **Network Access:** add `0.0.0.0/0` (Render's free plan has no fixed IP address).
4. **Connect → Drivers:** copy the connection string, then add the database name before the `?`:
   `mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/ecoai?retryWrites=true&w=majority`

Uploaded photos are stored in this database by default. The free 512 MB holds a few thousand photos. For more space, and faster images from a CDN, add a free Cloudinary account and set `CLOUDINARY_URL` (step 2).

---

## Option A: Website on Vercel, API on Render

### 2. API on Render

1. <https://dashboard.render.com> → **New → Blueprint**, pick your repository. Render reads [`render.yaml`](render.yaml) and creates the `ecoai-api` service. It generates `JWT_SECRET` for you.
2. Fill in the values it asks for:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | the Atlas string from step 1 |
   | `PUBLIC_URL` | your Vercel URL. You get it in step 3; for now enter `https://example.com` and change it later |
   | `GOOGLE_CLIENT_ID` | your OAuth client ID (step 4) |
   | `OPENAI_API_KEY` | your OpenAI key (step 6) |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your first admin account (step 7) |
   | `BREVO_API_KEY`, `MAIL_FROM` | from step 5 |
   | `AUTHORITY_EMAIL` | who receives dumping reports that pass the AI photo check |
   | `CLOUDINARY_URL` | optional: `cloudinary://KEY:SECRET@CLOUD_NAME` |

   Leave any you don't have yet empty.
3. When the deploy finishes, open `https://<your-service>.onrender.com/api/health`. It should say `"ok":true`.

<details><summary>Prefer to set it up by hand instead of the Blueprint?</summary>

**New → Web Service**, with these settings:
- **Root Directory:** `server`
- **Build Command:** `npm ci --omit=dev`
- **Start Command:** `node src/index.js`
- **Health Check Path:** `/api/health`

Add the variables above, plus:
- `NODE_ENV=production`
- `SERVE_FRONTEND=false`
- `JWT_SECRET`: at least 32 random characters. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
</details>

### 3. Website on Vercel

1. <https://vercel.com/new> → import your repository.
2. **Root Directory:** `frontend`. Vercel detects Vite; [`frontend/vercel.json`](frontend/vercel.json) sets up page routing, caching and security headers.
3. **Environment Variables:** `VITE_API_URL` = your Render URL, for example `https://ecoai-api.onrender.com` (no trailing slash).
4. Deploy, then copy the site URL (for example `https://ecoai.vercel.app`).
5. Back on Render, set **`PUBLIC_URL`** to that URL and save; Render redeploys. The API accepts requests from `PUBLIC_URL`. To also allow Vercel preview deployments, set `CORS_ORIGINS=https://<project>-*.vercel.app`.

`VITE_API_URL` is baked in at build time. If the API address changes, redeploy the website.

---

## Option B: Everything on one Render service

**New → Web Service** with:
- **Root Directory:** *(leave empty)*
- **Build Command:** `npm ci --prefix server --omit=dev && npm ci --prefix frontend --include=dev && npm run build --prefix frontend`
  (`--include=dev` matters: with `NODE_ENV=production`, npm would otherwise skip Vite, the website's build tool.)
- **Start Command:** `node server/src/index.js`
- **Health Check Path:** `/api/health`

Environment variables:
- `NODE_ENV=production`
- `PUBLIC_URL=https://<your-service>.onrender.com`
- `JWT_SECRET`, `MONGODB_URI`, and the optional keys from the table in step 2.
- Do **not** set `SERVE_FRONTEND` or `VITE_API_URL`.

---

## 4. Google sign-in (both options)

In [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), open your OAuth client. Under **Authorized JavaScript origins**, add the website's URL:
- **Option A:** your Vercel URL.
- **Option B:** your `onrender.com` URL.
- Also add any custom domain.

No redirect URIs are needed. Changes can take a few minutes to apply.

## 5. Email with Brevo (both options)

1. Sign up at <https://www.brevo.com>. The free plan allows 300 emails a day.
2. **Senders:** add and verify the address emails should come from.
3. **SMTP & API → API keys:** create a key.
4. On Render, set `BREVO_API_KEY` to that key and `MAIL_FROM` to the verified address.

Brevo may send mail from a free address like Gmail through its own domain. For the best deliverability, verify a domain you own. For local development, Gmail SMTP (`EMAIL_HOST_USER` / `EMAIL_HOST_PASSWORD`) still works.

## 6. OpenAI (both options)

OpenAI runs GreenBot (the chatbot), the dumping-photo check and the food-photo check and autofill.

1. Create a key at <https://platform.openai.com/api-keys>. The API is pay-as-you-go, so add a little credit under **Billing**.
2. On Render, set `OPENAI_API_KEY`. Optional settings:
   - `OPENAI_MODEL` (default `gpt-6-luna`, OpenAI's low-cost model; any model that accepts images works);
   - `OPENAI_REASONING_EFFORT` (default `low`).
3. Check the Render logs after the deploy: they show `AI: OpenAI (gpt-6-luna)`, or a warning if the key was rejected.

With `gpt-6-luna`, a photo check or chat reply costs a small fraction of a US cent.

## 7. Create the admin and staff accounts

**Your first admin.** On Render, set `ADMIN_EMAIL` (your email) and `ADMIN_PASSWORD` (10+ characters), then deploy.
- On startup, the server creates that admin account if the email isn't registered yet.
- Sign in at `https://<your-website>/admin/login`, then **delete `ADMIN_PASSWORD`** from Render.
- The server never changes an existing account this way. If you already signed up with that email, use another email, or promote yourself with the command below.

**Staff (and more admins).** In the admin panel, go to **Users → Add staff or admin**. Enter their name and work email, and either:
- a temporary password, which they can change under Profile; or
- no password, if they'll sign in with Google using that email.

They sign in at `/staff-login`, or at `/admin/login` for admins. The page has an email form and a Google button.

**From your computer instead.** Run the commands pointed at the Atlas database, from the project root, in PowerShell:

```powershell
$env:MONGODB_URI="mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/ecoai"
npm run create-admin          # or: npm run create-staff
Remove-Item Env:MONGODB_URI   # back to your local database
```

**Optional demo data on the live site.** The seed refuses to put demo accounts on a hosted database with the public demo password, so give them a private one:

```powershell
$env:MONGODB_URI="mongodb+srv://..."; $env:SEED_PASSWORD="a-long-private-password"; npm run seed
```

## 8. Free-plan notes

- **Sleep:** Render's free service sleeps after 15 minutes without traffic. The first visit then takes about a minute, and the site shows a "Waking up the server" notice meanwhile. To keep it awake, have a free monitor such as [cron-job.org](https://cron-job.org) or [UptimeRobot](https://uptimerobot.com) request `https://<your-api>/api/health` every 10 minutes. One service running all month fits within Render's 750 free hours.
- **Reservation expiry:** expired food reservations are released by a background job, which runs only while the server is awake. It catches up on wake-up.
- **Redeploys:** open tabs recover automatically: they reload once to fetch the new version.

## Environment checklist

Where each setting goes for **Option A** (Vercel + Render). For Option B, put the Render ones on your single service, with `PUBLIC_URL` set to its own URL.

| Setting | Where | Needed? | Value |
|---|---|---|---|
| `VITE_API_URL` | Vercel | Yes | Render API URL, e.g. `https://ecoai-api.onrender.com` |
| `NODE_ENV` | Render | Yes | `production` (set by the Blueprint) |
| `SERVE_FRONTEND` | Render | Yes | `false` (set by the Blueprint) |
| `JWT_SECRET` | Render | Yes | 32+ random characters (generated by the Blueprint) |
| `MONGODB_URI` | Render | Yes | Atlas connection string |
| `PUBLIC_URL` | Render | Yes | Vercel website URL |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Render | First deploy | Your admin login; delete the password afterwards |
| `OPENAI_API_KEY` | Render | For AI | GreenBot and photo checks |
| `GOOGLE_CLIENT_ID` | Render | For Google sign-in | OAuth client ID |
| `BREVO_API_KEY`, `MAIL_FROM` | Render | For email | Approval, report and food-alert emails |
| `AUTHORITY_EMAIL` | Render | Optional | Receives dumping reports that pass the AI check |
| `NGO_EMAIL` | Render | Optional | Extra copy of fresh-food alerts |
| `CLOUDINARY_URL` | Render | Optional | Photos on a CDN instead of MongoDB |
| `CORS_ORIGINS` | Render | Optional | Extra allowed origins, e.g. Vercel previews |

For local development, put the same server settings in `server/.env`, without `NODE_ENV`, `SERVE_FRONTEND` or `VITE_API_URL`. Every setting is explained in [`server/.env.example`](server/.env.example) and [`frontend/.env.example`](frontend/.env.example).
