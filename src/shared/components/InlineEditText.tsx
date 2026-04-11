import { useState, useRef, useEffect } from 'react';

interface Props {
  value: string;
  onCommit: (newValue: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
}

export default function InlineEditText({
  value,
  onCommit,
  className = '',
  inputClassName = '',
  placeholder,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditValue(value);
      // 다음 프레임에서 포커스 + 전체 선택
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, value]);

  const commit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== value) {
      onCommit(trimmed);
    }
    setEditing(false);
  };

  const cancel = () => {
    setEditValue(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') cancel();
          e.stopPropagation();
        }}
        onBlur={commit}
        onClick={(e) => e.stopPropagation()}
        placeholder={placeholder}
        className={`bg-white dark:bg-gray-700 border border-blue-400 rounded px-1 outline-none ${inputClassName}`}
      />
    );
  }

  return (
    <span
      onDoubleClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className={`cursor-text hover:underline hover:decoration-dotted hover:decoration-gray-400 ${className}`}
      title="더블클릭하여 수정"
    >
      {value || placeholder}
    </span>
  );
}
