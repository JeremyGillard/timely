<script setup lang="ts">
// Cloud button (top-right) + sheet to turn optional sync on/off. Signing in is an email code,
// then a passkey (or recovery key) gives this device the end-to-end encryption key.
const sync = useSync();
const { status, email, hasVault, hasPasskey, syncing, lastSync, error } = sync;
const now = useNow();

const dialog = ref<HTMLDialogElement | null>(null);
const busy = ref(false);
const localError = ref<string | null>(null);

// sign-in steps
const address = ref("");
const code = ref("");
const codeSent = ref(false);
// key steps
const recoveryKey = ref<string | null>(null); // shown once after creating the key
const recoveryInput = ref("");
const useRecovery = ref(false);
const passkeyFailed = ref(false);
const copied = ref(false);

const open = () => {
  localError.value = null;
  dialog.value?.showModal();
  if (status.value === "on") void sync.syncNow();
};
const close = () => dialog.value?.close();

async function run(fn: () => Promise<void>) {
  localError.value = null;
  busy.value = true;
  try {
    await fn();
  } catch (e) {
    localError.value = e instanceof Error ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}

const sendCode = () =>
  run(async () => {
    await sync.sendCode(address.value.trim());
    codeSent.value = true;
    code.value = "";
  });

const verify = () => run(() => sync.verifyCode(address.value.trim(), code.value.trim()));

const create = (withPasskey: boolean) =>
  run(async () => {
    try {
      recoveryKey.value = await sync.createKey(withPasskey);
    } catch (e) {
      if (withPasskey && e instanceof Error && /PRF|cancel|NotAllowed/i.test(e.message + e.name))
        passkeyFailed.value = true;
      throw e;
    }
  });

const unlockPasskey = () => run(() => sync.unlockWithPasskey());
const unlockRecovery = () => run(() => sync.unlockWithRecoveryKey(recoveryInput.value));

const signOut = () =>
  run(async () => {
    await sync.signOut();
    codeSent.value = false;
    code.value = "";
    recoveryKey.value = null;
  });

async function copyRecovery() {
  if (!recoveryKey.value) return;
  try {
    await navigator.clipboard.writeText(recoveryKey.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // clipboard blocked: the key is still selectable
  }
}

const state = computed(() => {
  if (status.value === "on") {
    if (syncing.value) return "syncing";
    if (error.value) return "error";
    return "synced";
  }
  return status.value === "need-key" ? "attention" : "off";
});

const ago = computed(() => {
  if (!lastSync.value) return null;
  const s = Math.max(0, Math.round((now.value - lastSync.value) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
});

const label = computed(
  () =>
    ({
      off: "Sync off",
      attention: "Finish setting up sync",
      syncing: "Syncing…",
      error: `Sync problem: ${error.value}`,
      synced: "Synced",
    })[state.value],
);
</script>

<template>
  <button
    v-if="status !== 'loading'"
    type="button"
    class="cloud"
    :class="state"
    :aria-label="label"
    :title="label"
    @click="open"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.7 4.7 0 0 0 7 18.5Z" />
      <path v-if="state === 'synced'" class="mark" d="m9.5 13.6 1.9 1.9 3.6-3.8" />
      <path v-else-if="state === 'syncing'" class="mark spin" d="M14.6 12a2.6 2.6 0 1 1-.8-1.9" />
      <path v-else-if="state === 'error'" class="mark" d="M12 10.5v3M12 16v.01" />
      <path v-else-if="state === 'off'" class="mark" d="M12 11v5M9.5 13.5h5" />
    </svg>
    <span v-if="state === 'attention' || state === 'error'" class="badge" />
  </button>

  <dialog ref="dialog" class="sheet" aria-labelledby="sync-title" @click.self="close">
    <div class="body">
      <button type="button" class="x" aria-label="Close" @click="close">
        <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>
      </button>

      <!-- off: sign in with an email code -->
      <template v-if="status === 'off'">
        <h2 id="sync-title">Sync across devices</h2>
        <p class="lead">
          Your data stays on this device. Turn on sync to use it on your other devices too:
          end-to-end encrypted, only you can read it. No password.
        </p>
        <form v-if="!codeSent" @submit.prevent="sendCode">
          <input
            v-model="address"
            type="email"
            autocomplete="email"
            inputmode="email"
            placeholder="you@example.com"
            aria-label="Email"
            required
          />
          <button class="primary" :disabled="busy || !address.trim()">Send code</button>
        </form>
        <form v-else @submit.prevent="verify">
          <p class="hint">
            Enter the 6-digit code sent to <strong>{{ address }}</strong>
          </p>
          <input
            v-model="code"
            class="code"
            autocomplete="one-time-code"
            inputmode="numeric"
            pattern="[0-9]{6,8}"
            maxlength="8"
            placeholder="123456"
            aria-label="Code"
            required
          />
          <button class="primary" :disabled="busy || code.trim().length < 6">Verify</button>
          <button type="button" class="link" :disabled="busy" @click="codeSent = false">
            Use another email
          </button>
        </form>
      </template>

      <!-- signed in, first device: create the encryption key -->
      <template v-else-if="status === 'need-key' && !hasVault">
        <h2 id="sync-title">Protect your data</h2>
        <p class="lead">
          Create a passkey to encrypt your data. It unlocks with Face ID, Touch ID or your device
          PIN, and syncs to your other devices through your password manager.
        </p>
        <button class="primary" :disabled="busy" @click="create(true)">Create passkey</button>
        <button v-if="passkeyFailed" class="link" :disabled="busy" @click="create(false)">
          Continue with a recovery key only
        </button>
      </template>

      <!-- signed in, another device: unlock the existing key -->
      <template v-else-if="status === 'need-key'">
        <h2 id="sync-title">Unlock your data</h2>
        <template v-if="hasPasskey && !useRecovery">
          <p class="lead">Use the passkey you created for Timely on your other device.</p>
          <button class="primary" :disabled="busy" @click="unlockPasskey">
            Unlock with passkey
          </button>
          <button class="link" :disabled="busy" @click="useRecovery = true">
            Use recovery key instead
          </button>
        </template>
        <form v-else @submit.prevent="unlockRecovery">
          <p class="lead">Enter the recovery key you saved when you turned on sync.</p>
          <input
            v-model="recoveryInput"
            class="mono"
            autocomplete="off"
            autocapitalize="characters"
            spellcheck="false"
            placeholder="XXXX-XXXX-…"
            aria-label="Recovery key"
            required
          />
          <button class="primary" :disabled="busy || !recoveryInput.trim()">Unlock</button>
          <button v-if="hasPasskey" type="button" class="link" @click="useRecovery = false">
            Use passkey instead
          </button>
        </form>
        <button class="link muted" :disabled="busy" @click="signOut">Sign out</button>
      </template>

      <!-- on -->
      <template v-else-if="status === 'on'">
        <template v-if="recoveryKey">
          <h2 id="sync-title">Save your recovery key</h2>
          <p class="lead">
            If you lose your passkey, this is the only way to get your synced data back. Keep it
            somewhere safe, like your password manager. It won't be shown again.
          </p>
          <output class="recovery mono">{{ recoveryKey }}</output>
          <button class="secondary" @click="copyRecovery">{{ copied ? "Copied" : "Copy" }}</button>
          <button class="primary" @click="recoveryKey = null">I've saved it</button>
        </template>
        <template v-else>
          <h2 id="sync-title">Sync is on</h2>
          <p class="lead">
            {{ email }}<br />
            <span :class="{ bad: error }">
              {{ syncing ? "Syncing…" : error ? error : ago ? `Synced ${ago}` : "Synced" }}
            </span>
          </p>
          <button class="secondary" :disabled="syncing" @click="sync.syncNow()">Sync now</button>
          <button class="link muted" :disabled="busy" @click="signOut">
            Turn off sync on this device
          </button>
        </template>
      </template>

      <p v-if="localError" class="error" role="alert">{{ localError }}</p>
    </div>
  </dialog>
</template>

<style scoped>
.cloud {
  position: fixed;
  top: calc(env(safe-area-inset-top) + 1rem);
  right: calc(env(safe-area-inset-right) + 1rem);
  z-index: 11;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--dot-light) 60%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, #fff 55%, transparent);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  color: var(--muted);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: transform 0.2s ease;
}
.cloud:active {
  transform: scale(0.94);
}
.cloud:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}
.cloud.synced,
.cloud.syncing,
.cloud.error {
  color: var(--ink);
}
@media (min-width: 1024px) {
  .cloud {
    top: calc(1.75rem + env(safe-area-inset-top));
    right: 2rem;
    width: 46px;
    height: 46px;
    box-shadow: 0 8px 24px -16px rgb(0 0 0 / 0.25);
  }
}
.cloud svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.mark {
  stroke-width: 1.8;
}
.spin {
  transform-origin: 12px 12px;
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .spin {
    animation: none;
  }
}
.badge {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--warning);
}
.cloud.error .badge {
  background: var(--danger);
}

/* ---------- sheet ---------- */
.sheet {
  width: min(100% - 2rem, 420px);
  max-width: none;
  padding: 0;
  border: none;
  border-radius: 24px;
  background: var(--bg);
  color: var(--ink);
  box-shadow: 0 30px 80px -30px rgb(0 0 0 / 0.45);
}
.sheet::backdrop {
  background: rgb(0 0 0 / 0.25);
  backdrop-filter: blur(2px);
}
@media (max-width: 639px) {
  .sheet {
    width: 100%;
    margin: auto 0 0;
    border-radius: 24px 24px 0 0;
  }
  .body {
    padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
  }
}
.body {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.5rem;
}
form {
  display: contents;
}
h2 {
  margin: 0 2rem 0 0;
  font-size: 1.5rem;
  font-weight: 500;
  letter-spacing: -0.02em;
}
.lead,
.hint {
  margin: 0;
  color: color-mix(in srgb, var(--ink) 70%, var(--muted));
  line-height: 1.45;
}
.hint {
  font-size: 0.92rem;
}
.bad,
.error {
  color: var(--danger);
}
.error {
  margin: 0;
  font-size: 0.9rem;
}
input {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid var(--dot-light);
  border-radius: 14px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 1rem;
}
input:focus {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}
.code {
  letter-spacing: 0.4em;
  font-size: 1.3rem;
  text-align: center;
}
.mono {
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
}
.recovery {
  display: block;
  padding: 0.9rem 1rem;
  border-radius: 14px;
  background: #fff;
  font-size: 0.95rem;
  line-height: 1.6;
  word-break: break-all;
  user-select: all;
}
.primary,
.secondary {
  padding: 0.85rem 1rem;
  border: none;
  border-radius: 999px;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.primary {
  background: var(--accent);
  color: var(--accent-ink);
}
.secondary {
  background: #fff;
  color: var(--ink);
}
.primary:disabled,
.secondary:disabled {
  opacity: 0.5;
  cursor: default;
}
.link {
  align-self: center;
  padding: 0.25rem;
  border: none;
  background: none;
  color: var(--ink);
  font: inherit;
  font-size: 0.92rem;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.link.muted {
  color: var(--muted);
}
.x {
  position: absolute;
  top: 1.2rem;
  right: 1.2rem;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: color-mix(in srgb, var(--dot-light) 40%, transparent);
  color: var(--ink);
  cursor: pointer;
}
.x svg {
  width: 14px;
  height: 14px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
}
</style>
