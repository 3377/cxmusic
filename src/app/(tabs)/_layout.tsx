import { FloatingPlayer } from '@/components/FloatingPlayer'
import { colors, fontSize } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import i18n, { nowLanguage } from '@/utils/i18n'
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Tabs, router } from 'expo-router'
import React, { useCallback, useRef, useState } from 'react'
import { Alert, StyleSheet } from 'react-native'

const TabsNavigation = () => {
	const language = nowLanguage.useValue()
	const [hasNavigated, setHasNavigated] = useState(false)
	const navigationTimerRef = useRef<NodeJS.Timeout | null>(null)
	const navigationCountRef = useRef(0)

	// 使用自定义导航函数来处理WebDAV导航
	const navigateToWebDAV = useCallback(() => {
		try {
			// 防止重复快速导航
			if (hasNavigated) {
				return
			}

			// 增加导航计数，防止过多尝试导致内存问题
			navigationCountRef.current += 1
			if (navigationCountRef.current > 3) {
				logError('WebDAV导航尝试次数过多，已中止')
				Alert.alert('提示', '无法访问WebDAV，请稍后再试')
				// 重置计数
				setTimeout(() => {
					navigationCountRef.current = 0
				}, 5000)
				return
			}

			setHasNavigated(true)

			// 使用安全的路由方法
			const navigateWithDelay = () => {
				try {
					router.navigate('/(tabs)/webdav')
				} catch (error) {
					logError('导航到WebDAV失败:', error)
				}
			}

			// 延迟执行导航，给系统一些时间来处理UI状态
			navigationTimerRef.current = setTimeout(() => {
				navigateWithDelay()

				// 重置导航状态
				setTimeout(() => {
					setHasNavigated(false)
				}, 1000)
			}, 50)
		} catch (error) {
			logError('处理WebDAV导航失败:', error)
			setHasNavigated(false)
		}
	}, [hasNavigated])

	// 清理计时器
	React.useEffect(() => {
		return () => {
			if (navigationTimerRef.current) {
				clearTimeout(navigationTimerRef.current)
			}
		}
	}, [])

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
			return <Ionicons name="cloud" size={24} color={color} />
		}
	}, [])

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
