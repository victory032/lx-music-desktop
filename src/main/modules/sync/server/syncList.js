const path = require('path')
const fs = require('fs')
const fsPromises = fs.promises
const { app } = require('electron')
const { encryptMsg, decryptMsg } = require('./utils')
const SYNC_EVENT_NAMES = require('../event/name')
const { common: COMMON_EVENT_NAME } = require('@main/events/_name')
const { throttle } = require('@common/utils')

let io
// const checkFile = path => {
//   fsPromises.access(path, fs.constants.R_OK | fs.constants.W_OK)
//     .then(() => console.log('can access'))
//     .catch(() => console.error('cannot access'))
// }

const getRemoteListData = socket => new Promise((resolve, reject) => {
  console.log('getRemoteListData')
  const handleError = reason => {
    reject(new Error(reason))
  }
  const handleSuccess = enData => {
    socket.removeListener('disconnect', handleError)
    socket.removeListener('list:sync', handleSuccess)
    console.log('getRemoteListData', 'handleSuccess')
    const data = JSON.parse(decryptMsg(socket.data.keyInfo, enData))
    if (!data) return reject(new Error('Get remote list data failed'))
    if (data.action != 'getData') return
    resolve(data.data)
  }

  socket.on('disconnect', handleError)
  socket.on('list:sync', handleSuccess)
  socket.emit('list:sync', encryptMsg(socket.data.keyInfo, JSON.stringify({ action: 'getData', data: 'all' })))
})

const getLocalListData = () => new Promise((resolve, reject) => {
  const handleSuccess = ({ action, data }) => {
    if (action !== 'getData') return
    global.lx_event.sync.off(SYNC_EVENT_NAMES.sync_handle_list, handleSuccess)
    resolve(data)
  }
  global.lx_event.sync.on(SYNC_EVENT_NAMES.sync_handle_list, handleSuccess)
  global.lx_event.sync.sync_list({
    action: 'getData',
  })
})
const getSyncMode = keyInfo => new Promise((resolve, reject) => {
  const handleSuccess = ({ action, data }) => {
    if (action !== 'selectMode') return
    global.lx_event.sync.off(SYNC_EVENT_NAMES.sync_handle_list, handleSuccess)
    resolve(data)
  }
  global.lx_event.sync.on(SYNC_EVENT_NAMES.sync_handle_list, handleSuccess)
  global.lx_event.sync.sync_list({
    action: 'selectMode',
    data: keyInfo,
  })
})

const finishedSync = socket => {
  return socket.emit('list:sync', encryptMsg(socket.data.keyInfo, JSON.stringify({
    action: 'finished',
  })))
}

const setLocalList = listData => {
  global.lx_event.sync.sync_list({
    action: 'setData',
    data: listData,
  })
}
const setRemotelList = async(socket, listData) => {
  if (!io) return
  const sockets = await io.fetchSockets()
  for (const socket of sockets) {
    // if (excludeIds.includes(socket.data.keyInfo.clientId)) continue
    socket.emit('list:sync', encryptMsg(socket.data.keyInfo, JSON.stringify({ action: 'setData', data: listData })))
  }
}

let writeFilePromises = {}
const updateSnapshot = (path, data) => {
  console.log('updateSnapshot', path)
  let writeFilePromise = writeFilePromises[path] || Promise.resolve()
  return writeFilePromise.then(() => {
    writeFilePromise = writeFilePromises[path] = fsPromises.writeFile(path, data)
    return writeFilePromise
  })
}


const createListDataObj = listData => {
  const listDataObj = {}
  for (const list of listData.userList) listDataObj[list.id] = list
  return listDataObj
}

