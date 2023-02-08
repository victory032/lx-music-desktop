import { onBeforeUnmount, watch } from '@common/utils/vueTools'
import { setPlaybackRate as setPlayerPlaybackRate } from '@renderer/plugins/player'

import { debounce } from '@common/utils'
// import { HOTKEY_PLAYER } from '@common/hotKey'
import { playbackRate, setplaybackRate } from '@renderer/store/player/playbackRate'
import { appSetting, savePlaybackRate } from '@renderer/store/setting'

export default () => {
  const handleSavePlaybackRate = debounce(savePlaybackRate, 300)

  setplaybackRate(appSetting['player.playbackRate'])
  setPlayerPlaybackRate(appSetting['player.playbackRate'])


  const handleSetPlaybackRate = (num: number) => {
    const rate = num < 0.5 ? 0.5 : num > 2 ? 2 : num
    setplaybackRate(rate)
  }

  // const handleSetPlaybackRateUp = (step = 0.02) => {
  //   handleSetPlaybackRate(volume.value + step)
  // }
  // const handleSetPlaybackRateDown = (step = 0.02) => {
  //   handleSetPlaybackRate(volume.value - step)
  // }

  // const hotkeyVolumeUp = () => {
  //   handleSetPlaybackRateUp()
  // }
  // const hotkeyVolumeDown = () => {
  //   handleSetPlaybackRateDown()
  // }

  watch(playbackRate, rate => {
    handleSavePlaybackRate(rate)
    setPlayerPlaybackRate(rate)
  })
  watch(() => appSetting['player.playbackRate'], rate => {
    setplaybackRate(rate)
  })


  // window.key_event.on(HOTKEY_PLAYER.volume_up.action, hotkeyVolumeUp)
  // window.key_event.on(HOTKEY_PLAYER.volume_down.action, hotkeyVolumeDown)
  window.app_event.on('setPlaybackRate', handleSetPlaybackRate)

  onBeforeUnmount(() => {
    // window.key_event.off(HOTKEY_PLAYER.volume_up.action, hotkeyVolumeUp)
    // window.key_event.off(HOTKEY_PLAYER.volume_down.action, hotkeyVolumeDown)
    window.app_event.off('setPlaybackRate', handleSetPlaybackRate)
  })
}
