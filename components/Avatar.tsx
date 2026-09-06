import React from 'react'
import Image from 'next/image'

interface AvatarProps {
  src: string | null
  alt: string
  size?: number
}

export default function Avatar({ src, alt, size = 48 }: AvatarProps) {
  return (
    <div 
      className="relative rounded-full overflow-hidden"
      style={{ width: size, height: size }}
    >
      <Image
        src={src || '/images/placeholder-avatar.png'}
        alt={alt}
        fill
        className="object-cover"
        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
          e.currentTarget.src = '/images/placeholder-avatar.png'
        }}
      />
    </div>
  )
}
