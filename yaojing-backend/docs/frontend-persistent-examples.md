# Frontend Persistent Data Examples

## orders page (Vue 3 + Composition API)

```vue
<script setup>
import { onMounted, ref } from 'vue'
import request from '../client/axios'

const loading = ref(false)
const orders = ref([])

async function fetchOrders() {
  loading.value = true
  try {
    const res = await request.get('/orders')
    orders.value = res.data?.list || []
  } finally {
    loading.value = false
  }
}

async function confirmOrder(id) {
  await request.post(`/orders/${id}/confirm`)
  await fetchOrders()
}

onMounted(async () => {
  await fetchOrders()
})
</script>
```

## dashboard page

```vue
<script setup>
import { onMounted, ref } from 'vue'
import request from '../client/axios'

const overview = ref(null)

async function loadOverview() {
  const res = await request.get('/stats/overview')
  overview.value = res.data
}

onMounted(async () => {
  await loadOverview()
})
</script>
```

## online users page

```vue
<script setup>
import { onMounted, ref } from 'vue'
import request from '../client/axios'

const users = ref([])

async function loadOnlineUsers() {
  const res = await request.get('/online-users')
  users.value = res.data?.list || []
}

onMounted(async () => {
  await loadOnlineUsers()
})
</script>
```

## Pinia recommendation

- Persist only `token`, `userInfo`, `role`
- Do not persist order list / dashboard list in store
- Always call API in `onMounted`/route enter

