import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { getCurrentWebDAVServer, getDirectoryContents, WebDAVFile } from '@/helpers/webdavService'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { Link, Stack, useRouter } from 'expo-router'
import React, { useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	BackHandler,
	FlatList,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'

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
const FileItem = ({ file, onPress }) => {
	const isDirectory = file.type === 'directory'

	return (
		<TouchableOpacity onPress={() => onPress(file)} style={styles.fileItem}>
			<View style={styles.fileRow}>
				<Feather
					name={isDirectory ? 'folder' : 'file'}
					size={24}
					color={isDirectory ? colors.primary : colors.text}
					style={styles.fileIcon}
				/>
				<View style={styles.fileInfo}>
					<Text style={styles.fileName}>{file.basename}</Text>
					<Text style={styles.fileDetails}>
						{isDirectory ? '文件夹' : formatBytes(file.size || 0)} • {formatDate(file.lastmod)}
					</Text>
				</View>
			</View>
		</TouchableOpacity>
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

	// 处理文件/目录点击
	const handleFilePress = (file) => {
		if (file.type === 'directory') {
			// 保存当前路径到历史
			setPathHistory([...pathHistory, currentPath])
			// 设置新路径
			setCurrentPath(file.path)
			// 加载新目录
			loadFiles(file.path)
		} else {
			// 处理文件点击
			Alert.alert(
				'文件信息',
				`文件名: ${file.basename}\n大小: ${formatBytes(file.size || 0)}\n类型: ${file.mime || '未知'}\n修改时间: ${formatDate(file.lastmod)}`,
				[{ text: '确定', style: 'cancel' }],
			)
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

	return (
		<>
			<Stack.Screen
				options={{
					title: '文件浏览',
					headerLeft: () => (
						<TouchableOpacity
							onPress={() => {
								cleanup() // 确保在返回前取消所有请求
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

				{/* 错误状态 */}
				{error ? (
					<View style={styles.centerContainer}>
						<Feather name="alert-triangle" size={48} color="red" />
						<Text style={styles.errorText}>{error}</Text>
						<TouchableOpacity onPress={handleRefresh} style={styles.button}>
							<Text style={styles.buttonText}>重试</Text>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={handleReset}
							style={[
								styles.button,
								{ marginTop: 10, backgroundColor: colors.secondary || '#555' },
							]}
						>
							<Text style={styles.buttonText}>重置</Text>
						</TouchableOpacity>

						<Link href="/webdavModal" asChild>
							<TouchableOpacity style={[styles.button, { marginTop: 10 }]}>
								<Text style={styles.buttonText}>WebDAV设置</Text>
							</TouchableOpacity>
						</Link>

						<TouchableOpacity
							onPress={() => router.back()}
							style={[
								styles.button,
								{
									marginTop: 10,
									backgroundColor: 'transparent',
									borderWidth: 1,
									borderColor: colors.border || '#333',
								},
							]}
						>
							<Text style={{ color: colors.text }}>返回选择</Text>
						</TouchableOpacity>
					</View>
				) : isLoading ? (
					// 加载状态
					<View style={styles.centerContainer}>
						<ActivityIndicator size="large" color={colors.primary} />
						<Text style={styles.loadingText}>加载中...</Text>
						<TouchableOpacity
							onPress={() => {
								cleanup()
								setIsLoading(false)
								setError('用户取消了加载')
							}}
							style={[
								styles.button,
								{
									marginTop: 12,
									backgroundColor: 'transparent',
									borderWidth: 1,
									borderColor: colors.border || '#333',
								},
							]}
						>
							<Text style={{ color: colors.text }}>取消</Text>
						</TouchableOpacity>
					</View>
				) : files.length === 0 ? (
					// 空目录状态
					<View style={styles.centerContainer}>
						<Feather name="folder" size={48} color={colors.textMuted} />
						<Text style={styles.emptyText}>文件夹为空</Text>
						<View style={{ flexDirection: 'row', marginTop: 16 }}>
							<TouchableOpacity
								onPress={handleRefresh}
								style={[styles.button, { marginRight: 10 }]}
							>
								<Text style={styles.buttonText}>刷新</Text>
							</TouchableOpacity>
							{pathHistory.length > 0 && (
								<TouchableOpacity
									onPress={handleBack}
									style={[styles.button, { backgroundColor: colors.secondary || '#555' }]}
								>
									<Text style={styles.buttonText}>返回上级</Text>
								</TouchableOpacity>
							)}
						</View>
					</View>
				) : (
					// 文件列表
					<FlatList
						data={files}
						renderItem={({ item }) => <FileItem file={item} onPress={handleFilePress} />}
						keyExtractor={(item) =>
							item.path + (item.etag || item.lastmod || Math.random().toString())
						}
						contentContainerStyle={styles.listContent}
						initialNumToRender={10}
						maxToRenderPerBatch={10}
						windowSize={5}
						onRefresh={handleRefresh}
						refreshing={isLoading}
						ListEmptyComponent={() => (
							<View style={styles.centerContainer}>
								<Text style={styles.emptyText}>没有文件</Text>
							</View>
						)}
					/>
				)}
			</View>
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
})
