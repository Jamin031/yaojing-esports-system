<template>
  <div class="login-page">
    <div class="login-layout">
      <section class="brand-panel">
        <div class="panel-badge">ADMIN PORTAL</div>
        <div class="brand-main">
          <h1>曜竞</h1>
          <p>ESPORTS CLUB</p>
        </div>
        <div class="panel-slogan">为竞技而生</div>
        <div class="panel-desc">面向多网吧业务的电竞俱乐部运营管理后台</div>
        <ul class="panel-points">
          <li>权限联动</li>
          <li>订单实时协同</li>
          <li>数据统计看板</li>
        </ul>
      </section>

      <section class="login-card card-surface">
        <div class="title-cn">曜竞</div>
        <div class="title-en">ESPORTS CLUB</div>
        <div class="sub">管理员后台登录</div>

        <el-form ref="formRef" :model="form" :rules="rules" label-position="top" @keyup.enter="onSubmit">
          <el-form-item label="账号" prop="username">
            <el-input v-model="form.username" placeholder="请输入账号" size="large" />
          </el-form-item>

          <el-form-item label="密码" prop="password">
            <el-input v-model="form.password" type="password" show-password placeholder="请输入密码" size="large" />
          </el-form-item>

          <el-button type="primary" size="large" :loading="loading" class="submit" @click="onSubmit">
            登录系统
          </el-button>
        </el-form>
      </section>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useUserStore } from '../../store/user';
import { isApiSuccess } from '../../utils/api';

const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const formRef = ref();

const form = reactive({
  username: '',
  password: '',
});

const rules = {
  username: [{ required: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

function normalizeLoginError(message) {
  const text = String(message || '').toLowerCase();
  if (!text) return '账号或密码错误';
  if (
    text.includes('账号或密码错误') ||
    text.includes('user not found') ||
    text.includes('账号不存在') ||
    text.includes('用户不存在') ||
    text.includes('password') ||
    text.includes('密码错误') ||
    text.includes('invalid credentials')
  ) {
    return '账号或密码错误';
  }
  return '账号或密码错误';
}

async function onSubmit() {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  loading.value = true;
  try {
    const resp = await userStore.login(form);

    if (!isApiSuccess(resp)) {
      ElMessage.error(normalizeLoginError(resp?.message));
      return;
    }

    ElMessage.success('登录成功');
    if (userStore.role === 'store_owner') {
      router.push('/orders');
    } else {
      router.push('/dashboard');
    }
  } catch (error) {
    if (error?.response?.status === 401) return;
    const message = error?.response?.data?.message;
    if (message) {
      ElMessage.error(normalizeLoginError(message));
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(1000px 460px at -10% -18%, #ffffff 0%, rgba(255, 255, 255, 0) 70%),
    radial-gradient(740px 360px at 110% -14%, #ffe8d3 0%, rgba(255, 232, 211, 0) 68%),
    linear-gradient(180deg, #f8f8f7 0%, #f3f3f1 100%);
}

.login-layout {
  width: 100%;
  max-width: 1020px;
  border-radius: 28px;
  overflow: hidden;
  border: 1px solid #e8e8eb;
  box-shadow: 0 24px 68px rgba(15, 15, 16, 0.14);
  display: grid;
  grid-template-columns: minmax(300px, 1.05fr) minmax(300px, 0.95fr);
}

.brand-panel {
  position: relative;
  padding: 48px 42px;
  background:
    radial-gradient(320px 220px at 100% 0%, rgba(255, 122, 0, 0.22) 0%, rgba(255, 122, 0, 0) 72%),
    linear-gradient(165deg, #121315 0%, #0f0f10 46%, #16171a 100%);
  color: rgba(255, 255, 255, 0.88);
}

.panel-badge {
  display: inline-flex;
  height: 30px;
  align-items: center;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  padding: 0 12px;
  font-size: 11px;
  letter-spacing: 0.12em;
}

.brand-main {
  margin-top: 26px;
}

.brand-main h1 {
  margin: 0;
  font-size: 56px;
  line-height: 1;
  color: #ffffff;
  font-weight: 680;
  letter-spacing: 0.01em;
}

.brand-main p {
  margin: 10px 0 0;
  color: #ffb56f;
  letter-spacing: 0.24em;
  font-size: 12px;
}

.panel-desc {
  margin-top: 26px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.6;
  max-width: 320px;
}

.panel-slogan {
  margin-top: 16px;
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  border-radius: 999px;
  padding: 0 12px;
  background: rgba(255, 122, 0, 0.16);
  border: 1px solid rgba(255, 122, 0, 0.36);
  color: #ffd2ad;
  font-size: 12px;
  letter-spacing: 0.08em;
  font-weight: 600;
}

.panel-points {
  list-style: none;
  margin: 24px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
}

.panel-points li {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 13px;
}

.panel-points li::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--accent);
}

.login-card {
  padding: 40px 38px;
  border-radius: 0;
  border: none;
  box-shadow: none;
  background: linear-gradient(180deg, #ffffff 0%, #fdfdfd 100%);
}

.title-cn {
  font-size: 34px;
  font-weight: 680;
  line-height: 1;
  color: #16171a;
}

.title-en {
  margin-top: 8px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: #a26a32;
}

.sub {
  margin-top: 18px;
  margin-bottom: 24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.submit {
  width: 100%;
  margin-top: 8px;
  height: 44px;
  border-radius: 10px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .login-page {
    padding: 12px;
  }

  .login-layout {
    grid-template-columns: 1fr;
    max-width: 560px;
  }

  .brand-panel {
    padding: 28px 24px;
  }

  .brand-main h1 {
    font-size: 40px;
  }

  .panel-desc,
  .panel-points {
    margin-top: 14px;
  }

  .login-card {
    padding: 30px 24px;
  }
}
</style>
