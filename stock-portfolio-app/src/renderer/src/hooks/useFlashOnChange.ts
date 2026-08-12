import { useEffect, useRef, useState } from 'react'

export type FlashDirection = 'up' | 'down' | null

/**
 * 값이 바뀔 때마다 잠깐 'up'/'down'을 반환해서 UI에서 깜빡임 효과를 줄 수 있게 하는 훅.
 * 값 자체는 저장하지 않고 방향만 반환하므로 상태가 거의 없다 — 필요 없어지면
 * 호출부에서 이 훅 호출과 className 적용만 걷어내면 되도록 최대한 독립적으로 만들었다.
 */
export function useFlashOnChange(value: number | null | undefined, durationMs = 800): FlashDirection {
  const prevRef = useRef<number | null | undefined>(value)
  const [flash, setFlash] = useState<FlashDirection>(null)

  useEffect(() => {
    const prev = prevRef.current
    prevRef.current = value
    if (prev == null || value == null || value === prev) return undefined

    setFlash(value > prev ? 'up' : 'down')
    const id = setTimeout(() => setFlash(null), durationMs)
    return () => clearTimeout(id)
  }, [value, durationMs])

  return flash
}
