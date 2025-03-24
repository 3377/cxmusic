import { getStorage, setStorage } from '@/helpers/storage'
import { GlobalState } from '@/utils/stateMapper'
import { useEffect, useState } from 'react'
import { AuthType, createClient, WebDAVClient } from 'webdav'
import { logError, logInfo } from './logger'

// WebDAV服务器存储
export const webdavServersStore = new GlobalState<WebDAVServer[]>([])

// WebDAV服务器类型
export interface WebDAVServer {
	id: string
	name: string
	url: string
	username: string
	password: string
	isDefault?: boolean
}

// WebDAV中的文件类型
export interface WebDAVFile {
	filename: string
	basename: string
	lastmod: string
	size: number
	type: 'file' | 'directory'
	mime?: string
	etag?: string
	path: string
}

// WebDAV音乐文件
export interface WebDAVMusicFile extends WebDAVFile {
	url?: string
	duration?: number
}

let webdavClient: WebDAVClient | null = null
let currentServer: WebDAVServer | null = null

/**
 * 初始化WebDAV服务
 */
export async function setupWebDAV() {
	try {
		// 确保webdavClient初始状态为null
		webdavClient = null
		currentServer = null

		// 从存储中加载服务器列表
		const savedServers =
			(await getStorage('webdav-servers').catch((err) => {
				logError('加载WebDAV服务器列表失败:', err)
				return []
			})) || []

		if (savedServers && Array.isArray(savedServers)) {
			// 安全地设置服务器列表
			try {
				webdavServersStore.setValue(savedServers)
			} catch (err) {
				logError('设置WebDAV服务器列表失败:', err)
				webdavServersStore.setValue([])
			}

			// 如果有默认服务器，则连接到它
			try {
				const defaultServer = savedServers.find((server) => server.isDefault)
				if (defaultServer) {
					// 防止此处连接失败影响整个初始化过程
					try {
						await connectToServer(defaultServer).catch((err) => {
							logError('连接默认WebDAV服务器失败:', err)
							// 连接失败时确保客户端状态正确
							webdavClient = null
							currentServer = null
						})
					} catch (connErr) {
						logError('连接默认服务器时发生异常:', connErr)
						// 确保客户端状态正确
						webdavClient = null
						currentServer = null
					}
				}
			} catch (connErr) {
				logError('查找或连接默认服务器失败:', connErr)
				// 连接失败不终止初始化过程，但确保状态正确
				webdavClient = null
				currentServer = null
			}
		} else {
			// 确保存储值是有效的数组
			webdavServersStore.setValue([])
		}

		logInfo('WebDAV服务初始化完成')
	} catch (error) {
		logError('WebDAV服务初始化失败:', error)
		// 初始化失败，设置为安全的默认值
		try {
			webdavServersStore.setValue([])
		} catch (e) {
			logError('重置WebDAV服务器列表失败:', e)
		}
		webdavClient = null
		currentServer = null
	}
}

/**
 * 连接到WebDAV服务器
 * @param server WebDAV服务器配置
 */
export async function connectToServer(server: WebDAVServer): Promise<boolean> {
	// 首先重置客户端状态
	webdavClient = null
	currentServer = null

	if (!server || !server.url) {
		logError('无效的WebDAV服务器配置')
		return false
	}

	try {
		// 尝试创建WebDAV客户端
		try {
			webdavClient = createClient(server.url, {
				authType: AuthType.Password,
				username: server.username || '',
				password: server.password || '',
			})
		} catch (error) {
			logError(`创建WebDAV客户端失败: ${server.name}`, error)
			webdavClient = null
			return false
		}

		if (!webdavClient) {
			logError(`WebDAV客户端创建失败: ${server.name}`)
			return false
		}

		// 测试连接，使用更安全的尝试方式
		let isConnected = false
		try {
			// 设置超时，防止长时间卡死
			const connectPromise = webdavClient.exists('/')
			const timeoutPromise = new Promise((_, reject) =>
				setTimeout(() => reject(new Error('连接超时')), 10000),
			)

			isConnected = (await Promise.race([connectPromise, timeoutPromise])) as boolean
		} catch (error) {
			logError(`WebDAV连接测试失败: ${server.name}`, error)
			webdavClient = null
			return false
		}

		if (isConnected) {
			currentServer = { ...server } // 使用深拷贝防止引用问题
			logInfo(`已连接到WebDAV服务器: ${server.name}`)
			return true
		} else {
			webdavClient = null
			logError(`无法连接到WebDAV服务器: ${server.name}`)
			return false
		}
	} catch (error) {
		webdavClient = null
		currentServer = null
		logError(`连接到WebDAV服务器失败: ${server.name}`, error)
		return false
	}
}

