import { StackScreenWithSearchBar } from '@/constants/layout'
import { colors } from '@/constants/tokens'
import { defaultStyles } from '@/styles'
import { nowLanguage } from '@/utils/i18n'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import { TouchableOpacity, View } from 'react-native'

const WebDAVScreenLayout = () => {
	const language = nowLanguage.useValue()
	const router = useRouter()

	return (
		<View style={defaultStyles.container}>
			<Stack>
				<Stack.Screen
					name="index"
					options={{
						...StackScreenWithSearchBar,
						headerTitle: 'WebDAV',
						headerStyle: {
							backgroundColor: colors.background,
						},
						headerTintColor: colors.primary,
						headerRight: () => (
							<TouchableOpacity
								onPress={() => router.push('/(modals)/webdavModal')}
								style={{ marginRight: 15 }}
							>
								<Ionicons name="settings-outline" size={24} color={colors.primary} />
							</TouchableOpacity>
						),
					}}
				/>
			</Stack>
		</View>
	)
}

export default WebDAVScreenLayout
