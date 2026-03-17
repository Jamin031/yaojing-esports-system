<template>
  <div class="app-shell">
    <AppNavbar :total="totalPrice" :is-form-valid="isFormValid" @jump-to-form="scrollToOrder" />

    <main class="page-main">
      <section class="hero">
        <div class="hero-surface">
          <div class="hero-content">
            <div class="hero-brand">
              <p class="hero-eyebrow">YAOJING</p>
              <h1>
                <span>曜竞</span>
                <small>ESPORTS CLUB</small>
              </h1>
            </div>

            <p class="hero-manifesto">
              我们相信，真正的竞技不只是输赢，更是热爱、默契与并肩作战。曜竞，致力于陪你认真打好每一场对局。
            </p>

            <div class="hero-transition">
              <p class="hero-system-tag">
                <span class="tag-dot" aria-hidden="true"></span>
                电竞点单系统
              </p>
              <div class="hero-actions">
                <a class="hero-link" href="#pricing-panel">实时价位表</a>
                <button class="hero-cta" type="button" @click="scrollToOrder">快速下单</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="content-grid">
        <article id="pricing-panel" class="panel panel-pricing">
          <header class="panel-header">
            <h2>实时价位表</h2>
            <p>详细服务规则请在下单后与客服沟通确认。</p>
          </header>

          <div class="quick-filters">
            <label class="field-block">
              <span>游戏</span>
              <select v-model.number="selectedGameId" @change="resetGameSelections">
                <option :value="null">请选择游戏</option>
                <option v-for="game in games" :key="game.id" :value="game.id">{{ game.name }}</option>
              </select>
            </label>

            <label class="field-block">
              <span>服务类型</span>
              <select v-model.number="selectedServiceId" :disabled="!selectedGameId" @change="selectedPackageId = null">
                <option :value="null">请选择服务</option>
                <option v-for="srv in availableServices" :key="srv.id" :value="srv.id">{{ srv.name }}</option>
              </select>
            </label>
          </div>

          <PricingStretchGrid
            :packages="availablePackages"
            :selected-package-id="selectedPackageId"
            @pick="selectedPackageId = $event"
          />
        </article>

        <article id="order-panel" ref="orderSection" class="panel panel-order">
          <header class="panel-header">
            <h2>快速下单</h2>
            <p>请填写基础信息，提交后客服将尽快与你确认订单。</p>
          </header>

          <form class="order-form" @submit.prevent="submitOrder">
            <label class="field-block">
              <span>称呼</span>
              <input v-model.trim="nameValue" type="text" placeholder="请输入你的称呼" />
            </label>

            <div class="field-block">
              <span>联系方式</span>
              <div class="contact-fields">
                <select v-model="contactType" :class="{ 'input-invalid': hasInvalidContact && !contactType }">
                  <option value="">请选择联系方式类型</option>
                  <option v-for="option in contactTypeOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <input
                  v-model.trim="contactValue"
                  type="text"
                  :maxlength="contactInputMaxLength"
                  :inputmode="contactType === 'phone' ? 'numeric' : 'text'"
                  :autocomplete="contactType === 'phone' ? 'tel' : 'off'"
                  :disabled="!contactType"
                  autocapitalize="off"
                  spellcheck="false"
                  :class="contactInputClass"
                  :placeholder="contactInputPlaceholder"
                />
              </div>
              <small
                class="field-hint"
                :class="{
                  'is-error': hasInvalidContact,
                  'is-success': contactValidation.helperState === 'success'
                }"
              >
                {{ contactHintText }}
              </small>
            </div>

            <label class="field-block">
              <span>需求备注（选填）</span>
              <textarea
                v-model.trim="customerOrderRemark"
                placeholder="可填写开黑、语音、时间、陪玩风格等要求，客服将按此沟通安排"
                rows="3"
                maxlength="300"
              ></textarea>
            </label>

            <label v-if="selectedPackage && isHourly" class="field-block duration-block">
              <span>服务时长：{{ orderDuration }} 小时</span>
              <input v-model.number="orderDuration" type="range" min="1" max="12" step="1" />
            </label>

            <label class="checkbox-row">
              <input v-model="isAnonymous" type="checkbox" />
              <span>匿名下单</span>
            </label>

            <div class="summary-card" v-if="selectedPackage">
              <p>套餐：{{ selectedPackage.name }}</p>
              <p>
                单价：¥{{ selectedPackage.price }}
                <span v-if="isHourly">/小时</span>
              </p>
              <p class="total">合计：¥{{ totalPrice }}</p>
              <p class="summary-source">来源标识：{{ domainPrefix }}</p>
            </div>

            <button
              class="submit-btn"
              :class="{ 'is-loading': isSubmitting }"
              :disabled="!isFormValid || isSubmitting"
              type="submit"
            >
              <span>{{ isSubmitting ? '提交中...' : '生成订单' }}</span>
            </button>
          </form>
        </article>
      </section>

      <footer class="page-footer">
        <p class="footer-brand">曜竞 <span>ESPORTS CLUB</span></p>
        <p class="footer-slogan">为竞技而生</p>
      </footer>
    </main>

    <SuccessModal
      v-model:open="showContactModal"
      :package-name="selectedPackage?.name"
      :total-price="totalPrice"
    />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import 'element-plus/es/components/message/style/css'
