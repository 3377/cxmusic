import { PlaylistsListModal } from '@/components/PlaylistsListModal'
import { colors } from '@/constants/tokens'
import {
	hideLoading,
	setLoadingError,
	showLoading,
	updateLoadingProgress,
	useLoading,
} from '@/helpers/loading'
import { logError, logInfo } from '@/helpers/logger'
import { playListsStore } from '@/helpers/trackPlayerIndex'
import { getCurrentWebDAVServer, getDirectoryContents, WebDAVFile } from '@/helpers/webdavService'
import PersistStatus from '@/store/PersistStatus'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { Audio } from 'expo-av'
import * as FileSystem from 'expo-file-system'
import * as MediaLibrary from 'expo-media-library'
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
	const { isLoading, message, progress, error, isIndeterminate } = useLoading('webdav')

	if (error) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
				<Feather name="alert-circle" size={48} color="red" />
				<Text style={{ marginTop: 16, color: colors.text }}>{error}</Text>
				<TouchableOpacity
					onPress={() => setLoadingError(null, 'webdav')}
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

	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text style={{ marginTop: 16, color: colors.text }}>{message || '正在加载文件...'}</Text>
			{!isIndeterminate && progress !== undefined && (
				<Text style={{ marginTop: 8, color: colors.textMuted }}>{Math.round(progress * 100)}%</Text>
			)}
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

// 支持的音频格式
const SUPPORTED_AUDIO_FORMATS = ['mp3', 'm4a', 'wav', 'flac', 'aac']
const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

// 处理WebDAV URL
const processWebDAVUrl = (baseUrl: string, filePath: string): string => {
	try {
		// 确保baseUrl没有尾随斜杠
		let url = baseUrl.replace(/\/+$/, '')

		// 处理文件路径
		let processedPath = filePath
			.split('/')
			.map((segment) => encodeURIComponent(segment))
			.join('/')

		// 组合URL
		url = `${url}${processedPath}`

		// 确保是http或https
		if (!url.startsWith('http')) {
			url = `http://${url}`
		}

		return url
	} catch (error) {
		logError('处理WebDAV URL失败:', error)
		throw new Error('无效的WebDAV URL')
	}
}

// 验证音频文件
const validateAudioFile = (file: WebDAVFile): boolean => {
	try {
		// 检查文件大小
		if (file.size > MAX_FILE_SIZE) {
			throw new Error('文件大小超过限制(100MB)')
		}

		// 检查文件格式
		const extension = file.basename.split('.').pop()?.toLowerCase()
		if (!extension || !SUPPORTED_AUDIO_FORMATS.includes(extension)) {
			throw new Error('不支持的音频格式')
		}

		return true
	} catch (error) {
		logError('音频文件验证失败:', error)
		throw error
	}
}

// 清理缓存目录
const cleanupCache = async () => {
	try {
		const cacheDir = `${FileSystem.cacheDirectory}webdav_cache/`
		const cacheInfo = await FileSystem.getInfoAsync(cacheDir)

		if (cacheInfo.exists) {
			// 获取缓存目录内容
			const files = await FileSystem.readDirectoryAsync(cacheDir)

			// 获取每个文件的信息
			const fileInfos = await Promise.all(
				files.map(async (filename) => {
					const filePath = `${cacheDir}${filename}`
					const info = await FileSystem.getInfoAsync(filePath)
					return {
						path: filePath,
						...info,
						name: filename,
						lastModified:
							(await FileSystem.getInfoAsync(filePath, { md5: false })).modificationTime || 0,
					}
				}),
			)

			// 按最后修改时间排序
			fileInfos.sort((a, b) => b.lastModified - a.lastModified)

			// 如果缓存文件总数超过20个，删除旧的文件
			if (fileInfos.length > 20) {
				const filesToDelete = fileInfos.slice(20)
				await Promise.all(
					filesToDelete.map((file) => FileSystem.deleteAsync(file.path, { idempotent: true })),
				)
				logInfo('已清理旧的缓存文件')
			}
		}
	} catch (error) {
		logError('清理缓存失败:', error)
	}
}

// 检查网络状态
const checkNetworkStatus = async () => {
	try {
		const server = getCurrentWebDAVServer()
		if (!server?.url) throw new Error('WebDAV服务器未配置')

		const url = processWebDAVUrl(server.url, '/')
		const authString = `${server.username}:${server.password}`
		const base64Auth = btoa(authString)

		const response = await fetch(url, {
			method: 'HEAD',
			headers: {
				Authorization: `Basic ${base64Auth}`,
			},
		})

		return response.ok
	} catch (error) {
		logError('网络检查失败:', error)
		return false
	}
}

