import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { checkWebDAVStatus } from '@/helpers/webdavService'
import { Feather } from '@expo/vector-icons'
import { Link, Stack, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	BackHandler,
	SafeAreaView,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'

// 非常简单的独立WebDAV组件
export default function WebDAVStandalone() {
	const router = useRouter()
	const [status, setStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')

	// 检查WebDAV状态
	useEffect(() => {
		const checkStatus = async () => {
			try {
				// 安全地检查WebDAV状态
				const result = checkWebDAVStatus()

				// 更新状态
				setStatus(result.isConnected ? 'available' : 'unavailable')
				logInfo('WebDAV状态检查：', result.isConnected ? '可用' : '不可用')
			} catch (error) {
				logError('检查WebDAV状态时出错：', error)
				setStatus('unavailable')
			}
		}

		// 执行检查
		checkStatus()
	}, [])

	// 处理返回按键
	useEffect(() => {
		const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
			// 返回Tab导航
			router.replace('/(tabs)/')
			return true
		})

		return () => backHandler.remove()
	}, [])

	// 渲染函数
	const renderContent = () => {
		// 检查中
		if (status === 'checking') {
			return (
				<View style={styles.centerContainer}>
					<ActivityIndicator size="large" color={colors.primary} />
					<Text style={styles.statusText}>检查WebDAV服务状态...</Text>
				</View>
			)
		}

		// WebDAV不可用
		if (status === 'unavailable') {
			return (
				<View style={styles.centerContainer}>
					<Feather name="alert-circle" size={48} color="red" />
					<Text style={styles.errorTitle}>WebDAV服务不可用</Text>
					<Text style={styles.errorText}>请检查您的WebDAV设置和网络连接。</Text>

					<Link href="/webdavModal" asChild>
						<TouchableOpacity style={styles.primaryButton}>
							<Text style={styles.buttonText}>WebDAV设置</Text>
						</TouchableOpacity>
					</Link>

					<TouchableOpacity
						onPress={() => {
							// 重新检查
							setStatus('checking')
							setTimeout(() => {
								try {
									const result = checkWebDAVStatus()
									setStatus(result.isConnected ? 'available' : 'unavailable')
								} catch (error) {
									setStatus('unavailable')
								}
							}, 500)
						}}
						style={styles.secondaryButton}
					>
						<Text style={styles.buttonText}>重新检查</Text>
					</TouchableOpacity>

					<TouchableOpacity onPress={() => router.replace('/(tabs)/')} style={styles.outlineButton}>
						<Text style={styles.outlineButtonText}>返回主页</Text>
					</TouchableOpacity>
				</View>
			)
		}

		// WebDAV可用 - 显示选项按钮
		return (
			<View style={styles.centerContainer}>
				<Feather name="folder" size={48} color={colors.primary} />
				<Text style={styles.statusTitle}>WebDAV服务可用</Text>
				<Text style={styles.statusText}>请选择要使用的功能</Text>

				<Link href="/webdavBrowser" asChild>
					<TouchableOpacity style={[styles.primaryButton, { marginTop: 30 }]}>
						<Text style={styles.buttonText}>浏览文件</Text>
					</TouchableOpacity>
				</Link>

				<Link href="/webdavModal" asChild>
					<TouchableOpacity style={styles.secondaryButton}>
						<Text style={styles.buttonText}>管理服务器</Text>
					</TouchableOpacity>
				</Link>

				<TouchableOpacity onPress={() => router.replace('/(tabs)/')} style={styles.outlineButton}>
					<Text style={styles.outlineButtonText}>返回主页</Text>
				</TouchableOpacity>
			</View>
		)
	}

	return (
		<>
			<Stack.Screen
				options={{
					title: 'WebDAV服务',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitleStyle: {
						color: colors.text,
					},
					headerTintColor: colors.primary,
					headerLeft: () => (
						<TouchableOpacity onPress={() => router.replace('/(tabs)/')} style={{ padding: 8 }}>
							<Feather name="arrow-left" size={24} color={colors.primary} />
						</TouchableOpacity>
					),
				}}
			/>

			<SafeAreaView style={styles.container}>{renderContent()}</SafeAreaView>
		</>
	)
}

// 样式
const styles = {
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	centerContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	statusTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.text,
		marginTop: 20,
		marginBottom: 10,
	},
	statusText: {
		fontSize: 16,
		color: colors.textMuted || '#888',
		textAlign: 'center',
		marginTop: 12,
	},
	errorTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: 'red',
		marginTop: 20,
		marginBottom: 10,
	},
	errorText: {
		fontSize: 16,
		color: colors.textMuted || '#888',
		textAlign: 'center',
		marginBottom: 30,
	},
	primaryButton: {
		backgroundColor: colors.primary,
		padding: 12,
		borderRadius: 8,
		width: '100%',
		alignItems: 'center',
		marginTop: 16,
	},
	secondaryButton: {
		backgroundColor: colors.secondary || '#555',
		padding: 12,
		borderRadius: 8,
		width: '100%',
		alignItems: 'center',
		marginTop: 12,
	},
	outlineButton: {
		backgroundColor: 'transparent',
		padding: 12,
		borderRadius: 8,
		width: '100%',
		alignItems: 'center',
		marginTop: 12,
		borderWidth: 1,
		borderColor: colors.border || '#333',
	},
	buttonText: {
		color: 'white',
		fontSize: 16,
	},
	outlineButtonText: {
		color: colors.text,
		fontSize: 16,
	},
}
