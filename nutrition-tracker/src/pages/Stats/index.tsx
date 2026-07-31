import { useState, useMemo, useEffect, useRef } from 'react'
import { Tabs } from 'antd-mobile'
import * as echarts from 'echarts'
import { useRecordStore, useGoalStore } from '../../stores'
import { getWeekDates, getMonthDates } from '../../utils/helpers'
import dayjs from 'dayjs'
import styles from './index.module.css'

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState('week')
  const chartRef = useRef<HTMLDivElement>(null)
  const { getDailyNutrition } = useRecordStore()
  const goalStore = useGoalStore()
  const goal = goalStore.getCurrentGoal()

  useEffect(() => {
    goalStore.checkAndUpdateDate()
  }, [goalStore, activeTab])

  const dates = useMemo(() => {
    return activeTab === 'week' ? getWeekDates() : getMonthDates()
  }, [activeTab])

  const chartData = useMemo(() => {
    return dates.map((date) => ({
      date,
      nutrition: getDailyNutrition(date),
    }))
  }, [dates, getDailyNutrition])

  const avgNutrition = useMemo(() => {
    const total = chartData.reduce(
      (acc, d) => ({
        calories: acc.calories + d.nutrition.calories,
        protein: acc.protein + d.nutrition.protein,
        carbs: acc.carbs + d.nutrition.carbs,
        fat: acc.fat + d.nutrition.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    )
    const len = chartData.length || 1
    return {
      calories: Math.round(total.calories / len),
      protein: Math.round(total.protein / len),
      carbs: Math.round(total.carbs / len),
      fat: Math.round(total.fat / len),
    }
  }, [chartData])

  useEffect(() => {
    if (!chartRef.current) return

    const chart = echarts.init(chartRef.current)
    const option = {
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: dates.map((d) => dayjs(d).format('MM-DD')),
        axisLabel: {
          fontSize: 10,
          color: '#999',
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 10,
          color: '#999',
        },
      },
      series: [
        {
          name: '热量',
          type: 'line',
          smooth: true,
          data: chartData.map((d) => d.nutrition.calories),
          itemStyle: {
            color: '#ff6b6b',
          },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(255, 107, 107, 0.3)' },
              { offset: 1, color: 'rgba(255, 107, 107, 0.05)' },
            ]),
          },
        },
        {
          name: '目标',
          type: 'line',
          data: dates.map(() => goal.calorie_target),
          itemStyle: {
            color: '#999',
          },
          lineStyle: {
            type: 'dashed',
          },
        },
      ],
    }
    chart.setOption(option)

    return () => chart.dispose()
  }, [dates, chartData, goal.calorie_target])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.title}>统计</h2>
      </header>

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        style={{
          '--title-font-size': '14px',
        }}
      >
        <Tabs.Tab key="week" title="近7天" />
        <Tabs.Tab key="month" title="近30天" />
      </Tabs>

      <section className={styles.chartSection}>
        <h3 className={styles.sectionTitle}>热量摄入趋势</h3>
        <div ref={chartRef} className={styles.chart} />
      </section>

      <section className={styles.avgSection}>
        <h3 className={styles.sectionTitle}>平均摄入</h3>
        <div className={styles.avgCards}>
          <div className={styles.avgCard}>
            <div className={styles.avgLabel}>热量</div>
            <div className={styles.avgValue}>
              {avgNutrition.calories}
              <span className={styles.avgUnit}>kcal</span>
            </div>
            <div className={styles.avgTarget}>
              目标 {goal.calorie_target} kcal
            </div>
          </div>
          <div className={styles.avgCard}>
            <div className={styles.avgLabel}>蛋白质</div>
            <div className={styles.avgValue}>
              {avgNutrition.protein}
              <span className={styles.avgUnit}>g</span>
            </div>
            <div className={styles.avgTarget}>目标 {goal.protein_target_g}g</div>
          </div>
          <div className={styles.avgCard}>
            <div className={styles.avgLabel}>碳水</div>
            <div className={styles.avgValue}>
              {avgNutrition.carbs}
              <span className={styles.avgUnit}>g</span>
            </div>
            <div className={styles.avgTarget}>目标 {goal.carb_target_g}g</div>
          </div>
          <div className={styles.avgCard}>
            <div className={styles.avgLabel}>脂肪</div>
            <div className={styles.avgValue}>
              {avgNutrition.fat}
              <span className={styles.avgUnit}>g</span>
            </div>
            <div className={styles.avgTarget}>目标 {goal.fat_target_g}g</div>
          </div>
        </div>
      </section>

      <section className={styles.dailySection}>
        <h3 className={styles.sectionTitle}>每日摘要</h3>
        <div className={styles.dailyList}>
          {dates
            .slice()
            .reverse()
            .map((date) => {
              const nutrition = getDailyNutrition(date)
              return (
                <div key={date} className={styles.dailyItem}>
                  <span className={styles.dailyDate}>
                    {dayjs(date).format('MM-DD')}
                  </span>
                  <span className={styles.dailyCal}>
                    {nutrition.calories} kcal
                  </span>
                  <span className={styles.dailyPercent}>
                    {Math.round((nutrition.calories / goal.calorie_target) * 100)}%
                  </span>
                </div>
              )
            })}
        </div>
      </section>
    </div>
  )
}

