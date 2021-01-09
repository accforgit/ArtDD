const downloadType = {
  article: 'article',
  img: 'img'
}
// 取消下载 标志位
let downloadCancle = false

// 下载 按钮
const downloadArticleEle = document.getElementById('download_current')
const downloadAuthorEle = document.getElementById('download_author')

const errorListEle = document.getElementById('error_list')
const downloadPicCheckEle = document.getElementById('pic_download_check')

const downloadItemDetailMap = {
  [downloadType.article]: {},
  [downloadType.img]: {}
}

// 下载状态
const downloadStateMap = {
  init: '0',
  pending: '1',
  done: '2'
}

const downloadInfo = {
  totalArticle: 0,
  totalPic: 0,
  hasDownloadArticle: 0,
  hasDownloadPic: 0
}
let downloadItemMap = {}

// 入口函数
async function main() {
  const _isValidPage = await isValidPage()
  if (!_isValidPage) {
    downloadBtnDisabledChange(true)
    appendError('当前页面无法使用本插件，页面链接格式不对，请查看 README.md')
    return
  }
  downloadBtnClick()
  cancelDownloadBtnClick()
  issueBtnClick()
  
  syncDownloadState()
  syncDownloadInfo()

  listenContentMessage()
  listenDownloadChange()
}

main()

// 当前是否是可以使用插件的页面
async function isValidPage() {
  const { url } = await getCurrentTabData()
  for (let k in validPageRe) {
    if (Array.isArray(validPageRe[k])) {
      if (validPageRe[k].some(re => re.test(url))) {
        return true
      }
    } else {
      if (validPageRe[k].test(url)) {
        return true
      }
    }
  }
  return false
}
// 下载按钮点击事件
function downloadBtnClick() {
  downloadArticleEle.addEventListener('click', () => {
    // 正在下载中
    if (downloadState === downloadStateMap.pending) {
      return
    }
    resetData()
    sendMessage({
      type: popup2Content.getCurrentArticle,
      shouldDownloadPic: downloadPicCheckEle.checked
    })
  })
  downloadAuthorEle.addEventListener('click', () => {
    // 正在下载中
    if (downloadState === downloadStateMap.pending) {
      return
    }
    resetData()
    sendMessage({
      type: popup2Content.getAuthorArticle,
      shouldDownloadPic: downloadPicCheckEle.checked
    })
  })
}
// 取消下载按钮点击事件
function cancelDownloadBtnClick() {
  // 取消下载点击
  document.getElementById('download_cancle').addEventListener('click', () => {
    downloadCancle = true
    downloadState = downloadStateMap.init
    sendMessage({
      type: popup2Content.downloadCancle,
      shouldDownloadPic: downloadPicCheckEle.checked
    })
    cancleDownload()
  })
}
// 发送 issue 按钮点击事件
function issueBtnClick() {
  document.getElementById('error_issue').addEventListener('click', () => {
    chrome.tabs.create({
      url: 'https://github.com/accforgit/ArtDD/issues'
    })
  })
}
// 同步下载状态
function syncDownloadState() {
  syncDataDom(window, 'downloadState', downloadStateMap.init, document.getElementById('download_state'), (ele, val) => {
    if (val === downloadStateMap.init) {
      ele.style.display = 'none'
      downloadBtnDisabledChange(false)
    } else if (val === downloadStateMap.pending) {
      ele.style.display = 'list-item'
      ele.style.color = '#f8ad13'
      ele.textContent = '下载中...（完成下载前不要退出本弹窗）'
      downloadBtnDisabledChange(true)
    } else if (val === downloadStateMap.done) {
      ele.style.display = 'list-item'
      ele.style.color = '#1890ff'
      ele.textContent = '下载完毕'
      downloadBtnDisabledChange(false)
    }
  })
}
// 同步下载信息（总数、成功、失败）
function syncDownloadInfo() {
  [
    [downloadType.article, document.querySelector('.download_article_item')],
    [downloadType.img, document.querySelector('.download_img_item')]
  ].forEach(item => {
    syncDataDom(downloadItemDetailMap[item[0]], 'total', 0, item[1].querySelector('.download_total_count'))
    syncDataDom(downloadItemDetailMap[item[0]], 'success', 0, item[1].querySelector('.download_success_count'))
    syncDataDom(downloadItemDetailMap[item[0]], 'failed', 0, item[1].querySelector('.download_failed_count'))
  })
}
// 重置数据、DOM
function resetData() {
  downloadCancle = false
  downloadState = downloadStateMap.pending
  errorListEle.innerHTML = ''
  downloadItemMap = {}
  Object.keys(downloadItemDetailMap).forEach(key => {
    downloadItemDetailMap[key].total = 0
    downloadItemDetailMap[key].success = 0
    downloadItemDetailMap[key].failed = 0
  })
}
/**
 * 下载按钮是否可点击
 * @param {boolean} disabled disabled
 */
