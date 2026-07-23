<template>
  <div class="rt-wrap">
    <n-card v-if="!isMobile" :title="title">
      <n-data-table
        :columns="columns"
        :data="data"
        :loading="loading"
        :row-key="rowKey"
        :pagination="pagination"
        :scroll-x="scrollX"
        :size="size"
      />
    </n-card>
    <template v-else>
      <div v-if="title" class="rt-cards-title">{{ title }}</div>
      <n-spin :show="loading">
        <div class="rt-cards">
          <n-empty v-if="!data.length" description="暂无数据" style="padding: 32px 0" />
          <n-card
            v-for="(row, ri) in data"
            :key="rowKey ? rowKey(row) : ri"
            size="small"
            class="rt-card"
          >
            <div v-for="col in infoCols" :key="col.key" class="rt-card-row">
              <span class="rt-card-label">{{ labelOf(col) }}</span>
              <span class="rt-card-value"><component :is="cellOf(col, row, ri)" /></span>
            </div>
            <div v-if="actionsCol" class="rt-card-actions">
              <component :is="cellOf(actionsCol, row, ri)" />
            </div>
          </n-card>
        </div>
      </n-spin>
    </template>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useIsMobile } from '../utils/responsive'
import { useResizableColumns } from '../utils/resizableColumns'

const props = defineProps({
  columns: { type: Array, required: true },
  data: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  // 默认 undefined：未传时让 n-data-table 使用自身默认的 row-key
  rowKey: { type: Function, default: undefined },
  pagination: { type: [Object, Boolean], default: false },
  title: { type: String, default: '' },
  size: { type: String, default: 'medium' }
})

const isMobile = useIsMobile()

// useResizableColumns 会把列 title 改写为渲染函数，先留存纯文本标题供卡片使用
const plainTitles = new Map()
props.columns.forEach((col) => {
  if (col.key && typeof col.title === 'string') plainTitles.set(col.key, col.title)
})

const { columns, scrollX } = useResizableColumns(props.columns)

const infoCols = computed(() => props.columns.filter((col) => col.key !== 'actions' && !col.type))
const actionsCol = computed(() => props.columns.find((col) => col.key === 'actions'))

function labelOf(col) {
  return plainTitles.get(col.key) || col.key
}

// 返回一个函数式组件来渲染单元格（支持列定义的 render 函数或纯文本值）
function cellOf(col, row, index) {
  if (col.render) return () => col.render(row, index)
  return () => {
    const v = row[col.key]
    return v == null || v === '' ? '—' : String(v)
  }
}
</script>

<style scoped>
.rt-cards-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}
.rt-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rt-card-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 3px 0;
  font-size: 14px;
}
.rt-card-label {
  flex-shrink: 0;
  font-size: 13px;
  opacity: 0.55;
}
.rt-card-value {
  min-width: 0;
  text-align: right;
  word-break: break-all;
}
.rt-card-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}
</style>
