class CSDN extends Base {
  xCaKey = '203803574'
  commonSignHeaders = {
    "accept": "application/json, text/plain, */*",
    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
    "x-ca-signature-headers": "x-ca-key,x-ca-nonce"
  }
  constructor(props) {
    super(props)
  }

  /**
   * 根据 文章id 下载文章，如果没传 articleId，则下载当前文章
   * @typedef {Object} Params
   * @property {string} articleId - 文章id
   * @property {string} title - 文章标题
   * @property {boolean} shouldDownloadPic - 是否需要下载文章中的图片
   */
  async downloadArticle({ articleId, title, shouldDownloadPic }) {
    if (downloadCancle) return
    if (!articleId) {
      this.commonHandle.errorHandler('未获取到 articleId')
      return
    }
    if (this.getIsMyArticle()) {
      // 从接口获取最原始的 md 文本
      const respData = await this.getMyArticleDraft(articleId)
      if (respData) {
        return await this.commonHandle.manageMdContent({ mdStr: respData.markdowncontent, title, shouldDownloadPic })
      }
    }
    // 不是我的文章，或者请求draft接口失败，则转译 html 为 md
    const htmlStr = await this.commonHandle.getHTMLByUrl(`https://blog.csdn.net/${this.getUserId()}/article/details/${articleId}`)
    const htmlEle = this.commonHandle.getDOMEle(htmlStr)
    const mdHtmlEle = htmlEle.querySelector('#content_views')
    if (!mdHtmlEle) {
      this.commonHandle.errorHandler('解析html字符串中的md失败')
      return
    }
    return await this.commonHandle.manageContent({ htmlStr: mdHtmlEle.innerHTML, title, shouldDownloadPic })
  }

  /**
   * 下载当前作者的所有文章
   * @param {boolean} shouldDownloadPic 是否需要下载文章中的图片
   */
  async downloadAuthorArticles(shouldDownloadPic) {
    let idTitleList = await this.getAllArticles()
    if (!idTitleList) {
      this.commonHandle.errorHandler('获取文章列表失败')
      return
    }
    chrome.runtime.sendMessage({
      type: content2Popup.downloadInfo,
      data: {
        articleCount: idTitleList.length
      }
    })
    this.commonHandle.fetchByStep(idTitleList, ({ id, title }) => {
      return this.downloadArticle({ articleId: id, title, shouldDownloadPic })
      // 并发太多会 failed 掉，所以这里限制一下
    }, 3)
  }

  /**
   * 获取我的文章的 draft 数据
   * @param {string} articleId 所要下载的文章的id
   */
  async getMyArticleDraft(articleId) {
    const baseUrl = 'https://bizapi.csdn.net/blog-console-api/v3/editor/getArticle'
    const resp = await this.httpRequest(`${baseUrl}/?id=${articleId}`)
    if (resp.code !== 200 || resp.data.code !== 200 || !resp.data.data) {
      this.commonHandle.errorHandler(`获取文章 draft 失败: ${articleId}`)
      // 可能是接口逻辑发生了变化，那么后续也就不要再继续请求这个接口了，当成不是我的文章来处理
      this.isMyArticle = false
      return null
    }
    return resp.data.data
  }

