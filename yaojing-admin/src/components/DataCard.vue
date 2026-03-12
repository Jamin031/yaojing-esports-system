<template>
  <div class="card-surface stat-card">
    <div class="label">{{ label }}</div>
    <div class="value">{{ value }}</div>
    <div v-if="hint" class="hint">{{ hint }}</div>
  </div>
</template>

<script setup>
defineProps({
  label: {
    type: String,
    default: '',
  },
  value: {
    type: [String, Number],
    default: '-',
  },
  hint: {
    type: String,
    default: '',
  },
});
</script>

<style scoped>
.stat-card {
  position: relative;
  padding: 20px 20px 18px;
  min-height: 132px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  overflow: hidden;
  border-radius: 16px;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 4px;
  background: linear-gradient(90deg, var(--accent) 0%, rgba(255, 122, 0, 0.22) 88%);
}

.stat-card::after {
  content: '';
  position: absolute;
  right: -16px;
  top: -16px;
  width: 80px;
  height: 80px;
  border-radius: 999px;
  background: radial-gradient(circle at center, rgba(255, 122, 0, 0.16) 0%, rgba(255, 122, 0, 0) 72%);
  pointer-events: none;
}

.label {
  font-size: 12px;
  letter-spacing: 0.01em;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.value {
  font-size: 30px;
  font-weight: 660;
  letter-spacing: -0.01em;
  color: #111217;
}

.hint {
  margin-top: 12px;
  font-size: 12px;
  color: #868d99;
}
</style>
