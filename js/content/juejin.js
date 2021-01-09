class JueJin extends Base {
  constructor(props) {
    super(props)
  }

  /**
   * 根据 文章id 下载文章，如果没传 articleId，则下载当前文章
   * @typedef {Object} Params
   * @property {string} articleId - 文章id
   * @property {boolean} shouldDownloadPic - 是否需要下载文章中的图片
   */
  async downloadArticle({ articleId, shouldDownloadPic }) {
    if (downloadCancle) return
    let { draft_id, link_url, title, content, mark_content } = await this.getArticleDetail(articleId)
    if (!title || (!content && !mark_content)) {
      this.commonHandle.errorHandler(`文章《${title || articleId}》数据获取失败` + (link_url ? `，这篇文章可能是外链: ${link_url}` : ''), content2Popup.articleError)
      return
    }
    // 早期的文章，文章详情接口只返回了文章md转换后的 html 数据，解析起来可能不是那么精确
    if (!mark_content) {
      // 去draft接口获取更准确的信息
      const draftMdContent = await this.getMyArticleDraft(draft_id)
      if (draftMdContent) {
        mark_content = draftMdContent
      }
    }
    title = this.commonHandle.getFileTitle(title) || ('未知文章名' + articleId)
    mark_content = this.clearThemeComment(mark_content)
    content = this.clearThemeComment(content)
    if (mark_content) {
      this.commonHandle.manageMdContent({ mdStr: mark_content, title, shouldDownloadPic })
    } else if (content) {
      this.commonHandle.manageContent({ htmlStr: content, title, shouldDownloadPic })
    }
  }

  /**
   * 下载当前作者的所有文章
   * @param {boolean} shouldDownloadPic 是否需要下载文章中的图片
   */
  async downloadAuthorArticles(shouldDownloadPic) {
    let articles = await this.getAllArticles(this.getArticleId())
    chrome.runtime.sendMessage({
      type: content2Popup.downloadInfo,
      data: {
        articleCount: articles.length
      }
    })
    this.commonHandle.fetchByStep(articles, article => {
      return this.downloadArticle({ articleId: article.article_id, shouldDownloadPic })
    })
  }

  /**
   * 获取文章相关信息
   * @param {string} articleId articleId
   */
  async getArticleDetail(articleId) {
    if (!articleId) {
      this.commonHandle.errorHandler('未获取到下载的文章id')
      return {}
    }
    const { code, data } = await this.commonHandle.httpRequest('https://api.juejin.cn/content_api/v1/article/detail', {
      article_id: articleId
    }, httpMethodMap.post)
    if (code !== 200 || !data || !data.data) return {}
    const article_info = data.data.article_info

    return {
      user_id: article_info.user_id,
      draft_id: article_info.draft_id,
      link_url: article_info.link_url,
      title: article_info.title,
      // 早期的文章返回 content 而不是 mark_content
      content: article_info.content,
      mark_content: article_info.mark_content
    }
  }

  /**
   * 获取当前我的文章的 draft 数据，这是我文章的原始数据，信息最准确
   * @param {string} draftId draftId
   */
  async getMyArticleDraft(draftId) {
    if (!this.getIsMyArticle()) return ''
    // 是我的文章，那么去draft接口获取更准确的信息
    const { code, data } = await this.commonHandle.httpRequest('https://juejin.cn/content_api/v1/article_draft/detail', {
      draft_id: draftId
    }, httpMethodMap.post)
    if (code !== 200) return ''
    return data.data ? data.data.article_draft.mark_content : ''
  }

  /**
   * 获取当前作者的所有文章列表数据
   */
  async getAllArticles() {
    const userId = await this.getUserId()
    if (!userId) {
      this.commonHandle.errorHandler('获取所有文章列表失败：未获取到 userId')
      return []
    }
    return await this.getArticlesByCursor('0', userId)
  }

  async getArticlesByCursor(cursor, userId, articles = []) {
    const { code, data } = await this.commonHandle.httpRequest('https://api.juejin.cn/content_api/v1/article/query_list', {
      cursor,
      sort_type: 2,
      user_id: userId
    }, httpMethodMap.post)
    if (code !== 200) {
      this.commonHandle.errorHandler(`getArticlesByCursor 获取所有文章列表失败, cursor: ${cursor}, code: ${code}`)
      return articles
    }
    articles = articles.concat(data.data)
    if (data.count > +data.cursor) {
      return await this.getArticlesByCursor(data.cursor, userId, articles)
    }
    return articles
  }

  /**
   * 当前文章是否是我的文章
   */
  async getIsMyArticle() {
    if (typeof this.isMyArticle !== null) {
      return this.isMyArticle
    }
    const ele = document.querySelector('.edit-btn')
    return this.isMyArticle = Boolean(ele && ele.textContent)
  }
  getImgExtByUrl(...params) {
    let [url, ...rest] = params
    // 可能会有跨域问题，所以统一改为新域名
    url = url.replace(/(?<=^(https?:)?\/\/)juejin.im/, 'juejin.cn').replace('http://', 'https://')
    return this.commonHandle.getImgExtByUrl(url, ...rest)
  }
  /**
   * 获取当前文章所属作者的 user_id
   * @returns {Promise<string>}
   */
  async getUserId() {
    if (this.userId) {
      return this.userId
    }
    const ele = document.querySelector('.author-info-block>a')
    if (ele) {
      const mt = ele.href.match(/^https:\/\/juejin\.cn\/user\/(\d+)/)
      if (mt) {
        this.userId = mt[1]
      }
    }
    if (!this.userId) {
      this.commonHandle.errorHandler('从页面上获取 userId 失败，开始从接口获取 userId')
      const { user_id } = await this.getArticleDetail(this.getArticleId())
      if (user_id) {
        this.userId = user_id
      }
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
    const nameEle = document.querySelector('.author-name .username span')
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
    const mt = location.href.match(/post\/(\d+)/)
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
   * 去除 md 文档开头的掘金主题字符串
   * @param {string} mdStr mdStr
   */
  clearThemeComment(mdStr) {
    if (!mdStr) return ''
    return mdStr.replace(/^---[\s\S]+?theme[\s\S]+?highlight[\s\S]+?---\s*/, '')
  }
}
