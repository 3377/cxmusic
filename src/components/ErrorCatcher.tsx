import { colors } from '@/styles/colors'
import { logError } from '@/utils/logger'
import { Feather } from '@expo/vector-icons'
import React, { Component, ErrorInfo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'

interface Props {
	children: React.ReactNode
	fallback?: React.ReactNode
	onRetry?: () => void
	onError?: (error: Error, errorInfo: ErrorInfo) => void
	renderFallback?: (error: Error, retry: () => void) => React.ReactNode
}

interface State {
	hasError: boolean
	error: Error | null
	errorInfo: ErrorInfo | null
	errorCount: number // 添加错误计数器
}

/**
 * 错误捕获组件 - 捕获子组件中的渲染错误并提供恢复机制
 */
class ErrorCatcher extends Component<Props, State> {
	private retryTimer: NodeJS.Timeout | null = null

	constructor(props: Props) {
		super(props)
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			errorCount: 0, // 初始化错误计数
		}
	}

	static getDerivedStateFromError(error: Error): Partial<State> {
		return { hasError: true, error }
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		// 记录捕获到的错误
		logError('ErrorCatcher捕获到错误:', error, errorInfo)

		// 更新状态并递增错误计数
		this.setState((prevState) => ({
			errorInfo,
			errorCount: prevState.errorCount + 1,
		}))

		// 通知父组件发生错误
		if (this.props.onError) {
			this.props.onError(error, errorInfo)
		}

		// 自动恢复尝试
		this.scheduleAutomaticRetry()
	}

	componentWillUnmount() {
		// 清除自动重试计时器
		if (this.retryTimer) {
			clearTimeout(this.retryTimer)
			this.retryTimer = null
		}
	}

	// 计划自动重试
	scheduleAutomaticRetry() {
		// 清除现有计时器
		if (this.retryTimer) {
			clearTimeout(this.retryTimer)
		}

		// 如果错误次数少于3次，安排自动重试
		if (this.state.errorCount < 3) {
			const retryDelay = this.state.errorCount * 1000 + 2000 // 延迟递增
			logError(`ErrorCatcher: 将在${retryDelay}ms后自动重试 (第${this.state.errorCount}次错误)`)

			this.retryTimer = setTimeout(() => {
				this.handleRetry()
			}, retryDelay)
		}
	}

	// 处理重试
	handleRetry = () => {
		// 重置错误状态
		this.setState({
			hasError: false,
			error: null,
			errorInfo: null,
		})

		// 调用外部重试回调
		if (this.props.onRetry) {
			this.props.onRetry()
		}
	}

	// 默认的错误UI
	renderDefaultFallback() {
		const { error, errorCount } = this.state
		const isRecoverable = errorCount < 5 // 5次以上的错误认为不可恢复

		return (
			<View style={styles.errorContainer}>
				<Feather name="alert-triangle" size={48} color={colors.warning} />
				<Text style={styles.errorTitle}>应用遇到了问题</Text>
				<Text style={styles.errorMessage}>{error?.message || '发生了未知错误'}</Text>

				{isRecoverable ? (
					<>
						<TouchableOpacity style={styles.retryButton} onPress={this.handleRetry}>
							<Text style={styles.retryText}>重试</Text>
						</TouchableOpacity>
						<Text style={styles.errorInfo}>
							{errorCount > 1 ? `已尝试恢复 ${errorCount} 次` : ''}
						</Text>
					</>
				) : (
					<Text style={styles.errorSevere}>多次尝试后仍无法恢复，请尝试重启应用</Text>
				)}
			</View>
		)
	}

	render() {
		const { hasError } = this.state
		const { children, fallback, renderFallback } = this.props

		if (hasError) {
			// 使用自定义渲染
			if (renderFallback) {
				return renderFallback(this.state.error!, this.handleRetry)
			}

			// 使用提供的fallback
			if (fallback) {
				return fallback
			}

			// 使用默认错误UI
			return this.renderDefaultFallback()
		}

		return children
	}
}

const styles = StyleSheet.create({
	errorContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: colors.background,
		padding: 20,
	},
	errorTitle: {
		fontSize: 18,
		fontWeight: 'bold',
		color: colors.text,
		marginTop: 16,
		marginBottom: 8,
	},
	errorMessage: {
		fontSize: 14,
		color: colors.textMuted,
		textAlign: 'center',
		marginBottom: 24,
		paddingHorizontal: 20,
	},
	retryButton: {
		backgroundColor: colors.primary,
		paddingHorizontal: 20,
		paddingVertical: 10,
		borderRadius: 8,
		marginTop: 8,
	},
	retryText: {
		color: '#fff',
		fontWeight: 'bold',
	},
	errorInfo: {
		fontSize: 12,
		color: colors.textMuted,
		marginTop: 16,
	},
	errorSevere: {
		fontSize: 14,
		color: colors.warning,
		marginTop: 16,
		textAlign: 'center',
	},
})

export default ErrorCatcher
