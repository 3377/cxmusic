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
import React, { useEffect, useState } from 'react'
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

// 服务器编辑模态窗口
const ServerEditModal = ({ isVisible, onClose, initialServer = null }) => {
	const [name, setName] = useState('')
	const [url, setUrl] = useState('')
	const [username, setUsername] = useState('')
	const [password, setPassword] = useState('')
	const [isDefault, setIsDefault] = useState(false)
	const [isLoading, setIsLoading] = useState(false)

	// 当初始服务器变化时，更新表单
	useEffect(() => {
		if (initialServer) {
			setName(initialServer.name)
			setUrl(initialServer.url)
			setUsername(initialServer.username)
			setPassword(initialServer.password)
			setIsDefault(initialServer.isDefault || false)
		} else {
			// 重置表单
			setName('')
			setUrl('')
			setUsername('')
			setPassword('')
			setIsDefault(false)
		}
	}, [initialServer, isVisible])

	const handleSave = async () => {
		if (!name || !url || !username) {
			Alert.alert('错误', '服务器名称、URL和用户名不能为空')
			return
		}

		try {
			setIsLoading(true)

			// 创建服务器对象
			const server: WebDAVServer = {
				id: initialServer?.id || Date.now().toString(),
				name,
				url,
				username,
				password,
				isDefault,
			}

			// 添加或更新服务器
			const success = await addWebDAVServer(server)

			if (success) {
				showToast(`${initialServer ? '更新' : '添加'}服务器成功`, 'success')
				onClose(true)
			} else {
				Alert.alert('错误', `${initialServer ? '更新' : '添加'}服务器失败，请检查连接信息`)
			}
		} catch (error) {
			logError(`${initialServer ? '更新' : '添加'}服务器失败:`, error)
			Alert.alert('错误', `${initialServer ? '更新' : '添加'}服务器失败: ${error.message}`)
		} finally {
			setIsLoading(false)
		}
	}

	return (
		<Modal
			visible={isVisible}
			transparent={true}
			animationType="slide"
			onRequestClose={() => onClose(false)}
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
							onPress={() => onClose(false)}
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
	return (
		<View style={styles.serverItem}>
			<View style={styles.serverInfo}>
				<Text style={styles.serverName}>{server.name}</Text>
				<Text style={styles.serverUrl}>{server.url}</Text>
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
}

// 主页面组件
const WebDAVModal = () => {
	const insets = useSafeAreaInsets()
	const router = useRouter()
	const servers = useWebDAVServers()
	const [isLoading, setIsLoading] = useState(false)
	const [modalVisible, setModalVisible] = useState(false)
	const [selectedServer, setSelectedServer] = useState<WebDAVServer | null>(null)
	const currentServer = getCurrentWebDAVServer()

	// 全局错误处理
	const safeAction = async (
		action: () => Promise<any>,
		successMessage?: string,
		errorPrefix?: string,
	) => {
		try {
			setIsLoading(true)
			const result = await action()
			if (successMessage) {
				showToast(successMessage, 'success')
			}
			return result
		} catch (error) {
			logError(`${errorPrefix || '操作失败'}:`, error)
			Alert.alert('错误', `${errorPrefix || '操作失败'}: ${error.message || '未知错误'}`)
			return false
		} finally {
			setIsLoading(false)
		}
	}

	const handleAddServer = () => {
		setSelectedServer(null)
		setModalVisible(true)
	}

	const handleEditServer = (server: WebDAVServer) => {
		setSelectedServer(server)
		setModalVisible(true)
	}

	const handleDeleteServer = (server: WebDAVServer) => {
		Alert.alert('删除服务器', `确定要删除服务器 "${server.name}" 吗？`, [
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
	}

	const handleSetDefaultServer = (server: WebDAVServer) => {
		safeAction(
			async () => setDefaultWebDAVServer(server.id),
			`已设置 "${server.name}" 为默认服务器`,
			'设置默认服务器失败',
		)
	}

	const handleTestServer = (server: WebDAVServer) => {
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
	}

	const handleCloseModal = (shouldRefresh: boolean) => {
		setModalVisible(false)
		if (shouldRefresh) {
			// 刷新状态
		}
	}

	const renderItem = ({ item }) => (
		<ServerItem
			server={item}
			onEdit={handleEditServer}
			onDelete={handleDeleteServer}
			onSetDefault={handleSetDefaultServer}
			onTest={handleTestServer}
			isCurrentServer={currentServer?.id === item.id}
		/>
	)

	// 如果没有服务器，显示添加服务器的引导信息
	if (servers.length === 0) {
		return (
			<View style={[styles.container, { paddingTop: insets.top }]}>
				<View style={styles.header}>
					<Text style={styles.headerTitle}>WebDAV 服务器</Text>
					<TouchableOpacity
						style={styles.closeButton}
						onPress={() => router.back()}
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
		<View style={[styles.container, { paddingTop: insets.top }]}>
			<View style={styles.header}>
				<Text style={styles.headerTitle}>WebDAV 服务器</Text>
				<TouchableOpacity
					style={styles.closeButton}
					onPress={() => router.back()}
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

			{servers?.length === 0 ? (
				<View style={styles.emptyContainer}>
					<Text style={styles.emptyText}>没有WebDAV服务器</Text>
					<Text style={styles.emptySubtext}>点击上方的"添加服务器"按钮添加一个服务器</Text>
				</View>
			) : (
				<FlatList
					data={servers}
					renderItem={renderItem}
					keyExtractor={(item) => item.id}
					contentContainerStyle={styles.listContainer}
					ItemSeparatorComponent={() => <View style={styles.separator} />}
				/>
			)}

			<ServerEditModal
				isVisible={modalVisible}
				onClose={handleCloseModal}
				initialServer={selectedServer}
			/>
		</View>
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
