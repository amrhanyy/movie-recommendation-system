import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card"
import { Slider } from "../components/ui/slider"

export function TimeFilter() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Available Viewing Time</CardTitle>
      </CardHeader>
      <CardContent>
        <Slider defaultValue={[90]} max={180} step={15} />
        <div className="mt-2 text-center">90 minutes</div>
      </CardContent>
    </Card>
  )
}

