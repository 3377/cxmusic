import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { formatBytes } from '@/utils/formatter'
import { Feather } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import React, { useEffect } from 'react'
import { ActivityIndicator, Alert, Text, TouchableOpacity, View } from 'react-native'
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

// 简单的跳转页面 - 避免在Tab栈中直接渲染WebDAV功能
export default function WebDAVTab() {
	const router = useRouter()

	// 在组件挂载后立即重定向到独立WebDAV页面
	useEffect(() => {
		// 使用延迟重定向避免潜在的导航冲突
		const timer = setTimeout(() => {
			router.push('/webdavStandalone')
		}, 100)

		return () => clearTimeout(timer)
	}, [])

	// 渲染一个简单的加载状态
	return (
		<View
			style={{
				flex: 1,
				backgroundColor: colors.background,
				justifyContent: 'center',
				alignItems: 'center',
			}}
		>
			<ActivityIndicator size="large" color={colors.primary} />
			<Text
				style={{
					marginTop: 16,
					color: colors.text,
					fontSize: 16,
				}}
			>
				正在加载WebDAV服务...
			</Text>
		</View>
	)
}
