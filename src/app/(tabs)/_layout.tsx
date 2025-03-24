import { FloatingPlayer } from '@/components/FloatingPlayer'
import { colors, fontSize } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import i18n, { nowLanguage } from '@/utils/i18n'
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Tabs, router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet, Text, View } from 'react-native'

const TabsNavigation = () => {
	const language = nowLanguage.useValue()
	const [hasNavigated, setHasNavigated] = useState(false)
	const navigationTimerRef = useRef<NodeJS.Timeout | null>(null)
	const navigationCountRef = useRef(0)
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)
	const [isNavigating, setIsNavigating] = useState(false)
	const isInitialRenderRef = useRef(true)

	// 初始渲染时清除可能的导航状态
	useEffect(() => {
		if (isInitialRenderRef.current) {
			isInitialRenderRef.current = false
			// 重置所有导航状态
			navigationCountRef.current = 0
			setHasNavigated(false)
			setIsNavigating(false)
		}

		// 组件卸载时清理所有计时器
		return () => {
			if (navigationTimerRef.current) {
				clearTimeout(navigationTimerRef.current)
				navigationTimerRef.current = null
			}
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
				debounceTimerRef.current = null
			}
			// 重置导航状态
			navigationCountRef.current = 0
		}
	}, [])

	// 使用防抖技术来处理WebDAV导航
	const navigateToWebDAV = useCallback(() => {
		try {
			// 如果正在导航中,直接返回
			if (isNavigating) {
				logInfo('WebDAV导航正在进行中,忽略新请求')
				return
			}

			// 设置导航状态
			setIsNavigating(true)

			// 清除任何已有的防抖定时器
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
			}

			// 使用防抖动技术防止快速点击
			debounceTimerRef.current = setTimeout(async () => {
				try {
					// 导入WebDAV模块
					const webdavModule = await import('@/helpers/webdavService')

					// 检查WebDAV服务是否已初始化
					const currentServer = webdavModule.getCurrentWebDAVServer()
					if (!currentServer) {
						logInfo('正在初始化WebDAV服务...')
						try {
							await webdavModule.setupWebDAV()
						} catch (setupError) {
							logError('WebDAV服务初始化失败:', setupError)
							// 即使初始化失败也继续导航
						}
					}

					// 执行导航
					router.replace('/(tabs)/webdav')

					// 导航成功后重置状态
					setIsNavigating(false)
					setHasNavigated(true)
				} catch (error) {
					logError('WebDAV导航失败:', error)
					Alert.alert('提示', '页面加载失败,请稍后再试')
					// 发生错误时重置状态
					setIsNavigating(false)
					setHasNavigated(false)
				}
			}, 300) // 300ms防抖延迟
		} catch (error) {
			logError('WebDAV导航处理失败:', error)
			setIsNavigating(false)
			setHasNavigated(false)
		}
	}, [isNavigating, router])

	// 处理底部标签栏点击
	const handleTabPress = useCallback(
		(event) => {
			try {
				// 检查是否是WebDAV标签的点击
				if (event.target === 'webdav') {
					// 阻止默认导航行为
					event.preventDefault()

					// 使用我们自己的导航函数
					navigateToWebDAV()
				}
			} catch (error) {
				logError('标签点击错误:', error)
			}
		},
		[navigateToWebDAV],
	)

	// 安全的WebDAV图标渲染函数
	const renderWebDAVTab = useCallback(({ color }) => {
		try {
			return <Ionicons name="cloud-outline" size={24} color={color} />
		} catch (error) {
			logError('渲染WebDAV图标失败:', error)
			return <Ionicons name="alert-circle" size={24} color="red" />
		}
	}, [])

	// 如果发生错误，提供回退UI
	if (navigationCountRef.current > 5) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
				<Text>导航组件发生错误，请重启应用</Text>
			</View>
		)
	}

	return (
		<>
			<Tabs
				screenOptions={{
					tabBarActiveTintColor: colors.primary,
					tabBarLabelStyle: {
						fontSize: fontSize.xs,
						fontWeight: '500',
					},
					headerShown: false,
					tabBarStyle: {
						position: 'absolute',
						borderTopLeftRadius: 20,
						borderTopRightRadius: 20,
						borderTopWidth: 0,
						paddingTop: 8,
					},
					tabBarBackground: () => (
						<BlurView
							intensity={90}
							style={{
								...StyleSheet.absoluteFillObject,
								overflow: 'hidden',
								borderTopLeftRadius: 20,
								borderTopRightRadius: 20,
							}}
						/>
					),
				}}
				screenListeners={{
					tabPress: handleTabPress,
				}}
			>
				<Tabs.Screen
					name="(songs)"
					options={{
						title: i18n.t('appTab.songs'),
						tabBarIcon: ({ color }) => (
							<Ionicons name="musical-notes-sharp" size={24} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="radio"
					options={{
						title: i18n.t('appTab.radio'),
						tabBarIcon: ({ color }) => <Ionicons name="radio" size={24} color={color} />,
					}}
				/>
				<Tabs.Screen
					name="webdav"
					options={{
						title: 'WebDAV',
						tabBarIcon: renderWebDAVTab,
					}}
					// 完全禁用直接点击导航，全部通过我们的自定义导航函数处理
					listeners={{
						tabPress: (e) => {
							e.preventDefault()
							navigateToWebDAV()
						},
					}}
				/>
				<Tabs.Screen
					name="favorites"
					options={{
						title: i18n.t('appTab.favorites'),
						tabBarIcon: ({ color }) => <FontAwesome name="heart" size={20} color={color} />,
					}}
				/>
				<Tabs.Screen
					name="search"
					options={{
						title: i18n.t('appTab.search'),
						tabBarIcon: ({ color }) => (
							<MaterialCommunityIcons name="text-search" size={26} color={color} />
						),
					}}
				/>
			</Tabs>

			<FloatingPlayer
				style={{
					position: 'absolute',
					left: 8,
					right: 8,
					bottom: 78,
				}}
			/>
		</>
	)
}

export default TabsNavigation
