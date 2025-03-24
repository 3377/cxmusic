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
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'

// 文件项组件
const FileItem = ({ file, onPress, onLongPress }) => {
	const isDirectory = file.type === 'directory'
	const isMusic =
		file.type === 'file' &&
		(file.mime?.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename))

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
					{file.basename}
				</Text>
				<Text style={styles.fileDetails}>
					{isDirectory
						? '文件夹'
						: `${(file.size / (1024 * 1024)).toFixed(2)} MB • ${new Date(file.lastmod).toLocaleDateString()}`}
				</Text>
			</View>
			{isDirectory && <Ionicons name="chevron-forward" size={20} color="#999" />}
		</TouchableOpacity>
	)
}

// 文件操作菜单
const FileActions = ({ file, onPlay, onAddToQueue, onClose, visible }) => {
	if (!visible) return null

	const isMusic =
		file.type === 'file' &&
		(file.mime?.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename))

	return (
		<View style={styles.actionsOverlay}>
			<View style={styles.actionsContainer}>
				<Text style={styles.actionsTitle}>{file.basename}</Text>

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
}

// WebDAV主页面
const WebDAVScreen = () => {
	const router = useRouter()
	const currentServer = useCurrentWebDAVServer()
	const [isLoading, setIsLoading] = useState(false)
	const [currentPath, setCurrentPath] = useState('/')
	const [pathHistory, setPathHistory] = useState<string[]>([])
	const [files, setFiles] = useState<WebDAVFile[]>([])
	const [selectedFile, setSelectedFile] = useState<WebDAVFile | null>(null)
	const [showActions, setShowActions] = useState(false)

	// 加载当前目录内容
	const loadDirectoryContents = async (path: string = '/') => {
		if (!currentServer) {
			return
		}

		try {
			setIsLoading(true)
			const contents = await getDirectoryContents(path)
			setFiles(contents)
			setCurrentPath(path)
		} catch (error) {
			logError(`加载目录内容失败 (${path}):`, error)
			Alert.alert('错误', '无法加载目录内容，请检查连接')
		} finally {
			setIsLoading(false)
		}
	}

	// 初始化和服务器变更时加载根目录
	useEffect(() => {
		if (currentServer) {
			loadDirectoryContents('/')
			setPathHistory([])
		} else {
			setFiles([])
		}
	}, [currentServer])

	// 处理文件或目录点击
	const handleFilePress = (file: WebDAVFile) => {
		if (file.type === 'directory') {
			// 导航到子目录
			setPathHistory([...pathHistory, currentPath])
			loadDirectoryContents(file.path)
		} else if (file.type === 'file') {
			// 显示文件操作菜单（仅限音乐文件）
			const isMusic =
				file.mime?.startsWith('audio/') || /\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename)

			if (isMusic) {
				setSelectedFile(file)
				setShowActions(true)
			}
		}
	}

	// 处理文件长按
	const handleFileLongPress = (file: WebDAVFile) => {
		setSelectedFile(file)
		setShowActions(true)
	}

	// 播放音乐文件
	const handlePlayFile = async (file: WebDAVFile) => {
		try {
			const musicItem = webdavFileToMusicItem(file)
			await myTrackPlayer.play(musicItem)
			showToast(`正在播放: ${file.basename}`, 'success')
		} catch (error) {
			logError('播放文件失败:', error)
			Alert.alert('错误', '无法播放文件')
		}
	}

	// 添加到播放队列
	const handleAddToQueue = async (file: WebDAVFile) => {
		try {
			const musicItem = webdavFileToMusicItem(file)
			await myTrackPlayer.add(musicItem)
			showToast(`已添加到队列: ${file.basename}`, 'success')
		} catch (error) {
			logError('添加到队列失败:', error)
			Alert.alert('错误', '无法添加到队列')
		}
	}

	// 播放当前目录中的所有音乐
	const handlePlayAllMusic = async () => {
		if (!currentServer) {
			return
		}

		try {
			setIsLoading(true)

			// 获取当前目录下的所有音乐文件（不递归）
			const musicFiles = await getAllMusicFiles(currentPath, false)

			if (musicFiles.length === 0) {
				Alert.alert('提示', '当前目录没有音乐文件')
				return
			}

			// 转换为音乐项并播放
			const musicItems = webdavFilesToMusicItems(musicFiles)
			await myTrackPlayer.addAll(musicItems)
			await myTrackPlayer.play()

			showToast(`正在播放目录中的 ${musicFiles.length} 首音乐`, 'success')
		} catch (error) {
			logError('播放目录音乐失败:', error)
			Alert.alert('错误', '无法播放目录中的音乐')
		} finally {
			setIsLoading(false)
		}
	}

	// 返回上一级目录
	const handleGoBack = () => {
		if (pathHistory.length > 0) {
			const previousPath = pathHistory[pathHistory.length - 1]
			setPathHistory(pathHistory.slice(0, -1))
			loadDirectoryContents(previousPath)
		}
	}

	// 格式化当前路径显示
	const formatPath = (path: string) => {
		if (path === '/') {
			return '根目录'
		}

		// 获取路径的最后一部分
		const parts = path.split('/').filter(Boolean)
		return parts[parts.length - 1]
	}

	return (
		<View style={styles.container}>
			{!currentServer ? (
				// 未连接服务器的提示
				<View style={styles.noServerContainer}>
					<Ionicons name="cloud-offline" size={60} color="#999" />
					<Text style={styles.noServerText}>未连接到WebDAV服务器</Text>
					<TouchableOpacity
						style={styles.connectButton}
						onPress={() => router.push('/(modals)/webdavModal')}
					>
						<Text style={styles.connectButtonText}>添加/管理服务器</Text>
					</TouchableOpacity>
				</View>
			) : (
				// 已连接服务器的内容
				<>
					{/* 服务器信息和路径导航 */}
					<View style={styles.serverInfoContainer}>
						<View style={styles.serverInfo}>
							<Text style={styles.serverName}>{currentServer.name}</Text>
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
						<View style={styles.loadingContainer}>
							<ActivityIndicator size="large" color={colors.accent} />
							<Text style={styles.loadingText}>加载中...</Text>
						</View>
					) : (
						<FlatList
							data={files}
							renderItem={({ item }) => (
								<FileItem file={item} onPress={handleFilePress} onLongPress={handleFileLongPress} />
							)}
							keyExtractor={(item) => item.path}
							contentContainerStyle={styles.fileList}
							ItemSeparatorComponent={() => <View style={styles.separator} />}
							ListEmptyComponent={
								<View style={styles.emptyContainer}>
									<Ionicons name="folder-open" size={50} color="#999" />
									<Text style={styles.emptyText}>此目录为空</Text>
								</View>
							}
						/>
					)}

					{/* 文件操作菜单 */}
					<FileActions
						file={selectedFile}
						onPlay={handlePlayFile}
						onAddToQueue={handleAddToQueue}
						onClose={() => {
							setShowActions(false)
							setSelectedFile(null)
						}}
						visible={showActions}
					/>
				</>
			)}
		</View>
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
})

export default WebDAVScreen
