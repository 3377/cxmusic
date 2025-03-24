import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import { Feather } from '@expo/vector-icons'
import { Stack, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 错误边界组件
class ErrorBoundary extends React.Component {
	state = { hasError: false, error: null }

	static getDerivedStateFromError(error) {
		return { hasError: true, error }
	}

	componentDidCatch(error, errorInfo) {
		logError('WebDAV布局渲染错误:', error, errorInfo)
	}

	retry = () => {
		this.setState({ hasError: false, error: null })
	}

	render() {
		const insets = useSafeAreaInsets ? useSafeAreaInsets() : { top: 0 }

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

	// 处理设置按钮点击
	const handleSettingsPress = () => {
		try {
			router.push('/webdavModal')
		} catch (error) {
			logError('WebDAV设置导航错误:', error)
		}
	}

	// 模拟加载时间
	useEffect(() => {
		const timer = setTimeout(() => {
			setIsLoading(false)
		}, 500)
		return () => clearTimeout(timer)
	}, [])

	return (
		<ErrorBoundary>
			{isLoading ? (
				<LoadingView />
			) : (
				<Stack
					screenOptions={{
						headerStyle: {
							backgroundColor: colors.background,
						},
						headerTintColor: colors.text,
						headerTitleStyle: {
							fontWeight: 'bold',
						},
						headerRight: () => <SafeHeaderButton onPress={handleSettingsPress} />,
					}}
				>
					<Stack.Screen
						name="index"
						options={{
							title: 'WebDAV文件',
						}}
					/>
				</Stack>
			)}
		</ErrorBoundary>
	)
}
