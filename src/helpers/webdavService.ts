import { GlobalState } from '@/utils/stateMapper'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useEffect, useState } from 'react'
import { createClient, WebDAVClient, WebDAVClientOptions } from 'webdav'
import { logError, logInfo } from './logger'

// WebDAV服务器存储
export const webdavServersStore = new GlobalState<WebDAVServer[]>([])

// WebDAV服务器类型
export interface WebDAVServer {
	id: string
	name: string
	url: string
	username?: string
	password?: string
	client?: WebDAVClient
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

// 在类型定义区域进行补充，确保自定义类型与项目兼容
// 注意：我们需要确保下面的类型定义与现有项目兼容
// 添加一个MusicItem类型定义以匹配webdavFileToMusicItem函数使用
// 这部分只需在旧代码不符合新类型的情况下添加
export interface MusicItem {
	id: string
	title: string
	artist: string
	album: string
	artwork: string
	url: string
	duration: number
	isLocal: boolean
	fromWebDAV?: boolean
}

// 存储键名
const WEBDAV_SERVERS_KEY = 'webdav_servers'
const CURRENT_WEBDAV_SERVER_KEY = 'current_webdav_server'

// 创建一个简单的状态订阅系统
type Subscriber = () => void
const subscribers: Subscriber[] = []

/**
 * 订阅WebDAV状态变更
 * @param callback 状态变更时的回调函数
 * @returns 取消订阅的函数
 */
export function subscribeToWebDAVStatus(callback: Subscriber): () => void {
	subscribers.push(callback)
	return () => {
		const index = subscribers.indexOf(callback)
		if (index !== -1) {
			subscribers.splice(index, 1)
		}
	}
}

/**
 * 通知所有订阅者状态已更新
 */
function notifySubscribers(): void {
	subscribers.forEach((callback) => {
		try {
			callback()
		} catch (error) {
			logError('调用WebDAV状态订阅者回调失败:', error)
		}
	})
}

// 保存WebDAV服务器列表到存储
async function saveWebDAVServers(): Promise<void> {
	try {
		await AsyncStorage.setItem(WEBDAV_SERVERS_KEY, JSON.stringify(servers))
		logInfo('WebDAV服务器列表已保存')
	} catch (error) {
		logError('保存WebDAV服务器列表失败:', error)
	}
}

let webdavClient: WebDAVClient | null = null
let currentServer: WebDAVServer | null = null
let servers: WebDAVServer[] = []

/**
 * 初始化WebDAV服务
 */
export async function setupWebDAV(): Promise<void> {
	try {
		logInfo('开始初始化WebDAV服务...')

		// 初始化连接状态
		webdavClient = null
		currentServer = null

		// 尝试加载服务器列表
		try {
			const serversJson = await AsyncStorage.getItem(WEBDAV_SERVERS_KEY)
			if (serversJson) {
				try {
					servers = JSON.parse(serversJson)
					if (!Array.isArray(servers)) {
						logError('WebDAV服务器数据格式错误，重置为空列表')
						servers = []
					}
					logInfo(`已加载${servers.length}个WebDAV服务器配置`)
				} catch (parseError) {
					logError('解析WebDAV服务器列表JSON失败:', parseError)
					servers = []
				}
			} else {
				logInfo('无保存的WebDAV服务器配置')
				servers = []
			}
		} catch (loadError) {
			logError('加载WebDAV服务器列表失败:', loadError)
			// 即使加载失败，也继续执行，使用空列表
			servers = []
		}

		// 如果有服务器配置，尝试连接到一个可用的服务器
		if (servers.length > 0) {
			try {
				// 尝试获取当前服务器ID
				let currentId: string | null = null
				try {
					currentId = await AsyncStorage.getItem(CURRENT_WEBDAV_SERVER_KEY)
				} catch (currentIdError) {
					logError('加载当前WebDAV服务器ID失败:', currentIdError)
				}

				// 尝试连接到上次使用的服务器
				if (currentId) {
					const server = servers.find((s) => s.id === currentId)
					if (server) {
						try {
							logInfo(`尝试连接到上次使用的WebDAV服务器: ${server.name}`)
							await connectToServer(server)
							logInfo(`成功连接到WebDAV服务器: ${server.name}`)
							notifySubscribers()
							return
						} catch (connectError) {
							logError(`连接到默认WebDAV服务器失败: ${connectError.message || '未知错误'}`)
							// 连接失败，继续尝试其他服务器
						}
					} else {
						logInfo(`未找到ID为${currentId}的WebDAV服务器配置`)
					}
				}

				// 如果没有指定的服务器或连接失败，尝试连接到第一个可用的服务器
				if (servers.length > 0) {
					try {
						logInfo('尝试连接到第一个可用的WebDAV服务器')
						await connectToServer(servers[0])
						logInfo(`成功连接到第一个WebDAV服务器: ${servers[0].name}`)
						notifySubscribers()
						return
					} catch (connectError) {
						logError(`连接到第一个WebDAV服务器失败: ${connectError.message || '未知错误'}`)
						// 所有尝试都失败，但继续执行
					}
				}
			} catch (allFailedError) {
				logError('连接到任何WebDAV服务器都失败:', allFailedError)
			}
		} else {
			logInfo('无可用的WebDAV服务器配置')
		}

		// 即使没有成功连接，也标记为初始化完成
		notifySubscribers()
		logInfo('WebDAV服务初始化完成')
	} catch (error) {
		logError('WebDAV服务初始化失败:', error)
		// 重置状态
		webdavClient = null
		currentServer = null
		// 抛出异常以便上层捕获
		throw error
	}
}

/**
 * 连接到WebDAV服务器
 * @param server 服务器配置
 */
export async function connectToServer(server: WebDAVServer): Promise<void> {
	try {
		if (!server) {
			throw new Error('服务器配置无效')
		}

		if (!server.url) {
			throw new Error('服务器URL未设置')
		}

		logInfo(`正在连接到WebDAV服务器: ${server.name} (${server.url})`)

		// 创建WebDAV客户端配置
		const clientOptions: WebDAVClientOptions = {
			username: server.username || '',
			password: server.password || '',
			maxBodyLength: 1024 * 1024 * 50, // 50MB
			maxContentLength: 1024 * 1024 * 50, // 50MB
		}

		// 创建WebDAV客户端
		const client = createClient(server.url, clientOptions)

		if (!client) {
			throw new Error('WebDAV客户端创建失败')
		}

		// 测试连接 - 尝试获取根目录内容
		try {
			await client.getDirectoryContents('/')
			logInfo('WebDAV服务器连接测试成功')
		} catch (testError) {
			logError('WebDAV服务器连接测试失败:', testError)
			// 添加更具体的错误信息
			let errorMessage = '服务器连接测试失败'

			if (testError.status === 401) {
				errorMessage = '授权失败: 请检查用户名和密码'
			} else if (testError.status === 404) {
				errorMessage = '服务器路径不存在: 请检查URL路径'
			} else if (testError.message && testError.message.includes('ENOTFOUND')) {
				errorMessage = '找不到服务器: 请检查主机名是否正确'
			} else if (testError.message && testError.message.includes('ECONNREFUSED')) {
				errorMessage = '连接被拒绝: 服务器可能未运行或端口被阻止'
			} else if (testError.message && testError.message.includes('certificate')) {
				errorMessage = 'SSL证书错误: 服务器证书无效或不受信任'
			}

			throw new Error(`${errorMessage}: ${testError.message || '未知错误'}`)
		}

		// 设置当前服务器和客户端
		webdavClient = client
		currentServer = {
			...server,
			client,
		}

		// 保存当前服务器ID
		await AsyncStorage.setItem(CURRENT_WEBDAV_SERVER_KEY, server.id)

		// 通知订阅者更新
		notifySubscribers()

		logInfo(`已成功连接到WebDAV服务器: ${server.name}`)
	} catch (error) {
		logError(`连接到WebDAV服务器失败 (${server?.name || '未知'}):`, error)
		throw error // 重新抛出错误以便上层处理
	}
}

/**
 * 获取当前连接的WebDAV服务器
 * @returns 当前连接的WebDAV服务器或null
 */
export function getCurrentWebDAVServer(): WebDAVServer | null {
	return currentServer
}

/**
 * 获取WebDAV服务器列表
 * @returns WebDAV服务器列表
 */
export function getWebDAVServers(): WebDAVServer[] {
	return [...servers] // 返回副本以防止外部修改
}

/**
 * 添加WebDAV服务器
 * @param server 服务器配置
 */
export async function addWebDAVServer(server: Omit<WebDAVServer, 'id'>): Promise<string> {
	try {
		// 创建新服务器配置并添加唯一ID
		const newServer: WebDAVServer = {
			...server,
			id: `webdav_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
		}

		// 添加到服务器列表
		servers.push(newServer)

		// 保存更新
		await saveWebDAVServers()

		// 通知订阅者更新
		notifySubscribers()

		logInfo(`WebDAV服务器已添加: ${newServer.name}`)
		return newServer.id
	} catch (error) {
		logError('添加WebDAV服务器失败:', error)
		throw error
	}
}

/**
 * 更新WebDAV服务器
 * @param id 服务器ID
 * @param updates 更新的服务器配置
 */
export async function updateWebDAVServer(
	id: string,
	updates: Partial<Omit<WebDAVServer, 'id'>>,
): Promise<void> {
	try {
		// 查找服务器
		const index = servers.findIndex((s) => s.id === id)
		if (index === -1) {
			throw new Error(`未找到ID为${id}的WebDAV服务器`)
		}

		// 更新服务器配置
		servers[index] = {
			...servers[index],
			...updates,
		}

		// 保存更新
		await saveWebDAVServers()

		// 如果更新的是当前服务器，重新连接
		if (currentServer?.id === id) {
			try {
				await connectToServer(servers[index])
			} catch (connectError) {
				logError(`重新连接到更新的WebDAV服务器失败: ${connectError.message}`)
				// 连接失败但不抛出异常，让用户可以稍后手动尝试
			}
		}

		// 通知订阅者更新
		notifySubscribers()

		logInfo(`WebDAV服务器已更新: ${servers[index].name}`)
	} catch (error) {
		logError('更新WebDAV服务器失败:', error)
		throw error
	}
}

/**
 * 删除WebDAV服务器
 * @param id 服务器ID
 */
export async function deleteWebDAVServer(id: string): Promise<void> {
	try {
		// 查找服务器
		const index = servers.findIndex((s) => s.id === id)
		if (index === -1) {
			throw new Error(`未找到ID为${id}的WebDAV服务器`)
		}

		// 如果删除的是当前服务器，断开连接
		if (currentServer?.id === id) {
			webdavClient = null
			currentServer = null
			await AsyncStorage.removeItem(CURRENT_WEBDAV_SERVER_KEY)
		}

		// 从列表中删除
		servers.splice(index, 1)

		// 保存更新
		await saveWebDAVServers()

		// 通知订阅者更新
		notifySubscribers()

		logInfo(`WebDAV服务器已删除: ${id}`)
	} catch (error) {
		logError('删除WebDAV服务器失败:', error)
		throw error
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
 * 获取WebDAV文件的URL
 * @param file WebDAV文件对象
 * @returns 文件的完整URL
 */
export function getFileUrl(file: any): string {
	try {
		if (!file || !file.filename) {
			logError('getFileUrl: 无效的文件对象', file)
			return ''
		}

		const currentServer = getCurrentWebDAVServer()
		if (!currentServer) {
			logError('getFileUrl: 无WebDAV服务器配置')
			return ''
		}

		if (!currentServer.url) {
			logError('getFileUrl: WebDAV服务器URL未配置')
			return ''
		}

		// 确保服务器URL以/结尾
		let serverUrl = currentServer.url
		if (!serverUrl.endsWith('/')) {
			serverUrl = serverUrl + '/'
		}

		// 处理文件路径，确保它不以/开头
		let filePath = file.filename
		if (filePath.startsWith('/')) {
			filePath = filePath.substring(1)
		}

		// 构建完整URL
		let fullUrl = serverUrl + filePath

		// 添加身份验证信息（如果有）
		if (currentServer.username && currentServer.password) {
			try {
				const url = new URL(fullUrl)
				const encodedUsername = encodeURIComponent(currentServer.username)
				const encodedPassword = encodeURIComponent(currentServer.password)
				url.username = encodedUsername
				url.password = encodedPassword
				fullUrl = url.toString()
			} catch (urlError) {
				logError('getFileUrl: URL构建错误', urlError)
				// 在URL解析失败的情况下，尝试手动构建带认证的URL
				const urlParts = fullUrl.split('://')
				if (urlParts.length === 2) {
					const encodedUsername = encodeURIComponent(currentServer.username)
					const encodedPassword = encodeURIComponent(currentServer.password)
					fullUrl = `${urlParts[0]}://${encodedUsername}:${encodedPassword}@${urlParts[1]}`
				}
			}
		}

