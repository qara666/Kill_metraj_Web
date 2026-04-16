import React, { useEffect, useState } from 'react'

type TTLBadgeProps = {
  remainingMs?: number | null
}

// Simple TTL badge with countdown. If remainingMs is undefined/null, badge is hidden.
const TTLBadge: React.FC<TTLBadgeProps> = ({ remainingMs }) => {
  const [remain, setRemain] = useState<number | null>(remainingMs ?? null)

  useEffect(() => {
    setRemain(remainingMs ?? null)
  }, [remainingMs])

  useEffect(() => {
    if (remain == null) return
    if (remain <= 0) return
    const t = setInterval(() => {
      setRemain(r => (r == null ? null : r - 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [remain])

  if (remain == null) {
    // TTL not yet computed for this group/order
    return <span className="ttl-badge ttl-pending">TTL pending</span>
  }
  if (remain <= 0) {
    return <span className="ttl-badge ttl-expired">TTL истёк</span>
  }
  const totalSeconds = Math.floor(remain / 1000)
  const mins = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  // Adaptive styling without custom CSS files: use Tailwind utility classes
  const tailColor = remain <= 60_000 ? 'text-red-700 bg-red-50' : (remain <= 5 * 60_000 ? 'text-amber-700 bg-amber-50' : 'text-emerald-700 bg-emerald-50')
  return (
    <span className={`ttl-badge ${tailColor} rounded px-2 py-1 text-xs font-semibold`}>TTL {mins}m {secs.toString().padStart(2, '0')}s</span>
  )
}

export default TTLBadge
