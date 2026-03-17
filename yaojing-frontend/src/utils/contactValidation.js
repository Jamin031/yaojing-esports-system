import contactRisk from '@shared/contactRisk.js'

const {
  inspectPhoneRisk,
  inspectWechatRisk,
  isValidChinaMobile,
  isValidWechat,
  normalizeContact,
} = contactRisk

export const CONTACT_TYPE_OPTIONS = Object.freeze([
  { label: '微信号', value: 'wechat' },
  { label: '手机号', value: 'phone' },
])

export const CONTACT_TYPE_MESSAGES = Object.freeze({
  required: '请选择联系方式类型',
  unknown: '请选择有效的联系方式类型',
  wechat_empty: '请输入微信号',
  wechat_invalid: '微信号需以字母或下划线开头，长度 6-20 位',
  wechat_fake: '请输入真实微信号',
  wechat_success: '已识别为可用微信号',
  phone_empty: '请输入手机号',
  phone_invalid: '手机号需为 11 位中国大陆手机号',
  phone_fake: '请输入真实手机号',
  phone_success: '已识别为可用手机号',
})

function buildValidationResult({ isValid, type, message, helperState }) {
  return {
    isValid,
    type,
    message,
    helperState,
  }
}

function validateWechat(contact) {
  const value = normalizeContact(contact)
  if (!value) {
    return buildValidationResult({
      isValid: false,
      type: 'wechat',
      message: CONTACT_TYPE_MESSAGES.wechat_empty,
      helperState: 'neutral',
    })
  }

  if (!isValidWechat(value)) {
    return buildValidationResult({
      isValid: false,
      type: 'wechat',
      message: CONTACT_TYPE_MESSAGES.wechat_invalid,
      helperState: 'error',
    })
  }

  const risk = inspectWechatRisk(value)
  if (risk.fake) {
    return buildValidationResult({
      isValid: false,
      type: 'wechat',
      message: CONTACT_TYPE_MESSAGES.wechat_fake,
      helperState: 'error',
    })
  }

  return buildValidationResult({
    isValid: true,
    type: 'wechat',
    message: CONTACT_TYPE_MESSAGES.wechat_success,
    helperState: 'success',
  })
}

function validatePhone(contact) {
  const value = normalizeContact(contact)
  if (!value) {
    return buildValidationResult({
      isValid: false,
      type: 'phone',
      message: CONTACT_TYPE_MESSAGES.phone_empty,
      helperState: 'neutral',
    })
  }

  if (!isValidChinaMobile(value)) {
    return buildValidationResult({
      isValid: false,
      type: 'phone',
      message: CONTACT_TYPE_MESSAGES.phone_invalid,
      helperState: 'error',
    })
  }

  const risk = inspectPhoneRisk(value)
  if (risk.fake) {
    return buildValidationResult({
      isValid: false,
      type: 'phone',
      message: CONTACT_TYPE_MESSAGES.phone_fake,
      helperState: 'error',
    })
  }

  return buildValidationResult({
    isValid: true,
    type: 'phone',
    message: CONTACT_TYPE_MESSAGES.phone_success,
    helperState: 'success',
  })
}

export function validateContactInput(contact, contactType) {
  const normalizedType = String(contactType || '').trim().toLowerCase()
  const normalizedContact = normalizeContact(contact)

  if (!normalizedType) {
    return buildValidationResult({
      isValid: false,
      type: 'contact_type',
      message: CONTACT_TYPE_MESSAGES.required,
      helperState: normalizedContact ? 'error' : 'neutral',
    })
  }

  if (normalizedType === 'wechat') {
    return validateWechat(normalizedContact)
  }

  if (normalizedType === 'phone') {
    return validatePhone(normalizedContact)
  }

  return buildValidationResult({
    isValid: false,
    type: 'contact_type',
    message: CONTACT_TYPE_MESSAGES.unknown,
    helperState: 'error',
  })
}
