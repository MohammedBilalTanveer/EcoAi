# EcoAI 🌱

AI tools for cleaner streets and fuller plates:

- **Report illegal dumping.** You take a photo, and GPS from the photo pins the spot. An AI photo check decides:
  - **passed:** the report is emailed to the city authority;
  - **rejected:** not dumping, so the report is closed and the reporter is told why;
  - **needs review:** staff decide.

  Staff and admins see every decision with its reason, and can override it.
- **Food rescue marketplace.** Restaurants list surplus food *free for NGOs* or at 20–90% off. AI fills in the listing from a photo, and food-safety windows are enforced.
  - If the photo passes the AI check, nearby NGOs are alerted instantly; they reserve a quantity and collect it with a 6‑digit pickup code.
  - If the photo fails, the listing is held until staff approve it.
- **Live garbage trucks.** Trucks follow a daily timetable in India time (IST): morning rounds from 6:00 am, and afternoon rounds on the busy commercial routes. They drive real road routes, and you see:
  - each truck's progress, fill level and stop-by-stop schedule;
  - the path it has already covered;
  - "when is the truck coming to me?";
  - outside collection hours, when the next round starts.
- **GreenBot.** A multi-turn sustainability chatbot powered by OpenAI.
- **Staff portal.** Stats, charts, a filterable report table and map, status updates with notes, and food listing moderation.
- **Admin panel.** In one place, admins can:
  - approve or reject new restaurants and NGOs;
  - add staff and admins;
  - browse every user and their activity, and suspend or reactivate accounts;
  - see every report and food listing with its AI photo check.

The whole app runs on **one Node.js server** (Express + MongoDB) that serves both the API and the React frontend.

---

## Quick start

Requirements: **Node.js 22** and MongoDB (a local MongoDB service or an Atlas connection string).

There is **one backend: `server/`**. Run everything from the project root; you never start the frontend separately.

```bash
npm install          # installs server + frontend
npm run seed         # optional: demo accounts, listings and reports
npm run dev          # http://localhost:5000  (API + React with hot reload, one process)
```

Configuration lives in **`server/.env`** (copy `server/.env.example`). With no `MONGODB_URI`, development falls back to an embedded MongoDB stored in `server/.data/db`.

### Production

**Step-by-step hosting guide: [DEPLOY.md](DEPLOY.md).** It covers the website on Vercel with the API on Render, or everything on one Render service. [`render.yaml`](render.yaml) and [`frontend/vercel.json`](frontend/vercel.json) are included.

To try a production build locally:

```bash
npm run build        # builds frontend/dist
npm start            # NODE_ENV=production server serving API + built UI on PORT
```

In production the server:
- refuses to start without `MONGODB_URI` and a 32+ character `JWT_SECRET`;
- stores uploaded photos in MongoDB, or on Cloudinary if `CLOUDINARY_URL` is set, so they survive redeploys;
- sends email through Brevo, Resend or SMTP;
- rate-limits by the visitor's real IP;
- prints warnings at startup for missing settings.

### Demo accounts

`npm run seed` creates one account per role: `admin@`, `staff@`, `spicegarden@`, `chaatstreet@`, `annapurna@`, `hungerfree@` and `citizen@ecoai.example`. It also creates two applications waiting for approval: `greenbowl@` (restaurant) and `sevatrust@` (NGO). The shared password is `DEMO_PASSWORD` in [`server/scripts/seed.js`](server/scripts/seed.js). Re-running the seed only replaces the demo accounts' data. Demo listings have short pickup windows, so re-seed if they have expired.

### Admin and staff accounts

Admins and staff can't sign up on the website. There are three ways to create them:

1. **First admin on a hosted site:** set `ADMIN_EMAIL` and `ADMIN_PASSWORD` on the host. The admin is created on startup if that email isn't registered yet; remove the password afterwards. See [DEPLOY.md](DEPLOY.md#7-create-the-admin-and-staff-accounts).
2. **From the admin panel:** **Users → Add staff or admin**.
3. **From the command line**, in the project root. The command asks for the email, name and password (the password stays hidden as you type):

```bash
npm run create-admin
npm run create-staff
```

They sign in at **`/admin/login`** (admins) or **`/staff-login`** (staff or admins). You can also reach it from the **Staff & admin login** link in the site footer or at the bottom of the Sign in page.

Running either command for an email that already exists promotes that account (for example, making your citizen account an admin). Leave the password empty to keep the current one.

In bash you can also pass everything on one line: `npm run create-admin -- --email you@example.com --password "a-strong-password" --name "Your Name"`. This doesn't work in PowerShell, which drops the `--`, so use the prompts there.

