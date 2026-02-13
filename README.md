# Agriturismo — Wedding Rooms Planner (Next.js + Supabase)

Web app per **sposi** (non ospiti) per gestire l’assegnazione degli ospiti agli appartamenti tramite **planimetrie SVG**, foto appartamenti e stato evento (**draft/submitted**) con blocco modifiche.  
Area **Admin** per creare utenti, creare eventi e fare export riepiloghi.

---

## Stack

- **Next.js (App Router)**
- **Supabase**: Auth, Postgres, RLS, Storage
- UI custom (Global CSS) stile “villa”

---

## Funzionalità principali

### Utente (Sposi)
- Login
- Pagina evento `/events/[eventId]`
  - Planimetrie SVG (3 strutture): `lake0`, `lake1`, `wc`
  - Click su appartamento → modal con:
    - Foto appartamento (slider + cache)
    - Lista ospiti assegnati
    - Form aggiunta ospite
    - Sposta / rimuovi ospite
  - Sidebar:
    - Ricerca ospiti
    - Lista “Non assegnati” + assegnazione rapida
  - **Conferma lista**: cambia stato evento in `submitted` e blocca modifiche lato UI

### Admin
- `/admin/events`
  - Crea utente
  - Crea evento associato a utente
  - Vede eventi (draft/submitted)
  - Può riportare evento da `submitted` a `draft` (se previsto)
  - Export riepilogo (es. per appartamento)

---

## Requisiti

- Node.js `20.x`
- Supabase project configurato

---

## Setup locale

```bash
npm install
npm run dev
```

Apri: `http://localhost:3000`

---

## Environment variables

Crea `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_xxxxx
```

> Nota: usare la chiave “publishable default” come indicato da Supabase.

---

## Routing (pagine)

- `/` → redirect intelligente (se loggato):
  - admin → `/admin/events`
  - user → `/events`
  - non loggato → `/login`
- `/login` → login
- `/events` → welcome + link unico evento (1 evento per cliente)
- `/events/[eventId]` → planner camere (SVG + modal)
- `/admin/events` → dashboard admin

---

## Storage (foto appartamenti)

Bucket: `apartment-photos`

Struttura cartelle:
```
apartment-photos/
  apt_1/
    1.jpg
    2.jpg
  apt_2/
    1.jpg
  apt_wc/
    1.jpg
```

Nel planner:
- `.list(apartmentId)` per ottenere file
- `getPublicUrl(path)` per mostrare immagini
- Cache in memoria per evitare refetch continuo

---

## Planimetrie SVG

Mettere in `public/plans/`:

- `public/plans/lakehouse_0floor.svg`
- `public/plans/lakehouse_1floor.svg`
- `public/plans/woodcutter_0floor.svg`

Regola importante:
- Ogni appartamento nel file SVG deve avere un elemento con `id="apt_X"` (es. `apt_1`, `apt_2`, ... e `apt_wc`)
- L’app aggiunge classi in runtime (`free/partial/full`) e gestisce click.

---

## Database (Supabase)

### Tabelle principali

#### `profiles`
- `id uuid` (PK, uguale ad `auth.users.id`)
- `email text`
- `is_admin boolean default false`
- `created_at timestamptz default now()`

> Inserimento automatico consigliato via trigger su `auth.users`.

#### `events`
- `id uuid` (PK)
- `name text`
- `start_date date`
- `end_date date`
- `created_by uuid` (FK → profiles.id / auth uid)
- `status text` enum-like: `draft` | `submitted` | `final`
- `created_at timestamptz default now()`
- `submitted_at timestamptz null`
- `submitted_by uuid null`

#### `guests`
- `id uuid` (PK)
- `event_id uuid` (FK → events.id)
- `apartment_id text null` (es. `apt_1`, `apt_wc`)
- `first_name text`
- `last_name text`
- `guest_type text` (`adult` | `child`)
- `child_age int null`
- `arrival_mode text null` (`car` | `transfer`)
- `checkin_date date null`
- `checkout_date date null`
- `extra_nights int default 0`
- `allergies text null`
- `notes text null`
- `created_at timestamptz default now()`

#### `apartments`
- `id text` (PK) es. `apt_1`, `apt_2`, `apt_wc`
- `capacity int`
- `structure text` (es. `Lake House`, `Woodcutter`)
- `floor int`

#### View: `apartment_occupancy`
View che torna, per evento:
- `event_id`
- `apartment_id`
- `capacity`
- `guests_count`
- `structure`
- `floor`

Esempio logica:
- join apartments + count guests where guests.event_id = X and guests.apartment_id = apartments.id

---

## RLS (Row Level Security) — concetti

### Regole base
- Un utente può vedere/modificare solo:
  - i suoi eventi (`created_by = auth.uid()`), oppure
  - eventi dove è membro (`event_members`), se usato

- Per `guests`:
  - insert/update/delete consentiti solo se l’utente è owner dell’evento e evento è `draft`
  - se evento è `submitted` → blocco (lato policy o lato UI o entrambi)

### Policy tipiche
- `events_select_own`: `created_by = auth.uid()`
- `events_update_own_when_draft`: `created_by = auth.uid() AND status = 'draft'`
- `guests_insert_own_event_draft`: utente owner dell’evento e evento draft
- `guests_update_own_event_draft`: come sopra
- `guests_delete_own_event_draft`: come sopra
- Admin: policy aggiuntive basate su `profiles.is_admin = true`

---

## Stato evento

- `draft`: modificabile (aggiunta/spostamenti ospiti)
- `submitted`: bloccato per cliente (UI locked + possibile policy DB)
- `admin` può rimettere `draft` se necessario

Nel client:
- `locked = eventStatus !== 'draft'`

---

## UX Notes (Modal + Mobile)

- Modal con header sticky + body scrollabile
- Foto “hero” + mini strip thumbnails (futuro)
- Consigliati:
  - bloccare scroll body quando modal aperta
  - ESC per chiudere modal (desktop)
  - preload immagini vicine (prev/next)

---

## Deployment (Vercel)

1. Push su GitHub
2. Import su Vercel
3. Env vars su Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
4. Build:
   - `next build`
5. Node:
   - `20.x`

---

## Troubleshooting

### “Not authenticated” su RPC
- assicurarsi che la chiamata sia fatta da utente loggato
- usare `supabase.auth.getUser()` prima di operazioni sensibili
- verificare RLS/policy su `events`

### “new row violates row-level security policy”
- manca policy `INSERT`/`UPDATE` su tabella
- verificare join con `events.created_by = auth.uid()` oppure membership

### SVG non cliccabile
- elementi devono avere `id="apt_*"`
- click handler legge `target.getAttribute("id")`

### Foto lente
- usare cache (in memoria)
- eventualmente `next/image` per ottimizzazione
- preload delle prossime immagini

---

## TODO / Roadmap

- [ ] Thumbnails strip nel modal (5 foto / appartamento)
- [ ] Modal mobile: scroll perfetto + body lock
- [ ] Admin export “per appartamento” (tabelle separate)
- [ ] Notifiche admin quando cliente conferma
- [ ] Audit log modifiche (opzionale)

---

## Note

Progetto custom per agriturismo (circa 7 matrimoni/anno), flusso gestito dagli sposi con planimetrie e foto.
