import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import {
	WebDAVServer,
	addWebDAVServer,
	connectToServer,
	deleteWebDAVServer,
	getCurrentWebDAVServer,
	setDefaultWebDAVServer,
	useWebDAVServers,
} from '@/helpers/webdavService'
import { showToast } from '@/utils/utils'
import { Ionicons } from '@expo/vector-icons'
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

// 错误边界组件
class ErrorBoundary extends React.Component {
	state = { hasError: false }

	static getDerivedStateFromError() {
		return { hasError: true }
	}

	componentDidCatch(error, info) {
		logError('WebDAV模态窗口错误:', error, info)
	}

	render() {
		if (this.state.hasError) {
			return (
				<View
					style={[
						styles.container,
						{ justifyContent: 'center', alignItems: 'center', padding: 20 },
					]}
				>
					<Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 20 }}>
						加载WebDAV设置失败
					</Text>
					<TouchableOpacity
						style={styles.addButton}
						onPress={() => this.setState({ hasError: false })}
					>
						<Text style={styles.addButtonText}>重试</Text>
					</TouchableOpacity>
				</View>
			)
		}

		return this.props.children
	}
}

// 服务器编辑模态窗口
const ServerEditModal = ({ isVisible, onClose, initialServer = null }) => {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [isDefault, setIsDefault] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const [isComponentMounted, setIsComponentMounted] = useState(false)

	// 组件挂载状态管理
	useEffect(() => {
		setIsComponentMounted(true)
		return () => setIsComponentMounted(false)
	}, [])

	// 当初始服务器变化时，更新表单
	useEffect(() => {
		if (!isComponentMounted) return

		try {
			if (initialServer) {
				setName(initialServer.name || '')
				setUrl(initialServer.url || '')
				setUsername(initialServer.username || '')
				setPassword(initialServer.password || '')
				setIsDefault(initialServer.isDefault || false)
			} else {
				// 重置表单
				setName('')
				setUrl('')
				setUsername('')
				setPassword('')
				setIsDefault(false)
			}
		} catch (error) {
			logError('更新服务器编辑表单失败:', error)
		}
	}, [initialServer, isVisible, isComponentMounted])

	const handleSave = useCallback(async () => {
		if (!isComponentMounted) return

		if (!name || !url || !username) {
			Alert.alert('错误', '服务器名称、URL和用户名不能为空')
			return
		}

		try {
			setIsLoading(true)

			// 创建服务器对象
			const server: WebDAVServer = {
				id: initialServer?.id || Date.now().toString(),
				name: name.trim(),
				url: url.trim(),
				username: username.trim(),
				password: password || '',
				isDefault,
			}

			// 添加或更新服务器
			const success = await addWebDAVServer(server)

			if (!isComponentMounted) return

			if (success) {
				showToast(`${initialServer ? '更新' : '添加'}服务器成功`, 'success')
				onClose(true)
			} else {
				Alert.alert('错误', `${initialServer ? '更新' : '添加'}服务器失败，请检查连接信息`)
			}
		} catch (error) {
			logError(`${initialServer ? '更新' : '添加'}服务器失败:`, error)
			if (isComponentMounted) {
				Alert.alert(
					'错误',
					`${initialServer ? '更新' : '添加'}服务器失败: ${error.message || '未知错误'}`,
				)
			}
		} finally {
			if (isComponentMounted) {
				setIsLoading(false)
			}
		}
	}, [name, url, username, password, isDefault, initialServer, onClose, isComponentMounted])

	// 安全地关闭模态窗口
	const handleClose = useCallback(
		(shouldRefresh = false) => {
			try {
				if (isComponentMounted) {
					onClose(shouldRefresh)
				}
			} catch (error) {
				logError('关闭服务器编辑模态窗口失败:', error)
			}
		},
		[onClose, isComponentMounted],
	)

	if (!isVisible) return null

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="slide"
			onRequestClose={() => handleClose(false)}
		>
			<View style={styles.modalOverlay}>
				<View style={styles.modalContent}>
					<Text style={styles.modalTitle}>{initialServer ? '编辑服务器' : '添加服务器'}</Text>

					<Text style={styles.inputLabel}>服务器名称</Text>
					<TextInput
						style={styles.input}
						value={name}
						onChangeText={setName}
						placeholder="例如：我的WebDAV服务器"
						placeholderTextColor="#999"
					/>

					<Text style={styles.inputLabel}>URL</Text>
					<TextInput
						style={styles.input}
						value={url}
						onChangeText={setUrl}
						placeholder="https://example.com/webdav/"
						placeholderTextColor="#999"
						autoCapitalize="none"
						keyboardType="url"
					/>

					<Text style={styles.inputLabel}>用户名</Text>
					<TextInput
						style={styles.input}
						value={username}
						onChangeText={setUsername}
						placeholder="用户名"
						placeholderTextColor="#999"
						autoCapitalize="none"
					/>

					<Text style={styles.inputLabel}>密码</Text>
					<TextInput
						style={styles.input}
						value={password}
						onChangeText={setPassword}
						placeholder="密码"
						placeholderTextColor="#999"
						secureTextEntry={true}
					/>

					<View style={styles.switchContainer}>
						<Text style={styles.switchLabel}>设为默认服务器</Text>
						<Switch value={isDefault} onValueChange={setIsDefault} />
					</View>

					<View style={styles.buttonContainer}>
						<TouchableOpacity
							style={[styles.button, styles.cancelButton]}
							onPress={() => handleClose(false)}
							disabled={isLoading}
						>
							<Text style={styles.buttonText}>取消</Text>
						</TouchableOpacity>
						<TouchableOpacity
							style={[styles.button, styles.saveButton]}
							onPress={handleSave}
							disabled={isLoading}
						>
							{isLoading ? (
								<ActivityIndicator size="small" color="#fff" />
							) : (
								<Text style={styles.buttonText}>保存</Text>
							)}
						</TouchableOpacity>
					</View>
				</View>
			</View>
		</Modal>
	)
}