import { createOrder } from '@/api/orders'
import { checkHealth } from '@/api/system'
import { CONTACT_TYPE_MESSAGES, CONTACT_TYPE_OPTIONS, validateContactInput } from '@/utils/contactValidation'
import { getOrCreateDeviceId } from '@/utils/deviceId'
import { getOrderFingerprintPayload } from '@/utils/fingerprint'
import { resolveStoreKey } from '@/utils/storeSource'
import AppNavbar from './components/AppNavbar.vue'
import PricingStretchGrid from './components/PricingStretchGrid.vue'
import SuccessModal from './components/SuccessModal.vue'

const orderSection = ref(null)

const selectedGameId = ref(null)
const selectedServiceId = ref(null)
const selectedPackageId = ref(null)
const nameValue = ref('')
const contactType = ref('')
const contactValue = ref('')
const customerOrderRemark = ref('')
const isAnonymous = ref(false)
const orderDuration = ref(1)
const showContactModal = ref(false)
const isSubmitting = ref(false)
const storeKey = ref(resolveStoreKey())
const contactTypeOptions = CONTACT_TYPE_OPTIONS

const LAST_ORDER_TIME_KEY = 'last_order_time'
const ORDER_COOLDOWN_MS = 30 * 1000

const domainPrefix = computed(() => {
  const normalized = String(storeKey.value || '').trim().toLowerCase()
  return normalized || 'online'
})

const games = ref([
  { id: 1, name: '三角洲行动' },
  { id: 2, name: '英雄联盟' },
  { id: 3, name: '无畏契约' },
  { id: 4, name: '永劫无间' },
  { id: 5, name: 'PUBG' },
  { id: 6, name: '守望先锋' }
])

const services = ref([
  { id: 101, game_id: 1, name: '护航单' },
  { id: 102, game_id: 1, name: '体验单' },
  { id: 103, game_id: 1, name: '陪玩单' },
  { id: 104, game_id: 1, name: '特色单' },
  { id: 201, game_id: 2, name: '专业陪玩' },
  { id: 301, game_id: 3, name: '专业陪玩' },
  { id: 401, game_id: 4, name: '专业陪玩' },
  { id: 501, game_id: 5, name: '专业陪玩' },
  { id: 601, game_id: 6, name: '专业陪玩' }
])

