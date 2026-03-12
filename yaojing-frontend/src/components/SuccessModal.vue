<template>
  <transition name="fade-scale">
    <div v-if="open" class="overlay" @click.self="$emit('update:open', false)">
      <section class="modal">
        <p class="modal-brand">曜竞 · ESPORTS CLUB</p>
        <h3>订单已生成</h3>
        <p class="tips">订单已生成，我们会尽快为您安排专属客服，并在 5 分钟内与您取得联系，请保持联系方式畅通。</p>

        <div class="assurance-card" role="status" aria-live="polite">
          <p class="assurance-title">服务正在加急处理中</p>
          <p class="assurance-detail">高峰时段如有轻微延迟，我们也会第一时间与您确认并同步进度，请放心等待。</p>
        </div>

        <div class="mini-summary">
          <p>项目：{{ packageName || '未命名套餐' }}</p>
          <p>合计：<strong>¥{{ totalPrice }}</strong></p>
        </div>

        <button class="close-btn" type="button" @click="$emit('update:open', false)">我知道了</button>
      </section>
    </div>
  </transition>
</template>

<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false
  },
  packageName: {
    type: String,
    default: ''
  },
  totalPrice: {
    type: Number,
    default: 0
  }
})

defineEmits(['update:open'])
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(8, 8, 10, 0.62);
  backdrop-filter: blur(8px);
}

.modal {
  width: min(410px, 100%);
  border-radius: 28px;
  padding: 28px;
  background: linear-gradient(160deg, #0f0f10 0%, #1b1b1e 52%, #121214 100%);
  box-shadow: 0 28px 56px rgba(0, 0, 0, 0.42);
  text-align: center;
  color: #f7f7f8;
}

.modal-brand {
  margin: 0;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: rgba(247, 247, 248, 0.68);
}

.modal h3 {
  margin: 14px 0 0;
  font-size: 30px;
  color: #ffffff;
}

.tips {
  margin: 10px 0 0;
  color: rgba(247, 247, 248, 0.78);
  line-height: 1.72;
  font-size: 14px;
}

.assurance-card {
  margin: 20px 0;
  border-radius: 20px;
  padding: 15px 16px;
  text-align: left;
  border: 1px solid rgba(255, 122, 0, 0.4);
  background: linear-gradient(145deg, rgba(255, 122, 0, 0.18), rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14);
}

.assurance-title {
  margin: 0;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.assurance-detail {
  margin: 8px 0 0;
  color: rgba(247, 247, 248, 0.82);
  font-size: 13px;
  line-height: 1.7;
}

.mini-summary {
  text-align: left;
  border-radius: 16px;
  padding: 13px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
}

.mini-summary p {
  margin: 0 0 6px;
  color: rgba(247, 247, 248, 0.82);
}

.mini-summary p:last-child {
  margin: 0;
}

.mini-summary strong {
  color: #ff7a00;
}

.close-btn {
  margin-top: 16px;
  width: 100%;
  border: none;
  border-radius: 999px;
  padding: 12px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(118deg, #ff7a00, #ff9a40);
  cursor: pointer;
}

.fade-scale-enter-active,
.fade-scale-leave-active {
  transition: opacity 0.24s ease;
}

.fade-scale-enter-active .modal,
.fade-scale-leave-active .modal {
  transition: transform 0.28s ease, opacity 0.28s ease;
}

.fade-scale-enter-from,
.fade-scale-leave-to {
  opacity: 0;
}

.fade-scale-enter-from .modal,
.fade-scale-leave-to .modal {
  transform: translateY(10px) scale(0.96);
  opacity: 0;
}

@media (max-width: 640px) {
  .modal {
    border-radius: 24px;
    padding: 24px 18px;
  }

  .modal h3 {
    font-size: 26px;
  }

  .tips {
    font-size: 13px;
    line-height: 1.68;
  }

  .assurance-card {
    margin: 16px 0;
    padding: 13px 14px;
  }
}
</style>
