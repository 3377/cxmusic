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
			// 阻止重叠导航请求
			if (isNavigating || hasNavigated) {
				logInfo('已有WebDAV导航请求正在处理中，忽略新请求')
				return
			}

			// 阻止过多的导航尝试
			if (navigationCountRef.current > 2) {
				logError('WebDAV导航尝试次数过多，已中止')
				Alert.alert('提示', '无法访问WebDAV，请稍后再试')

				// 5秒后重置计数
				setTimeout(() => {
					navigationCountRef.current = 0
					setIsNavigating(false)
					setHasNavigated(false)
				}, 5000)
				return
			}

			// 设置导航状态
			setIsNavigating(true)

			// 清除任何已有的导航定时器
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
			}

			// 使用防抖动技术防止快速点击
			debounceTimerRef.current = setTimeout(() => {
				// 标记已经开始导航流程
				setHasNavigated(true)
				navigationCountRef.current += 1

				// 安全版的导航函数
				const safeNavigate = () => {
					try {
						// 包装导航操作在try/catch内，并添加超时防护
						setTimeout(() => {
							try {
								// 打开前检查WebDAV服务是否已初始化
								import('@/helpers/webdavService')
									.then(async (webdavModule) => {
										try {
											// 检查WebDAV服务是否已初始化，如果没有则初始化
											const currentServer = webdavModule.getCurrentWebDAVServer()
											if (!currentServer) {
												logInfo('正在初始化WebDAV服务...')
												try {
													await webdavModule.setupWebDAV()
												} catch (setupError) {
													logError('WebDAV服务初始化失败，但仍将继续导航', setupError)
													// 即使初始化失败，也继续导航到WebDAV页面，页面会显示相应提示
												}
											}

											// 以避免直接重定向的方式导航
											setTimeout(() => {
												try {
													// 使用replace而不是navigate，以避免导航堆栈问题
													router.replace('/(tabs)/webdav')

													// 导航成功后，延迟重置状态
													setTimeout(() => {
														setIsNavigating(false)
														setHasNavigated(false)
													}, 1000)
												} catch (routerError) {
													logError('WebDAV页面跳转失败:', routerError)
													setIsNavigating(false)
													setHasNavigated(false)
													Alert.alert('提示', '页面加载失败，请稍后再试')
												}
											}, 100)
										} catch (error) {
											logError('WebDAV服务检查失败:', error)
											setIsNavigating(false)
											setHasNavigated(false)
										}
									})
									.catch((error) => {
										logError('无法导入WebDAV模块:', error)
										setIsNavigating(false)
										setHasNavigated(false)
									})
							} catch (navError) {
								logError('WebDAV导航执行失败:', navError)
								// 恢复状态
								setIsNavigating(false)
								setHasNavigated(false)
							}
						}, 100)
					} catch (error) {
						logError('安全导航函数执行失败:', error)
						// 恢复状态
						setIsNavigating(false)
						setHasNavigated(false)
					}
				}

				// 执行导航逻辑
				safeNavigate()
			}, 300) // 300ms防抖延迟
		} catch (error) {
			logError('WebDAV导航处理失败:', error)
			// 恢复状态
			setIsNavigating(false)
			setHasNavigated(false)
		}
	}, [hasNavigated, isNavigating])

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
