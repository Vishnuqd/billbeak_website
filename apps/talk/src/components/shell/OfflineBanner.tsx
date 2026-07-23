import { WifiOff } from "@/icons/index.tsx";

/** Non-blocking notice that the connection dropped. Progress is safe locally. */
export function OfflineBanner() {
  return (
    <div className="bb-offline" role="status">
      <WifiOff width={16} height={16} />
      You&rsquo;re offline. Your progress is saved on this device.
    </div>
  );
}
