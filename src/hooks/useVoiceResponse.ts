import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseVoiceResponseReturn {
  isSupported: boolean;
  isVoiceResponseEnabled: boolean;
  isSpeaking: boolean;
  currentMessageId: string | null;
  error: string | null;
  toggleVoiceResponse: () => void;
  setVoiceResponseEnabled: (enabled: boolean) => void;
  speak: (text: string, messageId?: string) => void;
  stopSpeaking: () => void;
  clearError: () => void;
}

/**
 * Sanitizes markdown, emojis, system notices, and raw URLs to produce
 * smooth, pleasant, natural-sounding conversational speech.
 */
export function cleanTextForSpeech(text: string): string {
  if (!text) return '';

  let cleaned = text
    // Remove markdown links [text](url) -> text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove raw URLs
    .replace(/https?:\/\/\S+/g, '')
    // Remove markdown headings, bold, italic, backticks, strikethrough
    .replace(/[#*_`~]/g, '')
    // Replace bullet points with brief pauses
    .replace(/^\s*[•\-\*]\s+/gm, '')
    // Remove emojis so they are not read as unicode descriptions
    .replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
      ''
    )
    // Format common appointment phrases for natural cadence
    .replace(/(\d{1,2}):00\s*(AM|PM)/gi, '$1 $2')
    .replace(/\bDr\.\s*/g, 'Doctor ')
    .replace(/\bvs\.\s*/g, 'versus ')
    .replace(/\bapprox\.\s*/g, 'approximately ')
    // Remove technical system identifiers, database keys, or raw code IDs
    .replace(/\b(Firestore|database|firestore\.rules)\b/gi, 'our clinic system')
    .replace(/\bID:\s*[\w-]+/gi, '')
    .replace(/\bRef:\s*[\w-]+/gi, '')
    .replace(/\b[a-zA-Z0-9_-]{20,}\b/g, '') // Long hash/database IDs
    .replace(/demo_appointment_\w+/gi, '')
    .replace(/\b(security rules|collection|querySnapshot|rules_version|admin token|auth token|bearer token|apiKey|clientSecret)\b/gi, '')
    .replace(/\b(TypeError|ReferenceError|SyntaxError|Uncaught|stack trace|HTTP\s*\d{3})\b/gi, '')
    // Remove system footnotes or branding suffixes if present in text
    .replace(/AIWebTeck Concept Demo.*$/gi, '')
    .replace(/Not an official clinic application.*$/gi, '')
    .replace(/For clinical inquiries, call.*$/gi, '')
    // Normalize newlines to sentence pauses
    .replace(/\n+/g, '. ')
    .replace(/\s+/g, ' ')
    .trim();

  // If text is very long (e.g. multi-service directory), limit to first 3 sentences or ~350 characters
  // so listening is pleasant and not overwhelming
  if (cleaned.length > 400) {
    const sentences = cleaned.split(/(?<=[.?!])\s+/);
    if (sentences.length > 3) {
      cleaned = sentences.slice(0, 3).join(' ') + ' I have also displayed the full details on your screen.';
    }
  }

  return cleaned;
}

export function useVoiceResponse(): UseVoiceResponseReturn {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isVoiceResponseEnabled, setIsVoiceResponseEnabledState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem('ai_receptionist_voice_response') === 'true';
      } catch {
        return false;
      }
    }
    return false;
  });
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [currentMessageId, setCurrentMessageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Check speech synthesis support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
        setIsSupported(false);
      }
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
    currentUtteranceRef.current = null;
    setIsSpeaking(false);
    setCurrentMessageId(null);
  }, []);

  const setVoiceResponseEnabled = useCallback(
    (enabled: boolean) => {
      setIsVoiceResponseEnabledState(enabled);
      try {
        localStorage.setItem('ai_receptionist_voice_response', enabled ? 'true' : 'false');
      } catch {
        // ignore
      }
      if (!enabled) {
        stopSpeaking();
      }
    },
    [stopSpeaking]
  );

  const toggleVoiceResponse = useCallback(() => {
    if (!isSupported) {
      setError('Voice playback is not supported in this browser. Text responses will continue normally.');
      return;
    }
    setVoiceResponseEnabled(!isVoiceResponseEnabled);
  }, [isSupported, isVoiceResponseEnabled, setVoiceResponseEnabled]);

  const speak = useCallback(
    (rawText: string, messageId?: string) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setIsSupported(false);
        setError('Voice playback is not supported on this device.');
        return;
      }

      const textToSpeak = cleanTextForSpeech(rawText);
      if (!textToSpeak) return;

      try {
        // Cancel any currently active speech first
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(textToSpeak);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        // Choose a preferred natural sounding English voice if available
        const voices = window.speechSynthesis.getVoices?.() || [];
        const preferredVoice = voices.find(
          (v) =>
            v.lang.startsWith('en') &&
            (v.name.includes('Natural') ||
              v.name.includes('Samantha') ||
              v.name.includes('Google') ||
              v.name.includes('Karen') ||
              v.name.includes('Zira') ||
              v.name.includes('en-US'))
        );
        if (preferredVoice) {
          utterance.voice = preferredVoice;
        }

        utterance.onstart = () => {
          setIsSpeaking(true);
          setCurrentMessageId(messageId || 'latest');
          setError(null);
        };

        utterance.onend = () => {
          setIsSpeaking(false);
          setCurrentMessageId(null);
          currentUtteranceRef.current = null;
        };

        utterance.onerror = (e) => {
          // If error was triggered by user stopping/canceling speech, do not show as error
          if (e.error !== 'canceled' && e.error !== 'interrupted') {
            console.warn('[useVoiceResponse] Speech synthesis error:', e.error);
            setError('Unable to play voice response. Normal text display is active.');
          }
          setIsSpeaking(false);
          setCurrentMessageId(null);
          currentUtteranceRef.current = null;
        };

        currentUtteranceRef.current = utterance;
        window.speechSynthesis.speak(utterance);
      } catch (err: any) {
        console.error('[useVoiceResponse] Failed to speak utterance:', err);
        setIsSpeaking(false);
        setCurrentMessageId(null);
        setError('Voice output encountered an issue. Text responses remain fully active.');
      }
    },
    []
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Cleanup speech on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isVoiceResponseEnabled,
    isSpeaking,
    currentMessageId,
    error,
    toggleVoiceResponse,
    setVoiceResponseEnabled,
    speak,
    stopSpeaking,
    clearError,
  };
}