		logInfo('WebDAV文件URL:', fullUrl)
		return fullUrl
	} catch (error) {
		logError('getFileUrl: 生成文件URL时出错', error)
		return ''
	}
}

/**
 * 将WebDAV文件转换为音乐项目
 * @param file WebDAV文件
 * @returns 音乐项目对象
 */
export function webdavFileToMusicItem(file: any): any {
	try {
		if (!file || !file.filename) {
			logError('webdavFileToMusicItem: 无效的文件对象', file)
			return null
		}

		const currentServer = getCurrentWebDAVServer()
		if (!currentServer) {
			logError('webdavFileToMusicItem: 无WebDAV服务器配置')
			return null
		}

		// 从文件名提取艺术家和标题
		let artist = '未知艺术家'
		let title = file.basename || '未知标题'

		// 尝试从文件名解析艺术家和标题（如 "艺术家 - 标题.mp3" 格式）
		const nameWithoutExt = title.split('.').slice(0, -1).join('.')
		const parts = nameWithoutExt.split(' - ')
		if (parts.length >= 2) {
			artist = parts[0].trim()
			title = parts.slice(1).join(' - ').trim()
		}

		// 生成唯一ID
		const id = `webdav-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`

		// 获取文件URL
		const url = getFileUrl(file)
		if (!url) {
			logError('webdavFileToMusicItem: 无法获取文件URL')
			return null
		}

		// 创建认证头
		let authHeader = null
		if (currentServer.username && currentServer.password) {
			try {
				const auth = btoa(`${currentServer.username}:${currentServer.password}`)
				authHeader = { Authorization: `Basic ${auth}` }
			} catch (error) {
				logError('webdavFileToMusicItem: 生成认证头失败', error)
			}
		}

		// 创建音乐项目对象
		return {
			id,
			url,
			title,
			artist,
			album: currentServer.name || '未知专辑',
			artwork: '', // WebDAV没有内置的专辑封面
			duration: 0, // WebDAV无法直接获取时长
			headers: authHeader,
			source: 'webdav',
			serverName: currentServer.name,
		}
	} catch (error) {
		logError('webdavFileToMusicItem: 转换文件时出错', error)
		return null
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
				url: getFileUrl(file),
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
 * 使用React Hook获取当前WebDAV服务器
 */
export function useCurrentWebDAVServer() {
	const [server, setServer] = useState<WebDAVServer | null>(currentServer)

	useEffect(() => {
		// 订阅WebDAV状态更新
		const unsubscribe = subscribeToWebDAVStatus(() => {
			setServer(currentServer)
		})

		// 组件卸载时取消订阅
		return unsubscribe
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

/**
 * 设置默认WebDAV服务器
 * @param id 服务器ID
 * @returns 是否成功设置默认服务器
 */
export async function setDefaultWebDAVServer(id: string): Promise<boolean> {
	try {
		// 查找服务器
		const serverToSetDefault = servers.find((s) => s.id === id)
		if (!serverToSetDefault) {
			logError(`未找到ID为${id}的WebDAV服务器`)
			return false
		}

		// 尝试连接到服务器
		try {
			await connectToServer(serverToSetDefault)
			logInfo(`成功连接到默认WebDAV服务器: ${serverToSetDefault.name}`)
		} catch (connectError) {
			logError(`连接到默认WebDAV服务器失败: ${connectError.message}`)
			return false
		}

		// 通知订阅者更新
		notifySubscribers()

		logInfo(`已设置默认WebDAV服务器: ${serverToSetDefault.name}`)
		return true
	} catch (error) {
		logError('设置默认WebDAV服务器失败:', error)
		return false
	}
}
