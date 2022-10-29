import { I18n } from '@lyric/plugins/i18n'

declare global {
  interface Window {
    ELECTRON_DISABLE_SECURITY_WARNINGS?: string

    i18n: I18n

    lxData: any

    setTheme: (colors: Record<string, string>) => void
    setLyricColor: (colors: Record<string, string>) => void
  }

  namespace LX {

  }

}


// declare const ELECTRON_DISABLE_SECURITY_WARNINGS: string
// declare const userApiPath: string
