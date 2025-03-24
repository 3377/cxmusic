/**
 * 格式化字节大小为人类可读格式
 * @param bytes 字节数
 * @param decimals 小数位数
 * @returns 格式化后的字符串，如 "1.5 KB", "2.3 MB"
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
	if (bytes === 0) return '0 B'

	const k = 1024
	const dm = decimals < 0 ? 0 : decimals
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

	const i = Math.floor(Math.log(bytes) / Math.log(k))

	return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i]
}

/**
 * 格式化日期时间
 * @param date 日期对象或日期字符串
 * @param format 格式化模板，默认为 'YYYY-MM-DD HH:mm:ss'
 * @returns 格式化后的日期字符串
 */
export function formatDateTime(
	date: Date | string,
	format: string = 'YYYY-MM-DD HH:mm:ss',
): string {
	const d = typeof date === 'string' ? new Date(date) : date

	if (isNaN(d.getTime())) {
		return '无效日期'
	}

	const year = d.getFullYear()
	const month = d.getMonth() + 1
	const day = d.getDate()
	const hours = d.getHours()
	const minutes = d.getMinutes()
	const seconds = d.getSeconds()

	return format
		.replace('YYYY', year.toString())
		.replace('MM', month.toString().padStart(2, '0'))
		.replace('DD', day.toString().padStart(2, '0'))
		.replace('HH', hours.toString().padStart(2, '0'))
		.replace('mm', minutes.toString().padStart(2, '0'))
		.replace('ss', seconds.toString().padStart(2, '0'))
}

/**
 * 格式化持续时间（毫秒）为时分秒格式
 * @param duration 持续时间（毫秒）
 * @param showHours 是否显示小时部分
 * @returns 格式化后的持续时间字符串，如 "03:45" 或 "1:23:45"
 */
export function formatDuration(duration: number, showHours: boolean = false): string {
	if (isNaN(duration) || duration < 0) {
		return '00:00'
	}

	const seconds = Math.floor((duration / 1000) % 60)
	const minutes = Math.floor((duration / (1000 * 60)) % 60)
	const hours = Math.floor(duration / (1000 * 60 * 60))

	if (showHours || hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
	}

	return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}
