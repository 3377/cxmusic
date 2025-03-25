import { colors } from '@/constants/tokens'
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
	BackHandler,
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
	const [isLoading, setIsLoading] = useState(false)
	const [isTesting, setIsTesting] = useState(false)
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
			setIsLoading(true)

			// 清理URL，先移除可能已有的协议前缀
			let cleanUrl = url.trim()
			cleanUrl = cleanUrl.replace(/^https?:\/\//i, '')

			// 如果清理后为空
			if (!cleanUrl) {
				Alert.alert('错误', '请输入有效的服务器地址')
				setIsLoading(false)
				return
			}

			// 构建完整URL，添加协议
			const fullUrl = (isHttps ? 'https://' : 'http://') + cleanUrl

			// 验证URL格式
			try {
				new URL(fullUrl)
			} catch (e) {
				Alert.alert('错误', 'URL格式不正确，请检查')
				setIsLoading(false)
				return
			}

			// 创建或更新服务器
			if (initialServer) {
				// 更新现有服务器
				await updateWebDAVServer(initialServer.id, {
					name: name.trim(),
					url: fullUrl,
					username: username.trim(),
					password: password,
					isDefault,
				})

				showToast('服务器更新成功', 'success')
				onClose(true)
			} else {
				// 创建新服务器
				const id = await addWebDAVServer({
					name: name.trim(),
					url: fullUrl,
					username: username.trim(),
					password: password,
					isDefault,
				})

				if (id) {
					showToast('服务器添加成功', 'success')
					onClose(true)
				} else {
					Alert.alert('错误', '添加服务器失败')
				}
			}
		} catch (error) {
			logError(`${initialServer ? '更新' : '添加'}服务器失败:`, error)
			Alert.alert(
				'错误',
				`${initialServer ? '更新' : '添加'}服务器失败: ${error.message || '未知错误'}`,
			)
		} finally {
			setIsLoading(false)
		}
	}, [name, url, isHttps, username, password, isDefault, initialServer, onClose])

	// 新增：测试连接函数
	const handleTestConnection = useCallback(async () => {
		if (!url.trim()) {
			Alert.alert('错误', '请输入有效的服务器地址')
			return
		}

		try {
			setIsTesting(true)

			// 清理URL，先移除可能已有的协议前缀
			let cleanUrl = url.trim()
			cleanUrl = cleanUrl.replace(/^https?:\/\//i, '')

			// 如果清理后为空
			if (!cleanUrl) {
				Alert.alert('错误', '请输入有效的服务器地址')
				setIsTesting(false)
				return
			}

			// 构建完整URL，添加协议
			const fullUrl = (isHttps ? 'https://' : 'http://') + cleanUrl

			// 创建临时服务器配置对象
			const testServer = {
				id: 'test_temp_id',
				name: name.trim() || '测试服务器',
				url: fullUrl,
				username: username.trim(),
				password: password,
			}

			// 导入验证函数
			const { createClient } = await import('webdav')

			// 创建WebDAV客户端配置
			const clientOptions = {
				username: testServer.username || '',
				password: testServer.password || '',
				maxBodyLength: 1024 * 1024 * 50, // 50MB
				maxContentLength: 1024 * 1024 * 50, // 50MB
			}

			// 创建测试客户端
			const testClient = createClient(testServer.url, clientOptions)

			// 测试连接
			try {
				await testClient.getDirectoryContents('/')
				Alert.alert('成功', '服务器连接测试成功！')
			} catch (testError) {
				let errorMessage = '服务器连接测试失败'

				if (testError.status === 401) {
					errorMessage = '授权失败: 请检查用户名和密码'
				} else if (testError.status === 404) {
					errorMessage = '服务器路径不存在: 请检查URL路径'
				} else if (testError.message && testError.message.includes('ENOTFOUND')) {
					errorMessage = '找不到服务器: 请检查主机名是否正确'
				} else if (testError.message && testError.message.includes('ECONNREFUSED')) {
					errorMessage = '连接被拒绝: 服务器可能未运行或端口被阻止'
				} else if (testError.message && testError.message.includes('certificate')) {
					errorMessage = 'SSL证书错误: 服务器证书无效或不受信任'
				}

				Alert.alert('连接失败', `${errorMessage}: ${testError.message || '未知错误'}`)
			}
		} catch (error) {
			Alert.alert('错误', `测试连接失败: ${error.message || '未知错误'}`)
		} finally {
			setIsTesting(false)
		}
	}, [name, url, isHttps, username, password])

	if (!isVisible) return null

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="slide"
			onRequestClose={() => handleClose(false)}
			statusBarTranslucent={true}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{initialServer ? '编辑服务器' : '添加服务器'}</Text>

					<Text style={styles.inputLabel}>服务器名称</Text>
					<TextInput
						style={styles.input}
						value={name}
						onChangeText={setName}
						placeholder="例如: 我的WebDAV服务器"
						placeholderTextColor="#666"
					/>

					<Text style={styles.inputLabel}>服务器地址</Text>
					<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
						{/* 协议选择器 */}
						<View style={styles.protocolSelector}>
							<TouchableOpacity
								style={[styles.protocolOption, isHttps ? styles.protocolOptionSelected : null]}
								onPress={() => setIsHttps(true)}
							>
								<Text style={[styles.protocolText, isHttps ? styles.protocolTextSelected : null]}>
									HTTPS://
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.protocolOption, !isHttps ? styles.protocolOptionSelected : null]}
								onPress={() => setIsHttps(false)}
							>
								<Text style={[styles.protocolText, !isHttps ? styles.protocolTextSelected : null]}>
									HTTP://
								</Text>
							</TouchableOpacity>
						</View>

						{/* URL输入框 */}
						<TextInput
							style={[styles.input, { flex: 1, marginBottom: 0 }]}
							value={url}
							onChangeText={setUrl}
							placeholder="example.com/webdav"
							placeholderTextColor="#666"
							autoCapitalize="none"
						/>
					</View>

					<Text style={styles.inputLabel}>用户名 (可选)</Text>
					<TextInput
						style={styles.input}
						value={username}
						onChangeText={setUsername}
						placeholder="WebDAV用户名"
						placeholderTextColor="#666"
						autoCapitalize="none"
					/>

					<Text style={styles.inputLabel}>密码 (可选)</Text>
					<TextInput
						style={styles.input}
						value={password}
						onChangeText={setPassword}
						placeholder="WebDAV密码"
						placeholderTextColor="#666"
						secureTextEntry
					/>

					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							marginBottom: 16,
							justifyContent: 'space-between',
						}}
					>
						<Text style={styles.switchLabel}>设为默认服务器</Text>
						<Switch
							value={isDefault}
							onValueChange={setIsDefault}
							trackColor={{ false: '#767577', true: colors.primary }}
						/>
					</View>

					{/* 按钮区域 */}
					<View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
						{/* 测试连接按钮 */}
						<TouchableOpacity
							style={[styles.button, styles.testButton]}
							onPress={handleTestConnection}
							disabled={isTesting || isLoading}
						>
							{isTesting ? (
								<ActivityIndicator size="small" color="white" />
							) : (
								<Text style={styles.buttonText}>测试连接</Text>
							)}
						</TouchableOpacity>

						<View style={{ flexDirection: 'row' }}>
							<TouchableOpacity
								style={[styles.button, styles.cancelButton]}
								onPress={() => handleClose(false)}
								disabled={isLoading}
							>
								<Text style={styles.buttonText}>取消</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={[styles.button, styles.saveButton, isLoading && styles.buttonDisabled]}
								onPress={handleSave}
								disabled={isLoading}
							>
								{isLoading ? (
									<ActivityIndicator size="small" color="white" />
								) : (
									<Text style={styles.buttonText}>保存</Text>
								)}
							</TouchableOpacity>
						</View>
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
	const [isLoading, setIsLoading] = useState(true)
	const [modalVisible, setModalVisible] = useState(false)
	const [selectedServer, setSelectedServer] = useState<WebDAVServer | null>(null)
	const [currentServerState, setCurrentServerState] = useState<WebDAVServer | null>(null)
	const [isComponentMounted, setIsComponentMounted] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [startY, setStartY] = useState(0)
	const [currentY, setCurrentY] = useState(0)
	const [isDragging, setIsDragging] = useState(false)
	const [animatedValues, setAnimatedValues] = useState(null)

	// 组件挂载状态管理
	useEffect(() => {
		setIsComponentMounted(true)
		return () => setIsComponentMounted(false)
	}, [])

	// 加载服务器列表
	const loadServers = useCallback(async () => {
		try {
			if (!isComponentMounted) return

			setIsLoading(true)
			setLoadError(null)

			// 获取最新的服务器列表
			const serversList = getWebDAVServers()
			setServers(serversList)

			// 获取当前服务器
			const current = getCurrentWebDAVServer()
			setCurrentServerState(current)

			logInfo('WebDAV设置: 已加载服务器列表', { count: serversList.length })
		} catch (err) {
			logError('WebDAV设置: 加载服务器列表失败', err)
			setLoadError('加载服务器列表失败: ' + (err.message || '未知错误'))
		} finally {
			if (isComponentMounted) {
				setIsLoading(false)
			}
		}
	}, [isComponentMounted])

	// 安全地获取当前服务器
	useEffect(() => {
		loadServers()
	}, [loadServers])

	// 全局错误处理
	const safeAction = useCallback(
		async (action: () => Promise<any>, successMessage?: string, errorPrefix?: string) => {
			if (!isComponentMounted) return false

			try {
				setIsLoading(true)
				const result = await action()
				if (successMessage && isComponentMounted) {
					showToast(successMessage, 'success')
				}
				return result
			} catch (error) {
				logError(`${errorPrefix || '操作失败'}:`, error)
				if (isComponentMounted) {
					Alert.alert('错误', `${errorPrefix || '操作失败'}: ${error.message || '未知错误'}`)
				}
				return false
			} finally {
				if (isComponentMounted) {
					setIsLoading(false)
				}
			}
		},
		[isComponentMounted],
	)

	const handleAddServer = useCallback(() => {
		try {
			if (!isComponentMounted) return
			setSelectedServer(null)
			setModalVisible(true)
		} catch (error) {
			logError('打开添加服务器模态框失败:', error)
		}
	}, [isComponentMounted])

	const handleEditServer = useCallback(
		(server: WebDAVServer) => {
			try {
				if (!isComponentMounted || !server) return
				setSelectedServer(server)
				setModalVisible(true)
			} catch (error) {
				logError('打开编辑服务器模态框失败:', error)
			}
		},
		[isComponentMounted],
	)

	const handleDeleteServer = useCallback(
		(server: WebDAVServer) => {
			if (!isComponentMounted || !server) return

			try {
				Alert.alert('删除服务器', `确定要删除服务器 "${server.name || '未命名'}" 吗？`, [
					{ text: '取消', style: 'cancel' },
					{
						text: '删除',
						style: 'destructive',
						onPress: async () => {
							await safeAction(
								async () => deleteWebDAVServer(server.id),
								'服务器已删除',
								'删除服务器失败',
							)
						},
					},
				])
			} catch (error) {
				logError('处理删除服务器失败:', error)
			}
		},
		[safeAction, isComponentMounted],
	)

	const handleSetDefault = useCallback(
		async (serverId: string) => {
			return await safeAction(
				async () => {
					if (!isComponentMounted) return false

					logInfo('WebDAV设置: 设置默认服务器', { serverId })
					const result = await setDefaultWebDAVServer(serverId)

					// 重新加载服务器列表
					await loadServers()

					return result
				},
				'设置默认服务器成功',
				'设置默认服务器失败',
			)
		},
		[isComponentMounted, safeAction, loadServers],
	)

	const handleTestServer = useCallback(
		(server: WebDAVServer) => {
			if (!isComponentMounted || !server) return

			safeAction(
				async () => {
					const success = await connectToServer(server)
					if (!success) {
						throw new Error('连接测试失败')
					}
					return success
				},
				'连接测试成功',
				'连接测试失败',
			)
		},
		[safeAction, isComponentMounted],
	)

	const handleCloseModal = useCallback(
		(shouldRefresh: boolean) => {
			try {
				if (!isComponentMounted) return

				// 先关闭模态窗口
				setModalVisible(false)

				// 如果需要刷新,执行刷新
				if (shouldRefresh) {
					loadServers()
				}

				// 延迟执行返回,确保模态窗口已经关闭
				setTimeout(() => {
					if (isComponentMounted) {
						router.back()
					}
				}, 100)
			} catch (error) {
				logError('关闭模态窗口失败:', error)
				// 发生错误时尝试强制返回
				router.back()
			}
		},
		[isComponentMounted, loadServers, router],
	)

	const handleGoBack = useCallback(() => {
		try {
			// 如果模态窗口打开,先关闭它
			if (modalVisible) {
				setModalVisible(false)
				return
			}

			// 否则直接返回
			router.back()
		} catch (error) {
			logError('返回失败:', error)
			// 发生错误时尝试强制返回到主页
			router.replace('/(tabs)')
		}
	}, [modalVisible, router])

	// 使用useEffect安全地创建动画值
	useEffect(() => {
		let values = null
		try {
			if (Animated && Animated.useSharedValue) {
				const translationY = Animated.useSharedValue(0)
				values = { translationY }
				logInfo('动画值创建成功')
			}
		} catch (error) {
			logError('创建动画值失败:', error)
		}
		setAnimatedValues(values)
	}, [])

	// 监听返回键
	useEffect(() => {
		const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
			if (modalVisible) {
				handleCloseModal(false)
				return true
			}
			router.back()
			return true
		})

		return () => backHandler.remove()
	}, [handleCloseModal, router, modalVisible])

	// 备用触摸事件处理 - 如果手势库不可用
	const handleTouchStart = (event) => {
		setStartY(event.nativeEvent.pageY)
		setCurrentY(event.nativeEvent.pageY)
		setIsDragging(true)
	}

	const handleTouchMove = (event) => {
		if (isDragging) {
			setCurrentY(event.nativeEvent.pageY)
		}
	}

	const handleTouchEnd = () => {
		if (isDragging) {
			const diff = currentY - startY
			if (diff > 50) {
				// 向下滑动超过阈值，关闭模态窗口
				router.back()
			}
			setIsDragging(false)
		}
	}

	// 条件渲染容器 - 基于是否有手势库
	const renderContainer = (children) => {
		try {
			// 如果手势库和动画值都可用
			if (GestureHandler && Animated && animatedValues && animatedValues.translationY) {
				// 创建手势处理器
				const gestureHandler = Animated.useAnimatedGestureHandler({
					onStart: (_event, ctx) => {
						ctx.startY = animatedValues.translationY.value
					},
					onActive: (event, ctx) => {
						if (event.translationY > 0) {
							// 只允许向下拖动
							animatedValues.translationY.value = ctx.startY + event.translationY
						}
					},
					onEnd: (event) => {
						if (event.translationY > 100) {
							// 关闭模态窗口
							router.back()
						} else {
							// 回弹到起始位置
							Animated.withSpring(animatedValues.translationY, {
								toValue: 0,
								damping: 20,
								stiffness: 200,
							})
						}
					},
				})

				// 创建动画样式
				const animatedStyle = Animated.useAnimatedStyle(() => {
					return {
						transform: [{ translateY: animatedValues.translationY.value }],
					}
				})

				// 使用手势处理器和动画
				return (
					<GestureHandler onGestureEvent={gestureHandler}>
						<Animated.View style={[styles.container, animatedStyle]}>
							<View style={styles.handle} />
							{children}
						</Animated.View>
					</GestureHandler>
				)
			}
		} catch (error) {
			logError('渲染手势容器失败，使用备用方案:', error)
		}

		// 备用方案 - 使用基础触摸事件
		return (
			<View
				style={styles.container}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
			>
				<View style={styles.handle} />
				{children}
			</View>
		)
	}

	// 如果没有服务器，显示添加服务器的引导信息
	if (!servers || !Array.isArray(servers) || servers.length === 0) {
		return renderContainer(
			<>
				<View style={styles.header}>
					<Text style={styles.headerTitle}>WebDAV 服务器</Text>
					<TouchableOpacity
						style={styles.closeButton}
						onPress={handleGoBack}
						hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
					>
						<Ionicons name="close" size={24} color={colors.text} />
					</TouchableOpacity>
				</View>

				<View style={styles.emptyContainer}>
					<Ionicons name="cloud-outline" size={80} color="#999" />
					<Text style={styles.emptyTitle}>没有添加 WebDAV 服务器</Text>
					<Text style={styles.emptySubtitle}>
						添加一个 WebDAV 服务器来访问和播放您的云端音乐文件
					</Text>
					<TouchableOpacity style={styles.addButton} onPress={handleAddServer}>
						<Ionicons name="add" size={24} color="#fff" />
						<Text style={styles.addButtonText}>添加服务器</Text>
					</TouchableOpacity>
				</View>

				<ServerEditModal
					isVisible={modalVisible}
					onClose={handleCloseModal}
					initialServer={selectedServer}
					loadServers={loadServers}
				/>
			</>,
		)
	}

	return (
		<ErrorBoundary>
			{renderContainer(
				<>
					<View style={styles.header}>
						<Text style={styles.headerTitle}>WebDAV 服务器</Text>
						<TouchableOpacity
							style={styles.closeButton}
							onPress={handleGoBack}
							hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
						>
							<Ionicons name="close" size={24} color={colors.text} />
						</TouchableOpacity>
					</View>

					<View style={styles.actionContainer}>
						<TouchableOpacity style={styles.addButton} onPress={handleAddServer}>
							<Text style={styles.addButtonText}>添加服务器</Text>
						</TouchableOpacity>
					</View>

					{isLoading ? (
						<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
							<ActivityIndicator size="large" color={colors.accent} />
							<Text style={{ marginTop: 20, fontSize: 16 }}>加载中...</Text>
						</View>
					) : servers.length === 0 ? (
						<View style={styles.emptyContainer}>
							<Text style={styles.emptyText}>没有WebDAV服务器</Text>
							<Text style={styles.emptySubtext}>点击上方的"添加服务器"按钮添加一个服务器</Text>
						</View>
					) : (
						<FlatList
							data={servers}
							renderItem={renderItem}
							keyExtractor={(item) => item?.id || Math.random().toString()}
							contentContainerStyle={styles.listContainer}
							ItemSeparatorComponent={() => <View style={styles.separator} />}
							ListEmptyComponent={
								<View style={styles.emptyContainer}>
									<Text style={styles.emptyText}>没有WebDAV服务器</Text>
									<Text style={styles.emptySubtext}>点击上方的"添加服务器"按钮添加一个服务器</Text>
								</View>
							}
						/>
					)}

					<ServerEditModal
						isVisible={modalVisible}
						onClose={handleCloseModal}
						initialServer={selectedServer}
						loadServers={loadServers}
					/>
				</>,
			)}
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
	modalOverlay: {
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
	modalTitle: {
		fontSize: 20,
		fontWeight: 'bold',
		color: colors.text,
		marginBottom: 20,
		textAlign: 'center',
	},
	input: {
		backgroundColor: colors.item,
		borderRadius: 5,
		paddingHorizontal: 15,
		paddingVertical: 10,
		marginBottom: 15,
		color: colors.text,
	},
	inputLabel: {
		fontSize: 14,
		color: colors.text,
		marginBottom: 5,
	},
	urlInputContainer: {
		marginBottom: 15,
	},
	protocolSelector: {
		flexDirection: 'row',
		marginRight: 8,
		borderRadius: 4,
		borderWidth: 1,
		borderColor: '#444',
		overflow: 'hidden',
	},
	protocolOption: {
		paddingHorizontal: 8,
		paddingVertical: 6,
		backgroundColor: '#333',
	},
	protocolOptionSelected: {
		backgroundColor: colors.primary,
	},
	protocolText: {
		color: colors.text,
		fontSize: 14,
	},
	protocolTextSelected: {
		color: 'white',
	},
	urlInput: {
		backgroundColor: colors.item,
		borderRadius: 5,
		paddingHorizontal: 15,
		paddingVertical: 10,
		color: colors.text,
	},
	switchContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	switchLabel: {
		fontSize: 14,
		color: colors.text,
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
	cancelButton: {
		backgroundColor: '#999',
	},
	saveButton: {
		backgroundColor: colors.accent,
	},
	buttonText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	emptyTitle: {
		fontSize: 24,
		fontWeight: 'bold',
		color: colors.text,
		marginBottom: 10,
	},
	emptySubtitle: {
		fontSize: 16,
		color: colors.subtext,
		textAlign: 'center',
	},
	backButton: {
		position: 'absolute',
		top: 0,
		left: 0,
		padding: 10,
	},
	title: {
		fontSize: 34,
		fontWeight: 'bold',
		color: colors.text,
	},
	refreshButton: {
		position: 'absolute',
		top: 0,
		right: 0,
		padding: 10,
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
		marginTop: 20,
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
		marginBottom: 20,
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
	separator: {
		height: 1,
		backgroundColor: colors.border,
		marginVertical: 10,
	},
	testButton: {
		backgroundColor: '#0066cc',
		paddingVertical: 10,
		paddingHorizontal: 16,
		borderRadius: 6,
	},
	buttonDisabled: {
		backgroundColor: '#ccc',
	},
	handle: {
		height: 5,
		backgroundColor: colors.border,
		borderRadius: 2.5,
		marginBottom: 10,
	},
})

export default WebDAVModal
