# CLAUDE.md — Project Context for AI Assistants

## Project Overview
**Savitry Greens Tower 15 — Resident Management PWA**
A zero-cost society maintenance management app for a residential tower.
- GitHub Pages URL: https://knowwvana.github.io/SavitryGreen.T15.Residents/
- Owner/Developer: Atul Gupta

---

## Tech Stack
| Layer | Technology | Notes |
|-------|-----------|-------|
| Static Site Generator | Hugo | Custom layouts, no theme. `publishDir = "docs"` |
| Frontend Framework | Alpine.js | Reactive state management, all logic in `assets/js/app.js` |
| UI Framework | Bootstrap 5 + Bootstrap Icons | Mobile-first design |
| Backend/API | Google Apps Script | Serverless, deployed as web app |
| Database | Google Sheets | Free, accessible via Apps Script |
| Hosting | GitHub Pages | Served from `docs/` folder |
| Cost | $0 | Entirely free stack |

---

## Directory Structure
```
├── assets/js/app.js          # Main Alpine.js application (all frontend logic)
├── content/                   # Hugo content (minimal)
├── docs/                      # Hugo build output (served by GitHub Pages)
├── googleappsscript/
│   ├── code.gs                # Google Apps Script backend (deploy to script.google.com)
│   └── Tower15-Savitry Greens.xlsx  # Sheet backup (GITIGNORED, never push)
├── layouts/
│   ├── index.html             # Main entry point with Alpine.js x-data
│   └── partials/mobile/
│       ├── header.html        # Sticky header (society name, back button, admin/logout)
│       ├── loader.html        # Loading overlay
│       ├── dashboard.html     # Dashboard with stats cards
│       ├── login.html         # Resident login (flat dropdown + mobile)
│       ├── add-resident.html  # New resident registration form
│       ├── myflat.html        # Logged-in user's flat detail + payment history
│       ├── residents-list.html # All residents list with search
│       ├── resident-detail.html # Individual resident detail + payments
│       ├── add-entry.html     # Payment entry form
│       ├── validate.html      # Admin portal (approve payments, expenses, residents)
│       ├── maintenance-report.html # Monthly/defaulter reports
│       ├── bottom-nav.html    # Bottom navigation bar
│       └── footer.html        # Fixed footer
├── hugo.toml                  # Hugo config with API_URL param
└── .gitignore                 # Excludes xlsx, node_modules, OS files
```

---

## Google Sheets Structure
| Sheet | Columns | Notes |
|-------|---------|-------|
| **Flats** | FlatNo, Due | Static — flats are pre-added, never changed via app |
| **Residents** | ResidentId, FlatNo, Name, Email, Phone, ResidentType, IsActive | `IsActive`: true (active), "Pending" (awaiting admin), "Rejected" |
| **Payments** | PaymentID, FlatNo, Category, Title, Month, Amount, PaymentDate, PaymentMethod, Status, ValidatedBy, ValidationTime, Remarks, ValidationComments, EntryAddedDate | Status: Paid, Pending Validation |
| **Admins** | AdminUserName, AdminPassword | **NEVER sent to client** — server-side auth only |
| **Expenditure** | ExpenseID, Title, Type, Amount, Date, Remarks | Type: Monthly, Adhoc |
| **Settings** | Key (Col A), Value (Col B) | SocietyName, SocietyAddress, MonthlyMaintainenceAmount, MonthlyMaintainenceStartFrom, GPayAccount |

---

## API Endpoints (Google Apps Script)

### GET
| Endpoint | Response |
|----------|----------|
| `?action=getData` | All data from Flats, Residents, Payments, Expenditure, Settings + `flatList` array. **Admins sheet is excluded.** |

### POST Actions
| `action` value | Purpose | Key Fields |
|----------------|---------|------------|
| _(default/none)_ | Add new payment | PaymentID, FlatNo, Category, Title, Month, Amount, PaymentDate, PaymentMethod, Status |
| `UPDATE` | Update payment status | PaymentID, Status, ValidatedBy, ValidationTime, ValidationComments |
| `ADD_EXPENSE` | Add expense | Title, Type, Amount, Date, Remarks |
| `ADMIN_LOGIN` | Server-side admin authentication | username, password → returns `{ success, adminName }` |
| `ADD_RESIDENT` | Resident self-registration | FlatNo, Name, Email, Phone, ResidentType → sets IsActive="Pending". Duplicate check on FlatNo+Phone |
| `UPDATE_RESIDENT` | Admin approve/reject resident | ResidentId, IsActive ("Active"→true, "Rejected") |

### API URL
Configured in `hugo.toml` under `[params].API_URL`:
```
https://script.google.com/macros/s/AKfycbzXyLszM8IT3c0ZSWZs0hO0mHV8tn3rIKyWmqzWC6oEVtq20GwHRM7Ivu5ZepOgWzC0CQ/exec
```

