import { StackScreenWithSearchBar } from '@/constants/layout'
import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import { defaultStyles } from '@/styles'
import { nowLanguage } from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Text, TouchableOpacity, View } from 'react-native'

// 错误边界组件
class ErrorBoundary extends React.Component {
	state = { hasError: false, errorInfo: '' }

	static getDerivedStateFromError(error) {
		return { hasError: true }
	}

	componentDidCatch(error, errorInfo) {
		logError('WebDAV视图错误:', error, errorInfo)
		this.setState({ errorInfo: error.toString() })
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={[defaultStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
					<Text style={{ fontSize: 18, marginBottom: 20, textAlign: 'center' }}>
						加载WebDAV视图时出错
					</Text>
					<TouchableOpacity
						style={{
							backgroundColor: colors.primary,
							paddingHorizontal: 20,
							paddingVertical: 10,
							borderRadius: 5,
						}}
						onPress={() => this.setState({ hasError: false })}
					>
						<Text style={{ color: '#fff' }}>重试</Text>
					</TouchableOpacity>
				</View>
			)
		}

		return this.props.children
	}
}

// 安全的头部按钮组件
const SafeHeaderRight = ({ onPress }) => {
	try {
		return (
			<TouchableOpacity onPress={onPress} style={{ marginRight: 15 }}>
				<Ionicons name="settings-outline" size={24} color={colors.primary} />
			</TouchableOpacity>
		)
	} catch (error) {
		logError('渲染WebDAV页面头部按钮失败:', error)
		return null
	}
}

const WebDAVScreenLayout = () => {
	const language = nowLanguage.useValue()
	const router = useRouter()
	const [isRouterReady, setIsRouterReady] = useState(false)

	// 组件挂载后延迟设置路由器状态
	useEffect(() => {
		const timer = setTimeout(() => {
			setIsRouterReady(true)
		}, 300)
		return () => clearTimeout(timer)
	}, [])

	const handleSettingsPress = useCallback(() => {
		if (!isRouterReady) {
			logError('路由器未就绪，无法导航')
			Alert.alert('提示', '应用正在加载中，请稍后再试')
			return
		}

		try {
			router.push('/(modals)/webdavModal')
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
			// 如果导航失败，尝试使用延迟的方式导航
			setTimeout(() => {
				try {
					router.push('/(modals)/webdavModal')
				} catch (innerError) {
					logError('再次尝试导航到WebDAV设置失败:', innerError)
					Alert.alert('提示', '无法打开设置页面，请稍后再试')
				}
			}, 300)
		}
	}, [router, isRouterReady])

	return (
		<ErrorBoundary>
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
							headerRight: () => <SafeHeaderRight onPress={handleSettingsPress} />,
						}}
					/>
				</Stack>
			</View>
		</ErrorBoundary>
	)
}

export default WebDAVScreenLayout
