import { colors } from '@/constants/tokens'
import myTrackPlayer, { MusicRepeatMode, repeatModeStore } from '@/helpers/trackPlayerIndex'
import { setPlayList } from '@/store/playList'
import { defaultStyles } from '@/styles'
import { Ionicons } from '@expo/vector-icons'
import shuffle from 'lodash.shuffle'
import { StyleSheet, Text, View, ViewProps } from 'react-native'
import { TouchableOpacity } from 'react-native-gesture-handler'
import { Track } from 'react-native-track-player'

type QueueControlsProps = {
	tracks: Track[]
	showImportMenu?: boolean
	onImportTrack?: () => void
} & ViewProps

export const QueueControls = ({
	tracks,
	style,
	showImportMenu,
	onImportTrack,
	...viewProps
}: QueueControlsProps) => {
	const handlePlay = async () => {
		await myTrackPlayer.playWithReplacePlayList(
			tracks[0] as IMusic.IMusicItem,
			tracks as IMusic.IMusicItem[],
		)
		myTrackPlayer.setRepeatMode(MusicRepeatMode.QUEUE)
	}

	const handleShufflePlay = async () => {
		const shuffledTracks = shuffle(tracks)
		setPlayList(shuffledTracks as IMusic.IMusicItem[])
		repeatModeStore.setValue(MusicRepeatMode.SHUFFLE)
		await myTrackPlayer.playWithReplacePlayList(
			shuffledTracks[1] as IMusic.IMusicItem,
			shuffledTracks as IMusic.IMusicItem[],
		)
	}

	return (
		<View style={[{ flexDirection: 'row', columnGap: 16 }, style]} {...viewProps}>
			{/* Play button */}
			<View style={{ flex: 1 }}>
				<TouchableOpacity onPress={handlePlay} activeOpacity={0.8} style={styles.button}>
					<Ionicons name="play" size={22} color={colors.primary} />

					<Text style={styles.buttonText}>播放</Text>
				</TouchableOpacity>
			</View>

			{/* Shuffle button */}
			<View style={{ flex: 1 }}>
				<TouchableOpacity onPress={handleShufflePlay} activeOpacity={0.8} style={styles.button}>
					<Ionicons name={'shuffle-sharp'} size={24} color={colors.primary} />

					<Text style={styles.buttonText}>随机</Text>
				</TouchableOpacity>
			</View>
			{/* import button */}
			{showImportMenu && (
				<View style={{ flex: 1 }}>
					<TouchableOpacity onPress={onImportTrack} activeOpacity={0.8} style={styles.button}>
						<Ionicons name={'enter-outline'} size={24} color={colors.primary} />

						<Text style={styles.buttonText}>导入</Text>
					</TouchableOpacity>
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	button: {
		padding: 12,
		backgroundColor: 'rgba(47, 47, 47, 0.5)',
		borderRadius: 8,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		columnGap: 8,
	},
	buttonText: {
		...defaultStyles.text,
		color: colors.primary,
		fontWeight: '600',
		fontSize: 18,
		textAlign: 'center',
	},
})
