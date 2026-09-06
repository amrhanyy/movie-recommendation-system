'use client'

import React, { Suspense } from 'react'

interface PageWrapperProps {
    children: React.ReactNode;
}

const PageWrapper: React.FC<PageWrapperProps> = ({ children }) => {
    return (
        // A6: avoid a nested <main> landmark. The root layout provides the
        // single <main>; this is a labelled region instead.
        <div role="region" aria-label="Page content" className="min-h-screen px-4 py-8 md:px-8">
            <div className="">
                <Suspense fallback={
                    <div className="flex items-center justify-center h-screen">
                        <div className="animate-spin rounded-full h-12 w-12 border-t-4 border-b-4 border-cyan-500"></div>
                    </div>
                }>
                    {children}
                </Suspense>
            </div>
        </div>
    );
}

export default PageWrapper;