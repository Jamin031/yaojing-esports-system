const INVALID_CONTACT_MESSAGE = '生成订单失败，请填写真实微信号或手机号';
const BLOCKED_DEVICE_MESSAGE = '当前提交异常，请 5 分钟后再试';
const DEVICE_ID_REQUIRED_MESSAGE = '当前提交异常，请刷新页面后再试';

const WECHAT_REGEX = /^[A-Za-z_][A-Za-z0-9_-]{5,19}$/;
const CHINA_MOBILE_REGEX = /^1\d{10}$/;

const PUBLIC_SERVICE_NUMBERS = new Set([
  '110',
  '112',
  '114',
  '119',
  '120',
  '10000',
  '10010',
  '10086',
  '12123',
  '12306',
  '12345',
  '95533',
  '95555',
  '95566',
  '95588',
  '95599',
]);

const OBVIOUS_FAKE_PHONE_NUMBERS = new Set([
  '00000000000',
  '11111111111',
  '12312312312',
  '12345678901',
  '12345678911',
  '10987654321',
  '11112222333',
  '12121212121',
  '55555555555',
  '66666666666',
  '77777777777',
  '88888888888',
  '99999999999',
]);

const GENERAL_PLACEHOLDER_TOKENS = new Set([
  '',
  '0',
  '1',
  '11',
  '111',
  '123',
  'abc',
  'ceshi',
  'fake',
  'mei',
  'meiyou',
  'na',
  'n/a',
  'none',
  'null',
  'phone',
  'qqqqqq',
  'shouji',
  'shoujihao',
  'suibian',
  'tel',
  'test',
  'testing',
  'unknown',
  'wechat',
  'weixin',
  'weixinhao',
  'wu',
  'wx',
  'wx123',
  'wux',
  '手机',
  '手机号',
  '微信',
  '微信号',
  '无',
  '没有',
  '随便',
]);

const OBVIOUS_FAKE_WECHAT_TOKENS = new Set([
  'aaaaaa',
  'qqqqqq',
  'testtest',
  'wechat',
  'weixin',
]);

const REASON_MESSAGES = Object.freeze({
  contains_chinese: 'contains chinese characters',
  contains_space: 'contains spaces',
  empty_contact: 'contact is empty',
  phone_all_same_digits: 'phone digits are all the same',
  phone_blacklist: 'phone matched fake blacklist',
  phone_clustered_test_number: 'phone looks like a clustered test number',
  phone_invalid_format: 'phone format is invalid',
  phone_not_mobile_format: 'phone is not mainland mobile format',
  phone_repeating_pattern: 'phone digits follow a repeating pattern',
  phone_sequence_digits: 'phone digits are sequential',
  placeholder_token: 'contact is an obvious placeholder',
  public_service_number: 'contact is a public service number',
  unsupported_contact_type: 'contact is neither a valid wechat id nor a valid phone number',
  wechat_all_same_chars: 'wechat chars are all the same',
  wechat_blacklist: 'wechat matched fake blacklist',
  wechat_excessive_repeated_chars: 'wechat contains excessive repeated chars',
  wechat_invalid_format: 'wechat format is invalid',
  wechat_repeating_pattern: 'wechat follows a repeating pattern',
  wechat_starts_with_digit: 'wechat starts with a digit',
});

function uniqueReasons(reasons = []) {
  return Array.from(new Set(reasons.filter(Boolean)));
}

function normalizeContact(contact) {
  return String(contact ?? '').trim();
}

function normalizeCompactToken(value) {
  return normalizeContact(value).toLowerCase().replace(/[\s_-]+/g, '');
}

