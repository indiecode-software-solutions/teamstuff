import { Capacitor } from "@capacitor/core";
import { Geolocation } from "@capacitor/geolocation";

export async function getCurrentCoordinates(): Promise<{ latitude: number; longitude: number }> {
  if (Capacitor.isNativePlatform()) {
    try {
      const permission = await Geolocation.checkPermissions();
      if (permission.location !== "granted" && permission.coarseLocation !== "granted") {
        const request = await Geolocation.requestPermissions();
        if (request.location !== "granted" && request.coarseLocation !== "granted") {
          throw new Error("Location permission denied natively");
        }
      }
      
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: true,
        timeout: 10000,
      });
      
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      };
    } catch (e: any) {
      console.error("Native geolocation error:", e);
      throw new Error(e?.message || "Failed to retrieve coordinates from native device");
    }
  } else {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error("Geolocation is not supported by your browser"));
        return;
      }
      
      // Request a fresh, un-cached GPS fix with maximum accuracy
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        (err) => {
          // Fallback: try continuous watchPosition for 1 immediate update if initial fix failed
          console.warn("getCurrentPosition slow/failed, attempting watchPosition fix...", err);
          let watchId: number;
          const timeoutTimer = setTimeout(() => {
            if (watchId) navigator.geolocation.clearWatch(watchId);
            reject(err);
          }, 8000);

          watchId = navigator.geolocation.watchPosition(
            (pos) => {
              clearTimeout(timeoutTimer);
              navigator.geolocation.clearWatch(watchId);
              resolve({
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
              });
            },
            (watchErr) => {
              clearTimeout(timeoutTimer);
              navigator.geolocation.clearWatch(watchId);
              reject(watchErr);
            },
            {
              enableHighAccuracy: true,
              timeout: 8000,
              maximumAge: 0,
            }
          );
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0, // Never use stale cached coordinates
        }
      );
    });
  }
}