const handleMergeList = (sourceList, targetList, addMusicLocationType) => {
  let newList
  switch (addMusicLocationType) {
    case 'top':
      newList = [...targetList.list, ...sourceList.list]
      break
    case 'bottom':
    default:
      newList = [...sourceList.list, ...targetList.list]
      break
  }
  const map = {}
  const ids = []
  switch (addMusicLocationType) {
    case 'top':
      newList = [...targetList.list, ...sourceList.list]
      for (let i = newList.length - 1; i > -1; i--) {
        const item = newList[i]
        if (map[item.songmid]) continue
        ids.unshift(item.songmid)
        map[item.songmid] = item
      }
      break
    case 'bottom':
    default:
      newList = [...sourceList.list, ...targetList.list]
      for (const item of newList) {
        if (map[item.songmid]) continue
        ids.push(item.songmid)
        map[item.songmid] = item
      }
      break
  }
  return {
    ...sourceList,
    list: ids.map(id => map[id]),
  }
}
const mergeList = (sourceListData, targetListData) => {
  const addMusicLocationType = global.appSetting.list.addMusicLocationType
  const newListData = {}
  newListData.defaultList = handleMergeList(sourceListData.defaultList, targetListData.defaultList, addMusicLocationType)
  newListData.loveList = handleMergeList(sourceListData.loveList, targetListData.loveList, addMusicLocationType)

  const listDataObj = createListDataObj(sourceListData)
  newListData.userList = [...sourceListData.userList]

  for (const list of targetListData.userList) {
    const targetList = listDataObj[list.id]
    if (targetList) {
      targetList.list = handleMergeList(targetList, list, addMusicLocationType).list
    } else {
      newListData.userList.push(list)
    }
  }

  return newListData
}
const overwriteList = (sourceListData, targetListData) => {
  const newListData = {}
  newListData.defaultList = sourceListData.defaultList
  newListData.loveList = sourceListData.loveList

  const listDataObj = createListDataObj(sourceListData)
  newListData.userList = [...sourceListData.userList]

  for (const list of targetListData.userList) {
    const targetList = listDataObj[list.id]
    if (targetList) continue
    newListData.userList.push(list)
  }

  return newListData
}

const handleMergeListData = async socket => {
  let isSelectingMode = false
  const handleDisconnect = () => {
    if (!isSelectingMode) return
    global.lx_event.sync.sync_list({
      action: 'closeSelectMode',
    })
  }
  socket.on('disconnect', handleDisconnect)
  isSelectingMode = true
  const mode = await getSyncMode(socket.data.keyInfo)
  isSelectingMode = false
  const [remoteListData, localListData] = await Promise.all([getRemoteListData(socket), getLocalListData()])
  console.log('handleMergeListData', 'remoteListData, localListData')
  let listData
  switch (mode) {
    case 'merge_local_remote':
      listData = mergeList(localListData, remoteListData)
      break
    case 'merge_remote_local':
      listData = mergeList(remoteListData, localListData)
      break
    case 'overwrite_local_remote':
      listData = overwriteList(localListData, remoteListData)
      break
    case 'overwrite_remote_local':
      listData = overwriteList(remoteListData, localListData)
      break
    case 'overwrite_local_remote_full':
      listData = localListData
      break
    case 'overwrite_remote_local_full':
      listData = remoteListData
      break
    case 'none': return
    case 'cancel':
      socket.disconnect(true)
      throw new Error('cancel')
  }
  return listData
}

const handleSyncList = async socket => {
  const [remoteListData, localListData] = await Promise.all([getRemoteListData(socket), getLocalListData()])
  console.log('handleSyncList', 'remoteListData, localListData')
  const listData = {}
  if (localListData.defaultList.list.length || localListData.loveList.list.length || localListData.userList.length) {
    if (remoteListData.defaultList.list.length || remoteListData.loveList.list.length || remoteListData.userList.length) {
      const mergedList = await handleMergeListData(socket)
      console.log('handleMergeListData', 'mergedList')
      console.log(mergedList)
      if (!mergedList) return
      listData.defaultList = mergedList.defaultList
      listData.loveList = mergedList.loveList
      listData.userList = mergedList.userList
      setLocalList(mergedList)
      setRemotelList(socket, mergedList)
    } else {
      setRemotelList(socket, localListData)
      listData.defaultList = localListData.defaultList
      listData.loveList = localListData.loveList
      listData.userList = localListData.userList
    }
  } else {
    if (remoteListData.defaultList.list.length || remoteListData.loveList.list.length || remoteListData.userList.length) {
      setLocalList(remoteListData)
      listData.defaultList = remoteListData.defaultList
      listData.loveList = remoteListData.loveList
      listData.userList = remoteListData.userList
    } else {
      listData.defaultList = localListData.defaultList
      listData.loveList = localListData.loveList
      listData.userList = localListData.userList
    }
  }
  return updateSnapshot(socket.data.snapshotFilePath, JSON.stringify({
    defaultList: listData.defaultList,
    loveList: listData.loveList,
    userList: listData.userList,
  })).then(() => {
    socket.data.isCreatedSnapshot = true
    return listData
  })
}