function hasChinese(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function hasWhitespace(value) {
  return /\s/.test(String(value || ''));
}

function isDigitsOnly(value) {
  return /^\d+$/.test(String(value || ''));
}

function isAllSameChars(value) {
  return /^(.)(\1)+$/.test(String(value || ''));
}

function hasExcessiveRepeatedChars(value, minRun = 6) {
  return new RegExp(`(.)\\1{${Math.max(1, minRun - 1)},}`).test(String(value || ''));
}

function isSequentialDigits(value) {
  const text = String(value || '');
  if (!/^\d{6,}$/.test(text)) {
    return false;
  }

  let ascending = true;
  let descending = true;
  for (let index = 1; index < text.length; index += 1) {
    const previousDigit = Number(text[index - 1]);
    const currentDigit = Number(text[index]);
    if (currentDigit !== (previousDigit + 1) % 10) {
      ascending = false;
    }
    if (currentDigit !== (previousDigit + 9) % 10) {
      descending = false;
    }
  }

  return ascending || descending;
}

function isRepeatingPattern(value, maxPatternLength = 5) {
  const text = String(value || '');
  if (text.length < 6) {
    return false;
  }

  const upperBound = Math.min(maxPatternLength, Math.floor(text.length / 2));
  for (let patternLength = 1; patternLength <= upperBound; patternLength += 1) {
    const pattern = text.slice(0, patternLength);
    let repeated = '';
    while (repeated.length < text.length) {
      repeated += pattern;
    }
    if (repeated.slice(0, text.length) === text) {
      return true;
    }
  }

  return false;
}

function looksLikeClusteredTestPhone(value) {
  return /^(\d)\1{3,}(\d)\2{2,}(\d)\3{2,}$/.test(String(value || ''));
}

function buildReasonSummary(reasons = []) {
  return uniqueReasons(reasons)
    .map((reason) => REASON_MESSAGES[reason] || reason)
    .join('; ');
}

function inspectPhoneRisk(contact) {
  const value = normalizeContact(contact);
  const reasons = [];

  if (!value) {
    reasons.push('empty_contact');
    return {
      fake: true,
      reasons: uniqueReasons(reasons),
    };
  }

  if (PUBLIC_SERVICE_NUMBERS.has(value)) {
    reasons.push('public_service_number');
  }

  if (!CHINA_MOBILE_REGEX.test(value)) {
    reasons.push('phone_invalid_format');
    if (!(value.startsWith('1') && value.length === 11 && isDigitsOnly(value))) {
      reasons.push('phone_not_mobile_format');
    }

    return {
      fake: true,
      reasons: uniqueReasons(reasons),
    };
  }

  if (OBVIOUS_FAKE_PHONE_NUMBERS.has(value)) {
    reasons.push('phone_blacklist');
  }
  if (isAllSameChars(value)) {
    reasons.push('phone_all_same_digits');
  }
  if (isSequentialDigits(value)) {
    reasons.push('phone_sequence_digits');
  }
  if (isRepeatingPattern(value)) {
    reasons.push('phone_repeating_pattern');
  }
  if (looksLikeClusteredTestPhone(value)) {
    reasons.push('phone_clustered_test_number');
  }

  return {
    fake: reasons.length > 0,
    reasons: uniqueReasons(reasons),
  };
}

function inspectWechatRisk(contact) {
  const value = normalizeContact(contact);
  const reasons = [];
  const compactToken = normalizeCompactToken(value);

  if (!value) {
    reasons.push('empty_contact');
    return {
      fake: true,
      reasons: uniqueReasons(reasons),
    };
  }

  if (hasChinese(value)) {
    reasons.push('contains_chinese');
  }
  if (hasWhitespace(value)) {
    reasons.push('contains_space');
  }
  if (isDigitsOnly(value)) {
    reasons.push('unsupported_contact_type');
  }
  if (GENERAL_PLACEHOLDER_TOKENS.has(compactToken)) {
    reasons.push('placeholder_token');
  }

  if (!WECHAT_REGEX.test(value)) {
    if (/^\d/.test(value)) {
      reasons.push('wechat_starts_with_digit');
    }
    reasons.push('wechat_invalid_format');
    return {
      fake: true,
      reasons: uniqueReasons(reasons),
    };
  }

  if (OBVIOUS_FAKE_WECHAT_TOKENS.has(compactToken) || GENERAL_PLACEHOLDER_TOKENS.has(compactToken)) {
    reasons.push('wechat_blacklist');
  }
  if (isAllSameChars(value)) {
    reasons.push('wechat_all_same_chars');
  }
  if (hasExcessiveRepeatedChars(value)) {
    reasons.push('wechat_excessive_repeated_chars');
  }
  if (new Set(value.toLowerCase().split('')).size <= 2 && isRepeatingPattern(value)) {
    reasons.push('wechat_repeating_pattern');
  }

  return {
    fake: reasons.length > 0,
    reasons: uniqueReasons(reasons),
  };
}

function isValidWechat(contact) {
  return WECHAT_REGEX.test(normalizeContact(contact));
}

function isValidChinaMobile(contact) {
  return CHINA_MOBILE_REGEX.test(normalizeContact(contact));
}

function isObviousFakePhone(contact) {
  return inspectPhoneRisk(contact).fake;
}

function isObviousFakeWechat(contact) {
  return inspectWechatRisk(contact).fake;
}

function evaluateContact(contact) {
  const normalizedContact = normalizeContact(contact);
  const compactToken = normalizeCompactToken(normalizedContact);
  const generalReasons = [];

  if (!normalizedContact) {
    generalReasons.push('empty_contact');
  }
  if (PUBLIC_SERVICE_NUMBERS.has(normalizedContact)) {
    generalReasons.push('public_service_number');
  }
  if (GENERAL_PLACEHOLDER_TOKENS.has(compactToken)) {
    generalReasons.push('placeholder_token');
  }
  if (hasChinese(normalizedContact)) {
    generalReasons.push('contains_chinese');
  }
  if (hasWhitespace(normalizedContact)) {
    generalReasons.push('contains_space');
  }

  if (isValidChinaMobile(normalizedContact)) {
    const phoneRisk = inspectPhoneRisk(normalizedContact);
    const reasons = uniqueReasons([...generalReasons, ...phoneRisk.reasons]);
    return {
      normalizedContact,
      contactType: 'phone',
      isValid: !phoneRisk.fake && reasons.length === 0,
      isSuspicious: phoneRisk.fake || reasons.length > 0,
      reasons,
      reasonSummary: buildReasonSummary(reasons),
      userMessage: phoneRisk.fake || reasons.length > 0 ? INVALID_CONTACT_MESSAGE : '',
    };
  }

  if (isValidWechat(normalizedContact)) {
    const wechatRisk = inspectWechatRisk(normalizedContact);
    const reasons = uniqueReasons([...generalReasons, ...wechatRisk.reasons]);
    return {
      normalizedContact,
      contactType: 'wechat',
      isValid: !wechatRisk.fake && reasons.length === 0,
      isSuspicious: wechatRisk.fake || reasons.length > 0,
      reasons,
      reasonSummary: buildReasonSummary(reasons),
      userMessage: wechatRisk.fake || reasons.length > 0 ? INVALID_CONTACT_MESSAGE : '',
    };
  }

  const fallbackRisk =
    isDigitsOnly(normalizedContact) || PUBLIC_SERVICE_NUMBERS.has(normalizedContact)
      ? inspectPhoneRisk(normalizedContact)
      : inspectWechatRisk(normalizedContact);
  const reasons = uniqueReasons([
    ...generalReasons,
    ...fallbackRisk.reasons,
    'unsupported_contact_type',
  ]);

  return {
    normalizedContact,
    contactType: isDigitsOnly(normalizedContact) ? 'phone' : 'unknown',
    isValid: false,
    isSuspicious: true,
    reasons,
    reasonSummary: buildReasonSummary(reasons),
    userMessage: INVALID_CONTACT_MESSAGE,
  };
}

function isSuspiciousContact(contact) {
  return evaluateContact(contact).isSuspicious;
}

module.exports = {
  BLOCKED_DEVICE_MESSAGE,
  CHINA_MOBILE_REGEX,
  DEVICE_ID_REQUIRED_MESSAGE,
  GENERAL_PLACEHOLDER_TOKENS,
  INVALID_CONTACT_MESSAGE,
  OBVIOUS_FAKE_PHONE_NUMBERS,
  OBVIOUS_FAKE_WECHAT_TOKENS,
  PUBLIC_SERVICE_NUMBERS,
  REASON_MESSAGES,
  WECHAT_REGEX,
  buildReasonSummary,
  evaluateContact,
  hasChinese,
  hasWhitespace,
  inspectPhoneRisk,
  inspectWechatRisk,
  isDigitsOnly,
  isObviousFakePhone,
  isObviousFakeWechat,
  isSuspiciousContact,
  isValidChinaMobile,
  isValidWechat,
  normalizeCompactToken,
  normalizeContact,
};
