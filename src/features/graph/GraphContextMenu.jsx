import { useEffect, useRef } from 'react'

const MENU_WIDTH = 180

export default function GraphContextMenu({ x, y, experiment, onOpen, onComplete, onChangeOutcome, onClose }) {
  const menuRef = useRef(null)

  useEffect(() => {
    function onMouseDown(e) {
      if (!menuRef.current?.contains(e.target)) onClose()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const left = x + MENU_WIDTH > window.innerWidth ? x - MENU_WIDTH : x

  return (
    <div
      ref={menuRef}
      style={{ position: 'fixed', top: y, left, zIndex: 50, minWidth: MENU_WIDTH }}
      className="bg-white border border-gray-200 rounded-lg shadow-xl py-1"
    >
      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        onClick={() => { onOpen(); onClose() }}
      >
        실험 노트 열기
      </button>

      {experiment.status !== 'completed' && (
        <button
          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
          onClick={() => { onComplete(); onClose() }}
        >
          완료로 전환
        </button>
      )}

      <button
        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        onClick={() => { onChangeOutcome(); onClose() }}
      >
        결과(Outcome) 변경
      </button>
    </div>
  )
}
