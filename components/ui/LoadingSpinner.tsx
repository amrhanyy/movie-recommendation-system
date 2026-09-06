import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  /** Diameter shortcut sizes */
  size?: "sm" | "md" | "lg"
  /** Additional Tailwind / custom classes */
  className?: string
  /** Optional helper text shown under the spinner */
  message?: string
  /** If true, wrapper stretches to full viewport height */
  fullHeight?: boolean
}

const sizeClasses = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8"
} as const

export function LoadingSpinner({
  size = "md",
  className,
  message,
  fullHeight = false
}: LoadingSpinnerProps) {
  const containerHeightClass = fullHeight ? "min-h-screen" : "h-64"

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-cyan-500", // sets spinner color
        containerHeightClass,
        className
      )}
    >
      <div
        className={cn(
          "border-2 border-current border-t-transparent rounded-full animate-spin",
          sizeClasses[size]
        )}
      />
      {message && (
        <p className="text-gray-400 mt-4 text-sm font-medium tracking-wide">
          {message}
        </p>
      )}
    </div>
  )
}
