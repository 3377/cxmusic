import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { Feather } from '@expo/vector-icons'
import { Link, Redirect, Stack } from 'expo-router'
import React, { useEffect, useState } from 'react'
import { ActivityIndicator, BackHandler, Text, TouchableOpacity, View } from 'react-native'
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
					<Link href="/(tabs)/" asChild>
						<TouchableOpacity
							style={{
								marginTop: 12,
								backgroundColor: 'transparent',
								padding: 12,
								borderRadius: 8,
							}}
						>
							<Text style={{ color: colors.text }}>返回主页</Text>
						</TouchableOpacity>
					</Link>
				</View>
			)
		}

		return this.props.children
	}
}

// 安全的头部按钮组件
function SafeHeaderButton() {
	return (
		<Link href="/webdavModal" asChild>
			<TouchableOpacity style={{ padding: 8 }}>
				<Feather name="settings" size={24} color={colors.primary} />
			</TouchableOpacity>
		</Link>
	)
}

// WebDAV页面选择器 - 作为一个独立的组件提供简单的页面架构
function WebDAVSelector() {
	const insets = useSafeAreaInsets ? useSafeAreaInsets() : { top: 0 }
	const [shouldRedirect, setShouldRedirect] = useState(false)
	
	// 添加返回键处理
	useEffect(() => {
		const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
			setShouldRedirect(true)
			return true
		})
		
		return () => backHandler.remove()
	}, [])
	
	// 如果需要重定向，返回主页
	if (shouldRedirect) {
		return <Redirect href="/(tabs)/" />
	}
	
	return (
		<View 
			style={{
				flex: 1,
				backgroundColor: colors.background,
				padding: 20,
				paddingTop: insets.top + 20,
				alignItems: 'center', 
				justifyContent: 'center'
			}}
		>
			<Text style={{ fontSize: 18, color: colors.text, marginBottom: 30 }}>
				选择WebDAV服务类型
			</Text>
			
			<Link href="/webdavBrowser" asChild>
				<TouchableOpacity 
					style={{
						backgroundColor: colors.primary,
						padding: 15,
						borderRadius: 8,
						width: '100%',
						alignItems: 'center',
						marginBottom: 15
					}}
				>
					<Text style={{ color: 'white', fontSize: 16 }}>WebDAV 文件浏览器</Text>
				</TouchableOpacity>
			</Link>
			
			<Link href="/webdavModal" asChild>
				<TouchableOpacity 
					style={{
						backgroundColor: colors.secondary || '#666',
						padding: 15,
						borderRadius: 8,
						width: '100%',
						alignItems: 'center',
						marginBottom: 30
					}}
				>
					<Text style={{ color: 'white', fontSize: 16 }}>WebDAV 服务器管理</Text>
				</TouchableOpacity>
			</Link>
			
			<Link href="/(tabs)/" asChild>
				<TouchableOpacity 
					style={{
						padding: 15,
						borderRadius: 8,
						borderWidth: 1,
						borderColor: colors.border || '#333',
						width: '100%',
						alignItems: 'center'
					}}
				>
					<Text style={{ color: colors.text, fontSize: 16 }}>返回主页</Text>
				</TouchableOpacity>
			</Link>
		</View>
	)
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

// 主布局
export default function WebDavLayout() {
	// 使用立即返回的简单布局，避免异步操作和复杂逻辑
	return (
		<ErrorBoundary>
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
					headerRight: () => <SafeHeaderButton />,
				}}
			>
				<Stack.Screen 
					name="index" 
					options={{ 
						title: 'WebDAV 服务',
						headerTitleAlign: 'center',
					}} 
					component={WebDAVSelector}
				/>
			</Stack>
		</ErrorBoundary>
	)
}
