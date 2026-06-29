import type { ReactNode } from 'react'
import { CommonLayoutHydrationBoundary } from '@/app/(commonLayout)/hydration-boundary'

const EmbedLayout = async ({ children }: { children: ReactNode }) => {
  return (
    <CommonLayoutHydrationBoundary>
      <div className="h-full min-h-0 bg-background-default">
        {children}
      </div>
    </CommonLayoutHydrationBoundary>
  )
}

export default EmbedLayout
