import { httpGet, cancelHttp } from '../../request'

export default {
  _musicLrcRequestObj: null,
  _musicLrcPromiseCancelFn: null,
  formatTime(time) {
    let m = parseInt(time / 60)
    let s = (time % 60).toFixed(2)
    return (m < 10 ? '0' + m : m) + ':' + (s < 10 ? '0' + s : s)
  },
  getLyric(songId) {
    if (this._musicLrcRequestObj != null) {
      cancelHttp(this._musicLrcRequestObj)
      this._musicLrcPromiseCancelFn(new Error('取消http请求'))
    }
    return new Promise((resolve, reject) => {
      this._musicLrcPromiseCancelFn = reject
      this._musicLrcRequestObj = httpGet(`https://v1.itooi.cn/kuwo/lrc?id=${songId}`, (err, resp, body) => {
        this._musicLrcRequestObj = null
        this._musicLrcPromiseCancelFn = null
        if (err) {
          console.log(err)
          reject(err)
        }
        // console.log(body.data)
        // console.log(this.transformLrc(body.data))
        resolve(body)
      })
    })
  },
}