/**
 * 添加WebDAV服务器
 * @param server WebDAV服务器配置
 */
export async function addWebDAVServer(server: WebDAVServer): Promise<boolean> {
	try {
		const servers = webdavServersStore.getValue() || []

		// 生成唯一ID
		if (!server.id) {
			server.id = Date.now().toString()
		}

		// 如果是第一个添加的服务器，设为默认
		if (servers.length === 0) {
			server.isDefault = true
		}

		// 如果设置为默认，取消其他服务器的默认状态
		if (server.isDefault) {
			servers.forEach((s) => {
				if (s.id !== server.id) {
					s.isDefault = false
				}
			})
		}

		// 检查是否可以连接
		const testClient = createClient(server.url, {
			authType: AuthType.Password,
			username: server.username,
			password: server.password,
		})

		const isConnected = await testClient.exists('/')
		if (!isConnected) {
			return false
		}

		// 如果已存在相同ID的服务器，则更新它
		const existingIndex = servers.findIndex((s) => s.id === server.id)
		if (existingIndex >= 0) {
			servers[existingIndex] = server
		} else {
			servers.push(server)
		}

		webdavServersStore.setValue([...servers])
		await setStorage('webdav-servers', servers)

		// 如果是默认服务器，连接到它
		if (server.isDefault) {
			await connectToServer(server)
		}

		return true
	} catch (error) {
		logError('添加WebDAV服务器失败:', error)
		return false
	}
}

/**
 * 删除WebDAV服务器
 * @param serverId 服务器ID
 */
export async function deleteWebDAVServer(serverId: string): Promise<boolean> {
	try {
		const servers = webdavServersStore.getValue() || []
		const serverIndex = servers.findIndex((s) => s.id === serverId)

		if (serverIndex < 0) {
			return false
		}

		const isDefault = servers[serverIndex].isDefault

		// 删除服务器
		servers.splice(serverIndex, 1)

		// 如果删除的是默认服务器，设置新的默认服务器
		if (isDefault && servers.length > 0) {
			servers[0].isDefault = true
			// 如果当前连接的是被删除的服务器，连接到新的默认服务器
			if (currentServer?.id === serverId) {
				await connectToServer(servers[0])
			}
		} else if (servers.length === 0) {
			// 如果没有服务器了，清除当前客户端
			webdavClient = null
			currentServer = null
		}

		webdavServersStore.setValue([...servers])
		await setStorage('webdav-servers', servers)

		return true
	} catch (error) {
		logError('删除WebDAV服务器失败:', error)
		return false
	}
}

/**
 * 设置默认WebDAV服务器
 * @param serverId 服务器ID
 */
export async function setDefaultWebDAVServer(serverId: string): Promise<boolean> {
	try {
		const servers = webdavServersStore.getValue() || []
		const serverToSetDefault = servers.find((s) => s.id === serverId)

		if (!serverToSetDefault) {
			return false
		}

		// 更新默认状态
		servers.forEach((s) => {
			s.isDefault = s.id === serverId
		})

		webdavServersStore.setValue([...servers])
		await setStorage('webdav-servers', servers)

		// 连接到新的默认服务器
		await connectToServer(serverToSetDefault)

		return true
	} catch (error) {
		logError('设置默认WebDAV服务器失败:', error)
		return false
	}
}

/**
 * 获取WebDAV目录内容
 * @param path 服务器上的路径，默认为根目录
 * @param options 选项
 */
export async function getDirectoryContents(
	path: string = '/',
	options: { onlyMusic?: boolean } = {},
): Promise<WebDAVFile[]> {
	if (!webdavClient || !currentServer) {
		throw new Error('WebDAV客户端未连接')
	}

	try {
		const contents = await webdavClient.getDirectoryContents(path)

		// 过滤并转换结果
		return contents
			.filter((item) => {
				if (options.onlyMusic) {
					// 如果只要音乐文件，过滤出音频文件和目录
					return (
						item.type === 'directory' ||
						(item.mime && item.mime.startsWith('audio/')) ||
						/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(item.basename)
					)
				}
				return true
			})
			.map((item) => ({
				filename: item.filename,
				basename: item.basename,
				lastmod: item.lastmod,
				size: item.size,
				type: item.type,
				mime: item.mime,
				etag: item.etag,
				path: path === '/' ? `/${item.basename}` : `${path}/${item.basename}`,
			}))
	} catch (error) {
		logError(`获取WebDAV目录内容失败 (${path}):`, error)
		throw error
	}
}

/**
 * 获取WebDAV文件URL
 * @param filePath 文件路径
 */
