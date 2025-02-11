/**
 * File: useSliderInteraction.ts
 * Purpose: Custom hook for handling slider interactions with debouncing
 * Date: 2025-02-11
 */

import { useCallback, useRef } from 'react';
import debounce from 'lodash/debounce';

interface UseSliderInteractionProps {
  onChange: (value: number) => void;
  debounceTime?: number;
  disabled?: boolean;
}

export const useSliderInteraction = ({
  onChange,
  debounceTime = 100,
  disabled = false
}: UseSliderInteractionProps) => {
  const isDragging = useRef(false);
  const abortController = useRef<AbortController | null>(null);

  // Create a debounced change handler
  const debouncedChange = useCallback(
    debounce((value: number) => {
      if (disabled || !isDragging.current) return;

      // Cancel any pending requests
      if (abortController.current) {
        abortController.current.abort();
      }

      // Create new abort controller for this request
      abortController.current = new AbortController();

      // Call onChange with the new value
      try {
        onChange(value);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          console.error('Error in slider interaction:', error);
        }
      }
    }, debounceTime),
    [onChange, disabled, debounceTime]
  );

  const handleChange = useCallback((value: number) => {
    if (!disabled) {
      debouncedChange(value);
    }
  }, [disabled, debouncedChange]);

  const handleDragStart = useCallback(() => {
    isDragging.current = true;
  }, []);

  const handleDragEnd = useCallback(() => {
    isDragging.current = false;
    
    // Clean up any pending requests
    if (abortController.current) {
      abortController.current.abort();
      abortController.current = null;
    }
    
    // Cancel any pending debounced calls
    debouncedChange.cancel();
  }, [debouncedChange]);

  return {
    handleChange,
    handleDragStart,
    handleDragEnd
  };
};

export default useSliderInteraction;
