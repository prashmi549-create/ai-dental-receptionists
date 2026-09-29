import { useState, useRef, useEffect, useCallback } from 'react';

export interface UseVoiceInputOptions {
  onTranscriptChange?: (text: string, isFinal: boolean) => void;
  onListeningEnd?: (finalText: string) => void;
  lang?: string;
}

export interface UseVoiceInputReturn {
  isSupported: boolean;
  isListening: boolean;
  transcript: string;
  interimTranscript: string;
  error: string | null;
  permissionDenied: boolean;
  startListening: () => void;
  stopListening: () => void;
  clearError: () => void;
  resetTranscript: () => void;
  simulateVoiceText: (text: string) => void;
  simulatePermissionDenied: () => void;
  simulateRecognitionFailure: (msg?: string) => void;
}

export function useVoiceInput({
  onTranscriptChange,
  onListeningEnd,
  lang = 'en-US',
}: UseVoiceInputOptions = {}): UseVoiceInputReturn {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState<boolean>(false);

  const recognitionRef = useRef<any>(null);
  const accumulatedRef = useRef<string>('');
  const isManuallyStoppedRef = useRef<boolean>(false);

  // Check support on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition ||
        (window as any).webkitSpeechRecognition ||
        (window as any).mozSpeechRecognition ||
        (window as any).msSpeechRecognition;

      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    isManuallyStoppedRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Recognition might already be stopped
      }
    }
    setIsListening(false);
    setInterimTranscript('');

    const finalRecognized = accumulatedRef.current.trim();
    if (finalRecognized && onListeningEnd) {
      onListeningEnd(finalRecognized);
    }
  }, [onListeningEnd]);

  const startListening = useCallback(() => {
    setError(null);
    setPermissionDenied(false);
    accumulatedRef.current = '';
    setTranscript('');
    setInterimTranscript('');
    isManuallyStoppedRef.current = false;

    if (typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition ||
      (window as any).mozSpeechRecognition ||
      (window as any).msSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      setError(
        "Voice input isn't available on this device or browser. You can continue by typing."
      );
      return;
    }

    try {
      // Abort any existing instance
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
        setError(null);
      };

      recognition.onresult = (event: any) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const result = event.results[i];
          const text = result[0].transcript;
          if (result.isFinal) {
            final += text;
          } else {
            interim += text;
          }
        }

        if (final) {
          accumulatedRef.current = accumulatedRef.current
            ? `${accumulatedRef.current} ${final}`.trim()
            : final.trim();
          setTranscript(accumulatedRef.current);
          onTranscriptChange?.(accumulatedRef.current, true);
        }

        setInterimTranscript(interim);
        if (interim) {
          const combined = accumulatedRef.current
            ? `${accumulatedRef.current} ${interim}`.trim()
            : interim.trim();
          onTranscriptChange?.(combined, false);
        }
      };

      recognition.onerror = (event: any) => {
        const errType = event?.error || 'unknown';
        console.warn('[useVoiceInput] Speech recognition error event:', errType);

        if (errType === 'not-allowed' || errType === 'service-not-allowed') {
          setPermissionDenied(true);
          setError(
            'Microphone access is unavailable. You can continue by typing your message instead.'
          );
        } else if (errType === 'no-speech') {
          // If no speech was detected after starting, notify gently
          if (!accumulatedRef.current) {
            setError("I didn't quite catch that. Could you please repeat it, or type your message?");
          }
        } else if (errType === 'audio-capture') {
          setError('Microphone access is unavailable. You can continue by typing your message instead.');
        } else if (errType === 'network') {
          setError('Network issue with speech recognition. You can continue by typing.');
        } else if (errType !== 'aborted') {
          setError('Speech recognition encountered an issue. You can try again or continue by typing.');
        }

        setIsListening(false);
        setInterimTranscript('');
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript('');

        const finalResult = accumulatedRef.current.trim();
        if (finalResult && !isManuallyStoppedRef.current && onListeningEnd) {
          onListeningEnd(finalResult);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('[useVoiceInput] Failed to start speech recognition:', err);
      setIsListening(false);
      if (err?.name === 'NotAllowedError' || err?.message?.includes('denied')) {
        setPermissionDenied(true);
        setError('Microphone access is unavailable. You can continue by typing your message instead.');
      } else {
        setError('Voice input encountered an issue. You can continue by typing.');
      }
    }
  }, [lang, onTranscriptChange, onListeningEnd]);

  const clearError = useCallback(() => {
    setError(null);
    setPermissionDenied(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
    accumulatedRef.current = '';
  }, []);

  const simulateVoiceText = useCallback(
    (text: string) => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
      setIsListening(false);
      setInterimTranscript('');
      setError(null);
      setPermissionDenied(false);
      accumulatedRef.current = text.trim();
      setTranscript(text.trim());
      onTranscriptChange?.(text.trim(), true);
      onListeningEnd?.(text.trim());
    },
    [onTranscriptChange, onListeningEnd]
  );

  const simulatePermissionDenied = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setInterimTranscript('');
    setPermissionDenied(true);
    setError(
      'Microphone access is unavailable. You can continue by typing your message instead.'
    );
  }, []);

  const simulateRecognitionFailure = useCallback((msg?: string) => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
    setInterimTranscript('');
    setPermissionDenied(false);
    setError(
      msg || 'Speech recognition encountered an issue. Please try speaking again or type your message.'
    );
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    error,
    permissionDenied,
    startListening,
    stopListening,
    clearError,
    resetTranscript,
    simulateVoiceText,
    simulatePermissionDenied,
    simulateRecognitionFailure,
  };
}
