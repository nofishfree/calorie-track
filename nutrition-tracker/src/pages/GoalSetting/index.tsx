import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Toast, Dialog } from 'antd-mobile'
import { EditSOutline, CloseOutline, CheckOutline } from 'antd-mobile-icons'
import { useGoalStore } from '../../stores'
import styles from './index.module.css'
import type { GoalTemplate } from '../../types'

function CustomPopup({ visible, onMaskClick, children }: { visible: boolean; onMaskClick: () => void; children: React.ReactNode }) {
  if (!visible) return null
  return (
    <div className={styles.customPopupOverlay} onClick={onMaskClick}>
      <div className={styles.customPopupContent} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

export default function GoalSettingPage() {
  const navigate = useNavigate()
  const { getTemplates, deleteTemplate, setCurrentTemplate } = useGoalStore()
  
  const [templates, setTemplates] = useState<GoalTemplate[]>([])
  const [isLoaded, setIsLoaded] = useState(false)
  const [showAddPopup, setShowAddPopup] = useState(false)

  useEffect(() => {
    const loadTemplates = () => {
      const result = getTemplates()
      setTemplates(result)
      setIsLoaded(true)
    }
    
    loadTemplates()
    const unsubscribe = useGoalStore.subscribe(() => {
      setTemplates(getTemplates())
    })
    
    return unsubscribe
  }, [getTemplates])

  const handleSetCurrent = (templateId: string) => {
    setCurrentTemplate(templateId)
    Toast.show('已设置为当前目标')
    setTemplates(getTemplates())
  }

  const handleEdit = (template: GoalTemplate) => {
    if (template.type === 'daily') {
      navigate(`/goal-setting/daily/${template.id}`)
    } else {
      navigate(`/goal-setting/cycle/${template.id}`)
    }
  }

  const handleDelete = async (templateId: string) => {
    const result = await Dialog.confirm({
      content: '确定删除这个目标吗？',
    })
    if (!result) return

    deleteTemplate(templateId)
    Toast.show('目标已删除')
    setTemplates(getTemplates())
  }

  const handleAddGoal = () => {
    setShowAddPopup(true)
  }

  const handleSelectGoalType = (type: 'daily' | 'cycle') => {
    setShowAddPopup(false)
    if (type === 'daily') {
      navigate('/goal-setting/daily')
    } else {
      navigate('/goal-setting/cycle')
    }
  }

  if (!isLoaded) {
    return null
  }

  return (
    <>
      <div className={`${styles.container} goal-setting-page`}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={() => navigate('/')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="24" height="24">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className={styles.title}>目标设置</h1>
          <div style={{ width: 40 }} />
        </div>

        <div className={styles.content}>
          {templates.length === 0 ? (
            <div className={styles.emptyState}>
              <p>暂无目标模板</p>
            </div>
          ) : (
            <div className={styles.templateList}>
              {templates.map((template) => (
                <div key={template.id} className={styles.templateItem}>
                  <div className={styles.templateInfo}>
                    <div className={styles.templateNameRow}>
                      <span className={styles.templateName}>{template.name}</span>
                      {template.is_current && (
                        <span className={styles.currentBadge}>当前目标</span>
                      )}
                    </div>
                    <span className={styles.templateType}>
                      {template.type === 'daily' ? '每日目标' : `周期目标(${template.cycle_days || 1}天)`}
                    </span>
                  </div>
                  <div className={styles.templateActions}>
                    {!template.is_current && (
                      <button
                        className={`${styles.actionBtn} ${styles.setCurrentBtn}`}
                        onClick={() => handleSetCurrent(template.id)}
                      >
                        <CheckOutline fontSize={16} />
                      </button>
                    )}
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleEdit(template)}
                    >
                      <EditSOutline fontSize={16} />
                    </button>
                    <button
                      className={styles.actionBtn}
                      onClick={() => handleDelete(template.id)}
                    >
                      <CloseOutline fontSize={16} />
                    </button>
                  </div>
                </div>
              ))}
              <button className={styles.addBtn} onClick={handleAddGoal}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                <span>添加目标</span>
              </button>
            </div>
          )}
        </div>
      </div>

      <CustomPopup
      visible={showAddPopup}
      onMaskClick={() => setShowAddPopup(false)}
    >
      <div className={styles.addPopup}>
        <div className={styles.addPopupHeader}>
          <h3 className={styles.addPopupTitle}>选择目标类型</h3>
        </div>
        <div className={styles.addPopupContent}>
          <button
            className={styles.typeCard}
            onClick={() => handleSelectGoalType('daily')}
          >
            <div className={styles.typeIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <div className={styles.typeInfo}>
              <span className={styles.typeName}>每日目标</span>
              <span className={styles.typeDesc}>每天使用相同的目标值</span>
            </div>
          </button>
          <button
            className={styles.typeCard}
            onClick={() => handleSelectGoalType('cycle')}
          >
            <div className={styles.typeIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 21h5v-5" />
              </svg>
            </div>
            <div className={styles.typeInfo}>
              <span className={styles.typeName}>周期目标</span>
              <span className={styles.typeDesc}>多日循环目标计划</span>
            </div>
          </button>
        </div>
      </div>
    </CustomPopup>
    </>
  )
}