  /**
   * 获取当前作者的所有文章列表数据
   */
  async getAllArticles() {
    const userId = this.getUserId()
    if (!userId) {
      this.commonHandle.errorHandler('获取userID失败')
      return
    }
    const articleListBaseUrl = `https://blog.csdn.net/${userId}/article/list`
    const articleListData = await this.getArticleListDataByPage(`${articleListBaseUrl}/1`)
    if (!articleListData) {
      this.commonHandle.errorHandler('getAllArticles 获取 articleIdList 失败')
      return
    }
    // 第一页的文章列表数量（也代表着每页的数量）
    const pageSize = articleListData.idTitleList.length
    const docEle = this.commonHandle.getDOMEle(articleListData.htmlStr)
    // 文章总数
    const totalArticleCountEle = docEle.querySelector('#container-header-blog')
    if (!totalArticleCountEle) {
      this.commonHandle.errorHandler('getAllArticles 获取 totalArticleCountEle 失败')
      return
    }
    // 总文章数
    const totalArticleCount = +totalArticleCountEle.dataset.num
    // 文章列表总页数
    const totalPage = Math.ceil(totalArticleCount / pageSize)
    if (totalPage === 1) {
      return articleListData.idTitleList
    }
    const pageData = await this.commonHandle.fetchByStep(Array(totalPage - 1).fill(1).map((v, k) => k + 2), page => {
      return this.getArticleListDataByPage(`${articleListBaseUrl}/${page}`)
    })
    pageData.filter(data => data).forEach(data => {
      articleListData.idTitleList = articleListData.idTitleList.concat(data.idTitleList)
    })
    return articleListData.idTitleList
  }
  /**
   * 获取每页文章列表页面里的 文章id 数据
   * @param {string} url 文章列表页面链接 
   */
  async getArticleListDataByPage(url) {
    const htmlStr = await this.commonHandle.getHTMLByUrl(url)
    if (!htmlStr) {
      this.commonHandle.errorHandler('获取 htmlStr 失败:', url)
      return null
    }
    const docEle = this.commonHandle.getDOMEle(htmlStr)
    const articleEleList = docEle.querySelectorAll('.article-item-box')
    if (articleEleList.length === 0) {
      this.commonHandle.errorHandler('获取文章列表数据失败')
      return null
    }
    const articleListData = {
      idTitleList: [],
      htmlStr
    }
    const getTitle = articleEle => {
      const aEle = articleEle.querySelector('h4 a')
      if (!aEle) {
        return articleEle.dataset.articleid
      }
      const titleNodes = Array.prototype.filter.call(aEle.childNodes, ele => ele.nodeType === 3 && ele.nodeValue.trim())
      if (titleNodes.length === 0 || !titleNodes[0].nodeValue.trim()) {
        return articleEle.dataset.articleid
      }
      return titleNodes[0].nodeValue.trim().replace(/^(原创|转载|翻译)/, '')
    }
    let articleId = ''
    for (let i = 0; i < articleEleList.length; i++) {
      articleId = articleEleList[i].dataset.articleid
      if (!articleId) {
        this.commonHandle.errorHandler('获取 articleId 失败: dataset.articleid 消失')
        return null
      }
      articleListData.idTitleList.push({
        id: articleId,
        title: getTitle(articleEleList[i])
      })
    }
    return articleListData
  }
  /**
   * 当前文章是否是我的文章
   */
  getIsMyArticle() {
    if (this.isMyArticle !== null) {
      return this.isMyArticle
    }
    // 此选择器可能会发生变化
    const editLinkEle = document.querySelector('a.href-article-edit')
    if (!editLinkEle) {
      return this.isMyArticle = false
    }
    return this.isMyArticle = (/.+csdn\.net\/md/).test(editLinkEle.href || '')
  }
  /**
   * 获取当前文章作者的 id
   */
  getUserId() {
    if (this.userId) {
      return this.userId
    }
    const mt = location.href.match(/.+csdn\.net\/(.+?)\/article/)
    if (mt) {
      this.userId = mt[1]
    }
    return this.userId
  }
  /**
   * 获取当前文章的作者名
   */
  getUserName() {
    if (this.userName) {
      return this.userName
    }
    const nameEle = document.querySelector('.profile-intro-name-boxTop>a>.name')
    this.userName = commonHandle.getFileTitle(nameEle ? nameEle.textContent : '')
    if (!this.userName) {
      commonHandle.errorHandler('获取作者名失败')
    }
    return this.userName || this.getUserId() || '_未知作者名'
  }
  /**
   * 获取当前文章的 article_id
   */
  getArticleId() {
    if (this.articleId) {
      return this.articleId
    }
    const mt = location.href.match(/article\/details\/(\d+)/)
    if (mt) {
      this.articleId = mt[1]
    }
    return this.articleId
  }
  /**
   * 获取当前文章的标题
   */
  getArticleTitle() {
    if (this.articleTitle) {
      return this.articleTitle
    }
    const ele = document.getElementById('articleContentId') || document.querySelector('h1.title-article')
    if (ele) {
      this.articleTitle = this.commonHandle.getFileTitle(ele.textContent)
    }
    return this.articleTitle
  }
  /**
   * 获取图片的后缀
   * @param {string} url 图片链接
   * @param {string} title 图片所属文章的标题
   */
  async getImgExtByUrl(url, title) {
    const urlInstance = new URL(this.commonHandle.getFullUrl(url))
    let mt = null
    // 尝试直接取后缀
    mt = urlInstance.pathname.match(/\/.+(\.(png|jpg|svg|gif|webp))/)
    if (mt) {
      return mt[1]
    }
    if (urlInstance.hostname === 'img.blog.csdn.net') {
      url = 'https://img-blog.csdn.net' + urlInstance.pathname
    }
    try {
      const { code, data } = await this.commonHandle.getCORSImgContentTypeByUrl(url)
      if (code !== 200) {
        throw new Error(data)
      }
      return this.commonHandle.getImgExtByContentType(data)
    } catch (e) {
      this.commonHandle.errorHandler(`《${title}》中的图片${url}获取MIME失败，失败原因：${e.message}，此图片下载失败不会影响总体下载结果`, content2Popup.imgError)
    }
    return ''
  }
  /**
   * 获取uuid
   */
  getUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, e => {
      const n = 16 * Math.random() | 0 , t = 'x' === e ? n : 3 & n | 8
      return t.toString(16)
    })
  }
  /**
   * 获取加密签名
   * @param {string} uuid uuid
   * @param {string} url 请求的链接
   */
  getSign(uuid, url) {
    const urlInstance = new URL(url)
    const ekey = '9znpamsyl2c7cdrr9sas0le9vbc3r6ba'
    const sign = `GET\napplication/json, text/plain, */*\n\n\n\nx-ca-key:${this.xCaKey}\nx-ca-nonce:${uuid}\n${urlInstance.pathname}${urlInstance.search}`
    const hash = CryptoJS.HmacSHA256(sign, ekey)
    return CryptoJS.enc.Base64.stringify(hash)
  }
  /**
   * 请求接口
   * @param {string} url 接口url
   * @param {string} [data] 当 method=httpMethodMap.post 时，传递的 data
   * @param {'GET' | 'POST'} [method] 请求方法
   */
  async httpRequest(url, data, method = httpMethodMap.get) {
    const uuid = this.getUUID()
    const sign = this.getSign(uuid, url)
    const params = {
      method,
      mode: 'cors',
      credentials: 'include',
      headers: {
        ...this.commonSignHeaders,
        "x-ca-key": "203803574",
        "x-ca-nonce": uuid,
        "x-ca-signature": sign
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
      this.commonHandle.errorHandler(`链接 ${url} 请求失败，${data ? ('请求参数: ' + JSON.stringify(data)) : ''}失败原因：${e.message}`)
    }
    return result
  }
}
