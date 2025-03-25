import { colors } from '@/constants/tokens'
import { hideLoading, setLoadingError, showLoading, useLoading } from '@/helpers/loading'
import { logError, logInfo } from '@/helpers/logger'
import {
	WebDAVServer,
	addWebDAVServer,
	connectToServer,
	deleteWebDAVServer,
	getCurrentWebDAVServer,
	getWebDAVServers,
	setDefaultWebDAVServer,
	updateWebDAVServer,
} from '@/helpers/webdavService'
import { showToast } from '@/utils/utils'
import { Feather, Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	FlatList,
	Modal,
	StyleSheet,
	Switch,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 尝试导入手势组件，封装在try/catch中避免错误
let GestureHandler = null
let Animated = null
try {
	// 基本导入
	GestureHandler = require('react-native-gesture-handler').PanGestureHandler
	Animated = require('react-native-reanimated')

	// 检查API兼容性
	if (
		!Animated.useSharedValue ||
		!Animated.useAnimatedGestureHandler ||
		!Animated.useAnimatedStyle
	) {
		throw new Error('缺少必要的Reanimated API')
	}

	logInfo('手势库加载成功')
} catch (error) {
	logError('手势库加载失败，将使用备用关闭模式', error)
	// 保持为null，用备用方案
}

// 错误边界组件
class ErrorBoundary extends React.Component {
	state = { hasError: false, error: null }

	static getDerivedStateFromError(error) {
		return { hasError: true, error }
	}

	componentDidCatch(error, errorInfo) {
		logError('WebDAV模态窗口渲染错误:', error, errorInfo)
	}

	retry = () => {
		this.setState({ hasError: false, error: null })
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Feather name="alert-triangle" size={48} color="red" />
					<Text style={{ marginTop: 16, color: colors.text, textAlign: 'center', fontSize: 16 }}>
						WebDAV设置页面加载失败
					</Text>
					<Text style={{ marginTop: 8, color: colors.textMuted, textAlign: 'center' }}>
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
						<Text style={{ color: 'white' }}>重试</Text>
					</TouchableOpacity>
					<TouchableOpacity
						onPress={() => {
							try {
								// 尝试使用router导航回上一页
								if (this.props.router) {
									this.props.router.back()
								} else {
									// 备用方案
									if (typeof window !== 'undefined' && window.history && window.history.back) {
										window.history.back()
									}
								}
							} catch (navError) {
								logError('WebDAV模态窗口: 返回导航失败', navError)
							}
						}}
						style={{
							marginTop: 12,
							backgroundColor: 'transparent',
							padding: 12,
							borderRadius: 8,
						}}
					>
						<Text style={{ color: colors.text }}>返回</Text>
					</TouchableOpacity>
				</View>
			)
		}

		return this.props.children
	}
}

