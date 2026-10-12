import { registerPlugin, Capacitor } from "@capacitor/core";

// Register custom NativeVibration plugin
const NativeVibration = registerPlugin<any>("NativeVibration");

const isNative = () => Capacitor.isNativePlatform();

const vibrate = async (duration: number) => {
  if (!isNative()) return;
  try {
    await NativeVibration.vibrate({ duration });
  } catch (e) {
    console.warn("[Haptics] custom vibrate failed", e);
  }
};

/**
 * Triggers light haptic feedback.
 */
export const triggerHapticLight = () => vibrate(80);

/**
 * Triggers medium haptic feedback.
 */
export const triggerHapticMedium = () => vibrate(150);

/**
 * Triggers heavy haptic feedback.
 */
export const triggerHapticHeavy = () => vibrate(300);

/**
 * Triggers selection change haptic feedback (very short tick).
 */
export const triggerHapticSelection = () => vibrate(40);

/**
 * Triggers success haptic feedback (double short pulse).
 */
export const triggerHapticSuccess = async () => {
  await vibrate(120);
};

/**
 * Triggers error haptic feedback (longer buzz).
 */
export const triggerHapticError = () => vibrate(250);
