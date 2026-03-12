<template>
  <header class="nav-wrap">
    <div class="brand">
      <span class="brand-dot" aria-hidden="true"></span>
      <div class="brand-copy">
        <strong>曜竞</strong>
        <small>ESPORTS CLUB</small>
      </div>
    </div>

    <div class="nav-side">
      <p class="price" v-if="total > 0">当前合计 <span>¥{{ total }}</span></p>
      <button class="nav-btn" type="button" :disabled="!isFormValid" @click="$emit('jumpToForm')">
        立即下单
      </button>
    </div>
  </header>
</template>

<script setup>
defineProps({
  total: {
    type: Number,
    default: 0
  },
  isFormValid: {
    type: Boolean,
    default: false
  }
})

defineEmits(['jumpToForm'])
</script>

<style scoped>
.nav-wrap {
  position: sticky;
  top: 14px;
  z-index: 30;
  width: min(1280px, 100%);
  margin: 0 auto;
  padding: 11px 14px;
  border-radius: 20px;
  border: 1px solid rgba(15, 15, 16, 0.1);
  background: rgba(255, 255, 255, 0.84);
  backdrop-filter: blur(24px);
  box-shadow: 0 12px 34px rgba(15, 15, 16, 0.09);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #0f0f10;
}

.brand-copy {
  display: grid;
  gap: 2px;
}

.brand-copy strong {
  font-size: 16px;
  letter-spacing: 0.08em;
  font-weight: 650;
}

.brand-copy small {
  color: rgba(15, 15, 16, 0.55);
  font-size: 10px;
  letter-spacing: 0.26em;
}

.brand-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ff7a00;
  box-shadow: 0 0 0 7px rgba(255, 122, 0, 0.16);
}

.nav-side {
  display: flex;
  align-items: center;
  gap: 10px;
}

.price {
  margin: 0;
  color: rgba(15, 15, 16, 0.7);
  font-size: 12px;
  font-weight: 600;
  padding: 8px 10px;
  border-radius: 999px;
  border: 1px solid rgba(15, 15, 16, 0.09);
  background: rgba(255, 255, 255, 0.75);
}

.price span {
  color: #ff7a00;
  font-weight: 700;
}

.nav-btn {
  border: none;
  border-radius: 999px;
  padding: 10px 19px;
  background: linear-gradient(108deg, #0f0f10 0%, #1f2022 64%, #ff7a00 155%);
  color: #ffffff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
  cursor: pointer;
  box-shadow: 0 10px 24px rgba(15, 15, 16, 0.24);
  transition: transform 0.2s ease, opacity 0.2s ease, box-shadow 0.2s ease;
}

.nav-btn:hover:enabled {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(15, 15, 16, 0.3);
}

.nav-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

@media (min-width: 1600px) {
  .nav-wrap {
    width: min(1420px, 94vw);
  }
}

@media (max-width: 820px) {
  .nav-wrap {
    border-radius: 18px;
    padding: 10px 12px;
    gap: 10px;
  }

  .brand {
    gap: 10px;
  }

  .price {
    font-size: 11px;
    padding: 7px 9px;
  }

  .nav-btn {
    padding: 10px 15px;
  }
}

@media (max-width: 640px) {
  .brand-copy small,
  .price {
    display: none;
  }

  .nav-wrap {
    padding: 10px 12px;
  }

  .nav-btn {
    font-size: 12px;
    padding: 9px 14px;
  }
}

@media (max-width: 460px) {
  .nav-wrap {
    top: 10px;
  }

  .brand-copy strong {
    font-size: 14px;
  }
}
</style>
