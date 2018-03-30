declare interface ChannelMap {
  style: { styles: string[] }
  'update-images': { oldsrc: string; v: number | false }
  sync: { pathToToken: Array<{ tag: string; index: number }> }
  'use-github-style': { value: boolean }
  'update-preview': {
    html: string
    renderLaTeX: boolean
    mjrenderer: MathJaxRenderer
  }
  error: { msg: string }
  'set-atom-home': { home: string }
  'get-text': void
  'get-html': void
  'get-html-svg': void
  'get-uses-github-style': void
}
declare interface ReplyMap {
  'context-menu': PointerEvent
  'zoom-in': void
  'zoom-out': void
  'html-svg-result': string
}
declare namespace Electron {
  interface IpcRenderer {
    on<T extends keyof ChannelMap>(
      channel: T,
      cb: (evt: Event, value: ChannelMap[T]) => void,
    ): IpcRenderer
    sendToHost<T extends keyof ReplyMap>(ch: T, arg: ReplyMap[T]): void
  }
  interface WebviewTag {
    send<T extends keyof ChannelMap>(channel: T, value: ChannelMap[T]): void
    addEventListener(
      s: 'ipc-message',
      h: (e: IpcMessageEventCustom) => void,
    ): void
  }
  type IpcMessageEventCustom =
    | IpcMessageEventCustomFixed<'context-menu'>
    | IpcMessageEventCustomFixed<'zoom-in'>
    | IpcMessageEventCustomFixed<'zoom-out'>
    | IpcMessageEventCustomFixed<'html-svg-result'>
  type IpcMessageEventCustomFixed<T extends keyof ReplyMap> = {
    channel: T
    args: [ReplyMap[T]]
  }
}

type MathJaxRenderer = 'SVG' | 'HTML-CSS'
