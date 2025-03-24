import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { useCurrentWebDAVServer, webdavFileToMusicItem } from '@/helpers/webdavService'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, Text, TouchableOpacity, View } from 'react-native'
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
	const currentServer = useCurrentWebDAVServer()

	const [currentPath, setCurrentPath] = useState('/')
	const [files, setFiles] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)
	const [refreshKey, setRefreshKey] = useState(0) // 用于强制刷新

	// 打开WebDAV设置
	const openWebDAVSettings = useCallback(() => {
		try {
			logInfo('打开WebDAV设置')
			router.push('/webdavModal')
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
			Alert.alert('错误', '无法打开WebDAV设置')
		}
	}, [router])

	// 加载当前目录的文件
	const loadFiles = useCallback(
		async (path = '/') => {
			try {
				setIsLoading(true)
				setError(null)

				// 检查是否有WebDAV服务器配置
				if (!currentServer) {
					setIsLoading(false)
					return
				}

				logInfo('正在加载WebDAV文件列表，路径:', path)

				// 获取当前服务器的客户端
				const client = currentServer.client
				if (!client) {
					logError('WebDAV客户端未初始化，无法加载文件')
					setError('未连接到WebDAV服务器，请检查服务器设置')
					setIsLoading(false)
					return
				}

				try {
					const contents = await client.getDirectoryContents(path)
					// 对文件进行排序：文件夹在前，文件在后，同类型按名称排序
					const sortedContents = [...contents].sort((a, b) => {
						if (a.type === 'directory' && b.type !== 'directory') return -1
						if (a.type !== 'directory' && b.type === 'directory') return 1
						return a.basename.localeCompare(b.basename)
					})

					setFiles(sortedContents)
					logInfo(`WebDAV文件加载完成，找到 ${sortedContents.length} 个项目`)
				} catch (err) {
					logError(`加载WebDAV目录内容失败 (${path}):`, err)
					setError(`加载目录失败: ${err.message || '未知错误'}`)
					setFiles([])
				} finally {
					setIsLoading(false)
				}
			} catch (err) {
				logError('加载WebDAV文件过程中发生错误:', err)
				setError(err.message || '加载文件失败')
				setFiles([])
				setIsLoading(false)
			}
		},
		[currentServer],
	)

	// 刷新当前目录
	const refreshFiles = useCallback(() => {
		loadFiles(currentPath)
		setRefreshKey((prev) => prev + 1)
	}, [currentPath, loadFiles])

	// 处理文件点击
	const handleFilePress = useCallback(
		(file) => {
			try {
				if (file.type === 'directory') {
					// 如果是目录，则进入该目录
					const newPath = file.filename
					setCurrentPath(newPath)
					loadFiles(newPath)
				} else {
					// 检查是否是音乐文件
					const extension = file.basename.split('.').pop()?.toLowerCase()
					const musicExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']

					if (musicExtensions.includes(extension)) {
						logInfo('正在播放WebDAV音乐文件:', file.basename)
						// 转换为音乐项目并播放
						const musicItem = webdavFileToMusicItem(file)
						if (musicItem) {
							// 使用我们自定义的简化播放函数
							playWebDavTrack(musicItem)
						}
					} else {
						logInfo('不支持播放的文件类型:', extension)
						// 显示提示
						Alert.alert('提示', `暂不支持播放 ${extension} 类型的文件`)
					}
				}
			} catch (err) {
				logError('处理文件点击失败:', err)
				setError(err.message || '处理文件操作失败')
			}
		},
		[currentPath, loadFiles],
	)

	// 处理文件长按 - 添加到播放列表
	const handleFileLongPress = useCallback((file) => {
		try {
			if (file.type === 'file') {
				// 检查是否是音乐文件
				const extension = file.basename.split('.').pop()?.toLowerCase()
				const musicExtensions = ['mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg']

				if (musicExtensions.includes(extension)) {
					logInfo('添加WebDAV音乐文件到播放列表:', file.basename)
					// 转换为音乐项目并添加到播放列表
					const musicItem = webdavFileToMusicItem(file)
					if (musicItem) {
						// 使用自定义的添加到播放列表函数
						addToPlaylist(musicItem)
					}
				} else {
					Alert.alert('提示', `不支持添加 ${extension} 类型的文件到播放列表`)
				}
			}
		} catch (err) {
			logError('处理文件长按失败:', err)
			Alert.alert('错误', '无法添加文件到播放列表')
		}
	}, [])

	// 处理返回上一级目录
	const handleGoBack = useCallback(() => {
		try {
			if (currentPath === '/') {
				return
			}

			// 获取上一级目录路径
			const pathParts = currentPath.split('/').filter(Boolean)
			pathParts.pop()
			const parentPath = pathParts.length === 0 ? '/' : `/${pathParts.join('/')}/`

			setCurrentPath(parentPath)
			loadFiles(parentPath)
		} catch (err) {
			logError('返回上级目录失败:', err)
			setError(err.message || '导航操作失败')
		}
	}, [currentPath, loadFiles])

	// 初始加载
	useEffect(() => {
		loadFiles('/')
	}, [loadFiles, currentServer])

	// 渲染页面
	return (
		<ErrorCatcher onRetry={refreshFiles}>
			<View style={{ flex: 1, backgroundColor: colors.background }}>
				{!currentServer ? (
					<NoWebDAVSetup onOpenSettings={openWebDAVSettings} />
				) : (
					<>
						{/* 路径显示和导航 */}
						<View
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								padding: 16,
								borderBottomWidth: 1,
								borderBottomColor: '#333',
							}}
						>
							{currentPath !== '/' && (
								<TouchableOpacity onPress={handleGoBack} style={{ marginRight: 8 }}>
									<Feather name="arrow-left" size={20} color={colors.primary} />
								</TouchableOpacity>
							)}
							<Text style={{ flex: 1, color: colors.text }}>
								{currentPath === '/' ? '根目录' : currentPath}
							</Text>
							<TouchableOpacity onPress={refreshFiles}>
								<Feather name="refresh-cw" size={20} color={colors.primary} />
							</TouchableOpacity>
						</View>

						{/* 文件列表 */}
						{isLoading ? (
							<LoadingPlaceholder />
						) : error ? (
							<View
								style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}
							>
								<Feather name="alert-circle" size={48} color="red" />
								<Text style={{ marginTop: 16, color: colors.text, textAlign: 'center' }}>
									{error}
								</Text>
								<TouchableOpacity
									onPress={refreshFiles}
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
						) : files.length === 0 ? (
							<EmptyContent onRefresh={refreshFiles} />
						) : (
							<FlatList
								data={files}
								keyExtractor={(item) => item.filename + '-' + refreshKey}
								renderItem={({ item }) => (
									<FileItem
										file={item}
										onPress={handleFilePress}
										onLongPress={handleFileLongPress}
									/>
								)}
							/>
						)}
					</>
				)}
			</View>
		</ErrorCatcher>
	)
}
