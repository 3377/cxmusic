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
		// 从存储中加载服务器列表
		const savedServers = (await getStorage('webdav-servers')) || []
		if (savedServers && Array.isArray(savedServers)) {
			webdavServersStore.setValue(savedServers)

			// 如果有默认服务器，则连接到它
			const defaultServer = savedServers.find((server) => server.isDefault)
			if (defaultServer) {
				await connectToServer(defaultServer)
			}
		}

		logInfo('WebDAV服务初始化完成')
	} catch (error) {
		logError('WebDAV服务初始化失败:', error)
	}
}

/**
 * 连接到WebDAV服务器
 * @param server WebDAV服务器配置
 */
export async function connectToServer(server: WebDAVServer): Promise<boolean> {
	try {
		webdavClient = createClient(server.url, {
			authType: AuthType.Password,
			username: server.username,
			password: server.password,
		})

		// 测试连接
		const isConnected = await webdavClient.exists('/')
		if (isConnected) {
			currentServer = server
			logInfo(`已连接到WebDAV服务器: ${server.name}`)
			return true
		} else {
			webdavClient = null
			logError(`无法连接到WebDAV服务器: ${server.name}`)
			return false
		}
	} catch (error) {
		webdavClient = null
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
					// 使用先编码用户名和密码以避免特殊字符问题
					const encodedUsername = encodeURIComponent(currentServer.username)
					const encodedPassword = encodeURIComponent(currentServer.password)
					url.username = encodedUsername
					url.password = encodedPassword
					fullUrl = url.toString()
				}
			} catch (e) {
				// URL解析失败，回退到简单的字符串拼接
				logError('URL解析失败，使用简单拼接:', e)
				if (currentServer.username && currentServer.password) {
					const urlParts = fullUrl.split('://')
					if (urlParts.length === 2) {
						const encodedUsername = encodeURIComponent(currentServer.username)
						const encodedPassword = encodeURIComponent(currentServer.password)
						fullUrl = `${urlParts[0]}://${encodedUsername}:${encodedPassword}@${urlParts[1]}`
					}
				}
			}
		}

		return fullUrl
	} catch (error) {
		logError('构建WebDAV文件URL失败:', error)
		throw new Error(`无法创建文件URL: ${error.message}`)
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
				const authString = `${currentServer.username}:${currentServer.password}`
				const base64Auth = Buffer.from(authString).toString('base64')
				authHeaders = {
					Authorization: `Basic ${base64Auth}`,
				}
			}
		} catch (e) {
			logError('创建认证头失败:', e)
		}

		// 创建音乐项
		return {
			id: `webdav-${currentServer.id}-${file.path}`,
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
				serverId: currentServer.id,
				serverName: currentServer.name,
				path: file.path,
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
	const [server, setServer] = useState<WebDAVServer | null>(currentServer)

	useEffect(() => {
		const updateServer = () => {
			setServer(currentServer)
		}

		// 添加监听
		webdavServersStore.subscribe(updateServer)

		// 清理函数
		return () => {
			webdavServersStore.unsubscribe(updateServer)
		}
	}, [])

	return server
}
