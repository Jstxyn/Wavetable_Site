import { useState, useCallback, useRef, useEffect } from 'react';

interface SliderOptions {
    onChange: (value: number) => void;
    debounceTime?: number;
    disabled?: boolean;
}

export function useSliderInteraction({ onChange, debounceTime = 16, disabled = false }: SliderOptions) {
    const [isDragging, setIsDragging] = useState(false);
    const timeoutRef = useRef<number | null>(null);
    const valueRef = useRef<number | null>(null);

    const clearPendingTimeout = useCallback(() => {
        if (timeoutRef.current !== null) {
            window.clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
        }
    }, []);

    const handleChange = useCallback((value: number) => {
        if (disabled) return;
        
        // Store the latest value
        valueRef.current = value;

        // Clear any pending timeouts
        clearPendingTimeout();

        // If dragging, debounce the update
        if (isDragging) {
            timeoutRef.current = window.setTimeout(() => {
                if (valueRef.current !== null) {
                    onChange(valueRef.current);
                }
            }, debounceTime);
        } else {
            // If not dragging, update immediately
            onChange(value);
        }
    }, [onChange, isDragging, debounceTime, disabled, clearPendingTimeout]);

    const handleDragStart = useCallback(() => {
        if (!disabled) {
            setIsDragging(true);
        }
    }, [disabled]);

    const handleDragEnd = useCallback(() => {
        if (!disabled) {
            setIsDragging(false);
            // Ensure the final value is applied
            if (valueRef.current !== null) {
                clearPendingTimeout();
                onChange(valueRef.current);
            }
        }
    }, [disabled, onChange, clearPendingTimeout]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            clearPendingTimeout();
        };
    }, [clearPendingTimeout]);

    return {
        handleChange,
        handleDragStart,
        handleDragEnd,
        isDragging
    };
}
