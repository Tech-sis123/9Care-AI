import React, { useState } from 'react';

const PLACEHOLDER = '2348034027044';

const digitsOf = (value) => String(value || '').replace(/\D/g, '');

/**
 * Floating WhatsApp button with interactive speech bubble on top.
 * Number comes from the API (dashboard) or VITE_SUPPORT_WHATSAPP. Live clinic number: +234 803 402 7044.
 */
export default function WhatsAppContact({ number, customMessage, bubbleText, initialBubble = true, side = 'left' }) {
  const [showBubble, setShowBubble] = useState(initialBubble);

  const digits =
    digitsOf(number) ||
    digitsOf(import.meta.env.VITE_SUPPORT_WHATSAPP) ||
    PLACEHOLDER;

  const defaultMessage = customMessage || 'Hello Doctor, I need help with 9Care.';
  const href = `https://wa.me/${digits}?text=${encodeURIComponent(defaultMessage)}`;

  return (
    <div className={`fixed bottom-24 z-50 flex flex-col select-none ${side === 'right' ? 'right-5 items-end' : 'left-5 items-start'}`}>
      {/* Speech Bubble on top of the WhatsApp Icon */}
      {showBubble && (
        <div className="relative mb-2.5 max-w-[210px] animate-fade-in">
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-start gap-2.5 bg-white text-stone-800 px-3.5 py-2.5 rounded-2xl shadow-xl border border-stone-200/90 hover:bg-stone-50 transition-all block group"
            style={{ filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.15))' }}
          >
            {/* Pulsing Online Green Dot */}
            <div className="relative flex h-2.5 w-2.5 shrink-0 mt-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </div>

            <div className="text-left pr-2">
              <p className="text-[11.5px] font-bold text-stone-900 leading-tight">
                {bubbleText || 'Need help? Chat with a Doctor 👋'}
              </p>
              <p className="text-[10px] text-stone-500 leading-tight mt-0.5">
                Online · Ask our doctor anything
              </p>
            </div>
          </a>

          {/* Dismiss button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setShowBubble(false);
            }}
            aria-label="Dismiss chat bubble"
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-500 hover:text-stone-800 text-[10px] font-bold flex items-center justify-center border border-stone-300 shadow-xs cursor-pointer transition-colors"
          >
            ×
          </button>

          {/* Speech bubble pointer / tail pointing straight down to the green circle */}
          <div className="absolute left-6 -bottom-1.5 w-3 h-3 bg-white border-r border-b border-stone-200/90 transform rotate-45 pointer-events-none" />
        </div>
      )}

      {/* Main Floating WhatsApp Button */}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with 9Care on WhatsApp"
        className="relative w-14 h-14 rounded-full bg-[#25D366] shadow-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
      >
        {/* Notification badge / dot on the icon */}
        <span className="absolute -top-1 -right-1 flex h-4 w-4">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-[9px] font-bold items-center justify-center shadow-xs">
            1
          </span>
        </span>

        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden>
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
}
