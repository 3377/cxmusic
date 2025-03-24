// src/app/modals/settingModal.tsx
import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import myTrackPlayer, {
	autoCacheLocalStore,
	isCachedIconVisibleStore,
	musicApiSelectedStore,
	musicApiStore,
	nowApiState,
	songsNumsToLoadStore,
	useCurrentQuality,
} from '@/helpers/trackPlayerIndex'
import PersistStatus from '@/store/PersistStatus'
import i18n, { changeLanguage, nowLanguage } from '@/utils/i18n'
import { showToast } from '@/utils/utils'
import { MenuView } from '@react-native-menu/menu'
import { Buffer } from 'buffer'
import Constants from 'expo-constants'
import * as DocumentPicker from 'expo-document-picker'
import { useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	Image,
	Linking,
	ScrollView,
	StyleSheet,
	Switch,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import RNFS from 'react-native-fs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Toast, { BaseToast, ErrorToast } from 'react-native-toast-message'
const QUALITY_OPTIONS = ['128k', '320k', 'flac']
const CURRENT_VERSION = Constants.expoConfig?.version ?? '未知版本'

// eslint-disable-next-line react/prop-types
const MusicQualityMenu = ({ currentQuality, onSelectQuality }) => {
	const handlePressAction = async (id: string) => {
		if (QUALITY_OPTIONS.includes(id)) {
			onSelectQuality(id)
		}
	}

	return (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => handlePressAction(event)}
			actions={QUALITY_OPTIONS.map((quality) => ({
				id: quality,
				title: quality,
				state: currentQuality === quality ? 'on' : 'off',
			}))}
		>
			<TouchableOpacity style={styles.menuTrigger}>
				<Text style={styles.menuTriggerText}>{currentQuality}</Text>
			</TouchableOpacity>
		</MenuView>
	)
}
// eslint-disable-next-line react/prop-types
const MusicSourceMenu = ({ isDelete, onSelectSource }) => {
	const [sources, setSources] = useState([])
	const selectedApi = musicApiSelectedStore.useValue()
	const musicApis = musicApiStore.useValue()

	useEffect(() => {
		if (musicApis && Array.isArray(musicApis)) {
			setSources(
				musicApis.map((api) => ({
					id: api.id,
					title: api.name,
				})),
			)
		} else {
			setSources([]) // 如果 musicApis 不是有效数组，设置为空数组
		}
	}, [musicApis])

	const handlePressAction = async (id: string) => {
		onSelectSource(id)
	}

	return (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => handlePressAction(event)}
			actions={sources.map((source) => ({
				id: source.id,
				title: isDelete
					? `${i18n.t('settings.actions.delete.delete')} ${source.title}`
					: source.title,
				state: isDelete ? 'off' : selectedApi && selectedApi.id === source.id ? 'on' : 'off',
				attributes: isDelete ? { destructive: true } : undefined,
			}))}
		>
			<TouchableOpacity style={[styles.menuTrigger]}>
				<Text style={[styles.menuTriggerText]}>
					{isDelete
						? i18n.t('settings.actions.delete.selectDelete')
						: selectedApi
							? selectedApi.name
							: i18n.t('settings.items.selectSource')}
				</Text>
			</TouchableOpacity>
		</MenuView>
	)
}

