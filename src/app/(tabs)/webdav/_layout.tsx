import { StackScreenWithSearchBar } from '@/constants/layout'
import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import { defaultStyles } from '@/styles'
import { nowLanguage } from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useCallback } from 'react'
import { TouchableOpacity, View } from 'react-native'

const WebDAVScreenLayout = () => {
	const language = nowLanguage.useValue()
	const router = useRouter()

	const handleSettingsPress = useCallback(() => {
		try {
			router.push('/(modals)/webdavModal')
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
			// 如果导航失败，尝试使用延迟的方式导航，给予React Navigation更多时间完成前一个操作
			setTimeout(() => {
				try {
					router.push('/(modals)/webdavModal')
				} catch (innerError) {
					logError('再次尝试导航到WebDAV设置失败:', innerError)
				}
			}, 100)
		}
	}, [router])

	const renderHeaderRight = useCallback(() => {
		try {
			return (
				<TouchableOpacity onPress={handleSettingsPress} style={{ marginRight: 15 }}>
					<Ionicons name="settings-outline" size={24} color={colors.primary} />
				</TouchableOpacity>
			)
		} catch (error) {
			logError('渲染WebDAV页面头部按钮失败:', error)
			return null
		}
	}, [handleSettingsPress])

	return (
		<View style={defaultStyles.container}>
			<Stack>
				<Stack.Screen
					name="index"
					options={{
						...StackScreenWithSearchBar,
						headerTitle: 'WebDAV',
						headerStyle: {
							backgroundColor: colors.background,
						},
						headerTintColor: colors.primary,
						headerRight: renderHeaderRight,
					}}
				/>
			</Stack>
		</View>
	)
}

export default WebDAVScreenLayout
