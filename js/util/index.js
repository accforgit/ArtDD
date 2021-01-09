// 同步数据与DOM
function syncDataDom(obj, key, value, ele, setFn) {
  let _value = value
  const _setFn = (val) => {
    if (typeof setFn === 'function') {
      setFn(ele, val)
    } else {
      ele.textContent = val
    }
  }
  _setFn(value)
  Object.defineProperty(obj, key, {
    get() {
      return _value
    },
    set(val) {
      _setFn(val)
      _value = val
    }
  })
}

