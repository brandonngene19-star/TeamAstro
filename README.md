# TeamAstro — InternFlow Admin Dashboard

InternFlow is a lightweight, browser-only admin dashboard for managing an
internship program: registering interns and supervisors, tracking daily
attendance, recording performance reviews, organizing interns into
supervisor-led groups, and exporting records to CSV.

There is no backend and no server-side database — everything runs
client-side in the browser and is persisted with **IndexedDB**, so the app
can be hosted as static files or opened directly on a single machine.

---

## Tech stack

- **HTML / CSS / vanilla JavaScript** — no build step, no framework
- **[Bootstrap 5.3.0](https://getbootstrap.com/)** (CDN) — grid, form
  styling, and form-validation classes
- **[Font Awesome 6.0.0-beta3](https://fontawesome.com/)** (CDN) — icons
- **Google Fonts** — Inter (body/UI font) and Material Symbols Outlined
  (brand icon)
- **IndexedDB** (native browser API, no library) — all data storage,
  wrapped in small Promise-based helpers in `indexdb.js`

## Project structure

```
login.html          Admin sign-in screen
login.css           Styles scoped to the login screen
interns.html         Interns module (register / list / edit / assign)
supervisors.html      Supervisors module (register / list / groups)
attendance.html       Daily attendance roster + weekly detail view
performance.html      Performance reviews module
settings.html         Workspace preferences + bulk data exports
styles.css            Shared styles for every page except login
indexdb.js            All application logic: database, rendering, CRUD,
                       validation, CSV export, auth
logo.png*             Header logo (not included — add your own)
background.png*       Login screen background image (not included)
```
`*` These two image assets are referenced by the markup/CSS but aren't part
of the source files — drop your own `logo.png` and `background.png` next
to the HTML files, or update the `src`/`background-image` references.

Every dashboard page (`interns.html`, `supervisors.html`, `attendance.html`,
`performance.html`, `settings.html`) shares the same header, collapsible
sidebar, and loads `styles.css` + `indexdb.js`. `login.html` is standalone
and loads `login.css` instead.

## Running it

Because the app relies on IndexedDB, it should be served over `http://` or
`https://` rather than opened as a bare `file://` path (some browsers
restrict IndexedDB under `file://`). Any static file server works, e.g.:

```bash
npx serve .
# or
python3 -m http.server 8000
```

Then open `login.html` in a browser.

## Logging in

There's a single hardcoded admin account, checked in `initLoginPage()`:

| Field    | Default value          |
|----------|-------------------------|
| Email    | `TeamAstro@gmail.com`   |
| Password | `TeamAstro1234`         |

The admin email can be changed from **Settings → Workspace Preferences**
(saved to the `settings` IndexedDB store and used both for login and the
header display). The password is currently a fixed constant in
`indexdb.js` (`DEMO_ADMIN_PASSWORD`) — this is a single-admin demo/prototype
auth model, not intended for production use as-is.

A logged-in session is stored in `sessionStorage` (cleared when the tab
closes) unless the login form is extended with a "remember me" checkbox
(`#rememberLogin`), in which case it persists in `localStorage` instead.
`requireLogin()` redirects any dashboard page back to `login.html` if no
session is found.

## Modules

### Interns (`interns.html`)
- Register interns: first/last name (letters only), email (unique),
  9-digit phone number, school, department, gender
- Auto-generates a human-readable intern ID (`INT-<year>-<random 3
  digits>`) and creates that intern's first attendance record
- Edit / remove intern records; removing an intern also removes their
  attendance history
- Assign / reassign a supervisor to an intern
- "Details" popup per intern, with an **Export** button that downloads a
  single-intern CSV of every field shown
- Bulk **Export** button (top of page) downloads all interns as one CSV
- Live stats: total interns, active departments, added today

### Supervisors (`supervisors.html`)
- Register supervisors: name, email (unique), phone, department, gender
- Activate / deactivate a supervisor; deactivating unassigns them from
  any interns and clears them from any groups
- Assign a supervisor to an unassigned intern from their row
- **Create Group** tab: name a group, pick a supervisor, and select any
  number of interns to place in it; edit or delete existing groups
- Bulk CSV export of all supervisors

### Attendance (`attendance.html`)
- One roster row per intern for **today**, generated automatically each
  time the page loads (`finalizeAndPrepareAttendanceForToday`), so the
  view always reflects the current day rather than a stale prior status
- Any prior day left at `-` (never checked in) is finalized as **Absent**
  the next time the page loads, so historical Absent counts stay accurate
- **Check In / Check Out** buttons per intern:
  - Status is derived from time of check-in: **Present** before 7:00 AM,
    **Late** from 7:00 AM until 4:30 PM, **Absent** after 4:30 PM
  - Check-in/out is disabled entirely after 5:00 PM (the attendance
    window is closed for the day)
- Filter by status and search by name/department
- Bulk-select rows to delete
- **View details** opens a Monday–Friday weekly table for that intern
  (check-in/out time and status per day) with a Present/Late/Absent tally
- CSV export of the latest record per intern

### Performance (`performance.html`)
- Filter by rating (Excellent / Good / Average / Needs Improvement / Not
  reviewed) and search by name/department
- Edit an intern's rating and written feedback; bulk-delete records
- Live stats: total interns, reviewed count, average score
- CSV export of all performance records

### Settings (`settings.html`)
- Workspace name and admin email (persisted to the `settings` store)
- Live record counts (interns / supervisors / attendance rows)
- One-click CSV export for each module (interns, supervisors,
  attendance, performance) — same exporter used on each module's own
  page

## Data storage

All data lives in a single IndexedDB database, **`InternFlowDB`**
(current schema version `7`), created and upgraded in `initDatabase()`.
It is entirely local to the browser profile it was created in — there is
no sync between devices or browsers, and clearing site data/browser
storage deletes it permanently.

| Object store  | Key path | Indexes                                  |
|---------------|----------|-------------------------------------------|
| `interns`     | `id`     | `name`, `email` (unique), `department`    |
| `supervisors` | `id`     | `name`, `email` (unique), `department`, `role` |
| `attendance`  | `id`     | `internId`, `date`, `status`              |
| `performance` | `id`     | `internId`, `rating`                      |
| `groups`      | `id`     | `name`, `supervisorId`                    |
| `settings`    | `key`    | —                                          |

## CSV export

Every export button funnels through one client-side exporter
(`exportToCSV`) that builds a CSV in memory and triggers a browser
download — there's no server round-trip. A couple of details worth
knowing:

- **Phone numbers are exported as text**, not numbers. Spreadsheet apps
  (Excel/Sheets) auto-detect all-digit CSV cells as numbers and silently
  drop a leading zero, so phone values are wrapped as an Excel "text
  formula" (`="0612345678"`) to force them to stay literal text.
- Internal ID fields (`id`, `internId`, `internId_code`, `supervisorId`)
  and attendance `remarks` are excluded from bulk exports.
- The Interns "Details" popup has its own **Export** button that
  downloads just that one intern's full record as a standalone CSV,
  separate from the bulk exporter.

## UI notes

- All modals (add/edit forms, confirmations, read-only "Details" popups)
  are built by a small shared, Promise-based modal system in
  `indexdb.js` (`showCustomModal`, `showCustomConfirm`,
  `showDetailsModal`) rather than a UI library.
- Alerts/toasts are shown via `showAlert(message, type)` with
  `success` / `error` / `warning` variants.
- The header's email shows a **Details / Log out** menu on hover.
- The sidebar collapses to an overlay on smaller viewports, toggled via
  the menu button.

## Known limitations

- Single hardcoded admin account — not a multi-user or role-based system
- No backend, no network sync — data is local to one browser/device
- No password hashing/authentication hardening — this is a
  prototype-grade auth flow, not production security
- No automated tests