const packages = ref([
  { id: 1, service_id: 101, name: '178保700W', price: 178, is_hourly: false },
  { id: 2, service_id: 101, name: '228保1000W', price: 228, is_hourly: false },
  { id: 3, service_id: 101, name: '298保1388W', price: 298, is_hourly: false },
  { id: 4, service_id: 101, name: '388保2000W', price: 388, is_hourly: false },
  { id: 5, service_id: 101, name: '558保3000W', price: 558, is_hourly: false },
  { id: 6, service_id: 101, name: '999保5000W', price: 999, is_hourly: false },

  { id: 7, service_id: 102, name: '机密：88保688W', price: 88, is_hourly: false },
  { id: 8, service_id: 102, name: '绝密：128保888W', price: 128, is_hourly: false },

  { id: 9, service_id: 103, name: '三角洲行动-普通娱乐陪', price: 60, is_hourly: true },
  { id: 10, service_id: 103, name: '三角洲行动-普通技术陪', price: 70, is_hourly: true },
  { id: 11, service_id: 103, name: '三角洲行动-普通魔王陪', price: 80, is_hourly: true },
  { id: 12, service_id: 103, name: '三角洲行动-机密娱乐陪', price: 70, is_hourly: true },
  { id: 13, service_id: 103, name: '三角洲行动-机密技术陪', price: 90, is_hourly: true },
  { id: 14, service_id: 103, name: '三角洲行动-机密魔王陪', price: 120, is_hourly: true },
  { id: 15, service_id: 103, name: '三角洲行动-绝密娱乐陪', price: 90, is_hourly: true },
  { id: 16, service_id: 103, name: '三角洲行动-绝密技术陪', price: 120, is_hourly: true },
  { id: 117, service_id: 103, name: '三角洲行动-绝密魔王陪', price: 160, is_hourly: true },

  { id: 118, service_id: 104, name: '卫星锅：保1100W', price: 298, is_hourly: false },
  { id: 119, service_id: 104, name: '火箭燃料：保1800W', price: 650, is_hourly: false },
  { id: 120, service_id: 104, name: '浮力设备：保3500W', price: 760, is_hourly: false },
  { id: 121, service_id: 104, name: '非洲之心：保9999W', price: 13688, is_hourly: false },
  { id: 122, service_id: 104, name: '赌单局3红且750W', price: 468, is_hourly: false },
  { id: 123, service_id: 104, name: '板板求生单：保1080W', price: 328, is_hourly: false },
  { id: 124, service_id: 104, name: '绝密航天清图单', price: 888, is_hourly: false },
  { id: 125, service_id: 104, name: '6421出红单：保2500W', price: 588, is_hourly: false },
  { id: 126, service_id: 104, name: '技能菜名单：保1200W', price: 438, is_hourly: false },

  { id: 17, service_id: 201, name: '英雄联盟-技术陪', price: 60, is_hourly: true },
  { id: 171, service_id: 201, name: '英雄联盟-娱乐陪', price: 50, is_hourly: true },
  { id: 18, service_id: 301, name: '无畏契约-技术陪', price: 70, is_hourly: true },
  { id: 181, service_id: 301, name: '无畏契约-娱乐陪', price: 60, is_hourly: true },
  { id: 19, service_id: 401, name: '永劫无间-技术陪', price: 60, is_hourly: true },
  { id: 191, service_id: 401, name: '永劫无间-娱乐陪', price: 50, is_hourly: true },
  { id: 20, service_id: 501, name: 'PUBG-娱乐陪', price: 50, is_hourly: true },
  { id: 202, service_id: 501, name: 'PUBG-技术陪', price: 60, is_hourly: true },
  { id: 21, service_id: 601, name: '守望先锋-娱乐陪', price: 50, is_hourly: true },
  { id: 212, service_id: 601, name: '守望先锋-技术陪', price: 60, is_hourly: true }
])

const availableServices = computed(() =>
  services.value.filter((item) => item.game_id === selectedGameId.value)
)

const availablePackages = computed(() =>
  packages.value.filter((item) => item.service_id === selectedServiceId.value)
)

const selectedPackage = computed(() =>
  packages.value.find((item) => item.id === selectedPackageId.value) || null
)

const selectedGame = computed(() =>
  games.value.find((item) => item.id === selectedGameId.value) || null
)

const selectedService = computed(() =>
  services.value.find((item) => item.id === selectedServiceId.value) || null
)

