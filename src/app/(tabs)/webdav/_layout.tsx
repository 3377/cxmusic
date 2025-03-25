import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import {
	setupWebDAV,
	subscribeToWebDAVStatus,
	useCurrentWebDAVServer,
} from '@/helpers/webdavService'
import { Feather } from '@expo/vector-icons'
import { Redirect, Stack, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 错误边界组件
class ErrorBoundary extends React.Component {
	state = { hasError: false, error: null, errorCount: 0 }

	static getDerivedStateFromError(error) {
		return { hasError: true, error }
	}

	componentDidCatch(error, errorInfo) {
		logError('WebDAV布局渲染错误:', error, errorInfo)
	}

	retry = () => {
		this.setState((prevState) => ({
			hasError: false,
			error: null,
			errorCount: prevState.errorCount + 1,
		}))
	}

	render() {
		const insets = useSafeAreaInsets ? useSafeAreaInsets() : { top: 0 }

		// 如果错误次数过多，返回到主页
		if (this.state.errorCount > 5) {
			logError('WebDAV组件多次尝试失败，返回主页')
			return <Redirect href="/(tabs)/" />
		}

		if (this.state.hasError) {
			return (
				<View
					style={{
						flex: 1,
						justifyContent: 'center',
						alignItems: 'center',
						backgroundColor: colors.background,
						paddingTop: insets.top,
					}}
				>
					<Feather name="alert-triangle" size={48} color="red" />
					<Text
						style={{
							marginTop: 16,
							color: colors.text,
							fontSize: 16,
							textAlign: 'center',
						}}
					>
						WebDAV页面加载失败
					</Text>
					<Text
						style={{
							marginTop: 8,
							color: colors.textMuted,
							textAlign: 'center',
							paddingHorizontal: 24,
						}}
					>
						{this.state.error?.message || '未知错误'}
					</Text>
					<TouchableOpacity
						onPress={this.retry}
						style={{
							marginTop: 16,
							backgroundColor: colors.primary,
							padding: 12,
							borderRadius: 8,
						}}
					>
						<Text style={{ color: '#fff' }}>重试</Text>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={() => {
							this.props.navigation?.goBack() ||
								this.props.router?.back() ||
								(typeof window !== 'undefined' && window.history && window.history.back())
						}}
						style={{
							marginTop: 12,
							backgroundColor: 'transparent',
							padding: 12,
							borderRadius: 8,
						}}
					>
						<Text style={{ color: colors.text }}>返回上一页</Text>
					</TouchableOpacity>
				</View>
			)
		}

		return this.props.children
	}
}

// 安全的头部按钮组件
function SafeHeaderButton({ onPress }) {
	try {
		return (
			<TouchableOpacity onPress={onPress} style={{ padding: 8 }}>
				<Feather name="settings" size={24} color={colors.primary} />
			</TouchableOpacity>
		)
	} catch (error) {
		logError('WebDAV设置按钮渲染错误:', error)
		return null
	}
}

// 加载状态组件
function LoadingView() {
	const insets = useSafeAreaInsets ? useSafeAreaInsets() : { top: 0 }

	return (
		<View
			style={{
				flex: 1,
				justifyContent: 'center',
				alignItems: 'center',
				backgroundColor: colors.background,
				paddingTop: insets.top,
			}}
		>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text style={{ marginTop: 16, color: colors.text }}>正在加载WebDAV...</Text>
		</View>
	)
}

export default function WebDavLayout() {
	const router = useRouter()
	const [isLoading, setIsLoading] = useState(true)
	const [initError, setInitError] = useState(null)
	const [retryCount, setRetryCount] = useState(0)
	const [isMounted, setIsMounted] = useState(true)
	const currentServer = useCurrentWebDAVServer()

	// 简化的WebDAV初始化
	useEffect(() => {
		// 防止组件卸载后的状态更新
		setIsMounted(true)

		// 如果组件还挂载着，执行初始化
		if (isMounted) {
			// 初始化函数
			const initWebDAV = async () => {
				try {
					logInfo(`WebDAV布局: 开始初始化WebDAV服务 (尝试 ${retryCount + 1})`)
					setIsLoading(true)
					setInitError(null)

					// 设置超时保护
					let initTimeout = setTimeout(() => {
						if (isMounted) {
							setInitError('初始化WebDAV服务超时，请检查网络连接')
							setIsLoading(false)
						}
					}, 10000)

					// 初始化WebDAV
					await setupWebDAV()

					// 清除超时
					clearTimeout(initTimeout)

					// 如果组件仍然挂载，更新状态
					if (isMounted) {
						setIsLoading(false)
						logInfo('WebDAV布局: WebDAV服务初始化完成')
					}
				} catch (error) {
					logError('WebDAV布局: 初始化WebDAV服务失败', error)

					// 如果组件仍然挂载，更新错误状态
					if (isMounted) {
						setInitError(error.message || '初始化WebDAV服务失败')
						setIsLoading(false)

						// 自动重试（最多3次）
						if (retryCount < 3) {
							setTimeout(() => {
								if (isMounted) setRetryCount((prev) => prev + 1)
							}, 2000)
						}
					}
				}
			}

			// 执行初始化
			initWebDAV()

			// 订阅WebDAV状态变更
			const unsubscribe = subscribeToWebDAVStatus(() => {
				logInfo('WebDAV布局: WebDAV状态已更新')
			})

			// 清理函数
			return () => {
				setIsMounted(false)
				unsubscribe()
			}
		}
	}, [retryCount, isMounted])

	// 处理设置按钮点击
	const handleSettingsPress = () => {
		try {
			if (isLoading) return // 防止加载中点击

			logInfo('WebDAV布局: 打开WebDAV设置')
			
			// 使用setTimeout避免过快导航可能引起的闪退
			setTimeout(() => {
				try {
					router.push('/webdavModal')
				} catch (navError) {
					logError('WebDAV布局: 导航到WebDAV设置失败', navError)
					Alert.alert('错误', '无法打开WebDAV设置，请重试')
				}
			}, 100)
		} catch (error) {
			logError('WebDAV布局: 导航到WebDAV设置失败', error)
			Alert.alert('错误', '无法打开WebDAV设置，请重试')
		}
	}

	// 处理重试初始化
	const handleRetry = () => {
		logInfo('WebDAV布局: 手动重试初始化WebDAV服务')
		setRetryCount((prev) => prev + 1)
	}

	// 如果WebDAV服务初始化失败，显示错误信息和重试按钮
	if (initError) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					backgroundColor: colors.background,
					padding: 20,
				}}
			>
				<Feather name="alert-triangle" size={48} color="red" />
				<Text style={{ marginTop: 16, color: colors.text, fontSize: 16, textAlign: 'center' }}>
					WebDAV服务初始化失败
				</Text>
				<Text style={{ marginTop: 8, color: colors.textMuted, textAlign: 'center' }}>
					{initError}
				</Text>
				<TouchableOpacity
					onPress={handleRetry}
					style={{
						marginTop: 16,
						backgroundColor: colors.primary,
						padding: 12,
						borderRadius: 8,
					}}
				>
					<Text style={{ color: '#fff' }}>重试</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => router.replace('/(tabs)/')}
					style={{
						marginTop: 12,
						padding: 12,
						borderRadius: 8,
					}}
				>
					<Text style={{ color: colors.text }}>返回主页</Text>
				</TouchableOpacity>
			</View>
		)
	}

	// 如果正在加载，显示加载状态
	if (isLoading) {
		return <LoadingView />
	}

	// 如果未配置WebDAV服务器，显示提示消息
	if (!currentServer) {
		return (
			<View
				style={{
					flex: 1,
					justifyContent: 'center',
					alignItems: 'center',
					backgroundColor: colors.background,
					padding: 20,
				}}
			>
				<Feather name="server" size={48} color={colors.textMuted} />
				<Text style={{ marginTop: 16, color: colors.text, fontSize: 16, textAlign: 'center' }}>
					未配置WebDAV服务器
				</Text>
				<Text style={{ marginTop: 8, color: colors.textMuted, textAlign: 'center' }}>
					请添加WebDAV服务器以访问您的文件
				</Text>
				<TouchableOpacity
					onPress={handleSettingsPress}
					style={{
						marginTop: 16,
						backgroundColor: colors.primary,
						padding: 12,
						borderRadius: 8,
					}}
				>
					<Text style={{ color: '#fff' }}>配置WebDAV</Text>
				</TouchableOpacity>
			</View>
		)
	}

	// 正常渲染WebDAV页面
	return (
		<ErrorBoundary router={router}>
			<Stack
				screenOptions={{
					headerShown: true,
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitleStyle: {
						color: colors.text,
					},
					headerTintColor: colors.primary,
					contentStyle: {
						backgroundColor: colors.background,
					},
					headerRight: () => <SafeHeaderButton onPress={handleSettingsPress} />,
				}}
			>
				<Stack.Screen name="index" options={{ title: 'WebDAV 云音乐' }} />
			</Stack>
		</ErrorBoundary>
	)
}
