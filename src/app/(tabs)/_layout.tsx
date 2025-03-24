import { FloatingPlayer } from '@/components/FloatingPlayer'
import { colors, fontSize } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import i18n, { nowLanguage } from '@/utils/i18n'
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Tabs, router } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, StyleSheet } from 'react-native'

const TabsNavigation = () => {
	const language = nowLanguage.useValue()
	const [isNavigating, setIsNavigating] = useState(false)
	const debounceTimer = useRef(null)

	// 简单的防抖函数
	const debounce = (func, wait) => {
		return (...args) => {
			if (debounceTimer.current) {
				clearTimeout(debounceTimer.current)
			}
			debounceTimer.current = setTimeout(() => {
				func.apply(null, args)
			}, wait)
		}
	}

	// 清理定时器
	useEffect(() => {
		return () => {
			if (debounceTimer.current) {
				clearTimeout(debounceTimer.current)
			}
		}
	}, [])

	// 简化的WebDAV导航函数
	const navigateToWebDAV = useCallback(
		debounce(async () => {
			// 如果正在导航中,直接返回
			if (isNavigating) return

			try {
				setIsNavigating(true)

				// 导入WebDAV模块并初始化
				const webdavModule = await import('@/helpers/webdavService')
				const currentServer = webdavModule.getCurrentWebDAVServer()

				// 如果没有当前服务器,先初始化
				if (!currentServer) {
					try {
						await webdavModule.setupWebDAV()
					} catch (setupError) {
						logError('WebDAV初始化失败:', setupError)
						// 继续导航,错误会在WebDAV页面处理
					}
				}

				// 使用统一的导航路径
				router.push('/(tabs)/webdav')
			} catch (error) {
				logError('WebDAV导航失败:', error)
				Alert.alert('提示', '无法访问WebDAV，请稍后再试')
			} finally {
				// 确保重置导航状态
				setIsNavigating(false)
			}
		}, 300),
		[isNavigating],
	)

	// 处理标签点击
	const handleTabPress = useCallback(
		(event) => {
			if (event.target === 'webdav') {
				event.preventDefault()
				navigateToWebDAV()
			}
		},
		[navigateToWebDAV],
	)

	// 渲染WebDAV图标
	const renderWebDAVTab = useCallback(
		({ color }) => {
			return isNavigating ? (
				<MaterialCommunityIcons name="cloud-sync" size={24} color={color} />
			) : (
				<Ionicons name="cloud-outline" size={24} color={color} />
			)
		},
		[isNavigating],
	)

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
