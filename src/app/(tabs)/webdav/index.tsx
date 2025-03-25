import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import {
	getCurrentWebDAVServer,
	getDirectoryContents,
	webdavFileToMusicItem,
} from '@/helpers/webdavService'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
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

		logInfo('准备播放WebDAV音乐:', musicItem.title)

		// 检查TrackPlayer是否准备就绪
		try {
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
		} catch (playerError) {
			logError('TrackPlayer操作失败:', playerError)
			Alert.alert('播放错误', '音乐播放器初始化失败，请稍后重试')
		}
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

		logInfo('准备添加到播放列表:', musicItem.title)

		// 将音乐添加到播放队列
		try {
			await TrackPlayer.add({
				id: musicItem.id || `webdav-${Date.now()}`,
				url: musicItem.url,
				title: musicItem.title || '未知标题',
				artist: musicItem.artist || '未知艺术家',
				artwork: musicItem.artwork || '',
			})

			logInfo('已添加到播放列表:', musicItem.title)
			Alert.alert('提示', '已添加到播放列表')
		} catch (playerError) {
			logError('TrackPlayer添加失败:', playerError)
			Alert.alert('错误', '音乐播放器初始化失败，请稍后重试')
		}
	} catch (error) {
		logError('添加到播放列表失败:', error)
		Alert.alert('错误', '无法添加到播放列表')
	}
}

