import { PlaylistsListModal } from '@/components/PlaylistsListModal'
import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { playListsStore } from '@/helpers/trackPlayerIndex'
import { getCurrentWebDAVServer, getDirectoryContents, WebDAVFile } from '@/helpers/webdavService'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import * as FileSystem from 'expo-file-system'
import { Stack, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	FlatList,
	Modal,
	SafeAreaView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import TrackPlayer from 'react-native-track-player'

// 格式化日期工具函数
const formatDate = (dateString: string) => {
	try {
		if (!dateString) return '未知日期'
		const date = new Date(dateString)
		return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
	} catch (error) {
		return '日期格式错误'
	}
}

// 文件项组件
const FileItem = ({ file, onPress, onLongPress }) => {
	const isDirectory = file.type === 'directory'
	const isAudioFile = file.type === 'file' && file.basename.match(/\.(mp3|m4a|wav|flac|aac)$/i)

	return (
		<TouchableOpacity
			onPress={() => onPress(file)}
			onLongPress={() => onLongPress(file)}
			style={{
				paddingVertical: 12,
				paddingHorizontal: 16,
				borderBottomWidth: 1,
				borderBottomColor: '#333',
			}}
		>
			<View style={{ flexDirection: 'row', alignItems: 'center' }}>
				<Feather
					name={isDirectory ? 'folder' : isAudioFile ? 'music' : 'file'}
					size={24}
					color={isDirectory ? colors.primary : isAudioFile ? colors.secondary : colors.text}
					style={{ marginRight: 12 }}
				/>
				<View style={{ flex: 1 }}>
					<Text style={{ color: colors.text, fontSize: 16 }}>{file.basename}</Text>
					<Text style={{ color: colors.textMuted, fontSize: 12 }}>
						{isDirectory ? '文件夹' : formatBytes(file.size || 0)} • {formatDate(file.lastmod)}
					</Text>
				</View>
			</View>
		</TouchableOpacity>
	)
}

// 加载中占位符组件
function LoadingPlaceholder() {
	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text style={{ marginTop: 16, color: colors.text }}>正在加载文件...</Text>
		</View>
	)
}

// 空内容组件
function EmptyContent({ onRefresh }) {
	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<Feather name="inbox" size={48} color={colors.textMuted} />
			<Text style={{ marginTop: 16, color: colors.text, fontSize: 16 }}>文件夹为空</Text>
			<TouchableOpacity
				onPress={onRefresh}
				style={{
					marginTop: 16,
					backgroundColor: colors.primary,
					padding: 12,
					borderRadius: 8,
				}}
			>
				<Text style={{ color: '#fff' }}>刷新</Text>
			</TouchableOpacity>
		</View>
	)
}

// 错误捕获组件
class ErrorCatcher extends React.Component {
	state = { hasError: false, error: null }

	static getDerivedStateFromError(error) {
		return { hasError: true, error }
	}

	componentDidCatch(error, errorInfo) {
		logError('WebDAV页面渲染错误:', error, errorInfo)
	}

	retry = () => {
		this.setState({ hasError: false, error: null })
		if (this.props.onRetry) {
			this.props.onRetry()
		}
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Feather name="alert-triangle" size={48} color="red" />
					<Text style={{ marginTop: 16, color: colors.text, textAlign: 'center', fontSize: 16 }}>
						WebDAV页面加载失败
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
						<Text style={{ color: '#fff' }}>重试</Text>
					</TouchableOpacity>
				</View>
			)
		}

		return this.props.children
	}
}