const isHourly = computed(() => selectedPackage.value?.is_hourly || false)

const totalPrice = computed(() => {
  if (!selectedPackage.value) return 0
  return isHourly.value
    ? selectedPackage.value.price * orderDuration.value
    : selectedPackage.value.price
})

const contactValidation = computed(() => validateContactInput(contactValue.value, contactType.value))
const hasInvalidContact = computed(
  () => contactValidation.value.helperState === 'error' && !contactValidation.value.isValid
)
const contactHintText = computed(() => {
  if (contactValidation.value.message) {
    return contactValidation.value.message
  }
  return contactType.value === 'phone' ? CONTACT_TYPE_MESSAGES.phone_empty : CONTACT_TYPE_MESSAGES.wechat_empty
})
const contactInputPlaceholder = computed(() => {
  if (contactType.value === 'wechat') return CONTACT_TYPE_MESSAGES.wechat_empty
  if (contactType.value === 'phone') return CONTACT_TYPE_MESSAGES.phone_empty
  return '请先选择联系方式类型'
})
const contactInputMaxLength = computed(() => (contactType.value === 'phone' ? 11 : 20))
const contactInputClass = computed(() => ({
  'input-invalid': hasInvalidContact.value,
  'input-valid': Boolean(contactValue.value) && contactValidation.value.isValid
}))

const isFormValid = computed(
  () =>
    Boolean(selectedPackageId.value) &&
    Boolean(contactType.value) &&
    contactValidation.value.isValid &&
    (isAnonymous.value || nameValue.value.length > 0)
)

const resetGameSelections = () => {
  selectedServiceId.value = null
  selectedPackageId.value = null
  orderDuration.value = 1
}

