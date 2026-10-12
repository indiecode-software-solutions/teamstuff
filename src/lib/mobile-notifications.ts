import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";

/**
 * Checks if the current app is running on a native mobile platform.
 */
export function isMobileApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Initializes local notifications, requests permissions if on mobile,
 * and sets up action/click listeners.
 */
export async function initializeMobileNotifications(): Promise<void> {
  if (!isMobileApp()) {
    return;
  }

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== "granted") {
      const requestResult = await LocalNotifications.requestPermissions();
      console.log("Mobile notifications permission request:", requestResult.display);
    }

    if (Capacitor.getPlatform() === "android") {
      await LocalNotifications.createChannel({
        id: "default",
        name: "Default Channel",
        description: "Default channel for task notifications",
        importance: 5, // High importance (shows banner/sound)
        visibility: 1, // Public visibility
        vibration: true,
      });
      console.log("Android notification channel created.");
    }

    // Set up click/tap event listener on notifications
    await LocalNotifications.addListener("localNotificationActionPerformed", (action) => {
      console.log("Mobile notification action performed:", action);
      const link = action.notification.extra?.link;
      if (link) {
        // Dispatch custom event so the UI layer/router can handle navigation
        window.dispatchEvent(
          new CustomEvent("mobile-notification-click", {
            detail: { link },
          })
        );
      }
    });

    console.log("Mobile notifications system initialized successfully.");
  } catch (err) {
    console.error("Error initializing mobile notifications:", err);
  }
}

/**
 * Triggers a native local notification (mobile only).
 */
export async function triggerLocalNotification(
  title: string,
  body: string,
  link?: string
): Promise<void> {
  if (!isMobileApp()) {
    return;
  }

  try {
    const permStatus = await LocalNotifications.checkPermissions();
    if (permStatus.display !== "granted") {
      console.warn("Cannot trigger notification: Permission not granted.");
      return;
    }

    const notificationId = Math.floor(Math.random() * 1000000);
    await LocalNotifications.schedule({
      notifications: [
        {
          title,
          body,
          id: notificationId,
          schedule: { at: new Date(Date.now() + 1000) }, // Schedule 1 second from now
          extra: { link: link || null },
          channelId: "default",
          sound: undefined,
          actionTypeId: "",
          attachments: [],
        },
      ],
    });
    console.log(`Scheduled mobile local notification: ID=${notificationId}, title="${title}"`);
  } catch (err) {
    console.error("Failed to trigger local notification:", err);
  }
}
