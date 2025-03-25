import { hideLoading, setLoadingError, showLoading, useLoading } from '@/helpers/loading'
import { Track } from 'react-native-track-player'
import { create } from 'zustand'

interface PlayerState {
	isInitialized: boolean
	prevTrack: Track | null
	activeTrack: Track | null
	setInitialized: (isInitialized: boolean) => void
	setPrevTrack: (prevTrack: Track | null) => void
	setActiveTrack: (activeTrack: Track | null) => void
	showPlayerLoading: (message?: string) => void
	hidePlayerLoading: () => void
	setPlayerError: (error: string | null) => void
}

const usePlayerStore = create<PlayerState>((set) => ({
	isInitialized: false,
	prevTrack: null,
	activeTrack: null,
	setInitialized: (isInitialized) => set({ isInitialized }),
	setPrevTrack: (prevTrack) => set({ prevTrack }),
	setActiveTrack: (activeTrack) => set({ activeTrack }),
	showPlayerLoading: (message = '加载中...') => showLoading(message, { type: 'player' }),
	hidePlayerLoading: () => hideLoading('player'),
	setPlayerError: (error) => setLoadingError(error, 'player'),
}))

// 导出一个hook来获取播放器加载状态
export const usePlayerLoading = () => useLoading('player')

export default usePlayerStore