const mergeListDataFromSnapshot = (sourceList, targetList, snapshotList, addMusicLocationType) => {
  const removedListIds = new Set()
  const sourceListItemIds = new Set()
  const targetListItemIds = new Set()
  for (const m of sourceList.list) sourceListItemIds.add(m.songmid)
  for (const m of targetList.list) targetListItemIds.add(m.songmid)
  for (const m of snapshotList.list) {
    if (!sourceListItemIds.has(m.songmid)) removedListIds.add(m.songmid)
  }
  for (const m of snapshotList.list) {
    if (!targetListItemIds.has(m.songmid)) removedListIds.add(m.songmid)
  }

  let newList
  const map = {}
  const ids = []
  switch (addMusicLocationType) {
    case 'top':
      newList = [...targetList.list, ...sourceList.list]
      for (let i = newList.length - 1; i > -1; i--) {
        const item = newList[i]
        if (map[item.songmid] || removedListIds.has(item.songmid)) continue
        ids.unshift(item.songmid)
        map[item.songmid] = item
      }
      break
    case 'bottom':
    default:
      newList = [...sourceList.list, ...targetList.list]
      for (const item of newList) {
        if (map[item.songmid] || removedListIds.has(item.songmid)) continue
        ids.push(item.songmid)
        map[item.songmid] = item
      }
      break
  }
  return {
    ...sourceList,
    list: ids.map(id => map[id]),
  }
}
const handleMergeListDataFromSnapshot = async(socket, snapshot) => {
  const addMusicLocationType = global.appSetting.list.addMusicLocationType
  const [remoteListData, localListData] = await Promise.all([getRemoteListData(socket), getLocalListData()])
  console.log('handleMergeListDataFromSnapshot', 'remoteListData, localListData')
  const newListData = {}
  newListData.defaultList = mergeListDataFromSnapshot(localListData.defaultList, remoteListData.defaultList, snapshot.defaultList, addMusicLocationType)
  newListData.loveList = mergeListDataFromSnapshot(localListData.loveList, remoteListData.loveList, snapshot.loveList, addMusicLocationType)
  const localUserListData = createListDataObj(localListData)
  const remoteUserListData = createListDataObj(remoteListData)
  const snapshotUserListData = createListDataObj(snapshot)
  const removedListIds = new Set()
  const localUserListIds = new Set()
  const remoteUserListIds = new Set()
  for (const l of localListData.userList) localUserListIds.add(l.id)
  for (const l of remoteListData.userList) remoteUserListIds.add(l.id)

  for (const l of snapshot.userList) {
    if (!localUserListIds.has(l.id)) removedListIds.add(l.id)
  }
  for (const l of snapshot.userList) {
    if (!remoteUserListIds.has(l.id)) removedListIds.add(l.id)
  }

  let newUserList = []
  for (const list of localListData.userList) {
    if (removedListIds.has(list.id)) continue
    const remoteList = remoteUserListData[list.id]
    let newList
    if (remoteList) {
      newList = mergeListDataFromSnapshot(list, remoteList, snapshotUserListData[list.id], addMusicLocationType)
    } else {
      newList = { ...list }
    }
    newUserList.push(newList)
  }
  for (const list of remoteListData.userList) {
    if (removedListIds.has(list.id) || localUserListData[list.id]) continue
    newUserList.push({ ...list })
  }
  newListData.userList = newUserList
  setLocalList(newListData)
  setRemotelList(socket, newListData)
  return updateSnapshot(socket.data.snapshotFilePath, JSON.stringify({
    defaultList: newListData.defaultList,
    loveList: newListData.loveList,
    userList: newListData.userList,
  })).then(() => {
    socket.data.isCreatedSnapshot = true
    return newListData
  })
}

const registerUpdateSnapshotTask = (socket, snapshot) => {
  if (!socket.data.isCreatedSnapshot) return
  const handleUpdateSnapshot = throttle(({ defaultList, loveList, userList }) => {
    if (defaultList != null) snapshot.defaultList = defaultList
    if (loveList != null) snapshot.loveList = loveList
    if (userList != null) snapshot.userList = userList
    updateSnapshot(socket.data.snapshotFilePath, JSON.stringify(snapshot))
  }, 10000)
  global.lx_event.common.on(COMMON_EVENT_NAME.saveMyList, handleUpdateSnapshot)
  socket.on('disconnect', () => {
    global.lx_event.common.off(COMMON_EVENT_NAME.saveMyList, handleUpdateSnapshot)
  })
}

const syncList = async socket => {
  socket.data.snapshotFilePath = path.join(app.getPath('userData'), `snapshot-${Buffer.from(socket.data.keyInfo.clientId).toString('hex').substring(0, 10)}.json`)
  let fileData
  let isSyncRequired = false
  try {
    fileData = await fsPromises.readFile(socket.data.snapshotFilePath)
    fileData = JSON.parse(fileData)
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    isSyncRequired = true
  }
  console.log('isSyncRequired', isSyncRequired)
  if (isSyncRequired) return handleSyncList(socket)
  return handleMergeListDataFromSnapshot(socket, fileData)
}

module.exports = (_io, socket) => {
  io = _io
  return syncList(socket).then(newListData => {
    registerUpdateSnapshotTask(socket, { ...newListData })
    return finishedSync(socket)
  })
}