const scrollToOrder = () => {
  orderSection.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const showMessage = (type, message) => {
  ElMessage({
    type,
    message,
    customClass: `brand-message brand-message--${type}`
  })
}

onMounted(async () => {
  const deviceId = getOrCreateDeviceId()

  console.info('[store-source] resolved store_key for order submit', {
    device_id: deviceId,
    store_key: storeKey.value,
    search: window.location.search
  })

  try {
    await checkHealth()
  } catch (err) {
    console.error('Health check failed:', err)
  }

  void getOrderFingerprintPayload().catch((error) => {
    console.warn('Fingerprint warmup failed:', error)
  })
})

const isOrderSuccessResponse = (res, responseData) => {
  const successByFlag = typeof responseData.success === 'boolean'
    ? responseData.success
    : typeof responseData.success === 'number'
      ? responseData.success === 1
      : null
  const codeValue = responseData.code
  const successByCode =
    codeValue === undefined || codeValue === null
      ? null
      : Number(codeValue) === 0 || Number(codeValue) === 200
  const isExplicitSuccess = successByFlag ?? successByCode ?? false
  const isHttpSuccess = Number(res?.status) >= 200 && Number(res?.status) < 300
  const createdOrderIdCandidates = [
    responseData?.data?.id,
    responseData?.data?.order_id,
    responseData?.id,
    responseData?.order_id
  ]
  const hasCreatedOrderId = createdOrderIdCandidates.some((candidate) => {
    const orderId = Number(candidate)
    return Number.isFinite(orderId) && orderId > 0
  })
  const hasCreatedOrderNo = Boolean(String(responseData?.data?.order_no || responseData?.order_no || '').trim())

  return isHttpSuccess && isExplicitSuccess && (hasCreatedOrderId || hasCreatedOrderNo)
}

const getCooldownRemainingMs = () => {
  const lastOrderTime = Number(localStorage.getItem(LAST_ORDER_TIME_KEY) || 0)
  const elapsed = Date.now() - lastOrderTime
  return elapsed >= ORDER_COOLDOWN_MS ? 0 : ORDER_COOLDOWN_MS - elapsed
}

const rollbackOrderCooldown = (previousValue) => {
  if (previousValue) {
    localStorage.setItem(LAST_ORDER_TIME_KEY, previousValue)
    return
  }
  localStorage.removeItem(LAST_ORDER_TIME_KEY)
}

const getBackendMessage = (data) => {
  if (!data) return ''
  if (typeof data === 'string') return data
  return data.message || data.error || data.msg || ''
}

const submitOrder = async () => {
  if (!selectedPackage.value || isSubmitting.value) return
  if (!contactType.value) {
    showMessage('error', CONTACT_TYPE_MESSAGES.required)
    return
  }
  if (!contactValidation.value.isValid) {
    showMessage('error', contactValidation.value.message)
    return
  }
  if (!isFormValid.value) return

  const cooldownRemainingMs = getCooldownRemainingMs()
  if (cooldownRemainingMs > 0) {
    const cooldownSeconds = Math.ceil(cooldownRemainingMs / 1000)
    showMessage('warning', `请${cooldownSeconds}秒后再试`)
    return
  }

  const now = Date.now()
  const previousCooldownValue = localStorage.getItem(LAST_ORDER_TIME_KEY)

  try {
    isSubmitting.value = true
    localStorage.setItem(LAST_ORDER_TIME_KEY, String(now))
    const deviceId = getOrCreateDeviceId()
    const fingerprintPayload = await getOrderFingerprintPayload()

    const payload = {
      game_id: selectedGame.value?.id || null,
      game_name: selectedGame.value?.name || '',
      service_id: selectedService.value?.id || null,
      service_name: selectedService.value?.name || '',
      package_id: selectedPackage.value.id,
      package_name: selectedPackage.value.name,
      order_duration: isHourly.value ? orderDuration.value : 1,
      order_amount: totalPrice.value,
      customer_name: isAnonymous.value ? '匿名用户' : nameValue.value,
      customer_contact: contactValue.value,
      // Canonical customer remark fields consumed by current backend/admin.
      customer_order_remark: customerOrderRemark.value || '',
      order_remark: customerOrderRemark.value || '',
      // Kept for compatibility with older backends that used this naming.
      customer_requirement_note: customerOrderRemark.value || '',
      // Backward-compatible required fields in current backend createOrder validator
      contact: contactValue.value,
      contact_type: contactType.value,
      order_info: selectedPackage.value.name,
      is_anonymous: isAnonymous.value ? 1 : 0,
      device_id: deviceId,
      store_key: storeKey.value,
      ...fingerprintPayload
    }

    const res = await createOrder(payload)
    const responseData = res?.data || {}
    const isSuccess = isOrderSuccessResponse(res, responseData)

    if (isSuccess) {
      showMessage('success', '客服将尽快联系你')
      showContactModal.value = true
      return
    }

    rollbackOrderCooldown(previousCooldownValue)
    showMessage('error', getBackendMessage(responseData) || `下单失败（状态码 ${res?.status ?? 'unknown'}）`)
  } catch (error) {
    rollbackOrderCooldown(previousCooldownValue)
    const backendMessage = getBackendMessage(error?.response?.data)

    console.error('下单失败真实错误:', {
      message: error?.message,
      status: error?.response?.status,
      data: error?.response?.data
    })

    showMessage('error', backendMessage || error?.message || '提交失败')
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.app-shell {
  position: relative;
  min-height: 100vh;
  padding: 24px clamp(16px, 4vw, 46px) 44px;
  overflow: hidden;
  background:
    radial-gradient(circle at 11% -8%, rgba(255, 122, 0, 0.2), transparent 40%),
    radial-gradient(circle at 89% 6%, rgba(15, 15, 16, 0.08), transparent 30%),
    linear-gradient(180deg, #f5f4f2 0%, #fafaf9 48%, #f2f1ef 100%);
}

.app-shell::before,
.app-shell::after {
  content: '';
  position: absolute;
  pointer-events: none;
  border-radius: 50%;
}

.app-shell::before {
  width: 560px;
  height: 560px;
  left: -250px;
  top: 220px;
  background: radial-gradient(circle, rgba(255, 122, 0, 0.11), rgba(255, 122, 0, 0));
}

.app-shell::after {
  width: 640px;
  height: 640px;
  right: -250px;
  top: -210px;
  background: radial-gradient(circle, rgba(15, 15, 16, 0.1), rgba(15, 15, 16, 0));
}

.page-main {
  position: relative;
  z-index: 1;
  width: min(1280px, 100%);
  margin: 0 auto;
  display: grid;
  gap: 30px;
}

#pricing-panel,
#order-panel {
  scroll-margin-top: 90px;
}

.hero {
  margin-top: 4px;
}

.hero-surface {
  position: relative;
  overflow: hidden;
  border-radius: 40px;
  padding: clamp(30px, 4.8vw, 60px);
  background: linear-gradient(148deg, #0f0f10 0%, #18191b 54%, #111214 100%);
  color: #ffffff;
  box-shadow: 0 34px 78px rgba(13, 13, 15, 0.34);
}

.hero-surface::before,
.hero-surface::after {
  content: '';
  position: absolute;
  pointer-events: none;
}

.hero-surface::before {
  width: 540px;
  height: 540px;
  right: -180px;
  top: -260px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255, 122, 0, 0.42), rgba(255, 122, 0, 0));
}

.hero-surface::after {
  width: 380px;
  height: 380px;
  right: 12%;
  bottom: -250px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.hero-content {
  position: relative;
  z-index: 1;
  display: grid;
  gap: clamp(18px, 2.2vw, 24px);
  max-width: 840px;
}

.hero-brand {
  display: grid;
  gap: 10px;
}

.hero-eyebrow {
  margin: 0;
  color: rgba(255, 255, 255, 0.62);
  letter-spacing: 0.28em;
  font-weight: 600;
  font-size: 11px;
}

.hero h1 {
  margin: 0;
  display: grid;
  gap: 12px;
}

.hero h1 span {
  font-size: clamp(52px, 9vw, 96px);
  line-height: 0.92;
  letter-spacing: 0.08em;
  text-shadow: 0 6px 22px rgba(0, 0, 0, 0.18);
}

.hero h1 small {
  font-size: clamp(13px, 1.9vw, 17px);
  font-weight: 600;
  letter-spacing: 0.3em;
  color: rgba(255, 255, 255, 0.75);
}

.hero-manifesto {
  margin: 0;
  max-width: 760px;
  color: rgba(255, 255, 255, 0.9);
  font-size: clamp(16px, 2.2vw, 22px);
  line-height: 1.86;
  text-wrap: pretty;
}

.hero-transition {
  margin-top: 4px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-system-tag {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.76);
}

.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ff7a00;
  box-shadow: 0 0 0 6px rgba(255, 122, 0, 0.16);
}

.hero-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.hero-link,
.hero-cta {
  border-radius: 999px;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-decoration: none;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, color 0.2s ease;
}

.hero-link {
  border: 1px solid rgba(255, 255, 255, 0.28);
  color: rgba(255, 255, 255, 0.88);
  background: rgba(255, 255, 255, 0.06);
}

.hero-link:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.12);
}

