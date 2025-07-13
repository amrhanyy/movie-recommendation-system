export function Section({ 
  children, 
  title 
}: { 
  children: React.ReactNode
  title?: string 
}) {
  return (
    <div >
      {title && (
        <div className="flex items-center gap-3 mb-6">
          <div className="w-1 h-8 bg-cyan-500 rounded-full glow-cyan animate-pulse" />
          <h2 className="text-2xl font-bold text-white tracking-wider">{title.toUpperCase()}</h2>
        </div>
      )}
      {children}
    </div>
  )
}
