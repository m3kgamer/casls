# Smart Calorie Tracker

Calorie tracker built with plain HTML, CSS and vanilla JavaScript (ES modules), backed by Supabase (Postgres, Auth, Row Level Security, pg_cron). Arabic (RTL), French and English.

- No frameworks, no build step, no AI. Food recognition is deterministic JS: text normalisation, synonym dictionary, spelling correction, matched only against **your** saved foods.
- Barcodes are looked up **only** in your Supabase `foods` table. The scanner library only reads the number from the camera image.
- Only consumption history (`food_logs`) expires, 7 days after `consumed_at`. Saved foods are never auto-deleted, and deleting a log never touches a food.

## Setup

### 1. Create the Supabase project (you)
1. https://supabase.com/dashboard → **New project** (any region).
2. **SQL Editor** → run, in order:
   1. `supabase/migrations/001_schema.sql` (tables, constraints, triggers, RLS)
   2. `supabase/migrations/002_cron_cleanup.sql` (server-side 7-day cleanup, every 30 min, via pg_cron)
3. **Project Settings → API**: copy the **Project URL** and the **publishable / anon key**. Never use or expose the `service_role` / secret key.
4. **Authentication → Providers → Email** is enabled by default. For instant sign-up, turn off "Confirm email"; otherwise new users must confirm by email first.
5. **Authentication → URL Configuration**: add the URL you deploy to (and `http://localhost:5173` for local use) to Site URL / Redirect URLs.

### 2. Configure the app
Edit `js/config.js`:
```js
export const SUPABASE_URL = 'https://xxxx.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_... or anon key';
```
(`.env.example` documents the same two values; there is no build step, so the file is edited directly.)

### 3. Run locally
**Windows (no install needed):** double-click `start.bat` — it serves the app at http://localhost:5173 and opens the browser. Do **not** open `index.html` directly: browsers block ES modules on `file://` (the page just shows a spinner).

ES modules and the camera need `http://localhost` or HTTPS. Alternatively, with Node:
```bash
npx serve -l 5173 .
```
Open http://localhost:5173, create an account. On first login the 220+ starter foods (fruits, vegetables, dairy and cheeses, meat, poultry, fish, grains, legumes, nuts, sweets, drinks, Algerian dishes; Arabic/French/English names and Darija synonyms) are copied into **your** `foods` table; edit or delete them freely.

### 4. Deploy
Upload the folder as-is to any static host with HTTPS (Netlify, Vercel static, Cloudflare Pages, GitHub Pages). The camera scanner requires HTTPS.

## Project layout
```
index.html            app shell (hash router: #/ #/foods #/history #/settings)
css/styles.css
js/config.js          Supabase URL + publishable key
js/api.js             all Supabase reads/writes
js/nutrition.js       calculation engine (single source of truth)
js/text.js            Arabic/French normalisation, stemming, Levenshtein
js/matcher.js         ranking: exact > saved synonym > dictionary > partial > spelling
js/parser.js          quantities, units, fractions, multi-food sentences
js/data/starter-foods.js   starter foods + built-in synonym dictionary (extend here)
js/addfood.js         Add Food modal (type / search / barcode)
js/foodform.js, scanner.js, starter.js, views/*
supabase/migrations/  SQL
tests/core.test.mjs   logic tests (node tests/core.test.mjs, or open tests/index.html over a local server)
tests/ui.html         UI harness using an in-memory mock API (no Supabase needed)
```

## How it works
- **Nutrition**: values are stored per `reference_quantity` `reference_unit` (100 g, 100 ml, 1 piece, 1 serving). `consumed = value × amount / reference_quantity`. Pieces ↔ g/ml use the food's `serving_size`; g ↔ ml is never assumed (an explicit error is shown). Logs store a **snapshot** of the totals, so history is unaffected by later food edits/deletions (`food_id` is `ON DELETE SET NULL`).
- **Expiry**: `expires_at = consumed_at + 7 days` (trigger-enforced). pg_cron runs `cleanup_expired_food_logs()` every 30 minutes; the app also deletes its own expired logs on load. The function only deletes from `food_logs`.
- **Security**: RLS on all three tables (`auth.uid() = user_id`), anon role has no grants, and a log can only reference a food owned by the same user. Duplicate barcodes are blocked per user by a unique partial index.
- **Extending the dictionary**: add synonyms to a food in `starter-foods.js` (or `EXTRA` in `js/matcher.js` for misspellings). Users can also add synonyms to their own foods in the Foods page.

## Manual steps / credentials summary
| What | Where |
|---|---|
| Supabase project URL + publishable key | `js/config.js` |
| Run both SQL migrations | Supabase SQL Editor |
| Enable pg_cron (done by migration 002; if it errors, enable in Database → Extensions) | Supabase dashboard |
| Email confirmation on/off, redirect URLs | Supabase Auth settings |
| HTTPS hosting (for camera) | your host |

## Known limits
- Starter nutrition values are approximate averages; check them against your own sources.
- Spelling correction covers typos and common variants; a food you have never saved is reported as "not found" and never invented.
- Flash/torch works only on browsers/cameras that expose it (mostly Android Chrome).
