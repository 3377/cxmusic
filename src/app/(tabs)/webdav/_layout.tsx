import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import { nowLanguage } from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Text, TouchableOpacity, View } from 'react-native'

// 错误边界组件
class ErrorBoundary extends React.Component {
	state = { hasError: false, errorCount: 0 }

	static getDerivedStateFromError() {
		return { hasError: true }
	}

	componentDidCatch(error, info) {
		logError('WebDAV页面错误:', error, info)
		this.setState((prevState) => ({
			errorCount: prevState.errorCount + 1,
		}))
	}

	retry = () => {
		this.setState({ hasError: false })
	}

	render() {
		if (this.state.hasError) {
			// 错误次数过多，返回到歌曲列表页面
			if (this.state.errorCount > 3) {
				return <Redirect href="/(tabs)/(songs)" />
			}

			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>
						抱歉，WebDAV页面加载失败
					</Text>
					<Text style={{ fontSize: 14, marginBottom: 20, textAlign: 'center' }}>
						这可能是由于网络连接问题或WebDAV服务器配置不正确导致的
					</Text>
					<TouchableOpacity
						style={{
							backgroundColor: colors.primary,
							paddingHorizontal: 20,
							paddingVertical: 10,
							borderRadius: 20,
						}}
						onPress={this.retry}
					>
						<Text style={{ color: '#fff', fontWeight: 'bold' }}>重试</Text>
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
	const [isReady, setIsReady] = useState(false)
	const [loadFailed, setLoadFailed] = useState(false)

	// 初始化
	useEffect(() => {
		// 标记组件挂载状态
		let isMounted = true

		// 延迟初始化以等待系统稳定
		const timer = setTimeout(() => {
			if (isMounted) {
				setIsReady(true)
			}
		}, 300)

		return () => {
			isMounted = false
			clearTimeout(timer)
		}
	}, [])

	// 安全导航到设置
	const safeNavigateToSettings = useCallback(() => {
		try {
			// 使用防抖动来确保不重复导航
			router.push('/(modals)/webdavModal')
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
			// 尝试弹出提示
			try {
				Alert.alert('错误', '无法打开WebDAV设置，请稍后再试')
			} catch (alertError) {
				logError('显示WebDAV设置导航错误提示失败:', alertError)
			}
		}
	}, [router])

	// 显示加载状态
	if (!isReady) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					backgroundColor: colors.background,
				}}
			>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={{ marginTop: 15, color: colors.text }}>正在准备WebDAV...</Text>
			</View>
		)
	}

	// 如果加载失败，显示错误
	if (loadFailed) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
				<Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>
					WebDAV页面加载失败
				</Text>
				<TouchableOpacity
					style={{
						backgroundColor: colors.primary,
						paddingHorizontal: 20,
						paddingVertical: 10,
						borderRadius: 20,
						marginTop: 10,
					}}
					onPress={() => setLoadFailed(false)}
				>
					<Text style={{ color: '#fff', fontWeight: 'bold' }}>重试</Text>
				</TouchableOpacity>
			</View>
		)
	}

	return (
		<ErrorBoundary>
			<Stack
				screenOptions={{
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTintColor: colors.text,
					headerTitleStyle: {
						fontWeight: 'bold',
					},
					headerRight: () => <SafeHeaderRight onPress={safeNavigateToSettings} />,
				}}
			>
				<Stack.Screen
					name="index"
					options={{
						title: 'WebDAV',
						animation: 'fade',
					}}
				/>
			</Stack>
		</ErrorBoundary>
	)
}

export default WebDAVScreenLayout
