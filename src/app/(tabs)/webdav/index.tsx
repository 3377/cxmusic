import { colors } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import {
	WebDAVFile,
	getAllMusicFiles,
	getDirectoryContents,
	useCurrentWebDAVServer,
	webdavFileToMusicItem,
	webdavFilesToMusicItems,
} from '@/helpers/webdavService'
import { showToast } from '@/utils/utils'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'

// 错误捕获组件
class ErrorCatcher extends React.Component {
	state = { hasError: false }

	static getDerivedStateFromError() {
		return { hasError: true }
	}

	componentDidCatch(error, info) {
		logError('WebDAV页面渲染错误:', error, info)
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={styles.errorContainer}>
					<Ionicons name="warning" size={50} color="#FF6B6B" />
					<Text style={styles.errorText}>加载WebDAV内容时出错</Text>
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
		<ActivityIndicator size="large" color={colors.accent} />
		<Text style={styles.loadingText}>加载中...</Text>
	</View>
)

// 懒加载组件
const LazyFileItem = lazy(() => Promise.resolve().then(() => ({ default: FileItem })))

const LazyFileActions = lazy(() => Promise.resolve().then(() => ({ default: FileActions })))

// 文件项组件
const FileItem = ({ file, onPress, onLongPress }) => {
	if (!file) {
		return null
	}

	try {
		const isDirectory = file.type === 'directory'
		const isMusic =
			file.type === 'file' &&
			(file.mime?.startsWith('audio/') ||
				/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename || ''))

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
						color={isDirectory ? '#FFD700' : isMusic ? '#1DB954' : '#999'}
					/>
				</View>
				<View style={styles.fileInfo}>
					<Text style={styles.fileName} numberOfLines={1}>
						{file.basename || '未知文件名'}
					</Text>
					<Text style={styles.fileDetails}>
						{isDirectory
							? '文件夹'
							: `${((file.size || 0) / (1024 * 1024)).toFixed(2)} MB • ${new Date(file.lastmod || Date.now()).toLocaleDateString()}`}
					</Text>
				</View>
				{isDirectory && <Ionicons name="chevron-forward" size={20} color="#999" />}
			</TouchableOpacity>
		)
	} catch (error) {
		logError('渲染文件项失败:', error, file)
		return (
			<View style={styles.fileItem}>
				<View style={styles.fileIcon}>
					<Ionicons name="alert-circle" size={24} color="#FF6B6B" />
				</View>
				<View style={styles.fileInfo}>
					<Text style={styles.fileName}>无法显示此项</Text>
				</View>
			</View>
		)
	}
}

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
	const [isLoading, setIsLoading] = useState(false)
	const [loadError, setLoadError] = useState(null)
	const [currentPath, setCurrentPath] = useState('/')
	const [pathHistory, setPathHistory] = useState<string[]>([])
	const [files, setFiles] = useState<WebDAVFile[]>([])
	const [selectedFile, setSelectedFile] = useState<WebDAVFile | null>(null)
	const [showActions, setShowActions] = useState(false)
	const [isComponentMounted, setIsComponentMounted] = useState(false)

	// 使用useEffect标记组件已挂载，防止内存泄漏
	useEffect(() => {
		setIsComponentMounted(true)
		return () => {
			setIsComponentMounted(false)
		}
	}, [])

	// 加载当前目录内容
	const loadDirectoryContents = useCallback(
		async (path: string = '/') => {
			if (!currentServer || !isComponentMounted) {
				return
			}

			try {
				setLoadError(null)
				setIsLoading(true)
				const contents = await getDirectoryContents(path).catch((err) => {
					throw err
				})

				// 确保组件仍然挂载
				if (isComponentMounted) {
					setFiles(contents || [])
					setCurrentPath(path)
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
			loadDirectoryContents('/')
			setPathHistory([])
		} else if (isComponentMounted) {
			setFiles([])
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
			}
		},
		[currentPath, isComponentMounted, loadDirectoryContents],
	)

	// 包装安全的文件处理函数
	const safeHandleFilePress = createSafeHandler(handleFilePress)

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
	const safeHandleFileLongPress = createSafeHandler(handleFileLongPress)

	// 播放音乐文件
	const handlePlayFile = useCallback(
		async (file: WebDAVFile) => {
			if (!file || !isComponentMounted) return

			try {
				if (!file || !file.path) {
					showToast('无效文件', 'error')
					return
				}

				setIsLoading(true)
				const musicItem = webdavFileToMusicItem(file)

				if (!musicItem.url) {
					showToast('文件URL无效', 'error')
					return
				}

				await myTrackPlayer.play(musicItem)
				showToast(`正在播放: ${file.basename || '未知文件'}`, 'success')
			} catch (error) {
				logError('播放文件失败:', error)
				Alert.alert('错误', `无法播放文件: ${error.message || '未知错误'}`)
			} finally {
				if (isComponentMounted) {
					setIsLoading(false)
				}
			}
		},
		[isComponentMounted],
	)

	// 添加到播放队列
	const handleAddToQueue = useCallback(
		async (file: WebDAVFile) => {
			if (!file || !isComponentMounted) return

			try {
				if (!file || !file.path) {
					showToast('无效文件', 'error')
					return
				}

				setIsLoading(true)
				const musicItem = webdavFileToMusicItem(file)

				if (!musicItem.url) {
					showToast('文件URL无效', 'error')
					return
				}

				await myTrackPlayer.add(musicItem)
				showToast(`已添加到队列: ${file.basename || '未知文件'}`, 'success')
			} catch (error) {
				logError('添加到队列失败:', error)
				Alert.alert('错误', `无法添加到队列: ${error.message || '未知错误'}`)
			} finally {
				if (isComponentMounted) {
					setIsLoading(false)
				}
			}
		},
		[isComponentMounted],
	)

	// 播放当前目录中的所有音乐
	const handlePlayAllMusic = useCallback(async () => {
		if (!currentServer || !isComponentMounted) {
			return
		}

		try {
			setIsLoading(true)

			// 获取当前目录下的所有音乐文件（不递归）
			const musicFiles = await getAllMusicFiles(currentPath, false).catch((err) => {
				throw err
			})

			if (!isComponentMounted) return

			if (!musicFiles || musicFiles.length === 0) {
				Alert.alert('提示', '当前目录没有音乐文件')
				return
			}

			// 转换为音乐项并播放
			const musicItems = webdavFilesToMusicItems(musicFiles)

			if (!musicItems || musicItems.length === 0) {
				Alert.alert('提示', '无法识别音乐文件')
				return
			}

			// 过滤掉无效的音乐项
			const validMusicItems = musicItems.filter((item) => item && item.url)

			if (validMusicItems.length === 0) {
				Alert.alert('提示', '无有效的音乐文件可播放')
				return
			}

			await myTrackPlayer.addAll(validMusicItems)
			await myTrackPlayer.play()

			showToast(`正在播放目录中的 ${validMusicItems.length} 首音乐`, 'success')
		} catch (error) {
			logError('播放目录音乐失败:', error)
			if (isComponentMounted) {
				Alert.alert('错误', `无法播放目录中的音乐: ${error.message || '未知错误'}`)
			}
		} finally {
			if (isComponentMounted) {
				setIsLoading(false)
			}
		}
	}, [currentPath, currentServer, isComponentMounted])

	// 返回上一级目录
	const handleGoBack = useCallback(() => {
		if (pathHistory.length > 0 && isComponentMounted) {
			try {
				const previousPath = pathHistory[pathHistory.length - 1]
				setPathHistory((prev) => prev.slice(0, -1))
				loadDirectoryContents(previousPath)
			} catch (error) {
				logError('返回上级目录失败:', error)
			}
		}
	}, [pathHistory, isComponentMounted, loadDirectoryContents])

	// 格式化当前路径显示
	const formatPath = useCallback((path: string) => {
		if (path === '/') {
			return '根目录'
		}

		// 获取路径的最后一部分
		const parts = path.split('/').filter(Boolean)
		return parts[parts.length - 1]
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

	return (
		<ErrorCatcher>
			<View style={styles.container}>
				{!currentServer ? (
					// 未连接服务器的提示
					<View style={styles.noServerContainer}>
						<Ionicons name="cloud-offline" size={60} color="#999" />
						<Text style={styles.noServerText}>未连接到WebDAV服务器</Text>
						<TouchableOpacity style={styles.connectButton} onPress={navigateToSettings}>
							<Text style={styles.connectButtonText}>添加/管理服务器</Text>
						</TouchableOpacity>
					</View>
				) : (
					// 已连接服务器的内容
					<>
						{/* 服务器信息和路径导航 */}
						<View style={styles.serverInfoContainer}>
							<View style={styles.serverInfo}>
								<Text style={styles.serverName}>{currentServer.name || '未知服务器'}</Text>
								<Text style={styles.currentPath} numberOfLines={1}>
									{formatPath(currentPath)}
								</Text>
							</View>

							<View style={styles.navButtons}>
								{pathHistory.length > 0 && (
									<TouchableOpacity style={styles.navButton} onPress={handleGoBack}>
										<Ionicons name="arrow-back" size={20} color="#fff" />
									</TouchableOpacity>
								)}
								<TouchableOpacity style={styles.navButton} onPress={handlePlayAllMusic}>
									<Ionicons name="play" size={20} color="#fff" />
								</TouchableOpacity>
							</View>
						</View>

						{/* 文件列表 */}
						{isLoading ? (
							<LoadingPlaceholder />
						) : loadError ? (
							<View style={styles.errorContainer}>
								<Ionicons name="alert-circle" size={50} color="#FF6B6B" />
								<Text style={styles.errorText}>加载失败</Text>
								<Text style={styles.errorSubtext}>{loadError}</Text>
								<TouchableOpacity
									style={styles.retryButton}
									onPress={() => loadDirectoryContents(currentPath)}
								>
									<Text style={styles.retryButtonText}>重试</Text>
								</TouchableOpacity>
							</View>
						) : (
							<Suspense fallback={<LoadingPlaceholder />}>
								<FlatList
									data={files}
									renderItem={({ item }) => (
										<LazyFileItem
											file={item}
											onPress={safeHandleFilePress}
											onLongPress={safeHandleFileLongPress}
										/>
									)}
									keyExtractor={(item) => item.path || Math.random().toString()}
									contentContainerStyle={styles.fileList}
									ItemSeparatorComponent={() => <View style={styles.separator} />}
									ListEmptyComponent={
										<View style={styles.emptyContainer}>
											<Ionicons name="folder-open" size={50} color="#999" />
											<Text style={styles.emptyText}>此目录为空</Text>
										</View>
									}
								/>
							</Suspense>
						)}

						{/* 文件操作菜单 */}
						<Suspense fallback={null}>
							<LazyFileActions
								file={selectedFile}
								onPlay={handlePlayFile}
								onAddToQueue={handleAddToQueue}
								onClose={handleCloseActions}
								visible={showActions}
							/>
						</Suspense>
					</>
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