// 服务器项组件
const ServerItem = ({ server, onEdit, onDelete, onSetDefault, onTest, isCurrentServer }) => {
	if (!server) return null

	try {
		return (
			<View style={styles.serverItem}>
				<View style={styles.serverInfo}>
					<Text style={styles.serverName}>{server.name || '未命名服务器'}</Text>
					<Text style={styles.serverUrl}>{server.url || '无URL'}</Text>
					{server.isDefault && <Text style={styles.defaultBadge}>默认</Text>}
					{isCurrentServer && <Text style={styles.currentBadge}>当前连接</Text>}
				</View>
				<View style={styles.serverActions}>
					<TouchableOpacity
						style={[styles.actionButton, styles.testButton]}
						onPress={() => onTest(server)}
					>
						<Text style={styles.actionButtonText}>测试</Text>
					</TouchableOpacity>
					{!server.isDefault && (
						<TouchableOpacity
							style={[styles.actionButton, styles.defaultButton]}
							onPress={() => onSetDefault(server)}
						>
							<Text style={styles.actionButtonText}>设为默认</Text>
						</TouchableOpacity>
					)}
					<TouchableOpacity
						style={[styles.actionButton, styles.editButton]}
						onPress={() => onEdit(server)}
					>
						<Text style={styles.actionButtonText}>编辑</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.actionButton, styles.deleteButton]}
						onPress={() => onDelete(server)}
					>
						<Text style={styles.actionButtonText}>删除</Text>
					</TouchableOpacity>
				</View>
			</View>
		)
	} catch (error) {
		logError('渲染服务器项失败:', error)
		return (
			<View style={styles.serverItem}>
				<View style={styles.serverInfo}>
					<Text style={styles.serverName}>加载失败</Text>
					<Text style={styles.serverUrl}>无法显示服务器信息</Text>
				</View>
			</View>
		)
	}
}

