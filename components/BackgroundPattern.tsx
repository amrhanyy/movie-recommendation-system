import React from "react"
export function BackgroundPattern() {
  return (
    <div className="fixed inset-0 -z-10">
      <div 
        className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] 
                   bg-[size:24px_24px]"
      />
      <div className="absolute inset-0 bg-gradient-to-tr from-gray-900 via-gray-900/95 to-gray-800/90" />
    </div>
  );
}
