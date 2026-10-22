# Ledgerly — Xero Accounting Insights & Synchronization Engine

A modern, enterprise-ready accounting dashboard built with **Next.js 16 (App Router)** and **PostgreSQL**. It connects to the live **Xero Accounting API**, securely synchronizes Chart of Accounts and Sales Invoices, and stores encrypted tokens and OAuth scopes directly in PostgreSQL.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Prerequisites](#prerequisites)
3. [Quick Start (How to Run with Commands & Comments)](#quick-start)
4. [Environment Variables Reference](#environment-variables-reference)
5. [Database Setup & Migrations](#database-setup--migrations)
6. [Xero OAuth 2.0 Setup](#xero-oauth-20-setup)
7. [Default Admin Credentials](#default-admin-credentials)
8. [Reusable API Service Architecture](#reusable-api-service-architecture)
9. [Available NPM Scripts](#available-npm-scripts)
10. [Troubleshooting & FAQs](#troubleshooting--faqs)

---

## Key Features

- **Live Xero API Integration**: Fetches real-time Chart of Accounts (`/api.xro/2.0/Accounts`) and Sales Invoices (`/api.xro/2.0/Invoices`).
- **PostgreSQL Persistence**: All connected tenants, OAuth credentials, granted scopes, user sessions, accounts, and invoices are saved directly to PostgreSQL.
- **AES-256-GCM Token Encryption**: Access tokens, refresh tokens, and client secrets are strongly encrypted at rest before storing in the database.
- **Dynamic Scopes in PostgreSQL**: OAuth scopes are stored in `xero_credentials.scopes` and `xero_connections.scopes`, configurable via the Settings UI.
- **Enterprise UI & Dashboard**: Clean Vanilla CSS design system with responsive layouts, real-time metrics, dynamic company switcher, and dark-themed login screen.
- **Session Security**: Session tokens are hashed with SHA-256 in PostgreSQL, cookies are protected with `HttpOnly`, `SameSite=Lax`, and anti-cache headers prevent back-button traversal after logout.
- **Reusable API Client**: Centralized service layer (`app/services/api.ts`) featuring automatic in-flight request deduplication, memory caching, and normalized error handling.

---

## Prerequisites

Before running the application, ensure you have the following installed on your machine:

1. **Node.js**: `v20.x` or higher (Node `v24.x` supported).
2. **PostgreSQL**: Running locally or accessible over the network (default port `5432`).
3. **Xero Developer Account**: An application created at [developer.xero.com](https://developer.xero.com/).

---

## Quick Start

Follow these steps sequentially to install, configure, and launch the application.

### Step 1: Navigate to the project directory
Open your terminal (PowerShell or Bash) and change into the project root:

```bash
# Navigate to the Next.js application directory
cd xeroAccounting
```

### Step 2: Install project dependencies
Install all required Node.js packages (Next.js, React, pg, TypeScript, etc.):

```bash
# Install npm dependencies
npm install
```

### Step 3: Create and configure your environment file
Copy the `.env.example` template into `.env.local`:

```bash
# On Windows PowerShell:
Copy-Item .env.example .env.local

# On Linux / macOS / Git Bash:
cp .env.example .env.local
```

Open `.env.local` in your editor and configure your database and Xero details:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/xero_accounting

# 64-character hex key for encrypting stored OAuth tokens
XERO_TOKEN_ENCRYPTION_KEY=dd578fe8d2b6ec2dac8f6d41baf25c7a32ac9d14ffeffbf55bca64e1fab85af3

# Your Xero application credentials (from https://developer.xero.com/)
XERO_CLIENT_ID=71064ED0A95C4D288389205B2BA4C0C0
XERO_CLIENT_SECRET=zYXYDZbJjavAr-ztdpXEuwHRrpwjZ2iHNjjYxwoqH6alHbLi

# OAuth redirect URL (must match Xero developer portal)
XERO_REDIRECT_URI=http://localhost:3000/api/xero/callback

# Scopes stored and used for data fetching
XERO_SCOPES="openid profile email offline_access accounting.invoices.read accounting.contacts.read accounting.settings.read accounting.reports.read accounting.transactions.read"
```

> **Tip**: If you want to generate a new encryption key, run:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

### Step 4: Verify or migrate the database schema
Ensure your PostgreSQL database `xero_accounting` exists. The application automatically initializes all tables on first request, but you can also run the schema migration script manually:

```bash
# Run database schema migration to ensure tables and scopes exist
node scripts/migrate-scopes.mjs
```

### Step 5: Start the development server
Run the development server with Next.js Turbopack:

```bash
# Starts the development server at http://localhost:3000
npm run dev
```

### Step 6: Access the application
Open your web browser and navigate to:
```
http://localhost:3000
```
- You will be redirected to the secure **Login** page (`/login`) if not yet authenticated.

---

## Environment Variables Reference

| Variable | Description | Example / Default |
| :--- | :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection URI | `postgresql://postgres:postgres@localhost:5432/xero_accounting` |
| `XERO_TOKEN_ENCRYPTION_KEY` | 64-char hex key for AES-256-GCM token encryption | `dd578fe8d2b6ec2dac8f6d41baf25c7a32...` |
| `XERO_CLIENT_ID` | OAuth 2.0 Client ID from Xero Developer Portal | `71064ED0A95C4D288389205B2BA4C0C0` |
| `XERO_CLIENT_SECRET` | OAuth 2.0 Client Secret from Xero Developer Portal | `zYXYDZbJjavAr-ztdpXEuwHRrpwjZ2i...` |
| `XERO_REDIRECT_URI` | Whitelisted callback URL in Xero app | `http://localhost:3000/api/xero/callback` |
| `XERO_SCOPES` | Default scopes stored and used for Xero connection | `openid profile email offline_access ...` |

---

## Database Setup & Migrations

The database tables are automatically verified and created by `ensureSchema()` on boot:

1. **`app_users`**: Stores admin credentials with salted `bcrypt` password hashes.
2. **`app_sessions`**: Stores active login sessions using SHA-256 token hashing.
3. **`xero_credentials`**: Stores encrypted Xero client ID, client secret, and configurable OAuth scopes.
4. **`xero_connections`**: Stores tenant ID, connected organization name, encrypted access/refresh tokens, expiration timestamps, and granted scopes.
5. **`xero_accounts`**: Stores synchronized Chart of Accounts metadata (`code`, `name`, `type`, `class`, `tax_type`, `status`).
6. **`xero_invoices`**: Stores synchronized invoices (`invoice_number`, `contact_name`, `invoice_date`, `due_date`, `status`, `total`, `amount_due`).

To run manual schema updates:
```bash
# Migrate / update scopes column in PostgreSQL:
node scripts/migrate-scopes.mjs
```

---

## Xero OAuth 2.0 Setup

### Connecting via OAuth (Recommended)
1. In your Xero Developer Portal ([developer.xero.com](https://developer.xero.com/)):
   - Create a Web App.
   - Set **Redirect URI** to: `http://localhost:3000/api/xero/callback`.
2. Start the app and log in as Admin.
3. Go to **Settings** (`/settings`).
4. Click **Connect Xero (OAuth)**.
5. Authorize access to your organization (e.g., *Demo Company (Global)*).
6. Upon return, click **Sync Xero** to pull live accounts and invoices into PostgreSQL.

### Connecting via Direct Bearer Token (API Explorer / Postman)
If you already generated an Access Token & Tenant ID from the Xero OAuth 2.0 API Explorer:
1. Open **Settings** (`/settings`).
2. Expand **Direct Token Connect**.
3. Paste your **Tenant ID** and **Bearer Access Token**.
4. Click **Connect & Fetch Accounts**.

---

## Default Admin Credentials

For development and local testing, an administrator account is pre-configured:

- **Email**: `admin@ledgerly.local`
- **Password**: `AdminPassword123!`

You can also switch to the **New Admin** tab on the login screen to register your own custom administrator account.

---

## Reusable API Service Architecture

All frontend request logic is abstracted out of UI components into a dedicated service layer:
[`app/services/api.ts`](file:///c:/Users/XSER/Desktop/xeroaccounting/xeroAccounting/app/services/api.ts)

### Features:
- **Request Deduplication**: Multiple simultaneous clicks or concurrent component fetches share the same in-flight promise rather than firing multiple network requests.
- **Client-Side In-Memory Caching**: Infrequent changes (such as workspace name or credentials) are cached with a short TTL to prevent redundant requests during re-renders.
- **Normalized Error Handling**: Converts API responses into standard `ApiError` objects with HTTP status codes.

### Usage in Components:
```typescript
import { authService, workspaceService, xeroService } from "@/app/services/api";

// Authentication
await authService.login(email, password);
await authService.logout();

// Workspace info (cached & deduplicated)
const workspace = await workspaceService.getWorkspace();

// Xero Synchronization
const syncResult = await xeroService.sync("all");
```

---

## Available NPM Scripts

Run these scripts from the `xeroAccounting` folder:

```bash
# Start Next.js development server with Turbopack
npm run dev

# Compile TypeScript and create production build
npm run build

# Start production server (run 'npm run build' first)
npm start

# Run ESLint checks
npm run lint
```

---

## Troubleshooting & FAQs

### 1. `Port 3000 is in use by process XXXX`
If a previous dev server process is still holding port 3000:
```bash
# On Windows PowerShell:
Stop-Process -Id <PID> -Force

# Or kill all Node processes:
taskkill /IM node.exe /F
```

### 2. `Xero accounts API error (401): Unauthorized`
The Xero access token expires after 30 minutes. The system automatically refreshes it using the refresh token. If authorization was completely revoked, navigate to **Settings** and click **Connect Xero (OAuth)** to renew tokens.

### 3. `DATABASE_URL is not configured` or database connection errors
Ensure PostgreSQL is active and accessible:
```bash
# Test PostgreSQL connectivity:
psql -U postgres -h localhost -d xero_accounting
```
Verify your credentials match in `.env.local`.

---

## License
MIT License. Built for secure accounting integration.
