/**
 * fetch请求，支持无限跨域
 * @param {string} url 请求的链接
 * @param {Object} params fetch 的第二个参数对象
 */
async function httpCommon(url, params) {
  let resp = null
  try {
    resp = await fetch(url, params)
  } catch(e) {
    resp = {
      code: -1,
      msg: e
    }
  }
  return resp
}
/**
 * fetch请求，支持无限跨域
 * @param {string} url 请求的链接
 * @param {Object} params fetch 的第二个参数对象
 */
async function httpCommon(url, params) {
  let resp = null
  try {
    resp = await fetch(url, params)
  } catch(e) {
    resp = {
      code: -1,
      msg: e
    }
  }
  return resp
}

// 监听发来的消息
function listenMessage() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === content2Bg.httpCORSRequest) {
      httpCommon(message.data.url, message.data.params).then(data => data.json()).then(data => {
        sendResponse({
          code: 200,
          data
        })
      }).catch(e => {
        sendResponse({
          code: -1,
          data: e.message
        })
      })
      return true
    } else if (message.type === content2Bg.httpCORSImgContentType) {
      httpCommon(message.data.url, message.data.params).then(data => {
        if (data && data.headers) {
          sendResponse({
            code: 200,
            data: data.headers.get('content-type')
          })
        } else {
          sendResponse({
            code: -1,
            data: '未知错误'
          })
        }
      }).catch(e => {
        sendResponse({
          code: -1,
          data: e.message
        })
      })
      return true
    } else if (message.type === content2Bg.httpCORSHtml) {
      httpCommon(message.data.url, message.data.params)
        .then(data => data.text())
        .then(data => {
          sendResponse({
            code: 200,
            data
          })
        }).catch(e => {
          sendResponse({
            code: -1,
            data: e.message
          })
        })
      return true
    }
  })
}

listenMessage()
