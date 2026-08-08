# Repository Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current mixed development workspace into a safe Git repository and publish only project source, tests, and documentation to `Hatori-Kanon/Xtoys_universal_haptic_bridge`.

**Architecture:** Use a root allowlist-style `.gitignore` so complete game installations, archives, logs, generated binaries, and experiments remain local. Track `src/`, `tests/`, and `docs/` plus repository metadata, verify the exact Git index and secret scan, then create the initial `main` commit and push it to the empty GitHub repository.

**Tech Stack:** Git, PowerShell, .NET 6 validation projects, UE4SS Lua validation scripts, GitHub HTTPS remote.

## Global Constraints

- Do not delete local game files or development artifacts.
- Do not track complete game directories, archives, logs, `bin/`, `obj/`, runtime payloads, or user-specific configuration.
- Do not commit a populated XToys webhook ID or authentication secret.
- Publish to `https://github.com/Hatori-Kanon/Xtoys_universal_haptic_bridge.git` on `main`.

---

### Task 1: Define the repository boundary

**Files:**
- Create: `.gitignore`
- Create: `.gitattributes`
- Create: `README.md`

**Interfaces:**
- Consumes: Existing `src/`, `tests/`, and `docs/` trees.
- Produces: An explicit version-control allowlist and a public repository overview.

- [ ] **Step 1: Add an allowlist-style `.gitignore`**

Ignore every root item by default, re-include `.gitignore`, `.gitattributes`, `README.md`, `src/`, `tests/`, and `docs/`, then exclude nested `bin/`, `obj/`, logs, payload captures, user configuration, archives, and compiled binaries.

- [ ] **Step 2: Add line-ending policy**

Use LF for source and documentation while retaining CRLF for PowerShell and Windows batch files.

- [ ] **Step 3: Add the repository README**

Describe the universal bridge goal, current design status, tracked legacy adapters, safety boundary, and links to the approved specification.

- [ ] **Step 4: Validate the candidate file set**

Run:

```powershell
git status --short --untracked-files=all
git check-ignore -v UE4SS_v3.0.1-998-g32d8a381.zip logs src/ArunaProbe.External/bin/Debug/net6.0/XtoysArunaExternalProbe.exe
```

Expected: only repository metadata, `src/`, `tests/`, and `docs/` are candidates; all three sample artifacts are ignored.

### Task 2: Initialize and publish the repository

**Files:**
- Modify: `.git/` repository metadata

**Interfaces:**
- Consumes: The validated candidate file set from Task 1.
- Produces: Initial `main` commit on `Hatori-Kanon/Xtoys_universal_haptic_bridge`.

- [ ] **Step 1: Initialize Git and set the remote**

Run:

```powershell
git init -b main
git remote add origin https://github.com/Hatori-Kanon/Xtoys_universal_haptic_bridge.git
```

- [ ] **Step 2: Stage only intended files**

Run:

```powershell
git add .gitignore .gitattributes README.md src tests docs
git status --short
```

Expected: no game installation, archive, build output, log, payload capture, or local configuration is staged.

- [ ] **Step 3: Run validation**

Run the available PowerShell validators and .NET core test project. Scan staged content for secrets and verify no staged file exceeds GitHub's 100 MiB limit.

- [ ] **Step 4: Create the initial commit**

Run:

```powershell
git commit -m "Initial project import"
```

- [ ] **Step 5: Push and verify the remote state**

Run:

```powershell
git push -u origin main
git status -sb
git ls-remote --heads origin main
```

Expected: local `main` tracks `origin/main`, the working tree is clean, and the remote reports the pushed commit.
