<script setup lang="ts">
const { status, entries, error, busy, init, create, unlock, lock, add, remove, reset } = useVault();

const name = ref("me");
const form = reactive({ date: new Date().toISOString().slice(0, 10), hours: 8, note: "" });
const confirmReset = ref(false);

const total = computed(() => entries.value.reduce((s, e) => s + e.hours, 0));

onMounted(init);

async function submit() {
  await add({ ...form, hours: Number(form.hours) });
  form.note = "";
}

async function onReset() {
  if (!confirmReset.value) {
    confirmReset.value = true;
    return;
  }
  confirmReset.value = false;
  await reset();
}
</script>

<template>
  <main>
    <h1>Timesheet vault</h1>
    <p class="muted">Encrypted in OPFS · unlocked with a passkey (WebAuthn PRF)</p>

    <p v-if="error" class="error">{{ error }}</p>

    <section v-if="status === 'loading'">Loading…</section>

    <section v-else-if="status === 'unsupported'">
      This browser lacks WebAuthn or OPFS, or the page isn't a secure context.
    </section>

    <section v-else-if="status === 'empty'">
      <p>No vault yet. Create a passkey to encrypt your data.</p>
      <form @submit.prevent="create(name)">
        <input v-model="name" placeholder="Passkey label" required />
        <button :disabled="busy">Create vault with passkey</button>
      </form>
    </section>

    <section v-else-if="status === 'locked'">
      <p>🔒 Vault locked.</p>
      <button :disabled="busy" @click="unlock">Unlock with passkey</button>
    </section>

    <section v-else>
      <div class="row">
        <span>🔓 Unlocked · {{ entries.length }} entries · {{ total }} h</span>
        <button @click="lock">Lock</button>
      </div>

      <form class="row" @submit.prevent="submit">
        <input v-model="form.date" type="date" required />
        <input v-model="form.hours" type="number" min="0" max="24" step="0.25" required />
        <input v-model="form.note" placeholder="Note" />
        <button :disabled="busy">Add</button>
      </form>

      <table v-if="entries.length">
        <tr v-for="e in entries" :key="e.id">
          <td>{{ e.date }}</td>
          <td>{{ e.hours }} h</td>
          <td>{{ e.note }}</td>
          <td><button @click="remove(e.id)">✕</button></td>
        </tr>
      </table>
    </section>

    <footer v-if="status === 'locked' || status === 'unlocked'">
      <button class="danger" :disabled="busy" @click="onReset">
        {{ confirmReset ? "Click again: permanently delete vault" : "Delete vault" }}
      </button>
    </footer>
  </main>
</template>

<style scoped>
main {
  max-width: 640px;
  margin: 2rem auto;
  padding: 0 1rem;
}
.muted {
  opacity: 0.6;
}
.error {
  color: #d33;
}
.row {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  justify-content: space-between;
  margin: 1rem 0;
  flex-wrap: wrap;
}
table {
  width: 100%;
  border-collapse: collapse;
}
td {
  padding: 0.4rem;
  border-top: 1px solid #8884;
}
footer {
  margin-top: 3rem;
}
.danger {
  color: #d33;
}
</style>
