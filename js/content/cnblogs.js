class CNBlogs extends Base {
  constructor(props) {
    super(props)
  }
  /**
   * 根据 文章id 下载文章，如果没传 articleId，则下载当前文章
   * @typedef {Object} Params
   * @property {string} [articleId] - 文章id
   * @property {string} url - 文章详情页链接
   * @property {string} title - 文章标题
   * @property {boolean} shouldDownloadPic - 是否需要下载文章中的图片
   */
  async downloadArticle({ articleId, url, title, shouldDownloadPic }) {
    if (downloadCancle) return
    if (!url) {
      this.commonHandle.errorHandler('未获取到 url')
      return
    }
    if (this.getIsMyArticle()) {
      // 从接口获取最原始的 md 文本
      const respData = await this.getMyArticleDraft(articleId)
      if (respData && respData.str) {
        if (respData.isMarkdown) {
          return await this.commonHandle.manageMdContent({ mdStr: respData.str, title, shouldDownloadPic })
        } else {
          return await this.commonHandle.manageContent({ htmlStr: respData.str, title, shouldDownloadPic, trans2Md: false })
        }
      }
    }
    // 不是我的文章，或者请求draft接口失败，则转译 html 为 md
    const htmlStr = await this.commonHandle.getHTMLByUrl(url)
    const htmlEle = this.commonHandle.getDOMEle(htmlStr)
    const mdHtmlEle = htmlEle.querySelector('#cnblogs_post_body')
    if (!mdHtmlEle) {
      this.commonHandle.errorHandler('解析html字符串中的md失败, 失败的文章链接:' + url, content2Popup.articleError)
      return
    }
    return await this.commonHandle.manageContent({ htmlStr: mdHtmlEle.innerHTML, title, shouldDownloadPic })
  }

  /**
   * 下载当前作者的所有文章
   * @param {boolean} shouldDownloadPic 是否需要下载文章中的图片
   */
  async downloadAuthorArticles(shouldDownloadPic) {
    let urlTitleList = await this.getAllArticles()
    if (!urlTitleList || !urlTitleList.length) {
      this.commonHandle.errorHandler('获取文章列表失败')
      return
    }
    chrome.runtime.sendMessage({
      type: content2Popup.downloadInfo,
      data: {
        articleCount: urlTitleList.length
      }
    })
    this.commonHandle.fetchByStep(urlTitleList, ({ url, title }) => {
      return this.downloadArticle({ url, title, shouldDownloadPic })
    })
  }
  /**
   * 获取当前我的文章的 draft 数据，这是我文章的原始数据，信息最准确
   * @param {string} articleId articleId
   */
  async getMyArticleDraft(articleId) {
    if (!this.getIsMyArticle()) return null
    // 是我的文章，那么去draft接口获取更准确的信息
    const { code, data } = await this.commonHandle.httpCORSRequest('https://i.cnblogs.com/api/posts/' + articleId)
    if (code !== 200 || !data.blogPost) {
      // 可能接口不对或者什么问题，后续就不再请求这个接口了
      this.isMyArticle = false
    }
    return {
      str: data.blogPost.postBody,
      isMarkdown: data.blogPost.isMarkdown
    }
  }
  /**
   * 获取当前作者的所有文章列表数据
   */
  async getAllArticles() {
    const userId = this.getUserId()
    if (!userId) {
      this.commonHandle.errorHandler('获取userID失败')
      return null
    }
    const appId = await this.getAppId()
    if (!appId) {
      return null
    }
    let pageIndex = 1
    // map 的一个作用是去重
    let pageUrlTitleMap = {}
    while (true) {
      const pageHtmlStr = await this.commonHandle.getHTMLByUrl(`https://home.cnblogs.com/ajax/feed/recent?alias=${this.getUserId()}`, this.getPageListParams(pageIndex, appId))
      if (!pageHtmlStr) {
        this.commonHandle.errorHandler('获取文章列表DOM失败')
        return null
      }
      const docEle = this.commonHandle.getDOMEle(pageHtmlStr)
      const listEle = docEle.querySelectorAll('.feed_item a.feed_link')
      if (!listEle.length) {
        this.commonHandle.errorHandler('从文章列表DOM中获取文章信息失败或者没有已发布的文章')
        return null
      }
      Array.prototype.forEach.call(listEle, ele => {
        pageUrlTitleMap[ele.href] = ele.textContent
      })
      const hasNext = Boolean(docEle.querySelector('#feed_pager_block #paging_block a.last'))
      if (!hasNext) {
        break
      }
      pageIndex++
    }
    return Object.keys(pageUrlTitleMap).map(url => ({
      url,
      articleId: this.getArticleIdByDetailUrl(url),
      title: pageUrlTitleMap[url]
    }))
  }
  /**
   * 获取文章列表页的请求参数
   * @param {number} pageIndex pageIndex
   * @param {string} appId appId
   */
  getPageListParams(pageIndex, appId) {
    return {
      method: 'POST',
      credentials: 'include',
      mode: 'cors',
      headers: {
        'content-type': 'application/json; charset=UTF-8'
      },
      body: JSON.stringify({
        appId,
        "feedListType": "me",
        pageIndex,
        "pageSize": 30,
        "groupId": ""
      })
    }
  }
  /**
   * 获取 appId
   */
  async getAppId() {
    const appIdResp = await this.commonHandle.httpCORSRequest('https://home.cnblogs.com/ajax/common/GetApplicationIdByName', {
      method: 'POST',
      headers: {
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8"
      },
      body: "applicatonName=blog"
    })
    if (!appIdResp || appIdResp.code !== 200) {
      this.commonHandle.errorHandler('获取 appId失败：' + appIdResp.data)
      return ''
    }
    return appIdResp.data
  }
  /**
   * 获取图片的后缀
   */
  async getImgExtByUrl(...params) {
    return this.commonHandle.getImgExtByUrl(...params)
  }
  /**
   * 获取当前文章作者的 id
   */
  getUserId() {
    if (this.userId) {
      return this.userId
    }
    // https://www.cnblogs.com/:userId/p/:postId.html
    let mt = location.href.match(/cnblogs\.com\/(.+?)\/p\/(.+)\.html/)
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
    const nameEle = document.querySelector('#profile_block>a')
      || document.querySelector('#author_profile_detail > a:nth-child(1)')
      || document.querySelector('#topics > div > div.postDesc > a:nth-child(2)')
      || document.getElementById('Header1_HeaderTitle')
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
    return this.articleId = this.getArticleIdByDetailUrl(location.href)
  }
  /**
   * 获取当前文章的标题
   */
  getArticleTitle() {
    if (this.articleTitle) {
      return this.articleTitle
    }
    const ele = document.getElementById('cb_post_title_url')
    if (ele) {
      this.articleTitle = this.commonHandle.getFileTitle(ele.textContent)
    }
    return this.articleTitle
  }
  /**
   * 根据文章详情页链接获取文章id
   * @param {string} url url
   */
  getArticleIdByDetailUrl(url) {
    // https://www.cnblogs.com/:userId/p/:postId.html
    let mt = url.match(/cnblogs\.com\/(.+?)\/p\/(\w+)\.html/)
    if (mt) {
      return mt[2]
    }
    return ''
  }
  /**
   * 当前文章是否是我的文章
   */
  getIsMyArticle() {
    if (this.isMyArticle !== null) {
      return this.isMyArticle
    }
    // 此选择器可能会发生变化
    const myEle = document.querySelector('#user_info>.dropdown-button')
    if (!myEle || !myEle.href) return false
    // https://home.cnblogs.com/u/:userId
    const mt = myEle.href.match(/cnblogs\.com\/u\/(.+)$/)
    if (!mt) return false
    this.isMyArticle = this.getUserId() === mt[1]
    return this.isMyArticle
  }
}
