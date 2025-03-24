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
	const [isWebdavLoading, setIsWebdavLoading] = useState(false)
	const debounceTimerRef = useRef<NodeJS.Timeout | null>(null)

	// 清理所有计时器
	useEffect(() => {
		return () => {
			if (debounceTimerRef.current) {
				clearTimeout(debounceTimerRef.current)
				debounceTimerRef.current = null
			}
		}
	}, [])

	// 完全重写的WebDAV导航函数
	const navigateToWebDAV = useCallback(() => {
		// 如果已经在加载中，防止重复点击
		if (isWebdavLoading) {
			return
		}

		// 设置加载状态
		setIsWebdavLoading(true)

		// 清除现有定时器
		if (debounceTimerRef.current) {
			clearTimeout(debounceTimerRef.current)
			debounceTimerRef.current = null
		}

		// 添加防抖
		debounceTimerRef.current = setTimeout(() => {
			const setupAndNavigate = async () => {
				try {
					// 确保导入模块不会失败
					let webdavModule
					try {
						webdavModule = await import('@/helpers/webdavService')
					} catch (importError) {
						logError('导入WebDAV模块失败:', importError)
						Alert.alert('错误', '无法加载WebDAV功能')
						return false
					}

					// 尝试设置WebDAV
					try {
						await webdavModule.setupWebDAV()
					} catch (setupError) {
						logError('WebDAV设置失败:', setupError)
						// 继续尝试导航 - 错误会在WebDAV页面内处理
					}

					// 尝试导航 (使用navigate而不是replace)
					router.navigate('/(tabs)/webdav')
					return true
				} catch (error) {
					logError('WebDAV导航过程中发生错误:', error)
					Alert.alert('提示', '无法访问WebDAV，请稍后再试')
					return false
				} finally {
					// 无论成功失败都重置状态
					setIsWebdavLoading(false)
				}
			}

			// 执行导航
			setupAndNavigate()
		}, 300)
	}, [isWebdavLoading])

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

	// 渲染WebDAV图标，根据加载状态显示不同图标
	const renderWebDAVTab = useCallback(
		({ color }) => {
			try {
				if (isWebdavLoading) {
					// 显示加载中图标
					return <MaterialCommunityIcons name="cloud-sync" size={24} color={color} />
				}
				// 显示普通图标
				return <Ionicons name="cloud-outline" size={24} color={color} />
			} catch (error) {
				logError('渲染WebDAV图标失败:', error)
				return <Ionicons name="alert-circle" size={24} color="red" />
			}
		},
		[isWebdavLoading],
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