export function getFileUrl(filePath: string): string {
	if (!webdavClient || !currentServer) {
		throw new Error('WebDAV客户端未连接')
	}

	try {
		// 确保filePath是有效的
		if (!filePath) {
			throw new Error('无效的文件路径')
		}

		// 确保URL是有效的
		let serverUrl = currentServer.url
		if (!serverUrl.endsWith('/')) {
			serverUrl += '/'
		}

		// 移除filePath开头的斜杠以避免重复
		const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath

		// 构建基本URL
		let fullUrl = `${serverUrl}${cleanPath}`

		// 如果URL包含认证信息，不要重复添加
		if (!fullUrl.includes('@')) {
			// 使用URL对象解析URL
			try {
				const url = new URL(fullUrl)

				// 添加基本认证
				if (currentServer.username && currentServer.password) {
					try {
						// 使用先编码用户名和密码以避免特殊字符问题
						const encodedUsername = encodeURIComponent(currentServer.username || '')
						const encodedPassword = encodeURIComponent(currentServer.password || '')
						url.username = encodedUsername
						url.password = encodedPassword
						fullUrl = url.toString()
					} catch (err) {
						// 如果无法设置用户名和密码，回退到原始URL
						logError('设置URL用户名密码失败:', err)
					}
				}
			} catch (e) {
				// URL解析失败，回退到简单的字符串拼接
				logError('URL解析失败，使用简单拼接:', e)
				if (currentServer.username && currentServer.password) {
					try {
						const urlParts = fullUrl.split('://')
						if (urlParts.length === 2) {
							const encodedUsername = encodeURIComponent(currentServer.username || '')
							const encodedPassword = encodeURIComponent(currentServer.password || '')
							fullUrl = `${urlParts[0]}://${encodedUsername}:${encodedPassword}@${urlParts[1]}`
						}
					} catch (err) {
						// 如果拼接失败，回退到原始URL
						logError('拼接URL失败:', err)
					}
				}
			}
		}

		return fullUrl
	} catch (error) {
		logError('构建WebDAV文件URL失败:', error)
		// 返回一个安全的默认值，而不是抛出异常
		return `${currentServer.url || ''}/${filePath || ''}`
	}
}

/**
 * 将WebDAV音乐文件转换为应用可用的音乐项
 * @param file WebDAV文件
 */
