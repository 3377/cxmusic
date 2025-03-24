import { StackScreenWithSearchBar } from '@/constants/layout'
import { colors } from '@/constants/tokens'
import { defaultStyles } from '@/styles'
import { nowLanguage } from '@/utils/i18n'
import { Stack } from 'expo-router'
import { View } from 'react-native'

const WebDAVScreenLayout = () => {
	const language = nowLanguage.useValue()
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
					}}
				/>
			</Stack>
		</View>
	)
}

export default WebDAVScreenLayout
