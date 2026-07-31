import { useMemo, useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import styles from './CalorieRing.module.css'

interface Props {
  current: number
  target: number
  onClick?: () => void
}

export default function CalorieRing({ current, target, onClick }: Props) {
  const chartRef = useRef<HTMLDivElement>(null)
  const chartInstanceRef = useRef<echarts.ECharts | null>(null)

  const percentage = useMemo(() => {
    if (target === 0) return 0
    return Math.min(Math.round((current / target) * 100), 100)
  }, [current, target])

  useEffect(() => {
    if (!chartRef.current) return

    chartInstanceRef.current = echarts.init(chartRef.current)

    return () => {
      chartInstanceRef.current?.dispose()
    }
  }, [])

  useEffect(() => {
    if (!chartInstanceRef.current) return

    const option = {
      series: [
        {
          type: 'pie',
          radius: ['65%', '85%'],
          center: ['50%', '50%'],
          startAngle: 90,
          silent: true,
          data: [
            {
              value: current,
              name: '已摄入',
              itemStyle: {
                color: new echarts.graphic.LinearGradient(0, 0, 1, 1, [
                  { offset: 0, color: '#ff6b6b' },
                  { offset: 1, color: '#ff8e8e' },
                ]),
              },
            },
            {
              value: Math.max(target - current, 0),
              name: '剩余',
              itemStyle: {
                color: '#e8e8e8',
              },
            },
          ],
          label: {
            show: false,
          },
        },
      ],
    }

    chartInstanceRef.current.setOption(option)
  }, [current, target])

  return (
    <div className={styles.container} onClick={onClick}>
      <div className={styles.chart} ref={chartRef} />
      <div className={styles.center}>
        <div className={styles.current}>
          {String(parseFloat(current.toFixed(1)))}
        </div>
        <div className={styles.unit}>千卡</div>
        <div className={styles.target}>
          目标 {target} · {percentage}%
        </div>
      </div>
    </div>
  )
}