// 缓存WebDAV音乐文件
const cacheWebDAVFile = async (file: WebDAVFile) => {
	try {
		// 验证音频文件
		validateAudioFile(file)

		// 创建缓存目录
		const cacheDir = `${FileSystem.cacheDirectory}webdav_cache/`
		await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true }).catch(() => {})

		// 生成缓存文件路径
		const cacheFilePath = `${cacheDir}${encodeURIComponent(file.basename)}`

		// 检查是否已缓存
		const cacheInfo = await FileSystem.getInfoAsync(cacheFilePath)
		if (cacheInfo.exists) {
			logInfo('使用缓存的音乐文件:', file.basename)
			return cacheFilePath
		}

		// 获取WebDAV文件URL
		const server = getCurrentWebDAVServer()
		if (!server?.url) throw new Error('WebDAV服务器未配置')

		// 构建和处理WebDAV URL
		const fileUrl = processWebDAVUrl(server.url, file.filename)

		// 添加认证信息
		const authString = `${server.username}:${server.password}`
		const base64Auth = btoa(authString)

		// 下载文件
		logInfo('开始下载音乐文件:', file.basename)
		showLoadingProgress('正在下载音乐文件...', 0)

		const downloadResult = await FileSystem.downloadAsync(fileUrl, cacheFilePath, {
			headers: {
				Authorization: `Basic ${base64Auth}`,
			},
			progress: (downloadProgress) => {
				const progress =
					downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite
				updateLoadingProgress(progress, `正在下载: ${file.basename}`)
			},
		}).catch((error) => {
			logError('下载失败:', error)
			setLoadingError('文件下载失败: ' + (error.message || '未知错误'), 'webdav')
			throw error
		})

		if (downloadResult.status !== 200) {
			setLoadingError(`下载失败: HTTP ${downloadResult.status}`, 'webdav')
			throw new Error(`下载失败: HTTP ${downloadResult.status}`)
		}

		// 验证下载的文件
		const downloadedFileInfo = await FileSystem.getInfoAsync(cacheFilePath)
		if (!downloadedFileInfo.exists || downloadedFileInfo.size === 0) {
			await FileSystem.deleteAsync(cacheFilePath).catch(() => {})
			setLoadingError('下载的文件无效', 'webdav')
			throw new Error('下载的文件无效')
		}

		hideLoadingProgress()
		logInfo('音乐文件下载完成:', file.basename)
		return cacheFilePath
	} catch (error) {
		logError('缓存WebDAV文件失败:', error)
		throw error
	}
}

// 播放状态持久化
const savePlaybackState = async (musicItem: any, position: number) => {
	try {
		await PersistStatus.set('webdav.lastPlayed', {
			musicItem,
			position,
			timestamp: Date.now(),
		})
	} catch (error) {
		logError('保存播放状态失败:', error)
	}
}

// 获取上次播放状态
const getLastPlaybackState = async () => {
	try {
		return await PersistStatus.get('webdav.lastPlayed')
	} catch (error) {
		logError('获取上次播放状态失败:', error)
		return null
	}
}

// 显示加载进度
const showLoadingProgress = (message: string, progress?: number) => {
	showLoading(message, {
		type: 'webdav',
		progress,
		isIndeterminate: progress === undefined,
	})
}

// 隐藏加载进度
const hideLoadingProgress = () => {
	hideLoading('webdav')
}

// 检查音频格式兼容性
const checkAudioCompatibility = async (file: WebDAVFile) => {
	const extension = file.basename.split('.').pop()?.toLowerCase()

	// 检查是否需要转换
	if (extension === 'flac') {
		showToast('提示', 'FLAC格式可能需要转换，播放可能需要较长时间', 'info')
	}

	return true
}

// 解析音频元数据
const parseAudioMetadata = async (filePath: string) => {
	try {
		// 获取音频文件信息
		const asset = await MediaLibrary.createAssetAsync(filePath)

		return {
			title: asset.filename.replace(/\.[^/.]+$/, ''),
			artist: asset.artist || 'WebDAV音乐',
			album: asset.album || 'WebDAV专辑',
			duration: asset.duration || 0,
			artwork: asset.uri,
		}
	} catch (error) {
		logError('解析音频元数据失败:', error)
		return null
	}
}

// 流式播放处理
const handleStreamingPlayback = async (file: WebDAVFile) => {
	try {
		const server = getCurrentWebDAVServer()
		if (!server?.url) throw new Error('WebDAV服务器未配置')

		const fileUrl = processWebDAVUrl(server.url, file.filename)
		const authString = `${server.username}:${server.password}`
		const base64Auth = btoa(authString)

		// 创建音频对象
		const { sound, status } = await Audio.Sound.createAsync(
			{ uri: fileUrl, headers: { Authorization: `Basic ${base64Auth}` } },
			{ shouldPlay: true, progressUpdateIntervalMillis: 1000 },
			(status) => {
				if (status.isLoaded) {
					// 更新播放进度
					const progress = status.positionMillis / status.durationMillis
					showLoadingProgress(`正在播放: ${Math.round(progress * 100)}%`, progress)
				}
			},
		)

		return { sound, status }
	} catch (error) {
		logError('流式播放失败:', error)
		throw error
	}
}

