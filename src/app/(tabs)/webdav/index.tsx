import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import {
	WebDAVFile,
	getDirectoryContents,
	useCurrentWebDAVServer,
	webdavFileToMusicItem,
} from '@/helpers/webdavService'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	FlatList,
	InteractionManager,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'

// 错误捕获组件
class ErrorCatcher extends React.Component {
	state = { hasError: false, errorInfo: null }

	static getDerivedStateFromError() {
		return { hasError: true }
	}

	componentDidCatch(error, errorInfo) {
		logError('WebDAV错误:', error, errorInfo)
		this.setState({ errorInfo: errorInfo })
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={styles.errorContainer}>
					<Ionicons name="cloud-offline" size={60} color={colors.subtext} />
					<Text style={styles.errorText}>WebDAV组件加载失败</Text>
					<Text style={styles.errorSubtext}>请检查您的网络连接和WebDAV服务器设置</Text>
					<TouchableOpacity
						style={styles.retryButton}
						onPress={() => this.setState({ hasError: false })}
					>
						<Text style={styles.retryButtonText}>重试</Text>
					</TouchableOpacity>
				</View>
			)
		}

		return this.props.children
	}
}

// 加载占位符
const LoadingPlaceholder = () => (
	<View style={styles.loadingContainer}>
		<ActivityIndicator size="large" color={colors.primary} />
		<Text style={styles.loadingText}>加载中...</Text>
	</View>
)

// 懒加载组件
const LazyFileItem = lazy(() => Promise.resolve().then(() => ({ default: FileItem })))

const LazyFileActions = lazy(() => Promise.resolve().then(() => ({ default: FileActions })))

// 文件项组件
const FileItem = React.memo(({ file, onPress, onLongPress }) => {
	const isDirectory = file.type === 'directory'
	const isMusic =
		file.mime?.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename || '')

	// 格式化文件大小显示
	const formatFileSize = (size: number) => {
		if (size < 1024) return `${size} B`
		if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
		return `${(size / (1024 * 1024)).toFixed(1)} MB`
	}

	// 安全地获取文件修改日期
	const getModifiedDate = () => {
		try {
			return new Date(file.lastmod).toLocaleDateString()
		} catch (e) {
			return '未知日期'
		}
	}

	return (
		<TouchableOpacity
			style={styles.fileItem}
			onPress={() => onPress(file)}
			onLongPress={() => onLongPress(file)}
		>
			<View style={styles.fileIcon}>
				<Ionicons
					name={isDirectory ? 'folder' : isMusic ? 'musical-note' : 'document'}
					size={24}
					color={isDirectory ? '#FFA000' : isMusic ? colors.primary : '#607D8B'}
				/>
			</View>
			<View style={styles.fileInfo}>
				<Text style={styles.fileName} numberOfLines={1}>
					{file.basename}
				</Text>
				<Text style={styles.fileDetails}>
					{isDirectory ? '文件夹' : `${formatFileSize(file.size)} · ${getModifiedDate()}`}
				</Text>
			</View>
		</TouchableOpacity>
	)
})

// 文件操作菜单
const FileActions = ({ file, onPlay, onAddToQueue, onClose, visible }) => {
	if (!visible || !file) return null

	try {
		const isMusic =
			file.type === 'file' &&
			(file.mime?.startsWith('audio/') ||
				/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename || ''))

		return (
			<View style={styles.actionsOverlay}>
				<View style={styles.actionsContainer}>
					<Text style={styles.actionsTitle}>{file.basename || '未知文件'}</Text>

					{isMusic && (
						<>
							<TouchableOpacity
								style={styles.actionButton}
								onPress={() => {
									onPlay(file)
									onClose()
								}}
							>
								<Ionicons name="play" size={20} color="#fff" />
								<Text style={styles.actionText}>播放</Text>
							</TouchableOpacity>

							<TouchableOpacity
								style={styles.actionButton}
								onPress={() => {
									onAddToQueue(file)
									onClose()
								}}
							>
								<Ionicons name="add" size={20} color="#fff" />
								<Text style={styles.actionText}>添加到播放队列</Text>
							</TouchableOpacity>
						</>
					)}

					<TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={onClose}>
						<Text style={styles.actionText}>取消</Text>
					</TouchableOpacity>
				</View>
			</View>
		)
	} catch (error) {
		logError('渲染文件操作菜单失败:', error)
		return (
			<View style={styles.actionsOverlay}>
				<View style={styles.actionsContainer}>
					<Text style={styles.actionsTitle}>操作失败</Text>
					<TouchableOpacity style={[styles.actionButton, styles.cancelButton]} onPress={onClose}>
						<Text style={styles.actionText}>关闭</Text>
					</TouchableOpacity>
				</View>
			</View>
		)
	}
}

