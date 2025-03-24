import { colors, fontSize, screenPadding } from '@/constants/tokens'
import { useLoggerHook } from '@/helpers/logger'
import i18n from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import React, { useRef, useState } from 'react'
import {
	Alert,
	Animated,
	Clipboard,
	FlatList,
	Modal,
	Pressable,
	SafeAreaView,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	TouchableWithoutFeedback,
	View,
} from 'react-native'

const LogScreen = () => {
	const { logs, clearLogs } = useLoggerHook()
	const [selectedLog, setSelectedLog] = useState<null | any>(null)
	const [selectedLogs, setSelectedLogs] = useState<Set<number>>(new Set())
	const [isSelectMode, setIsSelectMode] = useState(false)
	const fadeAnim = useRef(new Animated.Value(0)).current

	const handleCopy = (items: any[]) => {
		const logText = items
			.map((item) => `[${item.timestamp}] [${item.level}] ${item.message}`)
			.join('\n')
		Clipboard.setString(logText)
		Alert.alert(i18n.t('logScreen.copy'), i18n.t('logScreen.copyMessage'))
		setSelectedLogs(new Set())
		setIsSelectMode(false)
		Animated.timing(fadeAnim, {
			toValue: 0,
			duration: 500,
			useNativeDriver: true,
		}).start()
	}

	const toggleSelectMode = () => {
		setIsSelectMode(!isSelectMode)
		if (!isSelectMode) {
			setSelectedLogs(new Set())
		}
	}

	const toggleLogSelection = (index: number) => {
		const newSelectedLogs = new Set(selectedLogs)
		if (newSelectedLogs.has(index)) {
			newSelectedLogs.delete(index)
		} else {
			newSelectedLogs.add(index)
		}
		setSelectedLogs(newSelectedLogs)
	}

	const renderItem = ({ item, index }: { item: any; index: number }) => (
		<Pressable
			onPress={() => {
				if (isSelectMode) {
					toggleLogSelection(index)
				} else {
					setSelectedLog(item)
				}
			}}
			onLongPress={() => {
				if (!isSelectMode) {
					setIsSelectMode(true)
					toggleLogSelection(index)
				}
			}}
			style={({ pressed }) => [
				styles.logItem,
				pressed && styles.pressed,
				isSelectMode && selectedLogs.has(index) && styles.selectedItem,
			]}
		>
			<View style={styles.logHeader}>
				<Text style={[styles.logLevel, { color: getLogColor(item.level) }]}>{item.level}</Text>
				<Text style={styles.logTimestamp}>{formatTimestamp(item.timestamp)}</Text>
			</View>
			<Text style={styles.logMessage}>{item.message}</Text>
			{isSelectMode && (
				<View style={styles.checkbox}>
					<Ionicons
						name={selectedLogs.has(index) ? 'checkbox' : 'square-outline'}
						size={20}
						color={selectedLogs.has(index) ? colors.primary : colors.text}
					/>
				</View>
			)}
		</Pressable>
	)

	const formatTimestamp = (timestamp: string) => {
		const date = new Date(timestamp)
		return `${padZero(date.getHours())}:${padZero(date.getMinutes())}:${padZero(date.getSeconds())}`
	}

	const padZero = (num: number) => (num < 10 ? `0${num}` : num)

	const getLogColor = (level: string) => {
		switch (level) {
			case 'ERROR':
				return colors.primary
			case 'WARN':
				return '#FFA500' // 橙色
			case 'INFO':
			default:
				return '#00FF00' // 绿色
		}
	}

	return (
		<SafeAreaView style={styles.safeArea}>
			<View style={styles.container}>
				<View style={styles.header}>
					<Text style={styles.title}>{i18n.t('logScreen.title')}</Text>
					<View style={styles.headerButtons}>
						{isSelectMode ? (
							<>
								<TouchableOpacity
									onPress={() => {
										const selectedItems = Array.from(selectedLogs).map((index) => logs[index])
										handleCopy(selectedItems)
									}}
									style={styles.iconButton}
								>
									<Ionicons name="copy-outline" size={20} color={colors.text} />
									<Text style={styles.buttonText}>{i18n.t('logScreen.actions.copy')}</Text>
								</TouchableOpacity>
								<TouchableOpacity onPress={toggleSelectMode} style={styles.iconButton}>
									<Ionicons name="close" size={20} color={colors.text} />
									<Text style={styles.buttonText}>{i18n.t('logScreen.actions.cancel')}</Text>
								</TouchableOpacity>
							</>
						) : (
							<>
								<TouchableOpacity onPress={toggleSelectMode} style={styles.iconButton}>
									<Ionicons name="checkbox-outline" size={20} color={colors.text} />
									<Text style={styles.buttonText}>{i18n.t('logScreen.actions.select')}</Text>
								</TouchableOpacity>
								<TouchableOpacity onPress={clearLogs} style={styles.iconButton}>
									<Ionicons name="trash-outline" size={20} color={colors.text} />
									<Text style={styles.buttonText}>{i18n.t('logScreen.actions.clear')}</Text>
								</TouchableOpacity>
							</>
						)}
					</View>
				</View>
				<FlatList
					data={logs}
					keyExtractor={(item, index) => index.toString()}
					renderItem={renderItem}
					ListEmptyComponent={<Text style={styles.emptyText}>{i18n.t('logScreen.empty')}</Text>}
					contentContainerStyle={logs.length === 0 && styles.emptyContainer}
					style={styles.flatList}
				/>
				<Modal
					visible={!!selectedLog}
					transparent
					animationType="slide"
					onRequestClose={() => setSelectedLog(null)}
				>
					<TouchableWithoutFeedback onPress={() => setSelectedLog(null)}>
						<View style={styles.modalOverlay} />
					</TouchableWithoutFeedback>
					<View style={styles.modalContainer}>
						<ScrollView contentContainerStyle={styles.modalContent}>
							{selectedLog && (
								<View>
									<View style={styles.modalHeader}>
										<Text style={styles.modalTitle}>{i18n.t('logScreen.details.title')}</Text>
										<TouchableOpacity onPress={() => setSelectedLog(null)}>
											<Ionicons name="close" size={24} color={colors.text} />
										</TouchableOpacity>
									</View>
									<Text style={styles.modalTimestamp}>{selectedLog.timestamp}</Text>
									<Text style={[styles.modalLevel, { color: getLogColor(selectedLog.level) }]}>
										{selectedLog.level}
									</Text>
									<Text style={styles.modalMessage}>{selectedLog.message}</Text>
									{selectedLog.details && (
										<View style={styles.modalDetails}>
											<Text style={styles.detailsTitle}>{i18n.t('logScreen.details.title')}</Text>
											<Text style={styles.detailsContent}>
												{typeof selectedLog.details === 'string'
													? selectedLog.details
													: JSON.stringify(selectedLog.details, null, 2)}
											</Text>
										</View>
									)}
									<TouchableOpacity
										style={styles.copyButton}
										onPress={() => handleCopy([selectedLog])}
									>
										<Text style={styles.copyButtonText}>{i18n.t('logScreen.actions.copy')}</Text>
									</TouchableOpacity>
								</View>
							)}
						</ScrollView>
					</View>
				</Modal>
			</View>
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	safeArea: {
		flex: 1,
		backgroundColor: colors.background,
	},
	container: {
		flex: 1,
		backgroundColor: colors.background,
		paddingHorizontal: screenPadding.horizontal,
	},
	header: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 16,
		paddingVertical: 8,
	},
	title: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.text,
	},
	headerButtons: {
		flexDirection: 'row',
	},
	iconButton: {
		flexDirection: 'row',
		alignItems: 'center',
		marginLeft: 16,
	},
	buttonText: {
		marginLeft: 4,
		color: colors.text,
		fontSize: fontSize.sm,
	},
	flatList: {
		flex: 1,
	},
	logItem: {
		paddingVertical: 12,
		borderBottomWidth: 1,
		borderBottomColor: '#333',
		flexDirection: 'row',
		alignItems: 'flex-start',
	},
	logHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		marginBottom: 4,
		flex: 1,
	},
	logLevel: {
		fontSize: fontSize.sm,
		fontWeight: '600',
	},
	logTimestamp: {
		fontSize: fontSize.sm,
		color: colors.textMuted,
	},
	logMessage: {
		fontSize: fontSize.base,
		color: colors.text,
		flex: 1,
	},
	emptyContainer: {
		flexGrow: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	emptyText: {
		fontSize: fontSize.base,
		color: colors.textMuted,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'flex-end',
	},
	modalContainer: {
		backgroundColor: '#1e1e1e',
		borderTopLeftRadius: 20,
		borderTopRightRadius: 20,
		maxHeight: '80%',
	},
	modalContent: {
		padding: 20,
	},
	modalHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		marginBottom: 8,
	},
	modalTitle: {
		fontSize: fontSize.lg,
		fontWeight: '700',
		color: colors.text,
	},
	modalTimestamp: {
		fontSize: fontSize.sm,
		color: colors.textMuted,
		marginBottom: 4,
	},
	modalLevel: {
		fontSize: fontSize.sm,
		fontWeight: '600',
		marginBottom: 8,
	},
	modalMessage: {
		fontSize: fontSize.base,
		color: colors.text,
		marginBottom: 12,
	},
	modalDetails: {
		backgroundColor: '#2e2e2e',
		padding: 10,
		borderRadius: 8,
		marginBottom: 16,
	},
	detailsTitle: {
		fontSize: fontSize.sm,
		fontWeight: '600',
		color: colors.text,
		marginBottom: 4,
	},
	detailsContent: {
		fontSize: fontSize.sm,
		color: colors.textMuted,
		fontFamily: 'monospace',
	},
	closeButton: {
		backgroundColor: colors.primary,
		paddingVertical: 10,
		borderRadius: 8,
		alignItems: 'center',
		marginTop: 10,
	},
	closeButtonText: {
		color: colors.text,
		fontSize: fontSize.base,
		fontWeight: 'bold',
	},
	copyButton: {
		position: 'absolute',
		right: 10,
		top: 10,
		backgroundColor: colors.primary,
		padding: 5,
		borderRadius: 5,
	},
	copyButtonText: {
		color: colors.text,
		fontSize: fontSize.sm,
	},
	pressed: {
		backgroundColor: 'rgba(0, 0, 0, 0.1)',
		opacity: 0.5,
	},
	selectedItem: {
		backgroundColor: 'rgba(255, 255, 255, 0.1)',
	},
	checkbox: {
		marginLeft: 10,
		marginTop: 2,
	},
})

export default LogScreen
