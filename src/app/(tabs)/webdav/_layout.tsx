import { logError, logInfo } from '@/helpers/logger'
import { getCurrentWebDAVServer } from '@/helpers/webdavService'
import { useTheme } from '@/hooks/useTheme'
import { Feather } from '@expo/vector-icons'
import { Redirect, Stack, useRouter } from 'expo-router'
import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { TouchableRipple } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

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
					<TouchableRipple
						onPress={this.retry}
						style={{
							padding: 12,
							backgroundColor: colors.primary,
							borderRadius: 8,
						}}
					>
						<Text style={{ color: '#fff', fontWeight: 'bold' }}>重试</Text>
					</TouchableRipple>
				</View>
			)
		}

		return this.props.children
	}
}

export default function WebDavLayout() {
	const router = useRouter()
	const [isLoading, setIsLoading] = useState(true)
	const [hasError, setHasError] = useState(false)
	const theme = useTheme()
	const insets = useSafeAreaInsets()

	const onSettingsPress = useCallback(() => {
		try {
			logInfo('打开WebDAV设置')
			router.push('/webdavModal')
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
		}
	}, [router])

	// 检查WebDAV服务是否准备就绪
	const checkWebDAVServiceReady = useCallback(() => {
		try {
			setIsLoading(true)
			const currentServer = getCurrentWebDAVServer()
			if (!currentServer) {
				logError('WebDAV服务未配置或未初始化')
				setHasError(true)
			} else {
				logInfo('WebDAV服务就绪:', currentServer.name)
				setHasError(false)
			}
		} catch (error) {
			logError('检查WebDAV服务状态失败:', error)
			setHasError(true)
		} finally {
			setIsLoading(false)
		}
	}, [])

	// 组件挂载后检查WebDAV状态
	useEffect(() => {
		checkWebDAVServiceReady()
	}, [checkWebDAVServiceReady])

	// 通过检查当前WebDAV服务的状态来确定是否可以显示内容
	if (isLoading) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					backgroundColor: theme.colors.background,
					paddingTop: insets.top,
				}}
			>
				<ActivityIndicator size="large" color={theme.colors.primary} />
				<Text style={{ color: theme.colors.text, marginTop: 16 }}>正在加载WebDAV服务...</Text>
			</View>
		)
	}

	if (hasError) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					backgroundColor: theme.colors.background,
					paddingTop: insets.top,
				}}
			>
				<Feather name="alert-circle" size={48} color={theme.colors.error} />
				<Text style={{ color: theme.colors.text, marginTop: 16 }}>
					WebDAV服务未配置或初始化失败
				</Text>
				<TouchableRipple
					onPress={checkWebDAVServiceReady}
					style={{
						padding: 12,
						backgroundColor: theme.colors.primary,
						borderRadius: 8,
						marginTop: 16,
					}}
				>
					<Text style={{ color: theme.colors.onPrimary }}>重试</Text>
				</TouchableRipple>
				<TouchableRipple
					onPress={onSettingsPress}
					style={{
						padding: 12,
						backgroundColor: theme.colors.secondary,
						borderRadius: 8,
						marginTop: 8,
					}}
				>
					<Text style={{ color: theme.colors.onSecondary }}>配置WebDAV</Text>
				</TouchableRipple>
			</View>
		)
	}

	return (
		<ErrorBoundary>
			<Stack
				screenOptions={{
					headerRight: () => {
						try {
							return (
								<TouchableRipple
									onPress={onSettingsPress}
									style={{ padding: 8, marginRight: 8, borderRadius: 20 }}
								>
									<Feather name="settings" size={24} color={theme.colors.text} />
								</TouchableRipple>
							)
						} catch (error) {
							logError('渲染WebDAV设置按钮失败:', error)
							return null
						}
					},
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
