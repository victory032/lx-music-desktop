// const { app } = require('electron')
const { mainOn } = require('../../common/ipc')

mainOn('min', event => {
  if (global.mainWindow) {
    global.mainWindow.minimize()
  }
})
mainOn('max', event => {
  if (global.mainWindow) {
    global.mainWindow.maximize()
  }
})
mainOn('close', (event, params) => {
  if (global.mainWindow) {
    // console.log('close', params)
    // global.mainWindowdow.destroy()
    // app.quit()
    global.mainWindow.close()
  }
})