// 服务器编辑模态窗口
const ServerEditModal = ({ isVisible, onClose, initialServer = null, loadServers }) => {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [isHttps, setIsHttps] = useState(true)
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [isDefault, setIsDefault] = useState(false)
	const router = useRouter()

	// 当模态窗口显示时，初始化表单数据
	useEffect(() => {
		if (isVisible) {
			if (initialServer) {
				setName(initialServer.name || '')
				let serverUrl = initialServer.url || ''
				const isServerHttps = serverUrl.startsWith('https://')
				setIsHttps(isServerHttps)
				serverUrl = serverUrl.replace(/^https?:\/\//i, '')
				setUrl(serverUrl)
				setUsername(initialServer.username || '')
				setPassword(initialServer.password || '')
				setIsDefault(!!initialServer.isDefault)
			} else {
				setName('')
				setUrl('')
				setIsHttps(true)
				setUsername('')
				setPassword('')
				setIsDefault(false)
			}
		}
	}, [initialServer, isVisible])

	// 简化的关闭处理函数
	const handleClose = useCallback(
		(shouldRefresh = false) => {
			try {
				onClose(shouldRefresh)
			} catch (error) {
				logError('关闭模态窗口失败:', error)
			}
		},
		[onClose],
	)

	const handleSave = useCallback(async () => {
		if (!name || !url) {
			Alert.alert('错误', '服务器名称和URL不能为空')
			return
		}

		try {
			showLoading('正在保存服务器配置...', { type: 'webdav' })

			// 清理URL，先移除可能已有的协议前缀
			let cleanUrl = url.trim()
			cleanUrl = cleanUrl.replace(/^https?:\/\//i, '')

			// 如果清理后为空
			if (!cleanUrl) {
				Alert.alert('错误', '请输入有效的服务器地址')
				hideLoading('webdav')
				return
			}

			// 构建完整URL，添加协议
			const fullUrl = (isHttps ? 'https://' : 'http://') + cleanUrl

			// 验证URL格式
			try {
				new URL(fullUrl)
			} catch (e) {
				Alert.alert('错误', '请输入有效的服务器地址')
				hideLoading('webdav')
				return
			}

			const serverConfig = {
				name: name.trim(),
				url: fullUrl,
				username: username.trim(),
				password: password.trim(),
				isDefault,
			}

			if (initialServer) {
				await updateWebDAVServer(initialServer.name, serverConfig)
				showToast('服务器配置已更新')
			} else {
				await addWebDAVServer(serverConfig)
				showToast('服务器配置已保存')
			}

			if (isDefault) {
				await setDefaultWebDAVServer(serverConfig.name)
			}

			hideLoading('webdav')
			handleClose(true)
		} catch (error) {
			logError('保存服务器配置失败:', error)
			setLoadingError('保存服务器配置失败: ' + (error.message || '未知错误'), 'webdav')
		}
	}, [name, url, isHttps, username, password, isDefault, initialServer, handleClose])

	const handleTest = useCallback(async () => {
		if (!url) {
			Alert.alert('错误', '请先输入服务器地址')
			return
		}

		try {
			showLoading('正在测试服务器连接...', { type: 'webdav' })

			let cleanUrl = url.trim()
			cleanUrl = cleanUrl.replace(/^https?:\/\//i, '')
			const fullUrl = (isHttps ? 'https://' : 'http://') + cleanUrl

			await connectToServer({
				url: fullUrl,
				username: username.trim(),
				password: password.trim(),
			})

			hideLoading('webdav')
			showToast('连接测试成功')
		} catch (error) {
			logError('服务器连接测试失败:', error)
			setLoadingError('连接测试失败: ' + (error.message || '未知错误'), 'webdav')
		}
	}, [url, isHttps, username, password])

	const { isLoading } = useLoading('webdav')

	return (
		<Modal visible={isVisible} animationType="slide" transparent>
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>{initialServer ? '编辑服务器' : '添加服务器'}</Text>
						<TouchableOpacity
							onPress={() => handleClose(false)}
							style={styles.closeButton}
							disabled={isLoading}
						>
							<Ionicons name="close" size={24} color={colors.text} />
						</TouchableOpacity>
					</View>

					<View style={styles.formContainer}>
						<View style={styles.inputContainer}>
							<Text style={styles.label}>服务器名称</Text>
							<TextInput
								style={styles.input}
								value={name}
								onChangeText={setName}
								placeholder="输入服务器名称"
								placeholderTextColor={colors.textMuted}
								editable={!isLoading}
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={styles.label}>服务器地址</Text>
							<View style={styles.urlContainer}>
								<TouchableOpacity
									style={styles.protocolButton}
									onPress={() => setIsHttps(!isHttps)}
									disabled={isLoading}
								>
									<Text style={styles.protocolText}>{isHttps ? 'https://' : 'http://'}</Text>
								</TouchableOpacity>
								<TextInput
									style={[styles.input, styles.urlInput]}
									value={url}
									onChangeText={setUrl}
									placeholder="example.com/webdav"
									placeholderTextColor={colors.textMuted}
									editable={!isLoading}
								/>
							</View>
						</View>

						<View style={styles.inputContainer}>
							<Text style={styles.label}>用户名</Text>
							<TextInput
								style={styles.input}
								value={username}
								onChangeText={setUsername}
								placeholder="输入用户名"
								placeholderTextColor={colors.textMuted}
								editable={!isLoading}
							/>
						</View>

						<View style={styles.inputContainer}>
							<Text style={styles.label}>密码</Text>
							<TextInput
								style={styles.input}
								value={password}
								onChangeText={setPassword}
								placeholder="输入密码"
								placeholderTextColor={colors.textMuted}
								secureTextEntry
								editable={!isLoading}
							/>
						</View>

						<View style={styles.switchContainer}>
							<Text style={styles.label}>设为默认服务器</Text>
							<Switch value={isDefault} onValueChange={setIsDefault} disabled={isLoading} />
						</View>
					</View>

					<View style={styles.buttonContainer}>
						<TouchableOpacity
							style={[styles.button, styles.testButton]}
							onPress={handleTest}
							disabled={isLoading}
						>
							<Text style={styles.buttonText}>测试连接</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.button, styles.saveButton]}
							onPress={handleSave}
							disabled={isLoading}
						>
							<Text style={styles.buttonText}>保存</Text>
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	)
}

// 服务器项组件
const ServerItem = ({ server, onEdit, onDelete, onSetDefault, onTest, isCurrentServer }) => {
	return (
		<View style={styles.serverItem}>
			<View style={styles.serverContent}>
				<TouchableOpacity
					onPress={() => onEdit(server)}
					style={styles.serverContentText}
					activeOpacity={0.6}
				>
					<View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
						<Feather
							name="server"
							size={18}
							color={isCurrentServer ? colors.primary : colors.text}
							style={{ marginRight: 8 }}
						/>
						<Text
							style={[
								styles.serverName,
								isCurrentServer && { color: colors.primary, fontWeight: 'bold' },
							]}
							numberOfLines={1}
						>
							{server.name || '未命名服务器'}
						</Text>
					</View>
					<Text style={styles.serverUrl} numberOfLines={1}>
						{server.url || '未设置URL'}
					</Text>
				</TouchableOpacity>
				<View style={styles.serverActions}>
					<TouchableOpacity onPress={() => onTest(server)} style={styles.iconButton}>
						<Feather name="check-circle" size={20} color={colors.success} />
					</TouchableOpacity>

					<TouchableOpacity
						onPress={() => onSetDefault(server.id)}
						style={[styles.iconButton, { opacity: isCurrentServer ? 0.5 : 1 }]}
						disabled={isCurrentServer}
					>
						<Feather name="star" size={20} color={isCurrentServer ? colors.primary : colors.text} />
					</TouchableOpacity>

					<TouchableOpacity onPress={() => onDelete(server)} style={styles.iconButton}>
						<Feather name="trash-2" size={20} color="#ff4d4f" />
					</TouchableOpacity>
				</View>
			</View>
		</View>
	)
}

// 在函数组件开头添加以下函数
const validateServerConfig = (server) => {
	try {
		if (!server.name || server.name.trim() === '') {
			return '服务器名称不能为空'
		}

		if (!server.url || server.url.trim() === '') {
			return '服务器地址不能为空'
		}

		// 简单验证URL格式
		try {
			new URL(server.url)
		} catch (e) {
			return '服务器地址格式不正确'
		}

		return null // 没有错误
	} catch (error) {
		logError('验证WebDAV服务器配置失败:', error)
		return '验证服务器配置时出错'
	}
}

// 主页面组件
const WebDAVModal = () => {
	const router = useRouter()
	const insets = useSafeAreaInsets()
	const [servers, setServers] = useState<WebDAVServer[]>([])
	const [modalVisible, setModalVisible] = useState(false)
	const [selectedServer, setSelectedServer] = useState<WebDAVServer | null>(null)
	const [currentServerState, setCurrentServerState] = useState<WebDAVServer | null>(null)
	const [isComponentMounted, setIsComponentMounted] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [startY, setStartY] = useState(0)
	const [currentY, setCurrentY] = useState(0)
	const [isDragging, setIsDragging] = useState(false)
	const [animatedValues, setAnimatedValues] = useState(null)
	const [initialized, setInitialized] = useState(false)

	// 组件挂载状态管理
	useEffect(() => {
		setIsComponentMounted(true)
		setTimeout(() => {
			setInitialized(true)
		}, 100)
		return () => {
			setIsComponentMounted(false)
		}
	}, [])

	// 加载服务器列表
	const loadServers = useCallback(async () => {
		try {
			if (!isComponentMounted) return

			showLoading('正在加载服务器列表...', { type: 'webdav' })
			setError(null)

			// 获取最新的服务器列表
			const serversList = getWebDAVServers()
			setServers(serversList)

			// 获取当前服务器
			const current = getCurrentWebDAVServer()
			setCurrentServerState(current)

			hideLoading('webdav')
			logInfo('WebDAV设置: 已加载服务器列表', { count: serversList.length })
		} catch (err) {
			logError('WebDAV设置: 加载服务器列表失败', err)
			setLoadingError('加载服务器列表失败: ' + (err.message || '未知错误'), 'webdav')
		}
	}, [isComponentMounted])

	// 初始加载
	useEffect(() => {
		loadServers()
	}, [loadServers])

	// 处理服务器删除
	const handleDeleteServer = useCallback(
		async (server: WebDAVServer) => {
			try {
				showLoading('正在删除服务器...', { type: 'webdav' })
				await deleteWebDAVServer(server.name)
				showToast('服务器已删除')
				await loadServers()
			} catch (error) {
				logError('删除服务器失败:', error)
				setLoadingError('删除服务器失败: ' + (error.message || '未知错误'), 'webdav')
			}
		},
		[loadServers],
	)

	// 处理设置默认服务器
	const handleSetDefault = useCallback(
		async (server: WebDAVServer) => {
			try {
				showLoading('正在设置默认服务器...', { type: 'webdav' })
				await setDefaultWebDAVServer(server.name)
				showToast('已设置为默认服务器')
				await loadServers()
			} catch (error) {
				logError('设置默认服务器失败:', error)
				setLoadingError('设置默认服务器失败: ' + (error.message || '未知错误'), 'webdav')
			}
		},
		[loadServers],
	)

	// 处理服务器测试
	const handleTestServer = useCallback(async (server: WebDAVServer) => {
		try {
			showLoading('正在测试服务器连接...', { type: 'webdav' })
			await connectToServer(server)
			hideLoading('webdav')
			showToast('连接测试成功')
		} catch (error) {
			logError('服务器连接测试失败:', error)
			setLoadingError('连接测试失败: ' + (error.message || '未知错误'), 'webdav')
		}
	}, [])

	// 处理模态窗口关闭
	const handleModalClose = useCallback(
		(shouldRefresh: boolean) => {
			setModalVisible(false)
			setSelectedServer(null)
			if (shouldRefresh) {
				loadServers()
			}
		},
		[loadServers],
	)

	const { isLoading } = useLoading('webdav')

	if (!initialized) {
		return (
			<View style={styles.loadingContainer}>
				<ActivityIndicator size="large" color={colors.primary} />
				<Text style={styles.loadingText}>正在加载...</Text>
			</View>
		)
	}

	return (
		<ErrorBoundary router={router}>
			<View style={[styles.container, { paddingTop: insets.top }]}>
				<View style={styles.header}>
					<TouchableOpacity
						style={styles.backButton}
						onPress={() => router.back()}
						disabled={isLoading}
					>
						<Ionicons name="arrow-back" size={24} color={colors.text} />
					</TouchableOpacity>
					<Text style={styles.title}>WebDAV设置</Text>
					<TouchableOpacity style={styles.refreshButton} onPress={loadServers} disabled={isLoading}>
						<Ionicons name="refresh" size={24} color={colors.text} />
					</TouchableOpacity>
				</View>

				<TouchableOpacity
					style={styles.addButton}
					onPress={() => setModalVisible(true)}
					disabled={isLoading}
				>
					<Text style={styles.addButtonText}>添加服务器</Text>
				</TouchableOpacity>

				{error ? (
					<View style={styles.errorContainer}>
						<Feather name="alert-circle" size={48} color="red" />
						<Text style={styles.errorText}>{error}</Text>
						<TouchableOpacity style={styles.retryButton} onPress={loadServers} disabled={isLoading}>
							<Text style={styles.retryButtonText}>重试</Text>
						</TouchableOpacity>
					</View>
				) : (
					<FlatList
						data={servers}
						keyExtractor={(item) => item.name}
						renderItem={({ item }) => (
							<ServerItem
								server={item}
								onEdit={() => {
									setSelectedServer(item)
									setModalVisible(true)
								}}
								onDelete={() => handleDeleteServer(item)}
								onSetDefault={() => handleSetDefault(item)}
								onTest={() => handleTestServer(item)}
								isCurrentServer={item.name === currentServerState?.name}
							/>
						)}
						ListEmptyComponent={
							<View style={styles.emptyContainer}>
								<Text style={styles.emptyText}>没有WebDAV服务器</Text>
								<Text style={styles.emptySubtext}>点击上方的"添加服务器"按钮添加一个服务器</Text>
							</View>
						}
						ItemSeparatorComponent={() => <View style={styles.separator} />}
						contentContainerStyle={styles.listContent}
					/>
				)}

				<ServerEditModal
					isVisible={modalVisible}
					onClose={handleModalClose}
					initialServer={selectedServer}
					loadServers={loadServers}
				/>
			</View>
		</ErrorBoundary>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 20,
		paddingTop: 50,
	},
	headerTitle: {
		fontSize: 34,
		fontWeight: 'bold',
		color: colors.text,
	},
	closeButton: {
		position: 'absolute',
		top: 0,
		right: 0,
		padding: 10,
	},
	actionContainer: {
		padding: 20,
		paddingTop: 0,
	},
	addButton: {
		backgroundColor: colors.accent,
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 10,
		alignItems: 'center',
	},
	addButtonText: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 16,
	},
	listContainer: {
		paddingHorizontal: 20,
		paddingBottom: 20,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	emptyText: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginBottom: 10,
	},
	emptySubtext: {
		fontSize: 14,
		color: colors.subtext,
		textAlign: 'center',
	},
	serverItem: {
		backgroundColor: colors.item,
		borderRadius: 10,
		padding: 15,
		marginBottom: 15,
	},
	serverContent: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	serverContentText: {
		flex: 1,
	},
	serverName: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginBottom: 5,
	},
	serverUrl: {
		fontSize: 14,
		color: colors.subtext,
		marginBottom: 5,
	},
	serverActions: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
	},
	iconButton: {
		padding: 6,
		borderRadius: 5,
		marginLeft: 8,
	},
	modalContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
	},
	modalContent: {
		width: '90%',
		backgroundColor: colors.background,
		borderRadius: 10,
		padding: 20,
		maxHeight: '80%',
	},
	modalHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: 20,
	},
	modalTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.text,
	},
	formContainer: {
		// Add any necessary styles for the form container
	},
	inputContainer: {
		marginBottom: 15,
	},
	label: {
		fontSize: 14,
		color: colors.text,
		marginBottom: 5,
	},
	urlContainer: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	protocolButton: {
		padding: 8,
		borderWidth: 1,
		borderColor: '#444',
		borderRadius: 4,
		marginRight: 8,
	},
	protocolText: {
		fontSize: 14,
		color: colors.text,
	},
	input: {
		backgroundColor: colors.item,
		borderRadius: 5,
		paddingHorizontal: 15,
		paddingVertical: 10,
		color: colors.text,
	},
	urlInput: {
		flex: 1,
	},
	switchContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	buttonContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	button: {
		flex: 1,
		alignItems: 'center',
		paddingVertical: 10,
		borderRadius: 5,
		marginHorizontal: 5,
	},
	saveButton: {
		backgroundColor: colors.accent,
	},
	buttonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	testButton: {
		backgroundColor: '#0066cc',
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 6,
	},
	handle: {
		height: 5,
		backgroundColor: colors.border,
		borderRadius: 2.5,
		marginBottom: 10,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginTop: 16,
	},
	errorContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	errorText: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginBottom: 10,
	},
	retryButton: {
		backgroundColor: colors.accent,
		padding: 12,
		borderRadius: 8,
	},
	retryButtonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	backButton: {
		padding: 10,
	},
	title: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.text,
		marginLeft: 10,
	},
	refreshButton: {
		padding: 10,
	},
	listContent: {
		paddingHorizontal: 20,
		paddingBottom: 20,
	},
})

export default WebDAVModal
