import { httpFetch } from '../../request'
import { requestMsg } from '../../message'
import { headers, timeout } from '../options'
import { getHostIp } from '../utils'

const api_messoer = {
  getMusicUrl(songInfo, type) {
    const ip = getHostIp('ts.tempmusic.tk')
    const requestObj = httpFetch(`http://ts.tempmusic.tk/url/tx/${songInfo.songmid}/${type}`, {
      method: 'get',
      timeout,
      headers,
      host: ip,
      family: 4,
    })
    requestObj.promise = requestObj.promise.then(({ body }) => {
      return body.code === 0 ? Promise.resolve({ type, url: body.data }) : Promise.reject(new Error(requestMsg.fail))
    })
    return requestObj
  },
  getPic(songInfo) {
    return {
      promise: Promise.resolve(`https://y.gtimg.cn/music/photo_new/T002R500x500M000${songInfo.albumId}.jpg`),
    }
  },
}

export default api_messoer
