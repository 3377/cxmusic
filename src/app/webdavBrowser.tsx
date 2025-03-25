import React, { useEffect, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator, Alert, StyleSheet, BackHandler } from 'react-native'
import { Stack, Link, useRouter } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { colors } from '@/constants/tokens'
import { logError, logInfo } from '@/helpers/logger'
import { getCurrentWebDAVServer, getDirectoryContents, WebDAVFile } from '@/helpers/webdavService'
import { formatBytes } from '@/utils/formatter'

// 格式化日期工具函数
const formatDate = (dateString: string) => {
  try {
    if (!dateString) return '未知日期'
    const date = new Date(dateString)
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
  } catch (error) {
    return '日期格式错误'
  }
}

// 文件项组件
const FileItem = ({ file, onPress }) => {
  const isDirectory = file.type === 'directory'

  return (
    <TouchableOpacity
      onPress={() => onPress(file)}
      style={styles.fileItem}
    >
      <View style={styles.fileRow}>
        <Feather
          name={isDirectory ? 'folder' : 'file'}
          size={24}
          color={isDirectory ? colors.primary : colors.text}
          style={styles.fileIcon}
        />
        <View style={styles.fileInfo}>
          <Text style={styles.fileName}>{file.basename}</Text>
          <Text style={styles.fileDetails}>
            {isDirectory ? '文件夹' : formatBytes(file.size || 0)} • {formatDate(file.lastmod)}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  )
}

