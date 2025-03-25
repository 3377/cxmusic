import { GlobalState } from '@/utils/stateMapper'

interface LoadingState {
	visible: boolean
	message?: string
	progress?: number
	type?: 'default' | 'player' | 'lyric' | 'webdav' | 'list'
	error?: string
	isIndeterminate?: boolean
}

// 全局加载状态管理
export const loadingStore = new GlobalState<LoadingState>({
	visible: false,
	message: '',
	progress: 0,
	type: 'default',
	isIndeterminate: true,
})

// 显示加载提示
export const showLoading = (
	message?: string,
	options?: {
		type?: LoadingState['type']
		progress?: number
		isIndeterminate?: boolean
	},
) => {
	loadingStore.setValue({
		visible: true,
		message,
		type: options?.type || 'default',
		progress: options?.progress || 0,
		isIndeterminate: options?.isIndeterminate ?? true,
	})
}

// 隐藏加载提示
export const hideLoading = (type?: LoadingState['type']) => {
	const currentState = loadingStore.getValue()
	if (!type || currentState.type === type) {
		loadingStore.setValue({
			visible: false,
			message: '',
			progress: 0,
			type: 'default',
			isIndeterminate: true,
		})
	}
}

// 更新加载进度
export const updateLoadingProgress = (progress: number, message?: string) => {
	const currentState = loadingStore.getValue()
	if (!currentState.visible) return

	loadingStore.setValue({
		...currentState,
		progress,
		isIndeterminate: false,
		...(message ? { message } : {}),
	})
}

// 设置加载错误
export const setLoadingError = (error: string, type?: LoadingState['type']) => {
	const currentState = loadingStore.getValue()
	if (!type || currentState.type === type) {
		loadingStore.setValue({
			...currentState,
			error,
		})
	}
}

// 使用加载状态的Hook
export const useLoading = (type: LoadingState['type'] = 'default') => {
	const state = loadingStore.useValue()
	return {
		isLoading: state.visible && state.type === type,
		message: state.message,
		progress: state.progress,
		error: state.error,
		isIndeterminate: state.isIndeterminate,
	}
}

export default {
	loadingStore,
	showLoading,
	hideLoading,
	updateLoadingProgress,
	setLoadingError,
	useLoading,
}
