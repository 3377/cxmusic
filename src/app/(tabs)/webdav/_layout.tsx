import { colors } from '@/constants/tokens'
import { Stack } from 'expo-router'
import React from 'react'

// 极简的WebDAV Tab布局 - 所有真正的功能都转移到独立的页面
export default function WebDavLayout() {
	return (
		<Stack
			screenOptions={{
				headerShown: true,
				headerStyle: {
					backgroundColor: colors.background,
				},
				headerTitleStyle: {
					color: colors.text,
				},
				headerTintColor: colors.primary,
				contentStyle: {
					backgroundColor: colors.background,
				},
			}}
		/>
	)
}
