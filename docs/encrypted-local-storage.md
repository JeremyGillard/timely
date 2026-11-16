# Encrypted local storage

## Goal

Timely keeps every timesheet record **on the user's device only**: no account, no server, no sync service. That data is personal (when someone works, how much, and what they note down), so it must be **encrypted at rest** in browser storage and only **decrypted after the user proves it's them**, typically with a passkey (WebAuthn: Face ID, Touch ID, Windows Hello, device PIN).

Security must not cost usability: tracking time has to stay a **one-tap** action, and unlocking a **single biometric prompt**.

## Principles

1. **Local-first.** Data lives in the browser (OPFS / IndexedDB). Nothing leaves the device unless the user explicitly exports it.
2. **Never stored in plaintext.** Everything persisted is ciphertext. Plaintext only exists in memory while the app is unlocked.
3. **Unlock with what the device already has.** A passkey with biometrics is the main path, with no password to remember. Biometric data is never seen by the app (it stays in the OS authenticator), which also keeps us out of GDPR biometric-data scope.
4. **Tracking never prompts.** Starting, splitting or stopping a time window must work without unlocking (see "Write without unlocking").
5. **No lock-in, no data loss.** There's always a recovery path (recovery key / passphrase) and an encrypted export.

## Threat model

| Protects against                                      | Does **not** protect against                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Lost or stolen device (disk / browser profile copied) | Malicious script running in the page while unlocked (XSS): mitigated by a strict CSP and no third-party scripts |
| Other OS users or apps reading browser storage        | A fully compromised device / OS / browser                                                                       |
| Casual access to an unlocked phone after auto-lock    | The user sharing their device unlock with someone else                                                          |
| Backups or forensic copies of browser data            | Losing every passkey **and** the recovery key (data is unrecoverable by design)                                 |

## Design

### Keys

```
passkey ──WebAuthn PRF(salt)──▶ 32-byte secret ──HKDF──▶ KEK (AES-GCM, wrap/unwrap only)
                                                          │
recovery passphrase ──Argon2id/PBKDF2──▶ KEK' ────────────┤ each wraps the same DEK
                                                          ▼
                                   DEK (AES-GCM-256, random) ──▶ encrypts records
```

- **DEK** (data encryption key): random, encrypts all records. Never stored in plaintext.
- **KEK** per unlock method: derived from the passkey via the WebAuthn **PRF extension**, or from a recovery passphrase. Each KEK stores its own _wrapped_ copy of the DEK, so passkeys can be added or removed without re-encrypting the data.
- In memory, keys are **non-extractable** `CryptoKey`s, dropped on lock.
- AES-GCM with a fresh random 96-bit IV for every write.

### Storage

- Encrypted records in **OPFS** (or IndexedDB), plus a small plaintext metadata file: PRF salt, credential IDs and wrapped DEKs. None of it is secret.
- Optional encrypted export / import file for backups and device moves.

### Write without unlocking

To keep tracking one-tap, new records are encrypted with a **public key** instead of the DEK:

- On setup, generate an ECDH key pair. The public key is stored in plaintext; the private key is encrypted with the DEK.
- Each new time window is sealed to the public key (ECDH + HKDF + AES-GCM, HPKE-style). Anyone can _write_, only the unlocked app can _read_.
- On unlock, pending sealed records are decrypted and merged into the main encrypted store.

### Unlock UX

- **One prompt** to unlock: tap "Unlock", Face ID, done. WebAuthn requires a user gesture, so there's no auto-prompt on page load.
- **Session unlock** with auto-lock after inactivity (e.g. 5 min) and when the app goes to the background for a while.
- **Fallback:** if the authenticator doesn't support PRF, offer a passphrase. Always offer a recovery key at setup.
- Clear copy: "Your data is encrypted on this device. Only you can unlock it."

## Constraints

- WebAuthn and OPFS need a **secure context** (HTTPS, or `localhost`) and a real domain. IP addresses are rejected as passkey relying-party IDs.
- Passkeys are bound to the domain. On GitHub Pages that's `jeremygillard.github.io` (shared by all Pages sites on the account); a custom domain would isolate Timely.
- PRF support: Chrome/Edge, Safari 18+ (iOS 18 / macOS 15) with iCloud Keychain passkeys, Android with Google Password Manager. Firefox support is newer and varies by authenticator. Feature-detect and fall back to a passphrase.
- On iOS, a home-screen web app has **separate storage** from Safari, so each needs its own setup or an import.
- Browsers may evict storage under pressure, so request `navigator.storage.persist()` and keep exports.

## Status

- **Prototype done:** `app/utils/vault.ts` + `app/composables/useVault.ts` implement passkey creation with PRF, KEK derivation, DEK wrapping and AES-GCM read/write in OPFS. The `/vault` test page has been removed; the code is kept as the reference implementation.
- **Not yet encrypted:** time windows are currently saved in plain `localStorage` (`timesheet-windows`, see `app/composables/useTimeWindows.ts`).

### Next steps

1. Write-only sealing of new time windows (public key), so tracking never prompts.
2. Move storage to the encrypted OPFS vault; migrate existing `localStorage` data, then delete it.
3. Unlock flow in the UI (Week / Stats need the data; Track only needs write access).
4. Recovery key at setup, extra passkeys, passphrase fallback.
5. Encrypted export / import.
6. Strict CSP for production builds.
