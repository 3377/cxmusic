import { logError, logInfo } from '@/helpers/logger'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useEffect, useRef } from 'react'
import TrackPlayer, { Capability, RatingType, RepeatMode } from 'react-native-track-player'

// 全局变量跟踪初始化状态
let isPlayerInitializing = false
let isPlayerInitialized = false

const setupPlayer = async () => {
	// 检查是否已经初始化或正在初始化
	if (isPlayerInitialized) {
		logInfo('TrackPlayer already initialized, skipping setup')
		return
	}

	if (isPlayerInitializing) {
		logInfo('TrackPlayer initialization in progress, skipping duplicate setup')
		return
	}

	try {
		isPlayerInitializing = true
		logInfo('Setting up TrackPlayer...')

		await TrackPlayer.setupPlayer({
			autoHandleInterruptions: true,
		})

		await TrackPlayer.updateOptions({
			ratingType: RatingType.Heart,
			capabilities: [
				Capability.Play,
				Capability.Pause,
				Capability.SkipToNext,
				Capability.SkipToPrevious,
				Capability.Stop,
				Capability.SeekTo,
			],
			progressUpdateEventInterval: 1,
		})

		await TrackPlayer.setVolume(1) // 默认音量1
		await TrackPlayer.setRepeatMode(RepeatMode.Queue)

		isPlayerInitialized = true
		isPlayerInitializing = false
		logInfo('TrackPlayer setup completed successfully')
	} catch (error) {
		isPlayerInitializing = false
		logError('TrackPlayer setup failed:', error)
		throw error
	}
}

export const useSetupTrackPlayer = ({ onLoad }: { onLoad?: () => void }) => {
	//useSetupTrackPlayer 这个自定义 Hook 用于初始化音乐播放器，并确保它只初始化一次。
	const setupAttempted = useRef(false) //是一个 React Hook，用于持有可变的对象，这些对象在组件的生命周期内保持不变。使用 useRef 创建一个引用 isInitialized，初始值为 false。它用于跟踪播放器是否已经初始化。

	useEffect(() => {
		//是一个 React Hook，用于在函数组件中执行副作用（如数据获取、订阅等）。
		if (setupAttempted.current) return
		setupAttempted.current = true

		setupPlayer()
			.then(async () => {
				await myTrackPlayer.setupTrackPlayer()
				onLoad?.()
			})
			.catch((error) => {
				console.error('TrackPlayer initialization error:', error)
			})
	}, [onLoad])
}
