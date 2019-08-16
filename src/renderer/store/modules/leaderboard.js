import music from '../../utils/music'
const sourceList = {}
const sources = []
for (const source of music.sources) {
  const leaderboard = music[source.id].leaderboard
  if (!leaderboard) continue
  sourceList[source.id] = leaderboard.list
  sources.push(source)
}

// state
const state = {
  list: [],
  total: 0,
  page: 1,
  limit: 30,
  key: null,
}

// getters
const getters = {
  sourceInfo: () => ({ sources, sourceList }),
  list(state) {
    return state.list
  },
  info(state) {
    return {
      total: state.total,
      limit: state.limit,
      page: state.page,
    }
  },
}

// actions
const actions = {
  getList({ state, rootState, commit }, page) {
    let source = rootState.setting.leaderboard.source
    let tabId = rootState.setting.leaderboard.tabId
    let key = `${source}${tabId}${page}}`
    if (state.list.length && state.key == key) return true
    return music[source].leaderboard.getList(tabId, page).then(result => commit('setList', { result, key }))
  },
}

// mitations
const mutations = {
  setList(state, { result, key }) {
    state.list = result.list
    state.total = result.total
    state.limit = result.limit
    state.page = result.page
    state.key = key
  },
}

export default {
  namespaced: true,
  state,
  getters,
  actions,
  mutations,
}