---

## Frontend Architecture (`assets/js/app.js`)

### Domain Classes (inside `AppServices` IIFE)
- **`Payment`** — Payment record with getters: `monthKey`, `isPaidStrict`, `isPaidOrPendingValidation`, `isMonthly`
- **`Expense`** — Expense record with parsed date
- **`Resident`** — Flat + occupants + payment history. `getPendingMonthsList()` computes unpaid months
- **`Settings`** — Parses settings key-value pairs
- **`SocietyRepository`** — Data layer: fetchData, addPayment, updatePaymentStatus, addExpense, adminLogin, addResident, updateResidentStatus
- **`normalizeFlat()`** — Strips leading zeros from flat numbers

### Alpine.js App State (`window.societyApp`)
| State | Purpose |
|-------|---------|
| `user` | `{ isLoggedIn, flatNo, phone, name }` — Resident session (localStorage key: `sg_user`) |
| `userLogin` | `{ flatNo, phone, error, isLoading }` — Login form state |
| `registerForm` | `{ flatNo, name, email, phone, residentType, error, success, isSubmitting }` — Registration form |
| `admin` | `{ isLoggedIn, currentUser, username, password, error, tab }` — Admin session (localStorage key: `sg_admin`) |
| `view` | Current view: `login`, `register`, `home`, `myflat`, `residents`, `history`, `add`, `validate`, `report` |

### Key Computed Properties / Methods
- `availableFlatsForLogin` — All flats from flatList
- `availableFlatsForRegister` — Flats without active/pending residents
- `myFlatResident` — Resident object for logged-in user's flat
- `pendingResidentsList` — Residents with IsActive="Pending" (for admin)
- `filteredPendingResidents` — Filtered pending residents by search
- `userLoginAction()` — Validates flat+phone against rawResidents
- `userLogout()` — Clears localStorage, returns to login
- `registerResident()` — Calls ADD_RESIDENT endpoint
- `handleApproveResident(id)` / `handleRejectResident(id)` — Admin actions
- `login()` — Server-side admin auth via ADMIN_LOGIN
- `logout()` — Admin logout, clears localStorage

---

## Security Design
1. **Admin passwords never sent to client** — `Admins` sheet excluded from `DATA_SHEETS` in `code.gs`
2. **Admin login is server-side** — `ADMIN_LOGIN` POST action validates credentials in Apps Script
3. **Resident login validated locally** — After data fetch, flat+phone matched against Residents with `IsActive=true`
4. **Sessions in localStorage** — `sg_user` for residents, `sg_admin` for admins. Cleared on explicit logout

---

## User Flows

### Resident Login
1. App starts → shows login page (flat dropdown + mobile input)
2. Flat dropdown populated from `flatList` (all flats)
3. User selects flat, enters phone → validated against Residents sheet (IsActive must be true)
4. Success → localStorage saved, view=home. Failure → shows error + Register link
5. Pending registrations show specific "awaiting admin approval" message

### New Resident Registration
1. User clicks "Register as New Resident" from login page
2. Flat dropdown shows only flats WITHOUT active/pending residents
3. Submits → `ADD_RESIDENT` endpoint → IsActive="Pending"
4. Duplicate FlatNo+Phone check prevents re-registration
5. Success message → redirect to login

### Admin Resident Validation
1. Admin logs in via Admin Portal (server-side auth)
2. "Residents" tab shows pending registrations with Approve/Reject buttons
3. Approve → sets IsActive=true → resident can now login
4. Reject → sets IsActive="Rejected"

### My Flat
1. Bottom nav "My Flat" → opens logged-in user's resident detail
2. Shows flat info, occupants, payment summary, pending dues, monthly/adhoc payments
3. Includes GPay integration for pending dues

---

## Build & Deploy

### Local Development
```bash
hugo server
```

### Build for GitHub Pages
```bash
hugo
```
Output goes to `docs/` folder. Push to GitHub → auto-served by GitHub Pages.

### Deploy Google Apps Script
1. Copy `googleappsscript/code.gs` content
2. Paste in Google Apps Script editor (script.google.com)
3. Deploy → New deployment → Web app → Execute as "Me" → Anyone can access
4. Update `API_URL` in `hugo.toml` if the deployment URL changes

---

## Important Notes
- `docs/` folder IS the built site served by GitHub Pages — it must be committed
- `*.xlsx` files are gitignored — they contain sensitive resident data
- All flat numbers are normalized (leading zeros stripped) via `normalizeFlat()`
- The app is mobile-first — all templates designed for small screens
- Bottom nav and header are hidden on login/register screens (`x-show="user.isLoggedIn"`)
