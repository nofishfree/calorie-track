interface Props {
  onClick: () => void
  className?: string
}

export default function BackButton({ onClick, className }: Props) {
  return (
    <button className={className} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="24" height="24">
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
    </button>
  )
}
