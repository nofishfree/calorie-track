import { getDB } from '../db/db'
import type { LocalAvatar } from '../db/types'
import { syncAPI } from '../api'
import { useAuthStore } from './authStore'

// 正在上传的头像哈希集合，用于去重，避免重复上传
const uploadingHashes = new Set<string>()

// 计算字符串的 SHA-256 哈希值
export async function computeHash(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// 头像存储管理
export const avatarStore = {
  /**
   * 并发检查头像哈希是否在数据库中，不在则上传（非阻塞，不影响接口）
   * 仅在已登录且非本地账号时执行
   */
  async syncAvatarToServer(hash: string, data: string): Promise<void> {
    const { isLocalAccount, isLoggedIn } = useAuthStore.getState()
    if (isLocalAccount || !isLoggedIn) return

    // 去重：避免同一哈希同时发起多次上传
    if (uploadingHashes.has(hash)) return
    uploadingHashes.add(hash)

    try {
      // 检查服务器是否已存在该头像
      const response = await syncAPI.checkAvatar(hash)
      const exists = response.data?.exists
      if (exists) return

      // 不存在则上传
      await syncAPI.uploadAvatar({ hash, data })
    } catch (error) {
      console.error('Failed to sync avatar to server:', error)
    } finally {
      uploadingHashes.delete(hash)
    }
  },

  // 保存头像到本地 IndexedDB（写入时机）
  async saveAvatar(hash: string, data: string): Promise<void> {
    const db = await getDB()
    const avatar: LocalAvatar = {
      hash,
      data,
      created_at: Date.now(),
    }
    await db.put('avatars', avatar)

    // 并发检查并上传（不阻塞）
    this.syncAvatarToServer(hash, data)
  },

  // 从本地 IndexedDB 获取头像数据（查询时机）
  async getAvatar(hash: string): Promise<string | null> {
    const db = await getDB()
    const avatar = await db.get('avatars', hash)
    const data = avatar?.data || null

    // 查询到数据时，并发检查并上传（不阻塞）
    if (data) {
      this.syncAvatarToServer(hash, data)
    }

    return data
  },

  // 检查本地是否存在头像
  async hasAvatar(hash: string): Promise<boolean> {
    const db = await getDB()
    const avatar = await db.get('avatars', hash)
    return !!avatar
  },

  // 从服务器获取头像并保存到本地（修改时机）
  async fetchAvatarFromServer(hash: string): Promise<string | null> {
    try {
      // 先检查服务器是否存在该头像，避免 404 报错
      const checkRes = await syncAPI.checkAvatar(hash)
      if (!checkRes.data?.exists) return null

      const response = await syncAPI.getAvatar(hash)
      if (response.data?.data) {
        // 保存到本地（会触发 syncAvatarToServer）
        await this.saveAvatar(hash, response.data.data)
        return response.data.data
      }
      return null
    } catch (error) {
      console.error('Failed to fetch avatar from server:', error)
      return null
    }
  },

  // 获取头像数据（优先本地，不存在则从服务器获取）
  async getOrFetchAvatar(hash: string): Promise<string | null> {
    // 先从本地获取
    const localData = await this.getAvatar(hash)
    if (localData) return localData

    // 本地不存在，从服务器获取
    return await this.fetchAvatarFromServer(hash)
  },

  // 删除本地头像
  async deleteAvatar(hash: string): Promise<void> {
    const db = await getDB()
    await db.delete('avatars', hash)
  },
}