interface ModuleExports {
	id?: string
	author?: string
	name?: string
	version?: string
	srcUrl?: string
	getMusicUrl?: (
		songname: string,
		artist: string,
		songmid: string,
		quality: string,
	) => Promise<string>
}
const importMusicSourceFromUrl = async () => {
	Alert.prompt(
		'导入音源',
		'请输入音源 URL',
		[
			{
				text: '取消',
				onPress: () => logInfo('取消导入'),
				style: 'cancel',
			},
			{
				text: '确定',
				onPress: async (url) => {
					if (!url) {
						Alert.alert('错误', 'URL 不能为空')
						return
					}

					try {
						const response = await fetch(url)
						if (!response.ok) {
							throw new Error(`HTTP error! status: ${response.status}`)
						}
						const sourceCode = await response.text()
						const utf8SourceCode = Buffer.from(sourceCode, 'utf8').toString('utf8')

						logInfo('获取到的源代码:', utf8SourceCode)

						// 这里需要添加处理源代码的逻辑，类似于 importMusicSourceFromFile 中的逻辑
						// 例如：解析源代码，创建 MusicApi 对象，并添加到 myTrackPlayer
						const module: { exports: ModuleExports } = { exports: {} }
						const require = () => {} // 如果文件中有其他 require 调用，你需要在这里实现
						const moduleFunc = new Function('module', 'exports', 'require', utf8SourceCode)
						moduleFunc(module, module.exports, require)
						// const url = await module.exports.getMusicUrl('朵', '赵雷', '004IArbh3ytHgR', '128k')
						// logInfo(url + '123123')
						// 从模块导出创建 MusicApi 对象
						const musicApi: IMusic.MusicApi = {
							id: module.exports.id || '',
							platform: 'tx', // 平台目前默认tx
							author: module.exports.author || '',
							name: module.exports.name || '',
							version: module.exports.version || '',
							srcUrl: module.exports.srcUrl || '',
							script: utf8SourceCode, //
							isSelected: false,
							getMusicUrl: module.exports.getMusicUrl,
						}

						myTrackPlayer.addMusicApi(musicApi)
						return
					} catch (error) {
						logError('导入音源失败:', error)
						Alert.alert('错误', '导入音源失败，请检查 URL 是否正确')
					}
				},
			},
		],
		'plain-text',
	)
}
const importMusicSourceFromFile = async () => {
	try {
		const result = await DocumentPicker.getDocumentAsync({
			type: 'text/javascript',
			copyToCacheDirectory: false,
		})

		if (result.canceled === true) {
			logInfo('User canceled document picker')
			return
		}

		// logInfo('File selected:', result.assets[0].uri)
		const fileUri = decodeURIComponent(result.assets[0].uri)
		const fileContents = await RNFS.readFile(fileUri, 'utf8')
		logInfo('File contents:', fileContents)
		// 模拟 Node.js 的模块系统
		const module: { exports: ModuleExports } = { exports: {} }
		const require = () => {} // 如果文件中有其他 require 调用，你需要在这里实现
		const moduleFunc = new Function('module', 'exports', 'require', fileContents)
		moduleFunc(module, module.exports, require)
		// const url = await module.exports.getMusicUrl('朵', '赵雷', '004IArbh3ytHgR', '128k')
		// 从模块导出创建 MusicApi 对象
		const musicApi: IMusic.MusicApi = {
			id: module.exports.id || '',
			platform: 'tx', // 平台目前默认tx
			author: module.exports.author || '',
			name: module.exports.name || '',
			version: module.exports.version || '',
			srcUrl: module.exports.srcUrl || '',
			script: fileContents, //
			isSelected: false,
			getMusicUrl: module.exports.getMusicUrl,
		}

		myTrackPlayer.addMusicApi(musicApi)
		return
	} catch (err) {
		logError('Error importing music source:', err)
		Alert.alert('导入失败', '无法导入音源，请查看日志，确保文件格式正确并稍后再试。')
		logError('导入音源失败' + err)
	}
}
const SettingModal = () => {
	const router = useRouter()
	const [currentQuality, setCurrentQuality] = useCurrentQuality()
	const [isQualitySelectorVisible, setIsQualitySelectorVisible] = useState(false)
	const [isLoading, setIsLoading] = useState(false)
	const apiState = nowApiState.useValue()
	const language = nowLanguage.useValue()
	const autoCacheLocal = autoCacheLocalStore.useValue()
	const isCachedIconVisible = isCachedIconVisibleStore.useValue()
	const songsNumsToLoad = songsNumsToLoadStore.useValue()
	const settingsData = [
		{
			title: i18n.t('settings.sections.appInfo'),
			data: [
				{ id: '1', title: 'CyMusic', type: 'link', icon: require('@/assets/144.png') },
				{ id: '2', title: i18n.t('settings.items.version'), type: 'value', value: CURRENT_VERSION },
				{ id: '3', title: i18n.t('settings.items.checkUpdate'), type: 'value' },
				{ id: '5', title: i18n.t('settings.items.projectLink'), type: 'value', value: '' },
				{ id: '9', title: i18n.t('settings.items.clearCache'), type: 'value', value: '' },
				{ id: '13', title: i18n.t('settings.items.viewLogs'), type: 'link' },
				{
					id: '15',
					title: i18n.t('settings.items.changeLanguage'),
					type: 'value',
					value: '',
				},
				{ id: '16', title: i18n.t('settings.items.isCachedIconVisible'), type: 'value', value: '' },
				{
					id: '17',
					title: i18n.t('settings.items.songsNumsToLoad'),
					type: 'value',
					value: '',
				},
				{
					id: '18',
					title: 'WebDAV服务器管理',
					type: 'link',
				},
			],
		},
		{
			title: i18n.t('settings.sections.audioSettings'),
			data: [
				{ id: '6', title: i18n.t('settings.items.clearPlaylist'), type: 'link' },
				{
					id: '14',
					title: i18n.t('settings.items.autoCacheLocal'),
					type: 'value',
				},
			],
		},
		{
			title: i18n.t('settings.sections.customSource'),
			data: [
				{ id: '11', title: i18n.t('settings.items.switchSource'), type: 'custom' },
				{
					id: '7',
					title: i18n.t('settings.items.sourceStatus'),
					type: 'value',
					value:
						apiState == '正常'
							? i18n.t('settings.items.normal')
							: i18n.t('settings.items.exception'),
				},
				{ id: '12', title: i18n.t('settings.items.deleteSource'), type: 'value', value: '' },
				{ id: '8', title: i18n.t('settings.items.importSource'), type: 'value' },
			],
		},
		{
			title: i18n.t('settings.sections.qualitySelection'),
			data: [{ id: '10', title: i18n.t('settings.items.currentQuality'), type: 'value' }],
		},
	]
	const importMusicSourceMenu = (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => {
				switch (event) {
					case 'file':
						importMusicSourceFromFile()
						break
					case 'url':
						importMusicSourceFromUrl()
						break
				}
			}}
			actions={[
				{ id: 'file', title: i18n.t('settings.actions.import.fromFile') },
				{ id: 'url', title: i18n.t('settings.actions.import.fromUrl') },
			]}
		>
			<TouchableOpacity style={styles.menuTrigger}>
				<Text style={styles.menuTriggerText}>{i18n.t('settings.actions.import.title')}</Text>
			</TouchableOpacity>
		</MenuView>
	)
	const toggleAutoCacheLocalMenu = (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => {
				switch (event) {
					case 'on':
						myTrackPlayer.toggleAutoCacheLocal(true)
						break
					case 'off':
						myTrackPlayer.toggleAutoCacheLocal(false)
						break
				}
			}}
			actions={[
				{ id: 'on', title: i18n.t('settings.actions.autoCacheLocal.yes') },
				{ id: 'off', title: i18n.t('settings.actions.autoCacheLocal.no') },
			]}
		>
			<TouchableOpacity style={styles.menuTrigger}>
				<Text style={styles.menuTriggerText}>
					{/* 此处加空格为了增大点击区域 */}
					{autoCacheLocal == true
						? '             ' + i18n.t('settings.actions.autoCacheLocal.yes')
						: '             ' + i18n.t('settings.actions.autoCacheLocal.no')}
				</Text>
			</TouchableOpacity>
		</MenuView>
	)
	const toggleIsCachedIconVisibleMenu = (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => {
				switch (event) {
					case 'on':
						myTrackPlayer.toggleIsCachedIconVisible(true)
						break
					case 'off':
						myTrackPlayer.toggleIsCachedIconVisible(false)
						break
				}
			}}
			actions={[
				{ id: 'on', title: i18n.t('settings.actions.isCachedIconVisible.yes') },
				{ id: 'off', title: i18n.t('settings.actions.isCachedIconVisible.no') },
			]}
		>
			<TouchableOpacity style={styles.menuTrigger}>
				<Text style={styles.menuTriggerText}>
					{/* 此处加空格为了增大点击区域 */}
					{isCachedIconVisible == true
						? '             ' + i18n.t('settings.actions.isCachedIconVisible.yes')
						: '             ' + i18n.t('settings.actions.isCachedIconVisible.no')}
				</Text>
			</TouchableOpacity>
		</MenuView>
	)
	const toggleSongsNumsToLoadMenu = (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => {
				PersistStatus.set('music.songsNumsToLoad', parseInt(event))
				songsNumsToLoadStore.setValue(parseInt(event))
			}}
			actions={[
				{ id: '100', title: '100' },
				{ id: '200', title: '200' },
				{ id: '300', title: '300' },
			]}
		>
			<TouchableOpacity style={styles.menuTrigger}>
				<Text style={styles.menuTriggerText}>{'             ' + songsNumsToLoad}</Text>
			</TouchableOpacity>
		</MenuView>
	)
	const DismissPlayerSymbol = () => {
		const { top } = useSafeAreaInsets()
		return (
			<View style={[styles.dismissSymbol, { top: top - 25 }]}>
				<View style={styles.dismissBar} />
			</View>
		)
	}
	const handleClearCache = async () => {
		try {
			await myTrackPlayer.clearCache()
			Alert.alert(
				i18n.t('settings.actions.cache.success'),
				i18n.t('settings.actions.cache.successMessage'),
			)
		} catch (error) {
			Alert.alert(
				i18n.t('settings.actions.cache.error'),
				i18n.t('settings.actions.cache.errorMessage'),
			)
			console.error(error)
		}
	}
	const handleSelectSource = (sourceId) => {
		myTrackPlayer.setMusicApiAsSelectedById(sourceId)

		//setCurrentSource(sourceId);
		// 这里你需要实现切换音源的逻辑
		// 例如：myTrackPlayer.setMusicApiAsSelectedById(sourceId);
	}
	const changeLanguageMenu = (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => {
				switch (event) {
					case 'zh':
						changeLanguage('zh')
						break
					case 'en':
						changeLanguage('en')
						break
				}
			}}
			actions={[
				{ id: 'zh', title: '中文' },
				{ id: 'en', title: 'English' },
			]}
		>
			<TouchableOpacity style={styles.menuTrigger}>
				<Text style={styles.menuTriggerText}>{language == 'zh' ? '中文' : 'English'}</Text>
			</TouchableOpacity>
		</MenuView>
	)

	const handleDeleteSource = (sourceId) => {
		myTrackPlayer.deleteMusicApiById(sourceId)
	}
	const checkForUpdates = async () => {
		setIsLoading(true)
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('请求超时')), 10000),
		)
		try {
			const result = await Promise.race([
				fetch('https://api.github.com/repos/gyc-12/music-player-master/releases/latest'),
				timeoutPromise,
			])
			if (!(result instanceof Response)) {
				throw new Error('非预期的结果类型')
			}

			if (!result.ok) {
				throw new Error(`HTTP error! status: ${result.status}`)
			}
			const data = await result.json()
			const latestVersion = data.tag_name
			logInfo(CURRENT_VERSION + 'CURRENT_VERSIONCURRENT_VERSION' + latestVersion)

			if (latestVersion !== CURRENT_VERSION) {
				Alert.alert(
					i18n.t('settings.actions.checkUpdate.available'),
					`${i18n.t('settings.actions.checkUpdate.message')} ${latestVersion}`,
					[
						{
							text: i18n.t('settings.actions.checkUpdate.ok'),
							onPress: () => Linking.openURL(data.html_url),
						},
						{
							text: i18n.t('settings.actions.checkUpdate.cancel'),
							onPress: () => {},
							style: 'cancel',
						},
					],
				)
			} else {
				Alert.alert(
					i18n.t('settings.actions.checkUpdate.notAvailable'),
					i18n.t('settings.actions.checkUpdate.notAvailableMessage'),
				)
			}
		} catch (error) {
			logError(i18n.t('settings.actions.checkUpdate.error'), error)
			Alert.alert(
				i18n.t('settings.actions.checkUpdate.error'),
				i18n.t('settings.actions.checkUpdate.errorMessage'),
			)
		} finally {
			setIsLoading(false)
		}
	}

	const renderItem = (item, index, sectionData) => (
		<View key={item.id}>
			<TouchableOpacity
				key={item.id}
				style={[
					styles.item,
					index === 0 && styles.firstItem,
					index === sectionData.length - 1 && styles.lastItem,
				]}
				onPress={() => {
					if (item.title === i18n.t('settings.items.viewLogs')) {
						router.push('/(modals)/logScreen')
					}
					if (item.title === i18n.t('settings.items.projectLink')) {
						Linking.openURL('https://github.com/gyc-12/music-player-master').catch((err) =>
							logError("Couldn't load page", err),
						)
					} else if (item.title === i18n.t('settings.items.currentQuality')) {
						setIsQualitySelectorVisible(true)
					} else if (item.title === 'WebDAV服务器管理') {
						router.push('/(modals)/webdavModal')
					} else if (item.type === 'link') {
						if (item.title === i18n.t('settings.items.clearPlaylist')) {
							Alert.alert(
								i18n.t('settings.actions.clearPlaylist.title'),
								i18n.t('settings.actions.clearPlaylist.message'),
								[
									{ text: i18n.t('settings.actions.clearPlaylist.cancel'), style: 'cancel' },
									{
										text: i18n.t('settings.actions.clearPlaylist.confirm'),
										onPress: () => myTrackPlayer.clearToBePlayed(),
									},
								],
							)
						} else if (item.title === i18n.t('settings.items.importSource')) {
							// importMusicSourceFromFile()
						} else if (item.title === 'CyMusic') {
							showToast('CyMusic', 'success')
						}
						// logInfo(`Navigate to ${item.title}`)
					} else if (item.title === i18n.t('settings.items.checkUpdate')) {
						checkForUpdates()
					} else if (item.title === i18n.t('settings.items.clearCache')) {
						handleClearCache()
					}
				}}
			>
				{item.icon && <Image source={item.icon} style={styles.icon} />}
				<View style={styles.itemContent}>
					<Text style={styles.itemText}>{item.title}</Text>
					{item.type === 'switch' && (
						<Switch
							value={item.value}
							onValueChange={(newValue) => {
								logInfo(`${item.title} switched to ${newValue}`)
							}}
						/>
					)}
					{item.type === 'value' && <Text style={styles.itemValue}>{item.value}</Text>}
					{item.title === i18n.t('settings.items.currentQuality') && (
						<MusicQualityMenu currentQuality={currentQuality} onSelectQuality={setCurrentQuality} />
					)}
					{item.title === i18n.t('settings.items.switchSource') && (
						<MusicSourceMenu isDelete={false} onSelectSource={handleSelectSource} />
					)}
					{item.title === i18n.t('settings.items.deleteSource') && (
						<MusicSourceMenu isDelete={true} onSelectSource={handleDeleteSource} />
					)}
					{item.title === i18n.t('settings.items.importSource') && importMusicSourceMenu}
					{(item.type === 'link' || item.title === i18n.t('settings.items.projectLink')) &&
						!item.icon && <Text style={styles.arrowRight}>{'>'}</Text>}
					{item.title === i18n.t('settings.items.autoCacheLocal') && toggleAutoCacheLocalMenu}
					{item.title === i18n.t('settings.items.changeLanguage') && changeLanguageMenu}
					{item.title === i18n.t('settings.items.isCachedIconVisible') &&
						toggleIsCachedIconVisibleMenu}
					{item.title === i18n.t('settings.items.songsNumsToLoad') && toggleSongsNumsToLoadMenu}
				</View>
			</TouchableOpacity>
			{index !== sectionData.length - 1 && <View style={styles.separator} />}
		</View>
	)
	const GlobalLoading = () => (
		<View style={styles.loadingOverlay}>
			<ActivityIndicator size="large" color={colors.loading} />
		</View>
	)
	/*
  1. Create the config
*/
	const toastConfig = {
		/*
	  Overwrite 'success' type,
	  by modifying the existing `BaseToast` component
	*/
		success: (props) => (
			<BaseToast
				{...props}
				style={{ borderLeftColor: 'rgb(252,87,59)', backgroundColor: 'rgb(251,231,227)' }}
				contentContainerStyle={{ paddingHorizontal: 15 }}
				text1Style={{
					fontSize: 15,
					fontWeight: '400',
					color: 'rgb(252,87,59)',
				}}
			/>
		),
		/*
	  Overwrite 'error' type,
	  by modifying the existing `ErrorToast` component
	*/
		error: (props) => (
			<ErrorToast
				{...props}
				style={{ borderLeftColor: 'rgb(252,87,59)', backgroundColor: 'rgb(251,231,227)' }}
				contentContainerStyle={{ paddingHorizontal: 15 }}
				text1Style={{
					fontSize: 15,
					fontWeight: '400',
					color: 'rgb(252,87,59)',
				}}
			/>
		),
		/*
	  Or create a completely new type - `tomatoToast`,
	  building the layout from scratch.
  
	  I can consume any custom `props` I want.
	  They will be passed when calling the `show` method (see below)
	*/
	}
	return (
		<View style={styles.container}>
			<DismissPlayerSymbol />
			<Text style={styles.header}>{i18n.t('settings.title')}</Text>
			<ScrollView style={styles.scrollView}>
				{settingsData.map((section, index) => (
					<View key={index} style={styles.section}>
						<Text style={styles.sectionTitle}>{section.title}</Text>
						<View style={styles.sectionContent}>{section.data.map(renderItem)}</View>
					</View>
				))}
			</ScrollView>
			{isLoading && <GlobalLoading />}
			<Toast config={toastConfig} />
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: colors.background,
	},
	dismissSymbol: {
		position: 'absolute',
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		zIndex: 1,
	},
	dismissBar: {
		width: 50,
		height: 8,
		borderRadius: 8,
		backgroundColor: '#fff',
		opacity: 0.7,
	},
	header: {
		fontSize: 34,
		fontWeight: 'bold',
		padding: 20,
		paddingTop: 50,
		color: colors.text,
	},
	scrollView: {
		flex: 1,
	},
	section: {
		marginBottom: 20,
	},
	sectionTitle: {
		fontSize: 18,
		fontWeight: '600',
		color: colors.text,
		marginLeft: 20,
		marginBottom: 5,
	},
	item: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: 16,
		// 移除 borderBottomWidth 和 borderBottomColor
	},
	firstItem: {
		borderBottomWidth: 0,
	},
	lastItem: {
		borderBottomWidth: 0, // 确保最后一项没有底部边框
	},
	separator: {
		left: 16,
		right: 16,
		height: 1,
		backgroundColor: colors.maximumTrackTintColor,
	},
	sectionContent: {
		backgroundColor: 'rgb(32,32,32)',
		borderRadius: 10,
		marginHorizontal: 16,
		overflow: 'hidden', // 确保圆角不被分隔线覆盖
	},
	icon: {
		width: 30,
		height: 30,
		marginRight: 10,
		borderRadius: 6,
	},
	itemContent: {
		flex: 1,
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	itemText: {
		fontSize: 16,
		color: colors.text,
	},
	itemValue: {
		fontSize: 16,
		color: colors.textMuted,
	},
	arrowRight: {
		fontSize: 18,
		color: colors.textMuted,
	},
	menuTrigger: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	menuTriggerText: {
		fontSize: 16,
		color: colors.textMuted,
	},
	loadingOverlay: {
		position: 'absolute',
		left: 0,
		right: 0,
		top: 0,
		bottom: 0,
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(0, 0, 0, 0.5)',
	},
})

export default SettingModal