// 主页面组件
const WebDAVModal = () => {
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const servers = useWebDAVServers()
	const [isLoading, setIsLoading] = useState(false)
	const [modalVisible, setModalVisible] = useState(false)
	const [selectedServer, setSelectedServer] = useState<WebDAVServer | null>(null)
	const [currentServerState, setCurrentServerState] = useState<WebDAVServer | null>(null)
	const [isComponentMounted, setIsComponentMounted] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)

	// 组件挂载状态管理
	useEffect(() => {
		setIsComponentMounted(true)
		return () => setIsComponentMounted(false)
	}, [])

	// 安全地获取当前服务器
	useEffect(() => {
		if (!isComponentMounted) return

		try {
			const server = getCurrentWebDAVServer()
			setCurrentServerState(server)
			setLoadError(null)
		} catch (error) {
			logError('获取当前WebDAV服务器失败:', error)
			setLoadError('无法加载当前WebDAV服务器状态')
		}
	}, [servers, isComponentMounted])

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

	const handleSetDefaultServer = useCallback(
		(server: WebDAVServer) => {
			if (!isComponentMounted || !server) return

			safeAction(
				async () => setDefaultWebDAVServer(server.id),
				`已设置 "${server.name || '未命名'}" 为默认服务器`,
				'设置默认服务器失败',
			)
		},
		[safeAction, isComponentMounted],
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
				setModalVisible(false)
			} catch (error) {
				logError('关闭模态窗口失败:', error)
			}
		},
		[isComponentMounted],
	)

	const handleGoBack = useCallback(() => {
		try {
			router.back()
		} catch (error) {
			logError('导航返回失败:', error)
			// 尝试使用延迟来执行导航
			setTimeout(() => {
				try {
					router.back()
				} catch (innerError) {
					logError('再次尝试导航返回失败:', innerError)
				}
			}, 100)
		}
	}, [router])

	const renderItem = useCallback(
		({ item }) => {
			if (!item) return null

			try {
				return (
					<ServerItem
						server={item}
						onEdit={handleEditServer}
						onDelete={handleDeleteServer}
						onSetDefault={handleSetDefaultServer}
						onTest={handleTestServer}
						isCurrentServer={currentServerState?.id === item.id}
					/>
				)
			} catch (error) {
				logError('渲染服务器项失败:', error)
				return null
			}
		},
		[
			handleEditServer,
			handleDeleteServer,
			handleSetDefaultServer,
			handleTestServer,
			currentServerState,
		],
	)

	// 如果加载错误，显示错误信息
	if (loadError) {
		return (
			<View style={[styles.container, { paddingTop: insets.top }]}>
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

				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Ionicons name="alert-circle" size={60} color="#FF6B6B" />
					<Text
						style={{ fontSize: 18, fontWeight: 'bold', marginVertical: 20, textAlign: 'center' }}
					>
						{loadError}
					</Text>
					<TouchableOpacity
						style={styles.addButton}
						onPress={() => {
							setLoadError(null)
							// 尝试重新获取当前服务器
							try {
								const server = getCurrentWebDAVServer()
								setCurrentServerState(server)
							} catch (error) {
								logError('重试获取当前WebDAV服务器失败:', error)
							}
						}}
					>
						<Text style={styles.addButtonText}>重试</Text>
					</TouchableOpacity>
				</View>
			</View>
		)
	}

	// 如果没有服务器，显示添加服务器的引导信息
	if (!servers || !Array.isArray(servers) || servers.length === 0) {
		return (
			<View style={[styles.container, { paddingTop: insets.top }]}>
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
				/>
			</View>
		)
	}

	return (
		<ErrorBoundary>
			<View style={[styles.container, { paddingTop: insets.top }]}>
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
	serverInfo: {
		marginBottom: 10,
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
	defaultBadge: {
		position: 'absolute',
		top: 0,
		right: 0,
		backgroundColor: colors.accent,
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 10,
		color: '#fff',
		fontSize: 12,
		fontWeight: 'bold',
	},
	currentBadge: {
		position: 'absolute',
		top: 0,
		right: 70,
		backgroundColor: 'green',
		paddingHorizontal: 8,
		paddingVertical: 4,
		borderRadius: 10,
		color: '#fff',
		fontSize: 12,
		fontWeight: 'bold',
	},
	serverActions: {
		flexDirection: 'row',
		justifyContent: 'flex-end',
	},
	actionButton: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 5,
		marginLeft: 8,
	},
	testButton: {
		backgroundColor: '#4CAF50',
	},
	defaultButton: {
		backgroundColor: '#2196F3',
	},
	editButton: {
		backgroundColor: '#FF9800',
	},
	deleteButton: {
		backgroundColor: '#F44336',
	},
	actionButtonText: {
		color: '#fff',
		fontSize: 12,
		fontWeight: 'bold',
	},
	separator: {
		height: 1,
		backgroundColor: colors.border,
		marginVertical: 10,
	},
	modalOverlay: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
	},
	modalContent: {
		width: '80%',
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
})

export default WebDAVModal
