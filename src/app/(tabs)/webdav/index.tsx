import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import {
	getCurrentWebDAVServer,
	getDirectoryContents,
	verifyWebDAVConnection,
} from '@/helpers/webdavService'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	FlatList,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import TrackPlayer from 'react-native-track-player'

// 处理日期格式化，安全返回格式化后的日期或占位符
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
function FileItem({ file, onPress, onLongPress }) {
	const isDirectory = file.type === 'directory'

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
					name={isDirectory ? 'folder' : 'file'}
					size={24}
					color={isDirectory ? colors.primary : colors.text}
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

// 未配置WebDAV组件
function NoWebDAVSetup({ onOpenSettings }) {
	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<Feather name="server" size={48} color={colors.textMuted} />
			<Text style={{ marginTop: 16, color: colors.text, fontSize: 16, textAlign: 'center' }}>
				未配置WebDAV服务器
			</Text>
			<Text style={{ marginTop: 8, color: colors.textMuted, textAlign: 'center' }}>
				请添加WebDAV服务器以访问您的文件
			</Text>
			<TouchableOpacity
				onPress={onOpenSettings}
				style={{
					marginTop: 16,
					backgroundColor: colors.primary,
					padding: 12,
					borderRadius: 8,
				}}
			>
				<Text style={{ color: '#fff' }}>配置WebDAV</Text>
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

// 播放WebDAV音乐的简化函数
const playWebDavTrack = async (musicItem) => {
	try {
		if (!musicItem) {
			throw new Error('无效的音乐项')
		}

		// 直接使用Track Player API播放音乐
		await TrackPlayer.reset()
		await TrackPlayer.add({
			id: musicItem.id || `webdav-${Date.now()}`,
			url: musicItem.url,
			title: musicItem.title || '未知标题',
			artist: musicItem.artist || '未知艺术家',
			artwork: musicItem.artwork || '',
		})
		await TrackPlayer.play()

		logInfo('正在播放WebDAV音乐:', musicItem.title)
	} catch (error) {
		logError('播放WebDAV音乐失败:', error)
		Alert.alert('错误', '无法播放此音乐文件')
	}
}

// 将WebDAV文件添加到播放列表的简化函数
const addToPlaylist = async (musicItem) => {
	try {
		if (!musicItem) {
			throw new Error('无效的音乐项')
		}

		// 将音乐添加到播放队列
		await TrackPlayer.add({
			id: musicItem.id || `webdav-${Date.now()}`,
			url: musicItem.url,
			title: musicItem.title || '未知标题',
			artist: musicItem.artist || '未知艺术家',
			artwork: musicItem.artwork || '',
		})

		logInfo('已添加到播放列表:', musicItem.title)
		Alert.alert('提示', '已添加到播放列表')
	} catch (error) {
		logError('添加到播放列表失败:', error)
		Alert.alert('错误', '无法添加到播放列表')
	}
}

export default function WebDavScreen() {
	const router = useRouter()
	const [currentPath, setCurrentPath] = useState('/')
	const [files, setFiles] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)
	const [refreshKey, setRefreshKey] = useState(0) // 用于强制刷新
	const [pathHistory, setPathHistory] = useState([]) // 路径历史，用于返回

	// 添加返回键处理
	useEffect(() => {
		const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
			// 如果有历史记录，返回上一级目录
			if (pathHistory.length > 0) {
				handleBack()
				return true
			}
			return false
		})
		return () => backHandler.remove()
	}, [pathHistory])

	// 安全的文件加载函数 - 使用简单的超时处理
	const safeLoadFiles = useCallback(async (path) => {
		setIsLoading(true)
		setError(null)

		let timeoutId = null
		let loadPromiseResolved = false

		try {
			// 设置超时保护
			timeoutId = setTimeout(() => {
				if (!loadPromiseResolved) {
					throw new Error('加载文件超时，请检查网络连接')
				}
			}, 15000)

			// 先检查当前服务器
			const server = await getCurrentWebDAVServer()
			if (!server) {
				throw new Error('未配置WebDAV服务器')
			}

			// 验证WebDAV连接
			const isConnected = await verifyWebDAVConnection(server)
			if (!isConnected) {
				throw new Error('无法连接到WebDAV服务器，请检查设置')
			}

			// 加载文件
			const filesList = await getDirectoryContents(path)
			loadPromiseResolved = true

			// 对文件进行排序 - 目录在前，文件在后
			const sortedFiles = [...filesList].sort((a, b) => {
				// 先按类型排序（目录在前）
				if (a.type !== b.type) {
					return a.type === 'directory' ? -1 : 1
				}
				// 再按名称字母顺序排序
				return a.basename.localeCompare(b.basename)
			})

			// 过滤出非隐藏文件（不以.开头）
			const visibleFiles = sortedFiles.filter((file) => !file.basename.startsWith('.'))

			setFiles(visibleFiles)
			setIsLoading(false)
		} catch (error) {
			let errorMessage = '加载文件失败'

			// 根据错误类型提供更具体的错误信息
			if (error.status === 401) {
				errorMessage = '授权失败: 请检查用户名和密码'
			} else if (error.status === 404) {
				errorMessage = '路径不存在: ' + path
			} else if (error.message && error.message.includes('timeout')) {
				errorMessage = '连接超时: 请检查网络和服务器设置'
			} else if (error.message && error.message.includes('ENOTFOUND')) {
				errorMessage = '找不到服务器: 请检查URL是否正确'
			} else if (error.message && error.message.includes('ECONNREFUSED')) {
				errorMessage = '连接被拒绝: 服务器可能未运行或拒绝连接'
			} else if (error.message) {
				errorMessage = error.message
			}

			setError(errorMessage)
			setIsLoading(false)
			logError('加载WebDAV文件失败:', error)
		} finally {
			if (timeoutId) {
				clearTimeout(timeoutId)
			}
		}
	}, [])

	// 打开WebDAV设置
	const openWebDAVSettings = useCallback(() => {
		try {
			logInfo('打开WebDAV设置')
			// 添加安全检查，防止快速多次点击
			if (isLoading) return
			setIsLoading(true)

			// 添加小延迟，防止快速重复点击
			setTimeout(() => {
				router.push('/webdavModal')
				// 延迟重置操作状态
				setTimeout(() => {
					setIsLoading(false)
				}, 1000)
			}, 100)
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
			Alert.alert('错误', '无法打开WebDAV设置')
			setIsLoading(false)
		}
	}, [router, isLoading])

	// 处理返回上一级目录
	const handleBack = useCallback(() => {
		if (pathHistory.length === 0) return

		try {
			const prevPath = pathHistory[pathHistory.length - 1]
			setCurrentPath(prevPath)
			setPathHistory((prev) => prev.slice(0, -1))
			safeLoadFiles(prevPath)
		} catch (error) {
			logError('返回上一级目录失败:', error)
			setError('无法返回上一级目录')
		}
	}, [pathHistory])

	// 加载当前目录的文件
	const loadFiles = useCallback(
		(path = '/') => {
			// 保证多次快速调用不会重复执行
			if (isLoading) return
			safeLoadFiles(path)
		},
		[safeLoadFiles, isLoading],
	)

	// 处理刷新
	const handleRefresh = useCallback(() => {
		loadFiles(currentPath)
	}, [loadFiles, currentPath])

	// 处理文件点击
	const handleFilePress = useCallback(
		(file) => {
			if (file.type === 'directory') {
				// 保存当前路径到历史记录
				setPathHistory((prev) => [...prev, currentPath])
				// 设置新路径并加载文件
				setCurrentPath(file.path)
				loadFiles(file.path)
			} else if (/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename)) {
				try {
					// 处理音频文件
					const musicItem = webdavFileToMusicItem(file)
					if (musicItem) {
						Alert.alert('音乐文件', '选择操作', [
							{
								text: '立即播放',
								onPress: () => playWebDavTrack(musicItem),
							},
							{
								text: '添加到播放列表',
								onPress: () => addToPlaylist(musicItem),
							},
							{ text: '取消', style: 'cancel' },
						])
					} else {
						Alert.alert('错误', '无法处理此音乐文件')
					}
				} catch (error) {
					logError('处理音乐文件失败:', error)
					Alert.alert('错误', '处理音乐文件时出错')
				}
			} else {
				Alert.alert('不支持', '不支持此文件类型')
			}
		},
		[currentPath, loadFiles],
	)

	// 处理文件长按
	const handleFileLongPress = useCallback((file) => {
		// 长按操作，如显示详情或更多选项
		Alert.alert(
			'文件详情',
			`名称: ${file.basename}\n大小: ${formatBytes(file.size || 0)}\n路径: ${file.path}`,
		)
	}, [])

	// 初次加载文件
	useEffect(() => {
		loadFiles('/')
	}, [loadFiles, refreshKey])

	// 准备渲染内容
	const renderContent = useMemo(() => {
		// 显示错误情况
		if (error) {
			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Feather name="alert-triangle" size={48} color="red" />
					<Text style={{ marginTop: 16, color: colors.text, textAlign: 'center', fontSize: 16 }}>
						{error}
					</Text>
					<TouchableOpacity
						onPress={handleRefresh}
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

		// 加载中
		if (isLoading) {
			return <LoadingPlaceholder />
		}

		// 未配置WebDAV
		if (!currentServer) {
			return <NoWebDAVSetup onOpenSettings={openWebDAVSettings} />
		}

		// 空文件夹
		if (files.length === 0) {
			return <EmptyContent onRefresh={handleRefresh} />
		}

		// 正常显示文件列表
		return (
			<>
				{/* 路径导航 */}
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						padding: 12,
						backgroundColor: colors.card,
						borderBottomWidth: 1,
						borderBottomColor: '#333',
					}}
				>
					{pathHistory.length > 0 && (
						<TouchableOpacity onPress={handleBack} style={{ marginRight: 8 }}>
							<Feather name="arrow-left" size={24} color={colors.text} />
						</TouchableOpacity>
					)}
					<Text style={{ color: colors.text, fontSize: 16, flex: 1 }} numberOfLines={1}>
						{currentPath === '/' ? '根目录' : currentPath}
					</Text>
					<TouchableOpacity onPress={handleRefresh}>
						<Feather name="refresh-cw" size={20} color={colors.text} />
					</TouchableOpacity>
				</View>

				{/* 文件列表 */}
				<FlatList
					data={files}
					keyExtractor={(item, index) => item.path || index.toString()}
					renderItem={({ item }) => (
						<FileItem file={item} onPress={handleFilePress} onLongPress={handleFileLongPress} />
					)}
				/>
			</>
		)
	}, [
		error,
		isLoading,
		currentServer,
		files,
		handleRefresh,
		openWebDAVSettings,
		handleFilePress,
		handleFileLongPress,
		pathHistory,
		currentPath,
		handleBack,
	])

	return (
		<ErrorCatcher onRetry={handleRefresh}>
			<View style={{ flex: 1, backgroundColor: colors.background }}>{renderContent}</View>
		</ErrorCatcher>
	)
}
