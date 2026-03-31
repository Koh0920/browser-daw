"use client"

import * as React from "react"
import * as SliderPrimitive from "@radix-ui/react-slider"

import { cn } from "@/lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, orientation = "horizontal", ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    orientation={orientation}
    className={cn(
      "relative flex touch-none select-none data-[disabled]:opacity-50",
      orientation === "vertical"
        ? "h-full min-h-24 w-4 items-center justify-center"
        : "w-full items-center",
      className
    )}
    {...props}
  >
    <SliderPrimitive.Track
      className={cn(
        "relative overflow-hidden rounded-full border border-white/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.28))] shadow-[inset_0_1px_4px_rgba(0,0,0,0.45)]",
        orientation === "vertical" ? "h-full w-2.5" : "h-2.5 w-full grow"
      )}
    >
      <SliderPrimitive.Range
        className={cn(
          "absolute rounded-full bg-[linear-gradient(180deg,hsl(var(--daw-accent)),hsl(var(--daw-accent-soft)))]",
          orientation === "vertical" ? "bottom-0 w-full" : "h-full"
        )}
      />
    </SliderPrimitive.Track>
    <SliderPrimitive.Thumb className="block h-[18px] w-[18px] rounded-full border border-white/25 bg-[linear-gradient(180deg,rgba(250,250,250,0.96),rgba(196,203,214,0.86))] shadow-[0_3px_10px_rgba(0,0,0,0.42)] ring-offset-background transition-[transform,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/80 focus-visible:ring-offset-2 active:scale-95 disabled:pointer-events-none" />
  </SliderPrimitive.Root>
))
Slider.displayName = SliderPrimitive.Root.displayName

export { Slider }
