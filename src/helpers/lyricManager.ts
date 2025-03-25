/**
 * 管理当前歌曲的歌词
 */

import { hideLoading, setLoadingError, showLoading } from '@/helpers/loading'
import LyricParser from '@/utils/lrcParser'
import { isSameMediaItem } from '@/utils/mediaItem'
import { GlobalState } from '@/utils/stateMapper'
import ReactNativeTrackPlayer, { Event } from 'react-native-track-player'
import myTrackPlayer, { nowLyricState } from './trackPlayerIndex'

const lyricStateStore = new GlobalState<{
	lyricParser?: LyricParser
	lyrics: ILyric.IParsedLrc
	translationLyrics?: ILyric.IParsedLrc
	meta?: Record<string, string>
	hasTranslation: boolean
}>({
	lyrics: [],
	hasTranslation: false,
})

const currentLyricStore = new GlobalState<ILyric.IParsedLrcItem | null>(null)
export const durationStore = new GlobalState<number>(0)

function setLyricLoading() {
	showLoading('正在加载歌词...', { type: 'lyric' })
}

ReactNativeTrackPlayer.addEventListener(Event.PlaybackProgressUpdated, async (data) => {
	durationStore.setValue(data.duration)
	refreshLyric()
})

// 重新获取歌词
async function refreshLyric(fromStart?: boolean, forceRequest = false) {
	const musicItem = myTrackPlayer.getCurrentMusic()
	try {
		if (!musicItem) {
			lyricStateStore.setValue({
				lyrics: [],
				hasTranslation: false,
			})

			currentLyricStore.setValue({
				lrc: 'MusicFree',
				time: 0,
			})

			hideLoading('lyric')
			return
		}

		const currentParserMusicItem = lyricStateStore.getValue()?.lyricParser?.getCurrentMusicItem()

		const lrcSource: ILyric.ILyricSource | null | undefined = {
			rawLrc: nowLyricState.getValue() || '[00:00.00]暂无歌词',
		}

		const realtimeMusicItem = myTrackPlayer.getCurrentMusic()
		if (realtimeMusicItem) {
			if (lrcSource) {
				const parser = new LyricParser(lrcSource, musicItem, {
					offset: 0,
				})

				lyricStateStore.setValue({
					lyricParser: parser,
					lyrics: parser.getLyric(),
					translationLyrics: lrcSource.translation ? parser.getTranslationLyric() : undefined,
					meta: parser.getMeta(),
					hasTranslation: !!lrcSource.translation,
				})
				// 更新当前状态的歌词
				const currentLyric = fromStart
					? parser.getLyric()[0]
					: parser.getPosition((await myTrackPlayer.getProgress()).position).lrc
				currentLyricStore.setValue(currentLyric || null)
			} else {
				// 没有歌词
				lyricStateStore.setValue({
					lyrics: [],
					hasTranslation: false,
				})
			}
			hideLoading('lyric')
		}
	} catch (e) {
		console.log(e, 'LRC')
		const realtimeMusicItem = myTrackPlayer.getCurrentMusic()
		if (isSameMediaItem(musicItem, realtimeMusicItem)) {
			// 异常情况
			lyricStateStore.setValue({
				lyrics: [],
				hasTranslation: false,
			})
			setLoadingError('加载歌词失败: ' + (e.message || '未知错误'), 'lyric')
		}
	}
}

// 获取歌词
async function setup() {
	refreshLyric()
}

const LyricManager = {
	setup,
	useLyricState: lyricStateStore.useValue,
	getLyricState: lyricStateStore.getValue,
	useCurrentLyric: currentLyricStore.useValue,
	getCurrentLyric: currentLyricStore.getValue,
	setCurrentLyric: currentLyricStore.setValue,
	refreshLyric,
	setLyricLoading,
}

export default LyricManager
