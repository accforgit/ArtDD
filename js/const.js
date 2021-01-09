// popup 发给 content 的指令
const popup2Content = {
  // 获取当前文章数据
  getCurrentArticle: 0,
  // 获取当前作者的所有文章数据
  getAuthorArticle: 1,
  // 取消下载
  downloadCancle: 2
}
// content 发给 popup 的指令
const content2Popup = {
  // 获取到当前文章md字符串之后，通知 popup.js 进行下载
  downloadArticle: 3,
  // 获取到当前文章图片之后，通知 popup.js 进行下载
  downloadImg: 4,
  // 发生了一般错误
  contentError: 5,
  // 发生了文章错误
  articleError: 6,
  // 发生了图片错误
  imgError: 7,
  // 通知 popup 当前所下载文章和图片的数量信息
  downloadInfo: 8
}

// content 发给 background 的指令
const content2Bg = {
  // 跨域请求接口
  httpCORSRequest: 9,
  // 跨域获取图片的 content-type
  httpCORSImgContentType: 10,
  // 跨域请求html页面
  httpCORSHtml: 11
}

// 图片常见后缀
const imgCommonExtMap = {
  png: '.png',
  jpg: '.jpg',
  gif: '.gif',
  webp: '.webp',
  svg: '.svg'
}
// content-type 类型对应的图片后缀名
const picMime2ExtMap = {
  'image/png': imgCommonExtMap.png,
  'image/jpeg': imgCommonExtMap.jpg,
  'image/gif': imgCommonExtMap.gif,
  'image/webp': imgCommonExtMap.webp,
  'image/svg+xml': imgCommonExtMap.svg
}

// 各个平台的文章详情页所在的域名
const platformHost = {
  juejin: 'juejin.cn',
  csdn: 'blog.csdn.net',
  osChina: 'my.oschina.net',
  cnBlogs: 'www.cnblogs.com'
}
// 各个平台的文章详情页链接正则
const validPageRe = {
  // https://juejin.cn/post/:postId
  juejin: new RegExp('juejin\\.cn\\/post\\/\\d+'),
  // https://blog.csdn.net/:userId/article/details/:postId
  csdn: new RegExp('blog\\.csdn\\.net\\/.+?\\/article\\/details\\/\\d+'),
  osChina: [
    // https://my.oschina.net/u/:userId/blog/:postId
    new RegExp('my\\.oschina\\.net\\/u\\/.+?\\/blog\\/\\d+'),
    // https://my.oschina.net/:userId/blog/:postId
    new RegExp('my\\.oschina\\.net\\/.+?\\/blog\\/\\d+')
  ],
  // https://www.cnblogs.com/:userId/p/:postId.html
  cnBlogs: new RegExp('cnblogs\\.com\\/.+?\\/p\\/.+\\.html')
}

const httpMethodMap = {
  post: 'POST',
  get: "GET"
}
// markdown 中表示原样输出的字符
const markdownPreSymbol = {
  preCode: '`',
  preCodeArea: '```'
}