.hero-cta {
  border: none;
  color: #ffffff;
  background: linear-gradient(112deg, #ff7a00, #ff9440);
  box-shadow: 0 16px 28px rgba(255, 122, 0, 0.28);
  cursor: pointer;
}

.hero-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 20px 32px rgba(255, 122, 0, 0.34);
}

.content-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.08fr) minmax(0, 0.92fr);
  gap: 24px;
  align-items: start;
}

.panel {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(15, 15, 16, 0.08);
  border-radius: 28px;
  padding: clamp(20px, 2.5vw, 30px);
  box-shadow: 0 20px 48px rgba(15, 15, 16, 0.08);
  backdrop-filter: blur(14px);
}

.panel-header {
  margin-bottom: 20px;
}

.panel-header h2 {
  margin: 0;
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.12;
  color: #0f0f10;
  letter-spacing: 0.02em;
}

.panel-header p {
  margin: 10px 0 0;
  color: rgba(15, 15, 16, 0.6);
  font-size: 13px;
  line-height: 1.8;
}

.quick-filters {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  margin-bottom: 20px;
}

.order-form {
  display: grid;
  gap: 15px;
}

.field-block {
  display: grid;
  gap: 9px;
}

.contact-fields {
  display: grid;
  grid-template-columns: minmax(0, 148px) minmax(0, 1fr);
  gap: 10px;
}

