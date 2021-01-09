class Common {
  handle = null
  
  /**
   * 通知 popup 启动下载
   * @param {{ type: string, data: any }} data 下载的信息
   */
  downloadFile(data) {
    chrome.runtime.sendMessage(data)
  }
  /**
   * 下载文章和图片
   * @param {{ md: string, imgList: string[] }} mdData mdData
   * @param {string} title title
   */
  downloadManage(mdData, title) {
    if (!mdData || !mdData.md) {
      commonHandle.errorHandler(`文章《${title}》数据解析失败`, content2Popup.articleError)
      return
    }
    // 排除掉一些无法下载的图片
    chrome.runtime.sendMessage({
      type: content2Popup.downloadInfo,
      data: {
        picCount: mdData.imgList.length
      }
    })
    const userName = this.getHandle().getUserName()
    // 下载图片
    mdData.imgList.filter(img => img.originUrl !== img.newUrl).forEach(({ originUrl, newUrl }) => {
      this.downloadFile({
        type: content2Popup.downloadImg,
        data: {
          picUrl: commonHandle.getFullUrl(originUrl),
          picName: newUrl,
          userName,
          title: this.getFileTitle(title)
        }
      })
    })
    // 下载文章
    this.downloadFile({
      type: content2Popup.downloadArticle,
      data: { userName, title: this.getFileTitle(title), content: mdData.md }
    })
  }
  /**
   * 处理 mdStr 中的 img
   * @param {Object} params
   * @param {string} params.mdStr mdStr
   * @param {string} params.title title
   * @param {boolean} params.shouldDownloadPic shouldDownloadPic
   */
  async manageMdContent({ mdStr, title, shouldDownloadPic = true }) {
    let mdData = {
      md: mdStr,
      imgList: []
    }
    if (!shouldDownloadPic) {
      this.downloadManage(mdData, title)
      return
    }
    // 使用了 mdnice 的 markdown 文章，实际上就是 html 了
    if (this.isUseMdNice(mdStr)) {
      await this.manageContent({ htmlStr: mdStr, title, shouldDownloadPic, trans2Md: false })
      return
    }
    let i = -1
    let imgList = []
    let md = ''
    const mdImgRe = new RegExp('(?<=!\\[[^\\]]*?\]\\().+?(?=\\))', 'g')
    // md 中的 ` 和 ``` 中的字符不处理，分割筛选比直接使用正则匹配快
    md = mdStr.split(markdownPreSymbol.preCodeArea).reduce((t1, str1, index1) => {
      // 奇数的肯定是两个 ``` 中间的字符，不需要处理
      if (index1 % 2 === 1) {
        return t1 + markdownPreSymbol.preCodeArea + str1 + markdownPreSymbol.preCodeArea
      }
      return t1 + str1.split(markdownPreSymbol.preCode).reduce((t2, str2, index2) => {
        // 奇数的肯定是两个 ` 中间的字符，不需要处理
        if (index2 % 2 === 1) {
          return t2 + markdownPreSymbol.preCode + str2 + markdownPreSymbol.preCode
        }
        return t2 + str2.replace(mdImgRe, mt => {
          i++
          imgList.push({
            originUrl: mt,
            newUrl: i
          })
          return i
        })
      }, '')
    }, '')
    // 会取到一些奇怪的图片链接（链接最后有空格/换行符再加上一串字符），处理下
    imgList.forEach(img => {
      img.originUrl = img.originUrl.split(/\s+/)[0]
      return img
    })
    mdData = await this.splitMdImg(md, imgList, title, true)
    this.downloadManage(mdData, title)
  }

  /**
   * 处理 htmlStr 中的 img
   * @param {Object} params html字符串
   * @param {string} params.htmlStr html字符串
   * @param {string} params.title title
   * @param {boolean} params.shouldDownloadPic shouldDownloadPic
   * @param {boolean} params.trans2Md 是否需要将传入的 htmlStr 转为 markdown 字符串
   */
  async manageContent({ htmlStr, title, shouldDownloadPic = true, trans2Md = true }) {
    if (!shouldDownloadPic && !trans2Md) {
      return this.downloadManage({
        md: htmlStr,
        imgList: []
      }, title)
    }
    let imgList = []
    let img = null
    let i = -1
    // https://github.com/domchristie/turndown
    const turndownService = new TurndownService({
      hr: '--',
      headingStyle: 'atx',
      bulletListMarker: '-',
      codeBlockStyle: 'fenced'
    })
    turndownService.use(turndownPluginGfm.gfm)
    const notTrans2Md = this.isUseMdNice(htmlStr) || trans2Md === false
    if (shouldDownloadPic) {
      turndownService.addRule('img', {
        filter: ['img'],
        replacement: function (content, node) {
          img = node.src || node.dataset.src
          i++
          imgList.push({
            originUrl: img,
            newUrl: i
          })
          return notTrans2Md ? node.outerHTML.replace(img, i) : `![img](${i})`
        }
      })
    }
    let md = htmlStr
    try {
      md = turndownService.turndown(md)
    } catch (err) {
      this.errorHandler(`文章${title} html转译为md 失败`, err)
    }
    let transImgHtmlStr = htmlStr
    if (notTrans2Md && shouldDownloadPic) {
      const docEle = this.getDOMEle(transImgHtmlStr)
      const imgAll = Array.prototype.slice.call(docEle.querySelectorAll('img'))
      const preImg = Array.prototype.slice.call(docEle.querySelectorAll('code img'))
      const imgs = imgAll.filter(img => !preImg.includes(img))
      if (imgs.length === imgList.length) {
        const datasetKey = 'mark4replace'
        const datasetRe = new RegExp(`<img[^>]+?data-${datasetKey}="(\\d+)"[^>]*>`, 'g')
        imgs.forEach((img, index) => {
          img.dataset[datasetKey] = index
        })
        transImgHtmlStr = docEle.innerHTML.replace(datasetRe, ($1, $2) => {
          return $1.replace(new RegExp(`\\sdata-${datasetKey}="\\d+"`), '').replace(/(?<=src=")[^"]+/, () => {
            return $2
          })
        })
      } else {
        this.errorHandler('获取html中的img时出错', title)
      }
    }
    const mdData = await this.splitMdImg(notTrans2Md ? transImgHtmlStr : md, imgList, title, !notTrans2Md)
    this.downloadManage(mdData, title)
  }

  /**
   * 处理文章内容中的图片
   * @param {string} md str
   * @param {any[]} imgList imgList
   * @param {string} title title
   * @param {boolean} isMarkdown 是否是 md 字符串(如果不是，那么就是 htmlStr)
   */
  async splitMdImg(md, imgList, title, isMarkdown) {
    const mimeList = await Promise.all(imgList.map(img => this.getHandle().getImgExtByUrl(img.originUrl, title)))
    imgList.forEach(obj => {
      if (mimeList[obj.newUrl] !== '') {
        obj.newUrl += mimeList[obj.newUrl]
      }
    })
    // 针对 ![img]() 和 <img /> 有不同的匹配规则
    const re = isMarkdown ? /(?<=!\[.*?\]\()\d+?(?=\))/g : /(?<=<img[^>]+?src=['"])\d+(?=['"][^>]*>)/g
    let imgItem = null
    md = md.replace(re, mt => {
      if (mimeList[mt] !== '') {
        return (mt + mimeList[mt])
      }
      imgItem = imgList.find(img => img.newUrl === +mt)
      if (imgItem) {
        imgItem.newUrl = imgItem.originUrl
        return imgItem.originUrl
      }
      this.errorHandler(`《${title}》未匹配图片 ${mt}`)
      return ''
    })
    return {
      md,
      imgList
    }
  }

  /**
   * 获取图片的后缀
   * @param {string} url 图片链接
   * @param {string} title 图片所属文章的标题
   */
  async getImgExtByUrl(url, title) {
    if (!url) return
    url = this.getFullUrl(url)
    // 先尝试直接取后缀
    const extFromUrl = this.getImgExtFromLink(url)
    if (extFromUrl) {
      return extFromUrl
    }
    try {
      const { code, data } = await this.getCORSImgContentTypeByUrl(url)
      if (code !== 200) {
        throw new Error(data)
      }
      return this.getImgExtByContentType(data)
    } catch (e) {
      this.errorHandler(`《${title}》中的图片${url}获取MIME失败，失败原因：${e.message}，此图片下载失败不会影响总体下载结果`, content2Popup.imgError)
    }
    return ''
  }
  /**
   * 尝试从图片链接上直接取图片后缀
   * @param {string} url 图片链接
   */
  getImgExtFromLink(url) {
    if (!url) return ''
    const mt = url.match(/\/.+(\.(png|jpg|svg|gif|webp))/)
    if (mt && mt[1]) {
      return mt[1]
    }
    return ''
  }
  /**
   * 有些字符不能作为文件名，需要替换下
   * @param {string} title 原始title
   */
  getFileTitle(title) {
    if (!title) return ''
    let result = title.slice(0, 128).replace(/[<>/\\|:"'*?~.]/g, '_').replace(/^\[[^\]]+\]/, '').trim()
    // 8203 我也不知道啥神仙字符
    return Array.prototype.filter.call(result, c => c.charCodeAt(0) !== 8203).join('')
  }

  /**
   * 当前文章是否使用了 mdnice
   * @param {string} md md
   */
  isUseMdNice(md) {
    // 为了防止误判，正则规则写得比较严格
    // 这个规则以后可能会因为 mdnice 的改版而发生变化
    return /^\s*<section\s+id="nice"\s+data-tool="mdnice编辑器"\s+data-website="https:\/\/www.mdnice.com"/.test(md)
  }

  /**
   * 给没加协议的url添加协议
   * @param {string} url 原始 url
   * @example
   * // returns 'https://example.com/1.png'
   * getFullUrl('//example.com/1.png')
   */
  getFullUrl(url) {
    if (!url) return
    if (url.indexOf('//') === 0) {
      return location.protocol + url
    }
    return url
  }
  /**
   * 错误处理
   * @param {string} message 错误信息
   * @param {string} type 错误类型
   */
  errorHandler(message, type) {
    console.log('Error: ', message, type)
    chrome.runtime.sendMessage({
      type: typeof type !== 'undefined' ? type : content2Popup.contentError,
      data: message
    })
  }
  /**
   * 将 htmlStr 转为 DOM，方便操作
   * @param {string} htmlStr html字符串
   */
  getDOMEle(htmlStr) {
    const ele = document.createElement('div')
    ele.innerHTML = htmlStr
    return ele
  }
  // 使用的实例
  getHandle() {
    if (this.handle) {
      return this.handle
    }
    const map = {
      [platformHost.juejin]: JueJin,
      [platformHost.csdn]: CSDN,
      [platformHost.osChina]: OSChina,
      [platformHost.cnBlogs]: CNBlogs
    }
    const Cor = map[location.hostname]
    if (!Cor) {
      return null
    }
    this.handle = new Cor(this)
    return this.handle
  }
  /**
   * 图片的后缀，不同的 content-type 后缀不一样
   * @param {string} contentType 原始 content-type 值
   */
  getImgExtByContentType(contentType) {
    const mime = Object.keys(picMime2ExtMap).find(key => {
      return contentType.includes(key)
    })
    return mime ? picMime2ExtMap[mime] : ''
  }
  /**
   * 分批请求
   * @param {any[]} list list
   * @param {Function} fn 执行的函数
   * @param {number} step 每批执行的数量
   */
  async fetchByStep(list, fn, step = 10) {
    let index = 0
    const totalLen = list.length
    let result = []
    while (index < totalLen) {
      result = result.concat(await Promise.all(list.slice(index, index + step).map(v => fn(v))))
      index = index + step
    }
    return result
  }
  /**
   * 通过请求页面链接获取页面的 html 字符串
   * @param {string} url 页面的 url
   * @param {any} [params] params
   */
  async getHTMLByUrl(url, params) {
    let data = ''
    const isCORS = new URL(url).hostname !== location.hostname
    try {
      if (isCORS) {
        const resp = await this.httpCORSHtml(url, params)
        if (resp.code !== 200) {
          throw new Error(resp.data)
        }
        data = resp.data
      } else {
        const resp = await fetch(url)
        data = await resp.text()
      }
    } catch (e) {
      this.errorHandler(`页面 ${url} 请求失败, 失败原因：${e.message}`)
    }
    return data
  }
  /**
   * 跨域请求图片链接获取 content-type
   * @param {string} url 图片链接
   */
  getCORSImgContentTypeByUrl(url) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: content2Bg.httpCORSImgContentType,
        data: { url }
      }, res => {
        resolve(res)
      })
    })
  }
  /**
   * 跨域请求 html页面
   * @param {string} url 页面链接 
   * @param {Object} [params] fetch 的第二个参数对象
   */
  httpCORSHtml(url, params) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: content2Bg.httpCORSHtml,
        data: { url, params }
      }, res => {
        resolve(res)
      })
    })
  }
  /**
   * 请求接口（可能会有跨域限制）
   * @param {string} url 接口url
   * @param {string} [data] 当 method=httpMethodMap.post 时，传递的 data
   * @param {'GET' | 'POST'} [method] 请求方法
   */
  async httpRequest(url, data, method) {
    const params = {
      method,
      mode: 'cors',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      }
    }
    if (method === httpMethodMap.post && data) {
      params.body = JSON.stringify(data)
    }
    let result = {
      code: -1,
      data: null
    }
    try {
      const resp = await fetch(url, params)
      const data = await resp.json()
      result = {
        code: resp.status,
        data
      }
    } catch (e) {
      this.errorHandler(`链接 ${url} 请求失败，${data ? ('请求参数: ' + JSON.stringify(data)) : ''}失败原因：${e.message}`)
    }
    return result
  }
  /**
   * 支持跨域请求接口，需要与 background.js 通信
   * @param {string} url 请求的 url
   * @param {Object} [params] fetch 的第二个参数对象
   */
  httpCORSRequest(url, params) {
    return new Promise(resolve => {
      chrome.runtime.sendMessage({
        type: content2Bg.httpCORSRequest,
        data: {
          url,
          params
        }
      }, res => {
        resolve(res)
      })
    })
  }
}
