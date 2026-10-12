import { Capacitor } from "@capacitor/core";
import { PushNotifications, Token, ActionPerformed } from "@capacitor/push-notifications";
import { LocalNotifications } from "@capacitor/local-notifications";
import { supabase } from "./supabase";

/**
 * Creates the notification channel used by server-sent pushes so that
 * Android plays our custom notification sound (res/raw/appnotification.mp3).
 * Must run before any notification arrives; safe to call repeatedly.
 */
async function ensureNotificationChannel(): Promise<void> {
  await LocalNotifications.createChannel({
    id: "reminders",
    name: "Reminders & alerts",
    description: "To-do reminders and important alerts",
    importance: 5,
    visibility: 1,
    sound: "appnotification.mp3",
    vibration: true,
  });
}

/**
 * Checks if the current app is running on a native mobile platform.
 */
function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Registers the device for push notifications and registers the token in Supabase.
 * @param userId The authenticated user's ID.
 */
export async function registerPushNotifications(userId: string): Promise<void> {
  if (!isNative()) {
    console.log("Push notifications skipped: Not running on a native mobile platform.");
    return;
  }

  try {
    console.log("Initializing push notifications registration for user:", userId);

    // 0. Create the custom-sound notification channel (Android 8+)
    await ensureNotificationChannel();

    // 1. Add Event Listeners
    await PushNotifications.addListener("registration", async (token: Token) => {
      console.log("FCM registration token received:", token.value);

      // Save token to Supabase push_tokens table
      const { error } = await supabase.from("push_tokens").upsert(
        {
          user_id: userId,
          token: token.value,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "token" }
      );

      if (error) {
        console.error("Failed to save push token to database:", error.message);
      } else {
        console.log("FCM registration token saved/updated successfully in Supabase.");
      }
    });

    await PushNotifications.addListener("registrationError", (error: any) => {
      console.error("FCM registration error:", error);
    });

    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("FCM push notification received (foreground):", notification);
    });

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        console.log("FCM push notification tapped:", action);
        const data = action.notification.data;
        const link = data?.link || data?.url;
        if (link) {
          console.log("FCM action link detected, triggering click navigation to:", link);
          // Dispatch custom event which our root routing listener catches to navigate
          window.dispatchEvent(
            new CustomEvent("mobile-notification-click", {
              detail: { link },
            })
          );
        }
      }
    );

    // 2. Request Permissions & Register
    let permStatus = await PushNotifications.checkPermissions();
    console.log("Initial push permissions status:", permStatus.receive);

    if (permStatus.receive !== "granted") {
      permStatus = await PushNotifications.requestPermissions();
      console.log("FCM permissions request result:", permStatus.receive);
    }

    // Always call register to obtain the device token for the database
    await PushNotifications.register();
    console.log("PushNotifications.register() called.");
  } catch (err) {
    console.error("Error setting up FCM push notifications:", err);
  }
}
