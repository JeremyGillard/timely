// Encrypted OPFS vault unlocked by a passkey (WebAuthn PRF extension).
//
// Layout in OPFS (directory "vault"):
//   meta.json  plaintext: PRF salt + per-passkey wrapped data key
//   data.enc   12-byte IV || AES-GCM ciphertext of the JSON payload
//
// Key hierarchy:
//   passkey --PRF(salt)--> 32B secret --HKDF--> KEK (AES-GCM, wrap only)
//   KEK wraps a random DEK (AES-GCM 256) which encrypts data.enc

const DIR = "vault";
const META = "meta.json";
const DATA = "data.enc";
const HKDF_INFO = new TextEncoder().encode("timesheet-vault-kek-v1");

type Bytes = Uint8Array<ArrayBuffer>;

export interface VaultCredential {
  id: string; // base64url credential id
  wrappedKey: string; // base64url
  iv: string; // base64url
  createdAt: string;
}

export interface VaultMeta {
  version: 1;
  salt: string; // base64url, PRF eval input
  credentials: VaultCredential[];
}

export class VaultError extends Error {}

// ---------- encoding ----------

const b64u = (buf: ArrayBuffer | Bytes): string => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromB64u = (s: string): Bytes => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

const random = (n: number): Bytes => crypto.getRandomValues(new Uint8Array(n));

// ---------- OPFS ----------

const dir = async () =>
  (await navigator.storage.getDirectory()).getDirectoryHandle(DIR, { create: true });

async function readFile(name: string): Promise<ArrayBuffer | null> {
  try {
    const fh = await (await dir()).getFileHandle(name);
    return await (await fh.getFile()).arrayBuffer();
  } catch (e) {
    if (e instanceof DOMException && e.name === "NotFoundError") return null;
    throw e;
  }
}

async function writeFile(name: string, data: BufferSource | string) {
  const fh = await (await dir()).getFileHandle(name, { create: true });
  const w = await fh.createWritable();
  await w.write(data);
  await w.close();
}

export async function readMeta(): Promise<VaultMeta | null> {
  const buf = await readFile(META);
  return buf ? (JSON.parse(new TextDecoder().decode(buf)) as VaultMeta) : null;
}

const writeMeta = (meta: VaultMeta) => writeFile(META, JSON.stringify(meta, null, 2));

export async function destroyVault() {
  await (await navigator.storage.getDirectory()).removeEntry(DIR, { recursive: true });
}

// ---------- WebAuthn PRF ----------

export function isSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    "PublicKeyCredential" in window &&
    "storage" in navigator &&
    "getDirectory" in navigator.storage
  );
}

async function prfAssert(
  salt: Bytes,
  credentialIds: string[],
): Promise<{ id: string; secret: ArrayBuffer }> {
  const cred = (await navigator.credentials.get({
    publicKey: {
      // Local-only use: no server verifies this assertion, we only want the PRF output.
      challenge: random(32),
      allowCredentials: credentialIds.map((id) => ({ type: "public-key", id: fromB64u(id) })),
      userVerification: "required",
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new VaultError("Passkey prompt cancelled");
  const secret = cred.getClientExtensionResults().prf?.results?.first;
  if (!secret)
    throw new VaultError("This passkey/authenticator does not support the PRF extension");
  return { id: b64u(cred.rawId), secret: secret as ArrayBuffer };
}

async function kekFromSecret(secret: ArrayBuffer): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(), info: HKDF_INFO },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["wrapKey", "unwrapKey"],
  );
}

// ---------- vault lifecycle ----------

/** Registers a new passkey, creates the vault and returns the unlocked data key. */
export async function createVault(userName: string): Promise<CryptoKey> {
  const salt = random(32);
  const created = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "Timely" },
      user: { id: random(16), name: userName, displayName: userName },
      challenge: random(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 }, // ES256
        { type: "public-key", alg: -257 }, // RS256
      ],
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  if (!created) throw new VaultError("Passkey creation cancelled");

  const prf = created.getClientExtensionResults().prf;
  if (prf?.enabled === false)
    throw new VaultError("This authenticator does not support the PRF extension");

  const id = b64u(created.rawId);
  // Some platforms only return PRF output on assertion, not on creation.
  const secret =
    (prf?.results?.first as ArrayBuffer | undefined) ?? (await prfAssert(salt, [id])).secret;
  const kek = await kekFromSecret(secret);

  // DEK is extractable only long enough to be wrapped, then re-imported non-extractable via unwrap.
  const dek = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ]);
  const iv = random(12);
  const wrapped = await crypto.subtle.wrapKey("raw", dek, kek, { name: "AES-GCM", iv });

  await writeMeta({
    version: 1,
    salt: b64u(salt),
    credentials: [
      { id, wrappedKey: b64u(wrapped), iv: b64u(iv), createdAt: new Date().toISOString() },
    ],
  });

  const key = await unwrap(kek, { wrappedKey: b64u(wrapped), iv: b64u(iv) });
  await writeData(key, []);
  return key;
}

const unwrap = (kek: CryptoKey, c: Pick<VaultCredential, "wrappedKey" | "iv">) =>
  crypto.subtle.unwrapKey(
    "raw",
    fromB64u(c.wrappedKey),
    kek,
    { name: "AES-GCM", iv: fromB64u(c.iv) },
    { name: "AES-GCM", length: 256 },
    false, // non-extractable in memory
    ["encrypt", "decrypt"],
  );

/** Prompts for a passkey and returns the unlocked data key. */
export async function unlockVault(meta: VaultMeta): Promise<CryptoKey> {
  const { id, secret } = await prfAssert(
    fromB64u(meta.salt),
    meta.credentials.map((c) => c.id),
  );
  const entry = meta.credentials.find((c) => c.id === id);
  if (!entry) throw new VaultError("Unknown passkey for this vault");
  try {
    return await unwrap(await kekFromSecret(secret), entry);
  } catch {
    throw new VaultError("Failed to unwrap data key (wrong passkey or corrupted vault)");
  }
}

// ---------- data ----------

export async function readData<T>(key: CryptoKey): Promise<T> {
  const buf = await readFile(DATA);
  if (!buf) throw new VaultError("Vault data missing");
  const bytes = new Uint8Array(buf);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytes.slice(0, 12) },
    key,
    bytes.slice(12),
  );
  return JSON.parse(new TextDecoder().decode(plain)) as T;
}

export async function writeData(key: CryptoKey, value: unknown) {
  const iv = random(12); // fresh IV every write
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(JSON.stringify(value)),
  );
  const out = new Uint8Array(12 + cipher.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(cipher), 12);
  await writeFile(DATA, out);
}
