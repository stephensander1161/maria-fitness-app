import { Shimmer } from "@/components/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <div className="mb-6 flex items-baseline justify-between">
        <Shimmer className="h-8 w-40" />
        <Shimmer className="h-4 w-24" />
      </div>
      {/* Shaped like a conversation, so the coach screen doesn't reflow when
          the real transcript arrives. */}
      <Shimmer className="h-16 w-[85%]" />
      <div className="flex justify-end"><Shimmer className="h-10 w-1/2" /></div>
      <Shimmer className="h-20 w-[90%]" />
    </div>
  );
}
