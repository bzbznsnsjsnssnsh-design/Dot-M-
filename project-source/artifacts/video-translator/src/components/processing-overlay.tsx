import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AudioLines, Sparkles, Languages, Mic } from 'lucide-react';

interface ProcessingOverlayProps {
  isVisible: boolean;
  progressText?: string;
}

export function ProcessingOverlay({ isVisible, progressText = "جاري التجهيز..." }: ProcessingOverlayProps) {
  const getIcon = () => {
    if (progressText.includes('صوت') || progressText.includes('⬇️')) return <AudioLines className="w-10 h-10 text-indigo-400" />;
    if (progressText.includes('ترجمة') || progressText.includes('🌍')) return <Languages className="w-10 h-10 text-violet-400" />;
    if (progressText.includes('توليد') || progressText.includes('🔊')) return <Sparkles className="w-10 h-10 text-emerald-400" />;
    if (progressText.includes('نص') || progressText.includes('🎙️')) return <Mic className="w-10 h-10 text-blue-400" />;
    return <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />;
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 z-50 flex flex-col items-center justify-center rounded-xl bg-slate-950/90 backdrop-blur-sm"
        >
          <div className="relative mb-4">
            <div className="absolute inset-0 rounded-full bg-indigo-500/20 blur-xl" />
            {getIcon()}
          </div>
          <h3 className="text-white font-semibold text-lg mb-1">جاري المعالجة...</h3>
          <p className="text-slate-400 text-sm text-center max-w-xs">{progressText}</p>
          <p className="text-slate-600 text-xs mt-3 text-center max-w-xs">
            يرجى الانتظار، المقطع يُعالج في الخلفية
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
