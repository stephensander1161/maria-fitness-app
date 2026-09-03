"use client";

import { useState } from "react";
import { MealPicker } from "./meal-picker";

/** Put something new in a slot on a day, chosen by looking at it. */
export function AddMeal({ dayOfWeek }: { dayOfWeek: number }) {
  const [slot, setSlot] = useState<string | null>(null);

  if (slot) {
    return (
      <MealPicker
        slot={slot}
        dayOfWeek={dayOfWeek}
        replacing={null}
        nearCalories={null}
        onClose={() => setSlot(null)}
      />
    );
  }

  return (
    <div className="mt-3">
      <p className="mb-2 text-[11px] uppercase tracking-wide text-faint">Add a meal</p>
      <div className="flex flex-wrap gap-2">
        {(["breakfast", "lunch", "dinner", "snack"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setSlot(s)}
            className="rounded-full border border-dashed border-line px-3.5 py-2 text-[13px] capitalize text-muted transition-colors hover:bg-raised"
          >
            + {s}
          </button>
        ))}
      </div>
    </div>
  );
}