function downloadBtnDisabledChange(disabled) {
  const btnDisabledClassName = 'btn_disabled'
  downloadArticleEle.disabled = disabled
  if (disabled) {
    downloadArticleEle.classList.add(btnDisabledClassName)
    downloadAuthorEle.classList.add(btnDisabledClassName)
  } else {
    downloadArticleEle.classList.remove(btnDisabledClassName)
    downloadAuthorEle.classList.remove(btnDisabledClassName)
  }
}
// 处理错误
function appendError(message) {
  const item = document.createElement('li')
  item.textContent = message
  item.className = 'error_li'
  errorListEle.appendChild(item)
}
// 下载信息
function updateDownloadInfo(message) {
  if (message.articleCount) {
    // totalArticle 一次就可以确定
    downloadItemDetailMap.article.total = message.articleCount
  }
  if (message.picCount) {
    // totalPic 需要分批累加
    downloadItemDetailMap.img.total += message.picCount
  }
}
// 检查是否下载完毕
function checkDownloaded() {
  if (downloadCancle) return
  if (
    downloadItemDetailMap[downloadType.article].success + downloadItemDetailMap[downloadType.article].failed >= downloadItemDetailMap[downloadType.article].total
    && downloadItemDetailMap[downloadType.img].success + downloadItemDetailMap[downloadType.img].failed >= downloadItemDetailMap[downloadType.img].total
  ) {
    downloadState = downloadStateMap.done
  }
}

// 下载 markdown 文章
function extensionDownloadMd(message) {
  const blob = new Blob([message.data.content], { type: 'text/x-markdown' })
  chrome.downloads.download({
    url: URL.createObjectURL(blob),
    filename: message.data.userName + '/' + message.data.title + '/' + 'index.md',
    conflictAction: 'uniquify',
    saveAs: false
  }, id => {
    if (id) {
      downloadItemMap[id] = {
        type: downloadType.article,
        title: message.data.title
      }
      return
    }
    if (chrome.runtime.lastError.message) {
      downloadItemDetailMap.article.failed += 1
      appendError(`《${message.data.title}》下载失败: ${chrome.runtime.lastError.message}`)
    }
  })
}
// 下载图片
function extensionDownloadImg(message) {
  if (!message.data.picUrl) {
    appendError(`《${message.data.title}》中的图片链接有问题，下载失败`)
    return
  }
  chrome.downloads.download({
    url: message.data.picUrl,
    filename: message.data.userName + '/' + message.data.title + '/' + message.data.picName,
    conflictAction: 'uniquify',
    saveAs: false
  }, id => {
    if (id) {
      downloadItemMap[id] = {
        type: downloadType.img,
        title: message.data.picUrl
      }
      return
    }
    if (chrome.runtime.lastError.message) {
      downloadItemDetailMap.img.failed += 1
      appendError(`《${message.data.title}》中的图片 ${message.data.picUrl} 下载失败: ${chrome.runtime.lastError.message} `)
    }
  })
}

// 监听从 content script 发送来的消息
function listenContentMessage() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === content2Popup.downloadArticle) {
      // 下载文章
      if (downloadCancle) return
      extensionDownloadMd(message)
    } else if (message.type === content2Popup.downloadImg) {
      // 下载图片
      if (downloadCancle) return
      extensionDownloadImg(message)
    } else if (message.type === content2Popup.downloadInfo) {
      // 更新下载信息
      updateDownloadInfo(message.data)
    } else if (message.type === content2Popup.contentError) {
      // 下载错误
      appendError(message.data, message.type)
    } else if (message.type === content2Popup.articleError) {
      // 下载文章错误
      appendError(message.data, message.type)
      downloadItemDetailMap[downloadType.article].failed += 1
      checkDownloaded()
    } else if (message.type === content2Popup.imgError) {
      // 下载图片错误
      appendError(message.data, message.type)
      downloadItemDetailMap[downloadType.img].failed += 1
      checkDownloaded()
    }
  })
}
// 监听下载
function listenDownloadChange() {
  chrome.downloads.onChanged.addListener(({ id, state }) => {
    if (!state || !state.current || state.current === 'in_progress') return
    const activeItem = downloadItemMap[id]
    if (!activeItem) {
      if (downloadCancle) return
      downloadItemDetailMap[downloadType.img].failed += 1
      downloadItemDetailMap[downloadType.article].failed += 1
      checkDownloaded()
      appendError(`未知下载id: ${id}，state: ${JSON.stringify(state)}`)
      return
    }
    if (state.current === 'complete') {
      downloadItemDetailMap[activeItem.type].success += 1
    } else {
      downloadItemDetailMap[activeItem.type].failed += 1
      appendError(`${activeItem.type}: ${activeItem.title} 下载失败，state: ${state.current}`)
    }
    checkDownloaded()
  })
}
// 向 content script 发送消息
async function sendMessage(paramData, cb) {
  const { id } = await getCurrentTabData()
  chrome.tabs.sendMessage(id, paramData, () => {
    cb && cb()
  })
}

function getCurrentTabData() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      resolve({
        id: tabs[0].id,
        url: tabs[0].url
      })
    })
  })
}

// 取消所有下载
function cancleDownload() {
  Object.keys(downloadItemMap).forEach(id => {
    chrome.downloads.cancel(+id)
  })
}

