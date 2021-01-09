// 取消下载标志位
let downloadCancle = false

const commonHandle = new Common()

// 监听 popup 发来的消息
chrome.runtime.onMessage.addListener(function(data, sender, sendResponse){
  sendResponse('response ' + data.type)
  downloadCancle = false
  const handle = commonHandle.getHandle()
  if (!handle) {
    commonHandle.errorHandler('no handle')
    return
  }
  if (data.type === popup2Content.downloadCancle) {
    downloadCancle = true
  } else if (data.type === popup2Content.getCurrentArticle) {
    chrome.runtime.sendMessage({
      type: content2Popup.downloadInfo,
      data: {
        articleCount: 1
      }
    })
    handle.downloadArticle({
      articleId: handle.getArticleId(),
      shouldDownloadPic: data.shouldDownloadPic,
      title: handle.getArticleTitle && handle.getArticleTitle(),
      url: location.href
    })
  } else if (data.type === popup2Content.getAuthorArticle) {
    handle.downloadAuthorArticles(data.shouldDownloadPic)
  }
})
