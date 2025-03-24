import { playbackService } from '@/constants/playbackService'
import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import LyricManager from '@/helpers/lyricManager'
import { setupWebDAV } from '@/helpers/webdavService'
import { useLogTrackPlayerState } from '@/hooks/useLogTrackPlayerState'
import { useSetupTrackPlayer } from '@/hooks/useSetupTrackPlayer'
import i18n, { setI18nConfig } from '@/utils/i18n'
import { router, SplashScreen, Stack } from 'expo-router'
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent'
import { StatusBar } from 'expo-status-bar'
import { useCallback, useEffect, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message'
import TrackPlayer from 'react-native-track-player'

SplashScreen.preventAutoHideAsync()

TrackPlayer.registerPlaybackService(() => playbackService)
setI18nConfig()

const App = () => {
	const [isInitialized, setIsInitialized] = useState(false)
	const [initError, setInitError] = useState<Error | null>(null)

	const handleTrackPlayerLoaded = useCallback(() => {
		logInfo('TrackPlayer initialized successfully')
	}, [])

	useSetupTrackPlayer({
		onLoad: handleTrackPlayerLoaded,
	})

	useLogTrackPlayerState()

	useEffect(() => {
		const initializeApp = async () => {
			try {
				// 初始化 i18n
				await setI18nConfig()
				logInfo('i18n initialized successfully')

				// 初始化 LyricManager
				await LyricManager.setup()
				logInfo('LyricManager initialized successfully')

				// 初始化 WebDAV (可选)
				try {
					await setupWebDAV()
					logInfo('WebDAV initialized successfully')
				} catch (error) {
					logError('WebDAV initialization failed, but continuing app startup:', error)
				}

				// 初始化 TrackPlayer
				await TrackPlayer.setupPlayer({
					autoHandleInterruptions: true,
				})
				logInfo('TrackPlayer initialized successfully')

				// 所有初始化完成
				setIsInitialized(true)

				// 延迟1.5秒后隐藏启动屏幕
				setTimeout(async () => {
					try {
						await SplashScreen.hideAsync()
						logInfo('SplashScreen hidden successfully')
					} catch (error) {
						logError('Error hiding splash screen:', error)
					}
				}, 1500)
			} catch (error) {
				logError('Error during app initialization:', error)
				setInitError(error as Error)
				// 即使出错也要隐藏启动屏幕，避免卡死
				try {
					await SplashScreen.hideAsync()
				} catch (e) {
					logError('Error hiding splash screen after init error:', e)
				}
			}
		}

		initializeApp()
	}, [])

	const { hasShareIntent } = useShareIntentContext()

	useEffect(() => {
		if (hasShareIntent) {
			logInfo('Share intent detected')
		}
	}, [hasShareIntent])

	const toastConfig = {
		success: (props) => (
			<BaseToast
				{...props}
				style={{ borderLeftColor: 'rgb(252,87,59)', backgroundColor: 'rgb(251,231,227)' }}
				contentContainerStyle={{ paddingHorizontal: 15 }}
				text1Style={{
					fontSize: 15,
					fontWeight: '400',
					color: 'rgb(252,87,59)',
				}}
				text2Style={{
					fontSize: 15,
					fontWeight: '400',
					color: 'rgb(252,87,59)',
				}}
			/>
		),
		error: (props) => (
			<ErrorToast
				{...props}
				style={{ borderLeftColor: 'rgb(252,87,59)', backgroundColor: 'rgb(251,231,227)' }}
				contentContainerStyle={{ paddingHorizontal: 15 }}
				text1Style={{
					fontSize: 15,
					fontWeight: '400',
					color: 'rgb(252,87,59)',
				}}
				text2Style={{
					fontSize: 15,
					fontWeight: '400',
					color: 'rgb(252,87,59)',
				}}
			/>
		),
	}

	// 如果初始化出错，仍然渲染应用但显示错误信息
	if (initError) {
		logError('App initialization failed:', initError)
	}

	return (
		<ShareIntentProvider
			options={{
				debug: true,
				resetOnBackground: true,
				onResetShareIntent: () =>
					router.replace({
						pathname: '/',
					}),
			}}
		>
			<SafeAreaProvider>
				<GestureHandlerRootView style={{ flex: 1 }}>
					<RootNavigation />
					<StatusBar style="auto" />
					<Toast config={toastConfig} />
				</GestureHandlerRootView>
			</SafeAreaProvider>
		</ShareIntentProvider>
	)
}

const RootNavigation = () => {
	return (
		<Stack>
			<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
			<Stack.Screen
				name="player"
				options={{
					presentation: 'card',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="(modals)/playList"
				options={{
					presentation: 'modal',
					gestureEnabled: true,
					gestureDirection: 'vertical',
					animationDuration: 400,
					headerShown: false,
				}}
			/>
			<Stack.Screen
				name="(modals)/addToPlaylist"
				options={{
					presentation: 'modal',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitle: i18n.t('addToPlaylist.title'),
					headerTitleStyle: {
						color: colors.text,
					},
				}}
			/>
			<Stack.Screen
				name="(modals)/settingModal"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="(modals)/importPlayList"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="(modals)/[name]"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
			<Stack.Screen
				name="(modals)/logScreen"
				options={{
					presentation: 'modal',
					headerShown: true,
					gestureEnabled: true,
					gestureDirection: 'vertical',
					headerTitle: '应用日志',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitleStyle: {
						color: colors.text,
					},
				}}
			/>
			<Stack.Screen
				name="(modals)/webdavModal"
				options={{
					presentation: 'modal',
					headerShown: false,
					gestureEnabled: true,
					gestureDirection: 'vertical',
				}}
			/>
		</Stack>
	)
}

export default App
