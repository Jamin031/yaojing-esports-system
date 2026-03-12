<template>
  <div class="pricing-zone">
    <div v-if="!packages.length" class="empty-state">
      <p class="empty-title">等待选择</p>
      <p>请先选择游戏与服务类型，系统将自动加载对应套餐价位。</p>
    </div>

    <div v-else class="stretch-grid">
      <button
        v-for="item in packages"
        :key="item.id"
        class="package-card"
        :class="{ active: selectedPackageId === item.id }"
        type="button"
        @click="$emit('pick', item.id)"
      >
        <p class="package-name">{{ item.name }}</p>
        <p class="package-price">¥{{ item.price }}<span v-if="item.is_hourly">/h</span></p>
        <p class="package-meta">{{ item.is_hourly ? '按小时计费' : '固定总价套餐' }}</p>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  packages: {
    type: Array,
    default: () => []
  },
  selectedPackageId: {
    type: Number,
    default: null
  }
})

defineEmits(['pick'])
</script>

<style scoped>
.empty-state {
  min-height: 196px;
  border-radius: 20px;
  display: grid;
  place-items: center;
  text-align: center;
  padding: 26px;
  border: 1px dashed rgba(15, 15, 16, 0.16);
  background: linear-gradient(138deg, rgba(255, 255, 255, 0.85), rgba(246, 246, 244, 0.9));
}

.empty-title {
  margin: 0;
  font-size: 16px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #0f0f10;
}

.empty-state p {
  margin: 9px 0 0;
  color: rgba(15, 15, 16, 0.62);
  font-size: 13px;
  line-height: 1.75;
}

.stretch-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 13px;
}

.package-card {
  border: 1px solid rgba(15, 15, 16, 0.1);
  border-radius: 18px;
  padding: 16px 16px 15px;
  text-align: left;
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.98), rgba(252, 252, 251, 0.95));
  box-shadow: 0 8px 20px rgba(15, 15, 16, 0.05);
  transition: transform 0.22s ease, box-shadow 0.22s ease, border-color 0.22s ease, background 0.22s ease;
  cursor: pointer;
}

.package-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 24px rgba(15, 15, 16, 0.09);
}

.package-card.active {
  border-color: rgba(255, 122, 0, 0.45);
  box-shadow: 0 18px 30px rgba(255, 122, 0, 0.16);
  background: linear-gradient(165deg, #ffffff, #fff2e5);
}

.package-name {
  margin: 0;
  color: #0f0f10;
  line-height: 1.46;
  min-height: 44px;
  font-weight: 600;
  font-size: 14px;
}

.package-price {
  margin: 12px 0 4px;
  font-size: 29px;
  font-weight: 700;
  color: #0f0f10;
  letter-spacing: -0.03em;
}

.package-price span {
  font-size: 14px;
  margin-left: 3px;
  color: rgba(15, 15, 16, 0.58);
}

.package-meta {
  margin: 0;
  color: #ff7a00;
  font-size: 11px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

@media (max-width: 760px) {
  .stretch-grid {
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 11px;
  }

  .package-card {
    border-radius: 16px;
    padding: 14px;
  }

  .package-name {
    min-height: 0;
    font-size: 13px;
  }

  .package-price {
    margin-top: 10px;
    font-size: 24px;
  }
}

@media (max-width: 480px) {
  .stretch-grid {
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .package-meta {
    letter-spacing: 0.06em;
  }
}
</style>