---

## Sign-in: email/password + Google

| Situation | What happens |
|---|---|
| Log in with a registered email | Signed in |
| Log in with an unknown email | Redirected to **Sign up** with the email prefilled |
| "Sign in with Google" for a registered Google account or email | Signed in (Google is linked to the existing account) |
| "Sign in with Google" for an unregistered account | Redirected to **Sign up**, which finishes in one step using that Google account |
| "Sign up with Google" when already registered | Signed in, with a notice |

**Enabling Google sign-in:**
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials), then **Create credentials → OAuth client ID → Web application**.
2. Under **Authorized JavaScript origins**, add `http://localhost:5000` (and your production URL).
3. Put the Client ID in `server/.env` as `GOOGLE_CLIENT_ID=...` and restart. No client secret is needed; the server verifies Google ID tokens.

Accounts are stored in MongoDB (`users` collection), with bcrypt-hashed passwords and JWT sessions.

## Account types and approval

| Account | How it's created | Access |
|---|---|---|
| Citizen | Sign up (email or Google) | Immediately |
| Restaurant | Sign up (email or Google) | **After an admin approves it** |
| NGO | Sign up (email or Google) | **After an admin approves it** |
| Staff | `npm run create-staff` | Staff portal: reports and food moderation |
| Admin | `npm run create-admin` | Admin panel plus everything staff can do |

When a restaurant or NGO signs up, the account starts as **pending**. Admins get an in-app notification and an email, and the application appears under **Admin panel → Approvals**. Until it's approved, the partner can sign in but only sees an "awaiting approval" page, where they can edit their details. The API rejects every other request with `403 ACCOUNT_PENDING`, and pending NGOs don't receive food alerts. Approving, rejecting (with a reason) or suspending an account notifies the user in-app and by email, and they get access, or lose it, immediately.

## AI (OpenAI)

Set `OPENAI_API_KEY` in `server/.env` (key from <https://platform.openai.com/api-keys>). It powers:
- GreenBot;
- the dumping-photo check;
- the food-photo check and autofill.

The default model is `gpt-6-luna` (change it with `OPENAI_MODEL`). Photo checks use structured JSON output, so every decision comes with a reason people can read.

| Decision | Dumping report | Food listing |
|---|---|---|
| **Passed** | Sent to `AUTHORITY_EMAIL`; staff alerted | Published; nearby NGOs alerted |
| **Rejected** | Closed as rejected, with the reason | Held (not published) until staff approve |
| **Needs review** (AI unsure or unavailable) | Staff decide | Published; staff can remove it |

Staff and admins can override any decision, and the reporter or restaurant is notified.

If no AI key is set, or the key is rejected, the app keeps working: photos go to "needs review", and the server logs a warning at startup. Gemini (`GEMINI_API_KEY`) and Cloud Vision (`GOOGLE_CLOUD_VISION_API_KEY`) are still supported as fallbacks when there's no OpenAI key.

---

## Project layout

```
server/            Express 5 + Mongoose API (the only backend)
  src/routes/      auth, reports, food, trucks, chat, notifications, stats, staff, admin, geo
  src/services/    ai (Gemini + Vision), mailer, notify (nearby NGO alerts), food rules, truck simulation
  src/models/      User, Report, FoodListing, Claim, Notification
  src/data/        truck fleet + road-snapped routes (npm run build:routes)
  scripts/         seed, create-staff / create-admin, buildTruckRoutes
frontend/          React 19 + Vite + Tailwind
  src/pages/       Home, auth, reports, food, GarbageTrucks, ChatPage, Profile, staff, admin, AccountStatus
  src/components/  UI kit, map pieces, image capture, layout
```

## How food rescue works

1. A restaurant adds photos. AI suggests the title, category, veg/non-veg, quantity, allergens and a menu price.
2. It chooses **Donate free (NGOs only)** or **Sell at a discount**. The minimum discount is 20%, and 50% is suggested.
3. It sets the preparation time and storage. The pickup window must end within the safe window: room temperature 3h, refrigerated 24h, frozen 72h, packaged uses best-before.
4. On publishing, every NGO whose alert radius covers the pickup point gets an in-app notification and email. The original `NGO_EMAIL` alert still fires for AI-verified fresh food.
5. NGOs (or citizens, for discounted food) reserve a quantity and get a pickup code. The restaurant enters the code at handover. Unclaimed reservations expire automatically.
6. Dashboards show meals rescued, kg saved, CO₂ avoided, money recovered and money saved.

Photos that AI doesn't recognise as food are held for staff review before NGOs are alerted.
