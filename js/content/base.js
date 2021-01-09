// 基类
class Base {
  commonHandle = null
  // 当前文章是否是我的文章
  isMyArticle = null
  // 当前文章所属的作者名
  userName = ''
  // 当前文章所属的作者id
  userId = ''
  // 当前正在查看的文章id
  articleId = ''
  // 当前正在查看的文章标题
  articleTitle = ''
  constructor(commonHandle) {
    this.commonHandle = commonHandle
  }
}