.field-block span {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: rgba(15, 15, 16, 0.66);
}

.field-hint {
  margin: -2px 2px 0;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(15, 15, 16, 0.48);
}

.field-hint.is-error {
  color: #c9472b;
}

.field-hint.is-success {
  color: #1b7f4a;
}

select,
input[type='text'],
textarea {
  width: 100%;
  border: 1px solid rgba(15, 15, 16, 0.12);
  border-radius: 14px;
  padding: 13px 15px;
  background: rgba(255, 255, 255, 0.94);
  color: #0f0f10;
  outline: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease, transform 0.2s ease;
}

input.input-invalid,
select.input-invalid {
  border-color: rgba(201, 71, 43, 0.72);
  box-shadow: 0 0 0 4px rgba(201, 71, 43, 0.1);
  background: rgba(255, 248, 246, 0.98);
}

input.input-valid {
  border-color: rgba(27, 127, 74, 0.36);
  box-shadow: 0 0 0 4px rgba(27, 127, 74, 0.08);
}

select:focus,
input[type='text']:focus,
textarea:focus {
  border-color: rgba(255, 122, 0, 0.58);
  box-shadow: 0 0 0 4px rgba(255, 122, 0, 0.11);
  background: #ffffff;
  transform: translateY(-1px);
}

textarea {
  font: inherit;
  min-height: 92px;
  max-height: 180px;
  resize: vertical;
  line-height: 1.55;
}

select:disabled {
  opacity: 0.52;
  cursor: not-allowed;
}

.contact-fields input:disabled {
  opacity: 0.64;
  cursor: not-allowed;
  color: rgba(15, 15, 16, 0.48);
  background: rgba(245, 245, 245, 0.96);
}

.duration-block input[type='range'] {
  width: 100%;
  accent-color: #ff7a00;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 14px;
  border: 1px solid rgba(15, 15, 16, 0.1);
  background: rgba(255, 255, 255, 0.78);
  padding: 12px 14px;
}

.checkbox-row input {
  width: 17px;
  height: 17px;
  accent-color: #ff7a00;
}

.checkbox-row span {
  color: rgba(15, 15, 16, 0.76);
  font-weight: 600;
}

.summary-card {
  border-radius: 18px;
  padding: 16px;
  border: 1px solid rgba(255, 122, 0, 0.26);
  background: linear-gradient(118deg, rgba(255, 122, 0, 0.13), rgba(255, 255, 255, 0.84));
}

.summary-card p {
  margin: 0 0 8px;
  font-size: 14px;
  color: rgba(15, 15, 16, 0.76);
}

.summary-card .total {
  margin-bottom: 7px;
  font-size: 17px;
  font-weight: 700;
  color: #0f0f10;
}

.summary-source {
  margin: 0;
  font-size: 12px;
  color: rgba(15, 15, 16, 0.52);
}

.submit-btn {
  margin-top: 4px;
  width: 100%;
  border: none;
  border-radius: 999px;
  padding: 14px;
  font-size: 15px;
  font-weight: 700;
  color: #ffffff;
  background: linear-gradient(110deg, #0f0f10 6%, #1d1e21 58%, #ff7a00 152%);
  box-shadow: 0 18px 30px rgba(15, 15, 16, 0.28);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.24s ease, box-shadow 0.24s ease, opacity 0.24s ease;
}

.submit-btn:hover:enabled {
  transform: translateY(-2px);
  box-shadow: 0 22px 36px rgba(15, 15, 16, 0.33);
}

.submit-btn:disabled {
  opacity: 0.46;
  cursor: not-allowed;
  box-shadow: none;
}

.submit-btn.is-loading::after {
  content: '';
  width: 14px;
  height: 14px;
  margin-left: 8px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.4);
  border-top-color: #ffffff;
  animation: spin 0.8s linear infinite;
}

