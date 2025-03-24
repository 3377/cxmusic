import { FloatingPlayer } from '@/components/FloatingPlayer'
import { colors, fontSize } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import i18n, { nowLanguage } from '@/utils/i18n'
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { Tabs } from 'expo-router'
import React, { useCallback } from 'react'
import { StyleSheet } from 'react-native'

const TabsNavigation = () => {
	const language = nowLanguage.useValue()

	// 使用useCallback确保函数引用不会频繁变化，提高性能
	const handleTabPress = useCallback((event) => {
		try {
			// 检查是否是WebDAV标签的点击
			if (event.target === 'webdav') {
				// 记录点击事件，不执行额外操作
				logError('WebDAV标签被点击', { target: event.target })

				// 如果需要，可以在这里取消默认导航并通过替代方式导航
				// event.preventDefault();
				// setTimeout(() => router.push('/webdav'), 0);
			}
		} catch (error) {
			// 记录错误但不阻止导航
			logError('标签点击错误', error)
		}
	}, [])

	// 使用自定义Tab渲染函数添加额外的安全措施
	const renderWebDAVTab = useCallback(({ color }) => {
		try {
			return <Ionicons name="cloud-outline" size={24} color={color} />
		} catch (error) {
			logError('渲染WebDAV图标失败', error)
			// 返回一个备用图标
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
								...StyleSheet.absoluteFillObject, //相当于position: 'absolute', left: 0, right: 0, top: 0, bottom: 0
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
				/>
				<Tabs.Screen
					name="favorites"
					options={{
						title: i18n.t('appTab.favorites'),
						tabBarIcon: ({ color }) => <FontAwesome name="heart" size={20} color={color} />, //当你定义 tabBarIcon 时，React Navigation 会自动传递一些参数给你，其中包括 color、focused 和 size。这些参数会根据当前 Tab 的选中状态和主题来动态变化。
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
