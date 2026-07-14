---
name: Encrypting existing plaintext DB columns without a schema change
description: Pattern for retrofitting encryption onto plaintext credential columns (e.g. shared third-party login username/password) reusing an existing AES-256-GCM vault.
---

When a table already has plaintext `username`/`password` (or similar) text columns and you need to encrypt them at rest without breaking existing read/write paths:

- Keep the columns as `text` — store ciphertext in the same column, no schema/migration needed. Ciphertext format `iv:authTag:data` (all hex) is easy to detect with a regex, which lets you distinguish "already encrypted" from "legacy plaintext, not yet migrated" on every read.
- Reuse the existing encryption vault (don't build a second AES implementation) but derive a **distinct labeled sub-key** from the same master secret (e.g. `sha256(label + ":" + ENCRYPTION_KEY)`) so this column family's ciphertexts are cryptographically independent from other vault-encrypted data — rotating one label never breaks the other.
- Run a one-time, idempotent boot-time migration that scans the table and encrypts any value that doesn't match the ciphertext pattern. Safe to run on every startup.
- Every decrypt call site must degrade gracefully (log + return null) rather than throw — a corrupt/foreign row, or a since-rotated ephemeral key (see below), must not crash a request.

**Admin API masking + edit-without-clobbering:** when an admin CRUD UI both displays and edits these fields in the same plain-text `<input>` (no separate "view" vs "edit" mode), you can add masking without any frontend rewrite:
- GET responses return `maskSecret(decrypted)` (bullets + last 4 chars) instead of plaintext.
- PUT accepts the field back; if the submitted value **starts with the mask bullet character**, treat it as "admin didn't touch this field" and skip re-encrypting/overwriting — otherwise encrypt whatever was submitted as a genuine new value. This works because the masked GET value round-trips through the form's initial state and is only overwritten if the admin actually retypes it.

**Why:** matches the existing System Configuration Centre vault pattern (`secretsVault.ts` in this project) and avoids a UX rewrite for the admin panel while still satisfying "no plaintext credential ever returned in an API response."

**Gotcha:** if there's no durable `ENCRYPTION_KEY` set, the vault falls back to a random process-local key with a startup warning (accepted tradeoff already used for other secrets in this project). Anything encrypted under that ephemeral key becomes silently undecryptable after the next restart — this is expected/logged, not a bug, but confirm this tradeoff is already accepted elsewhere in the codebase before reusing it for a new column family.