// 缓存WebDAV音乐文件 - 增加多种缓存方式
const cacheWebDAVFile = async (file: WebDAVFile) => {
	try {
		// 创建缓存目录
		const cacheDir = `${FileSystem.cacheDirectory}webdav_cache/`
		await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => {})

		// 生成缓存文件路径 (包含文件扩展名)
		const cacheFilePath = `${cacheDir}${file.basename}`

		// 检查是否已缓存
		const cacheInfo = await FileSystem.getInfoAsync(cacheFilePath)
		if (cacheInfo.exists) {
			logInfo('使用缓存的音乐文件:', cacheFilePath)
			// 确保加上file://前缀
			return { localPath: `file://${cacheFilePath}`, isLocal: true }
		}

		// 获取WebDAV文件URL
		const server = getCurrentWebDAVServer()
		if (!server?.url) throw new Error('WebDAV服务器未配置')

		// 构建标准WebDAV URL
		let serverUrl = server.url
		if (!serverUrl.endsWith('/')) {
			serverUrl = serverUrl + '/'
		}

		// 处理文件路径，确保它不以/开头
		let filePath = file.filename
		if (filePath.startsWith('/')) {
			filePath = filePath.substring(1)
		}

		// 构建完整URL
		const fileUrl = `${serverUrl}${filePath}`

		logInfo('WebDAV文件URL:', fileUrl)

		// 尝试使用方案1: 直接下载
		try {
			logInfo('尝试方案1 - 直接下载文件:', file.basename)
			const downloadResult = await FileSystem.downloadAsync(fileUrl, cacheFilePath, {
				headers: {
					Authorization: `Basic ${btoa(`${server.username}:${server.password}`)}`,
				},
			})

			// 检查下载结果
			logInfo('下载结果状态码:', downloadResult.status)

			// 验证文件是否真的存在
			const fileExists = await FileSystem.getInfoAsync(cacheFilePath)
			if (!fileExists.exists) throw new Error('文件下载完成但未找到文件')

			logInfo('方案1成功 - 音乐文件已缓存:', cacheFilePath, '文件大小:', fileExists.size)
			// 确保加上file://前缀
			return { localPath: `file://${cacheFilePath}`, isLocal: true }
		} catch (downloadError) {
			logError('方案1失败 - 直接下载WebDAV文件失败:', downloadError)

			// 尝试方案2: 使用webdav-client获取原始内容
			try {
				logInfo('尝试方案2 - 使用WebDAV客户端获取文件:', file.basename)
				const client = getWebDAVClient()
				if (!client) throw new Error('WebDAV客户端未初始化')

				// 获取文件内容
				const fileContent = await client.getFileContents(file.filename, { format: 'binary' })
				if (!fileContent) throw new Error('获取到的文件内容为空')

				logInfo(
					'获取到WebDAV文件内容，长度:',
					typeof fileContent === 'string' ? fileContent.length : '[二进制数据]',
				)

				// 将内容写入本地文件
				await FileSystem.writeAsStringAsync(cacheFilePath, fileContent, {
					encoding: FileSystem.EncodingType.Base64,
				})

				// 验证文件是否存在
				const fileExists = await FileSystem.getInfoAsync(cacheFilePath)
				if (!fileExists.exists) throw new Error('文件写入完成但未找到文件')

				logInfo('方案2成功 - 音乐文件已缓存:', cacheFilePath, '文件大小:', fileExists.size)
				// 确保加上file://前缀
				return { localPath: `file://${cacheFilePath}`, isLocal: true }
			} catch (clientError) {
				logError('方案2失败 - WebDAV客户端获取文件失败:', clientError)

				// 尝试方案3: 返回远程URL直接播放
				try {
					logInfo('尝试方案3 - 使用远程URL直接播放:', file.basename)

					// 构建带认证的URL
					let directUrl = fileUrl
					if (server.username && server.password) {
						try {
							const url = new URL(fileUrl)
							url.username = encodeURIComponent(server.username)
							url.password = encodeURIComponent(server.password)
							directUrl = url.toString()
						} catch (urlError) {
							// 手动构建
							const urlParts = fileUrl.split('://')
							if (urlParts.length === 2) {
								directUrl = `${urlParts[0]}://${encodeURIComponent(server.username)}:${encodeURIComponent(server.password)}@${urlParts[1]}`
							}
						}
					}

					logInfo('方案3成功 - 将使用远程URL直接播放:', directUrl)
					return { localPath: directUrl, isLocal: false }
				} catch (urlError) {
					logError('方案3失败 - 构建直接播放URL失败:', urlError)
					throw new Error('无法访问WebDAV文件，请检查网络连接和服务器配置')
				}
			}
		}
	} catch (error) {
		logError('缓存WebDAV文件失败:', error)
		throw error
	}
}

