<div align="center">
    <img src="appointmed_website/public/icon-512.png" alt="AppointMed Logo" width="200" height="200"/>
    <h1>AppointMed</h1>
    <h3><em>One AI chat. Every hospital.</em></h3>
</div>

<p align="center">
    <strong>Describe how you feel in your own words — get a real, hospital-confirmed appointment at the end.</strong>
</p>

<p align="center">
    <img src="https://img.shields.io/badge/Flutter-02569B?style=flat&logo=flutter&logoColor=white" alt="Flutter"/>
    <img src="https://img.shields.io/badge/Dart-0175C2?style=flat&logo=dart&logoColor=white" alt="Dart"/>
    <img src="https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=white" alt="React"/>
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=flat&logo=supabase&logoColor=white" alt="Supabase"/>
    <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat&logo=postgresql&logoColor=white" alt="PostgreSQL"/>
    <img src="https://img.shields.io/badge/Ollama-828282?style=flat&logo=ollama&logoColor=white" alt="Ollama"/>
    <img src="https://img.shields.io/badge/Gemma4:12b-8E75B2?style=flat&logo=googlegemini&logoColor=white" alt="Gemma"/>
</p>

---

# 📸 Product Preview

> Real screenshots from the current build.

## Mobile App (for Patient)
<div align="center">
  <table>
    <tr>
      <th>Home</th>
      <th>AI Chat</th>
      <th>Appointments</th>
      <th>Patient Profile</th>
    </tr>
    <tr>
      <td align="center"><img src="assets/Home.png" alt="home" style="width:240px;height:auto;" /></td>
      <td align="center"><img src="assets/AI Chat.png" alt="chat" style="width:240px;height:auto;" /></td>
      <td align="center"><img src="assets/Appointments.png" alt="appointment" style="width:240px;height:auto;" /></td>
      <td align="center"><img src="assets/Profile.png" alt="profile" style="width:240px;height:auto;" /></td>
    </tr>
  </table>
</div>

## Website (for Clinic / Hospital)
| Dashboard | Integration | Settings |
|-----------|-------------------|--------------|
| ![dashboard](assets/Dashboard.png) | ![integration](assets/Integration.png) | ![setting](assets/Settings.png) |

| Requests | Patient Report |
|-------------------|--------------|
| ![request](assets/Requests.png) | ![report](assets/Patient_Report.png) |

---

## Table of contents