export function webdavFileToMusicItem(file: WebDAVFile): IMusic.IMusicItem {
	if (!currentServer) {
		throw new Error('WebDAV客户端未连接')
	}

	try {
		// 确保文件对象有效
		if (!file || !file.path) {
			throw new Error('无效的文件对象')
		}

		// 提取音乐文件的文件名作为歌曲名
		const title = file.basename ? file.basename.replace(/\.[^/.]+$/, '') : '未知歌曲' // 去除扩展名

		// 获取文件URL（包含错误处理）
		let fileUrl = ''
		try {
			fileUrl = getFileUrl(file.path)
		} catch (e) {
			logError('获取文件URL失败，使用原始路径:', e)
			fileUrl = file.path
		}

		// 创建认证头信息
		let authHeaders = {}
		try {
			if (currentServer.username && currentServer.password) {
				// 确保用户名和密码非空
				const username = currentServer.username || ''
				const password = currentServer.password || ''
				const authString = `${username}:${password}`

				// 安全地创建base64字符串
				try {
					const base64Auth = Buffer.from(authString).toString('base64')
					authHeaders = {
						Authorization: `Basic ${base64Auth}`,
					}
				} catch (error) {
					logError('创建base64认证字符串失败:', error)
				}
			}
		} catch (e) {
			logError('创建认证头失败:', e)
		}

		// 安全地创建ID
		let id = ''
		try {
			id = `webdav-${currentServer.id}-${file.path}`
		} catch (e) {
			id = `webdav-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
			logError('创建音乐项ID失败，使用随机ID:', e)
		}

		// 创建音乐项
		return {
			id: id,
			platform: 'webdav',
			artist: currentServer.name || '未知艺术家', // 使用服务器名称作为艺术家名
			title: title,
			duration: 0, // 由于WebDAV不提供音频时长，设为0
			album: '未知专辑',
			artwork: '', // 默认无封面
			url: fileUrl,
			source: {
				'128k': {
					url: fileUrl,
					headers: authHeaders,
					size: file.size || 0,
				},
			},
			// 保存原始文件信息，以便后续处理
			webdav: {
				serverId: currentServer.id || '',
				serverName: currentServer.name || '',
				path: file.path || '',
				size: file.size || 0,
				mime: file.mime || '',
			},
		}
	} catch (error) {
		logError('创建WebDAV音乐项失败:', error)

		// 即使出错，也返回一个最小可用的音乐项
		return {
			id: `webdav-error-${Date.now()}`,
			platform: 'webdav',
			artist: '加载失败',
			title: file?.basename || '无法加载文件',
			duration: 0,
			album: '未知专辑',
			artwork: '',
			url: '',
			source: {
				'128k': {
					url: '',
					headers: {},
					size: 0,
				},
			},
		}
	}
}

/**
 * 获取目录中的所有音乐文件（包括子目录）
 * @param path 目录路径
 * @param recursive 是否递归获取子目录
 */
export async function getAllMusicFiles(
	path: string = '/',
	recursive: boolean = false,
): Promise<WebDAVMusicFile[]> {
	if (!webdavClient || !currentServer) {
		throw new Error('WebDAV客户端未连接')
	}

	const musicFiles: WebDAVMusicFile[] = []

	try {
		const contents = await getDirectoryContents(path)

		// 处理当前目录中的音乐文件
		const audioFiles = contents.filter(
			(item) =>
				item.type === 'file' &&
				((item.mime && item.mime.startsWith('audio/')) ||
					/\.(mp3|flac|wav|ogg|m4a|aac)$/i.test(item.basename)),
		)

		musicFiles.push(
			...audioFiles.map((file) => ({
				...file,
				url: getFileUrl(file.path),
			})),
		)

		// 如果需要递归，处理子目录
		if (recursive) {
			const directories = contents.filter((item) => item.type === 'directory')

			for (const dir of directories) {
				const subDirFiles = await getAllMusicFiles(dir.path, true)
				musicFiles.push(...subDirFiles)
			}
		}

		return musicFiles
	} catch (error) {
		logError(`获取WebDAV音乐文件失败 (${path}):`, error)
		throw error
	}
}

/**
 * 转换WebDAV音乐文件为应用可用的音乐列表
 * @param files WebDAV音乐文件列表
 */
export function webdavFilesToMusicItems(files: WebDAVMusicFile[]): IMusic.IMusicItem[] {
	return files.map((file) => webdavFileToMusicItem(file))
}

/**
 * 钩子函数：使用WebDAV服务器列表
 */
export function useWebDAVServers() {
	return webdavServersStore.useValue()
}

/**
 * 获取当前连接的WebDAV服务器
 */
export function getCurrentWebDAVServer() {
	return currentServer
}

/**
 * 钩子函数：获取当前连接的WebDAV服务器
 */
export function useCurrentWebDAVServer() {
	const [server, setServer] = useState<WebDAVServer | null>(null)

	useEffect(() => {
		let isMounted = true

		// 安全地获取当前服务器状态
		try {
			if (isMounted) {
				setServer(currentServer ? { ...currentServer } : null)
			}
		} catch (error) {
			logError('获取当前WebDAV服务器状态失败:', error)
			if (isMounted) {
				setServer(null)
			}
		}

		// 创建更新函数
		const updateServer = () => {
			try {
				if (isMounted) {
					setServer(currentServer ? { ...currentServer } : null)
				}
			} catch (error) {
				logError('更新WebDAV服务器状态失败:', error)
				if (isMounted) {
					setServer(null)
				}
			}
		}

		// 添加监听
		try {
			webdavServersStore.subscribe(updateServer)
		} catch (error) {
			logError('订阅WebDAV服务器状态更新失败:', error)
		}

		// 清理函数
		return () => {
			isMounted = false
			try {
				webdavServersStore.unsubscribe(updateServer)
			} catch (error) {
				logError('取消订阅WebDAV服务器状态更新失败:', error)
			}
		}
	}, [])

	return server
}

// 添加额外的错误捕获和连接检查函数
export const verifyWebDAVConnection = async (server: WebDAVServer): Promise<boolean> => {
	try {
		if (!server || !server.url) {
			logError('无效的WebDAV服务器配置')
			return false
		}

		const client = createClient(server.url, {
			username: server.username || '',
			password: server.password || '',
		})

		if (!client) {
			logError('无法创建WebDAV客户端')
			return false
		}

		// 尝试连接 - 获取根目录内容
		await client.getDirectoryContents('/')
		logInfo('WebDAV连接验证成功:', server.name)
		return true
	} catch (error) {
		logError('WebDAV连接验证失败:', error)
		return false
	}
}

// 增强setupWebDAV函数中的错误处理
export const setupWebDAV = async (): Promise<void> => {
	try {
		// 清除任何先前的状态，确保不会使用旧的无效数据
		webdavServersStore.setState({
			servers: [],
			currentServer: null,
			client: null,
		})

		// 获取存储的服务器列表
		const serversString = await getStorage('webdav-servers')
		let servers: WebDAVServer[] = []

		if (serversString) {
			try {
				servers = JSON.parse(serversString)
				logInfo(`已从存储中加载 ${servers.length} 个WebDAV服务器`)
			} catch (parseError) {
				logError('解析WebDAV服务器列表失败:', parseError)
				// 如果无法解析，使用空数组
				servers = []
			}
		}

		// 初始化状态
		webdavServersStore.setState({ servers })

		// 如果有服务器，选择第一个作为当前服务器
		if (servers.length > 0) {
			try {
				const defaultServer = servers[0]
				logInfo('尝试连接到默认WebDAV服务器:', defaultServer.name)

				// 在连接前验证服务器配置
				if (!defaultServer.url) {
					throw new Error('服务器URL未定义')
				}

				const isValid = await verifyWebDAVConnection(defaultServer)
				if (!isValid) {
					throw new Error('服务器连接验证失败')
				}

				// 创建客户端
				const client = createClient(defaultServer.url, {
					username: defaultServer.username || '',
					password: defaultServer.password || '',
				})

				// 更新状态
				webdavServersStore.setState({
					currentServer: defaultServer,
					client,
				})

				logInfo('WebDAV初始化完成，默认服务器已连接:', defaultServer.name)
			} catch (error) {
				logError('连接默认WebDAV服务器失败:', error)
				// 初始化失败时重置状态
				webdavServersStore.setState({
					currentServer: null,
					client: null,
				})
			}
		} else {
			logInfo('没有找到WebDAV服务器配置')
		}
	} catch (error) {
		logError('WebDAV初始化失败:', error)
		// 重置状态确保应用不会使用无效数据
		webdavServersStore.setState({
			servers: [],
			currentServer: null,
			client: null,
		})
	}
}

// 增强获取文件URL的函数
export const getFileUrl = (file: WebDAVFile): string => {
	try {
		if (!file || !file.filename) {
			throw new Error('文件信息无效')
		}

		const currentServer = getCurrentWebDAVServer()
		if (!currentServer) {
			throw new Error('未连接WebDAV服务器')
		}

		// 组合URL时确保路径正确
		let baseUrl = currentServer.url || ''
		if (!baseUrl.endsWith('/')) {
			baseUrl += '/'
		}

		// 规范化文件路径
		let filePath = file.filename
		while (filePath.startsWith('/')) {
			filePath = filePath.substring(1)
		}

		// 构建完整URL
		const fileUrl = `${baseUrl}${filePath}`

		// 如果需要授权头信息
		if (currentServer.username && currentServer.password) {
			const authHeader = `Basic ${btoa(`${currentServer.username}:${currentServer.password}`)}`
			return fileUrl + `?auth=${encodeURIComponent(authHeader)}`
		}

		return fileUrl
	} catch (error) {
		logError('构建WebDAV文件URL失败:', error)
		// 返回安全的替代URL
		return 'error://invalid-file-url'
	}
}

// 增强播放项目创建函数
export const webdavFileToMusicItem = (file: WebDAVFile): MusicItem => {
	try {
		if (!file) {
			throw new Error('文件对象为空')
		}

		const currentServer = getCurrentWebDAVServer()
		if (!currentServer) {
			throw new Error('未连接WebDAV服务器')
		}

		// 安全地创建ID
		const id = `webdav-${currentServer.name}-${file.filename}`.replace(/[^a-zA-Z0-9-]/g, '-')

		// 从文件名中获取标题
		let title = file.basename || '未知文件'

		// 如果有扩展名，移除扩展名以获取歌曲标题
		const lastDotIndex = title.lastIndexOf('.')
		if (lastDotIndex > 0) {
			title = title.substring(0, lastDotIndex)
		}

		// 构建基本的音乐项目
		const musicItem: MusicItem = {
			id,
			title,
			artist: '未知艺术家',
			album: '未知专辑',
			artwork: '', // 没有专辑封面
			url: getFileUrl(file),
			duration: 0, // 未知时长
			isLocal: false,
			fromWebDAV: true,
		}

		// 如果文件有额外的音乐元数据，可以在这里添加

		return musicItem
	} catch (error) {
		logError('创建WebDAV音乐项目失败:', error)
		// 返回最小化的音乐项目以避免崩溃
		return {
			id: `error-item-${Date.now()}`,
			title: file?.basename || '错误的文件',
			artist: '未知',
			album: '未知',
			artwork: '',
			url: 'about:blank',
			duration: 0,
			isLocal: false,
			fromWebDAV: true,
		}
	}
}