// 播放WebDAV音乐的函数 - 完全重写
const playWebDavTrack = async (file: WebDAVFile) => {
	try {
		if (!file) throw new Error('无效的音乐文件')

		logInfo('准备播放WebDAV音乐:', file.basename)

		// 显示加载提示
		Alert.alert('正在准备播放', '正在加载音乐文件，请稍候...')

		// 缓存文件
		const { localPath, isLocal } = await cacheWebDAVFile(file)
		logInfo('音乐文件路径:', localPath, '是否本地文件:', isLocal)

		// 提取文件名称(不含扩展名)
		const fileTitle = file.basename.replace(/\.[^/.]+$/, '')

		// 尝试从文件名解析艺术家和标题
		let artist = 'WebDAV音乐'
		let title = fileTitle

		// 尝试解析 "艺术家 - 标题" 格式
		const parts = fileTitle.split(' - ')
		if (parts.length >= 2) {
			artist = parts[0].trim()
			title = parts.slice(1).join(' - ').trim()
		}

		// 创建音乐项
		const musicItem = {
			id: `webdav-${Date.now()}`,
			url: localPath,
			title: title,
			artist: artist,
			artwork: '',
			// 添加额外信息，方便调试
			platform: 'webdav',
			duration: 0,
			isLocalFile: isLocal,
			originalFilename: file.filename,
		}

		logInfo('准备播放音乐项:', JSON.stringify(musicItem))

		// 播放音乐 - 尝试方案1: 使用TrackPlayer直接播放
		try {
			logInfo('尝试方案1 - 使用TrackPlayer直接播放')

			// 确保播放器已设置
			const setupPlayer = require('@/hooks/useSetupTrackPlayer').setupPlayer
			await setupPlayer().catch((e) => logInfo('播放器已初始化，忽略错误:', e))

			// 重置播放器
			await TrackPlayer.reset()

			// 添加到播放队列
			await TrackPlayer.add({
				...musicItem,
				// 确保添加必要属性
				type: file.basename.endsWith('.flac') ? 'default' : 'default',
			})

			// 开始播放
			await TrackPlayer.play()

			logInfo('方案1成功 - 正在播放WebDAV音乐:', file.basename)
		} catch (playerError) {
			logError('方案1失败 - TrackPlayer操作失败:', playerError)

			// 尝试方案2 - 使用原始播放方式
			try {
				logInfo('尝试方案2 - 使用myTrackPlayer播放')

				// 导入并使用myTrackPlayer的play函数
				const myTrackPlayer = require('@/helpers/trackPlayerIndex')
				await myTrackPlayer.play(musicItem, true)

				logInfo('方案2成功 - 使用myTrackPlayer播放成功')
			} catch (altPlayerError) {
				logError('方案2失败 - 原生播放方式失败:', altPlayerError)

				// 尝试方案3 - 使用最原始的播放方式
				try {
					logInfo('尝试方案3 - 使用最原始的播放方式')

					const setTrackSource = require('@/helpers/trackPlayerIndex').setTrackSource
					await TrackPlayer.reset()
					await setTrackSource(musicItem, true)

					logInfo('方案3成功 - 使用setTrackSource播放成功')
				} catch (finalError) {
					logError('方案3失败 - 所有播放方式都失败:', finalError)
					throw new Error('尝试了所有播放方式但都失败')
				}
			}
		}
	} catch (error) {
		logError('播放WebDAV音乐失败:', error)
		Alert.alert('错误', `无法播放此音乐文件: ${error.message || '未知错误'}`)
	}
}

// 将WebDAV文件添加到播放列表的函数 - 重写
const addToPlaylist = async (file: WebDAVFile, playlist: IMusic.PlayList) => {
	try {
		if (!file) throw new Error('无效的音乐文件')

		logInfo('准备添加到播放列表:', file.basename)

		// 显示加载提示
		Alert.alert('正在准备', '正在处理音乐文件，请稍候...')

		// 缓存文件
		const { localPath, isLocal } = await cacheWebDAVFile(file)
		logInfo('音乐文件路径:', localPath, '是否本地文件:', isLocal)

		// 提取文件名称(不含扩展名)
		const fileTitle = file.basename.replace(/\.[^/.]+$/, '')

		// 尝试从文件名解析艺术家和标题
		let artist = 'WebDAV音乐'
		let title = fileTitle

		// 尝试解析 "艺术家 - 标题" 格式
		const parts = fileTitle.split(' - ')
		if (parts.length >= 2) {
			artist = parts[0].trim()
			title = parts.slice(1).join(' - ').trim()
		}

		// 创建音乐项
		const musicItem: IMusic.IMusicItem = {
			id: `webdav-${Date.now()}`,
			url: localPath,
			title: title,
			artist: artist,
			artwork: '',
			platform: 'webdav',
			duration: 0,
			isLocalFile: isLocal,
			originalFilename: file.filename,
		}

		// 添加到播放列表
		const nowPlayLists = playListsStore.getValue() || []
		const updatedPlayLists = nowPlayLists.map((existingPlaylist) => {
			if (existingPlaylist.id === playlist.id) {
				return {
					...existingPlaylist,
					songs: [...existingPlaylist.songs, musicItem],
				}
			}
			return existingPlaylist
		})

		// 保存更新的播放列表
		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)

		logInfo('已添加到播放列表:', file.basename, '播放列表名称:', playlist.name)
		Alert.alert('提示', `已将 "${title}" 添加到播放列表 "${playlist.name}"`)
	} catch (error) {
		logError('添加到播放列表失败:', error)
		Alert.alert('错误', `无法添加到播放列表: ${error.message || '未知错误'}`)
	}
}

