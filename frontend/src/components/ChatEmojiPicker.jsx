import React, { useEffect, useRef } from 'react';
import { Smile } from 'lucide-react';

const EMOJI_GROUPS = [
  {
    title: 'Настроение',
    emojis: ['😀', '😄', '😉', '🥳', '😎', '🤔', '😴', '🤯', '🥲', '😇'],
  },
  {
    title: 'Жесты',
    emojis: ['👍', '👏', '🙏', '🤝', '✌️', '🤞', '💪', '👋', '🫶', '🔥'],
  },
  {
    title: 'SyrekAI',
    emojis: ['🦊', '🧠', '🚀', '🪐', '🔮', '🦉', '🧩', '✨', '🛸', '🧪', '🔭', '🎸', '🌊', '🪄', '🧬', '🎯', '🍜', '🎲', '🦋', '📡', '🏔️', '🎭', '💡', '🌀'],
  },
  {
    title: 'Символы',
    emojis: ['❤️', '💜', '💙', '⭐', '✅', '❗', '💯', '🎉', '📌', '⚡'],
  },
];

export default function ChatEmojiPicker({ open, onToggle, onSelect, disabled }) {
  const panelRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handleClickOutside = (event) => {
      if (panelRef.current && !panelRef.current.contains(event.target)) {
        onToggle(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onToggle]);

  return (
    <div className="chat-emoji-picker" ref={panelRef}>
      <button
        type="button"
        className={`chat-emoji-btn${open ? ' is-active' : ''}`}
        onClick={() => onToggle(!open)}
        title="Эмодзи"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Smile size={20} />
      </button>

      {open && (
        <div className="chat-emoji-panel" role="dialog" aria-label="Выбор эмодзи">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.title} className="chat-emoji-group">
              <div className="chat-emoji-group-title">{group.title}</div>
              <div className="chat-emoji-grid">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    className="chat-emoji-option"
                    onClick={() => {
                      onSelect(emoji);
                      onToggle(false);
                    }}
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