.page-footer {
  display: grid;
  gap: 8px;
  justify-items: center;
  text-align: center;
  padding: 20px 12px 2px;
}

.footer-brand {
  margin: 0;
  font-weight: 650;
  font-size: 15px;
  color: #0f0f10;
  letter-spacing: 0.1em;
}

.footer-brand span {
  margin-left: 9px;
  font-size: 12px;
  letter-spacing: 0.24em;
  color: rgba(15, 15, 16, 0.58);
}

.footer-slogan {
  margin: 0;
  color: rgba(15, 15, 16, 0.72);
  font-size: 14px;
  letter-spacing: 0.2em;
  position: relative;
  padding-bottom: 2px;
}

.footer-slogan::after {
  content: '';
  position: absolute;
  left: 50%;
  bottom: 0;
  width: 40px;
  height: 1px;
  transform: translateX(-50%);
  background: linear-gradient(90deg, rgba(255, 122, 0, 0), rgba(255, 122, 0, 0.68), rgba(255, 122, 0, 0));
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 1080px) {
  .app-shell {
    padding: 20px clamp(14px, 3.5vw, 24px) 38px;
  }

  .content-grid {
    grid-template-columns: 1fr;
    gap: 18px;
  }

  .panel-order {
    order: 2;
  }
}

@media (max-width: 1024px) {
  select,
  input[type='text'],
  textarea,
  .submit-btn,
  .hero-link,
  .hero-cta {
    min-height: 44px;
  }
}

@media (orientation: landscape) and (max-width: 1024px) {
  .app-shell {
    padding-bottom: 22px;
  }

  .hero-surface {
    padding: 24px 20px;
  }

  .panel {
    padding: 18px;
  }
}

@media (min-width: 1600px) {
  .page-main {
    width: min(1420px, 94vw);
  }

  .content-grid {
    gap: 28px;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
}

@media (max-width: 768px) {
  .app-shell {
    padding: 16px 14px 34px;
  }

  .hero-surface {
    border-radius: 30px;
    padding: 30px 20px;
  }

  .hero h1 span {
    font-size: clamp(44px, 16vw, 62px);
  }

  .hero h1 {
    gap: 8px;
  }

  .hero h1 small {
    letter-spacing: 0.24em;
  }

  .hero-manifesto {
    font-size: 15px;
    line-height: 1.88;
  }

  .hero-transition {
    display: grid;
    align-items: start;
    gap: 14px;
  }

  .hero-actions {
    width: 100%;
  }

  .hero-link,
  .hero-cta {
    flex: 1;
    text-align: center;
    justify-content: center;
  }
}

@media (max-width: 640px) {
  .quick-filters {
    grid-template-columns: 1fr;
  }

  .contact-fields {
    grid-template-columns: 1fr;
  }

  .app-shell {
    padding-inline: 12px;
  }

  .panel {
    border-radius: 24px;
    padding: 18px;
  }

  .footer-brand span {
    display: block;
    margin: 4px 0 0;
  }
}

@media (max-width: 560px) {
  .hero-surface {
    border-radius: 24px;
    padding: 24px 16px;
  }

  .hero h1 span {
    font-size: clamp(38px, 17vw, 50px);
  }

  .hero h1 small {
    font-size: 12px;
    letter-spacing: 0.18em;
  }

  .hero-manifesto {
    font-size: 14px;
    line-height: 1.82;
  }

  .hero-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .hero-link,
  .hero-cta {
    width: 100%;
  }

  .panel-header h2 {
    font-size: 24px;
  }

  .summary-card p {
    font-size: 13px;
  }

  .summary-card .total {
    font-size: 16px;
  }

  .submit-btn {
    padding: 13px;
    font-size: 14px;
  }
}
</style>
