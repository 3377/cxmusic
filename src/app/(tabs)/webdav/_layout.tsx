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
							this.props.navigation?.goBack() || this.props.router?.back()
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
	const [isInitialized, setIsInitialized] = useState(false)
	const [initError, setInitError] = useState(null)
	const [retryCount, setRetryCount] = useState(0)
	const [isInitializing, setIsInitializing] = useState(false)
	const currentServer = useCurrentWebDAVServer()

	// 安全的初始化WebDAV服务
	const safeInitWebDAV = async () => {
		// 如果正在初始化，防止重复调用
		if (isInitializing) return

		try {
			setIsInitializing(true)
			logInfo(`WebDAV布局: 开始初始化WebDAV服务 (尝试 ${retryCount + 1})`)
			setIsLoading(true)
			setInitError(null)

			// 设置超时保护，防止无响应
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => {
					reject(new Error('初始化WebDAV服务超时'))
				}, 10000) // 10秒超时
			})

			// 等待WebDAV服务初始化，带超时处理
			await Promise.race([setupWebDAV(), timeoutPromise])

			// 短暂延迟以确保UI状态更新
			setTimeout(() => {
				setIsInitialized(true)
				setIsLoading(false)
				setIsInitializing(false)
				logInfo('WebDAV布局: WebDAV服务初始化完成')
			}, 500)
		} catch (error) {
			logError('WebDAV布局: 初始化WebDAV服务失败', error)
			setInitError(error.message || '初始化WebDAV服务失败')
			setIsInitialized(true)
			setIsLoading(false)
			setIsInitializing(false)

			// 自动重试（最多3次）
			if (retryCount < 3) {
				setTimeout(() => {
					setRetryCount((prev) => prev + 1)
				}, 1000)
			}
		}
	}

	// 初始化WebDAV服务
	useEffect(() => {
		// 使用安全的初始化函数
		safeInitWebDAV()

		// 订阅WebDAV状态变更
		const unsubscribe = subscribeToWebDAVStatus(() => {
			logInfo('WebDAV布局: WebDAV状态已更新')
		})

		return () => {
			unsubscribe()
		}
	}, [retryCount])

	// 处理设置按钮点击
	const handleSettingsPress = () => {
		try {
			logInfo('WebDAV布局: 打开WebDAV设置')
			router.push('/webdavModal')
		} catch (error) {
			logError('WebDAV布局: WebDAV设置导航错误', error)
			Alert.alert('错误', '无法打开WebDAV设置')
		}
	}

	// 处理重试初始化
	const handleRetry = () => {
		logInfo('WebDAV布局: 重试初始化WebDAV服务')
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
				<Text
					style={{
						marginTop: 16,
						fontSize: 18,
						fontWeight: 'bold',
						color: colors.text,
						textAlign: 'center',
					}}
				>
					WebDAV服务初始化失败
				</Text>
				<Text
					style={{
						marginTop: 8,
						color: colors.textMuted,
						textAlign: 'center',
						marginBottom: 20,
					}}
				>
					{initError}
				</Text>
				<TouchableOpacity
					onPress={handleRetry}
					style={{
						backgroundColor: colors.primary,
						padding: 12,
						borderRadius: 8,
						marginBottom: 12,
					}}
				>
					<Text style={{ color: '#fff', fontWeight: 'bold' }}>重试</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={() => router.back()}
					style={{
						padding: 12,
						borderRadius: 8,
					}}
				>
					<Text style={{ color: colors.text }}>返回</Text>
				</TouchableOpacity>
			</View>
		)
	}

	// 在加载中时显示加载状态
	if (isLoading) {
		return <LoadingView />
	}

	// 返回布局组件
	return (
		<ErrorBoundary>
			<Stack
				screenOptions={{
					headerShown: false,
					contentStyle: { backgroundColor: colors.background },
				}}
			/>
		</ErrorBoundary>
	)
}