// 播放WebDAV音乐的函数
const playWebDavTrack = async (file: WebDAVFile) => {
	try {
		if (!file) throw new Error('无效的音乐文件')

		logInfo('准备播放WebDAV音乐:', file.basename)

		// 显示加载提示
		showLoadingProgress('正在检查网络连接...')

		// 检查网络状态
		const isNetworkAvailable = await checkNetworkStatus()
		if (!isNetworkAvailable) {
			throw new Error('无法连接到WebDAV服务器，请检查网络连接')
		}

		// 检查音频兼容性
		showLoadingProgress('正在检查文件兼容性...')
		await checkAudioCompatibility(file)

		// 清理旧的缓存文件
		showLoadingProgress('正在清理缓存...')
		await cleanupCache()

		let musicItem
		let cachedFilePath

		// 尝试流式播放
		try {
			showLoadingProgress('正在准备流式播放...')
			const { sound, status } = await handleStreamingPlayback(file)

			if (status.isLoaded) {
				// 创建音乐项（流式播放）
				musicItem = {
					id: `webdav-${Date.now()}`,
					url: status.uri,
					title: file.basename.replace(/\.[^/.]+$/, ''),
					artist: 'WebDAV音乐',
					artwork: '',
					platform: 'webdav',
					duration: status.durationMillis / 1000,
					size: file.size,
					format: file.basename.split('.').pop()?.toLowerCase(),
					isStreaming: true,
					sound, // 保存sound对象以便控制
				}
			} else {
				throw new Error('流式播放初始化失败')
			}
		} catch (streamError) {
			logError('流式播放失败，尝试缓存播放:', streamError)

			// 回退到缓存播放
			showLoadingProgress('正在准备音乐文件...', 0)
			cachedFilePath = await cacheWebDAVFile(file)
			if (!cachedFilePath) throw new Error('文件缓存失败')

			// 解析元数据
			const metadata = await parseAudioMetadata(cachedFilePath)

			// 创建音乐项（缓存播放）
			musicItem = {
				id: `webdav-${Date.now()}`,
				url: `file://${cachedFilePath}`,
				title: metadata?.title || file.basename.replace(/\.[^/.]+$/, ''),
				artist: metadata?.artist || 'WebDAV音乐',
				album: metadata?.album || 'WebDAV专辑',
				artwork: metadata?.artwork || '',
				platform: 'webdav',
				duration: metadata?.duration || 0,
				size: file.size,
				format: file.basename.split('.').pop()?.toLowerCase(),
			}
		}

		// 播放音乐
		try {
			showLoadingProgress('正在初始化播放器...')

			if (musicItem.isStreaming) {
				// 使用Expo Audio API播放
				await musicItem.sound.playAsync()
			} else {
				// 使用TrackPlayer播放
				await TrackPlayer.reset()

				// 设置播放选项
				await TrackPlayer.updateOptions({
					capabilities: [
						TrackPlayer.CAPABILITY_PLAY,
						TrackPlayer.CAPABILITY_PAUSE,
						TrackPlayer.CAPABILITY_STOP,
						TrackPlayer.CAPABILITY_SEEK_TO,
					],
					compactCapabilities: [TrackPlayer.CAPABILITY_PLAY, TrackPlayer.CAPABILITY_PAUSE],
					progressUpdateEventInterval: 1,
				})

				// 获取上次播放状态
				const lastState = await getLastPlaybackState()

				await TrackPlayer.add(musicItem)

				// 设置播放模式和选项
				await TrackPlayer.setRepeatMode(0) // 不循环播放
				await TrackPlayer.setVolume(1.0)

				// 如果是同一首歌，恢复上次播放位置
				if (lastState?.musicItem?.id === musicItem.id) {
					await TrackPlayer.seekTo(lastState.position)
				}

				// 注册播放器事件监听
				const events = [
					'playback-state',
					'playback-error',
					'playback-track-changed',
					'playback-queue-ended',
					'playback-progress-updated',
				]

				events.forEach((event) => {
					TrackPlayer.addEventListener(event, async (data) => {
						switch (event) {
							case 'playback-state':
								logInfo('播放状态变化:', data)
								break
							case 'playback-error':
								logError('播放错误:', data)
								showToast('错误', '音乐播放失败，请检查文件格式是否支持', 'error')
								if (cachedFilePath) {
									await FileSystem.deleteAsync(cachedFilePath).catch(() => {})
								}
								break
							case 'playback-track-changed':
								logInfo('切换到新的音轨:', data)
								break
							case 'playback-queue-ended':
								logInfo('播放队列结束')
								break
							case 'playback-progress-updated':
								// 保存播放进度
								await savePlaybackState(musicItem, data.position)
								break
						}
					})
				})

				// 开始播放
				await TrackPlayer.play()
			}

			logInfo('开始播放:', musicItem)

			// 隐藏加载提示
			hideLoadingProgress()

			// 显示播放成功提示
			showToast('提示', '开始播放音乐', 'success')

			// 定期更新播放进度
			const progressInterval = setInterval(async () => {
				try {
					if (musicItem.isStreaming) {
						const status = await musicItem.sound.getStatusAsync()
						if (status.isLoaded && status.durationMillis > 0) {
							const progress = status.positionMillis / status.durationMillis
							showLoadingProgress(`正在播放: ${Math.round(progress * 100)}%`, progress)
						}
					} else {
						const position = await TrackPlayer.getPosition()
						const duration = await TrackPlayer.getDuration()
						logInfo('播放进度:', { position, duration })

						if (duration > 0) {
							const progress = position / duration
							showLoadingProgress(`正在播放: ${Math.round(progress * 100)}%`, progress)
						}
					}
				} catch (error) {
					logError('获取播放进度失败:', error)
					clearInterval(progressInterval)
				}
			}, 1000)

			// 清理定时器和资源
			const cleanup = async () => {
				clearInterval(progressInterval)
				hideLoadingProgress()

				if (musicItem.isStreaming) {
					await musicItem.sound.unloadAsync()
				}

				if (cachedFilePath) {
					await FileSystem.deleteAsync(cachedFilePath).catch(() => {})
				}
			}

			if (musicItem.isStreaming) {
				musicItem.sound.setOnPlaybackStatusUpdate((status) => {
					if (status.didJustFinish) {
						cleanup()
					}
				})
			} else {
				TrackPlayer.addEventListener('playback-queue-ended', cleanup)
			}
		} catch (playerError) {
			logError('播放器操作失败:', playerError)
			showToast('错误', '音乐播放器初始化失败，请稍后重试', 'error')

			// 清理资源
			if (musicItem.isStreaming) {
				await musicItem.sound.unloadAsync()
			}
			if (cachedFilePath) {
				await FileSystem.deleteAsync(cachedFilePath).catch(() => {})
			}

			// 隐藏加载提示
			hideLoadingProgress()
		}
	} catch (error) {
		logError('播放WebDAV音乐失败:', error)
		showToast('错误', `无法播放此音乐文件: ${error.message || '未知错误'}`, 'error')

		// 隐藏加载提示
		hideLoadingProgress()
	}
}