// 选择播放列表对话框组件
const PlaylistSelector = ({ visible, onClose, onSelect, file }) => {
	return (
		<Modal visible={visible} animationType="slide" transparent={true}>
			<View style={styles.modalContainer}>
				<View style={styles.modalContent}>
					<View style={styles.modalHeader}>
						<Text style={styles.modalTitle}>选择播放列表</Text>
						<TouchableOpacity onPress={onClose}>
							<Feather name="x" size={24} color={colors.text} />
						</TouchableOpacity>
					</View>
					<PlaylistsListModal
						onPlaylistPress={(playlist) => {
							onSelect(playlist)
							onClose()
						}}
					/>
				</View>
			</View>
		</Modal>
	)
}

// 安全的WebDAV浏览器组件
export default function WebDAVBrowser() {
	const router = useRouter()
	const [files, setFiles] = useState<WebDAVFile[]>([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [currentPath, setCurrentPath] = useState('/')
	const [pathHistory, setPathHistory] = useState<string[]>([])
	const [currentServer, setCurrentServer] = useState<any>(null)
	const abortControllerRef = useRef<AbortController | null>(null)
	const retryCountRef = useRef(0)
	const initTimeoutRef = useRef<NodeJS.Timeout | null>(null)
	const [playlistSelectorVisible, setPlaylistSelectorVisible] = useState(false)
	const [selectedFile, setSelectedFile] = useState<WebDAVFile | null>(null)

	// 清理函数 - 取消所有进行中的请求和超时
	const cleanup = () => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort()
			abortControllerRef.current = null
		}

		if (initTimeoutRef.current) {
			clearTimeout(initTimeoutRef.current)
			initTimeoutRef.current = null
		}
	}

	// 监听返回键
	useEffect(() => {
		const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
			if (pathHistory.length > 0) {
				handleBack()
				return true
			} else {
				cleanup() // 确保在退出页面时取消所有请求
				router.back()
				return true
			}
		})

		return () => {
			backHandler.remove()
			cleanup() // 组件卸载时清理资源
		}
	}, [pathHistory])

	// 初始化 - 获取当前服务器
	useEffect(() => {
		const initServer = async () => {
			setIsLoading(true)
			setError(null)

			// 设置初始化超时，防止无限等待
			initTimeoutRef.current = setTimeout(() => {
				setError('初始化WebDAV超时，请检查网络连接')
				setIsLoading(false)
			}, 15000)

			try {
				const server = getCurrentWebDAVServer()
				setCurrentServer(server)

				if (!server) {
					clearTimeout(initTimeoutRef.current)
					setError('请先配置WebDAV服务器')
					setIsLoading(false)
					return
				}

				logInfo('WebDAV浏览器初始化成功，正在加载根目录')
				// 获取根目录文件
				await loadFiles('/')
				clearTimeout(initTimeoutRef.current)
			} catch (err) {
				clearTimeout(initTimeoutRef.current)
				logError('WebDAV浏览器初始化失败:', err)
				setError('无法初始化WebDAV: ' + (err?.message || '未知错误'))
				setIsLoading(false)
			}
		}

		initServer()

		return () => {
			if (initTimeoutRef.current) {
				clearTimeout(initTimeoutRef.current)
			}
		}
	}, [])

	// 加载指定路径的文件
	const loadFiles = async (path: string) => {
		// 取消任何进行中的请求
		cleanup()

		if (!currentServer && path !== '/') {
			setError('未连接到WebDAV服务器')
			setIsLoading(false)
			return
		}

		setIsLoading(true)
		setError(null)

		try {
			// 创建新的AbortController
			abortControllerRef.current = new AbortController()

			// 设置15秒超时
			const timeoutId = setTimeout(() => {
				if (abortControllerRef.current) {
					abortControllerRef.current.abort()
					setError('获取文件列表超时，请检查网络连接')
					setIsLoading(false)
				}
			}, 15000)

			// 获取目录内容
			const filesData = await getDirectoryContents(path)
			clearTimeout(timeoutId)

			// 如果在等待期间发生取消，不更新状态
			if (abortControllerRef.current?.signal.aborted) {
				return
			}

			if (filesData && Array.isArray(filesData)) {
				// 排序: 目录优先，然后按名称
				const sortedFiles = [...filesData].sort((a, b) => {
					if (a.type === 'directory' && b.type !== 'directory') return -1
					if (a.type !== 'directory' && b.type === 'directory') return 1
					return a.basename.localeCompare(b.basename)
				})

				setFiles(sortedFiles)
				setIsLoading(false)
				// 成功加载后重置重试计数
				retryCountRef.current = 0
			} else {
				setFiles([])
				setIsLoading(false)
			}
		} catch (err) {
			// 如果在等待期间发生取消，不更新状态
			if (abortControllerRef.current?.signal.aborted) {
				return
			}

			logError('获取WebDAV文件列表失败:', err)
			setError('无法获取文件列表: ' + (err?.message || '网络错误'))
			setIsLoading(false)

			// 如果是致命错误，考虑返回选择器
			if (retryCountRef.current >= 3) {
				Alert.alert('WebDAV连接失败', '多次尝试连接WebDAV服务器失败，是否返回选择页面？', [
					{ text: '再试一次', onPress: () => handleRefresh() },
					{ text: '返回', onPress: () => router.back() },
				])
			} else {
				retryCountRef.current++
			}
		}
	}

	// 处理文件点击
	const handleFilePress = async (file) => {
		if (file.type === 'directory') {
			// 保存当前路径到历史
			setPathHistory([...pathHistory, currentPath])
			// 设置新路径
			setCurrentPath(file.path)
			// 加载新目录
			loadFiles(file.path)
		} else if (file.type === 'file' && file.basename.match(/\.(mp3|m4a|wav|flac|aac)$/i)) {
			Alert.alert('选择操作', '请选择要执行的操作', [
				{
					text: '播放',
					onPress: () => playWebDavTrack(file),
				},
				{
					text: '添加到播放列表',
					onPress: () => {
						setSelectedFile(file)
						setPlaylistSelectorVisible(true)
					},
				},
				{
					text: '取消',
					style: 'cancel',
				},
			])
		}
	}

	// 处理文件长按
	const handleFileLongPress = (file) => {
		if (file.type === 'file' && file.basename.match(/\.(mp3|m4a|wav|flac|aac)$/i)) {
			setSelectedFile(file)
			setPlaylistSelectorVisible(true)
		}
	}

	// 返回上一级目录
	const handleBack = () => {
		if (pathHistory.length > 0) {
			const prevPath = pathHistory[pathHistory.length - 1]
			setCurrentPath(prevPath)
			setPathHistory(pathHistory.slice(0, -1))
			loadFiles(prevPath)
		}
	}

	// 刷新当前目录
	const handleRefresh = () => {
		retryCountRef.current = 0
		loadFiles(currentPath)
	}

	// 重置所有状态并重新加载
	const handleReset = () => {
		cleanup()
		setFiles([])
		setCurrentPath('/')
		setPathHistory([])
		setError(null)
		retryCountRef.current = 0

		// 重新初始化
		setIsLoading(true)
		try {
			const server = getCurrentWebDAVServer()
			setCurrentServer(server)

			if (server) {
				loadFiles('/')
			} else {
				setError('请先配置WebDAV服务器')
				setIsLoading(false)
			}
		} catch (err) {
			setError('重置失败: ' + (err?.message || '未知错误'))
			setIsLoading(false)
		}
	}

	// 渲染内容
	const renderContent = () => {
		if (isLoading) {
			return <LoadingPlaceholder />
		}

		if (error) {
			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Feather name="alert-circle" size={48} color="red" />
					<Text style={{ marginTop: 16, color: colors.text, textAlign: 'center', fontSize: 16 }}>
						加载失败
					</Text>
					<Text style={{ marginTop: 8, color: colors.textMuted, textAlign: 'center' }}>
						{error}
					</Text>
					<TouchableOpacity
						onPress={() => loadFiles(currentPath)}
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

		if (files.length === 0) {
			return <EmptyContent onRefresh={() => loadFiles(currentPath)} />
		}

		return (
			<FlatList
				data={files}
				keyExtractor={(item) => item.filename}
				renderItem={({ item }) => (
					<FileItem file={item} onPress={handleFilePress} onLongPress={handleFileLongPress} />
				)}
				contentContainerStyle={{ paddingBottom: 20 }}
			/>
		)
	}

	return (
		<>
			<Stack.Screen
				options={{
					title: '文件浏览',
					headerStyle: {
						backgroundColor: colors.background,
					},
					headerTitleStyle: {
						color: colors.text,
					},
					headerTintColor: colors.primary,
					headerLeft: () => (
						<TouchableOpacity
							onPress={() => {
								cleanup()
								router.back()
							}}
							style={{ paddingLeft: 8 }}
						>
							<Feather name="arrow-left" size={24} color={colors.primary} />
						</TouchableOpacity>
					),
					headerRight: () => (
						<View style={{ flexDirection: 'row' }}>
							<TouchableOpacity onPress={handleReset} style={{ paddingRight: 12 }}>
								<Feather name="home" size={20} color={colors.primary} />
							</TouchableOpacity>
							<TouchableOpacity onPress={handleRefresh} style={{ paddingRight: 16 }}>
								<Feather name="refresh-cw" size={20} color={colors.primary} />
							</TouchableOpacity>
						</View>
					),
				}}
			/>

			<SafeAreaView style={{ flex: 1, backgroundColor: colors.background }}>
				<ErrorCatcher onRetry={() => loadFiles(currentPath)}>
					<View style={styles.container}>
						{/* 当前路径显示 */}
						<View style={styles.pathBar}>
							<Text style={styles.pathText} numberOfLines={1} ellipsizeMode="middle">
								{currentPath === '/' ? '根目录' : currentPath}
							</Text>

							{pathHistory.length > 0 && (
								<TouchableOpacity onPress={handleBack} style={styles.backButton}>
									<Feather name="chevron-up" size={20} color={colors.text} />
								</TouchableOpacity>
							)}
						</View>

						{renderContent()}

						<PlaylistSelector
							visible={playlistSelectorVisible}
							onClose={() => setPlaylistSelectorVisible(false)}
							onSelect={(playlist) => {
								if (selectedFile) {
									addToPlaylist(selectedFile, playlist)
								}
							}}
							file={selectedFile}
						/>
					</View>
				</ErrorCatcher>
			</SafeAreaView>
		</>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	pathBar: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 12,
		backgroundColor: colors.card || '#1e1e1e',
		borderBottomWidth: 1,
		borderBottomColor: colors.border || '#333',
	},
	pathText: {
		flex: 1,
		color: colors.text,
		fontSize: 14,
	},
	backButton: {
		marginLeft: 8,
		padding: 4,
	},
	centerContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		padding: 20,
	},
	errorText: {
		marginTop: 16,
		color: colors.text,
		fontSize: 16,
		textAlign: 'center',
	},
	loadingText: {
		marginTop: 16,
		color: colors.text,
	},
	emptyText: {
		marginTop: 16,
		color: colors.text,
		fontSize: 16,
	},
	button: {
		marginTop: 16,
		backgroundColor: colors.primary,
		paddingVertical: 8,
		paddingHorizontal: 16,
		borderRadius: 8,
	},
	buttonText: {
		color: '#fff',
	},
	listContent: {
		paddingBottom: 20,
	},
	fileItem: {
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		borderBottomColor: colors.border || '#333',
	},
	fileRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	fileIcon: {
		marginRight: 12,
	},
	fileInfo: {
		flex: 1,
	},
	fileName: {
		color: colors.text,
		fontSize: 16,
	},
	fileDetails: {
		color: colors.textMuted || '#888',
		fontSize: 12,
		marginTop: 2,
	},
	modalContainer: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
		justifyContent: 'flex-end',
	},
	modalContent: {
		backgroundColor: colors.background,
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		paddingTop: 20,
		paddingHorizontal: 16,
		maxHeight: '80%',
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 20,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
	},
})