export default function WebDavScreen() {
	const router = useRouter()
	const [currentPath, setCurrentPath] = useState('/')
	const [files, setFiles] = useState([])
	const [isLoading, setIsLoading] = useState(false) // 改为默认非加载状态
	const [error, setError] = useState(null)
	const [refreshKey, setRefreshKey] = useState(0) // 用于强制刷新
	const [pathHistory, setPathHistory] = useState([]) // 路径历史，用于返回
	const [isMounted, setIsMounted] = useState(true)
	const [initialized, setInitialized] = useState(false) // 添加初始化状态标记
	const [currentServer, setCurrentServer] = useState(null) // 显式保存当前服务器状态
	const [isPlayerReady, setIsPlayerReady] = useState(false) // 跟踪播放器状态
	const [hasRendered, setHasRendered] = useState(false) // 跟踪是否已渲染
	const [loadAttempt, setLoadAttempt] = useState(0) // 跟踪加载尝试次数
	const [emergencyMode, setEmergencyMode] = useState(false) // 紧急模式标志
	const [isRecovering, setIsRecovering] = useState(false) // 恢复模式标志

	// 组件挂载状态管理 - 最先调用的useEffect
	useEffect(() => {
		setIsMounted(true)

		// 使用双重保护确保UI渲染
		requestAnimationFrame(() => {
			if (isMounted) {
				setHasRendered(true)
				// 启动恢复计时器
				setTimeout(() => {
					if (isMounted && !initialized) {
						// 5秒后如果仍未初始化，强制进入恢复模式
						logInfo('WebDAV页面: 启动恢复模式')
						setIsRecovering(true)
					}
				}, 5000)
			}
		})

		return () => {
			setIsMounted(false)
		}
	}, [])

	// 恢复模式 - 在常规初始化失败时使用
	useEffect(() => {
		if (!isRecovering || !isMounted) return

		logInfo('WebDAV页面: 恢复模式激活')

		// 设置紧急模式状态
		setEmergencyMode(true)
		setInitialized(true) // 强制标记为已初始化
		setIsLoading(false) // 确保不处于加载状态

		// 尝试获取服务器状态
		try {
			const server = getCurrentWebDAVServer()
			setCurrentServer(server)
		} catch (error) {
			logError('WebDAV恢复模式: 获取服务器失败', error)
			// 在紧急模式下继续，不抛出错误
		}
	}, [isRecovering, isMounted])

	// 延迟播放器初始化，让UI先渲染
	useEffect(() => {
		if (!hasRendered || !isMounted) return

		// 在UI渲染后延迟初始化播放器
		const initPlayerTimer = setTimeout(() => {
			// 异步初始化播放器，不阻塞UI
			const initPlayer = async () => {
				try {
					// 检查TrackPlayer状态，但不阻塞界面渲染
					const state = await TrackPlayer.getState()
					if (isMounted) {
						setIsPlayerReady(true)
						logInfo('WebDAV页面: TrackPlayer已就绪', state)
					}
				} catch (playerError) {
					logError('WebDAV页面: TrackPlayer初始化检查失败', playerError)
					// 继续执行，不阻塞页面
					if (isMounted) {
						setIsPlayerReady(false)
					}
				}
			}

			// 在try-catch块中执行初始化
			try {
				initPlayer().catch((error) => {
					logError('WebDAV页面: 播放器初始化失败', error)
				})
			} catch (error) {
				logError('WebDAV页面: 播放器初始化错误', error)
			}
		}, 800) // 延迟800ms初始化播放器

		return () => clearTimeout(initPlayerTimer)
	}, [hasRendered, isMounted])

	// 安全获取当前服务器 - 同样使用延迟初始化
	useEffect(() => {
		if (!hasRendered || !isMounted || isRecovering) return

		// 延迟获取服务器信息，避免与渲染冲突
		const serverInitTimer = setTimeout(() => {
			try {
				const server = getCurrentWebDAVServer()
				if (isMounted) {
					setCurrentServer(server)
					logInfo('WebDAV页面: 获取服务器成功', server?.name || '无服务器')
				}
			} catch (error) {
				logError('获取当前WebDAV服务器失败:', error)
				if (isMounted) {
					setError('获取WebDAV服务器信息失败: ' + (error.message || '未知错误'))
				}
			} finally {
				if (isMounted) {
					setInitialized(true) // 标记初始化完成
					// 无论成功失败都设置为已初始化
				}
			}
		}, 500) // 延迟500ms获取服务器信息

		return () => clearTimeout(serverInitTimer)
	}, [isMounted, hasRendered, isRecovering])

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
	const safeLoadFiles = useCallback(
		async (path) => {
			if (!isMounted || !hasRendered) return // 如果组件已卸载或未渲染，不执行操作

			setIsLoading(true)
			setError(null)

			// 记录当前加载尝试
			const currentAttempt = loadAttempt
			setLoadAttempt((prev) => prev + 1)

			logInfo(`WebDAV页面: 开始加载文件 (尝试 ${currentAttempt + 1})，路径: ${path}`)

			try {
				// 使用更安全的方式获取文件列表
				const filesData = await getDirectoryContents(path, { onlyMusic: false })

				if (isMounted) {
					const sortedFiles = [...filesData].sort((a, b) => {
						// 文件夹优先
						if (a.type === 'directory' && b.type !== 'directory') return -1
						if (a.type !== 'directory' && b.type === 'directory') return 1

						// 按文件名排序
						return a.basename.localeCompare(b.basename)
					})

					setFiles(sortedFiles)
					setIsLoading(false)
					setError(null)
					logInfo(`WebDAV页面: 文件加载成功，获取到 ${sortedFiles.length} 个文件`)
				}
			} catch (err) {
				logError('WebDAV页面: 获取文件列表失败:', err)

				if (isMounted) {
					// 避免客户端完全崩溃
					setIsLoading(false)

					// 设置用户友好的错误消息
					const friendlyMessage = err.message
						? `WebDAV访问错误: ${err.message}`
						: '无法访问WebDAV文件，请检查网络连接或服务器配置'

					setError(friendlyMessage)

					// 如果连续失败3次，进入紧急模式
					if (currentAttempt >= 2) {
						logInfo('WebDAV页面: 多次加载失败，进入紧急模式')
						setEmergencyMode(true)
					}
				}
			}
		},
		[isMounted, hasRendered, loadAttempt],
	)

	// 加载当前目录的文件
	const loadFiles = useCallback(
		(path = '/') => {
			// 保证多次快速调用不会重复执行
			if (isLoading) {
				logInfo('WebDAV页面: 忽略重复加载请求（已有加载进行中）')
				return
			}
			safeLoadFiles(path)
		},
		[safeLoadFiles, isLoading],
	)

	// 处理刷新
	const handleRefresh = useCallback(() => {
		setEmergencyMode(false) // 退出紧急模式
		loadFiles(currentPath)
	}, [loadFiles, currentPath])

	// 处理文件点击
	const handleFilePress = useCallback(
		(file) => {
			if (file.type === 'directory') {
				// 保存当前路径到历史记录
				setPathHistory((prev) => [...prev, currentPath])
				// 设置新路径并加载文件
				const newPath = file.path
				setCurrentPath(newPath)
				loadFiles(newPath)
			} else if (/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(file.basename)) {
				try {
					// 处理音频文件
					const musicItem = webdavFileToMusicItem(file)
					if (musicItem) {
						Alert.alert('音乐文件', '选择操作', [
							{
								text: '立即播放',
								onPress: () => {
									if (!isPlayerReady) {
										Alert.alert('提示', '音乐播放器正在准备中，请稍后再试')
										return
									}
									playWebDavTrack(musicItem)
								},
							},
							{
								text: '添加到播放列表',
								onPress: () => {
									if (!isPlayerReady) {
										Alert.alert('提示', '音乐播放器正在准备中，请稍后再试')
										return
									}
									addToPlaylist(musicItem)
								},
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
		[currentPath, loadFiles, isPlayerReady],
	)

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
			setError('无法返回上一级目录，请重试')
		}
	}, [pathHistory, safeLoadFiles])

	// 打开WebDAV设置
	const openWebDAVSettings = useCallback(() => {
		try {
			logInfo('打开WebDAV设置')
			// 添加安全检查，防止快速多次点击
			if (isLoading) return

			// 不设置加载状态，避免UI冻结

			// 添加小延迟，防止快速重复点击
			setTimeout(() => {
				try {
					router.push('/webdavModal')
				} catch (routeError) {
					logError('WebDAV页面: 导航到设置页面失败', routeError)
					Alert.alert('错误', '无法打开WebDAV设置，请稍后再试')
				}
			}, 200)
		} catch (error) {
			logError('导航到WebDAV设置失败:', error)
			Alert.alert('错误', '无法打开WebDAV设置，请稍后再试')
		}
	}, [router, isLoading])

	// 初次加载文件 - 延迟加载，避免冲突
	useEffect(() => {
		if (initialized && hasRendered && !emergencyMode && !isRecovering) {
			// 延迟加载文件，确保界面已渲染
			const loadTimer = setTimeout(() => {
				try {
					loadFiles('/')
				} catch (loadError) {
					logError('WebDAV页面: 初始加载文件失败', loadError)
					// 即使加载失败，也不影响UI渲染
				}
			}, 400) // 添加400ms延迟

			return () => clearTimeout(loadTimer)
		}
	}, [loadFiles, refreshKey, initialized, hasRendered, emergencyMode, isRecovering])

	// 渲染紧急模式内容
	const renderEmergencyContent = () => (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<Feather name="alert-circle" size={48} color={colors.warning} />
			<Text style={{ marginTop: 16, color: colors.text, textAlign: 'center', fontSize: 16 }}>
				WebDAV服务暂时不可用
			</Text>
			<Text
				style={{
					marginTop: 8,
					color: colors.textMuted,
					textAlign: 'center',
					paddingHorizontal: 20,
				}}
			>
				{error || '无法访问WebDAV服务，请稍后再试'}
			</Text>
			<View style={{ flexDirection: 'row', marginTop: 20 }}>
				<TouchableOpacity
					onPress={handleRefresh}
					style={{
						backgroundColor: colors.primary,
						padding: 12,
						borderRadius: 8,
						marginRight: 10,
					}}
				>
					<Text style={{ color: '#fff' }}>重试</Text>
				</TouchableOpacity>
				<TouchableOpacity
					onPress={openWebDAVSettings}
					style={{
						backgroundColor: colors.card,
						padding: 12,
						borderRadius: 8,
						marginLeft: 10,
					}}
				>
					<Text style={{ color: colors.text }}>设置</Text>
				</TouchableOpacity>
			</View>
			<TouchableOpacity
				onPress={() => router.replace('/(tabs)/')}
				style={{
					marginTop: 12,
					padding: 10,
				}}
			>
				<Text style={{ color: colors.textMuted }}>返回主页</Text>
			</TouchableOpacity>
		</View>
	)

	// 渲染主内容
	const renderMainContent = () => {
		// 显示错误情况
		if (error) {
			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Feather name="alert-triangle" size={48} color="orange" />
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
					// 添加刷新控制
					refreshing={isLoading}
					onRefresh={handleRefresh}
					// 避免在加载时阻塞UI
					initialNumToRender={10}
					maxToRenderPerBatch={10}
					windowSize={10}
					removeClippedSubviews={true}
				/>
			</>
		)
	}

	// 直接返回包含渲染内容的视图 - 根据状态选择不同的渲染模式
	return (
		<ErrorCatcher onRetry={handleRefresh}>
			<View style={{ flex: 1, backgroundColor: colors.background }}>
				{!hasRendered ? (
					// 1. 等待首次渲染
					<LoadingPlaceholder />
				) : emergencyMode ? (
					// 2. 紧急模式 - 当多次加载失败时
					renderEmergencyContent()
				) : (
					// 3. 正常渲染模式
					renderMainContent()
				)}
			</View>
		</ErrorCatcher>
	)
}