// 将WebDAV文件添加到播放列表的函数
const addToPlaylist = async (file: WebDAVFile, playlist: any) => {
	try {
		// 显示加载提示
		showLoadingProgress('正在添加到播放列表...')

		// 缓存文件
		const cachedFilePath = await cacheWebDAVFile(file)
		if (!cachedFilePath) throw new Error('文件缓存失败')

		// 解析元数据
		const metadata = await parseAudioMetadata(cachedFilePath)

		// 创建音乐项
		const musicItem = {
			id: `webdav-${Date.now()}`,
			url: `file://${cachedFilePath}`,
			title: metadata?.title || file.basename.replace(/\.[^/.]+$/, ''),
			artist: metadata?.artist || 'WebDAV音乐',
			album: metadata?.album || 'WebDAV专辑',
			artwork: metadata?.artwork || '',
			duration: metadata?.duration || 0,
			platform: 'webdav',
			size: file.size,
			format: file.basename.split('.').pop()?.toLowerCase(),
		}

		// 获取当前播放列表
		const currentPlaylists = playListsStore.getValue() || []

		// 更新播放列表
		const updatedPlaylists = currentPlaylists.map((p) => {
			if (p.id === playlist.id) {
				return {
					...p,
					songs: [...p.songs, musicItem],
				}
			}
			return p
		})

		// 保存更新后的播放列表
		playListsStore.setValue(updatedPlaylists)
		await PersistStatus.set('music.playLists', updatedPlaylists)

		// 显示成功提示
		showToast('成功', '已添加到播放列表', 'success')

		// 隐藏加载提示
		hideLoadingProgress()
	} catch (error) {
		logError('添加到播放列表失败:', error)
		showToast('错误', `添加失败: ${error.message || '未知错误'}`, 'error')
		hideLoadingProgress()
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
