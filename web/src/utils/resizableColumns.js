import { computed, h, reactive } from 'vue'

const DEFAULT_WIDTH = 140
const MIN_WIDTH = 60

// 为 naive-ui data-table 列配置添加表头拖拽调宽能力。
// 用法：const { columns, scrollX } = useResizableColumns([...原始列配置])
export function useResizableColumns(rawColumns) {
  const columns = reactive(rawColumns)

  columns.forEach((col) => {
    if (col.__rtWrapped || col.resizable === false || col.type === 'selection' || col.type === 'expand') return
    col.__rtWrapped = true
    const originalTitle = col.title
    col.title = () =>
      h('div', { class: 'rt-header' }, [
        h('span', { class: 'rt-title' }, typeof originalTitle === 'function' ? originalTitle() : originalTitle),
        h('span', {
          class: 'rt-handle',
          onMousedown: (e) => startDrag(e, col),
          onClick: (e) => e.stopPropagation()
        })
      ])
  })

  function startDrag(e, col) {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const th = e.target.closest('th')
    const startWidth = col.width || (th ? th.getBoundingClientRect().width : DEFAULT_WIDTH)

    function onMove(ev) {
      col.width = Math.max(MIN_WIDTH, Math.round(startWidth + ev.clientX - startX))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      document.body.classList.remove('rt-resizing')
    }
    document.body.classList.add('rt-resizing')
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const scrollX = computed(() =>
    columns.reduce((sum, col) => sum + (col.width || DEFAULT_WIDTH), 0)
  )

  return { columns, scrollX }
}