// WebDAV主页面
const WebDAVScreen = () => {
	const router = useRouter()
	const currentServer = useCurrentWebDAVServer()
	const { addToPlaylist, playTrack } = usePlayer()
	const [isLoading, setIsLoading] = useState(false)
	const [loadError, setLoadError] = useState(null)
	const [currentPath, setCurrentPath] = useState('/')
	const [pathHistory, setPathHistory] = useState<string[]>([])
	const [files, setFiles] = useState<WebDAVFile[]>([])
	const [selectedFile, setSelectedFile] = useState<WebDAVFile | null>(null)
	const [showActions, setShowActions] = useState(false)
	const [isComponentMounted, setIsComponentMounted] = useState(false)
	const loadAttempts = useRef(0)
	const isFirstLoadRef = useRef(true)

	// 使用useEffect标记组件已挂载，防止内存泄漏
	useEffect(() => {
		setIsComponentMounted(true)

		// 使用InteractionManager确保UI交互完成后再尝试加载内容
		if (isFirstLoadRef.current) {
			isFirstLoadRef.current = false
			InteractionManager.runAfterInteractions(() => {
				// 延迟300ms加载数据以确保UI稳定
				setTimeout(() => {
					if (currentServer) {
						loadDirectoryContents('/')
					}
				}, 300)
			})
		}

		return () => {
			setIsComponentMounted(false)
		}
	}, [])

	// 加载当前目录内容
	const loadDirectoryContents = useCallback(
		async (path: string = '/', shouldResetHistory = false) => {
			if (!currentServer || !isComponentMounted) {
				return
			}

			try {
				setLoadError(null)
				setIsLoading(true)

				// 增加加载尝试次数
				loadAttempts.current += 1

				// 如果尝试次数过多，延迟后再尝试
				if (loadAttempts.current > 3) {
					Alert.alert('提示', '加载次数过多，请稍后再试')
					setTimeout(() => {
						loadAttempts.current = 0
					}, 5000)
					setIsLoading(false)
					return
				}

				// 安全地获取目录内容
				const contents = await getDirectoryContents(path).catch((err) => {
					throw err
				})

				// 确保组件仍然挂载
				if (isComponentMounted) {
					setFiles(contents || [])
					setCurrentPath(path)

					// 如果需要重置历史记录
					if (shouldResetHistory) {
						setPathHistory([])
					}

					// 重置尝试计数
					loadAttempts.current = 0
				}
			} catch (error) {
				logError(`加载目录内容失败 (${path}):`, error)
				if (isComponentMounted) {
					setLoadError(error.message || '加载失败')
					Alert.alert('错误', '无法加载目录内容，请检查连接')
				}
			} finally {
				if (isComponentMounted) {
					setIsLoading(false)
				}
			}
		},
		[currentServer, isComponentMounted],
	)

	// 初始化和服务器变更时加载根目录
	useEffect(() => {
		if (currentServer && isComponentMounted) {
			loadDirectoryContents('/', true)
		} else if (isComponentMounted) {
			setFiles([])
			setCurrentPath('/')
			setPathHistory([])
		}
	}, [currentServer, isComponentMounted, loadDirectoryContents])

	// 创建安全的文件处理器
	const createSafeHandler = useCallback((handler) => {
		return (file) => {
			try {
				if (!file) {
					logError('文件处理错误: 文件为空')
					return
				}
				handler(file)
			} catch (error) {
				logError('文件处理错误:', error)
			}
		}
	}, [])

	// 处理文件或目录点击
	const handleFilePress = useCallback(
		(file: WebDAVFile) => {
			if (!file || !isComponentMounted) return

			try {
				if (file.type === 'directory') {
					// 导航到子目录
					setPathHistory((prev) => [...prev, currentPath])
					loadDirectoryContents(file.path)
				} else if (file.type === 'file') {
					// 显示文件操作菜单（仅限音乐文件）
					const isMusic =
						file.mime?.startsWith('audio/') ||
						/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename || '')

					if (isMusic) {
						setSelectedFile(file)
						setShowActions(true)
					}
				}
			} catch (error) {
				logError('处理文件点击失败:', error)
				Alert.alert('提示', '无法处理此文件')
			}
		},
		[currentPath, isComponentMounted, loadDirectoryContents],
	)

	// 包装安全的文件处理函数
	const safeHandleFilePress = useMemo(
		() => createSafeHandler(handleFilePress),
		[createSafeHandler, handleFilePress],
	)

	// 处理文件长按
	const handleFileLongPress = useCallback(
		(file: WebDAVFile) => {
			if (!file || !isComponentMounted) return

			try {
				setSelectedFile(file)
				setShowActions(true)
			} catch (error) {
				logError('处理文件长按失败:', error)
			}
		},
		[isComponentMounted],
	)

	// 包装安全的长按处理函数
	const safeHandleFileLongPress = useMemo(
		() => createSafeHandler(handleFileLongPress),
		[createSafeHandler, handleFileLongPress],
	)

	// 播放音乐
	const playMusic = useCallback(() => {
		try {
			if (!selectedFile || !isComponentMounted) return

			const musicItem = webdavFileToMusicItem(selectedFile)
			playTrack(musicItem)
			handleCloseActions()
		} catch (error) {
			logError('播放音乐失败:', error)
			Alert.alert('错误', '无法播放此音乐文件')
			handleCloseActions()
		}
	}, [selectedFile, isComponentMounted, playTrack])

	// 添加到播放列表
	const addToPlaylistHandler = useCallback(() => {
		try {
			if (!selectedFile || !isComponentMounted) return

			const musicItem = webdavFileToMusicItem(selectedFile)
			addToPlaylist(musicItem)
			handleCloseActions()

			// 显示添加成功提示
			Alert.alert('提示', '已添加到播放列表')
		} catch (error) {
			logError('添加到播放列表失败:', error)
			Alert.alert('错误', '无法添加到播放列表')
			handleCloseActions()
		}
	}, [selectedFile, isComponentMounted, addToPlaylist])

	// 处理返回按钮
	const handleGoBack = useCallback(() => {
		try {
			if (!isComponentMounted || pathHistory.length === 0) return

			const prevPath = pathHistory[pathHistory.length - 1]
			setPathHistory((prev) => prev.slice(0, -1))
			loadDirectoryContents(prevPath)
		} catch (error) {
			logError('返回上级目录失败:', error)
			// 如果返回失败，尝试回到根目录
			try {
				loadDirectoryContents('/')
				setPathHistory([])
			} catch (rootError) {
				logError('返回根目录失败:', rootError)
			}
		}
	}, [pathHistory, isComponentMounted, loadDirectoryContents])

	// 刷新当前目录
	const handleRefresh = useCallback(() => {
		try {
			if (!isComponentMounted) return
			loadDirectoryContents(currentPath)
		} catch (error) {
			logError('刷新目录失败:', error)
		}
	}, [currentPath, isComponentMounted, loadDirectoryContents])

	// 格式化当前路径显示
	const formatPath = useCallback((path: string) => {
		if (path === '/') {
			return '根目录'
		}

		// 获取路径的最后一部分
		const parts = path.split('/').filter(Boolean)
		return parts[parts.length - 1] || '根目录'
	}, [])

	// 关闭文件操作菜单
	const handleCloseActions = useCallback(() => {
		if (isComponentMounted) {
			setShowActions(false)
			setSelectedFile(null)
		}
	}, [isComponentMounted])

	// 安全地导航到WebDAV设置
	const navigateToSettings = useCallback(() => {
		try {
			router.push('/(modals)/webdavModal')
		} catch (error) {
			logError('导航到WebDAV设置页面失败:', error)
			// 如果导航失败，尝试使用延迟的方式导航
			setTimeout(() => {
				try {
					router.push('/(modals)/webdavModal')
				} catch (innerError) {
					logError('再次尝试导航到WebDAV设置失败:', innerError)
					Alert.alert('错误', '无法导航到WebDAV设置页面，请稍后再试')
				}
			}, 300)
		}
	}, [router])

	// 渲染分隔线
	const renderSeparator = useCallback(() => <View style={styles.separator} />, [])

	// 渲染空列表提示
	const renderEmptyComponent = useCallback(() => {
		if (isLoading) return null

		return (
			<View style={styles.emptyContainer}>
				<Ionicons name="folder-open-outline" size={60} color={colors.subtext} />
				<Text style={styles.emptyText}>此文件夹为空</Text>
			</View>
		)
	}, [isLoading])

	// 如果没有配置WebDAV服务器
	if (!currentServer) {
		return (
			<ErrorCatcher>
				<View style={styles.noServerContainer}>
					<Ionicons name="cloud-outline" size={80} color={colors.subtext} />
					<Text style={styles.noServerText}>未配置WebDAV服务器</Text>
					<Text style={{ color: colors.subtext, marginBottom: 20, textAlign: 'center' }}>
						添加WebDAV服务器以浏览和播放在线音乐文件
					</Text>
					<TouchableOpacity style={styles.connectButton} onPress={navigateToSettings}>
						<Text style={styles.connectButtonText}>添加服务器</Text>
					</TouchableOpacity>
				</View>
			</ErrorCatcher>
		)
	}

	// 如果加载出错
	if (loadError) {
		return (
			<ErrorCatcher>
				<View style={styles.errorContainer}>
					<Ionicons name="cloud-offline" size={60} color={colors.subtext} />
					<Text style={styles.errorText}>加载失败</Text>
					<Text style={styles.errorSubtext}>{loadError}</Text>
					<TouchableOpacity style={styles.retryButton} onPress={handleRefresh}>
						<Text style={styles.retryButtonText}>重试</Text>
					</TouchableOpacity>
				</View>
			</ErrorCatcher>
		)
	}

	return (
		<ErrorCatcher>
			<View style={styles.container}>
				{/* 服务器信息和导航栏 */}
				<View style={styles.serverInfoContainer}>
					<View style={styles.serverInfo}>
						<Text style={styles.serverName}>{currentServer.name}</Text>
						<Text style={styles.currentPath}>{formatPath(currentPath)}</Text>
					</View>
					<View style={styles.navButtons}>
						{pathHistory.length > 0 && (
							<TouchableOpacity style={styles.navButton} onPress={handleGoBack}>
								<Ionicons name="arrow-back" size={20} color="#fff" />
							</TouchableOpacity>
						)}
						<TouchableOpacity style={styles.navButton} onPress={handleRefresh}>
							<Ionicons name="refresh" size={20} color="#fff" />
						</TouchableOpacity>
					</View>
				</View>

				{/* 文件列表 */}
				{isLoading ? (
					<View style={styles.loadingContainer}>
						<ActivityIndicator size="large" color={colors.primary} />
						<Text style={styles.loadingText}>加载中...</Text>
					</View>
				) : (
					<FlatList
						data={files}
						keyExtractor={(item) => item.path}
						renderItem={({ item }) => (
							<FileItem
								file={item}
								onPress={safeHandleFilePress}
								onLongPress={safeHandleFileLongPress}
							/>
						)}
						ItemSeparatorComponent={renderSeparator}
						ListEmptyComponent={renderEmptyComponent}
						style={styles.fileList}
						initialNumToRender={10} // 性能优化
						maxToRenderPerBatch={5} // 性能优化
						windowSize={5} // 性能优化
					/>
				)}

				{/* 文件操作菜单 */}
				{showActions && selectedFile && (
					<View style={styles.actionsOverlay}>
						<View style={styles.actionsContainer}>
							<Text style={styles.actionsTitle}>{selectedFile.basename}</Text>
							<TouchableOpacity style={styles.actionButton} onPress={playMusic}>
								<Ionicons name="play" size={20} color="#fff" />
								<Text style={styles.actionText}>立即播放</Text>
							</TouchableOpacity>
							<TouchableOpacity style={styles.actionButton} onPress={addToPlaylistHandler}>
								<Ionicons name="add" size={20} color="#fff" />
								<Text style={styles.actionText}>添加到播放列表</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.actionButton, styles.cancelButton]}
								onPress={handleCloseActions}
							>
								<Ionicons name="close" size={20} color="#fff" />
								<Text style={styles.actionText}>取消</Text>
							</TouchableOpacity>
						</View>
					</View>
				)}
			</View>
		</ErrorCatcher>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	noServerContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	noServerText: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginTop: 20,
		marginBottom: 20,
	},
	connectButton: {
		backgroundColor: colors.accent,
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 30,
	},
	connectButtonText: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 16,
	},
	serverInfoContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderBottomWidth: 1,
		borderBottomColor: colors.border,
	},
	serverInfo: {
		flex: 1,
	},
	serverName: {
		fontSize: 16,
		fontWeight: 'bold',
		color: colors.text,
	},
	currentPath: {
		fontSize: 14,
		color: colors.subtext,
		marginTop: 2,
	},
	navButtons: {
		flexDirection: 'row',
	},
	navButton: {
		backgroundColor: colors.accent,
		width: 36,
		height: 36,
		borderRadius: 18,
		justifyContent: 'center',
		alignItems: 'center',
		marginLeft: 10,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		marginTop: 10,
		color: colors.text,
		fontSize: 16,
	},
	fileList: {
		padding: 15,
	},
	fileItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
	},
	fileIcon: {
		width: 40,
		height: 40,
		justifyContent: 'center',
		alignItems: 'center',
		marginRight: 10,
	},
	fileInfo: {
		flex: 1,
	},
	fileName: {
		fontSize: 16,
		color: colors.text,
		marginBottom: 2,
	},
	fileDetails: {
		fontSize: 12,
		color: colors.subtext,
	},
	separator: {
		height: 1,
		backgroundColor: colors.border,
	},
	emptyContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		paddingVertical: 50,
	},
	emptyText: {
		marginTop: 10,
		color: colors.subtext,
		fontSize: 16,
	},
	actionsOverlay: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		left: 0,
		right: 0,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 10,
	},
	actionsContainer: {
		width: '80%',
		backgroundColor: colors.background,
		borderRadius: 10,
		padding: 20,
	},
	actionsTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginBottom: 15,
		textAlign: 'center',
	},
	actionButton: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: colors.accent,
		padding: 15,
		borderRadius: 5,
		marginBottom: 10,
	},
	cancelButton: {
		backgroundColor: '#999',
	},
	actionText: {
		color: '#fff',
		fontWeight: 'bold',
		marginLeft: 10,
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
		marginTop: 20,
		marginBottom: 20,
	},
	retryButton: {
		backgroundColor: colors.accent,
		paddingHorizontal: 20,
		paddingVertical: 12,
		borderRadius: 30,
	},
	retryButtonText: {
		color: '#fff',
		fontWeight: 'bold',
		fontSize: 16,
	},
	errorSubtext: {
		fontSize: 14,
		color: colors.subtext,
		marginTop: 10,
	},
})

export default WebDAVScreen
