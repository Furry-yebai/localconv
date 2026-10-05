import { ArrowUpRight, LockKeyOpen } from '@phosphor-icons/react'

export default function UnlockTip() {
  return (
    <a
      className="unlock-tip"
      href="https://unlock.yebaiwn.top"
      target="_blank"
      rel="noreferrer"
    >
      <span className="unlock-tip-icon">
        <LockKeyOpen size={22} aria-hidden />
      </span>
      <span className="unlock-tip-body">
        <span className="unlock-tip-title">遇到加密音频了？</span>
        <span className="unlock-tip-text">受保护的音频无法直接转换，先解锁再回来继续。</span>
      </span>
      <span className="unlock-tip-cta">
        前往这个地方解锁吧
        <ArrowUpRight size={15} aria-hidden />
      </span>
    </a>
  )
}
