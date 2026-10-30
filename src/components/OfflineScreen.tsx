import React from "react";

interface OfflineScreenProps {
  onRetry: () => void;
  message?: string;
}

export function OfflineScreen({ onRetry, message }: OfflineScreenProps) {
  return (
    <div >
      <img
        src="/no_internet.gif"
        alt="No Internet"
        
      />
      <h2 >
        No Internet Connection
      </h2>
      <p >
        {message || "You are currently offline. CapOasis requires an active internet connection to load and sync data."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        
      >
        Retry Connection
      </button>
    </div>
  );
}
