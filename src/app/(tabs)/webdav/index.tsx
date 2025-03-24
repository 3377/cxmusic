import { logError, logInfo } from '@/helpers/logger'
import { getCurrentWebDAVServer, webdavFileToMusicItem } from '@/helpers/webdavService'
import { usePlayer } from '@/hooks/usePlayer'
import { useTheme } from '@/hooks/useTheme'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, Text, TouchableOpacity, View } from 'react-native'
import { TouchableRipple } from 'react-native-paper'
import { WebDAVClient } from 'webdav'

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
	const theme = useTheme()
	const isDirectory = file.type === 'directory'

	return (
		<TouchableRipple
			onPress={() => onPress(file)}
			onLongPress={() => onLongPress(file)}
			style={{
				paddingVertical: 12,
				paddingHorizontal: 16,
				borderBottomWidth: 1,
				borderBottomColor: theme.colors.border,
			}}
		>
			<View style={{ flexDirection: 'row', alignItems: 'center' }}>
				<Feather
					name={isDirectory ? 'folder' : 'file'}
					size={24}
					color={isDirectory ? theme.colors.primary : theme.colors.text}
					style={{ marginRight: 12 }}
				/>
				<View style={{ flex: 1 }}>
					<Text style={{ color: theme.colors.text, fontSize: 16 }}>{file.basename}</Text>
					<Text style={{ color: theme.colors.textSecondary, fontSize: 12 }}>
						{isDirectory ? '文件夹' : formatBytes(file.size || 0)} • {formatDate(file.lastmod)}
					</Text>
				</View>
			</View>
		</TouchableRipple>
	)
}

// 加载中占位符组件
function LoadingPlaceholder() {
	const theme = useTheme()
	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<ActivityIndicator size="large" color={theme.colors.primary} />
			<Text style={{ marginTop: 16, color: theme.colors.text }}>正在加载文件...</Text>
		</View>
	)
}

// 空内容组件
function EmptyContent({ onRefresh }) {
	const theme = useTheme()
	return (
		<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
			<Feather name="inbox" size={48} color={theme.colors.textSecondary} />
			<Text style={{ marginTop: 16, color: theme.colors.text, fontSize: 16 }}>文件夹为空</Text>
			<TouchableRipple
				onPress={onRefresh}
				style={{
					marginTop: 16,
					backgroundColor: theme.colors.primary,
					padding: 12,
					borderRadius: 8,
				}}
			>
				<Text style={{ color: theme.colors.onPrimary }}>刷新</Text>
			</TouchableRipple>
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
		const theme = useTheme()
		if (this.state.hasError) {
			return (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
					<Feather name="alert-triangle" size={48} color={theme.colors.error} />
					<Text
						style={{ marginTop: 16, color: theme.colors.text, textAlign: 'center', fontSize: 16 }}
					>
						WebDAV页面加载失败
					</Text>
					<Text style={{ marginTop: 8, color: theme.colors.textSecondary, textAlign: 'center' }}>
						{this.state.error?.message || '未知错误'}
					</Text>
					<TouchableRipple
						onPress={this.retry}
						style={{
							marginTop: 16,
							backgroundColor: theme.colors.primary,
							padding: 12,
							borderRadius: 8,
						}}
					>
						<Text style={{ color: theme.colors.onPrimary }}>重试</Text>
					</TouchableRipple>
				</View>
			)
		}

		return this.props.children
	}
}

export default function WebDavScreen() {
	const router = useRouter()
	const player = usePlayer()
	const theme = useTheme()

	const [currentPath, setCurrentPath] = useState('/')
	const [files, setFiles] = useState([])
	const [isLoading, setIsLoading] = useState(true)
	const [error, setError] = useState(null)
	const [client, setClient] = useState<WebDAVClient | null>(null)
	const [refreshKey, setRefreshKey] = useState(0) // 用于强制刷新

	// 加载当前目录的文件
	const loadFiles = useCallback(async (path = '/') => {
		try {
			setIsLoading(true)
			setError(null)

			const currentServer = getCurrentWebDAVServer()
			if (!currentServer || !currentServer.client) {
				throw new Error('WebDAV客户端未初始化')
			}

			setClient(currentServer.client)
			logInfo('正在加载WebDAV文件列表，路径:', path)

			const contents = await currentServer.client.getDirectoryContents(path)
			if (Array.isArray(contents)) {
				// 对文件进行排序：文件夹在前，文件在后，同类型按名称排序
				const sortedContents = [...contents].sort((a, b) => {
					if (a.type === 'directory' && b.type !== 'directory') return -1
					if (a.type !== 'directory' && b.type === 'directory') return 1
					return a.basename.localeCompare(b.basename)
				})

				setFiles(sortedContents)
				logInfo(`WebDAV文件加载完成，找到 ${sortedContents.length} 个项目`)
			} else {
				setFiles([])
				logInfo('WebDAV路径为空或返回了意外格式')
			}
		} catch (err) {
			logError('加载WebDAV文件失败:', err)
			setError(err.message || '加载文件失败')
			setFiles([])
		} finally {
			setIsLoading(false)
		}
	}, [])

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
							player.playMusic(musicItem)
						}
					} else {
						logInfo('不支持播放的文件类型:', extension)
						// 显示提示
						alert(`暂不支持播放 ${extension} 类型的文件`)
					}
				}
			} catch (err) {
				logError('处理文件点击失败:', err)
				setError(err.message || '处理文件操作失败')
			}
		},
		[currentPath, loadFiles, player],
	)

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
	}, [loadFiles])

	// 渲染页面
	return (
		<ErrorCatcher onRetry={refreshFiles}>
			<View style={{ flex: 1, backgroundColor: theme.colors.background }}>
				{/* 路径显示和导航 */}
				<View
					style={{
						flexDirection: 'row',
						alignItems: 'center',
						padding: 16,
						borderBottomWidth: 1,
						borderBottomColor: theme.colors.border,
					}}
				>
					{currentPath !== '/' && (
						<TouchableOpacity onPress={handleGoBack} style={{ marginRight: 8 }}>
							<Feather name="arrow-left" size={20} color={theme.colors.primary} />
						</TouchableOpacity>
					)}
					<Text style={{ flex: 1, color: theme.colors.text }}>
						{currentPath === '/' ? '根目录' : currentPath}
					</Text>
					<TouchableOpacity onPress={refreshFiles}>
						<Feather name="refresh-cw" size={20} color={theme.colors.primary} />
					</TouchableOpacity>
				</View>

				{/* 文件列表 */}
				{isLoading ? (
					<LoadingPlaceholder />
				) : error ? (
					<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
						<Feather name="alert-circle" size={48} color={theme.colors.error} />
						<Text style={{ marginTop: 16, color: theme.colors.text, textAlign: 'center' }}>
							{error}
						</Text>
						<TouchableRipple
							onPress={refreshFiles}
							style={{
								marginTop: 16,
								backgroundColor: theme.colors.primary,
								padding: 12,
								borderRadius: 8,
							}}
						>
							<Text style={{ color: theme.colors.onPrimary }}>重试</Text>
						</TouchableRipple>
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
								onLongPress={() => {}} // 长按功能可以添加更多操作
							/>
						)}
					/>
				)}
			</View>
		</ErrorCatcher>
	)
}
