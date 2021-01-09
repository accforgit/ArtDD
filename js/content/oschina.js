class OSChina extends Base {
  myHost = 'https://my.oschina.net'
  userSymbol = '$$userId$$'
  articleSymbol = '$$article$$'
  articleLinkMap = null

  constructor(props) {
    super(props)
    this.setArticleLinkMap()
  }

  setArticleLinkMap() {
    // 文章详情页链接的链接有多种形式，对应文章列表页的链接也有多种形式
    const articleLinkTypes = [{
      // https://my.oschina.net/xxx/blog/yyy
      detailRe: new RegExp('.+oschina\\.net\\/(\\w+)\\/blog/(\\d+)'),
      detailUrl: `${this.myHost}/${this.userSymbol}/blog/${this.articleSymbol}`,
      firstListUrl: `${this.myHost}/${this.userSymbol}`,
      listUrl: `${this.myHost}/${this.userSymbol}/widgets/_space_index_newest_blog?catalogId=0&type=ajax&p=`,
      draftUrl: `${this.myHost}/${this.userSymbol}/blog/write/${this.articleSymbol}`
    }, {
      // https://my.oschina.net/u/xxx/blog/yyy
      detailRe: new RegExp('.+oschina\\.net\\/u\\/(\\w+)\\/blog\\/(\\d+)'),
      detailUrl: `${this.myHost}/u/${this.userSymbol}/blog/${this.articleSymbol}`,
      firstListUrl: `${this.myHost}/u/${this.userSymbol}`,
      listUrl: `${this.myHost}/u/${this.userSymbol}/widgets/_space_index_newest_blog?catalogId=0&type=ajax&p=`,
      draftUrl: `${this.myHost}/u/${this.userSymbol}/blog/write/${this.articleSymbol}`
    }]
    const articleLinkMap = articleLinkTypes.find(type => type.detailRe.test(location.href))
    if (!articleLinkMap) {
      this.commonHandle.errorHandler('当前页面无法使用本插件')
      return
    }
    this.articleLinkMap = articleLinkMap
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
        if (respData.isMarkdown) {
          return await this.commonHandle.manageMdContent({ mdStr: respData.str, title, shouldDownloadPic })
        }
        const ele = this.commonHandle.getDOMEle(respData.str)
        return await this.commonHandle.manageContent({ htmlStr: ele.textContent, title, shouldDownloadPic, trans2Md: false })
      }
    }
    const htmlStr = await this.commonHandle.getHTMLByUrl(this.getDetailUrlById(articleId))
    const htmlEle = this.commonHandle.getDOMEle(htmlStr)
    const mdHtmlEle = htmlEle.querySelector('.article-box__content>.detail-box>.article-detail>.content')
    if (!mdHtmlEle) {
      this.commonHandle.errorHandler('解析html字符串中的md失败')
      return
    }
    // 删掉广告区域
    const adArea = mdHtmlEle.querySelector('.ad-wrap')
    if (adArea) {
      mdHtmlEle.removeChild(adArea)
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
    })
  }
  /**
   * 获取我的文章的 draft 数据
   * @param {string} articleId 所要下载的文章的id
   */
  async getMyArticleDraft(articleId) {
    if (!this.articleLinkMap.draftUrl) return null
    const url = this.articleLinkMap.draftUrl
      .replace(this.userSymbol, this.getUserId())
      .replace(this.articleSymbol, articleId)
    const resp = await this.commonHandle.getHTMLByUrl(url)
    if (!resp) return null
    const ele = this.commonHandle.getDOMEle(resp)
    const activeTypeEle = ele.querySelector('#editorTabList > a.item.active')
    let isMarkdown = true
    if (activeTypeEle && activeTypeEle.dataset.value === '4') {
      isMarkdown = false
    }
    let contentEle = ele.querySelector('#bodyEditorWrap>textarea')
    if (!contentEle) {
      this.commonHandle.errorHandler('未获取到编辑器草稿内容')
      return null
    }
    return {
      isMarkdown,
      str: contentEle.innerHTML
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
    // 文章列表总页数
    const pageListCount = await this.getPageListCount()
    const pageData = await this.commonHandle.fetchByStep(Array(pageListCount).fill(1).map((v, k) => k + 1), page => {
      return this.getArticleListDataByPage(this.getArticleListUrlByPage(page))
    })
    return pageData.reduce((t, c) => {
      if (!c) return t
      return t.concat(c)
    }, [])
  }
  // 获取文章列表页共有几页
  async getPageListCount() {
    const firstListPageUrl = this.articleLinkMap.firstListUrl.replace(this.userSymbol, this.getUserId())
    const htmlStr = await this.commonHandle.getHTMLByUrl(firstListPageUrl)
    if (!htmlStr) {
      this.commonHandle.errorHandler('获取第一页文章列表页面失败')
      return 0
    }
    const docEle = this.commonHandle.getDOMEle(htmlStr)
    const articleEleList = docEle.querySelectorAll('.space-list-container .blog-item')
    if (articleEleList.length === 0) {
      this.commonHandle.errorHandler('获取文章列表数据失败')
      return 0
    }
    const totalCountEle = docEle.querySelector('.blog-dropdown>.menu .item>.description')
    if (!totalCountEle) {
      this.commonHandle.errorHandler('获取 totalCountEle 失败')
      return
    }
    return Math.ceil(+totalCountEle.textContent.trim() / articleEleList.length)
  }
  /**
   * 获取每页文章列表页面里的数据
   * @param {string} url 文章列表页面链接 
   */
  async getArticleListDataByPage(url) {
    const htmlStr = await this.commonHandle.getHTMLByUrl(url)
    if (!htmlStr) {
      this.commonHandle.errorHandler('获取 htmlStr 失败:', url)
      return null
    }
    const docEle = this.commonHandle.getDOMEle(htmlStr)
    const articleEleList = docEle.querySelectorAll('.space-list-container .blog-item')
    if (articleEleList.length === 0) {
      this.commonHandle.errorHandler('获取文章列表数据失败')
      return null
    }
    const articleListData = []
    const getTitle = articleEle => {
      const aEle = articleEle.querySelector('.content>a.header')
      if (!aEle) {
        return articleEle.dataset.articleid
      }
      const titleNodes = Array.prototype.filter.call(aEle.childNodes, ele => ele.nodeType === 3 && ele.nodeValue.trim())
      if (titleNodes.length === 0 || !titleNodes[0].nodeValue.trim()) {
        return articleEle.dataset.articleid
      }
      return titleNodes[0].nodeValue.trim()
    }
    let articleId = ''
    for (let i = 0; i < articleEleList.length; i++) {
      articleId = articleEleList[i].dataset.articleid || articleEleList[i].dataset.id
      if (!articleId) {
        this.commonHandle.errorHandler(`获取 articleId 失败: dataset.articleid 消失, i: ${i}, url:${url}`)
        return null
      }
      articleListData.push({
        id: articleId,
        title: getTitle(articleEleList[i])
      })
    }
    return articleListData
  }
  /**
   * 获取图片的后缀
   */
  async getImgExtByUrl(...params) {
    return this.commonHandle.getImgExtByUrl(...params)
  }
  /**
   * 获取文章列表页面的url
   * @param {number|string} page page
   */
  getArticleListUrlByPage(page) {
    return this.articleLinkMap.listUrl.replace(this.userSymbol, this.getUserId()) + page
  }
  /**
   * 根据文章id获取文章所在详情页的链接
   * @param {string} articleId articleId
   */
  getDetailUrlById(articleId) {
    return this.articleLinkMap.detailUrl
      .replace(this.userSymbol, this.getUserId())
      .replace(this.articleSymbol, articleId)
  }
  /**
   * 获取当前文章作者的 id
   */
  getUserId() {
    if (this.userId) {
      return this.userId
    }
    let mt = location.href.match(this.articleLinkMap.detailRe)
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
    const nameEle = document.querySelector('.author-name')
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
    // https://my.oschina.net/u/3748584/blog/4839000
    const mt = location.href.match(this.articleLinkMap.detailRe)
    if (mt) {
      this.articleId = mt[2]
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
    const ele = document.querySelector('.article-box__title')
    if (ele) {
      this.articleTitle = this.commonHandle.getFileTitle(ele.textContent)
    }
    return this.articleTitle
  }
  /**
   * 当前文章是否是我的文章
   */
  getIsMyArticle() {
    if (this.isMyArticle !== null) {
      return this.isMyArticle
    }
    // 此选择器可能会发生变化
    let ele = document.querySelector('.article-box__meta>.item-list .manage a.item')
    if (ele && ele.textContent.trim() === '编辑') {
      return this.isMyArticle = true
    }
    ele = document.querySelector('.author-box__info>.author-name>a')
    const currentLoginUserEle = document.querySelector('#userSidebar>a')
    if (!ele || !currentLoginUserEle || currentLoginUserEle.textContent.trim() !== '个人主页') {
      return this.isMyArticle = false
    }
    return this.isMyArticle = ele.href === currentLoginUserEle.href
  }
}
