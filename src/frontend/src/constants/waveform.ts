/**
 * File: waveform.ts
 * Purpose: Shared constants for waveform visualization
 * Date: 2025-02-12
 */

// Visual scale factor for both 2D and 3D views
export const VISUAL_SCALE = 0.38;

// Number of frames to generate for 3D view
export const DEFAULT_FRAME_COUNT = 32;

// Default frame size (number of samples per frame)
export const DEFAULT_FRAME_SIZE = 2048;

// Line density reduction factor (higher = fewer lines)
export const LINE_DENSITY_FACTOR = 128; // Much higher for that perfect thin spacing

// Maximum number of lines to display in 3D view
export const MAX_LINES_3D = 32; // Reduced significantly for elegant look

// Minimum distance between points for adaptive sampling
export const MIN_POINT_DISTANCE = 0.05; // Increased for cleaner lines

// Line opacity for 3D view (0-1)
export const LINE_OPACITY = 1.0; // Full opacity for sharp lines

// Line width for both views
export const LINE_WIDTH = 1; // Keep it thin

// Waveform color in hex
export const WAVEFORM_COLOR = '#ff4444';