// 安全的WebDAV浏览器组件
export default function WebDAVBrowser() {
  const router = useRouter()
  const [files, setFiles] = useState<WebDAVFile[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('/')
  const [pathHistory, setPathHistory] = useState<string[]>([])
  const [currentServer, setCurrentServer] = useState<any>(null)
  
  // 监听返回键
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (pathHistory.length > 0) {
        handleBack()
        return true
      } else {
        router.back()
        return true
      }
    })
    
    return () => backHandler.remove()
  }, [pathHistory])
  
  // 初始化 - 获取当前服务器
  useEffect(() => {
    const initServer = () => {
      setIsLoading(true)
      
      try {
        const server = getCurrentWebDAVServer()
        setCurrentServer(server)
        
        if (!server) {
          setError('请先配置WebDAV服务器')
          setIsLoading(false)
          return
        }
        
        // 获取根目录文件
        loadFiles('/')
      } catch (err) {
        logError('WebDAV浏览器初始化失败:', err)
        setError('无法初始化WebDAV: ' + (err.message || '未知错误'))
        setIsLoading(false)
      }
    }
    
    initServer()
  }, [])
  
  // 加载指定路径的文件
  const loadFiles = async (path: string) => {
    if (!currentServer && path !== '/') {
      setError('未连接到WebDAV服务器')
      setIsLoading(false)
      return
    }
    
    setIsLoading(true)
    setError(null)
    
    try {
      // 设置10秒超时
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 10000)
      
      // 获取目录内容
      const filesData = await getDirectoryContents(path)
      clearTimeout(timeoutId)
      
      if (filesData && Array.isArray(filesData)) {
        // 排序: 目录优先，然后按名称
        const sortedFiles = [...filesData].sort((a, b) => {
          if (a.type === 'directory' && b.type !== 'directory') return -1
          if (a.type !== 'directory' && b.type === 'directory') return 1
          return a.basename.localeCompare(b.basename)
        })
        
        setFiles(sortedFiles)
      } else {
        setFiles([])
      }
    } catch (err) {
      logError('获取WebDAV文件列表失败:', err)
      setError('无法获取文件列表: ' + (err.message || '网络错误'))
    } finally {
      setIsLoading(false)
    }
  }
  
  // 处理文件/目录点击
  const handleFilePress = (file) => {
    if (file.type === 'directory') {
      // 保存当前路径到历史
      setPathHistory([...pathHistory, currentPath])
      // 设置新路径
      setCurrentPath(file.path)
      // 加载新目录
      loadFiles(file.path)
    } else {
      // 处理文件点击
      Alert.alert(
        '文件信息',
        `文件名: ${file.basename}\n大小: ${formatBytes(file.size || 0)}\n类型: ${file.mime || '未知'}\n修改时间: ${formatDate(file.lastmod)}`,
        [
          { text: '确定', style: 'cancel' }
        ]
      )
    }
  }
  
  // 返回上一级目录
  const handleBack = () => {
    if (pathHistory.length > 0) {
      const prevPath = pathHistory[pathHistory.length - 1]
      setCurrentPath(prevPath)
      setPathHistory(pathHistory.slice(0, -1))
      loadFiles(prevPath)
    }
  }
  
  // 刷新当前目录
  const handleRefresh = () => {
    loadFiles(currentPath)
  }
  
  return (
    <>
      <Stack.Screen 
        options={{
          title: '文件浏览',
          headerLeft: () => (
            <TouchableOpacity onPress={() => router.back()} style={{ paddingLeft: 8 }}>
              <Feather name="arrow-left" size={24} color={colors.primary} />
            </TouchableOpacity>
          ),
          headerRight: () => (
            <TouchableOpacity onPress={handleRefresh} style={{ paddingRight: 16 }}>
              <Feather name="refresh-cw" size={20} color={colors.primary} />
            </TouchableOpacity>
          )
        }}
      />
      
      <View style={styles.container}>
        {/* 当前路径显示 */}
        <View style={styles.pathBar}>
          <Text style={styles.pathText} numberOfLines={1} ellipsizeMode="middle">
            {currentPath === '/' ? '根目录' : currentPath}
          </Text>
          
          {pathHistory.length > 0 && (
            <TouchableOpacity onPress={handleBack} style={styles.backButton}>
              <Feather name="chevron-up" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
        </View>
        
        {/* 错误状态 */}
        {error ? (
          <View style={styles.centerContainer}>
            <Feather name="alert-triangle" size={48} color="red" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.button}>
              <Text style={styles.buttonText}>重试</Text>
            </TouchableOpacity>
            
            <Link href="/webdavModal" asChild>
              <TouchableOpacity style={[styles.button, { marginTop: 10 }]}>
                <Text style={styles.buttonText}>WebDAV设置</Text>
              </TouchableOpacity>
            </Link>
          </View>
        ) : isLoading ? (
          // 加载状态
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>加载中...</Text>
          </View>
        ) : files.length === 0 ? (
          // 空目录状态
          <View style={styles.centerContainer}>
            <Feather name="folder" size={48} color={colors.textMuted} />
            <Text style={styles.emptyText}>文件夹为空</Text>
            <TouchableOpacity onPress={handleRefresh} style={styles.button}>
              <Text style={styles.buttonText}>刷新</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // 文件列表
          <FlatList
            data={files}
            renderItem={({ item }) => <FileItem file={item} onPress={handleFilePress} />}
            keyExtractor={(item) => item.path + item.basename}
            contentContainerStyle={styles.listContent}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
          />
        )}
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  pathBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.card || '#1e1e1e',
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#333',
  },
  pathText: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  backButton: {
    marginLeft: 8,
    padding: 4,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    marginTop: 16,
    color: colors.text,
    fontSize: 16,
    textAlign: 'center',
  },
  loadingText: {
    marginTop: 16,
    color: colors.text,
  },
  emptyText: {
    marginTop: 16,
    color: colors.text,
    fontSize: 16,
  },
  button: {
    marginTop: 16,
    backgroundColor: colors.primary,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
  },
  listContent: {
    paddingBottom: 20,
  },
  fileItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border || '#333',
  },
  fileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileIcon: {
    marginRight: 12,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    color: colors.text,
    fontSize: 16,
  },
  fileDetails: {
    color: colors.textMuted || '#888',
    fontSize: 12,
    marginTop: 2,
  },
}); 