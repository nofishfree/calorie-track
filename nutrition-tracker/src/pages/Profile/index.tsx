import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { List, Dialog, Toast, Popup } from 'antd-mobile'
import { useAuthStore, useThemeStore, useOperationStore } from '../../stores'
import { userAPI, authAPI } from '../../api'
import { AvatarDisplay } from '../../components'
import styles from './index.module.css'

const LOCAL_ACCOUNT_ID = 'local-account'

export default function ProfilePage() {
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showAccountsPopup, setShowAccountsPopup] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showThemePopup, setShowThemePopup] = useState(false)
  const [showChangePasswordPopup, setShowChangePasswordPopup] = useState(false)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showOperationQueue, setShowOperationQueue] = useState(false)
  const [operations, setOperations] = useState<any[]>([])
  const [editingOperation, setEditingOperation] = useState<any>(null)
  const [showAddOperation, setShowAddOperation] = useState(false)
  const [newOperation, setNewOperation] = useState({
    operation_type: 'add' as const,
    entity_type: 'food' as const,
    data: '{}',
  })
  const navigate = useNavigate()
  const { user, isLoggedIn, isLocalAccount, logout, savedAccounts, currentAccountId, switchToAccount, removeSavedAccount } = useAuthStore()
  const { getQueue, removeOperation, addOperation } = useOperationStore()
  const { mode, setMode } = useThemeStore()

  const getThemeLabel = () => {
    const labels = {
      light: '浅色模式',
      dark: '深色模式',
      system: '跟随系统',
    }
    return labels[mode] || '浅色模式'
  }

  const handleLogoutConfirm = () => {
    logout()
    Toast.show('已切换到本地账号')
    setShowLogoutConfirm(false)
  }

  const handleDeleteAccount = async () => {
    setIsDeleting(true)
    try {
      await userAPI.deleteAccount()
      removeSavedAccount(user?.id || '')
      logout()
      Toast.show('账号已注销')
      setShowDeleteConfirm(false)
    } catch (error) {
      console.error('Failed to delete account:', error)
      Toast.show('注销失败，请重试')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSwitchAccount = () => {
    setShowAccountsPopup(true)
  }

  const handleSelectAccount = (account: { user: { id: string; email: string }; token: string }) => {
    if (account.user.id === currentAccountId) {
      setShowAccountsPopup(false)
      return
    }
    
    setShowAccountsPopup(false)
    switchToAccount(account.user.id)
    Toast.show('已切换账号')
  }

  const handleSelectLocalAccount = () => {
    setShowAccountsPopup(false)
    switchToAccount(LOCAL_ACCOUNT_ID)
    Toast.show('已切换到本地账号')
  }

  const handleAddAccount = () => {
    setShowAccountsPopup(false)
    navigate('/add-account')
  }

  const handleRemoveAccount = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    const account = savedAccounts.find(a => a.user.id === userId)
    if (!account) return
    
    Dialog.confirm({
      content: `确定移除账号 ${account.user.email}？`,
      onConfirm: () => {
        removeSavedAccount(userId)
      },
    })
  }

  const handleThemeChange = (newMode: 'light' | 'dark' | 'system') => {
    setMode(newMode)
    setShowThemePopup(false)
    const labels = {
      light: '浅色模式',
      dark: '深色模式',
      system: '跟随系统',
    }
    Toast.show(`已切换为${labels[newMode]}`)
  }

  const handleChangePassword = async () => {
    // 验证原密码
    if (!oldPassword.trim()) {
      Toast.show('请输入原密码')
      return
    }

    // 验证新密码
    if (!newPassword.trim()) {
      Toast.show('请输入新密码')
      return
    }

    if (newPassword.length < 6) {
      Toast.show('新密码至少需要6位')
      return
    }

    // 验证确认密码
    if (!confirmNewPassword.trim()) {
      Toast.show('请确认新密码')
      return
    }

    if (newPassword !== confirmNewPassword) {
      Toast.show('两次输入的新密码不一致')
      return
    }

    setIsChangingPassword(true)
    try {
      await authAPI.changePassword(oldPassword, newPassword)
      Toast.show('密码修改成功')
      setShowChangePasswordPopup(false)
      // 重置表单
      setOldPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
    } catch (error) {
      console.error('Failed to change password:', error)
      const errorMessage = error instanceof Error ? error.message : '修改失败，请重试'
      Toast.show(errorMessage)
    } finally {
      setIsChangingPassword(false)
    }
  }

  // ===== 操作队列管理（管理员功能）=====

  const loadOperations = () => {
    const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
    setOperations(getQueue(userId))
  }

  const handleOpenOperationQueue = () => {
    loadOperations()
    setShowOperationQueue(true)
  }

  const handleCloseOperationQueue = () => {
    setShowOperationQueue(false)
    setEditingOperation(null)
    setShowAddOperation(false)
  }

  const handleDeleteOperation = (operationId: string) => {
    const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
    removeOperation(userId, operationId)
    loadOperations()
    Toast.show('已删除')
  }

  const handleEditOperation = (operation: any) => {
    setEditingOperation({
      ...operation,
      data: JSON.stringify(operation.data, null, 2),
    })
  }

  const handleSaveEdit = () => {
    if (!editingOperation) return
    try {
      const parsedData = JSON.parse(editingOperation.data)
      const userId = isLocalAccount ? LOCAL_ACCOUNT_ID : (currentAccountId || LOCAL_ACCOUNT_ID)
      removeOperation(userId, editingOperation.id)
      addOperation(
        editingOperation.entity_type,
        parsedData,
        editingOperation.operation_type
      )
      loadOperations()
      setEditingOperation(null)
      Toast.show('已保存')
    } catch {
      Toast.show('JSON 格式错误')
    }
  }

  const handleAddOperation = () => {
    try {
      const data = JSON.parse(newOperation.data)
      addOperation(newOperation.entity_type, data, newOperation.operation_type)
      loadOperations()
      setShowAddOperation(false)
      setNewOperation({
        operation_type: 'add' as const,
        entity_type: 'food' as const,
        data: '{}',
      })
      Toast.show('已添加')
    } catch {
      Toast.show('JSON 格式错误')
    }
  }

  return (
    <div className={`${styles.container} profile-page`}>
      <div className={styles.header}>
        <div
          className={styles.userInfo}
          onClick={() => navigate('/account-info')}
          style={{ cursor: 'pointer' }}
        >
          <AvatarDisplay hash={user?.avatar} size={48} className={styles.avatar} />
          <div className={styles.userDetail}>
            <span className={styles.email}>{user?.username || user?.email}</span>
            {isLocalAccount && <span className={styles.localTag}>本地账号</span>}
          </div>
        </div>
        {!isLoggedIn && (
          <button className={styles.loginBtn} onClick={() => navigate('/login')}>
            登录
          </button>
        )}
      </div>

      <List className={styles.list}>
        <List.Item onClick={() => navigate('/goal-setting')} arrow>
          目标设置
        </List.Item>
        <List.Item onClick={() => navigate('/food-library')} arrow>
          食物库
        </List.Item>
        <List.Item onClick={() => setShowThemePopup(true)} arrow extra={getThemeLabel()}>
          背景设置
        </List.Item>
      </List>

      <List header="其他" className={styles.list}>
        <List.Item onClick={() => navigate('/metabolism')} arrow>
          代谢计算
        </List.Item>
        <List.Item arrow>关于</List.Item>
      </List>

      <List className={styles.list}>
        {isLoggedIn && (
          <List.Item onClick={() => setShowChangePasswordPopup(true)} className={styles.changePassword}>
            修改密码
          </List.Item>
        )}
        <List.Item onClick={handleSwitchAccount} className={styles.switchAccount}>
          切换账号
        </List.Item>
        {isLoggedIn && (
          <>
            <List.Item onClick={() => setShowLogoutConfirm(true)} className={styles.logout}>
              退出登录
            </List.Item>
            <List.Item onClick={() => setShowDeleteConfirm(true)} className={styles.deleteAccount}>
              注销账号
            </List.Item>
          </>
        )}
      </List>

      {user?.is_admin && (
        <List className={styles.list}>
          <List.Item onClick={handleOpenOperationQueue} className={styles.operationQueue}>
            ⚙️ 操作队列
          </List.Item>
        </List>
      )}

      <Dialog
        visible={showLogoutConfirm}
        content="确定退出登录并切换到本地账号吗？"
        onClose={() => setShowLogoutConfirm(false)}
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setShowLogoutConfirm(false) },
          { key: 'confirm', text: '确定', onClick: handleLogoutConfirm },
        ]}
      />

      <Dialog
        visible={showDeleteConfirm}
        content="注销后所有数据将被永久删除，不可恢复。确定要注销账号吗？"
        onClose={() => setShowDeleteConfirm(false)}
        actions={[
          { key: 'cancel', text: '取消', onClick: () => setShowDeleteConfirm(false) },
          { key: 'confirm', text: isDeleting ? '注销中...' : '确定', onClick: handleDeleteAccount },
        ]}
      />

      <Popup
        visible={showAccountsPopup}
        onMaskClick={() => setShowAccountsPopup(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
        }}
      >
        <h3 className={styles.popupTitle}>切换账号</h3>
        <div className={styles.accountsList}>
          <div
            className={`${styles.accountItem} ${currentAccountId === LOCAL_ACCOUNT_ID ? styles.currentAccount : ''}`}
            onClick={handleSelectLocalAccount}
          >
            <div className={styles.accountInfo}>
              <div className={styles.accountAvatar}>
                <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                </svg>
              </div>
              <div className={styles.accountDetail}>
                <span className={styles.accountEmail}>本地账号</span>
                {currentAccountId === LOCAL_ACCOUNT_ID && (
                  <span className={styles.currentTag}>当前账号</span>
                )}
              </div>
            </div>
          </div>
          {savedAccounts.map(account => (
            <div
              key={account.user.id}
              className={`${styles.accountItem} ${account.user.id === currentAccountId ? styles.currentAccount : ''}`}
              onClick={() => handleSelectAccount(account)}
            >
              <div className={styles.accountInfo}>
                <div className={styles.accountAvatar}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <div className={styles.accountDetail}>
                  <span className={styles.accountEmail}>{account.user.email}</span>
                  {account.user.id === currentAccountId && (
                    <span className={styles.currentTag}>当前账号</span>
                  )}
                </div>
              </div>
              {savedAccounts.length > 1 && (
                <button
                  className={styles.removeBtn}
                  onClick={(e) => handleRemoveAccount(account.user.id, e)}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button className={styles.addAccountBtn} onClick={handleAddAccount}>
            <span className={styles.addIcon}>+</span>
            <span>添加账号</span>
          </button>
        </div>
      </Popup>

      <Popup
        visible={showThemePopup}
        onMaskClick={() => setShowThemePopup(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
        }}
      >
        <h3 className={styles.popupTitle}>背景设置</h3>
        <div className={styles.themeOptions}>
          <button
            className={`${styles.themeOption} ${mode === 'light' ? styles.active : ''}`}
            onClick={() => handleThemeChange('light')}
          >
            浅色模式
          </button>
          <button
            className={`${styles.themeOption} ${mode === 'dark' ? styles.active : ''}`}
            onClick={() => handleThemeChange('dark')}
          >
            深色模式
          </button>
          <button
            className={`${styles.themeOption} ${mode === 'system' ? styles.active : ''}`}
            onClick={() => handleThemeChange('system')}
          >
            跟随系统
          </button>
        </div>
      </Popup>

      <Popup
        visible={showChangePasswordPopup}
        onMaskClick={() => setShowChangePasswordPopup(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 'calc(20px + var(--safe-area-bottom))',
        }}
      >
        <h3 className={styles.popupTitle}>修改密码</h3>
        <div className={styles.passwordForm}>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>原密码</label>
            <input
              type="password"
              placeholder="请输入原密码"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className={styles.passwordInput}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>新密码</label>
            <input
              type="password"
              placeholder="请输入新密码"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={styles.passwordInput}
            />
          </div>
          <div className={styles.formItem}>
            <label className={styles.formLabel}>确认新密码</label>
            <input
              type="password"
              placeholder="请再次输入新密码"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className={styles.passwordInput}
            />
          </div>
          <button
            className={styles.saveBtn}
            onClick={handleChangePassword}
            disabled={isChangingPassword}
          >
            {isChangingPassword ? '修改中...' : '保存'}
          </button>
        </div>
      </Popup>

      {/* 操作队列弹窗 */}
      <Popup
        visible={showOperationQueue}
        onMaskClick={handleCloseOperationQueue}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 'calc(20px + var(--safe-area-bottom))',
          maxHeight: '80vh',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 className={styles.popupTitle}>操作队列</h3>
            <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
              数据版本: {user?.data_version ?? 0}
            </span>
          </div>
          <button
            className={styles.addOperationBtn}
            onClick={() => setShowAddOperation(true)}
          >
            + 添加
          </button>
        </div>

        {operations.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#999', padding: '40px 0' }}>
            暂无操作记录
          </div>
        ) : (
          <div className={styles.operationsList}>
            {operations.map((op) => (
              <div key={op.id} className={styles.operationItem}>
                {editingOperation?.id === op.id ? (
                  <div className={styles.operationEditor}>
                    <div className={styles.editorRow}>
                      <span className={styles.editorLabel}>操作类型</span>
                      <select
                        value={editingOperation.operation_type}
                        onChange={(e) => setEditingOperation({ ...editingOperation, operation_type: e.target.value as any })}
                        className={styles.editorSelect}
                      >
                        <option value="add">add</option>
                        <option value="update">update</option>
                        <option value="delete">delete</option>
                      </select>
                    </div>
                    <div className={styles.editorRow}>
                      <span className={styles.editorLabel}>实体类型</span>
                      <select
                        value={editingOperation.entity_type}
                        onChange={(e) => setEditingOperation({ ...editingOperation, entity_type: e.target.value as any })}
                        className={styles.editorSelect}
                      >
                        <option value="food">food</option>
                        <option value="record">record</option>
                        <option value="plan">plan</option>
                        <option value="goal">goal</option>
                        <option value="account">account</option>
                      </select>
                    </div>
                    <div className={styles.editorRow}>
                      <span className={styles.editorLabel}>数据(JSON)</span>
                      <textarea
                        value={editingOperation.data}
                        onChange={(e) => setEditingOperation({ ...editingOperation, data: e.target.value })}
                        className={styles.editorTextarea}
                        rows={6}
                        placeholder="输入 JSON 数据"
                      />
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                      <button
                        className={styles.cancelBtn}
                        onClick={() => setEditingOperation(null)}
                      >
                        取消
                      </button>
                      <button
                        className={styles.saveBtn}
                        onClick={handleSaveEdit}
                      >
                        保存
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className={styles.operationHeader}>
                      <span className={`${styles.operationType} ${styles[`type_${op.operation_type}`]}`}>
                        {op.operation_type}
                      </span>
                      <span className={styles.operationEntity}>{op.entity_type}</span>
                      <span className={styles.operationId}>{op.id}</span>
                    </div>
                    <pre className={styles.operationData}>{JSON.stringify(op.data, null, 2)}</pre>
                    <div className={styles.operationFooter}>
                      <span className={styles.operationTime}>{op.created_at}</span>
                      <div className={styles.operationActions}>
                        <button className={styles.editBtn} onClick={() => handleEditOperation(op)}>编辑</button>
                        <button className={styles.deleteBtn} onClick={() => handleDeleteOperation(op.id)}>删除</button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </Popup>

      {/* 添加操作弹窗 */}
      <Popup
        visible={showAddOperation}
        onMaskClick={() => setShowAddOperation(false)}
        bodyStyle={{
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          padding: 20,
          paddingBottom: 'calc(20px + var(--safe-area-bottom))',
        }}
      >
        <h3 className={styles.popupTitle}>添加操作</h3>
        <div className={styles.operationEditor}>
          <div className={styles.editorRow}>
            <span className={styles.editorLabel}>操作类型</span>
            <select
              value={newOperation.operation_type}
              onChange={(e) => setNewOperation({ ...newOperation, operation_type: e.target.value as any })}
              className={styles.editorSelect}
            >
              <option value="add">add</option>
              <option value="update">update</option>
              <option value="delete">delete</option>
            </select>
          </div>
          <div className={styles.editorRow}>
            <span className={styles.editorLabel}>实体类型</span>
            <select
              value={newOperation.entity_type}
              onChange={(e) => setNewOperation({ ...newOperation, entity_type: e.target.value as any })}
              className={styles.editorSelect}
            >
              <option value="food">food</option>
              <option value="record">record</option>
              <option value="plan">plan</option>
              <option value="goal">goal</option>
              <option value="account">account</option>
            </select>
          </div>
          <div className={styles.editorRow}>
            <span className={styles.editorLabel}>数据(JSON)</span>
            <textarea
              value={newOperation.data}
              onChange={(e) => setNewOperation({ ...newOperation, data: e.target.value })}
              className={styles.editorTextarea}
              rows={6}
              placeholder="输入 JSON 数据（需包含 id 字段）"
            />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button
              className={styles.cancelBtn}
              onClick={() => setShowAddOperation(false)}
            >
              取消
            </button>
            <button
              className={styles.saveBtn}
              onClick={handleAddOperation}
            >
              添加
            </button>
          </div>
        </div>
      </Popup>
    </div>
  )
}