1. [What AppointMed is](#1-what-appointmed-is)
2. [The problem it solves](#2-the-problem-it-solves)
3. [How the local AI actually drives the work](#3-how-the-local-ai-actually-drives-the-work)
4. [What happens end to end](#4-what-happens-end-to-end)
5. [The five pieces of the system](#5-the-five-pieces-of-the-system)
6. [**Setup guide — start here if you have nothing installed**](#6-setup-guide--start-here-if-you-have-nothing-installed)
7. [Try the whole thing (demo walkthrough)](#7-try-the-whole-thing-demo-walkthrough)
8. [If something goes wrong](#8-if-something-goes-wrong)
9. [Running the tests](#9-running-the-tests)
10. [Business model](#10-business-model)
11. [What is in each folder](#11-what-is-in-each-folder)

---

## 1. What AppointMed is

AppointMed turns the sentence *"I have chest pain"* into a **hospital-confirmed appointment**, as one
automated, fully audited workflow.

A patient opens a chat and describes what is wrong in ordinary language — optionally attaching a photo
of a rash or a PDF referral letter. A **local AI model, running on the same machine as the software**,
reads that free text, works out which medical specialty is needed and how urgent it is, asks about
budget and preferred timing, searches live appointment slots across **every subscribed hospital**,
picks the ones that fit, and sends a booking request to the hospital that matches best.

A real human at that hospital then sees the request in a web portal — with an AI-written clinical case
report and a HIGH / MEDIUM / LOW priority badge — and presses **Confirm**, **Decline** or **Reschedule**.
That answer travels back down the same chain automatically, and the patient's phone updates live.

Every single decision, every tool call and every state change along the way is written to an
append-only log that can be read back afterwards, row by row.

**Nothing about the reasoning leaves the machine.** There is no cloud AI provider, no remote inference
API, no third party being shown someone's symptoms. The model runs locally.

---

## 2. The problem it solves

### The healthcare problem

Booking specialist care is still one of the most fragmented, manual errands in Malaysian healthcare —
and in most of the world. A patient has to guess which specialist they need, phone or fill a form for
each hospital separately, wait for a callback, and hope the price and the timing work out. Hospitals,
on their side, receive unstructured requests with no clinical context and no priority, and triage them
by hand.

This is not a hypothetical. Malaysia's largest private hospital groups still tell patients submitting
an online booking form that *"this is not a confirmed appointment"* and that *"confirmation is
pending"*. Request-and-callback remains the private-sector default.

AppointMed attacks exactly that gap, in the four places a healthcare AI brief cares about:

| Healthcare need | How AppointMed answers it |
|---|---|
| **Automate clinical documentation** | The free-text conversation is converted into six typed clinical fields (main complaint, duration, severity, associated symptoms, medical history, current medications) plus an eleven-field AI case report — generated at triage, once those fields and every attachment are known — that the hospital manager actually triages on. The patient never fills a form. |
| **Optimise patient triaging** | The model returns one of nine specialties, an urgency level, an explanation, and any red flags. Urgency is not cosmetic — it narrows the slot search window from 7 days to 2 for urgent cases and sets the priority the hospital sees. A genuine emergency red flag seals the consultation and shows emergency guidance instead of continuing to book. |
| **Manage hospital resources** | Slot inventory is searched across every subscribed hospital at once, filtered by the patient's real budget and timing constraints. Bookings are taken under a database row lock, so the same slot can never be sold twice, and a human at the hospital always has the final say. |
| **Privacy-focused local models** | All reasoning happens on a locally served model. Symptom text, uploaded photos and PDF reports are never sent to an external AI service. Medical uploads live in a private storage bucket that no client key can read; the workflow log is unreadable to every client key in the system. |

### The AI-workflow problem

The wider brief this system was built for asks for an **AI-powered workflow system where a local Large
Language Model is the central reasoning engine** — one that understands unstructured input, reasons
across multiple stages, orchestrates tools and APIs, produces structured and actionable output, holds
state, adapts to ambiguity and failure, and **collapses if the model is taken away**.

| What the brief asks for | Where it lives in this system |
|---|---|
| Understanding unstructured inputs (messages, forms, documents) | Free-text chat becomes six typed fields. PDF referrals are text-extracted and spliced into the same reasoning turn; JPEG/PNG/WebP photos are attached directly to the message for a multimodal model to read. |
| Multi-step reasoning and decision-making across stages | Six separate schema-constrained decisions across three workflow stages. Decisions feed *forward*: the triage urgency literally determines the time window of the next stage's slot search. |
| Dynamic task orchestration, including tool and API interactions | The engine fans a slot search out over every candidate hospital — one authenticated HTTP call per hospital, using that hospital's own API key — then books, then receives a callback from the hospital system when a manager decides. |
| Generation of structured, actionable outputs | Not just prose: a real `pending` appointment row carrying an AI summary and priority, written atomically with its notification; live realtime updates to both apps; and a JSON decision log with model name and latency per call. |
| Stateful and adaptive under real-world constraints | The engine keeps **nothing** in memory between requests. Every turn reloads the run from the database and saves it back, so a consultation survives a server restart. Ambiguity gets a clarifying question; missing data gets a targeted re-ask; an impossible search gets an AI-chosen constraint relaxation; failures get bounded retries and safe fallbacks. |
| Remove the LLM and coordination collapses | The LLM provides the core decision-making glue; removing it strips all adaptive routing, context preservation, and dynamic fallback capabilities. |

---

## 3. How the local AI actually drives the work

The model is not a chatbot bolted onto a booking form. It is the component that makes six distinct
decisions, each one shaped by a **JSON Schema** that the local runtime enforces during decoding:

| Stage | The decision the model returns | Why it matters |
|---|---|---|
| **Intake** | `reply`, `complete`, `redFlag`, and the six symptom fields | Turns unstructured chat into a clinical record; decides whether to ask again or move on; catches emergencies |
| **Attachment** | `observation` — a plain-language description of an uploaded photo or document | Vision-capable pass over each upload at upload time, so the doctor sees a description of the file itself, not just AI-extracted text |
| **Triage** | `specialty` (1 of 9), `urgency` (`asap` / `week` / `month` / `routine`), `explanation`, `redFlags[]` | Chooses the medical route and the urgency that drives the search window |
| **Preferences** | `reply`, `complete`, and `budget` / `preferredHospital` / `preferredTime` | Reads constraints out of conversational text — no form fields |
| **Relaxation** | which single constraint to loosen, and why | The adaptive step: when zero slots match, the model decides what to give up |
| **Case report** | an eleven-field clinical case report — chief complaint, history of present illness, attachment findings, triage assessment, clinician notes, priority, and more — generated at `triage` | The structured, human-actionable output the hospital manager reviews; persisted to `appointments.ai_report` when the patient books |

Because the schema constrains decoding, `specialty` can *only* ever be one of the nine allowed
strings. The engine never string-scrapes a reply, never parses sentinel tags, and never has to defend
against an invented specialty. The model expresses **intent**; ordinary TypeScript performs the
**dispatch**. That split is what makes the whole workflow testable and replayable.

### The workflow engine (rubric core)

A consultation is a **run**: a row in `workflow_runs` holding a `current_node`, a `status` and a JSON
`state` blob. The engine keeps nothing in memory between requests — every turn loads the run from
Postgres, advances it, and saves it back. That is what makes runs resumable and what makes the step
log complete.

`Node` (`appointmed_engine/src/workflow/types.ts:1`) has exactly seven values:
`intake | triage | match | book_request | hospital_review | postback | done`.
`RunStatus` has five: `active | waiting_hospital | completed | failed | escalated`.

Two precise points that the diagram alone would hide:

- **Re-match is a transition, not a node.** A declined booking, or a patient choosing to re-match,
  sends `current_node` back to `match` with the offending hospital appended to
  `state.excludeHospitalIds`.
- **`escalated` is a status, not a node.** When intake detects a red flag the run's status becomes
  `escalated` while `current_node` stays `intake`; `advanceWithMessage` then short-circuits every
  later message to fixed emergency guidance without calling the model at all
  (`workflow/machine.ts:9-12`).

```mermaid
stateDiagram-v2
  [*] --> intake
  intake --> intake: fields still missing - targeted follow-up
  intake --> sealed: red flag detected - 999 guidance
  intake --> triage: all six symptom fields collected
  triage --> match: verdict = specialty + urgency
  match --> match: prefs incomplete, or zero slots - relax up to 3 constraints
  match --> book_request: patient selects a slot
  book_request --> match: adapter confirm failed - options may be stale
  book_request --> hospital_review: pending appointment created
  hospital_review --> postback: hospital confirms, declines or reschedules
  hospital_review --> done: patient cancels, or accepts a proposed time
  hospital_review --> match: patient re-matches - hospital excluded
  postback --> done: confirmed or cancelled
  postback --> match: declined - re-match, hospital excluded
  done --> [*]
  sealed --> [*]
  note right of sealed
    Not a node. status becomes escalated
    while current_node stays intake.
  end note
```

---

## 4. What happens end to end

```
patient describes symptoms (± photo / PDF)
        │
        │   local-AI intake: six symptom fields pulled out of free text,
        │   targeted follow-ups on anything missing, red flags escalated
        ▼
   triage verdict  →  specialty (1 of 9) + urgency (asap | week | month | routine)
        │
        │   preferences: budget, preferred hospital, time of day
        ▼
   matching  →  slot search fanned out across every subscribed hospital, filtered
        │        by those preferences; if nothing matches, the model picks ONE
        │        constraint to relax and explains why (up to 3 relaxations)
        ▼
   patient picks a slot  →  PENDING booking request created at that hospital
        │
        ▼
   hospital manager reviews it in the portal — AI case report + priority badge —
   and confirms, declines or proposes a different time
        │
        │   callback to the engine (shared-secret header, bounded retries)
        ▼
   patient's app flips status live + notification.  A decline sends the run back
   to matching with that hospital excluded; a proposal waits for the patient.
```

**A deliberate design decision: bookings are hospital-confirmed, not auto-confirmed.** It would look
slicker to write a "confirmed" appointment the instant the AI picks a slot — but no hospital would
have agreed to anything. AppointMed creates a *pending request* and waits for a real decision from the
hospital side. That is what makes this a multi-party workflow instead of a single database write, and
it matches how private hospitals actually behave today.

---

## 5. The five pieces of the system

```
    PATIENT SIDE                                    HOSPITAL SIDE

 ┌───────────────────────────┐               ┌──────────────────────────────┐
 │  Patient app   (Flutter)  │               │  Hospital portal   (React)   │
 │  appointmed_mobile/       │               │  appointmed_website/   :5173 │
 └─────────────┬─────────────┘               └───────────────┬──────────────┘
               │                                             │
     consult API :8080  (bearer)             subscribe + manager routes :8080
     auth / secure reads / realtime          manager decisions x-api-key :8090
               │                                             │
               ▼                                             │
 ┌──────────────────────────────────────────────────┐        │
 │  Workflow engine      appointmed_engine/  :8080  │        │
 │    7-stage persisted state machine               │        │
 │    6 schema-constrained AI decisions             │        │
 │    append-only audit log of every step           │        │
 └────────┬──────────────────────────┬──────────────┘        │
          │                          │                       │
   POST /api/chat         GET /slots · POST /appointment/*   │
   format: <schema>       per-hospital x-api-key :8090       │
          │                          │                       │
          ▼                          ▼                       ▼
 ┌────────────────────┐   ┌──────────────────────────────────────────────────┐
 │  Ollama     :11434 │   │  Hospital adapter                                │
 │  gemma4:12b        │   │  appointmed_hospital_adapter/             :8090  │
 │  qwen3.5:9b (fb)   │   │  simulated hospital system · per-hospital keys   │
 └────────────────────┘   │  row-locked booking · callback with retries      │
                          └────────────────────┬─────────────────────────────┘
                                               │
                     POST /postback (x-postback-secret) → engine :8080
                                               │
                                               ▼
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  Hosted Supabase   Postgres (12 tables, least-privilege row security) ·  │
 │  Auth · Storage (2 private buckets) · Realtime                           │
 │                                                                          │
 │  engine → privileged writes + run log        adapter → direct Postgres   │
 │  clients → public key, read-only (exactly two narrow column grants)      │
 └──────────────────────────────────────────────────────────────────────────┘
```

| Component | Folder | What it is | Port |
|---|---|---|---|
| Patient app | `appointmed_mobile/` | Flutter app — chat, appointments, notifications. Contains **no** prompts and **no** workflow logic. | — |
| **Workflow engine** | `appointmed_engine/` | Node + TypeScript. **The only component that reasons.** Runs the state machine, calls the model, calls the hospital API, writes the audit log. | **8080** |
| Hospital adapter | `appointmed_hospital_adapter/` | Node + TypeScript. Stands in for a real hospital information system: slot search, booking under a row lock, manager decisions, callbacks. | **8090** |
| Hospital portal | `appointmed_website/` | React. Subscription sign-up, the manager decision queue, API key management and a live API tester. | **5173** |
| Local model server | (external) | Ollama serving `gemma4:12b`, with `qwen3.5:9b` as the fallback. | **11434** |
| Database & auth | (hosted) | Supabase: Postgres, Auth, Storage, Realtime. | — |

The patient app and the hospital portal **never call each other**, and neither contains workflow
logic. The portal talks to the hospital adapter using the *same public API key surface* a real
integrating hospital would use — there is no privileged back channel.

---

## 6. Setup guide — start here if you have nothing installed

### Quick map of the whole setup

| Part | What you do | Roughly how long |
|---|---|---|
| A | Install four free programs | 30–60 min (mostly downloading) |
| B | Put the project folder on your computer | 5 min |
| C | Create your own free database project and copy 4 values | 15 min |
| D | Paste those 4 values in (3 files, exact lines given) | 10 min |
| E | Build the database tables and demo data | 10 min |
| F | Start everything with one command | 2 min |
| G | *(Optional)* Start the patient app | 30–60 min |
| H | Walk through the demo | 15 min |

---

### Part A — Install the programs you need

#### A0. How to open a terminal

The "terminal" is a window where you type commands.

- **Windows:** press the **Windows key**, type `powershell`, press **Enter**. A dark blue window opens.
- **macOS:** press **Cmd + Space**, type `terminal`, press **Enter**.
- **Linux:** press **Ctrl + Alt + T**.

Keep this window open — you will use it a lot. When this guide says "run", it means: click inside that
window, type the line, press Enter, and wait until the text stops scrolling.

#### A1. Install Node.js (version 24)

Node.js is the program that runs three of the five pieces of this system.

1. Open <https://nodejs.org/en/download> in your browser.
2. Choose your operating system and download the installer.
3. Open the downloaded file and click **Next / Continue / Agree** on every screen. Do not change any
   option.
4. **Close your terminal window completely and open a new one** (this is required — the new program is
   only visible to new windows).
5. Check it worked. Run:

   ```
   node -v
   ```

   You should see something like `v24.16.0`. If you see an error such as *"not recognized"*, the
   install did not finish — reinstall and reboot.

6. Also run:

   ```
   npm -v
   ```

   You should see something like `11.17.0`.

#### A2. Install Git

Git is how you download the project folder.

1. Open <https://git-scm.com/downloads> and download the installer for your system.
2. Run it and accept every default (many screens — keep clicking Next).
3. Open a **new** terminal window and run:

   ```
   git --version
   ```

   You should see a version number.

> If somebody already handed you the project as a ZIP file, you can skip Git and just unzip it —
> see Part B.

#### A3. Install Ollama and download the AI model

Ollama is the program that runs the AI model **on your own computer**.

1. Open <https://ollama.com/download>, pick your system, and download.
2. Install it (Windows: run `OllamaSetup.exe` and click through; macOS: drag the app to Applications
   and open it once; Linux: the site gives you one command to paste).
3. Ollama starts by itself and keeps running quietly in the background. Check it: open
   <http://localhost:11434> in your web browser. The page should say **"Ollama is running"**.

   - If it does not, open a terminal and run `ollama serve`, then leave that window open.

4. Now download the AI model. **This is a large download (several gigabytes) and can take 10–40
   minutes** depending on your internet. Run:

   ```
   ollama pull gemma4:12b
   ```

5. Then download the backup model (used automatically if the first one fails):

   ```
   ollama pull qwen3.5:9b
   ```

6. Check both arrived:

   ```
   ollama list
   ```

   You should see `gemma4:12b` and `qwen3.5:9b` in the list.

> **Space and memory.** These two models need roughly **15 GB of free disk space**. A computer with
> **16 GB of RAM** runs the 12-billion-parameter model comfortably; 8 GB will be slow. If your computer
> is small, you can point the system at a smaller model later — the end of Part D shows where.

> **The first AI reply of the day is slow** (up to ~45 seconds) because the model has to load into
> memory. Every reply after that takes about 5–12 seconds. This is normal, not a bug.

#### A4. Install a text editor (Visual Studio Code)

In Part D you will edit specific lines inside files. You need a proper code editor for that — **not**
Microsoft Word, and **not** TextEdit in rich-text mode, because those silently add invisible
formatting that breaks the files.

1. Open <https://code.visualstudio.com/> and click the big download button.
2. Install it with all the defaults.
3. Learn these two things — you will use them constantly:
   - **To open a file:** in the editor choose **File → Open File…**, then find the file.
   - **To jump to a specific line number:** press **Ctrl + G** (Windows/Linux) or **Cmd + G**
     (macOS), type the line number, press Enter. Your cursor lands on that exact line.
4. Also turn on line numbers if they are not showing: **View → Appearance → check "Line Numbers"**.

#### A5. *(Only if you want the patient phone app)* Install Flutter

Skip this for now if you just want to see the system working — the hospital portal alone demonstrates
the whole workflow. Come back to this in Part G.

---

### Part B — Get the project onto your computer

1. Decide where it should live. This guide uses your **Downloads** folder.
2. In your terminal, go there:

   **Windows (PowerShell):**
   ```
   cd $HOME\Downloads
   ```

   **macOS / Linux:**
   ```
   cd ~/Downloads
   ```

3. Download the project:

   ```
   git clone <the project repository address> AppointMed
   ```

   (If you were given a ZIP file instead: unzip it into `Downloads`, and make sure the folder is named
   `AppointMed`.)

4. Go inside the project folder:

   **Windows (PowerShell):**
   ```
   cd $HOME\Downloads\AppointMed
   ```

   **macOS / Linux:**
   ```
   cd ~/Downloads/AppointMed
   ```

5. Confirm you are in the right place. Run:

   **Windows:**
   ```
   dir
   ```

   **macOS / Linux:**
   ```
   ls
   ```

   You should see folders named `appointmed_engine`, `appointmed_hospital_adapter`,
   `appointmed_mobile`, `appointmed_website`, `scripts` and `supabase`.

> **From here on, every command in this guide is typed while you are inside the `AppointMed` folder**,
> unless the step says otherwise. If you close the terminal, run the `cd` command from step 4 again.

---

### Part C — Create your own database project and collect 4 values

The system stores everything — patients, hospitals, slots, appointments, the audit log — in a free
hosted Postgres database from Supabase. You are going to create one and collect **four values** from
it.

Open a blank Notepad / TextEdit document now and keep it beside you. You will paste the four values
into it as you collect them.

#### C1. Create the project

1. Go to <https://supabase.com> and click **Start your project**. Sign up (signing in with GitHub or
   Google is fastest). It is free.
2. Click **New project**.
3. Fill in:
   - **Name:** `appointmed` (any name works)
   - **Database Password:** click **Generate a password**, then **copy it into your Notepad file
     immediately.** You cannot see it again later.
     > **Strong recommendation:** use a password made only of **letters and numbers**. Symbols like
     > `@`, `#`, `/`, `?` must be specially encoded later and are the single most common reason this
     > setup fails. If the generated password has symbols, replace it with a letters-and-numbers one
     > of your own, at least 16 characters long.
   - **Region:** pick the one closest to you. For Malaysia and Singapore, choose
     **Southeast Asia (Singapore)**.
4. Click **Create new project** and wait about **2 minutes** while it builds.

#### C2. Collect **Value 1** — the Project URL

1. In the left sidebar click the **gear icon (Project Settings)**.
2. Click **Data API** (on some dashboards this is called **API**).
3. Find **Project URL**. It looks like:

   ```
   https://abcdefghijklmnop.supabase.co
   ```

4. Copy it into your Notepad file, labelled **Value 1**.

#### C3. Collect **Value 2** — the public key, and **Value 3** — the secret key

Stay in **Project Settings**, and open **API Keys**.

You are looking for two keys:

- **Value 2 — the PUBLIC key.** Labelled **`anon` `public`**, or **Publishable key** on newer
  dashboards. It is safe to put inside apps that users can see.
- **Value 3 — the SECRET key.** Labelled **`service_role` `secret`**, or **Secret key** on newer
  dashboards. Click **Reveal** to see it.

> If your dashboard shows a section called **Legacy API keys**, prefer the keys in there — the long
> ones starting with `eyJ...`. They are the format this project was built and tested against.

Copy both into your Notepad file as **Value 2** and **Value 3**.

> ⚠️ **Value 3 is a master key to your entire database.** Never post it publicly, never put it in a
> chat message, never commit it to a public repository. In this project it only ever goes into
> server-side files.

#### C4. Collect **Value 4** — the database connection string

1. At the top of the Supabase dashboard, click the **Connect** button.
2. Choose the **Session pooler** option (not "Direct connection" — the direct one uses a newer
   internet addressing scheme that many home networks cannot reach, and it will simply fail).
3. Copy the string shown. It looks like this:

   ```
   postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

4. **Replace the `[YOUR-PASSWORD]` part (including the square brackets) with the database password you
   saved in step C1.** The finished value should look like:

   ```
   postgresql://postgres.abcdefghijklmnop:MySecretPass123@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
   ```

5. Save it as **Value 4**.

> **If your password contains symbols**, you must replace each symbol with its code before pasting:
>
> | Symbol | Replace with | | Symbol | Replace with |
> |---|---|---|---|---|
> | `@` | `%40` | | `/` | `%2F` |
> | `#` | `%23` | | `:` | `%3A` |
> | `?` | `%3F` | | `&` | `%26` |
> | `%` | `%25` | | space | `%20` |
>
> Example: the password `Pa@ss#1` becomes `Pa%40ss%231`. This is why letters-and-numbers passwords are
> strongly recommended.

#### C5. Turn off one setting (required)

New patients and new hospitals must be able to register instantly. By default the database sends a
confirmation email first, which would stall the whole demo.

1. In the left sidebar click **Authentication**.
2. Click **Sign In / Providers**.
3. Click **Email**.
4. Turn **"Confirm email" OFF**.
5. Click **Save**.

#### Your Notepad file should now look like this

```
Value 1 (Project URL)          https://abcdefghijklmnop.supabase.co
Value 2 (public key)           eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...
Value 3 (secret key)           eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M...
Value 4 (connection string)    postgresql://postgres.abcdefghijklmnop:MySecretPass123@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
```

---

### Part D — Paste the 4 values in

This is the most important part of the setup. **Take it slowly.**

Every settings file in this repository ships with a **placeholder** where a real value belongs.
Placeholders always start with `YOUR_`, so you can always find the ones you have missed by searching
the project for `YOUR_`. There are four of them:

| Placeholder you will see | Replace it with |
|---|---|
| `YOUR_PROJECT_REF` | the random-letters part of your Project URL, e.g. `abcdefghijklmnop` |
| `YOUR_DB_PASSWORD` | your database password from C1, symbols URL-encoded (see the table in C4) |
| `YOUR_REGION` | your pooler's region, e.g. `ap-southeast-1` — it is already in Value 4, so pasting Value 4 whole replaces this for you |
| `YOUR_SUPABASE_ANON_KEY` / `YOUR_SUPABASE_SERVICE_ROLE_KEY` | Value 2 and Value 3 respectively |

Usually you do not replace these one word at a time — you paste **Value 1 / 2 / 3 / 4 whole** over
the line that contains them, exactly as shown below.

#### The complete map (what goes where)

| # | File to edit | What goes in it |
|---|---|---|
| D1 | `appointmed_engine/.env` | Values 1, 2, 3 **and** 4 |
| D2 | `appointmed_hospital_adapter/.env` | Value 4 |
| D3 | `appointmed_website/src/lib/config.js` | Values 1 and 2 |
| D4 | `appointmed_mobile/lib/core/app_config.dart` | Values 1 and 2 *(only needed for the phone app)* |

**That is the whole list.** `appointmed_engine/.env` (D1) is the single source of truth for
everything that runs on the server side: the workflow engine itself, its test suite, and all the
`npm run db:...` commands in Part E read that one file. You do **not** need to edit
`scripts/config.mjs`, `appointmed_engine/src/config.ts` or `appointmed_hospital_adapter/src/config.ts`
at all.

Three rules that apply to every edit below:

1. **Replace only the value, keep everything else on the line exactly as it is** — the quote marks,
   the commas, the `=` sign.
2. **Never add spaces around the `=` sign** in a `.env` file, and **never put quotes** around a value
   in a `.env` file.
3. **Save the file** after each edit: **Ctrl + S** (Windows/Linux) or **Cmd + S** (macOS).

#### D0. First, create the two `.env` files

The two files in D1 and D2 do not exist yet — you create them by copying a template. Run these two
commands from inside the `AppointMed` folder:

**Windows (PowerShell):**
```
Copy-Item appointmed_engine\.env.example appointmed_engine\.env
Copy-Item appointmed_hospital_adapter\.env.example appointmed_hospital_adapter\.env
```

**macOS / Linux:**
```
cp appointmed_engine/.env.example appointmed_engine/.env
cp appointmed_hospital_adapter/.env.example appointmed_hospital_adapter/.env
```

> `.env` means "environment file". Files starting with a dot are hidden in some file browsers — use
> **File → Open File…** in the editor and type the name if you cannot see it in the list.

> **Why a copy, rather than editing the template?** `.env` is listed in `.gitignore`, so anything you
> put in it stays on your machine and can never be uploaded by accident. `.env.example` is the
> committed template and must keep its placeholders. Never put a real key in `.env.example`.

---

#### D1. `appointmed_engine/.env` — four lines

Open the file. Ignoring its comment lines (the ones starting with `#`), it contains:

```
PORT=8080
DATABASE_URL=postgresql://postgres.YOUR_PROJECT_REF:YOUR_DB_PASSWORD@aws-1-YOUR_REGION.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
ADAPTER_URL=http://localhost:8090
POSTBACK_SECRET=appointmed-postback-demo-secret
OLLAMA_URL=http://localhost:11434
MODEL_DEFAULT=gemma4:12b
MODEL_FALLBACK=qwen3.5:9b
```

Change **four** of those lines so they read:

```
DATABASE_URL=<paste Value 4 here>
SUPABASE_URL=<paste Value 1 here>
SUPABASE_ANON_KEY=<paste Value 2 here>
SUPABASE_SERVICE_ROLE_KEY=<paste Value 3 here>
```

A finished example (yours will have different letters):

```
DATABASE_URL=postgresql://postgres.abcdefghijklmnop:MySecretPass123@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiJ9.xxxxxxxxxxxxxxxxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoic2VydmljZV9yb2xlIn0.xxxxxxxxxxxxxxxxxxxx
```

**Leave every other line as it is.** They are already correct: the engine will look for the hospital
adapter on port 8090 and for your local AI model on port 11434.

> `POSTBACK_SECRET` is not one of your four values. It is a password the hospital adapter and the
> engine use to recognise each other, and both sides ship with the same demo value, so it already
> matches. If you ever run these two services anywhere other than your own machine, change it — in
> **both** `.env` files, to the same new value.

Save the file.

---

#### D2. `appointmed_hospital_adapter/.env` — one line

Open the file and change the `DATABASE_URL` line:

```
DATABASE_URL=<paste Value 4 here>
```

It must be the **same** connection string you used in D1. Leave every other line alone.

Save the file.

---

#### D3. `appointmed_website/src/lib/config.js` — two values

This is the hospital portal's settings file. Open it and find these two lines:

```js
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://YOUR_PROJECT_REF.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'YOUR_SUPABASE_ANON_KEY'
```

Change the text **between the single quotes** — Value 1 on the first, Value 2 on the second:

```js
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://abcdefghijklmnop.supabase.co'
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiJ9.xxxxxxxxxxxxxxxxxxxx'
```

> ⚠️ This file goes into a web page that anyone can view. **Use Value 2 (public), never Value 3
> (secret).**

**Do not touch the `ENGINE_URL` and `ADAPTER_URL` lines below.** Save the file.

> **Alternative, if you would rather not edit source code:** copy
> `appointmed_website/.env.example` to `appointmed_website/.env.local` and put Value 1 and Value 2
> there instead. That file is git-ignored, and its values win over the ones in `config.js`.

---

#### D4. `appointmed_mobile/lib/core/app_config.dart` — two values

This is the patient app's settings file. Skip this step if you are not building the phone app in
Part G; nothing else depends on it.

Find these two blocks and change the text inside `defaultValue:` — Value 1 on the first, Value 2 on
the second. Keep the quotes, the commas and the closing `);`.

```dart
  static const String supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://abcdefghijklmnop.supabase.co',
  );
  static const String supabaseAnonKey = String.fromEnvironment(
    'SUPABASE_ANON_KEY',
    defaultValue: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFiY2RlZmdoaWprbG1ub3AiLCJyb2xlIjoiYW5vbiJ9.xxxxxxxxxxxxxxxxxxxx',
  );
```

> ⚠️ This key is compiled into the app that users install. **Use Value 2 (public), never Value 3
> (secret).**

**Do not touch anything below those two blocks.** Save the file.

> **Alternative:** leave the file alone and pass the values at launch instead:
> `flutter run --dart-define=SUPABASE_URL=... --dart-define=SUPABASE_ANON_KEY=...`

---

#### D5. Check your work

From inside the `AppointMed` folder, run:

```
npm run db:check
```

- **`OK postgresql://...`** — D1 is correct and your database is reachable. Move on to Part E.
- **`✗ Not configured: ... still holds a placeholder value`** — `appointmed_engine/.env` was not
  saved, or a `YOUR_...` value is still in it. Redo D1.
- **`FAIL ... ENOTFOUND`** — the connection string is reachable-looking but wrong. The usual causes
  are using "Direct connection" instead of **Session pooler**, or a password symbol that was not
  URL-encoded (see the table in C4).

To find any placeholder you missed anywhere in the project, search the folder for `YOUR_` in your
editor (**Ctrl + Shift + F** in VS Code). Matches inside `.env.example` files and inside `README.md`
are expected and correct — those are the templates. A match anywhere else is a step you still owe.

> **A note on the model name.** If your computer struggles with the 12-billion-parameter model,
> change `MODEL_DEFAULT=` in `appointmed_engine/.env` to any model you have downloaded with
> `ollama pull`. That is a preference, not a placeholder. One stage needs a separate look: uploaded
> photos are described by the `attachment` stage, which reads `MODEL_ATTACHMENT` (falling back to
> `MODEL_DEFAULT` when unset) and **must** stay vision-capable. If the lighter model you switch to
> cannot read images, uncomment `MODEL_ATTACHMENT=` in `.env.example` and point it at a vision model
> you do have — otherwise the primary model still answers instead of failing. A JSON-schema-constrained
> reply only guarantees the *shape* of `{observation}`, never its truth, so a non-vision model will
> return a confident, fabricated description of a photo it never saw — not an honest "not analysed."

---

### Part E — Build the database

Make sure your terminal is inside the `AppointMed` folder (Part B, step 4).

#### E1. Download the project's building blocks

Run these four commands **one at a time**, waiting for each to finish. Each prints a lot of text —
that is normal. Together they take about 5 minutes.

```
npm install
```
```
npm install --prefix appointmed_engine
```
```
npm install --prefix appointmed_hospital_adapter
```
```
npm install --prefix appointmed_website
```

> Warnings in yellow are fine. Only red **`ERR!`** lines mean something failed.

#### E2. Check the database connection

```
npm run db:check
```

**What success looks like:**

```
OK  postgresql://postgres.abcdefghijklmnop:****@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres
    database=postgres
    PostgreSQL 15.x ...
```

If instead you see `FAIL` on every line, stop and fix it before continuing — see
[§8](#8-if-something-goes-wrong). Ninety percent of the time it is one of two things: the password in
Value 4 is wrong, or a symbol in the password was not encoded.

#### E3. Create the tables

```
npm run db:push
```

This creates 12 tables, the security rules, the two private storage buckets and the sign-up trigger.

#### E4. Fill in the demo data

```
npm run db:seed
```

This adds 6 Malaysian hospitals, 20 specialists, one API key each, appointment slots for the next
7 days, and two demo login accounts.

> **Re-run this command any time.** It is safe to repeat, and it refreshes the appointment slots so
> they are always in the future. If the demo ever shows "no slots available", run it again.

#### E5. Confirm everything is in place

```
npm run db:verify
```

**What success looks like:**

```
tables:  12/12
buckets: 2/2 medical-files, verification-docs
trigger on_auth_user_created: present
```

If you see `12/12`, your database is ready.

---

### Part F — Start everything

One command starts all three services at once:

```
npm run dev
```

**What success looks like** (after about 10 seconds):

```
✓ Ollama ready (gemma4:12b)
[adapter] appointmed-hospital-adapter listening on :8090
[engine] appointmed-engine listening on :8080 (ollama: http://localhost:11434, adapter: http://localhost:8090)
[web] ➜  Local:   http://localhost:5173/
──────────────────────────────────────────────────────
 AppointMed demo stack
   Engine   http://localhost:8080/health
   Adapter  http://localhost:8090/health
   Portal   http://localhost:5173
   ...
──────────────────────────────────────────────────────
```

Now check each piece in your browser:

| Open this address | You should see |
|---|---|
| <http://localhost:8080/health> | `{"status":"ok","service":"appointmed-engine"}` |
| <http://localhost:8090/health> | `{"status":"ok","service":"appointmed-hospital-adapter"}` |
| <http://localhost:5173> | The AppointMed hospital portal home page |
| <http://localhost:11434> | `Ollama is running` |

**Leave this terminal window open** — closing it stops everything. To stop the system on purpose,
click in that window and press **Ctrl + C**.

If you need to type other commands while the system runs, **open a second terminal window** and `cd`
into the project folder again.

> If it says a port is already in use, another program is holding 8080, 8090 or 5173 — the message
> names it. Close that program and run `npm run dev` again.

---

### Part G — *(Optional)* Start the patient app

The hospital side works without this. But to see the *whole* story — patient chat, live status flip,
notifications — you need the Flutter app.

#### G1. Install Flutter

1. Open <https://docs.flutter.dev/get-started/install>, pick your operating system, and follow the
   page exactly. It will ask you to download a ZIP and add it to your system PATH.
2. Close and reopen the terminal, then check it:

   ```
   flutter --version
   ```

3. Run Flutter's own health check and fix anything it marks with a red ✗ that is relevant to how you
   plan to run the app:

   ```
   flutter doctor
   ```

#### G2. Easiest way to run it — in the Chrome browser

Open a **second** terminal window (leave `npm run dev` running in the first), then:

**Windows:**
```
cd $HOME\Downloads\AppointMed\appointmed_mobile
```
**macOS / Linux:**
```
cd ~/Downloads/AppointMed/appointmed_mobile
```

Then run these three commands in order:

```
flutter create . --platforms=web
```
```
flutter pub get
```
```
flutter run -d chrome
```

A Chrome window opens with the patient app inside it. It reaches the engine at `localhost:8080`
automatically.

> The first command adds browser support to the app folder, which this project does not ship
> pre-built. You only ever need to run it once.

#### G3. Alternative — run it on an Android emulator

If you prefer a phone-shaped experience, install **Android Studio**, create a virtual device inside
it, start that device, then from the `appointmed_mobile` folder run:

```
flutter pub get
```
```
flutter run
```

The emulator reaches the engine on your computer automatically — the app already knows to use
`10.0.2.2:8080` on Android, which is how an emulator refers to its host machine.

---

### Part H — Log in

Seeding created two accounts for you. Both use the password `AppointMed!2026`.

| Where | Email | Password |
|---|---|---|
| Hospital portal (<http://localhost:5173>) | `manager@appointmed.demo` | `AppointMed!2026` |
| Patient app | `patient@appointmed.demo` | `AppointMed!2026` |

The manager account belongs to **KL Medical Center**. Now go to
[§7 — Try the whole thing](#7-try-the-whole-thing-demo-walkthrough).

---

## 7. Try the whole thing (demo walkthrough)

Nothing below is a fake screen. Every step hits a running service and your live database.

1. **Subscribe a brand-new hospital.** Go to <http://localhost:5173> and click **Register**. Pick a
   plan (Starter RM 500 / Growth RM 1,200 / Enterprise RM 2,500 per month, all plus 3% per booking),
   fill in the hospital and manager details, enter any card details at the simulated payment step, and
   submit.

2. **Watch it activate instantly.** In one transaction — with clean-up on every failure path — the
   system creates the hospital, a manager login, the subscription, a live API key, and three starter
   specialists with half-hour slots across the next six working days. The success screen signs you in.

3. **See the API key.** Go to **Integration → API Key**. The **Documentation** tab describes the same
   REST endpoints a real hospital would integrate against, and the **API Tester** tab calls those
   endpoints live with your new key. The portal has no special back channel — it is a customer of the
   same public API.

4. **It is immediately bookable.** Holding an active API key *is* the condition the matcher uses to
   build its candidate list. Nothing was wired by hand.

5. **Consult as a patient.** In the patient app, sign in as `patient@appointmed.demo` and open
   **AI Chat**. Describe a symptom in your own words — try *"I've had a tight, heavy feeling in my
   chest when I climb stairs for about two weeks"* — and attach a photo or PDF if you like. Intake
   pulls out the typed fields and asks targeted follow-ups about whatever is still missing.

6. **Triage verdict.** Once all six fields are known, the specialty, urgency and explanation come back
   in the same turn — the patient sees one continuous reply: verdict, disclaimer, and the first
   booking question.

7. **Preferences, conversationally.** Give a budget, a preferred hospital (or none) and a time of day.
   No form.

8. **Watch it adapt.** The engine searches every subscribed hospital under those constraints. Give it
   a deliberately tight budget or an awkward time so nothing matches: the model then picks **one**
   constraint to relax, says which and why, and searches again — up to three times before a friendly
   give-up that leaves the consultation alive.

9. **Book.** Pick a slot. The engine reserves it at the hospital under a row lock and creates a
   `pending` appointment, persisting the case report and priority that were already generated one
   step earlier, at triage (step 6) — booking itself makes no AI call.

10. **The request appears.** In the portal go to **Requests**. The new request shows the AI case
    report and a HIGH / MEDIUM / LOW badge — open it for the full clinical report and any uploaded
    files — with Confirm, Decline and Reschedule buttons. It arrived over a realtime connection — no
    refresh needed.

11. **Confirm it.** The portal calls the hospital adapter with the hospital's own API key. The adapter
    calls back into the engine, which completes the run.

12. **The patient's screen flips live.** The status goes `pending → confirmed` and a notification
    arrives, with no refresh and no polling. Try **Decline** instead on another run: the consultation
    goes back to matching with that hospital excluded from the search.

13. **Read the audit trail.** Every decision, tool call, transition, error and fallback is a row in the
    workflow step log, with the model name and the milliseconds each AI call took. It is readable only
    with a patient's own access token — it is not an anonymous endpoint:

    ```
    curl -H "Authorization: Bearer <patient access token>" http://localhost:8080/runs/<runId>/steps
    ```

    You can also open the **Table Editor** in your Supabase dashboard and look at `workflow_steps`
    directly.

14. **Optional — pull the AI out and watch the collapse.** Stop Ollama (or change `OLLAMA_URL` on line
    7 of `appointmed_engine/.env` to a dead port, e.g. `http://localhost:1`) and restart with
    `npm run dev`. Send two consultation messages. Nothing crashes — but **0 of 6** symptom fields are
    captured, only fallback entries appear in the log, and the consultation never leaves the first
    stage. No triage, no matching, no booking. Start Ollama again and the **same** consultation
    continues from where it stopped, because the state lived in the database the whole time.

---

## 8. If something goes wrong

| What you see | What it means | How to fix it |
|---|---|---|
| `'node' is not recognized` / `command not found: node` | Node.js is not installed, or you are using an old terminal window | Reinstall Node.js (A1), then **close and reopen** the terminal |
| `npm run db:check` shows `FAIL` with `password authentication failed` | Value 4 has the wrong password, or a symbol in it was not encoded | Rebuild Value 4 in Part C4; encode symbols using the table there |
| `npm run db:check` shows `FAIL` with `ENOTFOUND` | You used the **Direct connection** string instead of the **Session pooler** one | Go back to C4 and copy the **Session pooler** string |
| `✗ Not configured: … still holds a placeholder value` | A `YOUR_...` placeholder survived in `appointmed_engine/.env` | Redo D1, then re-check with `npm run db:check` (D5) |
| `db:seed` fails with an auth error but `db:check` said OK | `SUPABASE_URL` or `SUPABASE_SERVICE_ROLE_KEY` in `appointmed_engine/.env` is wrong | Redo D1 — the seed needs Value 1 and Value 3, not just the connection string |
| `⚠ Ollama not reachable` | The AI server is not running | Run `ollama serve` in its own terminal, or reopen the Ollama app; check <http://localhost:11434> |
| `⚠ Ollama is up but gemma4:12b is missing` | The model was never downloaded, or the download was interrupted | Run `ollama pull gemma4:12b` again and wait for it to finish |
| `Cannot start the demo stack - port(s) already occupied` | Something else is using 8080, 8090 or 5173 | The message names the program holding it — close that program and re-run `npm run dev` |
| The AI's first reply takes ~45 seconds | Normal — the model is loading into memory the first time | Wait. Later replies take 5–12 seconds |
| Sign-up says "check your email" and nothing happens | Email confirmation is still switched on | Redo C5 — turn **"Confirm email" OFF** |
| The portal loads but shows no data, or login fails | The public key or Project URL in `appointmed_website/src/lib/config.js` is wrong | Redo D3, and make sure you used **Value 2**, not Value 3 |
| "No slots available" for every search | The seeded appointment slots have rolled into the past | Run `npm run db:seed` again |
| The patient app cannot reach the engine | `npm run dev` is not running, or you closed its window | Start it again from the project folder |
| An edit "broke" a file | An invisible character or a lost quote mark | Undo with **Ctrl + Z** until it looks like the original, then redo the edit carefully |

---

## 9. Running the tests

Each gate runs from the folder shown. The engine's AI calls are stubbed in its test suite, so the
tests are deterministic and need **no** model running.

| Component | Where to run it | Command | Expected |
|---|---|---|---|
| Database | project root | `npm run db:verify` | `tables: 12/12`, `buckets: 2/2`, trigger present |
| Database security | project root | `npm run test:rls` | 13 pass / 0 fail |
| Workflow engine | `appointmed_engine/` | `npm run typecheck` then `npm test` | clean typecheck; 82 tests across 14 files |
| Hospital adapter | `appointmed_hospital_adapter/` | `npm run typecheck` then `npm test` | clean typecheck; 37 tests across 6 files |
| Patient app | `appointmed_mobile/` | `flutter analyze` then `flutter test` | 0 errors / 0 warnings; 8 tests pass |
| Hospital portal | `appointmed_website/` | `npm run lint` then `npm run build` | no lint errors; build succeeds |

The workflow engine total above includes coverage added for the case report and attachments
feature:

| Behaviour proven | Test |
|---|---|
| Case report generated at triage, model path | `appointmed_engine/test/triage.test.ts` |
| Case report falls back when the model is unreachable | `appointmed_engine/test/triage.test.ts` |
| Report shaping and fallback template (no DB needed) | `appointmed_engine/test/report.test.ts` |
| Uploaded image described by the attachment stage | `appointmed_engine/test/upload.test.ts` |
| Scanned PDF skips the model; corrupt PDF is not a 500 | `appointmed_engine/test/upload.test.ts` |
| Report and path-free attachment manifest persisted at booking | `appointmed_engine/test/booking.test.ts` |
| Manager attachment access: tenancy, window, audit | `appointmed_engine/test/portal-attachments.test.ts` |

Notes:

- Both Node test suites run against the **live** database and run their files one at a time — run one
  component at a time, not both at once.
- **All five gates need Part D done first.** The suites read the same `.env` files the services do,
  so no extra setup is required — but a suite run against unfilled placeholders stops immediately
  with `... is not configured: ... still holds a placeholder value`, naming the file to fix.
  `npm test` in `appointmed_engine/` additionally needs `SUPABASE_ANON_KEY` (Value 2) present in
  `appointmed_engine/.env`; it uses it to sign its fixture patient in.
- `flutter analyze` **exits with a non-zero code** even when it reports 0 errors and 0 warnings,
  because information-level style hints remain. Read the severity breakdown before treating that as a
  failure.
- There is no test runner configured for the hospital portal — lint and build are its only checks.

---

## 10. Business model

Three revenue streams, one implemented end to end.

| Stream | Detail | Status |
|---|---|---|
| **Hospital subscription** | Starter **RM 500**/mo (≤5 specialists) · Growth **RM 1,200**/mo (≤20) · Enterprise **RM 2,500**/mo (unlimited) | **Built** — self-serve, provisioned in one transaction with an API key issued at the end |
| **Transaction fee** | **3%** of each booking's consultation price | Rate is published and stored per subscription — **billing is not implemented**; no code charges it |
| **Patient Premium** | RM 19.90/mo consumer tier | **Not built** — no patient-side paid features exist in this repository |

### Unit economics (per hospital, per month)

| Line | | Amount |
|---|---|---|
| Subscription | blended average across tiers | RM 1,000 |
| Bookings | | 150 |
| Transaction revenue | 3% of consultation value | RM 750 |
| **Revenue** | RM 1,000 + RM 750 | **RM 1,750** |
| Cost to serve | | (RM 200) |
| **Gross profit** | RM 1,750 − RM 200 | **RM 1,550** |
| Hospital acquisition cost | one-off | RM 5,000 |

```
payback = acquisition cost ÷ monthly gross profit
        = RM 5,000 ÷ RM 1,550
        = 3.2258…  ≈ 3.2 months
```

### What is actually defensible

Not "AI symptom triage" on its own — patient-facing generative-AI triage already ships in this market,
including a Malaysian product trained on local clinical practice guidelines and deployed across
hundreds of government clinics. Any pitch resting on triage alone does not survive contact with that.

What no researched competitor holds end to end is the **agentic chain across parties**: understand an
unstructured complaint, decide a specialty and urgency, search *multiple competing hospitals* under
the patient's own budget and time constraints, ask a human at the hospital to accept or refuse, carry
that answer back — with every step logged and replayable. Paired with a **self-serve subscription that
issues a working API key in one transaction**, in a market where every incumbent provider surface sits
behind a sales conversation, that is a two-sided network which is cheap to enter: hospitals join
without a salesperson, each new hospital widens the slot pool, and a wider pool is worth more to
patients.

The honest limit: the hospital side here is a faithful *simulated* hospital system with a real API
surface, not a live integration with a hospital's information system.

---

## 11. What is in each folder

| Path | What it holds |
|---|---|
| `appointmed_engine/` | The workflow engine — the state machine, the five AI decision stages, the audit log, the consult and portal APIs |
| `appointmed_hospital_adapter/` | The simulated hospital system — specialists, slots, row-locked booking, manager decisions, callbacks |
| `appointmed_website/` | The React hospital portal — subscription, the manager decision queue, API key management, API tester |
| `appointmed_mobile/` | The Flutter patient app — chat, appointments, notifications, profile |
| `supabase/` | Database migrations, the demo seed data, and the row-security test suite |
| `scripts/` | Setup and operations commands: connection check, migrate, seed, verify, and the one-command launcher |

### A note on credentials

**No credential is committed to this repository.** Every settings file carries a `YOUR_...`
placeholder instead, and each component refuses to start while one survives, naming the file to fix.
You supply your own values in [Part D](#part-d--paste-the-4-values-in). Where each component reads
them from:

| Component | Reads its values from | In git? |
|---|---|---|
| Workflow engine, its tests, and every `npm run db:*` command | `appointmed_engine/.env` | no — git-ignored |
| Hospital adapter and its tests | `appointmed_hospital_adapter/.env` | no — git-ignored |
| Hospital portal | `src/lib/config.js` literals, or `VITE_SUPABASE_*` in `.env.local` | the literals are, so **only the public key belongs there** |
| Patient app | `lib/core/app_config.dart` literals, or `--dart-define` at build time | same — **public key only** |

The `.env.example` files are committed templates. They contain placeholders and must keep doing so;
put real values only in the `.env` copy you make in D0.

The shape is production-correct — privileged keys server-side only, public key client-side, database
row security carrying the isolation — and both Node services are fully environment-driven, so their
privileged values swap without a code change. The honest limitation: the client-side public key is
compiled into both apps, so rotating it means rebuilding and reshipping them. A real deployment would
inject all of these as managed secrets.

**If you fork this and push it anywhere public:** keep real keys out of the four files above, and if
one ever does get committed, rotate it in the Supabase dashboard rather than only deleting it —
anything that has been pushed should be treated as public from that moment, including in git history.
